import "./style.css";
import { CanvasRenderer } from "./render/canvas-renderer";
import { assertReplayScenarioV1, assertRulesetV1 } from "./replay/import-game-json";
import { buildLocalReplayExpectedScenario } from "./replay/local-recording";
import { summarizeProvenance } from "./replay/provenance";
import { renderDiagnostics } from "./ui/diagnostics";
import { renderLocalRecordingReport } from "./ui/local-recording";
import { formatSimTime, setTimeline } from "./ui/timeline";
import type { ClientToWorker, WorkerToClient } from "./protocol";
import type {
  LocalReplayCompatibilityReport,
  LocalReplayParserRequest,
  LocalReplayParserResponse
} from "./replay/local-recording";
import type { ReplayScenarioV1, RulesetV1, SimulationDiagnostics, WorldSnapshot } from "./replay/model";

const canvas = must<HTMLCanvasElement>("#world");
const status = must<HTMLElement>("#status");
const scenarioSelect = must<HTMLSelectElement>("#scenario-select");
const recordingInput = must<HTMLInputElement>("#recording-file");
const recordingStatus = must<HTMLElement>("#recording-status");
const recordingReportRoot = must<HTMLElement>("#recording-report");
const playPause = must<HTMLButtonElement>("#play-pause");
const step = must<HTMLButtonElement>("#step");
const sync = must<HTMLButtonElement>("#sync");
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

let requestOrdinal = 0;
let currentSnapshot: WorldSnapshot | undefined;
let currentDiagnostics: SimulationDiagnostics | undefined;
let referenceScenario: ReplayScenarioV1 | undefined;
let localRecordingReport: LocalReplayCompatibilityReport | undefined;
let activeRecordingRequestId = "";
let provenanceSummary: readonly string[] = [];

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
  recordingStatus.textContent = `Parser worker error: ${event.message}`;
};

playPause.addEventListener("click", () => {
  post({
    type: currentDiagnostics?.isPlaying ? "pause" : "play",
    requestId: nextRequestId()
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
  post({
    type: "diagnostics",
    requestId: nextRequestId()
  });
});

scenarioSelect.addEventListener("change", () => {
  initialize().catch((error: unknown) => {
    status.textContent = error instanceof Error ? error.message : String(error);
  });
});

recordingInput.addEventListener("change", () => {
  parseSelectedRecording().catch((error: unknown) => {
    recordingStatus.textContent = error instanceof Error ? error.message : String(error);
    renderLocalRecordingReport(recordingReportRoot, localRecordingReport, "failed before parser worker");
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

renderLocalRecordingReport(recordingReportRoot, undefined, "no local file selected");

initialize().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error);
});

async function initialize(): Promise<void> {
  setEnabled(false);
  currentSnapshot = undefined;
  currentDiagnostics = undefined;
  provenanceSummary = [];
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

async function parseSelectedRecording(): Promise<void> {
  const file = recordingInput.files?.[0];
  if (!file) {
    activeRecordingRequestId = "";
    localRecordingReport = undefined;
    recordingStatus.textContent = "No local file selected";
    renderLocalRecordingReport(recordingReportRoot, undefined, "no local file selected");
    return;
  }

  recordingStatus.textContent = "Reading local file";
  localRecordingReport = undefined;
  renderLocalRecordingReport(recordingReportRoot, undefined, "reading local file");

  const scenario = await loadReferenceScenario();
  const buffer = await file.arrayBuffer();
  const requestId = nextRequestId();
  const message: LocalReplayParserRequest = {
    type: "parse-local-recording",
    requestId,
    fileName: file.name,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    expected: buildLocalReplayExpectedScenario(scenario),
    buffer
  };

  activeRecordingRequestId = requestId;
  recordingStatus.textContent = `Parsing ${file.name} locally`;
  renderLocalRecordingReport(recordingReportRoot, undefined, "parsing in worker");
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
      currentDiagnostics = message.diagnostics;
      renderer.draw(currentSnapshot);
      setTimeline(seek, timeLabel, durationLabel, currentSnapshot.timeMs, currentSnapshot.durationMs);
      renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary);
      setEnabled(true);
      status.textContent = currentDiagnostics.isPlaying ? "Playing" : "Paused";
      playPause.textContent = currentDiagnostics.isPlaying ? "Pause" : "Play";
      return;
    case "ack":
      currentDiagnostics = message.diagnostics;
      renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary);
      status.textContent = currentDiagnostics.isPlaying ? "Playing" : "Paused";
      playPause.textContent = currentDiagnostics.isPlaying ? "Pause" : "Play";
      return;
    case "diagnostics":
      currentDiagnostics = message.diagnostics;
      renderDiagnostics(diagnosticsRoot, currentSnapshot, currentDiagnostics, provenanceSummary);
      return;
    case "error":
      status.textContent = message.message;
      return;
  }
}

function handleReplayParserMessage(message: LocalReplayParserResponse): void {
  if (message.requestId && message.requestId !== activeRecordingRequestId) {
    return;
  }

  switch (message.type) {
    case "local-recording-report":
      localRecordingReport = message.report;
      recordingStatus.textContent =
        message.report.status === "compatible"
          ? "Local replay compatible"
          : `Local replay ${message.report.status}`;
      renderLocalRecordingReport(recordingReportRoot, localRecordingReport, message.report.status);
      return;
    case "local-recording-error":
      recordingStatus.textContent = message.message;
      renderLocalRecordingReport(recordingReportRoot, localRecordingReport, "parser worker error");
      return;
  }
}

function setEnabled(enabled: boolean): void {
  playPause.disabled = !enabled;
  step.disabled = !enabled;
  sync.disabled = !enabled;
  seek.disabled = !enabled;
}

function post(message: ClientToWorker): void {
  worker.postMessage(message);
}

function nextRequestId(): string {
  requestOrdinal += 1;
  return `ui-${requestOrdinal}`;
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
