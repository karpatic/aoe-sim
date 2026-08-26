import { checksumStable } from "./checksum";
import { PathingState } from "./systems/occupancy";
import { TreeActiveSet } from "./tree-active-set";
import type {
  CommandDestination,
  EntityId,
  EntitySnapshot,
  EconomyDiagnostics,
  EvidenceClass,
  FixedPoint,
  PathFailureReason,
  PlayerId,
  RenderEntitySnapshot,
  RenderResourceNodeSnapshot,
  ReplayScenarioV1,
  ResourceKind,
  RouteDiagnostics,
  RulesetUnit,
  RulesetV1,
  SimTimeMs,
  CombatDiagnostics,
  SnapshotCarry,
  SnapshotCombatEpisode,
  SnapshotCombatSummary,
  SnapshotCombatVectorEntry,
  SnapshotConstruction,
  SnapshotDamageCalculation,
  SnapshotDamageEvent,
  SnapshotEconomySummary,
  SnapshotEntityCombat,
  SnapshotPlayerEconomy,
  SnapshotProduction,
  SnapshotProjectile,
  SnapshotResourceNode,
  SnapshotRoute,
  SnapshotTask,
  TreeActiveSetDiagnostics,
  WorldSnapshot,
  WorldSnapshotBody
} from "../replay/model";

export const FIXED_POINT_SCALE = 1000;

export interface FixedPointPosition {
  xFp: FixedPoint;
  yFp: FixedPoint;
  evidence: EvidenceClass;
}

export interface FixedPointWaypoint {
  readonly xFp: FixedPoint;
  readonly yFp: FixedPoint;
  readonly tileX: number;
  readonly tileY: number;
}

export interface RouteCorrection {
  readonly timeMs: SimTimeMs;
  readonly reason: "dynamic-blocked" | "static-blocked" | "route-invalidated";
  readonly blockerId?: EntityId;
  readonly tileX?: number;
  readonly tileY?: number;
}

export interface PlannedRoute {
  commandId: string;
  status: "planned" | "completed" | "failed";
  plannedAtMs: SimTimeMs;
  staticVersion: number;
  terrainRestrictionId?: number;
  actorRadiusFp: FixedPoint;
  destination: {
    readonly xFp: FixedPoint;
    readonly yFp: FixedPoint;
  };
  sourceSequence: number;
  evidence: EvidenceClass;
  waypoints: FixedPointWaypoint[];
  nextWaypointIndex: number;
  pathNodeCount: number;
  searchedNodeCount: number;
  failureReason?: PathFailureReason;
  failureDetail?: string;
  lastCorrection?: RouteCorrection;
  blockedStepCount: number;
  ignoreDynamicActorIds: readonly EntityId[];
}

export interface EntityPathingProfile {
  readonly terrainRestrictionId?: number;
  readonly flyMode: number;
  readonly collisionRadiusFp: FixedPoint;
  readonly footprintHalfWidthFp: FixedPoint;
  readonly footprintHalfHeightFp: FixedPoint;
  readonly occupancyKind: "none" | "static" | "dynamic";
  readonly obstructionType: number;
  readonly obstructionClass: number;
  readonly canBeBuiltOn: boolean;
  readonly typeName?: string;
  readonly token?: RulesetUnit["token"];
}

export interface WorkerCarryState {
  resource?: ResourceKind;
  amountFp: FixedPoint;
  capacityFp: FixedPoint;
  evidence: EvidenceClass;
}

export interface GatherWorkerTask {
  kind: "gather";
  phase: "to-resource" | "gathering" | "to-drop-site" | "dropping-off" | "stalled";
  commandId: string;
  sourceSequence: number;
  targetId: EntityId;
  resource: ResourceKind;
  family: string;
  evidence: EvidenceClass;
  retargetCount: number;
  workAccumulator: number;
  dropSiteId?: EntityId;
}

export interface BuildWorkerTask {
  kind: "build";
  phase: "to-foundation" | "building" | "stalled";
  commandId: string;
  sourceSequence: number;
  targetId: EntityId;
  evidence: EvidenceClass;
  workAccumulator: number;
}

export type WorkerTaskState = GatherWorkerTask | BuildWorkerTask;

export interface ResourceNodeState {
  id: EntityId;
  resource: ResourceKind;
  family: string;
  initialAmountFp: FixedPoint;
  remainingAmountFp: FixedPoint;
  extractedAmountFp: FixedPoint;
  depleted: boolean;
  amountSource: SnapshotResourceNode["amountSource"];
  evidence: EvidenceClass;
  farmGeneration?: number;
  depletionTimeMs?: SimTimeMs;
}

export interface ConstructionState {
  state: "foundation" | "complete";
  progressFp: FixedPoint;
  requiredWorkFp: FixedPoint;
  startedAtMs: SimTimeMs;
  evidence: EvidenceClass;
  completedAtMs?: SimTimeMs;
}

export interface ProductionQueueItemState {
  id: string;
  unitId: number;
  unitKind: string;
  remainingMs: SimTimeMs;
  trainTimeMs: SimTimeMs;
  cost: readonly ResourceCostState[];
  evidence: EvidenceClass;
}

export interface GatherPointState {
  xFp: FixedPoint;
  yFp: FixedPoint;
  evidence: EvidenceClass;
  targetId?: EntityId;
  resource?: ResourceKind;
}

export interface ProductionState {
  queue: ProductionQueueItemState[];
  spawnOrdinal: number;
  gatherPoint?: GatherPointState;
}

export interface ResourceCostState {
  resource: ResourceKind | "population-headroom";
  amountFp: FixedPoint;
}

export interface ResourceLedgerState {
  baselineFp: FixedPoint;
  extractedFp: FixedPoint;
  depositedFp: FixedPoint;
  spentFp: FixedPoint;
  refundedFp: FixedPoint;
}

export interface EntityLifecycleState {
  state: "alive" | "dead";
  evidence: EvidenceClass;
  deadAtMs?: SimTimeMs;
  killedById?: EntityId;
  deathReason?: "combat";
  reconciledAtMs?: SimTimeMs;
  correctionReason?: string;
  previousDeathAtMs?: SimTimeMs;
}

export interface CombatIntentState {
  commandId: string;
  rawKind: string;
  issuedAtMs: SimTimeMs;
  sourceSequence: number;
  targetId?: EntityId;
  destination?: CommandDestination;
  evidence: EvidenceClass;
  resolution:
    | "resolved-target"
    | "ground-unsupported"
    | "unresolved-actor"
    | "unresolved-target"
    | "unsupported";
  reason?: string;
}

export interface CombatVectorEntryState {
  classId: number;
  amount: number;
}

export interface DamageClassMatchState {
  classId: number;
  attackAmount: number;
  armorAmount: number;
  appliedAmount: number;
}

export interface DamageCalculationState {
  attackerRuleId?: number;
  attackerKind: string;
  targetRuleId?: number;
  targetKind: string;
  attackVector: readonly CombatVectorEntryState[];
  armorVector: readonly CombatVectorEntryState[];
  matches: readonly DamageClassMatchState[];
  skippedAttackClasses: readonly number[];
  rawDamage: number;
  appliedDamage: number;
  minimumDamageApplied: boolean;
}

export interface DamageEventState {
  id: string;
  timeMs: SimTimeMs;
  attackerId: EntityId;
  targetId: EntityId;
  amount: number;
  targetHpBefore: number;
  targetHpAfter: number;
  source: "melee" | "projectile";
  projectileId?: string;
  commandId?: string;
  calculation: DamageCalculationState;
  evidence: EvidenceClass;
}

export interface ActiveCombatState {
  id: string;
  state: SnapshotCombatEpisode["state"];
  targetId?: EntityId;
  targetSource: "command" | "acquired";
  startedAtMs: SimTimeMs;
  lastStateChangeMs: SimTimeMs;
  nextAttackReadyAtMs: SimTimeMs;
  reloadMs: SimTimeMs;
  minRangeFp: FixedPoint;
  maxRangeFp: FixedPoint;
  lastDistanceFp?: FixedPoint;
  inRange?: boolean;
  retargetCount: number;
  routeTargetId?: EntityId;
  unsupportedMechanic?: string;
  lastDamage?: DamageEventState;
}

export interface EntityCombatState {
  intent?: CombatIntentState;
  active?: ActiveCombatState;
  lastDamage?: DamageEventState;
}

export interface CombatProjectileState {
  id: string;
  attackerId: EntityId;
  targetId: EntityId;
  launchedAtMs: SimTimeMs;
  impactAtMs: SimTimeMs;
  startXFp: FixedPoint;
  startYFp: FixedPoint;
  targetXFp: FixedPoint;
  targetYFp: FixedPoint;
  projectileRuleId?: number;
  projectileKind?: string;
  speedFpPerSecond: number;
  commandId?: string;
  damage: DamageCalculationState;
  evidence: EvidenceClass;
}

export interface CombatDivergence {
  timeMs: SimTimeMs;
  reason: string;
  commandId?: string;
}

interface MutableCombatStats {
  observedIntentCount: number;
  resolvedAttackIntents: number;
  unresolvedAttackIntents: number;
  unsupportedIntents: number;
  projectilesLaunched: number;
  projectilesImpacted: number;
  meleeContacts: number;
  damageEvents: number;
  deaths: number;
  reconciliations: number;
  retargets: number;
}

export interface PlayerEconomyState {
  playerId: PlayerId;
  stockpileFp: Record<ResourceKind, FixedPoint>;
  ledger: Record<ResourceKind, ResourceLedgerState>;
  population: {
    used: number;
    reserved: number;
    capacity: number;
  };
  evidence: EvidenceClass;
}

export interface EconomyStats {
  handledIntentCount: number;
  gatherCommands: number;
  buildCommands: number;
  queueCommands: number;
  gatherPointCommands: number;
  unresolvedActors: number;
  unresolvedTargets: number;
  unsupportedIntents: number;
  completedConstruction: number;
  spawnedUnits: number;
}

export interface EconomyDivergence {
  timeMs: SimTimeMs;
  reason: string;
  commandId?: string;
}

export type EntityTask =
  | {
      readonly kind: "idle";
      readonly evidence: EvidenceClass;
    }
  | {
      readonly kind: "moving";
      readonly commandId: string;
      readonly destination: {
        readonly xFp: FixedPoint;
        readonly yFp: FixedPoint;
      };
      readonly evidence: EvidenceClass;
      readonly sourceSequence: number;
      readonly route: PlannedRoute;
    }
  | {
      readonly kind: "path-failed";
      readonly commandId: string;
      readonly destination: {
        readonly xFp: FixedPoint;
        readonly yFp: FixedPoint;
      };
      readonly evidence: EvidenceClass;
      readonly sourceSequence: number;
      readonly route: PlannedRoute;
    }
  | {
      readonly kind: "gathering";
      readonly commandId: string;
      readonly targetId: EntityId;
      readonly resource: ResourceKind;
      readonly evidence: EvidenceClass;
      readonly sourceSequence: number;
    }
  | {
      readonly kind: "dropping-off";
      readonly commandId: string;
      readonly targetId: EntityId;
      readonly resource: ResourceKind;
      readonly evidence: EvidenceClass;
      readonly sourceSequence: number;
    }
  | {
      readonly kind: "building";
      readonly commandId: string;
      readonly targetId: EntityId;
      readonly evidence: EvidenceClass;
      readonly sourceSequence: number;
    }
  | {
      readonly kind: "attacking";
      readonly commandId: string;
      readonly targetId: EntityId;
      readonly evidence: EvidenceClass;
      readonly sourceSequence: number;
    };

export interface EntityState {
  id: EntityId;
  kind: string;
  dataId?: number;
  classId?: number;
  label?: string;
  playerId: string;
  hp: number;
  maxHp: number;
  lifecycle: EntityLifecycleState;
  facing: -1 | 1;
  radiusFp: FixedPoint;
  speedFpPerSecond: number;
  pathing: EntityPathingProfile;
  position: FixedPointPosition;
  task: EntityTask;
  lastRoute?: PlannedRoute;
  carry?: WorkerCarryState;
  workerTask?: WorkerTaskState;
  resourceNode?: ResourceNodeState;
  construction?: ConstructionState;
  production?: ProductionState;
  combat?: EntityCombatState;
  evidence: EvidenceClass;
}

interface MutableRouteStats {
  planned: number;
  completed: number;
  failed: number;
  replanned: number;
  corrected: number;
  unresolvedActors: number;
}

export class WorldState {
  public timeMs: SimTimeMs = 0;
  public readonly entities = new Map<EntityId, EntityState>();
  public readonly resourceNodes = new Map<EntityId, ResourceNodeState>();
  public readonly playerEconomies = new Map<PlayerId, PlayerEconomyState>();
  public readonly appliedCommandIds: string[] = [];
  public readonly observedIntentIds: string[] = [];
  public readonly warnings: string[] = [];
  public readonly routeStats: MutableRouteStats = createRouteStats();
  public readonly routeEvents: string[] = [];
  public readonly economyStats: EconomyStats = createEconomyStats();
  public readonly economyEvents: string[] = [];
  public readonly economyNotes: string[] = [
    "Starting stockpiles are simulated baselines because the scenario artifact does not carry resource stocks.",
    "Node amounts use DAT values when represented and explicit family defaults otherwise.",
    "Technology, civilization, placement, formation, market, repair, and cancellation modifiers are diagnostic-only " +
      "in this slice.",
    "Replay resource timeseries were not imported into the scenario artifact; diagnostics do not fit simulated state " +
      "to them."
  ];
  public firstEconomyDivergence?: EconomyDivergence;
  public readonly combatStats: MutableCombatStats = createCombatStats();
  public readonly combatEvents: string[] = [];
  public readonly combatDeaths: DamageEventState[] = [];
  public readonly combatDamageEvents: DamageEventState[] = [];
  public readonly combatReconciliationEvents: string[] = [];
  public readonly combatProjectiles = new Map<string, CombatProjectileState>();
  public readonly combatNotes: string[] = [
    "Attack commands are stored as observed intent; only simulated contact, projectile impact, and damage change HP.",
    "Damage uses DAT attack and armor class vectors with explicit matched classes and a represented minimum of one " +
      "damage.",
    "Elevation, splash, accuracy, garrison arrows, conversion, healing, repair, and civilization/technology " +
      "modifiers are omitted in this slice.",
    "Later observed actor activity after a simulated death creates a reconciled correction instead of silently " +
      "resurrecting the entity."
  ];
  public firstCombatUnsupported?: CombatDivergence;
  public firstCombatDivergence?: CombatDivergence;
  public readonly treeActiveSet = new TreeActiveSet();
  public readonly pathing: PathingState;
  public readonly rulesByDataId = new Map<number, RulesetUnit>();
  public readonly rulesByKind = new Map<string, RulesetUnit>();
  private nextSimOrdinal = 0;
  private nextCombatOrdinal = 0;
  private nextProjectileOrdinal = 0;
  private nextDamageOrdinal = 0;
  private readonly renderBaselineSignatures = new Map<EntityId, string>();

  public constructor(
    private readonly scenario: ReplayScenarioV1,
    public readonly ruleset: RulesetV1
  ) {
    for (const unit of ruleset.units) {
      if (unit.id !== undefined) {
        this.rulesByDataId.set(unit.id, unit);
      }
      this.rulesByKind.set(unit.kind, unit);
    }
    const warnedMissingRules = new Set<string>();

    for (const entity of scenario.entities) {
      const resolvedRule = this.resolveUnitRule(entity.dataId, entity.kind);
      const rule = resolvedRule ?? fallbackUnit(entity.kind);
      const warningKey = entity.dataId === undefined ? entity.kind : `${entity.dataId}:${entity.kind}`;
      if (!resolvedRule && !warnedMissingRules.has(warningKey)) {
        warnedMissingRules.add(warningKey);
        this.warn(`Missing unit rule for ${warningKey}; using immobile fallback`);
      }

      this.entities.set(entity.id, this.createEntityState({
        id: entity.id,
        kind: entity.kind,
        dataId: entity.dataId,
        classId: entity.classId,
        label: entity.label,
        playerId: entity.playerId,
        hp: entity.hp ?? rule.maxHp,
        maxHp: rule.maxHp,
        facing: 1,
        radiusFp: toFixedPoint(rule.radiusTiles),
        speedFpPerSecond: rule.speedFpPerSecond,
        pathing: buildPathingProfile(rule),
        position: {
          xFp: toFixedPoint(entity.position.x),
          yFp: toFixedPoint(entity.position.y),
          evidence: entity.position.evidence
        },
        evidence: entity.evidence
      }, rule));
    }

    this.pathing = new PathingState(this.scenario.map, ruleset, this.entities);
    this.rebuildTreeActiveSet();
  }

  public resolveUnitRule(dataId: number | undefined, kind: string | undefined): RulesetUnit | undefined {
    if (dataId !== undefined) {
      return this.rulesByDataId.get(dataId);
    }
    if (kind !== undefined) {
      return this.rulesByKind.get(kind);
    }

    return undefined;
  }

  public rulesetPlayerIds(): readonly PlayerId[] {
    return this.scenario.players
      .map((player) => player.id)
      .filter((playerId) => playerId !== "gaia")
      .sort();
  }

  public areHostilePlayers(left: PlayerId, right: PlayerId): boolean {
    if (left === right || left === "gaia" || right === "gaia") {
      return false;
    }

    const leftTeam = this.scenario.players.find((player) => player.id === left)?.team;
    const rightTeam = this.scenario.players.find((player) => player.id === right)?.team;
    if (leftTeam === undefined || rightTeam === undefined) {
      return left !== right;
    }

    return leftTeam !== rightTeam;
  }

  public createSimEntityId(prefix: string): EntityId {
    this.nextSimOrdinal += 1;
    return `sim:${prefix}:${this.nextSimOrdinal.toString().padStart(6, "0")}`;
  }

  public createCombatEpisodeId(prefix: string): string {
    this.nextCombatOrdinal += 1;
    return `combat:${prefix}:${this.nextCombatOrdinal.toString().padStart(6, "0")}`;
  }

  public createProjectileId(): string {
    this.nextProjectileOrdinal += 1;
    return `projectile:${this.nextProjectileOrdinal.toString().padStart(6, "0")}`;
  }

  public createDamageEventId(): string {
    this.nextDamageOrdinal += 1;
    return `damage:${this.nextDamageOrdinal.toString().padStart(6, "0")}`;
  }

  public addSimulatedEntity(input: {
    readonly id?: EntityId;
    readonly rule: RulesetUnit;
    readonly playerId: PlayerId;
    readonly xFp: FixedPoint;
    readonly yFp: FixedPoint;
    readonly evidence?: EvidenceClass;
    readonly hp?: number;
    readonly kind?: string;
    readonly label?: string;
  }): EntityState {
    const entity = this.createEntityState(
      {
        id: input.id ?? this.createSimEntityId("entity"),
        kind: input.kind ?? input.rule.kind,
        dataId: input.rule.id,
        classId: input.rule.classId,
        label: input.label ?? input.rule.label,
        playerId: input.playerId,
        hp: input.hp ?? input.rule.maxHp,
        maxHp: input.rule.maxHp,
        facing: 1,
        radiusFp: toFixedPoint(input.rule.radiusTiles),
        speedFpPerSecond: input.rule.speedFpPerSecond,
        pathing: buildPathingProfile(input.rule),
        position: {
          xFp: input.xFp,
          yFp: input.yFp,
          evidence: input.evidence ?? "simulated"
        },
        evidence: input.evidence ?? "simulated"
      },
      input.rule
    );
    this.entities.set(entity.id, entity);
    this.treeActiveSet.observeEntity(this, entity);
    this.pathing.rebuildStaticObstacles(this.entities);
    return entity;
  }

  public rebuildTreeActiveSet(): void {
    this.treeActiveSet.rebuild(this);
  }

  public refreshTreeActiveSet(): void {
    this.treeActiveSet.refreshActivation(this);
  }

  public activeSimulationEntities(): readonly EntityState[] {
    return this.treeActiveSet.activeEntities(this);
  }

  public isTrackedTreeResource(entity: EntityState, node: ResourceNodeState | undefined): boolean {
    return this.treeActiveSet.isTrackedTreeResource(entity, node);
  }

  public createTreeActiveSetDiagnostics(): TreeActiveSetDiagnostics {
    return this.treeActiveSet.diagnostics();
  }

  public representedTreeEntityIds(): readonly EntityId[] {
    return this.treeActiveSet.representedTreeEntityIds();
  }

  public resetRenderBaseline(): void {
    this.renderBaselineSignatures.clear();
    for (const entity of this.entities.values()) {
      this.renderBaselineSignatures.set(entity.id, renderEntitySignature(entity));
    }
  }

  public createRenderEntityUpdates(): readonly RenderEntitySnapshot[] {
    const updates: RenderEntitySnapshot[] = [];
    for (const entity of this.entities.values()) {
      const signature = renderEntitySignature(entity);
      if (this.renderBaselineSignatures.get(entity.id) === signature) {
        continue;
      }

      this.renderBaselineSignatures.set(entity.id, signature);
      updates.push(snapshotRenderEntity(entity, this.isTrackedTreeResource(entity, entity.resourceNode)));
    }

    return updates;
  }

  public createProjectileRenderData(): readonly SnapshotProjectile[] {
    return [...this.combatProjectiles.values()]
      .sort((left, right) => left.impactAtMs - right.impactAtMs || left.id.localeCompare(right.id))
      .map((projectile) => snapshotProjectile(projectile, this.timeMs));
  }

  public warn(message: string): void {
    this.warnings.push(`${this.timeMs}ms ${message}`);
    if (this.warnings.length > 12) {
      this.warnings.shift();
    }
  }

  public recordRouteEvent(message: string): void {
    this.routeEvents.push(`${this.timeMs}ms ${message}`);
    if (this.routeEvents.length > 18) {
      this.routeEvents.shift();
    }
  }

  public recordEconomyEvent(message: string): void {
    this.economyEvents.push(`${this.timeMs}ms ${message}`);
    if (this.economyEvents.length > 24) {
      this.economyEvents.shift();
    }
  }

  public recordEconomyDivergence(reason: string, commandId?: string): void {
    if (this.firstEconomyDivergence) {
      return;
    }

    this.firstEconomyDivergence = dropUndefined({
      timeMs: this.timeMs,
      commandId,
      reason
    }) as EconomyDivergence;
  }

  public recordCombatEvent(message: string, timeMs = this.timeMs): void {
    this.combatEvents.push(`${timeMs}ms ${message}`);
    if (this.combatEvents.length > 32) {
      this.combatEvents.shift();
    }
  }

  public recordCombatReconciliation(message: string, timeMs = this.timeMs): void {
    const event = `${timeMs}ms ${message}`;
    this.combatReconciliationEvents.push(event);
    if (this.combatReconciliationEvents.length > 12) {
      this.combatReconciliationEvents.shift();
    }
    this.recordCombatEvent(message, timeMs);
  }

  public recordCombatUnsupported(reason: string, commandId?: string): void {
    if (this.firstCombatUnsupported) {
      return;
    }

    this.firstCombatUnsupported = dropUndefined({
      timeMs: this.timeMs,
      commandId,
      reason
    }) as CombatDivergence;
  }

  public recordCombatDivergence(reason: string, commandId?: string): void {
    if (this.firstCombatDivergence) {
      return;
    }

    this.firstCombatDivergence = dropUndefined({
      timeMs: this.timeMs,
      commandId,
      reason
    }) as CombatDivergence;
  }

  public createRouteDiagnostics(): RouteDiagnostics {
    const active = [...this.entities.values()].filter((entity) => entity.task.kind === "moving").length;
    const failedActive = [...this.entities.values()].filter((entity) => entity.task.kind === "path-failed").length;

    return {
      planned: this.routeStats.planned,
      completed: this.routeStats.completed,
      failed: this.routeStats.failed,
      replanned: this.routeStats.replanned,
      corrected: this.routeStats.corrected,
      unresolvedActors: this.routeStats.unresolvedActors,
      active,
      failedActive,
      staticBlockedTiles: this.pathing.staticBlockedTiles,
      occupancyVersion: this.pathing.staticVersion,
      lastEvents: [...this.routeEvents]
    };
  }

  public createEconomyDiagnostics(): EconomyDiagnostics {
    const economy = this.createEconomyDiagnosticSummary();
    return dropUndefined({
      handledIntentCount: this.economyStats.handledIntentCount,
      gatherCommands: this.economyStats.gatherCommands,
      buildCommands: this.economyStats.buildCommands,
      queueCommands: this.economyStats.queueCommands,
      gatherPointCommands: this.economyStats.gatherPointCommands,
      unresolvedActors: this.economyStats.unresolvedActors,
      unresolvedTargets: this.economyStats.unresolvedTargets,
      unsupportedIntents: this.economyStats.unsupportedIntents,
      activeWorkers: economy.activeWorkers,
      carryingWorkers: economy.carryingWorkers,
      stockpileSummary: economy.stockpileSummary,
      ledgerSummary: economy.ledgerSummary,
      depletedNodes: economy.depletedNodes,
      constructionSites: economy.constructionSites,
      completedConstruction: this.economyStats.completedConstruction,
      productionQueueItems: economy.productionQueueItems,
      spawnedUnits: this.economyStats.spawnedUnits,
      conservationBalanced: economy.conservationBalanced,
      firstDivergence: this.firstEconomyDivergence,
      lastEvents: [...this.economyEvents]
    }) as EconomyDiagnostics;
  }

  public createCombatDiagnostics(): CombatDiagnostics {
    const attackers = [...this.entities.values()]
      .filter((entity) => entity.lifecycle.state === "alive" && entity.combat?.active)
      .sort(compareEntities)
      .map((entity) => {
        const active = entity.combat?.active;
        const target = active?.targetId ? this.entities.get(active.targetId) : undefined;
        return {
          attackerId: entity.id,
          targetId: active?.targetId,
          state: active?.state ?? "unsupported",
          range: active ? formatCombatRange(active) : "none",
          hp: `${entity.hp}/${entity.maxHp}${target ? ` -> ${target.hp}/${target.maxHp}` : ""}`,
          reload: active ? formatReload(this.timeMs, active.nextAttackReadyAtMs) : "none"
        };
      });

    return dropUndefined({
      observedIntentCount: this.combatStats.observedIntentCount,
      resolvedAttackIntents: this.combatStats.resolvedAttackIntents,
      unresolvedAttackIntents: this.combatStats.unresolvedAttackIntents,
      unsupportedIntents: this.combatStats.unsupportedIntents,
      activeEpisodes: attackers.length,
      attackers,
      projectilesInFlight: this.combatProjectiles.size,
      projectilesLaunched: this.combatStats.projectilesLaunched,
      projectilesImpacted: this.combatStats.projectilesImpacted,
      meleeContacts: this.combatStats.meleeContacts,
      damageEvents: this.combatStats.damageEvents,
      deaths: this.combatStats.deaths,
      reconciliations: this.combatStats.reconciliations,
      retargets: this.combatStats.retargets,
      firstUnsupported: this.firstCombatUnsupported,
      firstDivergence: this.firstCombatDivergence,
      lastDamageEvents: this.combatDamageEvents.slice(-6).map(snapshotDamageEvent),
      lastEvents: [...this.combatEvents]
    }) as CombatDiagnostics;
  }

  public createSnapshot(): WorldSnapshot {
    const activeRoutes = [...this.entities.values()].filter((entity) => entity.task.kind === "moving").length;
    const failedRoutes = [...this.entities.values()].filter((entity) => entity.task.kind === "path-failed").length;
    const body: WorldSnapshotBody = {
      schemaVersion: "aoe-sim.snapshot.v1",
      timeMs: this.timeMs,
      durationMs: this.scenario.durationMs,
      map: this.scenario.map,
      players: this.scenario.players,
      entities: [...this.entities.values()].sort(compareEntities).map((entity) =>
        dropUndefined({
          id: entity.id,
          kind: entity.kind,
          dataId: entity.dataId,
          classId: entity.classId,
          label: entity.label,
          playerId: entity.playerId,
          hp: entity.hp,
          maxHp: entity.maxHp,
          lifecycle: snapshotLifecycle(entity.lifecycle),
          facing: entity.facing,
          radiusTiles: fromFixedPoint(entity.radiusFp),
          position: {
            x: fromFixedPoint(entity.position.xFp),
            y: fromFixedPoint(entity.position.yFp),
            xFp: entity.position.xFp,
            yFp: entity.position.yFp,
            evidence: entity.position.evidence
          },
          task: snapshotTask(entity.task, entity.lastRoute),
          combat: snapshotCombat(entity.combat),
          carry: snapshotCarry(entity.carry),
          worker: snapshotWorker(entity.workerTask),
          resourceNode: entity.resourceNode ? snapshotResourceNode(entity.resourceNode) : undefined,
          construction: entity.construction ? snapshotConstruction(entity.construction, this.entities) : undefined,
          production: entity.production ? snapshotProduction(entity.production) : undefined,
          evidence: entity.evidence
        }) as EntitySnapshot
      ),
      appliedCommandIds: [...this.appliedCommandIds],
      observedIntentIds: [...this.observedIntentIds],
      evidenceCounts: this.countEvidence(),
      pathing: {
        occupancyVersion: this.pathing.staticVersion,
        staticBlockedTiles: this.pathing.staticBlockedTiles,
        activeRoutes,
        failedRoutes
      },
      economy: this.createEconomySnapshot(),
      combat: this.createCombatSnapshot(),
      provenance: this.scenario.provenance
    };

    return deepFreeze({
      ...body,
      checksum: checksumStable(body),
      render: {
        representedTreeEntityIds: [...this.treeActiveSet.representedTreeEntityIds()]
      }
    });
  }

  private countEvidence(): Record<EvidenceClass, number> {
    const counts: Record<EvidenceClass, number> = {
      observed: 0,
      simulated: 0,
      reconciled: 0
    };

    for (const entity of this.entities.values()) {
      counts[entity.position.evidence] += 1;
    }

    return counts;
  }

  private createEconomySnapshot(): SnapshotEconomySummary {
    const players = [...this.playerEconomies.values()]
      .sort((left, right) => left.playerId.localeCompare(right.playerId))
      .map((player) => snapshotPlayerEconomy(player, this.entities));
    const resourceNodes = [...this.resourceNodes.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(snapshotResourceNode);
    const activeWorkers = [...this.entities.values()].filter((entity) => entity.workerTask !== undefined).length;
    const carryingWorkers = [...this.entities.values()].filter((entity) => (entity.carry?.amountFp ?? 0) > 0).length;
    const constructionSites = [...this.entities.values()].filter(
      (entity) => entity.construction?.state === "foundation"
    ).length;
    const productionQueueItems = [...this.entities.values()].reduce(
      (sum, entity) => sum + (entity.production?.queue.length ?? 0),
      0
    );
    const conservation = checkConservation(players, resourceNodes);

    return dropUndefined({
      players,
      resourceNodes,
      activeWorkers,
      carryingWorkers,
      depletedNodes: resourceNodes.filter((node) => node.depleted).length,
      constructionSites,
      productionQueueItems,
      conservation,
      firstDivergence: this.firstEconomyDivergence,
      notes: [...this.economyNotes]
    }) as SnapshotEconomySummary;
  }

  private createEconomyDiagnosticSummary(): {
    readonly activeWorkers: number;
    readonly carryingWorkers: number;
    readonly stockpileSummary: string;
    readonly ledgerSummary: string;
    readonly depletedNodes: number;
    readonly constructionSites: number;
    readonly productionQueueItems: number;
    readonly conservationBalanced: boolean;
  } {
    const carrying = new Map<PlayerId, Record<ResourceKind, FixedPoint>>();
    let activeWorkers = 0;
    let carryingWorkers = 0;
    let constructionSites = 0;
    let productionQueueItems = 0;

    for (const entity of this.entities.values()) {
      if (entity.workerTask !== undefined) {
        activeWorkers += 1;
      }
      if (entity.carry?.resource && entity.carry.amountFp > 0) {
        carryingWorkers += 1;
        const playerCarry = carrying.get(entity.playerId) ?? createResourceRecord(0);
        playerCarry[entity.carry.resource] += entity.carry.amountFp;
        carrying.set(entity.playerId, playerCarry);
      }
      if (entity.construction?.state === "foundation") {
        constructionSites += 1;
      }
      productionQueueItems += entity.production?.queue.length ?? 0;
    }

    let depletedNodes = 0;
    let nodesBalanced = true;
    for (const node of this.resourceNodes.values()) {
      if (node.depleted) {
        depletedNodes += 1;
      }
      if (node.remainingAmountFp + node.extractedAmountFp !== node.initialAmountFp) {
        nodesBalanced = false;
      }
    }

    const players = [...this.playerEconomies.values()].sort((left, right) =>
      left.playerId.localeCompare(right.playerId)
    );
    return {
      activeWorkers,
      carryingWorkers,
      stockpileSummary: summarizeEconomyStockpiles(players),
      ledgerSummary: summarizeEconomyLedgers(players, carrying),
      depletedNodes,
      constructionSites,
      productionQueueItems,
      conservationBalanced: nodesBalanced && ledgersBalanced(players, carrying)
    };
  }

  private createCombatSnapshot(): SnapshotCombatSummary {
    const activeEpisodes = [...this.entities.values()].filter(
      (entity) => entity.lifecycle.state === "alive" && entity.combat?.active
    ).length;

    return {
      activeEpisodes,
      projectiles: this.createProjectileRenderData(),
      projectileCount: this.combatProjectiles.size,
      deaths: this.combatDeaths.slice(-8).map((event) =>
        dropUndefined({
          entityId: event.targetId,
          timeMs: event.timeMs,
          killedById: event.attackerId,
          evidence: event.evidence
        }) as SnapshotCombatSummary["deaths"][number]
      ),
      reconciliationEvents: [...this.combatReconciliationEvents],
      lastDamageEvents: this.combatDamageEvents.slice(-8).map(snapshotDamageEvent),
      notes: [...this.combatNotes]
    };
  }

  private createEntityState(
    input: {
      readonly id: EntityId;
      readonly kind: string;
      readonly dataId?: number | undefined;
      readonly classId?: number | undefined;
      readonly label?: string | undefined;
      readonly playerId: PlayerId;
      readonly hp: number | null;
      readonly maxHp?: number | undefined;
      readonly facing?: -1 | 1 | undefined;
      readonly radiusFp?: FixedPoint | undefined;
      readonly speedFpPerSecond?: number | undefined;
      readonly pathing?: EntityPathingProfile | undefined;
      readonly position: FixedPointPosition;
      readonly evidence: EvidenceClass;
    },
    rule: RulesetUnit
  ): EntityState {
    return dropUndefined({
      id: input.id,
      kind: input.kind,
      dataId: input.dataId,
      classId: input.classId,
      label: input.label,
      playerId: input.playerId,
      hp: input.hp ?? rule.maxHp,
      maxHp: input.maxHp ?? rule.maxHp,
      lifecycle: {
        state: "alive",
        evidence: input.evidence
      },
      facing: input.facing ?? 1,
      radiusFp: input.radiusFp ?? toFixedPoint(rule.radiusTiles),
      speedFpPerSecond: input.speedFpPerSecond ?? rule.speedFpPerSecond,
      pathing: input.pathing ?? buildPathingProfile(rule),
      position: input.position,
      task: {
        kind: "idle",
        evidence: input.evidence
      },
      evidence: input.evidence
    }) as EntityState;
  }
}

export function toFixedPoint(value: number): FixedPoint {
  return Math.round(value * FIXED_POINT_SCALE);
}

export function fromFixedPoint(value: FixedPoint): number {
  return Number((value / FIXED_POINT_SCALE).toFixed(3));
}

function renderEntitySignature(entity: EntityState): string {
  return (
    `${entity.kind}|${entity.dataId ?? ""}|${entity.classId ?? ""}|${entity.label ?? ""}|${entity.playerId}|` +
    `${entity.position.xFp},${entity.position.yFp},${entity.position.evidence}|${entity.facing}|` +
    `${entity.radiusFp}|${entity.evidence}|${renderLifecycleSignature(entity.lifecycle)}|` +
    `${renderTaskSignature(entity.task)}|${renderCarrySignature(entity.carry)}|` +
    `${renderResourceNodeSignature(entity.resourceNode)}`
  );
}

function renderLifecycleSignature(lifecycle: EntityLifecycleState): string {
  return (
    `${lifecycle.state},${lifecycle.evidence},${lifecycle.deadAtMs ?? ""},${lifecycle.killedById ?? ""},` +
    `${lifecycle.deathReason ?? ""},${lifecycle.reconciledAtMs ?? ""},${lifecycle.correctionReason ?? ""},` +
    `${lifecycle.previousDeathAtMs ?? ""}`
  );
}

function renderTaskSignature(task: EntityTask): string {
  if (task.kind === "idle") {
    return `${task.kind},${task.evidence}`;
  }

  if (
    task.kind === "gathering" ||
    task.kind === "dropping-off" ||
    task.kind === "building" ||
    task.kind === "attacking"
  ) {
    const resource = "resource" in task ? task.resource : "";
    return `${task.kind},${task.commandId},${task.targetId},${resource},${task.evidence}`;
  }

  let route = `${task.route.status},${task.route.staticVersion},${task.route.nextWaypointIndex},` +
    `${task.route.pathNodeCount},${task.route.searchedNodeCount},${task.route.failureReason ?? ""},` +
    `${task.route.failureDetail ?? ""},${task.route.lastCorrection?.timeMs ?? ""},` +
    `${task.route.lastCorrection?.reason ?? ""},${task.route.lastCorrection?.blockerId ?? ""},` +
    `${task.route.lastCorrection?.tileX ?? ""},${task.route.lastCorrection?.tileY ?? ""}`;
  if (task.kind === "moving") {
    for (const waypoint of task.route.waypoints) {
      route += `,${waypoint.xFp}:${waypoint.yFp}:${waypoint.tileX}:${waypoint.tileY}`;
    }
  }

  return (
    `${task.kind},${task.commandId},${task.destination.xFp},${task.destination.yFp},${task.evidence},` +
    `${route}`
  );
}

function renderCarrySignature(carry: WorkerCarryState | undefined): string {
  if (!carry || carry.amountFp <= 0) {
    return "none";
  }

  return `${carry.resource ?? ""},${carry.amountFp},${carry.capacityFp},${carry.evidence}`;
}

function renderResourceNodeSignature(node: ResourceNodeState | undefined): string {
  if (!node) {
    return "none";
  }

  return (
    `${node.id},${node.resource},${node.family},${node.depleted ? 1 : 0},` +
    `${node.depletionTimeMs ?? ""},${node.evidence}`
  );
}

function snapshotRenderEntity(entity: EntityState, representedTreeResource: boolean): RenderEntitySnapshot {
  return dropUndefined({
    id: entity.id,
    kind: entity.kind,
    dataId: entity.dataId,
    classId: entity.classId,
    label: entity.label,
    playerId: entity.playerId,
    lifecycle: snapshotLifecycle(entity.lifecycle),
    facing: entity.facing,
    radiusTiles: fromFixedPoint(entity.radiusFp),
    position: {
      x: fromFixedPoint(entity.position.xFp),
      y: fromFixedPoint(entity.position.yFp),
      xFp: entity.position.xFp,
      yFp: entity.position.yFp,
      evidence: entity.position.evidence
    },
    task: snapshotTask(entity.task, entity.lastRoute),
    carry: snapshotCarry(entity.carry),
    resourceNode: entity.resourceNode ? snapshotRenderResourceNode(entity.resourceNode) : undefined,
    representedTreeResource,
    evidence: entity.evidence
  }) as RenderEntitySnapshot;
}

function snapshotRenderResourceNode(node: ResourceNodeState): RenderResourceNodeSnapshot {
  return dropUndefined({
    id: node.id,
    resource: node.resource,
    family: node.family,
    depleted: node.depleted,
    depletionTimeMs: node.depletionTimeMs,
    evidence: node.evidence
  }) as RenderResourceNodeSnapshot;
}

function snapshotTask(task: EntityTask, lastRoute: PlannedRoute | undefined): SnapshotTask {
  if (task.kind === "idle") {
    return dropUndefined({
      kind: "idle",
      evidence: task.evidence,
      route: lastRoute && lastRoute.status !== "planned" ? snapshotRoute(lastRoute) : undefined
    }) as SnapshotTask;
  }

  if (
    task.kind === "gathering" ||
    task.kind === "dropping-off" ||
    task.kind === "building" ||
    task.kind === "attacking"
  ) {
    return dropUndefined({
      kind: task.kind,
      commandId: task.commandId,
      targetId: task.targetId,
      resource: "resource" in task ? task.resource : undefined,
      evidence: task.evidence
    }) as SnapshotTask;
  }

  return dropUndefined({
    kind: task.kind,
    commandId: task.commandId,
    destination: {
      x: fromFixedPoint(task.destination.xFp),
      y: fromFixedPoint(task.destination.yFp),
      xFp: task.destination.xFp,
      yFp: task.destination.yFp
    },
    evidence: task.evidence,
    route: snapshotRoute(task.route)
  }) as SnapshotTask;
}

function snapshotLifecycle(lifecycle: EntityLifecycleState): import("../replay/model").SnapshotLifecycle {
  return dropUndefined({
    state: lifecycle.state,
    evidence: lifecycle.evidence,
    deadAtMs: lifecycle.deadAtMs,
    killedById: lifecycle.killedById,
    deathReason: lifecycle.deathReason,
    reconciledAtMs: lifecycle.reconciledAtMs,
    correctionReason: lifecycle.correctionReason,
    previousDeathAtMs: lifecycle.previousDeathAtMs
  }) as import("../replay/model").SnapshotLifecycle;
}

function snapshotCombat(combat: EntityCombatState | undefined): SnapshotEntityCombat | undefined {
  if (!combat?.intent && !combat?.active && !combat?.lastDamage) {
    return undefined;
  }

  return dropUndefined({
    intent: combat.intent
      ? dropUndefined({
          commandId: combat.intent.commandId,
          rawKind: combat.intent.rawKind,
          issuedAtMs: combat.intent.issuedAtMs,
          sourceSequence: combat.intent.sourceSequence,
          targetId: combat.intent.targetId,
          destination: combat.intent.destination,
          evidence: combat.intent.evidence,
          resolution: combat.intent.resolution,
          reason: combat.intent.reason
        })
      : undefined,
    episode: combat.active ? snapshotCombatEpisode(combat.active) : undefined,
    lastDamage: combat.lastDamage ? snapshotDamageEvent(combat.lastDamage) : undefined
  }) as SnapshotEntityCombat;
}

function snapshotCombatEpisode(active: ActiveCombatState): SnapshotCombatEpisode {
  return dropUndefined({
    id: active.id,
    state: active.state,
    targetId: active.targetId,
    targetSource: active.targetSource,
    startedAtMs: active.startedAtMs,
    lastStateChangeMs: active.lastStateChangeMs,
    nextAttackReadyAtMs: active.nextAttackReadyAtMs,
    reloadMs: active.reloadMs,
    minRangeTiles: fromFixedPoint(active.minRangeFp),
    maxRangeTiles: fromFixedPoint(active.maxRangeFp),
    lastDistanceTiles: active.lastDistanceFp === undefined ? undefined : fromFixedPoint(active.lastDistanceFp),
    inRange: active.inRange,
    retargetCount: active.retargetCount,
    routeTargetId: active.routeTargetId,
    unsupportedMechanic: active.unsupportedMechanic,
    lastDamage: active.lastDamage ? snapshotDamageEvent(active.lastDamage) : undefined
  }) as SnapshotCombatEpisode;
}

function snapshotDamageEvent(event: DamageEventState): SnapshotDamageEvent {
  return dropUndefined({
    id: event.id,
    timeMs: event.timeMs,
    attackerId: event.attackerId,
    targetId: event.targetId,
    amount: event.amount,
    targetHpBefore: event.targetHpBefore,
    targetHpAfter: event.targetHpAfter,
    source: event.source,
    projectileId: event.projectileId,
    commandId: event.commandId,
    calculation: snapshotDamageCalculation(event.calculation),
    evidence: event.evidence
  }) as SnapshotDamageEvent;
}

function snapshotDamageCalculation(calculation: DamageCalculationState): SnapshotDamageCalculation {
  return dropUndefined({
    attackerRuleId: calculation.attackerRuleId,
    attackerKind: calculation.attackerKind,
    targetRuleId: calculation.targetRuleId,
    targetKind: calculation.targetKind,
    attackVector: calculation.attackVector.map(snapshotCombatVectorEntry),
    armorVector: calculation.armorVector.map(snapshotCombatVectorEntry),
    matches: calculation.matches.map((match) => ({
      classId: match.classId,
      attackAmount: match.attackAmount,
      armorAmount: match.armorAmount,
      appliedAmount: match.appliedAmount
    })),
    skippedAttackClasses: [...calculation.skippedAttackClasses],
    rawDamage: calculation.rawDamage,
    appliedDamage: calculation.appliedDamage,
    minimumDamageApplied: calculation.minimumDamageApplied
  }) as SnapshotDamageCalculation;
}

function snapshotCombatVectorEntry(entry: CombatVectorEntryState): SnapshotCombatVectorEntry {
  return {
    classId: entry.classId,
    amount: entry.amount
  };
}

function snapshotProjectile(projectile: CombatProjectileState, timeMs: SimTimeMs): SnapshotProjectile {
  const durationMs = Math.max(1, projectile.impactAtMs - projectile.launchedAtMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, timeMs - projectile.launchedAtMs));
  const xFp = projectile.startXFp + Math.trunc(((projectile.targetXFp - projectile.startXFp) * elapsedMs) / durationMs);
  const yFp = projectile.startYFp + Math.trunc(((projectile.targetYFp - projectile.startYFp) * elapsedMs) / durationMs);

  return dropUndefined({
    id: projectile.id,
    attackerId: projectile.attackerId,
    targetId: projectile.targetId,
    launchedAtMs: projectile.launchedAtMs,
    impactAtMs: projectile.impactAtMs,
    x: fromFixedPoint(xFp),
    y: fromFixedPoint(yFp),
    xFp,
    yFp,
    start: {
      x: fromFixedPoint(projectile.startXFp),
      y: fromFixedPoint(projectile.startYFp),
      xFp: projectile.startXFp,
      yFp: projectile.startYFp,
      evidence: projectile.evidence
    },
    target: {
      x: fromFixedPoint(projectile.targetXFp),
      y: fromFixedPoint(projectile.targetYFp),
      xFp: projectile.targetXFp,
      yFp: projectile.targetYFp,
      evidence: projectile.evidence
    },
    projectileRuleId: projectile.projectileRuleId,
    projectileKind: projectile.projectileKind,
    speedFpPerSecond: projectile.speedFpPerSecond,
    commandId: projectile.commandId,
    damage: snapshotDamageCalculation(projectile.damage),
    evidence: projectile.evidence
  }) as SnapshotProjectile;
}

function snapshotRoute(route: PlannedRoute): SnapshotRoute {
  return dropUndefined({
    commandId: route.commandId,
    status: route.status,
    plannedAtMs: route.plannedAtMs,
    staticVersion: route.staticVersion,
    terrainRestrictionId: route.terrainRestrictionId,
    actorRadiusTiles: fromFixedPoint(route.actorRadiusFp),
    nextWaypointIndex: route.nextWaypointIndex,
    waypoints: route.waypoints.map((waypoint) => ({
      x: fromFixedPoint(waypoint.xFp),
      y: fromFixedPoint(waypoint.yFp),
      xFp: waypoint.xFp,
      yFp: waypoint.yFp,
      tileX: waypoint.tileX,
      tileY: waypoint.tileY
    })),
    pathNodeCount: route.pathNodeCount,
    searchedNodeCount: route.searchedNodeCount,
    failureReason: route.failureReason,
    failureDetail: route.failureDetail,
    lastCorrection: route.lastCorrection
  }) as SnapshotRoute;
}

function snapshotCarry(carry: WorkerCarryState | undefined): SnapshotCarry | undefined {
  if (!carry || carry.amountFp <= 0) {
    return undefined;
  }

  return dropUndefined({
    resource: carry.resource,
    amount: fromFixedPoint(carry.amountFp),
    amountFp: carry.amountFp,
    capacity: fromFixedPoint(carry.capacityFp),
    capacityFp: carry.capacityFp,
    evidence: carry.evidence
  }) as SnapshotCarry;
}

function snapshotWorker(worker: WorkerTaskState | undefined): import("../replay/model").SnapshotWorkerState | undefined {
  if (!worker) {
    return undefined;
  }

  return dropUndefined({
    kind: worker.kind,
    phase: worker.phase,
    commandId: worker.commandId,
    targetId: worker.targetId,
    dropSiteId: worker.kind === "gather" ? worker.dropSiteId : undefined,
    resource: worker.kind === "gather" ? worker.resource : undefined,
    evidence: worker.evidence,
    retargetCount: worker.kind === "gather" && worker.retargetCount > 0 ? worker.retargetCount : undefined
  }) as import("../replay/model").SnapshotWorkerState;
}

function snapshotResourceNode(node: ResourceNodeState): SnapshotResourceNode {
  return dropUndefined({
    id: node.id,
    resource: node.resource,
    family: node.family,
    initialAmount: fromFixedPoint(node.initialAmountFp),
    initialAmountFp: node.initialAmountFp,
    remainingAmount: fromFixedPoint(node.remainingAmountFp),
    remainingAmountFp: node.remainingAmountFp,
    extractedAmount: fromFixedPoint(node.extractedAmountFp),
    extractedAmountFp: node.extractedAmountFp,
    depleted: node.depleted,
    depletionTimeMs: node.depletionTimeMs,
    amountSource: node.amountSource,
    farmGeneration: node.farmGeneration,
    evidence: node.evidence
  }) as SnapshotResourceNode;
}

function snapshotConstruction(
  construction: ConstructionState,
  entities: ReadonlyMap<EntityId, EntityState>
): SnapshotConstruction {
  const builderIds = [...entities.values()]
    .filter((entity) => entity.workerTask?.kind === "build" && entity.workerTask.targetId === findConstructionId(construction, entities))
    .map((entity) => entity.id)
    .sort();
  const progress = construction.requiredWorkFp <= 0 ? 1 : construction.progressFp / construction.requiredWorkFp;

  return dropUndefined({
    state: construction.state,
    progress: Number(Math.max(0, Math.min(1, progress)).toFixed(3)),
    progressFp: construction.progressFp,
    requiredWorkFp: construction.requiredWorkFp,
    startedAtMs: construction.startedAtMs,
    completedAtMs: construction.completedAtMs,
    builderIds,
    evidence: construction.evidence
  }) as SnapshotConstruction;
}

function findConstructionId(
  construction: ConstructionState,
  entities: ReadonlyMap<EntityId, EntityState>
): EntityId | undefined {
  for (const entity of entities.values()) {
    if (entity.construction === construction) {
      return entity.id;
    }
  }

  return undefined;
}

function snapshotProduction(production: ProductionState): SnapshotProduction {
  return dropUndefined({
    queue: production.queue.map((item) => ({
      id: item.id,
      unitId: item.unitId,
      unitKind: item.unitKind,
      remainingMs: item.remainingMs,
      trainTimeMs: item.trainTimeMs,
      cost: item.cost.map((cost) => ({
        resource: cost.resource,
        amount: fromFixedPoint(cost.amountFp),
        amountFp: cost.amountFp
      })),
      evidence: item.evidence
    })),
    gatherPoint: production.gatherPoint
      ? dropUndefined({
          targetId: production.gatherPoint.targetId,
          resource: production.gatherPoint.resource,
          x: fromFixedPoint(production.gatherPoint.xFp),
          y: fromFixedPoint(production.gatherPoint.yFp),
          evidence: production.gatherPoint.evidence
        })
      : undefined,
    spawnOrdinal: production.spawnOrdinal
  }) as SnapshotProduction;
}

function snapshotPlayerEconomy(
  player: PlayerEconomyState,
  entities: ReadonlyMap<EntityId, EntityState>
): SnapshotPlayerEconomy {
  const carrying = createResourceRecord(0);
  for (const entity of entities.values()) {
    if (entity.playerId !== player.playerId || !entity.carry?.resource || entity.carry.amountFp <= 0) {
      continue;
    }
    carrying[entity.carry.resource] += entity.carry.amountFp;
  }

  const stockpile = createResourceRecord(0);
  for (const resource of resourceKinds) {
    stockpile[resource] = fromFixedPoint(player.stockpileFp[resource]);
  }

  return {
    playerId: player.playerId,
    stockpile,
    stockpileFp: { ...player.stockpileFp },
    ledger: {
      food: snapshotLedger(player.ledger.food, player.stockpileFp.food, carrying.food),
      wood: snapshotLedger(player.ledger.wood, player.stockpileFp.wood, carrying.wood),
      stone: snapshotLedger(player.ledger.stone, player.stockpileFp.stone, carrying.stone),
      gold: snapshotLedger(player.ledger.gold, player.stockpileFp.gold, carrying.gold)
    },
    population: { ...player.population },
    evidence: player.evidence
  };
}

function snapshotLedger(
  ledger: ResourceLedgerState,
  stockpileFp: FixedPoint,
  carryingFp: FixedPoint
): import("../replay/model").SnapshotResourceLedger {
  return {
    baselineFp: ledger.baselineFp,
    extractedFp: ledger.extractedFp,
    depositedFp: ledger.depositedFp,
    spentFp: ledger.spentFp,
    refundedFp: ledger.refundedFp,
    stockpileFp,
    carryingFp
  };
}

function checkConservation(
  players: readonly SnapshotPlayerEconomy[],
  nodes: readonly SnapshotResourceNode[]
): SnapshotEconomySummary["conservation"] {
  for (const node of nodes) {
    const consumed = node.remainingAmountFp + node.extractedAmountFp;
    if (consumed !== node.initialAmountFp) {
      return {
        balanced: false,
        firstIssue: `node ${node.id} ${node.resource} has ${consumed - node.initialAmountFp}fp imbalance`
      };
    }
  }

  for (const player of players) {
    for (const resource of resourceKinds) {
      const ledger = player.ledger[resource];
      const expectedStockpile =
        ledger.baselineFp + ledger.depositedFp + ledger.refundedFp - ledger.spentFp;
      if (expectedStockpile !== ledger.stockpileFp) {
        return {
          balanced: false,
          firstIssue: `${player.playerId} ${resource} stockpile ledger imbalance`
        };
      }
      if (ledger.extractedFp - ledger.depositedFp !== ledger.carryingFp) {
        return {
          balanced: false,
          firstIssue: `${player.playerId} ${resource} carry ledger imbalance`
        };
      }
    }
  }

  return {
    balanced: true
  };
}

function summarizeEconomyStockpiles(players: readonly PlayerEconomyState[]): string {
  if (!players.length) {
    return "none";
  }

  return players
    .map(
      (player) =>
        `${player.playerId} F${formatResource(player.stockpileFp.food)} W${formatResource(player.stockpileFp.wood)} ` +
        `S${formatResource(player.stockpileFp.stone)} G${formatResource(player.stockpileFp.gold)} ` +
        `P${player.population.used}+${player.population.reserved}/${player.population.capacity}`
    )
    .join(" | ");
}

function summarizeEconomyLedgers(
  players: readonly PlayerEconomyState[],
  carrying: ReadonlyMap<PlayerId, Record<ResourceKind, FixedPoint>>
): string {
  let extractedFp = 0;
  let depositedFp = 0;
  let spentFp = 0;
  let carryingFp = 0;
  for (const player of players) {
    const playerCarry = carrying.get(player.playerId);
    for (const resource of resourceKinds) {
      const ledger = player.ledger[resource];
      extractedFp += ledger.extractedFp;
      depositedFp += ledger.depositedFp;
      spentFp += ledger.spentFp;
      carryingFp += playerCarry?.[resource] ?? 0;
    }
  }

  return (
    `extract ${formatResource(extractedFp)}, carry ${formatResource(carryingFp)}, ` +
    `deposit ${formatResource(depositedFp)}, spend ${formatResource(spentFp)}`
  );
}

function ledgersBalanced(
  players: readonly PlayerEconomyState[],
  carrying: ReadonlyMap<PlayerId, Record<ResourceKind, FixedPoint>>
): boolean {
  for (const player of players) {
    const playerCarry = carrying.get(player.playerId);
    for (const resource of resourceKinds) {
      const ledger = player.ledger[resource];
      const expectedStockpile = ledger.baselineFp + ledger.depositedFp + ledger.refundedFp - ledger.spentFp;
      if (expectedStockpile !== player.stockpileFp[resource]) {
        return false;
      }
      if (ledger.extractedFp - ledger.depositedFp !== (playerCarry?.[resource] ?? 0)) {
        return false;
      }
    }
  }

  return true;
}

function formatCombatRange(active: ActiveCombatState): string {
  const distance = active.lastDistanceFp === undefined ? "unknown" : fromFixedPoint(active.lastDistanceFp).toFixed(2);
  const min = fromFixedPoint(active.minRangeFp).toFixed(2);
  const max = fromFixedPoint(active.maxRangeFp).toFixed(2);
  const status = active.inRange === undefined ? "pending" : active.inRange ? "in" : "out";
  return `${distance} tiles (${min}-${max}, ${status})`;
}

function formatReload(timeMs: SimTimeMs, readyAtMs: SimTimeMs): string {
  const remainingMs = Math.max(0, readyAtMs - timeMs);
  return remainingMs <= 0 ? "ready" : `${remainingMs}ms`;
}

function createRouteStats(): MutableRouteStats {
  return {
    planned: 0,
    completed: 0,
    failed: 0,
    replanned: 0,
    corrected: 0,
    unresolvedActors: 0
  };
}

function createCombatStats(): MutableCombatStats {
  return {
    observedIntentCount: 0,
    resolvedAttackIntents: 0,
    unresolvedAttackIntents: 0,
    unsupportedIntents: 0,
    projectilesLaunched: 0,
    projectilesImpacted: 0,
    meleeContacts: 0,
    damageEvents: 0,
    deaths: 0,
    reconciliations: 0,
    retargets: 0
  };
}

function createEconomyStats(): EconomyStats {
  return {
    handledIntentCount: 0,
    gatherCommands: 0,
    buildCommands: 0,
    queueCommands: 0,
    gatherPointCommands: 0,
    unresolvedActors: 0,
    unresolvedTargets: 0,
    unsupportedIntents: 0,
    completedConstruction: 0,
    spawnedUnits: 0
  };
}

export const resourceKinds: readonly ResourceKind[] = ["food", "wood", "stone", "gold"];

export function createResourceRecord(value: FixedPoint): Record<ResourceKind, FixedPoint> {
  return {
    food: value,
    wood: value,
    stone: value,
    gold: value
  };
}

export function createLedgerRecord(value: FixedPoint): Record<ResourceKind, ResourceLedgerState> {
  return {
    food: createLedger(value),
    wood: createLedger(value),
    stone: createLedger(value),
    gold: createLedger(value)
  };
}

function createLedger(value: FixedPoint): ResourceLedgerState {
  return {
    baselineFp: value,
    extractedFp: 0,
    depositedFp: 0,
    spentFp: 0,
    refundedFp: 0
  };
}

function formatResource(valueFp: FixedPoint): string {
  return fromFixedPoint(valueFp).toFixed(1).replace(/\.0$/, "");
}

function compareEntities(left: EntityState, right: EntityState): number {
  return left.id.localeCompare(right.id);
}

function fallbackUnit(kind: string): RulesetUnit {
  return {
    kind,
    maxHp: 1,
    speedFpPerSecond: 0,
    radiusTiles: 0.25,
    token: "marker"
  };
}

function buildPathingProfile(rule: RulesetUnit): EntityPathingProfile {
  const collision = rule.collision;
  const movement = rule.movement;
  const collisionRadius = readPositiveNumber(collision?.radiusTiles, rule.radiusTiles);
  const sizeX = readNonNegativeNumber(collision?.sizeX, collisionRadius);
  const sizeY = readNonNegativeNumber(collision?.sizeY, collisionRadius);
  const clearance = readNumberTuple(collision?.clearanceSize);
  const footprintHalfWidth = Math.max(sizeX, clearance?.[0] ?? 0, collisionRadius);
  const footprintHalfHeight = Math.max(sizeY, clearance?.[1] ?? 0, collisionRadius);
  const obstructionType = readNonNegativeNumber(collision?.obstructionType, 0);
  const obstructionClass = readNonNegativeNumber(collision?.obstructionClass, 0);
  const canBeBuiltOn = readNonNegativeNumber(collision?.canBeBuiltOn, 0) !== 0;
  const terrainRestriction = readOptionalInteger(movement?.terrainRestriction);
  const flyMode = readNonNegativeNumber(movement?.flyMode, 0);
  const typeName = typeof rule.typeName === "string" ? rule.typeName : undefined;
  const token = rule.token;
  const occupancyContext: {
    speedFpPerSecond: number;
    footprintHalfWidth: number;
    footprintHalfHeight: number;
    obstructionType: number;
    canBeBuiltOn: boolean;
    typeName?: string;
    token?: RulesetUnit["token"];
  } = {
    speedFpPerSecond: rule.speedFpPerSecond,
    footprintHalfWidth,
    footprintHalfHeight,
    obstructionType,
    canBeBuiltOn,
    token
  };
  if (typeName !== undefined) {
    occupancyContext.typeName = typeName;
  }
  const occupancyKind = chooseOccupancyKind(occupancyContext);

  return dropUndefined({
    terrainRestrictionId: terrainRestriction,
    flyMode,
    collisionRadiusFp: toFixedPoint(collisionRadius),
    footprintHalfWidthFp: toFixedPoint(footprintHalfWidth),
    footprintHalfHeightFp: toFixedPoint(footprintHalfHeight),
    occupancyKind,
    obstructionType,
    obstructionClass,
    canBeBuiltOn,
    typeName,
    token
  }) as EntityPathingProfile;
}

function chooseOccupancyKind(context: {
  readonly speedFpPerSecond: number;
  readonly footprintHalfWidth: number;
  readonly footprintHalfHeight: number;
  readonly obstructionType: number;
  readonly canBeBuiltOn: boolean;
  readonly typeName?: string;
  readonly token?: RulesetUnit["token"];
}): EntityPathingProfile["occupancyKind"] {
  const hasFootprint = context.footprintHalfWidth > 0 && context.footprintHalfHeight > 0;
  if (!hasFootprint || context.canBeBuiltOn) {
    return "none";
  }

  if (context.speedFpPerSecond > 0 && context.obstructionType > 0) {
    return "dynamic";
  }

  if (context.typeName === "building" || context.token === "resource") {
    return "static";
  }

  if (context.speedFpPerSecond <= 0 && context.obstructionType > 0) {
    return "static";
  }

  return "none";
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readNumberTuple(value: unknown): readonly [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }

  const left = value[0];
  const right = value[1];
  if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left) || !Number.isFinite(right)) {
    return undefined;
  }

  return [Math.max(0, left), Math.max(0, right)];
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return value;
}
