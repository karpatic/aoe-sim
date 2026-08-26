import { SimulationEngine } from "../engine/engine";
import { RollingPerformanceMetric, measurePerformance } from "../profiling";
import type { ClientToWorker, RequestId, WorkerToClient } from "../protocol";
import type { SimulationDiagnostics, SimulationPerformanceDiagnostics } from "../replay/model";

type SimulationWorkerScope = typeof globalThis & {
  postMessage(message: WorkerToClient): void;
  onmessage: ((event: MessageEvent<ClientToWorker>) => void) | null;
};

const workerScope = self as SimulationWorkerScope;
const PLAYBACK_TIMER_INTERVAL_MS = 100;
const PLAYBACK_CATCHUP_WALL_BUDGET_MS = 180;
const PLAYBACK_SLICE_STEP_BUDGET = 10;
const DEFAULT_PLAYBACK_SPEED = 4;
const SUPPORTED_PLAYBACK_SPEEDS = new Set([4, 10, 30]);
const SEEK_CHUNK_WALL_BUDGET_MS = 35;
const SEEK_PROGRESS_INTERVAL_MS = 500;
const SEEK_SLICE_STEP_BUDGET = 5;
const REPEAT_SEEK_ENTITY_LIMIT = 1200;
const REPEAT_SEEK_DURATION_LIMIT_MS = 600000;

let engine: SimulationEngine | undefined;
let playTimer: number | undefined;
let seekTimer: number | undefined;
let activeJobId = 0;
let isPlaying = false;
let playbackSession: PlaybackSession | undefined;
let playbackTargetSpeed = DEFAULT_PLAYBACK_SPEED;
let playbackEffectiveSpeed = 0;
let playbackLagMs = 0;
const simulationBatchTiming = new RollingPerformanceMetric();
const workerPostTiming = new RollingPerformanceMetric();

workerScope.onmessage = (event: MessageEvent<ClientToWorker>) => {
  try {
    handleMessage(event.data);
  } catch (error) {
    postError(event.data.requestId, error);
  }
};

function handleMessage(message: ClientToWorker): void {
  switch (message.type) {
    case "initialize":
      cancelSeekJob();
      stopPlayback();
      engine = new SimulationEngine(message.scenario, message.ruleset);
      postReady(message.requestId);
      return;
    case "play":
      cancelSeekJob();
      measurePerformance(simulationBatchTiming, () =>
        requireEngine().advanceToTime(message.fromTimeMs ?? requireEngine().currentTimeMs)
      );
      startPlayback(normalizePlaybackSpeed(message.speed));
      postAck(message.requestId, message.type);
      return;
    case "pause":
      cancelSeekJob();
      stopPlayback();
      postSnapshot(message.requestId);
      return;
    case "seek":
      stopPlayback();
      startSeek(message.requestId, message.timeMs);
      return;
    case "step":
      cancelSeekJob();
      stopPlayback();
      postSnapshot(
        message.requestId,
        measurePerformance(simulationBatchTiming, () =>
          requireEngine().advanceBy(message.deltaMs ?? requireEngine().stepMs)
        )
      );
      return;
    case "snapshot":
      postSnapshot(message.requestId);
      return;
    case "diagnostics":
      postDiagnostics(message.requestId);
      return;
  }
}

function startPlayback(speed: number): void {
  if (playTimer !== undefined) {
    clearTimeout(playTimer);
    playTimer = undefined;
  }

  const activeEngine = requireEngine();
  const nowMs = performance.now();
  isPlaying = true;
  playbackTargetSpeed = speed;
  playbackEffectiveSpeed = 0;
  playbackLagMs = 0;
  playbackSession = {
    startWallMs: nowMs,
    startSimTimeMs: activeEngine.currentTimeMs,
    lastFramePostWallMs: nowMs - PLAYBACK_TIMER_INTERVAL_MS,
    speed
  };
  schedulePlaybackTick(PLAYBACK_TIMER_INTERVAL_MS);
}

function stopPlayback(): void {
  if (playTimer !== undefined) {
    clearTimeout(playTimer);
    playTimer = undefined;
  }

  isPlaying = false;
  playbackSession = undefined;
}

function schedulePlaybackTick(delayMs: number): void {
  playTimer = setTimeout(runPlaybackTick, Math.max(0, delayMs));
}

function runPlaybackTick(): void {
  playTimer = undefined;
  const activeEngine = requireEngine();
  const session = playbackSession;
  if (!isPlaying || !session) {
    return;
  }

  const wallStartMs = performance.now();
  const targetTimeMs = playbackTargetTime(session, wallStartMs, activeEngine.durationMs);
  measurePerformance(simulationBatchTiming, () => {
    let advanced: boolean;
    do {
      advanced = activeEngine.advancePlaybackSlice(targetTimeMs, PLAYBACK_SLICE_STEP_BUDGET);
    } while (
      advanced &&
      activeEngine.currentTimeMs < targetTimeMs &&
      performance.now() - wallStartMs < PLAYBACK_CATCHUP_WALL_BUDGET_MS
    );
  });
  const wallAfterSimMs = performance.now();
  updatePlaybackProgressDiagnostics(session, activeEngine.currentTimeMs, wallAfterSimMs);

  if (activeEngine.currentTimeMs >= activeEngine.durationMs) {
    stopPlayback();
    postSnapshot(undefined);
    return;
  }

  if (wallAfterSimMs - session.lastFramePostWallMs >= PLAYBACK_TIMER_INTERVAL_MS) {
    session.lastFramePostWallMs = wallAfterSimMs;
    postPlaybackFrame();
  }

  const elapsedTickMs = performance.now() - wallStartMs;
  schedulePlaybackTick(PLAYBACK_TIMER_INTERVAL_MS - elapsedTickMs);
}

function playbackTargetTime(
  session: PlaybackSession,
  wallTimeMs: number,
  durationMs: number
): number {
  const elapsedWallMs = Math.max(0, wallTimeMs - session.startWallMs);
  return Math.min(durationMs, Math.floor(session.startSimTimeMs + elapsedWallMs * session.speed));
}

function updatePlaybackProgressDiagnostics(
  session: PlaybackSession,
  currentTimeMs: number,
  wallTimeMs: number
): void {
  const elapsedWallMs = Math.max(1, wallTimeMs - session.startWallMs);
  const advancedSimMs = Math.max(0, currentTimeMs - session.startSimTimeMs);
  const idealTargetTimeMs = playbackTargetTime(session, wallTimeMs, Number.MAX_SAFE_INTEGER);
  playbackEffectiveSpeed = advancedSimMs / elapsedWallMs;
  playbackLagMs = Math.max(0, idealTargetTimeMs - currentTimeMs);
}

function normalizePlaybackSpeed(speed: number | undefined): number {
  if (speed !== undefined && SUPPORTED_PLAYBACK_SPEEDS.has(speed)) {
    return speed;
  }

  return DEFAULT_PLAYBACK_SPEED;
}

function startSeek(requestId: RequestId, targetTimeMs: number): void {
  cancelSeekJob();
  const activeEngine = requireEngine();
  activeEngine.resetToStart();

  const job: SeekJob = {
    id: activeJobId,
    requestId,
    targetTimeMs,
    lastProgressPostMs: performance.now()
  };

  runSeekChunk(job);
}

function cancelSeekJob(): void {
  activeJobId += 1;
  if (seekTimer !== undefined) {
    clearTimeout(seekTimer);
    seekTimer = undefined;
  }
}

function runSeekChunk(job: SeekJob): void {
  if (job.id !== activeJobId) {
    return;
  }

  try {
    const activeEngine = requireEngine();
    const wallStartMs = performance.now();
    measurePerformance(simulationBatchTiming, () => {
      while (
        activeEngine.currentTimeMs < job.targetTimeMs &&
        performance.now() - wallStartMs < SEEK_CHUNK_WALL_BUDGET_MS
      ) {
        activeEngine.advanceSlice(job.targetTimeMs, SEEK_SLICE_STEP_BUDGET);
      }
    });

    if (job.id !== activeJobId) {
      return;
    }

    const complete = activeEngine.currentTimeMs >= Math.min(job.targetTimeMs, activeEngine.durationMs);
    const nowMs = performance.now();
    if (complete || nowMs - job.lastProgressPostMs >= SEEK_PROGRESS_INTERVAL_MS) {
      postSeekSnapshot(job, complete);
      job.lastProgressPostMs = nowMs;
    }

    if (complete) {
      return;
    }

    seekTimer = setTimeout(() => runSeekChunk(job), 0);
  } catch (error) {
    if (job.id === activeJobId) {
      postError(job.requestId, error);
    }
  }
}

function postSeekSnapshot(job: SeekJob, complete: boolean): void {
  const activeEngine = requireEngine();
  if (
    complete &&
    activeEngine.initialEntityCount <= REPEAT_SEEK_ENTITY_LIMIT &&
    activeEngine.durationMs <= REPEAT_SEEK_DURATION_LIMIT_MS
  ) {
    const snapshot = activeEngine.seekWithRepeatCheck(job.targetTimeMs);
    if (job.id === activeJobId) {
      postSnapshot(job.requestId, snapshot);
    }
    return;
  }

  postSnapshot(complete ? job.requestId : undefined);
}

function requireEngine(): SimulationEngine {
  if (!engine) {
    throw new Error("Simulation worker has not been initialized");
  }

  return engine;
}

function postReady(requestId: RequestId): void {
  const activeEngine = requireEngine();
  const snapshot = activeEngine.snapshot();
  postToClient({
    type: "ready",
    requestId,
    snapshot,
    diagnostics: withWorkerPerformance(activeEngine.diagnostics(isPlaying))
  });
}

function postAck(requestId: RequestId, command: ClientToWorker["type"]): void {
  postToClient({
    type: "ack",
    requestId,
    command,
    diagnostics: withWorkerPerformance(requireEngine().diagnostics(isPlaying))
  });
}

function postSnapshot(requestId?: RequestId, snapshot = requireEngine().snapshot()): void {
  const activeEngine = requireEngine();
  const message: WorkerToClient = {
    type: "snapshot",
    snapshot,
    diagnostics: withWorkerPerformance(activeEngine.diagnostics(isPlaying))
  };

  if (requestId) {
    postToClient({
      ...message,
      requestId
    });
    return;
  }

  postToClient(message);
}

function postPlaybackFrame(): void {
  const frame = requireEngine().createPlaybackRenderFrame(isPlaying);
  postToClient({
    type: "playback-frame",
    frame: {
      ...frame,
      diagnostics: withWorkerPerformance(frame.diagnostics)
    }
  });
}

function postDiagnostics(requestId: RequestId): void {
  postToClient({
    type: "diagnostics",
    requestId,
    diagnostics: withWorkerPerformance(requireEngine().diagnostics(isPlaying))
  });
}

function postError(requestId: RequestId | undefined, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const payload: WorkerToClient = {
    type: "error",
    message
  };

  if (requestId) {
    postToClient({
      ...payload,
      requestId
    });
    return;
  }

  postToClient(payload);
}

function postToClient(message: WorkerToClient): void {
  const startMs = performance.now();
  workerScope.postMessage(message);
  workerPostTiming.record(performance.now() - startMs);
}

function withWorkerPerformance(diagnostics: SimulationDiagnostics): SimulationDiagnostics {
  const simBatch = simulationBatchTiming.snapshot();
  const workerPost = workerPostTiming.snapshot();
  const performanceDiagnostics: SimulationPerformanceDiagnostics = {
    ...diagnostics.performance,
    targetSpeed: playbackTargetSpeed,
    effectiveSpeed: roundDiagnostic(playbackEffectiveSpeed),
    lagMs: Math.round(playbackLagMs),
    ...(simBatch ? { simBatch } : {}),
    ...(workerPost ? { workerPost } : {})
  };

  return {
    ...diagnostics,
    performance: performanceDiagnostics
  };
}

function roundDiagnostic(value: number): number {
  return Number(value.toFixed(3));
}

interface SeekJob {
  readonly id: number;
  readonly requestId: RequestId;
  readonly targetTimeMs: number;
  lastProgressPostMs: number;
}

interface PlaybackSession {
  readonly startWallMs: number;
  readonly startSimTimeMs: number;
  lastFramePostWallMs: number;
  readonly speed: number;
}
