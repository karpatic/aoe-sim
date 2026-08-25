export type EvidenceClass = "observed" | "simulated" | "reconciled";
export type EntityId = string;
export type PlayerId = string;
export type SimTimeMs = number;
export type FixedPoint = number;

export interface EvidencePoint {
  readonly x: number;
  readonly y: number;
  readonly evidence: EvidenceClass;
}

export interface MapBounds {
  readonly widthTiles: number;
  readonly heightTiles: number;
}

export interface PlayerDefinition {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: number;
  readonly color: string;
}

export interface InitialEntity {
  readonly id: EntityId;
  readonly kind: string;
  readonly playerId: PlayerId;
  readonly hp: number;
  readonly position: EvidencePoint;
  readonly evidence: EvidenceClass;
}

export interface MoveCommand {
  readonly id: string;
  readonly kind: "move";
  readonly issuedAtMs: SimTimeMs;
  readonly sourceSequence: number;
  readonly actorIds: readonly EntityId[];
  readonly intentDestination: {
    readonly x: number;
    readonly y: number;
  };
  readonly evidence: EvidenceClass;
}

export type ReplayCommand = MoveCommand;

export interface ArtifactReference {
  readonly id: string;
  readonly sha256: string;
}

export interface ScenarioProvenance {
  readonly replay: ArtifactReference;
  readonly parser: ArtifactReference;
  readonly ruleset: ArtifactReference;
  readonly generatedArtifact: ArtifactReference;
}

export interface ReplayScenarioV1 {
  readonly schemaVersion: "aoe-sim.scenario.v1";
  readonly scenarioId: string;
  readonly displayName: string;
  readonly durationMs: SimTimeMs;
  readonly map: MapBounds;
  readonly players: readonly PlayerDefinition[];
  readonly entities: readonly InitialEntity[];
  readonly commands: readonly ReplayCommand[];
  readonly provenance: ScenarioProvenance;
}

export interface RulesetUnit {
  readonly kind: string;
  readonly maxHp: number;
  readonly speedFpPerSecond: number;
  readonly radiusTiles: number;
  readonly token: "scout" | "villager" | "marker" | "resource";
}

export interface RulesetTerrain {
  readonly kind: string;
  readonly color: string;
  readonly passable: boolean;
}

export interface RulesetV1 {
  readonly schemaVersion: "aoe-sim.ruleset.v1";
  readonly rulesetId: string;
  readonly sourceBuild: string;
  readonly fixedPointScale: number;
  readonly stepMs: SimTimeMs;
  readonly terrain: readonly RulesetTerrain[];
  readonly units: readonly RulesetUnit[];
  readonly provenance: {
    readonly dat: ArtifactReference;
    readonly extractor: ArtifactReference;
  };
}

export interface SnapshotPosition {
  readonly x: number;
  readonly y: number;
  readonly xFp: FixedPoint;
  readonly yFp: FixedPoint;
  readonly evidence: EvidenceClass;
}

export interface SnapshotTask {
  readonly kind: "idle" | "moving";
  readonly commandId?: string;
  readonly destination?: {
    readonly x: number;
    readonly y: number;
    readonly xFp: FixedPoint;
    readonly yFp: FixedPoint;
  };
  readonly evidence: EvidenceClass;
}

export interface EntitySnapshot {
  readonly id: EntityId;
  readonly kind: string;
  readonly playerId: PlayerId;
  readonly hp: number;
  readonly facing: -1 | 1;
  readonly radiusTiles: number;
  readonly position: SnapshotPosition;
  readonly task: SnapshotTask;
  readonly evidence: EvidenceClass;
}

export interface WorldSnapshotBody {
  readonly schemaVersion: "aoe-sim.snapshot.v1";
  readonly timeMs: SimTimeMs;
  readonly durationMs: SimTimeMs;
  readonly map: MapBounds;
  readonly players: readonly PlayerDefinition[];
  readonly entities: readonly EntitySnapshot[];
  readonly appliedCommandIds: readonly string[];
  readonly evidenceCounts: Record<EvidenceClass, number>;
  readonly provenance: ScenarioProvenance;
}

export interface WorldSnapshot extends WorldSnapshotBody {
  readonly checksum: string;
}

export interface SimulationDiagnostics {
  readonly schemaVersion: "aoe-sim.diagnostics.v1";
  readonly isPlaying: boolean;
  readonly checksum: string;
  readonly schedulerPending: number;
  readonly schedulerExecuted: number;
  readonly currentTimeMs: SimTimeMs;
  readonly durationMs: SimTimeMs;
  readonly stepMs: SimTimeMs;
  readonly commandCount: number;
  readonly appliedCommandCount: number;
  readonly seed: number;
  readonly lastSeekRepeat?: {
    readonly timeMs: SimTimeMs;
    readonly checksum: string;
    readonly stable: boolean;
  };
  readonly warnings: readonly string[];
}
