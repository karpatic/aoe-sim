import { SimulationEngine } from "../engine/engine";
import type { ClientToWorker, RequestId, WorkerToClient } from "../protocol";

type SimulationWorkerScope = typeof globalThis & {
  postMessage(message: WorkerToClient): void;
  onmessage: ((event: MessageEvent<ClientToWorker>) => void) | null;
};

const workerScope = self as SimulationWorkerScope;
let engine: SimulationEngine | undefined;
let playTimer: number | undefined;
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
      stopPlayback();
      engine = new SimulationEngine(message.scenario, message.ruleset);
      postReady(message.requestId);
      return;
    case "play":
      requireEngine().advanceTo(message.fromTimeMs ?? requireEngine().snapshot().timeMs);
      startPlayback();
      postAck(message.requestId, message.type);
      return;
    case "pause":
      stopPlayback();
      postSnapshot(message.requestId);
      return;
    case "seek":
      stopPlayback();
      requireEngine().seekWithRepeatCheck(message.timeMs);
      postSnapshot(message.requestId);
      return;
    case "step":
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
    activeEngine.advanceBy(100);
    postSnapshot();

    if (activeEngine.snapshot().timeMs >= activeEngine.durationMs) {
      stopPlayback();
      postSnapshot();
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

function requireEngine(): SimulationEngine {
  if (!engine) {
    throw new Error("Simulation worker has not been initialized");
  }

  return engine;
}

function postReady(requestId: RequestId): void {
  const activeEngine = requireEngine();
  workerScope.postMessage({
    type: "ready",
    requestId,
    snapshot: activeEngine.snapshot(),
    diagnostics: activeEngine.diagnostics(isPlaying)
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

function postSnapshot(requestId?: RequestId): void {
  const activeEngine = requireEngine();
  const message: WorkerToClient = {
    type: "snapshot",
    snapshot: activeEngine.snapshot(),
    diagnostics: activeEngine.diagnostics(isPlaying)
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
  workerScope.postMessage({
    type: "diagnostics",
    requestId,
    diagnostics: requireEngine().diagnostics(isPlaying)
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
