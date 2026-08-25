import { checksumStable } from "./checksum";
import { PathingState } from "./systems/occupancy";
import type {
  EntityId,
  EntitySnapshot,
  EvidenceClass,
  FixedPoint,
  PathFailureReason,
  ReplayScenarioV1,
  RouteDiagnostics,
  RulesetUnit,
  RulesetV1,
  SimTimeMs,
  SnapshotRoute,
  SnapshotTask,
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
    };

export interface EntityState {
  id: EntityId;
  kind: string;
  dataId?: number;
  classId?: number;
  label?: string;
  playerId: string;
  hp: number;
  facing: -1 | 1;
  radiusFp: FixedPoint;
  speedFpPerSecond: number;
  pathing: EntityPathingProfile;
  position: FixedPointPosition;
  task: EntityTask;
  lastRoute?: PlannedRoute;
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
  public readonly appliedCommandIds: string[] = [];
  public readonly observedIntentIds: string[] = [];
  public readonly warnings: string[] = [];
  public readonly routeStats: MutableRouteStats = createRouteStats();
  public readonly routeEvents: string[] = [];
  public readonly pathing: PathingState;

  public constructor(
    private readonly scenario: ReplayScenarioV1,
    ruleset: RulesetV1
  ) {
    const rulesByDataId = new Map<number, RulesetUnit>();
    for (const unit of ruleset.units) {
      if (unit.id !== undefined) {
        rulesByDataId.set(unit.id, unit);
      }
    }
    const rulesByKind = new Map(ruleset.units.map((unit) => [unit.kind, unit]));
    const warnedMissingRules = new Set<string>();

    for (const entity of scenario.entities) {
      const resolvedRule = findUnitRule(entity.dataId, entity.kind, rulesByDataId, rulesByKind);
      const rule = resolvedRule ?? fallbackUnit(entity.kind);
      const warningKey = entity.dataId === undefined ? entity.kind : `${entity.dataId}:${entity.kind}`;
      if (!resolvedRule && !warnedMissingRules.has(warningKey)) {
        warnedMissingRules.add(warningKey);
        this.warn(`Missing unit rule for ${warningKey}; using immobile fallback`);
      }

      this.entities.set(entity.id, dropUndefined({
        id: entity.id,
        kind: entity.kind,
        dataId: entity.dataId,
        classId: entity.classId,
        label: entity.label,
        playerId: entity.playerId,
        hp: entity.hp ?? rule.maxHp,
        facing: 1,
        radiusFp: toFixedPoint(rule.radiusTiles),
        speedFpPerSecond: rule.speedFpPerSecond,
        pathing: buildPathingProfile(rule),
        position: {
          xFp: toFixedPoint(entity.position.x),
          yFp: toFixedPoint(entity.position.y),
          evidence: entity.position.evidence
        },
        task: {
          kind: "idle",
          evidence: entity.evidence
        },
        evidence: entity.evidence
      }) as EntityState);
    }

    this.pathing = new PathingState(this.scenario.map, ruleset, this.entities);
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
      provenance: this.scenario.provenance
    };

    return deepFreeze({
      ...body,
      checksum: checksumStable(body)
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
}

export function toFixedPoint(value: number): FixedPoint {
  return Math.round(value * FIXED_POINT_SCALE);
}

export function fromFixedPoint(value: FixedPoint): number {
  return Number((value / FIXED_POINT_SCALE).toFixed(3));
}

function snapshotTask(task: EntityTask, lastRoute: PlannedRoute | undefined): SnapshotTask {
  if (task.kind === "idle") {
    return dropUndefined({
      kind: "idle",
      evidence: task.evidence,
      route: lastRoute && lastRoute.status !== "planned" ? snapshotRoute(lastRoute) : undefined
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

function findUnitRule(
  dataId: number | undefined,
  kind: string,
  rulesByDataId: ReadonlyMap<number, RulesetUnit>,
  rulesByKind: ReadonlyMap<string, RulesetUnit>
): RulesetUnit | undefined {
  if (dataId !== undefined) {
    return rulesByDataId.get(dataId);
  }

  return rulesByKind.get(kind);
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
