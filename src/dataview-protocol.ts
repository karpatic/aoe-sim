export const DATAVIEW_WORKER_REQUEST_TYPE = "aoe-sim.dataview.precompute-request.v1";
export const DATAVIEW_VIEWER_PAYLOAD_TYPE = "aoe-sim.dataview.generated-payload.v1";
export const DATAVIEW_VIEWER_READY_TYPE = "aoe-sim.dataview.viewer-ready.v1";
export const DATAVIEW_VIEWER_SHELL_SCROLL_REQUEST_TYPE = "aoe-sim.dataview.shell-scroll-request.v1";
export const DATAVIEW_VIEWER_SHELL_SCROLL_STATE_TYPE = "aoe-sim.dataview.shell-scroll-state.v1";
export const PINNED_TECH_TREE_SHA256 =
  "4e2f85b39e39078cdee71bdbaf2c36a8f0b50202de4032df7ba8e2c36c6049c4";

export const DATAVIEW_REQUIRED_OUTPUT_NAMES = [
  "game.json",
  "schemas.json",
  "lifetimes.json",
  "economy.json",
  "resource_estimates.json"
] as const;

export const DATAVIEW_OPTIONAL_OUTPUT_NAMES = ["unit_stats.json", "gameplay_timeline.json"] as const;

export type DataviewOutputName =
  | (typeof DATAVIEW_REQUIRED_OUTPUT_NAMES)[number]
  | (typeof DATAVIEW_OPTIONAL_OUTPUT_NAMES)[number];

export type DataviewProgressStage =
  | "validating"
  | "hashing"
  | "verifying-runtime"
  | "loading-pyodide"
  | "loading-python-packages"
  | "loading-pipeline"
  | "extracting-replay"
  | "generating-schemas"
  | "inferring-lifetimes"
  | "generating-economy"
  | "reconstructing-resources"
  | "generating-unit-stats"
  | "generating-gameplay-timeline"
  | "transferring"
  | "done";

export interface DataviewReplaySelection {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface DataviewPrecomputeRequest {
  readonly type: typeof DATAVIEW_WORKER_REQUEST_TYPE;
  readonly requestId: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly lastModified: number;
  readonly runtimeBaseUrl: string;
  readonly buffer: ArrayBuffer;
}

export interface DataviewProgressMessage {
  readonly type: "progress";
  readonly requestId: string;
  readonly stage: DataviewProgressStage;
  readonly message: string;
  readonly completed: number;
  readonly total: number;
}

export interface DataviewErrorMessage {
  readonly type: "error";
  readonly requestId: string;
  readonly message: string;
  readonly stage?: DataviewProgressStage;
}

export interface DataviewGeneratedOutput {
  readonly name: DataviewOutputName;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly source: "pyodide-pipeline" | "per-replay-unit-stats" | "per-replay-gameplay-timeline";
  readonly buffer: ArrayBuffer;
}

export interface DataviewDoneMessage {
  readonly type: "done";
  readonly requestId: string;
  readonly replay: DataviewReplaySelection;
  readonly outputs: readonly DataviewGeneratedOutput[];
  readonly timings: readonly DataviewStageTiming[];
  readonly unitStatsNotice: string;
}

export interface DataviewStageTiming {
  readonly stage: DataviewProgressStage;
  readonly elapsedMs: number;
}

export type DataviewWorkerToClient = DataviewProgressMessage | DataviewErrorMessage | DataviewDoneMessage;

export interface DataviewViewerPayload {
  readonly type: typeof DATAVIEW_VIEWER_PAYLOAD_TYPE;
  readonly requestId: string;
  readonly viewerNonce: string;
  readonly replay: DataviewReplaySelection;
  readonly outputs: readonly DataviewGeneratedOutput[];
  readonly unitStatsNotice: string;
}

export interface DataviewViewerReadyMessage {
  readonly type: typeof DATAVIEW_VIEWER_READY_TYPE;
  readonly requestId: string;
  readonly nonce: string;
}

export interface DataviewViewerShellScrollRequest {
  readonly type: typeof DATAVIEW_VIEWER_SHELL_SCROLL_REQUEST_TYPE;
  readonly requestId: string;
  readonly nonce: string;
  readonly deltaY: number;
}

export interface DataviewViewerShellScrollState {
  readonly type: typeof DATAVIEW_VIEWER_SHELL_SCROLL_STATE_TYPE;
  readonly requestId: string;
  readonly nonce: string;
  readonly scrollTop: number;
  readonly scrollMax: number;
  readonly shellControlsHeight?: number;
}
