import "./style.css";
import { CanvasRenderer, type RendererDrawTiming } from "./render/canvas-renderer";
import { RollingPerformanceMetric } from "./profiling";
import { assertReplayScenarioV1, assertRulesetV1 } from "./replay/import-game-json";
import { assertRecordingByteLength } from "./replay/limits";
import { buildLocalReplayExpectedScenario } from "./replay/local-recording";
import { summarizeProvenance } from "./replay/provenance";
import { renderDiagnostics } from "./ui/diagnostics";
import { renderLocalRecordingReport } from "./ui/local-recording";
import {
  DEFAULT_REPLAY_DATAVIEW_STATE,
  renderReplayDataview,
  type ReplayDataviewState
} from "./ui/replay-dataview";
import { formatSimTime, setTimeline } from "./ui/timeline";
import type { ClientToWorker, WorkerToClient } from "./protocol";
import type {
  LocalReplayCompatibilityReport,
  LocalReplayParserRequest,
  LocalReplayParserResponse
} from "./replay/local-recording";
import type {
  PlaybackRenderFrame,
  ReplayScenarioV1,
  RulesetV1,
  SimulationPerformanceDiagnostics,
  SimulationDiagnostics,
  WorldSnapshot
} from "./replay/model";

const canvas = must<HTMLCanvasElement>("#world");
const status = must<HTMLElement>("#status");
const scenarioSelect = must<HTMLSelectElement>("#scenario-select");
const recordingInput = must<HTMLInputElement>("#recording-file");
const recordingStatus = must<HTMLElement>("#recording-status");
const recordingReportRoot = must<HTMLElement>("#recording-report");
const replayDataviewLink = must<HTMLAnchorElement>("#replay-dataview-link");
const replayDataviewRoot = must<HTMLElement>("#replay-dataview");
const playPause = must<HTMLButtonElement>("#play-pause");
const step = must<HTMLButtonElement>("#step");
const sync = must<HTMLButtonElement>("#sync");
const playbackSpeed = must<HTMLSelectElement>("#playback-speed");
const seek = must<HTMLInputElement>("#seek");
const timeLabel = must<HTMLElement>("#time-label");
const durationLabel = must<HTMLElement>("#duration-label");
const diagnosticsRoot = must<HTMLElement>("#diagnostics");
const renderer = new CanvasRenderer(canvas);
const worker = new Worker(new URL("./worker/simulation-worker.ts", import.meta.url), {
  type: "module"
});
const replayParserWorker = new Worker(new URL("./worker/replay-parser-worker.ts", import.meta.url), {
  type: "module"
});
const replayScenarioUrl = "./fixtures/glade-120x120.scenario.json";
const scenarioOptions: Record<string, string> = {
  replay: replayScenarioUrl,
  synthetic: "./fixtures/scenario.json",
  combat: "./fixtures/combat.scenario.json"
};

interface RecordingSelectionToken {
  readonly generation: number;
  readonly requestId: string;
}

let requestOrdinal = 0;
let recordingSelectionGeneration = 0;
let currentSnapshot: WorldSnapshot | undefined;
let currentDiagnostics: SimulationDiagnostics | undefined;
let currentRenderFrame: PlaybackRenderFrame | undefined;
let referenceScenario: ReplayScenarioV1 | undefined;
let localRecordingReport: LocalReplayCompatibilityReport | undefined;
let replayDataviewState: ReplayDataviewState = DEFAULT_REPLAY_DATAVIEW_STATE;
let activeRecordingRequestId = "";
let replayDataviewStatus = "no local file selected";
let provenanceSummary: readonly string[] = [];
let lastVisualFrameWallMs: number | undefined;
const mainMergeTiming = new RollingPerformanceMetric();
const canvasDrawTiming = new RollingPerformanceMetric();
const visualFrameIntervalTiming = new RollingPerformanceMetric();

worker.onmessage = (event: MessageEvent<WorkerToClient>) => {
  handleWorkerMessage(event.data);
};

worker.onerror = (event) => {
  status.textContent = `Worker error: ${event.message}`;
};

replayParserWorker.onmessage = (event: MessageEvent<LocalReplayParserResponse>) => {
  handleReplayParserMessage(event.data);
};

replayParserWorker.onerror = (event) => {
  localRecordingReport = undefined;
  replayDataviewState = DEFAULT_REPLAY_DATAVIEW_STATE;
  recordingStatus.textContent = `Parser worker environment error: ${event.message}`;
  replayDataviewStatus = "parser worker error";
  renderLocalReplayUi("parser worker error");
};

playPause.addEventListener("click", () => {
  if (currentDiagnostics?.isPlaying) {
    post({
      type: "pause",
      requestId: nextRequestId()
    });
    return;
  }

  post({
    type: "play",
    requestId: nextRequestId(),
    speed: selectedPlaybackSpeed()
  });
});

playbackSpeed.addEventListener("change", () => {
  if (!currentDiagnostics?.isPlaying) {
    return;
  }

  post({
    type: "play",
    requestId: nextRequestId(),
    speed: selectedPlaybackSpeed()
  });
});

step.addEventListener("click", () => {
  post({
    type: "step",
    requestId: nextRequestId(),
    deltaMs: 250
  });
});

sync.addEventListener("click", () => {
  post({
    type: "snapshot",
    requestId: nextRequestId()
  });
});

scenarioSelect.addEventListener("change", () => {
  initialize().catch((error: unknown) => {
    status.textContent = error instanceof Error ? error.message : String(error);
  });
});

recordingInput.addEventListener("change", () => {
  const selection = beginRecordingSelection();
  parseSelectedRecording(selection).catch((error: unknown) => {
    if (!isActiveRecordingSelection(selection)) {
      return;
    }
    localRecordingReport = undefined;
    replayDataviewState = DEFAULT_REPLAY_DATAVIEW_STATE;
    recordingStatus.textContent = error instanceof Error ? error.message : String(error);
    replayDataviewStatus = "failed before parser worker";
    renderLocalReplayUi("failed before parser worker");
  });
});

seek.addEventListener("input", () => {
  timeLabel.textContent = formatSimTime(Number(seek.value));
});

seek.addEventListener("change", () => {
  status.textContent = "Seeking";
  post({
    type: "seek",
    requestId: nextRequestId(),
    timeMs: Number(seek.value)
  });
});

renderLocalReplayUi("no local file selected");

initialize().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error);
});

async function initialize(): Promise<void> {
  setEnabled(false);
  currentSnapshot = undefined;
  currentDiagnostics = undefined;
  currentRenderFrame = undefined;
  provenanceSummary = [];
  resetMainPerformanceTimings();
  status.textContent = "Loading scenario";
  playPause.textContent = "Play";
  renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary);

  const scenarioUrl = scenarioOptions[scenarioSelect.value];
  if (!scenarioUrl) {
    throw new Error(`Unknown scenario ${scenarioSelect.value}`);
  }

  const scenario = assertReplayScenarioV1(await fetchJson<ReplayScenarioV1>(scenarioUrl));
  if (scenarioUrl === scenarioOptions.replay) {
    referenceScenario = scenario;
  }
  const ruleset = assertRulesetV1(await fetchJson<RulesetV1>("./rules/ruleset-current.json"));
  provenanceSummary = summarizeProvenance(scenario, ruleset);
  seek.step = String(ruleset.stepMs);
  seek.max = String(scenario.durationMs);
  renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary);

  post({
    type: "initialize",
    requestId: nextRequestId(),
    scenario,
    ruleset
  });
}

async function parseSelectedRecording(selection: RecordingSelectionToken): Promise<void> {
  const file = recordingInput.files?.[0];
  if (!file) {
    if (!isActiveRecordingSelection(selection)) {
      return;
    }
    localRecordingReport = undefined;
    replayDataviewState = DEFAULT_REPLAY_DATAVIEW_STATE;
    replayDataviewStatus = "no local file selected";
    recordingStatus.textContent = "No local file selected";
    renderLocalReplayUi("no local file selected");
    return;
  }

  assertRecordingByteLength(file.size, file.name || "Selected recording");
  if (!isActiveRecordingSelection(selection)) {
    return;
  }

  recordingStatus.textContent = "Reading local file";
  localRecordingReport = undefined;
  replayDataviewState = DEFAULT_REPLAY_DATAVIEW_STATE;
  replayDataviewStatus = "reading local file";
  renderLocalReplayUi("reading local file");

  const scenario = await loadReferenceScenario();
  if (!isActiveRecordingSelection(selection)) {
    return;
  }
  const buffer = await file.arrayBuffer();
  if (!isActiveRecordingSelection(selection)) {
    return;
  }
  const message: LocalReplayParserRequest = {
    type: "parse-local-recording",
    requestId: selection.requestId,
    fileName: file.name,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    expected: buildLocalReplayExpectedScenario(scenario),
    buffer
  };

  if (!isActiveRecordingSelection(selection)) {
    return;
  }
  recordingStatus.textContent = `Parsing ${file.name} locally`;
  replayDataviewStatus = "parsing in worker";
  renderLocalReplayUi("parsing in worker");
  replayParserWorker.postMessage(message, [buffer]);
}

async function loadReferenceScenario(): Promise<ReplayScenarioV1> {
  if (referenceScenario) {
    return referenceScenario;
  }

  referenceScenario = assertReplayScenarioV1(await fetchJson<ReplayScenarioV1>(replayScenarioUrl));
  return referenceScenario;
}

function handleWorkerMessage(message: WorkerToClient): void {
  switch (message.type) {
    case "ready":
    case "snapshot":
      currentSnapshot = freezeSnapshot(message.snapshot);
      currentRenderFrame = undefined;
      recordRenderedFrame(renderer.draw(currentSnapshot));
      currentDiagnostics = withMainPerformance(message.diagnostics);
      setTimeline(seek, timeLabel, durationLabel, currentSnapshot.timeMs, currentSnapshot.durationMs);
      renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary);
      setEnabled(true);
      status.textContent = currentDiagnostics.isPlaying ? "Playing" : "Paused";
      playPause.textContent = currentDiagnostics.isPlaying ? "Pause" : "Play";
      return;
    case "playback-frame":
      const frameTiming = renderer.drawFrame(message.frame);
      if (!frameTiming) {
        status.textContent = "Resynchronizing render state";
        post({ type: "snapshot", requestId: nextRequestId() });
        return;
      }
      recordRenderedFrame(frameTiming);
      currentRenderFrame = message.frame;
      currentDiagnostics = withMainPerformance(message.frame.diagnostics);
      setTimeline(seek, timeLabel, durationLabel, message.frame.timeMs, message.frame.durationMs);
      renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary, message.frame);
      status.textContent = currentDiagnostics.isPlaying ? "Playing" : "Paused";
      playPause.textContent = currentDiagnostics.isPlaying ? "Pause" : "Play";
      return;
    case "ack":
      if (message.command === "play" && !currentDiagnostics?.isPlaying) {
        resetMainPerformanceTimings();
      }
      currentDiagnostics = withMainPerformance(message.diagnostics);
      renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary, currentRenderFrame);
      status.textContent = currentDiagnostics.isPlaying ? "Playing" : "Paused";
      playPause.textContent = currentDiagnostics.isPlaying ? "Pause" : "Play";
      return;
    case "diagnostics":
      currentDiagnostics = withMainPerformance(message.diagnostics);
      renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary, currentRenderFrame);
      return;
    case "error":
      status.textContent = message.message;
      return;
  }
}

function handleReplayParserMessage(message: LocalReplayParserResponse): void {
  if (!message.requestId || message.requestId !== activeRecordingRequestId) {
    return;
  }

  switch (message.type) {
    case "local-recording-status":
      replayDataviewStatus = message.message;
      recordingStatus.textContent = message.message;
      renderLocalReplayUi(message.phase);
      return;
    case "local-recording-report":
      localRecordingReport = message.report;
      replayDataviewState = DEFAULT_REPLAY_DATAVIEW_STATE;
      replayDataviewStatus = message.report.compiled
        ? "browser-compiled replay model ready"
        : "compatibility report ready";
      recordingStatus.textContent =
        message.report.status === "compatible"
          ? "Local replay compatible"
          : `Local replay ${message.report.status}`;
      renderLocalReplayUi(message.report.status);
      return;
    case "local-recording-error":
      localRecordingReport = undefined;
      replayDataviewState = DEFAULT_REPLAY_DATAVIEW_STATE;
      recordingStatus.textContent = message.message;
      replayDataviewStatus = "parser worker error";
      renderLocalReplayUi("parser worker error");
      return;
  }
}

function setReplayDataviewState(state: ReplayDataviewState): void {
  replayDataviewState = state;
  renderLocalReplayUi(localRecordingReport?.status ?? replayDataviewStatus);
}

function renderLocalReplayUi(recordingStateText: string): void {
  renderLocalRecordingReport(recordingReportRoot, localRecordingReport, recordingStateText);
  renderReplayDataview(
    replayDataviewRoot,
    localRecordingReport,
    replayDataviewStatus,
    replayDataviewState,
    setReplayDataviewState
  );
  setReplayDataviewJumpReady(Boolean(localRecordingReport?.compiled));
}

function setReplayDataviewJumpReady(isReady: boolean): void {
  replayDataviewLink.hidden = !isReady;
  replayDataviewLink.setAttribute("aria-disabled", String(!isReady));
}

function setEnabled(enabled: boolean): void {
  playPause.disabled = !enabled;
  step.disabled = !enabled;
  sync.disabled = !enabled;
  playbackSpeed.disabled = !enabled;
  seek.disabled = !enabled;
}

function post(message: ClientToWorker): void {
  worker.postMessage(message);
}

function nextRequestId(): string {
  requestOrdinal += 1;
  return `ui-${requestOrdinal}`;
}

function beginRecordingSelection(): RecordingSelectionToken {
  recordingSelectionGeneration += 1;
  const token = {
    generation: recordingSelectionGeneration,
    requestId: `recording-${recordingSelectionGeneration}`
  };
  activeRecordingRequestId = token.requestId;
  return token;
}

function isActiveRecordingSelection(selection: RecordingSelectionToken): boolean {
  return (
    selection.generation === recordingSelectionGeneration &&
    selection.requestId === activeRecordingRequestId
  );
}

function selectedPlaybackSpeed(): number {
  return Number(playbackSpeed.value) || 4;
}

function resetMainPerformanceTimings(): void {
  lastVisualFrameWallMs = undefined;
  mainMergeTiming.reset();
  canvasDrawTiming.reset();
  visualFrameIntervalTiming.reset();
}

function recordRenderedFrame(timing: RendererDrawTiming): void {
  const nowMs = performance.now();
  if (lastVisualFrameWallMs !== undefined) {
    visualFrameIntervalTiming.record(nowMs - lastVisualFrameWallMs);
  }
  lastVisualFrameWallMs = nowMs;
  mainMergeTiming.record(timing.mergeMs);
  canvasDrawTiming.record(timing.drawMs);
}

function withMainPerformance(diagnostics: SimulationDiagnostics): SimulationDiagnostics {
  const mainMerge = mainMergeTiming.snapshot();
  const canvasDraw = canvasDrawTiming.snapshot();
  const visualFrameInterval = visualFrameIntervalTiming.snapshot();
  const performanceDiagnostics: SimulationPerformanceDiagnostics = {
    ...(diagnostics.performance ?? {
      targetSpeed: selectedPlaybackSpeed(),
      effectiveSpeed: 0,
      lagMs: 0
    }),
    ...(mainMerge ? { mainMerge } : {}),
    ...(canvasDraw ? { canvasDraw } : {}),
    ...(visualFrameInterval ? { visualFrameInterval } : {})
  };

  return {
    ...diagnostics,
    performance: performanceDiagnostics
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}

function must<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element ${selector}`);
  }

  return element;
}

function freezeSnapshot(snapshot: WorldSnapshot): WorldSnapshot {
  if (snapshot.entities.length > 1200) {
    return Object.freeze({
      ...snapshot,
      entities: Object.freeze([...snapshot.entities])
    });
  }

  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return value;
}
