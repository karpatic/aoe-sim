import type {
  PlaybackRenderFrame,
  ReplayScenarioV1,
  RulesetV1,
  SimTimeMs,
  SimulationDiagnostics,
  WorldSnapshot
} from "./replay/model";

export type RequestId = string;

export type ClientToWorker =
  | {
      readonly type: "initialize";
      readonly requestId: RequestId;
      readonly scenario: ReplayScenarioV1;
      readonly ruleset: RulesetV1;
    }
  | {
      readonly type: "play";
      readonly requestId: RequestId;
      readonly fromTimeMs?: SimTimeMs;
      readonly speed?: number;
    }
  | {
      readonly type: "pause";
      readonly requestId: RequestId;
    }
  | {
      readonly type: "seek";
      readonly requestId: RequestId;
      readonly timeMs: SimTimeMs;
    }
  | {
      readonly type: "step";
      readonly requestId: RequestId;
      readonly deltaMs?: SimTimeMs;
    }
  | {
      readonly type: "snapshot";
      readonly requestId: RequestId;
    }
  | {
      readonly type: "diagnostics";
      readonly requestId: RequestId;
    };

export type WorkerToClient =
  | {
      readonly type: "ready";
      readonly requestId: RequestId;
      readonly snapshot: WorldSnapshot;
      readonly diagnostics: SimulationDiagnostics;
    }
  | {
      readonly type: "ack";
      readonly requestId: RequestId;
      readonly command: ClientToWorker["type"];
      readonly diagnostics: SimulationDiagnostics;
    }
  | {
      readonly type: "snapshot";
      readonly requestId?: RequestId;
      readonly snapshot: WorldSnapshot;
      readonly diagnostics: SimulationDiagnostics;
    }
  | {
      readonly type: "playback-frame";
      readonly frame: PlaybackRenderFrame;
    }
  | {
      readonly type: "diagnostics";
      readonly requestId: RequestId;
      readonly diagnostics: SimulationDiagnostics;
    }
  | {
      readonly type: "error";
      readonly requestId?: RequestId;
      readonly message: string;
    };
