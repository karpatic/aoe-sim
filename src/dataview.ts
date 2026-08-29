import {
  DATAVIEW_OPTIONAL_OUTPUT_NAMES,
  DATAVIEW_REQUIRED_OUTPUT_NAMES,
  DATAVIEW_VIEWER_PAYLOAD_TYPE,
  DATAVIEW_VIEWER_READY_TYPE,
  DATAVIEW_VIEWER_RENDER_STATE_TYPE,
  DATAVIEW_VIEWER_SHELL_SCROLL_REQUEST_TYPE,
  DATAVIEW_VIEWER_SHELL_SCROLL_STATE_TYPE,
  DATAVIEW_WORKER_REQUEST_TYPE,
  type DataviewDoneMessage,
  type DataviewGeneratedOutput,
  type DataviewPrecomputeRequest,
  type DataviewProgressMessage,
  type DataviewProgressStage,
  type DataviewViewerRenderStateMessage,
  type DataviewViewerReadyMessage,
  type DataviewViewerShellScrollRequest,
  type DataviewViewerShellScrollState,
  type DataviewViewerPayload,
  type DataviewWorkerToClient
} from "./dataview-protocol";
import {
  assertDataviewGeneratedJsonByteLength,
  assertDataviewGeneratedJsonTotalByteLength,
  assertRecordingByteLength
} from "./replay/limits";
import { readReplayFolderSelection, writeReplayFolderSelection } from "./ui/replay-folder-store";

interface StageState {
  readonly label: string;
  readonly element: HTMLLIElement;
}

interface PendingViewerTransfer {
  readonly iframe: HTMLIFrameElement;
  readonly payload: DataviewViewerPayload;
  readonly nonce: string;
}

interface ReplayFolderRefreshOptions {
  readonly autoloadRememberedSelection: boolean;
  readonly missingSelectionMessage?: string;
}

const fileInput = must<HTMLInputElement>("#recording-file");
const fileControl = must<HTMLElement>("#recording-file-control");
const chooseButton = must<HTMLButtonElement>("#choose-recording");
const reconnectButton = must<HTMLButtonElement>("#reconnect-recording-folder");
const replaySelectControl = must<HTMLElement>("#recording-select-control");
const replaySelect = must<HTMLSelectElement>("#recording-select");
const cancelButton = must<HTMLButtonElement>("#cancel-recording");
const defaultLoadButton = must<HTMLButtonElement>("#clear-recording");
const privacyCopy = must<HTMLElement>("#privacy-copy");
const statusText = must<HTMLElement>("#status");
const progressBar = must<HTMLProgressElement>("#progress");
const progressList = must<HTMLUListElement>("#progress-list");
const errorText = must<HTMLElement>("#error");
const uploadPanel = must<HTMLElement>("#upload-panel");
const settingsToggle = must<HTMLButtonElement>("#settings-toggle");
const settingsClose = must<HTMLButtonElement>("#settings-close");
const shell = must<HTMLElement>("main.shell");
const viewerHost = must<HTMLElement>("#viewer-host");
const viewerEmpty = must<HTMLElement>("#viewer-empty");
const runtimeBaseUrl = new URL("./dataview-runtime/", document.baseURI).href;
const viewerPageUrl = new URL(document.body.dataset.viewerPage ?? "./dataview-viewer.html", document.baseURI);
const viewerFrameTitle = document.body.dataset.viewerTitle ?? "Generated AoE II single-game dataview";
const defaultRecordingUrl = new URL("./glade-default.aoe2record", document.baseURI);
const defaultRecordingSize = 2_101_825;
const defaultRecordingSha256 = "6fa2103c6b632edda3d114d5d1aabb5ed7560b4d70c0a1070d170e7b4c3833d9";
const folderPickerSupported = typeof window.showDirectoryPicker === "function";
const replayNameCollator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });
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
  "generating-unit-stats",
  "generating-gameplay-timeline",
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
  "generating-unit-stats": "Calculate unit stats",
  "generating-gameplay-timeline": "Build gameplay timeline",
  transferring: "Transfer to viewer",
  done: "Ready"
};

let activeWorker: Worker | undefined;
let activeRequestId = "";
let requestOrdinal = 0;
let viewerIframe: HTMLIFrameElement | undefined;
let pendingViewerTransfer: PendingViewerTransfer | undefined;
let viewerReadyListener: ((event: MessageEvent<DataviewViewerReadyMessage>) => void) | undefined;
let activeViewerIdentity: { requestId: string; nonce: string } | undefined;
let replayFolderHandle: FileSystemDirectoryHandle | undefined;
let replayFolderPermission: PermissionState = "prompt";
let replayFolderFileNames: readonly string[] = [];
let rememberedReplayFileName = "";
let controlsBlocked = false;
let isBusy = false;
let settingsReturnFocus: HTMLElement | undefined;
const retainedResizeObservers: ResizeObserver[] = [];
const stageStates = new Map<DataviewProgressStage, StageState>();

initialize();

function initialize(): void {
  buildProgressList();
  chooseButton.addEventListener("click", () => {
    if (!folderPickerSupported) {
      fileInput.click();
      return;
    }
    chooseReplayFolder().catch((error: unknown) => showWorkflowError(error, "Replay folder selection failed."));
  });
  reconnectButton.addEventListener("click", () => {
    reconnectReplayFolder().catch((error: unknown) => showWorkflowError(error, "Replay folder reconnect failed."));
  });
  replaySelect.addEventListener("change", () => {
    const fileName = replaySelect.value;
    if (!fileName) {
      return;
    }
    loadReplayFromFolder(fileName).catch((error: unknown) => showWorkflowError(error, "Replay loading failed."));
  });
  cancelButton.addEventListener("click", () => cancelActiveWork("Preprocessing cancelled."));
  defaultLoadButton.addEventListener("click", () => void loadDefaultRecording());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    startPrecompute(file).catch((error: unknown) => showError(error));
  });
  settingsToggle.addEventListener("click", () => setReplayControlsOpen(true, { moveFocus: true }));
  settingsClose.addEventListener("click", () => setReplayControlsOpen(false, { restoreFocus: true }));
  uploadPanel.addEventListener("keydown", handleReplayControlsKeydown);
  window.addEventListener("message", handleViewerShellScrollRequest);
  window.addEventListener("message", handleViewerRenderState);
  window.addEventListener("scroll", sendViewerShellScrollState, { passive: true });
  window.addEventListener("resize", sendViewerShellScrollState);
  if (typeof ResizeObserver === "function") {
    const controlsResizeObserver = new ResizeObserver(() => sendViewerShellScrollState());
    controlsResizeObserver.observe(uploadPanel);
    retainedResizeObservers.push(controlsResizeObserver);
  }

  const missingSupport = supportProblem();
  if (missingSupport) {
    controlsBlocked = true;
    syncControls();
    statusText.textContent = missingSupport;
    errorText.textContent = missingSupport;
    errorText.hidden = false;
    return;
  }

  configureSelectionMode();
  if (folderPickerSupported) {
    restoreReplayFolder().catch((error: unknown) => showWorkflowError(error, "Saved replay folder restore failed."));
  } else {
    showIdlePrompt();
  }
}

function configureSelectionMode(): void {
  if (folderPickerSupported) {
    fileControl.hidden = true;
    replaySelectControl.hidden = false;
    privacyCopy.textContent =
      "Choose a replay folder to list direct child .aoe2record files. The folder handle and selected filename " +
      "are stored only in this browser's IndexedDB; replay bytes stay in this browser worker.";
    renderReplayOptions();
  } else {
    replaySelectControl.hidden = true;
    reconnectButton.hidden = true;
    fileControl.hidden = false;
    privacyCopy.textContent =
      "This browser does not support persistent replay folders. Choose a .aoe2record file each session; " +
      "replay bytes stay in this browser worker.";
  }
  syncControls();
}

async function restoreReplayFolder(): Promise<void> {
  statusText.textContent = "Checking for a saved replay folder.";
  viewerEmpty.textContent = "Checking for a saved replay folder.";
  const selection = await readReplayFolderSelection();
  if (!selection) {
    showIdlePrompt();
    return;
  }

  replayFolderHandle = selection.directoryHandle;
  rememberedReplayFileName = selection.selectedFileName ?? "";
  replayFolderPermission = await queryReplayFolderPermission(selection.directoryHandle);
  if (replayFolderPermission !== "granted") {
    replayFolderFileNames = [];
    renderReplayOptions();
    syncControls();
    const fileText = rememberedReplayFileName ? ` and load ${rememberedReplayFileName}` : "";
    statusText.textContent = `Reconnect ${folderLabel(selection.directoryHandle)} to list replays${fileText}.`;
    viewerEmpty.textContent = "Reconnect the saved replay folder to load browser-local replay data.";
    setReplayControlsOpen(true);
    return;
  }

  await refreshReplayFolder({
    autoloadRememberedSelection: Boolean(rememberedReplayFileName),
    ...(rememberedReplayFileName
      ? {
        missingSelectionMessage:
          `${rememberedReplayFileName} is no longer in ${folderLabel(selection.directoryHandle)}. ` +
          "Choose a listed replay."
      }
      : {})
  });
}

async function chooseReplayFolder(): Promise<void> {
  const picker = window.showDirectoryPicker;
  if (!picker) {
    fileInput.click();
    return;
  }

  setReplayControlsOpen(true);
  clearError();
  statusText.textContent = "Choose the folder containing your .aoe2record files.";
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker.call(window, { id: "aoe-sim-replays", mode: "read" });
  } catch (error: unknown) {
    if (isPickerCancellation(error)) {
      statusText.textContent = "Folder selection cancelled. No replay changed.";
      return;
    }
    throw error;
  }

  const permission = await queryReplayFolderPermission(handle);
  await writeReplayFolderSelection({ directoryHandle: handle, selectedFileName: null });
  replayFolderHandle = handle;
  replayFolderPermission = permission;
  rememberedReplayFileName = "";
  replayFolderFileNames = [];
  if (permission !== "granted") {
    renderReplayOptions();
    syncControls();
    statusText.textContent = `Reconnect ${folderLabel(handle)} to list replay files.`;
    viewerEmpty.textContent = "Reconnect the selected replay folder to load browser-local replay data.";
    return;
  }

  await refreshReplayFolder({ autoloadRememberedSelection: false });
}

async function reconnectReplayFolder(): Promise<void> {
  const handle = replayFolderHandle;
  if (!handle) {
    statusText.textContent = "Choose a replay folder first.";
    return;
  }

  setReplayControlsOpen(true);
  clearError();
  statusText.textContent = `Requesting permission for ${folderLabel(handle)}.`;
  replayFolderPermission = await requestReplayFolderPermission(handle);
  if (replayFolderPermission !== "granted") {
    replayFolderFileNames = [];
    renderReplayOptions();
    syncControls();
    statusText.textContent = `Permission was not granted. Reconnect ${folderLabel(handle)} to list replays.`;
    viewerEmpty.textContent = "Reconnect the saved replay folder to load browser-local replay data.";
    return;
  }

  await refreshReplayFolder({
    autoloadRememberedSelection: Boolean(rememberedReplayFileName),
    ...(rememberedReplayFileName
      ? {
        missingSelectionMessage:
          `${rememberedReplayFileName} is no longer in ${folderLabel(handle)}. Choose a listed replay.`
      }
      : {})
  });
}

async function refreshReplayFolder(options: ReplayFolderRefreshOptions): Promise<void> {
  const handle = replayFolderHandle;
  if (!handle) {
    renderReplayOptions();
    syncControls();
    statusText.textContent = "Choose a replay folder to list .aoe2record files, or load Glade explicitly.";
    return;
  }

  statusText.textContent = `Scanning direct child .aoe2record files in ${folderLabel(handle)}.`;
  replayFolderFileNames = await listReplayFolderFileNames(handle);
  if (rememberedReplayFileName && !replayFolderFileNames.includes(rememberedReplayFileName)) {
    await clearMissingReplaySelection(
      rememberedReplayFileName,
      options.missingSelectionMessage ??
        `${rememberedReplayFileName} is no longer in ${folderLabel(handle)}. Choose a listed replay.`
    );
    return;
  }

  renderReplayOptions();
  syncControls();
  if (options.autoloadRememberedSelection && rememberedReplayFileName) {
    await loadReplayFromFolder(rememberedReplayFileName, { persistSelection: false });
    return;
  }
  if (replayFolderFileNames.length === 0) {
    statusText.textContent =
      `Connected to ${folderLabel(handle)}, but no direct child .aoe2record files were found. ` +
      "Choose another folder or load Glade explicitly.";
    viewerEmpty.textContent = "Choose another replay folder or load Glade explicitly.";
    return;
  }

  statusText.textContent = `Connected to ${folderLabel(handle)}. Choose a replay to preprocess.`;
  viewerEmpty.textContent = "Choose a .aoe2record from the connected replay folder.";
}

async function loadReplayFromFolder(
  fileName: string,
  options: { readonly persistSelection?: boolean } = {}
): Promise<void> {
  const handle = replayFolderHandle;
  if (!handle) {
    throw new Error("Choose a replay folder before selecting a replay.");
  }
  assertReplayBasename(fileName);
  rememberedReplayFileName = fileName;
  if (options.persistSelection !== false) {
    await writeReplayFolderSelection({ directoryHandle: handle, selectedFileName: fileName });
  }
  replayFolderPermission = await queryReplayFolderPermission(handle);
  if (replayFolderPermission !== "granted") {
    renderReplayOptions();
    syncControls();
    statusText.textContent = `Reconnect ${folderLabel(handle)} to load ${fileName}.`;
    viewerEmpty.textContent = "Reconnect the saved replay folder to load browser-local replay data.";
    return;
  }

  renderReplayOptions();
  syncControls();

  let file: File;
  try {
    const fileHandle = await handle.getFileHandle(fileName);
    file = await fileHandle.getFile();
  } catch (error: unknown) {
    if (isMissingFolderEntry(error)) {
      await clearMissingReplaySelection(
        fileName,
        `${fileName} is no longer in ${folderLabel(handle)}. Choose a listed replay.`
      );
      return;
    }
    throw error;
  }

  await startPrecompute(file);
}

async function clearMissingReplaySelection(fileName: string, message: string): Promise<void> {
  const handle = replayFolderHandle;
  rememberedReplayFileName = "";
  if (handle) {
    await writeReplayFolderSelection({ directoryHandle: handle, selectedFileName: null });
    replayFolderFileNames = await listReplayFolderFileNames(handle);
  }
  renderReplayOptions();
  syncControls();
  setReplayControlsOpen(true);
  statusText.textContent = message;
  viewerEmpty.textContent = "Choose a valid replay from the connected folder.";
  if (replaySelect.value === fileName) {
    replaySelect.value = "";
  }
}

async function listReplayFolderFileNames(handle: FileSystemDirectoryHandle): Promise<readonly string[]> {
  const names: string[] = [];
  try {
    for await (const [name, childHandle] of handle.entries()) {
      if (childHandle.kind === "file" && isSupportedReplayFileName(name)) {
        names.push(name);
      }
    }
  } catch (error: unknown) {
    if (isPermissionFailure(error)) {
      replayFolderPermission = "prompt";
      renderReplayOptions();
      syncControls();
      throw new Error(`Reconnect ${folderLabel(handle)} before listing replay files.`);
    }
    throw error;
  }
  return names.sort(compareReplayFileNames);
}

function renderReplayOptions(): void {
  replaySelect.replaceChildren();
  if (!folderPickerSupported || !replayFolderHandle) {
    replaySelect.append(optionElement("", "Choose a replay folder first", true));
    replaySelect.value = "";
    return;
  }
  if (replayFolderPermission !== "granted") {
    replaySelect.append(optionElement("", "Reconnect replay folder to list replays", true));
    replaySelect.value = "";
    return;
  }
  if (replayFolderFileNames.length === 0) {
    replaySelect.append(optionElement("", "No .aoe2record files in this folder", true));
    replaySelect.value = "";
    return;
  }

  replaySelect.append(optionElement("", "Choose replay", true));
  for (const fileName of replayFolderFileNames) {
    replaySelect.append(optionElement(fileName, fileName, false));
  }
  replaySelect.value = replayFolderFileNames.includes(rememberedReplayFileName) ? rememberedReplayFileName : "";
}

function optionElement(value: string, label: string, disabled: boolean): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  return option;
}

async function queryReplayFolderPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  if (typeof handle.queryPermission !== "function") {
    return "granted";
  }
  return handle.queryPermission({ mode: "read" });
}

async function requestReplayFolderPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  if (typeof handle.requestPermission !== "function") {
    return "granted";
  }
  return handle.requestPermission({ mode: "read" });
}

function assertReplayBasename(fileName: string): void {
  if (!fileName || /[\\/]/.test(fileName) || !isSupportedReplayFileName(fileName)) {
    throw new Error("Choose a listed .aoe2record file from the connected folder.");
  }
}

function isSupportedReplayFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".aoe2record");
}

function compareReplayFileNames(left: string, right: string): number {
  return replayNameCollator.compare(left, right) || left.localeCompare(right, "en-US");
}

function folderLabel(handle: FileSystemDirectoryHandle): string {
  return handle.name ? `folder "${handle.name}"` : "the replay folder";
}

function isPickerCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isMissingFolderEntry(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError");
}

function isPermissionFailure(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
}

async function loadDefaultRecording(): Promise<void> {
  resetSelection("Loading the sanitized Glade replay.");
  replaySelect.value = "";
  viewerEmpty.textContent = "The sanitized Glade recording is loading.";
  setBusy(true);
  const requestId = `dataview-default-${Date.now()}-${++requestOrdinal}`;
  activeRequestId = requestId;

  try {
    const url = new URL(defaultRecordingUrl);
    url.searchParams.set("sha256", defaultRecordingSha256);
    const response = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(`Default Glade replay returned HTTP ${response.status}.`);
    }
    const buffer = await response.arrayBuffer();
    if (activeRequestId !== requestId) {
      return;
    }
    if (buffer.byteLength !== defaultRecordingSize) {
      throw new Error(
        `Default Glade replay size mismatch: expected ${defaultRecordingSize}, received ${buffer.byteLength}.`
      );
    }
    const sha256 = await sha256Hex(buffer);
    if (activeRequestId !== requestId) {
      return;
    }
    if (sha256 !== defaultRecordingSha256) {
      throw new Error("Default Glade replay failed its SHA-256 integrity check.");
    }
    await startPrecompute(new File([buffer], "glade-default.aoe2record", {
      type: "application/octet-stream",
      lastModified: 0
    }));
  } catch (error: unknown) {
    if (activeRequestId === requestId) {
      showError(error);
    }
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function startPrecompute(file: File): Promise<void> {
  setReplayControlsOpen(true);
  cancelActiveWork("Preparing local replay preprocessing.");
  resetViewer();
  viewerEmpty.textContent = "Recording is preprocessing in this browser worker.";
  resetProgress();
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
  progressBar.hidden = true;
  progressList.hidden = true;
  createViewerIframe(payload, viewerNonce);
  shell.dataset.viewerLoaded = "true";
  setReplayControlsOpen(false);
  sendViewerShellScrollState();
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
  if (!outputNames.has("unit_stats.json")) {
    throw new Error("Preprocessor did not calculate unit_stats.json for this replay.");
  }
  if (!outputNames.has("gameplay_timeline.json")) {
    throw new Error("Preprocessor did not calculate gameplay_timeline.json for this replay.");
  }
  assertDataviewGeneratedJsonTotalByteLength(totalBytes);
}

function createViewerIframe(payload: DataviewViewerPayload, nonce: string): void {
  resetViewer();
  const iframe = document.createElement("iframe");
  const viewerUrl = new URL(viewerPageUrl);
  viewerUrl.hash = new URLSearchParams({ requestId: payload.requestId, nonce }).toString();
  iframe.title = viewerFrameTitle;
  iframe.src = viewerUrl.href;
  iframe.referrerPolicy = "no-referrer";
  iframe.sandbox.add("allow-scripts");
  viewerIframe = iframe;
  activeViewerIdentity = { requestId: payload.requestId, nonce };
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
  sendViewerShellScrollState();
}

function handleViewerShellScrollRequest(event: MessageEvent<DataviewViewerShellScrollRequest>): void {
  const identity = activeViewerIdentity;
  const iframeWindow = viewerIframe?.contentWindow;
  const message = event.data;
  if (
    !identity ||
    !iframeWindow ||
    event.source !== iframeWindow ||
    !message ||
    message.type !== DATAVIEW_VIEWER_SHELL_SCROLL_REQUEST_TYPE ||
    message.requestId !== identity.requestId ||
    message.nonce !== identity.nonce ||
    !Number.isFinite(message.deltaY)
  ) {
    return;
  }
  const scrollMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo(0, Math.max(0, Math.min(scrollMax, window.scrollY + message.deltaY)));
  sendViewerShellScrollState();
}

function handleViewerRenderState(event: MessageEvent<DataviewViewerRenderStateMessage>): void {
  const identity = activeViewerIdentity;
  const iframe = viewerIframe;
  const iframeWindow = iframe?.contentWindow;
  const message = event.data;
  if (
    !identity ||
    !iframeWindow ||
    event.source !== iframeWindow ||
    !message ||
    message.type !== DATAVIEW_VIEWER_RENDER_STATE_TYPE ||
    message.requestId !== identity.requestId ||
    message.nonce !== identity.nonce ||
    !Number.isFinite(message.seconds) ||
    !Number.isFinite(message.durationSeconds)
  ) {
    return;
  }

  const finalDelta = Math.abs(message.seconds - message.durationSeconds);
  iframe.dataset.initialTimelineSeconds = String(message.seconds);
  iframe.dataset.initialTimelineDurationSeconds = String(message.durationSeconds);
  iframe.dataset.initialTimelinePlaying = String(message.playing);
  iframe.dataset.initialTimelineState =
    finalDelta < 0.001 && !message.playing ? "paused-final" : "unexpected";
}

function sendViewerShellScrollState(): void {
  const identity = activeViewerIdentity;
  const iframeWindow = viewerIframe?.contentWindow;
  if (!identity || !iframeWindow) {
    return;
  }
  const message: DataviewViewerShellScrollState = {
    type: DATAVIEW_VIEWER_SHELL_SCROLL_STATE_TYPE,
    requestId: identity.requestId,
    nonce: identity.nonce,
    scrollTop: window.scrollY,
    scrollMax: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    shellControlsHeight: shellControlsHeight()
  };
  iframeWindow.postMessage(message, "*");
}

function shellControlsHeight(): number {
  uploadPanel.dataset.shellControlsHeight = "0";
  return 0;
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
  errorText.hidden = true;
  errorText.textContent = "";
}

function resetViewer(): void {
  clearPendingViewerTransfer();
  activeViewerIdentity = undefined;
  delete shell.dataset.viewerLoaded;
  viewerIframe?.remove();
  viewerIframe = undefined;
  viewerEmpty.hidden = false;
}

function clearPendingViewerTransfer(): void {
  pendingViewerTransfer = undefined;
  removeViewerReadyListener();
}

function resetProgress(): void {
  progressBar.hidden = false;
  progressList.hidden = false;
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

function showIdlePrompt(): void {
  setBusy(false);
  progressBar.hidden = true;
  progressList.hidden = true;
  if (folderPickerSupported) {
    statusText.textContent = "Choose a replay folder to list .aoe2record files, or load Glade explicitly.";
    viewerEmpty.textContent = "Choose a replay folder to list .aoe2record files, or load Glade explicitly.";
    renderReplayOptions();
    syncControls();
    return;
  }
  statusText.textContent = "Choose a local .aoe2record file, or load Glade explicitly.";
  viewerEmpty.textContent = "Choose a local .aoe2record file, or load Glade explicitly.";
}

function setBusy(nextBusy: boolean): void {
  isBusy = nextBusy;
  syncControls();
}

function syncControls(): void {
  cancelButton.disabled = controlsBlocked || !isBusy;
  defaultLoadButton.disabled = controlsBlocked || isBusy;

  if (folderPickerSupported) {
    fileControl.hidden = true;
    fileInput.disabled = true;
    replaySelectControl.hidden = false;
    chooseButton.textContent = replayFolderHandle ? "Change replay folder" : "Choose replay folder";
    chooseButton.disabled = controlsBlocked || isBusy;
    const needsReconnect = Boolean(replayFolderHandle) && replayFolderPermission !== "granted";
    reconnectButton.hidden = !needsReconnect;
    reconnectButton.disabled = controlsBlocked || isBusy || !needsReconnect;
    replaySelect.disabled =
      controlsBlocked ||
      isBusy ||
      !replayFolderHandle ||
      replayFolderPermission !== "granted" ||
      replayFolderFileNames.length === 0;
    return;
  }

  replaySelectControl.hidden = true;
  replaySelect.disabled = true;
  reconnectButton.hidden = true;
  reconnectButton.disabled = true;
  fileControl.hidden = false;
  fileInput.disabled = controlsBlocked || isBusy;
  chooseButton.textContent = "Choose replay file";
  chooseButton.disabled = controlsBlocked || isBusy;
}

function showError(error: unknown): void {
  showWorkflowError(error, "Preprocessing failed.");
}

function showWorkflowError(error: unknown, statusMessage: string): void {
  setReplayControlsOpen(true);
  cancelActiveWork(statusMessage);
  const message = error instanceof Error ? error.message : String(error);
  errorText.textContent = message;
  errorText.hidden = false;
}

function setReplayControlsOpen(
  open: boolean,
  options: { readonly moveFocus?: boolean; readonly restoreFocus?: boolean } = {}
): void {
  const wasOpen = !uploadPanel.hidden;
  if (open === wasOpen) {
    if (open && options.moveFocus) {
      settingsClose.focus({ preventScroll: true });
    }
    return;
  }

  if (open) {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    settingsReturnFocus = activeElement && activeElement !== document.body ? activeElement : settingsToggle;
    uploadPanel.hidden = false;
    settingsToggle.setAttribute("aria-expanded", "true");
    settingsToggle.tabIndex = -1;
    shell.dataset.settingsDrawerOpen = "true";
    if (options.moveFocus) {
      requestAnimationFrame(() => settingsClose.focus({ preventScroll: true }));
    }
  } else {
    uploadPanel.hidden = true;
    settingsToggle.setAttribute("aria-expanded", "false");
    settingsToggle.removeAttribute("tabindex");
    delete shell.dataset.settingsDrawerOpen;
    if (options.restoreFocus && settingsReturnFocus?.isConnected) {
      settingsReturnFocus.focus({ preventScroll: true });
    }
    settingsReturnFocus = undefined;
  }
  sendViewerShellScrollState();
}

function handleReplayControlsKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    setReplayControlsOpen(false, { restoreFocus: true });
    return;
  }
  if (event.key !== "Tab") {
    return;
  }

  const focusable = replayControlsFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    uploadPanel.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function replayControlsFocusableElements(): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");
  return [...uploadPanel.querySelectorAll<HTMLElement>(selector)].filter(isFocusableElement);
}

function isFocusableElement(element: HTMLElement): boolean {
  if (element.hidden) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

function clearError(): void {
  errorText.hidden = true;
  errorText.textContent = "";
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
