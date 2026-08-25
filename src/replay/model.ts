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

export interface MapTileGrid {
  readonly encoding: "row-major-terrain-elevation-v1";
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly terrainIds: readonly number[];
  readonly elevations: readonly number[];
  readonly passability: "unresolved";
}

export interface MapBounds {
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly sourceMapId?: number;
  readonly name?: string;
  readonly size?: string;
  readonly tileGrid?: MapTileGrid;
}

export interface PlayerDefinition {
  readonly id: PlayerId;
  readonly name: string;
  readonly team: number;
  readonly color: string;
  readonly playerNumber?: number;
  readonly colorId?: number;
  readonly civilization?: string;
  readonly civilizationId?: number;
  readonly profileId?: number;
  readonly startPosition?: {
    readonly x: number;
    readonly y: number;
  };
}

export interface TeamDefinition {
  readonly id: string;
  readonly playerIds: readonly PlayerId[];
  readonly sourceTeamIds: readonly number[];
}

export interface InitialEntity {
  readonly id: EntityId;
  readonly kind: string;
  readonly playerId: PlayerId;
  readonly hp: number | null;
  readonly position: EvidencePoint;
  readonly evidence: EvidenceClass;
  readonly dataId?: number;
  readonly classId?: number;
  readonly sourceInstanceId?: number;
  readonly sourceIndex?: number;
  readonly label?: string;
}

export interface ReplayCommandBase {
  readonly id: string;
  readonly issuedAtMs: SimTimeMs;
  readonly sourceSequence: number;
  readonly sourceIndex?: number;
  readonly playerId?: PlayerId;
  readonly actorIds: readonly EntityId[];
  readonly sourceActorIds?: readonly number[];
  readonly evidence: EvidenceClass;
  readonly rawKind?: string;
}

export interface CommandDestination {
  readonly x: number;
  readonly y: number;
  readonly source: "point" | "wall-end";
  readonly evidence: EvidenceClass;
  readonly isMapCoordinate: boolean;
}

export type CommandParameterValue = string | number | boolean;

export interface MoveCommand extends ReplayCommandBase {
  readonly kind: "move";
  readonly intentDestination: {
    readonly x: number;
    readonly y: number;
  };
}

export interface ObservedIntentCommand extends ReplayCommandBase {
  readonly kind: "observed-intent";
  readonly rawKind: string;
  readonly targetId?: EntityId;
  readonly sourceTargetId?: number;
  readonly destination?: CommandDestination;
  readonly parameters?: Record<string, CommandParameterValue>;
}

export type ReplayCommand = MoveCommand | ObservedIntentCommand;

export interface ArtifactReference {
  readonly id: string;
  readonly sha256: string;
  readonly sizeBytes?: number;
}

export interface ParserReference extends ArtifactReference {
  readonly project?: string;
  readonly distribution?: string;
  readonly version?: string;
  readonly commit?: string;
  readonly sourceUrl?: string;
  readonly aocrefVersion?: string;
}

export interface ScenarioProvenance {
  readonly replay: ArtifactReference;
  readonly gameJson: ArtifactReference;
  readonly parser: ParserReference;
  readonly ruleset: ArtifactReference;
  readonly importer: ArtifactReference;
  readonly generatedArtifact: ArtifactReference;
}

export interface ScenarioVersions {
  readonly replayVersion?: string;
  readonly gameVersion?: string;
  readonly saveVersion?: number;
  readonly logVersion?: number;
  readonly buildVersion?: number;
  readonly dataset?: string;
  readonly datasetId?: number;
}

export interface ScenarioUnsupported {
  readonly commandKinds: Record<string, number>;
  readonly commandCount: number;
  readonly implementedCommandKinds: readonly string[];
  readonly unresolved: readonly string[];
}

export interface ReplayScenarioV1 {
  readonly schemaVersion: "aoe-sim.scenario.v1";
  readonly scenarioId: string;
  readonly displayName: string;
  readonly durationMs: SimTimeMs;
  readonly versions: ScenarioVersions;
  readonly map: MapBounds;
  readonly players: readonly PlayerDefinition[];
  readonly teams: readonly TeamDefinition[];
  readonly entities: readonly InitialEntity[];
  readonly commands: readonly ReplayCommand[];
  readonly randomSeeds: readonly number[];
  readonly unsupported: ScenarioUnsupported;
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
  readonly observedIntentIds: readonly string[];
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
  readonly observedIntentCount: number;
  readonly unsupportedCommandCount: number;
  readonly seed: number;
  readonly lastSeekRepeat?: {
    readonly timeMs: SimTimeMs;
    readonly checksum: string;
    readonly stable: boolean;
  };
  readonly warnings: readonly string[];
}
