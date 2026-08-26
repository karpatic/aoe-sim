export type EvidenceClass = "observed" | "simulated" | "reconciled";
export type EntityId = string;
export type PlayerId = string;
export type SimTimeMs = number;
export type FixedPoint = number;
export type ResourceKind = "food" | "wood" | "stone" | "gold";

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
  readonly source: "point" | "action-position" | "payload-point" | "wall-end";
  readonly evidence: EvidenceClass;
  readonly isMapCoordinate: boolean;
}

export type CommandParameterValue = string | number | boolean;

export interface MoveCommand extends ReplayCommandBase {
  readonly kind: "move";
  readonly rawKind?: string;
  readonly intentDestination: CommandDestination;
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
  readonly id?: number;
  readonly kind: string;
  readonly label?: string;
  readonly labels?: RulesetLabels;
  readonly type?: number;
  readonly typeName?: string;
  readonly classId?: number;
  readonly baseId?: number;
  readonly copyId?: number;
  readonly maxHp: number;
  readonly speedFpPerSecond: number;
  readonly radiusTiles: number;
  readonly token: "scout" | "villager" | "marker" | "resource";
  readonly movement?: JsonRecord;
  readonly collision?: JsonRecord;
  readonly economy?: JsonRecord;
  readonly combat?: JsonRecord;
  readonly projectile?: JsonRecord;
  readonly production?: JsonRecord;
  readonly building?: JsonRecord;
  readonly rawBase?: JsonRecord;
}

export type PathFailureReason =
  | "actor-immobile"
  | "destination-out-of-bounds"
  | "destination-static-blocked"
  | "destination-terrain-blocked"
  | "dynamic-blocked"
  | "no-route"
  | "route-invalidated"
  | "search-limit"
  | "start-out-of-bounds"
  | "start-static-blocked"
  | "start-terrain-blocked";

export interface RulesetTerrain {
  readonly id?: number;
  readonly kind: string;
  readonly color: string;
  readonly passable: boolean;
  readonly labels?: RulesetLabels;
  readonly raw?: JsonRecord;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonRecord | JsonValue[];
export interface JsonRecord {
  readonly [key: string]: JsonValue;
}

export interface RulesetLabels {
  readonly localizedName?: string;
  readonly internalName?: string;
  readonly languageDllName?: number;
  readonly [key: string]: string | number | undefined;
}

export interface RulesetFidelity {
  readonly status: "exact-build" | "mapped-build" | "current-rules-approximation";
  readonly reason: string;
  readonly replayEvidence?: JsonRecord;
  readonly sourceEvidence?: JsonRecord;
  readonly auditNotes?: readonly string[];
  readonly unsupportedClaim?: string;
}

export interface RulesetDiagnosticsSummary {
  readonly counts?: Record<string, number>;
  readonly unresolved?: JsonRecord;
  readonly fieldCoverage?: JsonRecord;
}

export interface RulesetGeneratedArtifact extends ArtifactReference {
  readonly semanticSha256?: string;
}

export interface RulesetV1 {
  readonly schemaVersion: "aoe-sim.ruleset.v1";
  readonly rulesetId: string;
  readonly displayName?: string;
  readonly sourceBuild: string;
  readonly datVersion?: string;
  readonly fidelity?: RulesetFidelity;
  readonly fixedPointScale: number;
  readonly stepMs: SimTimeMs;
  readonly terrain: readonly RulesetTerrain[];
  readonly terrainRestrictions?: readonly JsonRecord[];
  readonly units: readonly RulesetUnit[];
  readonly technologies?: readonly JsonRecord[];
  readonly effects?: readonly JsonRecord[];
  readonly civilizations?: readonly JsonRecord[];
  readonly techTree?: JsonRecord;
  readonly entityIndex?: JsonRecord;
  readonly diagnostics?: RulesetDiagnosticsSummary;
  readonly provenance: {
    readonly dat: ArtifactReference;
    readonly localization?: ArtifactReference;
    readonly appmanifest?: ArtifactReference & {
      readonly steamAppId?: number | string;
      readonly steamBuildId?: string;
      readonly steamLastUpdatedUnix?: number | string;
      readonly mtimeUtc?: string;
    };
    readonly parser?: ParserReference;
    readonly extractor: ArtifactReference;
    readonly generatedArtifact?: RulesetGeneratedArtifact;
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
  readonly kind: "idle" | "moving" | "path-failed" | "gathering" | "dropping-off" | "building";
  readonly commandId?: string;
  readonly targetId?: EntityId;
  readonly resource?: ResourceKind;
  readonly destination?: {
    readonly x: number;
    readonly y: number;
    readonly xFp: FixedPoint;
    readonly yFp: FixedPoint;
  };
  readonly evidence: EvidenceClass;
  readonly route?: SnapshotRoute;
}

export interface SnapshotCarry {
  readonly resource?: ResourceKind;
  readonly amount: number;
  readonly amountFp: FixedPoint;
  readonly capacity: number;
  readonly capacityFp: FixedPoint;
  readonly evidence: EvidenceClass;
}

export interface SnapshotWorkerState {
  readonly kind: "gather" | "build";
  readonly phase:
    | "to-resource"
    | "gathering"
    | "to-drop-site"
    | "dropping-off"
    | "to-foundation"
    | "building"
    | "stalled";
  readonly commandId: string;
  readonly targetId?: EntityId;
  readonly dropSiteId?: EntityId;
  readonly resource?: ResourceKind;
  readonly evidence: EvidenceClass;
  readonly retargetCount?: number;
}

export interface SnapshotResourceNode {
  readonly id: EntityId;
  readonly resource: ResourceKind;
  readonly family: string;
  readonly initialAmount: number;
  readonly initialAmountFp: FixedPoint;
  readonly remainingAmount: number;
  readonly remainingAmountFp: FixedPoint;
  readonly extractedAmount: number;
  readonly extractedAmountFp: FixedPoint;
  readonly depleted: boolean;
  readonly depletionTimeMs?: SimTimeMs;
  readonly amountSource: "ruleset" | "scenario-default" | "farm-generation";
  readonly farmGeneration?: number;
  readonly evidence: EvidenceClass;
}

export interface SnapshotConstruction {
  readonly state: "foundation" | "complete";
  readonly progress: number;
  readonly progressFp: FixedPoint;
  readonly requiredWorkFp: FixedPoint;
  readonly startedAtMs: SimTimeMs;
  readonly completedAtMs?: SimTimeMs;
  readonly builderIds: readonly EntityId[];
  readonly evidence: EvidenceClass;
}

export interface SnapshotResourceCost {
  readonly resource: ResourceKind | "population-headroom";
  readonly amount: number;
  readonly amountFp: FixedPoint;
}

export interface SnapshotProductionItem {
  readonly id: string;
  readonly unitId: number;
  readonly unitKind: string;
  readonly remainingMs: SimTimeMs;
  readonly trainTimeMs: SimTimeMs;
  readonly cost: readonly SnapshotResourceCost[];
  readonly evidence: EvidenceClass;
}

export interface SnapshotProduction {
  readonly queue: readonly SnapshotProductionItem[];
  readonly gatherPoint?: {
    readonly targetId?: EntityId;
    readonly resource?: ResourceKind;
    readonly x: number;
    readonly y: number;
    readonly evidence: EvidenceClass;
  };
  readonly spawnOrdinal: number;
}

export interface SnapshotResourceLedger {
  readonly baselineFp: FixedPoint;
  readonly extractedFp: FixedPoint;
  readonly depositedFp: FixedPoint;
  readonly spentFp: FixedPoint;
  readonly refundedFp: FixedPoint;
  readonly stockpileFp: FixedPoint;
  readonly carryingFp: FixedPoint;
}

export interface SnapshotPlayerEconomy {
  readonly playerId: PlayerId;
  readonly stockpile: Record<ResourceKind, number>;
  readonly stockpileFp: Record<ResourceKind, FixedPoint>;
  readonly ledger: Record<ResourceKind, SnapshotResourceLedger>;
  readonly population: {
    readonly used: number;
    readonly reserved: number;
    readonly capacity: number;
  };
  readonly evidence: EvidenceClass;
}

export interface SnapshotEconomySummary {
  readonly players: readonly SnapshotPlayerEconomy[];
  readonly resourceNodes: readonly SnapshotResourceNode[];
  readonly activeWorkers: number;
  readonly carryingWorkers: number;
  readonly depletedNodes: number;
  readonly constructionSites: number;
  readonly productionQueueItems: number;
  readonly conservation: {
    readonly balanced: boolean;
    readonly firstIssue?: string;
  };
  readonly firstDivergence?: {
    readonly timeMs: SimTimeMs;
    readonly commandId?: string;
    readonly reason: string;
  };
  readonly notes: readonly string[];
}

export interface SnapshotWaypoint {
  readonly x: number;
  readonly y: number;
  readonly xFp: FixedPoint;
  readonly yFp: FixedPoint;
  readonly tileX: number;
  readonly tileY: number;
}

export interface SnapshotRoute {
  readonly commandId: string;
  readonly status: "planned" | "completed" | "failed";
  readonly plannedAtMs: SimTimeMs;
  readonly staticVersion: number;
  readonly terrainRestrictionId?: number;
  readonly actorRadiusTiles: number;
  readonly nextWaypointIndex: number;
  readonly waypoints: readonly SnapshotWaypoint[];
  readonly pathNodeCount: number;
  readonly searchedNodeCount: number;
  readonly failureReason?: PathFailureReason;
  readonly failureDetail?: string;
  readonly lastCorrection?: {
    readonly timeMs: SimTimeMs;
    readonly reason: "dynamic-blocked" | "static-blocked" | "route-invalidated";
    readonly blockerId?: EntityId;
    readonly tileX?: number;
    readonly tileY?: number;
  };
}

export interface SnapshotPathingSummary {
  readonly occupancyVersion: number;
  readonly staticBlockedTiles: number;
  readonly activeRoutes: number;
  readonly failedRoutes: number;
}

export interface RouteDiagnostics {
  readonly planned: number;
  readonly completed: number;
  readonly failed: number;
  readonly replanned: number;
  readonly corrected: number;
  readonly unresolvedActors: number;
  readonly active: number;
  readonly failedActive: number;
  readonly staticBlockedTiles: number;
  readonly occupancyVersion: number;
  readonly lastEvents: readonly string[];
}

export interface EconomyDiagnostics {
  readonly handledIntentCount: number;
  readonly gatherCommands: number;
  readonly buildCommands: number;
  readonly queueCommands: number;
  readonly gatherPointCommands: number;
  readonly unresolvedActors: number;
  readonly unresolvedTargets: number;
  readonly unsupportedIntents: number;
  readonly activeWorkers: number;
  readonly carryingWorkers: number;
  readonly stockpileSummary: string;
  readonly ledgerSummary: string;
  readonly depletedNodes: number;
  readonly constructionSites: number;
  readonly completedConstruction: number;
  readonly productionQueueItems: number;
  readonly spawnedUnits: number;
  readonly conservationBalanced: boolean;
  readonly firstDivergence?: {
    readonly timeMs: SimTimeMs;
    readonly commandId?: string;
    readonly reason: string;
  };
  readonly lastEvents: readonly string[];
}

export interface EntitySnapshot {
  readonly id: EntityId;
  readonly kind: string;
  readonly dataId?: number;
  readonly classId?: number;
  readonly label?: string;
  readonly playerId: PlayerId;
  readonly hp: number;
  readonly facing: -1 | 1;
  readonly radiusTiles: number;
  readonly position: SnapshotPosition;
  readonly task: SnapshotTask;
  readonly carry?: SnapshotCarry;
  readonly worker?: SnapshotWorkerState;
  readonly resourceNode?: SnapshotResourceNode;
  readonly construction?: SnapshotConstruction;
  readonly production?: SnapshotProduction;
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
  readonly pathing: SnapshotPathingSummary;
  readonly economy: SnapshotEconomySummary;
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
  readonly routes: RouteDiagnostics;
  readonly economy: EconomyDiagnostics;
  readonly lastSeekRepeat?: {
    readonly timeMs: SimTimeMs;
    readonly checksum: string;
    readonly stable: boolean;
  };
  readonly warnings: readonly string[];
}
