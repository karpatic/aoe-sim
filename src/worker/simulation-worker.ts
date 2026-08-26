import { SimulationEngine } from "../engine/engine";
import type { ClientToWorker, RequestId, WorkerToClient } from "../protocol";

type SimulationWorkerScope = typeof globalThis & {
  postMessage(message: WorkerToClient): void;
  onmessage: ((event: MessageEvent<ClientToWorker>) => void) | null;
};

const workerScope = self as SimulationWorkerScope;
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
      requireEngine().advanceTo(message.fromTimeMs ?? requireEngine().currentTimeMs);
      startPlayback();
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
      requireEngine().advanceBy(message.deltaMs ?? requireEngine().stepMs);
      postSnapshot(message.requestId);
      return;
    case "snapshot":
      postSnapshot(message.requestId);
      return;
    case "diagnostics":
      postDiagnostics(message.requestId);
      return;
  }
}

function startPlayback(): void {
  if (isPlaying) {
    return;
  }

  isPlaying = true;
  playTimer = setInterval(() => {
    const activeEngine = requireEngine();
    const snapshot = activeEngine.advanceBy(100);
    postSnapshot(undefined, snapshot);

    if (snapshot.timeMs >= activeEngine.durationMs) {
      stopPlayback();
      postSnapshot(undefined, snapshot);
    }
  }, 100);
}

function stopPlayback(): void {
  if (playTimer !== undefined) {
    clearInterval(playTimer);
    playTimer = undefined;
  }

  isPlaying = false;
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
    while (
      activeEngine.currentTimeMs < job.targetTimeMs &&
      performance.now() - wallStartMs < SEEK_CHUNK_WALL_BUDGET_MS
    ) {
      activeEngine.advanceSlice(job.targetTimeMs, SEEK_SLICE_STEP_BUDGET);
    }

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
  workerScope.postMessage({
    type: "ready",
    requestId,
    snapshot,
    diagnostics: activeEngine.diagnostics(isPlaying, snapshot)
  });
}

function postAck(requestId: RequestId, command: ClientToWorker["type"]): void {
  workerScope.postMessage({
    type: "ack",
    requestId,
    command,
    diagnostics: requireEngine().diagnostics(isPlaying)
  });
}

function postSnapshot(requestId?: RequestId, snapshot = requireEngine().snapshot()): void {
  const activeEngine = requireEngine();
  const message: WorkerToClient = {
    type: "snapshot",
    snapshot,
    diagnostics: activeEngine.diagnostics(isPlaying, snapshot)
  };

  if (requestId) {
    workerScope.postMessage({
      ...message,
      requestId
    });
    return;
  }

  workerScope.postMessage(message);
}

function postDiagnostics(requestId: RequestId): void {
  const activeEngine = requireEngine();
  const snapshot = activeEngine.snapshot();
  workerScope.postMessage({
    type: "diagnostics",
    requestId,
    diagnostics: activeEngine.diagnostics(isPlaying, snapshot)
  });
}

function postError(requestId: RequestId | undefined, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const payload: WorkerToClient = {
    type: "error",
    message
  };

  if (requestId) {
    workerScope.postMessage({
      ...payload,
      requestId
    });
    return;
  }

  workerScope.postMessage(payload);
}

interface SeekJob {
  readonly id: number;
  readonly requestId: RequestId;
  readonly targetTimeMs: number;
  lastProgressPostMs: number;
}
