import {
  DATAVIEW_OPTIONAL_OUTPUT_NAMES,
  DATAVIEW_REQUIRED_OUTPUT_NAMES,
  DATAVIEW_VIEWER_PAYLOAD_TYPE,
  DATAVIEW_VIEWER_READY_TYPE,
  DATAVIEW_WORKER_REQUEST_TYPE,
  type DataviewDoneMessage,
  type DataviewGeneratedOutput,
  type DataviewPrecomputeRequest,
  type DataviewProgressMessage,
  type DataviewProgressStage,
  type DataviewViewerReadyMessage,
  type DataviewViewerPayload,
  type DataviewWorkerToClient
} from "./dataview-protocol";
import {
  assertDataviewGeneratedJsonByteLength,
  assertDataviewGeneratedJsonTotalByteLength,
  assertRecordingByteLength,
  formatBytes
} from "./replay/limits";

interface StageState {
  readonly label: string;
  readonly element: HTMLLIElement;
}

interface PendingViewerTransfer {
  readonly iframe: HTMLIFrameElement;
  readonly payload: DataviewViewerPayload;
  readonly nonce: string;
}

const fileInput = must<HTMLInputElement>("#recording-file");
const chooseButton = must<HTMLButtonElement>("#choose-recording");
const cancelButton = must<HTMLButtonElement>("#cancel-recording");
const clearButton = must<HTMLButtonElement>("#clear-recording");
const statusText = must<HTMLElement>("#status");
const progressBar = must<HTMLProgressElement>("#progress");
const progressList = must<HTMLUListElement>("#progress-list");
const errorText = must<HTMLElement>("#error");
const outputSummary = must<HTMLDListElement>("#output-summary");
const viewerHost = must<HTMLElement>("#viewer-host");
const viewerEmpty = must<HTMLElement>("#viewer-empty");
const runtimeBaseUrl = new URL("./dataview-runtime/", document.baseURI).href;
const stageOrder: readonly DataviewProgressStage[] = [
  "validating",
  "hashing",
  "verifying-runtime",
  "loading-pyodide",
  "loading-python-packages",
  "loading-pipeline",
  "extracting-replay",
  "generating-schemas",
  "inferring-lifetimes",
  "generating-economy",
  "reconstructing-resources",
  "loading-known-unit-stats",
  "transferring",
  "done"
];
const stageLabels: Record<DataviewProgressStage, string> = {
  validating: "Validate file",
  hashing: "Hash replay",
  "verifying-runtime": "Verify runtime",
  "loading-pyodide": "Load Pyodide",
  "loading-python-packages": "Load packages",
  "loading-pipeline": "Load pipeline",
  "extracting-replay": "Extract game.json",
  "generating-schemas": "Generate schemas",
  "inferring-lifetimes": "Infer lifetimes",
  "generating-economy": "Generate economy",
  "reconstructing-resources": "Reconstruct resources",
  "loading-known-unit-stats": "Known unit stats",
  transferring: "Transfer to viewer",
  done: "Ready"
};

let activeWorker: Worker | undefined;
let activeRequestId = "";
let requestOrdinal = 0;
let viewerIframe: HTMLIFrameElement | undefined;
let pendingViewerTransfer: PendingViewerTransfer | undefined;
let viewerReadyListener: ((event: MessageEvent<DataviewViewerReadyMessage>) => void) | undefined;
const stageStates = new Map<DataviewProgressStage, StageState>();

initialize();

function initialize(): void {
  buildProgressList();
  chooseButton.addEventListener("click", () => fileInput.click());
  cancelButton.addEventListener("click", () => cancelActiveWork("Preprocessing cancelled."));
  clearButton.addEventListener("click", () => resetSelection("Choose a local .aoe2record to begin."));
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      resetSelection("Choose a local .aoe2record to begin.");
      return;
    }
    startPrecompute(file).catch((error: unknown) => showError(error));
  });

  const missingSupport = supportProblem();
  if (missingSupport) {
    setBusy(false);
    fileInput.disabled = true;
    chooseButton.disabled = true;
    statusText.textContent = missingSupport;
    errorText.textContent = missingSupport;
    errorText.hidden = false;
    return;
  }

  resetSelection("Choose a local .aoe2record to begin.");
}

async function startPrecompute(file: File): Promise<void> {
  cancelActiveWork("Starting a new replay selection.");
  resetViewer();
  resetProgress();
  outputSummary.replaceChildren();
  errorText.hidden = true;
  errorText.textContent = "";

  const fileName = sanitizeFileName(file.name);
  assertSelectedFile(file, fileName);
  setBusy(true);
  statusText.textContent = `Reading ${fileName}`;
  const requestId = `dataview-${Date.now()}-${++requestOrdinal}`;
  activeRequestId = requestId;

  const buffer = await file.arrayBuffer();
  if (activeRequestId !== requestId) {
    return;
  }
  assertRecordingByteLength(buffer.byteLength, "Selected recording buffer");
  if (buffer.byteLength !== file.size) {
    throw new Error(
      `Selected recording size changed while reading: file metadata says ${file.size} bytes, ` +
        `buffer has ${buffer.byteLength} bytes.`
    );
  }

  const worker = new Worker(new URL("./worker/dataview-precompute-worker.ts", import.meta.url), { type: "module" });
  activeWorker = worker;
  worker.onmessage = (event: MessageEvent<DataviewWorkerToClient>) => {
    try {
      if (worker !== activeWorker || !event.data || event.data.requestId !== activeRequestId) {
        return;
      }
      handleWorkerMessage(event.data);
    } catch (error: unknown) {
      if (worker === activeWorker) {
        showError(error);
      }
    }
  };
  worker.onerror = (event) => {
    if (worker !== activeWorker) {
      return;
    }
    showError(new Error(`Preprocessing worker error: ${event.message}`));
  };

  const request: DataviewPrecomputeRequest = {
    type: DATAVIEW_WORKER_REQUEST_TYPE,
    requestId,
    fileName,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    runtimeBaseUrl,
    buffer
  };
  worker.postMessage(request, [buffer]);
}

function handleWorkerMessage(message: DataviewWorkerToClient): void {
  switch (message.type) {
    case "progress":
      updateProgress(message);
      return;
    case "error":
      showError(new Error(message.message));
      return;
    case "done":
      finishPrecompute(message);
      return;
  }
}

function updateProgress(message: DataviewProgressMessage): void {
  progressBar.max = message.total;
  progressBar.value = message.completed;
  statusText.textContent = message.message;
  const state = stageStates.get(message.stage);
  if (state) {
    state.element.dataset.state = message.completed >= message.total || message.completed > stageOrder.indexOf(message.stage)
      ? "done"
      : "active";
    state.element.textContent = `${state.label}: ${message.message}`;
  }
  for (const stage of stageOrder) {
    if (stage === message.stage) {
      break;
    }
    const prior = stageStates.get(stage);
    if (prior && prior.element.dataset.state !== "done") {
      prior.element.dataset.state = "done";
      prior.element.textContent = `${prior.label}: complete`;
    }
  }
}

function finishPrecompute(message: DataviewDoneMessage): void {
  validateOutputs(message.outputs);
  renderOutputSummary(message);
  const viewerNonce = createViewerNonce(message.requestId);
  const payload: DataviewViewerPayload = {
    type: DATAVIEW_VIEWER_PAYLOAD_TYPE,
    requestId: message.requestId,
    viewerNonce,
    replay: message.replay,
    outputs: message.outputs,
    unitStatsNotice: message.unitStatsNotice
  };
  activeWorker = undefined;
  setBusy(false);
  statusText.textContent = "Dataview ready.";
  createViewerIframe(payload, viewerNonce);
}

function validateOutputs(outputs: readonly DataviewGeneratedOutput[]): void {
  if (!Array.isArray(outputs)) {
    throw new Error("Preprocessor outputs must be an array.");
  }
  const allowedNames = new Set<string>([
    ...DATAVIEW_REQUIRED_OUTPUT_NAMES,
    ...DATAVIEW_OPTIONAL_OUTPUT_NAMES
  ]);
  const outputNames = new Set<string>();
  let totalBytes = 0;
  for (const output of outputs) {
    if (!output || typeof output !== "object" || !allowedNames.has(output.name)) {
      throw new Error("Preprocessor returned an unexpected output name.");
    }
    if (outputNames.has(output.name)) {
      throw new Error(`Preprocessor returned duplicate ${output.name}.`);
    }
    if (!(output.buffer instanceof ArrayBuffer)) {
      throw new Error(`${output.name} is missing its transferred buffer.`);
    }
    assertDataviewGeneratedJsonByteLength(output.sizeBytes, output.name);
    if (output.sizeBytes !== output.buffer.byteLength) {
      throw new Error(`${output.name} size metadata does not match its transferred buffer.`);
    }
    outputNames.add(output.name);
    totalBytes += output.sizeBytes;
  }
  for (const name of DATAVIEW_REQUIRED_OUTPUT_NAMES) {
    if (!outputNames.has(name)) {
      throw new Error(`Preprocessor did not return ${name}.`);
    }
  }
  assertDataviewGeneratedJsonTotalByteLength(totalBytes);
}

function createViewerIframe(payload: DataviewViewerPayload, nonce: string): void {
  resetViewer();
  const iframe = document.createElement("iframe");
  const viewerUrl = new URL("./dataview-viewer.html", document.baseURI);
  viewerUrl.hash = new URLSearchParams({ requestId: payload.requestId, nonce }).toString();
  iframe.title = "Generated AoE II single-game dataview";
  iframe.src = viewerUrl.href;
  iframe.referrerPolicy = "no-referrer";
  iframe.sandbox.add("allow-scripts");
  viewerIframe = iframe;
  pendingViewerTransfer = { iframe, payload, nonce };
  installViewerReadyListener();
  viewerHost.append(iframe);
  viewerEmpty.hidden = true;
}

function installViewerReadyListener(): void {
  removeViewerReadyListener();
  viewerReadyListener = (event: MessageEvent<DataviewViewerReadyMessage>) => {
    const pending = pendingViewerTransfer;
    if (!pending || pending.iframe !== viewerIframe || event.source !== pending.iframe.contentWindow) {
      return;
    }
    if (!event.data || event.data.type !== DATAVIEW_VIEWER_READY_TYPE) {
      return;
    }
    if (event.data.requestId !== pending.payload.requestId || event.data.nonce !== pending.nonce) {
      showError(new Error("Viewer ready handshake did not match the pending replay payload."));
      return;
    }
    transferPayloadToViewer(pending);
  };
  window.addEventListener("message", viewerReadyListener);
}

function removeViewerReadyListener(): void {
  if (!viewerReadyListener) {
    return;
  }
  window.removeEventListener("message", viewerReadyListener);
  viewerReadyListener = undefined;
}

function transferPayloadToViewer(pending: PendingViewerTransfer): void {
  const contentWindow = pending.iframe.contentWindow;
  if (pending !== pendingViewerTransfer || pending.iframe !== viewerIframe || !contentWindow) {
    return;
  }
  pendingViewerTransfer = undefined;
  removeViewerReadyListener();
  contentWindow.postMessage(pending.payload, "*", pending.payload.outputs.map((output) => output.buffer));
}

function renderOutputSummary(message: DataviewDoneMessage): void {
  outputSummary.replaceChildren();
  appendOutputRow("Replay", `${message.replay.fileName} / ${formatBytes(message.replay.sizeBytes)}`);
  appendOutputRow("Replay SHA-256", message.replay.sha256);
  appendOutputRow("Unit stats", message.unitStatsNotice);
  const totalMs = message.timings.reduce((sum, timing) => sum + timing.elapsedMs, 0);
  appendOutputRow("Preprocess time", `${(totalMs / 1000).toFixed(1)}s measured worker stages`);
  for (const output of message.outputs) {
    appendOutputRow(output.name, `${formatBytes(output.sizeBytes)} / ${output.sha256}`);
  }
}

function appendOutputRow(label: string, value: string): void {
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  detail.textContent = value;
  outputSummary.append(term, detail);
}

function assertSelectedFile(file: File, fileName: string): void {
  if (!fileName.toLowerCase().endsWith(".aoe2record")) {
    throw new Error("Choose a .aoe2record file.");
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("Selected recording must have a positive safe integer byte size.");
  }
  if (!Number.isFinite(file.lastModified) || file.lastModified < 0) {
    throw new Error("Selected recording has invalid file metadata.");
  }
  assertRecordingByteLength(file.size, fileName);
}

function sanitizeFileName(value: string): string {
  const basename = value.split(/[\\/]/).pop() ?? "";
  return basename.replace(/[^\w .()[\]-]/g, "_").slice(0, 160) || "selected.aoe2record";
}

function cancelActiveWork(message: string): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = undefined;
  }
  activeRequestId = "";
  clearPendingViewerTransfer();
  setBusy(false);
  if (message) {
    statusText.textContent = message;
  }
}

function resetSelection(message: string): void {
  cancelActiveWork(message);
  fileInput.value = "";
  resetProgress();
  resetViewer();
  outputSummary.replaceChildren();
  errorText.hidden = true;
  errorText.textContent = "";
}

function resetViewer(): void {
  clearPendingViewerTransfer();
  viewerIframe?.remove();
  viewerIframe = undefined;
  viewerEmpty.hidden = false;
}

function clearPendingViewerTransfer(): void {
  pendingViewerTransfer = undefined;
  removeViewerReadyListener();
}

function resetProgress(): void {
  progressBar.value = 0;
  progressBar.max = 1;
  for (const stage of stageOrder) {
    const state = stageStates.get(stage);
    if (!state) {
      continue;
    }
    state.element.dataset.state = "pending";
    state.element.textContent = `${state.label}: pending`;
  }
}

function buildProgressList(): void {
  progressList.replaceChildren();
  for (const stage of stageOrder) {
    const item = document.createElement("li");
    const label = stageLabels[stage];
    item.dataset.state = "pending";
    item.textContent = `${label}: pending`;
    progressList.append(item);
    stageStates.set(stage, { label, element: item });
  }
}

function setBusy(isBusy: boolean): void {
  chooseButton.disabled = isBusy;
  fileInput.disabled = isBusy;
  cancelButton.disabled = !isBusy;
  clearButton.disabled = isBusy && !activeWorker;
}

function showError(error: unknown): void {
  cancelActiveWork("Preprocessing failed.");
  const message = error instanceof Error ? error.message : String(error);
  errorText.textContent = message;
  errorText.hidden = false;
}

function supportProblem(): string | undefined {
  if (typeof Worker !== "function") {
    return "This browser does not expose Web Workers, so local replay preprocessing cannot run.";
  }
  if (typeof WebAssembly !== "object") {
    return "This browser does not expose WebAssembly, so Pyodide cannot run.";
  }
  if (!crypto?.subtle) {
    return "This browser does not expose Web Crypto hashing required for local replay identity.";
  }
  if (typeof crypto.getRandomValues !== "function") {
    return "This browser does not expose random nonce generation required for isolated viewer transfers.";
  }
  return undefined;
}

function createViewerNonce(requestId: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const random = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${requestId}-${random}`;
}

function must<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element ${selector}`);
  }
  return element;
}
