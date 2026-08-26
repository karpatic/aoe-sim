import type { EntityId, FixedPoint, PathFailureReason } from "../../replay/model";
import { fromFixedPoint, type EntityState, type PlannedRoute, type RouteCorrection, type WorldState } from "../world";

const REPLAN_AFTER_BLOCKED_STEPS = 4;

export function advanceMovement(world: WorldState, deltaMs: number): void {
  if (deltaMs <= 0) {
    return;
  }

  const activeEntities = world.activeSimulationEntities();
  const dynamicCollisionIndex = new DynamicCollisionIndex(activeEntities);
  const entities = activeEntities
    .filter(
      (entity) =>
        entity.lifecycle.state === "alive" &&
        entity.task.kind === "moving" &&
        entity.speedFpPerSecond > 0
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const entity of entities) {
    let travelFp = Math.floor((entity.speedFpPerSecond * deltaMs) / 1000);
    while (travelFp > 0 && entity.task.kind === "moving") {
      const route = entity.task.route;
      if (route.staticVersion !== world.pathing.staticVersion) {
        if (!replanRoute(world, entity, "route-invalidated")) {
          break;
        }
        continue;
      }

      const waypoint = route.waypoints[route.nextWaypointIndex];
      if (!waypoint) {
        completeRoute(world, entity, route);
        break;
      }

      const dx = waypoint.xFp - entity.position.xFp;
      const dy = waypoint.yFp - entity.position.yFp;
      const distanceFp = integerSqrt(dx * dx + dy * dy);
      if (distanceFp <= 0) {
        route.nextWaypointIndex += 1;
        continue;
      }

      const stepFp = Math.min(travelFp, distanceFp);
      const proposed = {
        xFp: entity.position.xFp + Math.trunc((dx * stepFp) / distanceFp),
        yFp: entity.position.yFp + Math.trunc((dy * stepFp) / distanceFp)
      };
      entity.facing = dx < 0 ? -1 : 1;

      const ignoreDynamicActorIds = new Set(route.ignoreDynamicActorIds);
      const occupancy = world.pathing.checkOccupancyAtPosition(
        entity,
        proposed.xFp,
        proposed.yFp,
        ignoreDynamicActorIds,
        world.entities,
        true,
        dynamicCollisionIndex.candidates(entity, proposed.xFp, proposed.yFp)
      );

      if (!occupancy.ok) {
        if (
          tryApplyBump(
            world,
            entity,
            route,
            dx,
            dy,
            distanceFp,
            stepFp,
            occupancy.blockerId,
            dynamicCollisionIndex
          )
        ) {
          break;
        }

        const correction = makeCorrection(
          world,
          occupancy.reason === "static-blocked" ? "static-blocked" : "dynamic-blocked",
          {
            blockerId: occupancy.blockerId,
            tileX: occupancy.tileX,
            tileY: occupancy.tileY
          }
        );
        route.lastCorrection = correction;
        route.blockedStepCount += 1;

        // Route planning models terrain and static footprints, not moving units. Replanning around a
        // dynamic blocker therefore produces the same route and can spiral into repeated A* searches.
        // Keep trying deterministic bumps on later steps and wait when none is currently legal.
        if (correction.reason === "dynamic-blocked") {
          route.blockedStepCount = Math.min(route.blockedStepCount, REPLAN_AFTER_BLOCKED_STEPS);
          break;
        }

        if (route.blockedStepCount >= REPLAN_AFTER_BLOCKED_STEPS) {
          if (!replanRoute(world, entity, correction.reason, correction)) {
            break;
          }
        }
        break;
      }

      entity.position = {
        ...proposed,
        evidence: "simulated"
      };
      dynamicCollisionIndex.update(entity);
      route.blockedStepCount = 0;
      travelFp -= stepFp;

      if (stepFp >= distanceFp) {
        route.nextWaypointIndex += 1;
        if (route.nextWaypointIndex >= route.waypoints.length) {
          completeRoute(world, entity, route);
          break;
        }
      }
    }
  }
}

function completeRoute(world: WorldState, entity: EntityState, route: PlannedRoute): void {
  route.status = "completed";
  route.nextWaypointIndex = route.waypoints.length;
  entity.lastRoute = route;
  entity.task = {
    kind: "idle",
    evidence: "simulated"
  };
  world.routeStats.completed += 1;
  world.recordRouteEvent(`completed ${route.commandId} ${entity.id}`);
}

function failRoute(
  world: WorldState,
  entity: EntityState,
  route: PlannedRoute,
  reason: PathFailureReason,
  detail: string
): void {
  route.status = "failed";
  route.failureReason = reason;
  route.failureDetail = detail;
  entity.lastRoute = route;
  entity.task = {
    kind: "path-failed",
    commandId: route.commandId,
    destination: route.destination,
    evidence: route.evidence,
    sourceSequence: route.sourceSequence,
    route
  };
  world.routeStats.failed += 1;
  world.recordRouteEvent(`failed ${route.commandId} ${entity.id}: ${reason}`);
}

function replanRoute(
  world: WorldState,
  entity: EntityState,
  reason: RouteCorrection["reason"],
  correction?: RouteCorrection
): boolean {
  if (entity.task.kind !== "moving") {
    return false;
  }

  const oldRoute = entity.task.route;
  const destination = {
    x: fromFixedPoint(oldRoute.destination.xFp),
    y: fromFixedPoint(oldRoute.destination.yFp)
  };
  const nextRoute = world.pathing.planRoute(
    entity,
    destination,
    {
      commandId: oldRoute.commandId,
      plannedAtMs: world.timeMs,
      sourceSequence: oldRoute.sourceSequence,
      evidence: oldRoute.evidence,
      ignoreDynamicActorIds: oldRoute.ignoreDynamicActorIds
    },
    world.entities
  );

  world.routeStats.replanned += 1;
  nextRoute.lastCorrection = correction ?? makeCorrection(world, reason, {});
  entity.lastRoute = nextRoute;

  if (nextRoute.status === "failed") {
    failRoute(world, entity, nextRoute, nextRoute.failureReason ?? "no-route", nextRoute.failureDetail ?? reason);
    return false;
  }

  world.recordRouteEvent(`replanned ${nextRoute.commandId} ${entity.id}: ${reason}`);
  entity.task = {
    kind: "moving",
    commandId: nextRoute.commandId,
    destination: nextRoute.destination,
    evidence: nextRoute.evidence,
    sourceSequence: nextRoute.sourceSequence,
    route: nextRoute
  };
  return true;
}

function tryApplyBump(
  world: WorldState,
  entity: EntityState,
  route: PlannedRoute,
  dx: FixedPoint,
  dy: FixedPoint,
  distanceFp: FixedPoint,
  stepFp: FixedPoint,
  blockerId: EntityId | undefined,
  dynamicCollisionIndex: DynamicCollisionIndex
): boolean {
  const unitX = Math.trunc((dx * stepFp) / distanceFp);
  const unitY = Math.trunc((dy * stepFp) / distanceFp);
  const attempts = bumpAttempts(entity.position.xFp, entity.position.yFp, unitX, unitY);
  const ignoreDynamicActorIds = new Set(route.ignoreDynamicActorIds);
  const seen = new Set<string>();

  for (const attempt of attempts) {
    const key = `${attempt.xFp},${attempt.yFp}`;
    if (seen.has(key) || (attempt.xFp === entity.position.xFp && attempt.yFp === entity.position.yFp)) {
      continue;
    }
    seen.add(key);

    const check = world.pathing.checkOccupancyAtPosition(
      entity,
      attempt.xFp,
      attempt.yFp,
      ignoreDynamicActorIds,
      world.entities,
      true,
      dynamicCollisionIndex.candidates(entity, attempt.xFp, attempt.yFp)
    );
    if (!check.ok) {
      continue;
    }

    entity.position = {
      xFp: attempt.xFp,
      yFp: attempt.yFp,
      evidence: "simulated"
    };
    dynamicCollisionIndex.update(entity);
    route.blockedStepCount = 0;
    const wasSameBlocker =
      route.lastCorrection?.reason === "dynamic-blocked" && route.lastCorrection.blockerId === blockerId;
    route.lastCorrection = makeCorrection(world, "dynamic-blocked", {
      blockerId,
      tileX: check.tileX,
      tileY: check.tileY
    });
    world.routeStats.corrected += 1;
    if (!wasSameBlocker) {
      world.recordRouteEvent(`corrected ${route.commandId} ${entity.id}: bumped`);
    }
    return true;
  }

  return false;
}

class DynamicCollisionIndex {
  private readonly buckets = new Map<string, Set<EntityState>>();
  private readonly bucketKeysByEntity = new Map<EntityId, readonly string[]>();

  public constructor(entities: readonly EntityState[]) {
    for (const entity of entities) {
      if (entity.lifecycle.state === "alive" && entity.pathing.occupancyKind === "dynamic") {
        this.add(entity);
      }
    }
  }

  public candidates(entity: EntityState, xFp: FixedPoint, yFp: FixedPoint): Iterable<EntityState> {
    const candidates = new Set<EntityState>();
    for (const key of collisionBucketKeys(xFp, yFp, entity.pathing.collisionRadiusFp)) {
      for (const candidate of this.buckets.get(key) ?? []) {
        candidates.add(candidate);
      }
    }
    return candidates;
  }

  public update(entity: EntityState): void {
    for (const key of this.bucketKeysByEntity.get(entity.id) ?? []) {
      const bucket = this.buckets.get(key);
      bucket?.delete(entity);
      if (bucket?.size === 0) {
        this.buckets.delete(key);
      }
    }
    this.add(entity);
  }

  private add(entity: EntityState): void {
    const keys = collisionBucketKeys(entity.position.xFp, entity.position.yFp, entity.pathing.collisionRadiusFp);
    this.bucketKeysByEntity.set(entity.id, keys);
    for (const key of keys) {
      const bucket = this.buckets.get(key) ?? new Set<EntityState>();
      bucket.add(entity);
      this.buckets.set(key, bucket);
    }
  }
}

function collisionBucketKeys(xFp: FixedPoint, yFp: FixedPoint, radiusFp: FixedPoint): readonly string[] {
  const minX = Math.floor((xFp - radiusFp) / 1000);
  const maxX = Math.floor((xFp + radiusFp) / 1000);
  const minY = Math.floor((yFp - radiusFp) / 1000);
  const maxY = Math.floor((yFp + radiusFp) / 1000);
  const keys: string[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      keys.push(`${x},${y}`);
    }
  }
  return keys;
}

function bumpAttempts(xFp: FixedPoint, yFp: FixedPoint, unitX: FixedPoint, unitY: FixedPoint): readonly Position[] {
  const halfX = Math.trunc(unitX / 2);
  const halfY = Math.trunc(unitY / 2);

  return [
    { xFp: xFp + halfX, yFp: yFp + halfY },
    { xFp: xFp + unitX, yFp },
    { xFp, yFp: yFp + unitY },
    { xFp: xFp - unitY, yFp: yFp + unitX },
    { xFp: xFp + unitY, yFp: yFp - unitX },
    { xFp: xFp + halfX - halfY, yFp: yFp + halfY + halfX },
    { xFp: xFp + halfX + halfY, yFp: yFp + halfY - halfX }
  ];
}

function makeCorrection(
  world: WorldState,
  reason: RouteCorrection["reason"],
  detail: {
    readonly blockerId?: EntityId | undefined;
    readonly tileX?: number | undefined;
    readonly tileY?: number | undefined;
  }
): RouteCorrection {
  const correction: {
    timeMs: number;
    reason: RouteCorrection["reason"];
    blockerId?: EntityId;
    tileX?: number;
    tileY?: number;
  } = {
    timeMs: world.timeMs,
    reason
  };
  if (detail.blockerId !== undefined) {
    correction.blockerId = detail.blockerId;
  }
  if (detail.tileX !== undefined) {
    correction.tileX = detail.tileX;
  }
  if (detail.tileY !== undefined) {
    correction.tileY = detail.tileY;
  }

  return correction;
}

function integerSqrt(value: number): number {
  return Math.floor(Math.sqrt(value));
}

interface Position {
  readonly xFp: FixedPoint;
  readonly yFp: FixedPoint;
}
