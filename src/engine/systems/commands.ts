import type { MoveCommand, ReplayCommand, RulesetV1 } from "../../replay/model";
import { toFixedPoint, type EntityState, type PlannedRoute, type WorldState } from "../world";

export function applyReplayCommand(world: WorldState, command: ReplayCommand, ruleset: RulesetV1): void {
  switch (command.kind) {
    case "move":
      applyMoveCommand(world, command, ruleset);
      return;
    case "observed-intent":
      world.observedIntentIds.push(command.id);
      return;
  }
}

function applyMoveCommand(world: WorldState, command: MoveCommand, ruleset: RulesetV1): void {
  const knownKinds = new Set(ruleset.units.map((unit) => unit.kind));
  const knownDataIds = new Set<number>();
  for (const unit of ruleset.units) {
    if (unit.id !== undefined) {
      knownDataIds.add(unit.id);
    }
  }
  for (const actorId of command.actorIds) {
    const entity = world.entities.get(actorId);
    if (!entity) {
      world.routeStats.unresolvedActors += 1;
      world.recordRouteEvent(`unresolved actor ${actorId} for ${command.id}`);
      continue;
    }

    const resolved = entity.dataId === undefined ? knownKinds.has(entity.kind) : knownDataIds.has(entity.dataId);
    if (!resolved) {
      const identity = entity.dataId === undefined ? entity.kind : `${entity.dataId}:${entity.kind}`;
      world.warn(`Move command ${command.id} references actor with unresolved unit rule ${identity}`);
    }

    applyMoveForEntity(world, command, entity);
  }

  world.appliedCommandIds.push(command.id);
}

function applyMoveForEntity(world: WorldState, command: MoveCommand, entity: EntityState): void {
  const route =
    entity.speedFpPerSecond <= 0
      ? createImmobileRoute(world, command, entity)
      : world.pathing.planRoute(
          entity,
          command.intentDestination,
          {
            commandId: command.id,
            plannedAtMs: world.timeMs,
            sourceSequence: command.sourceSequence,
            evidence: command.evidence,
            ignoreDynamicActorIds: command.actorIds
          },
          world.entities
        );

  entity.lastRoute = route;
  if (route.status === "failed") {
    world.routeStats.failed += 1;
    world.recordRouteEvent(`failed ${command.id} ${entity.id}: ${route.failureReason ?? "unknown"}`);
    entity.task = {
      kind: "path-failed",
      commandId: command.id,
      destination: route.destination,
      evidence: command.evidence,
      sourceSequence: command.sourceSequence,
      route
    };
    return;
  }

  world.routeStats.planned += 1;
  world.recordRouteEvent(
    `planned ${command.id} ${entity.id}: ${route.pathNodeCount} nodes/${route.searchedNodeCount} searched`
  );
  entity.task = {
    kind: "moving",
    commandId: command.id,
    destination: route.destination,
    evidence: command.evidence,
    sourceSequence: command.sourceSequence,
    route
  };
}

function createImmobileRoute(world: WorldState, command: MoveCommand, entity: EntityState): PlannedRoute {
  const route: PlannedRoute = {
    commandId: command.id,
    status: "failed",
    plannedAtMs: world.timeMs,
    staticVersion: world.pathing.staticVersion,
    actorRadiusFp: entity.pathing.collisionRadiusFp,
    destination: {
      xFp: toFixedPoint(command.intentDestination.x),
      yFp: toFixedPoint(command.intentDestination.y)
    },
    sourceSequence: command.sourceSequence,
    evidence: command.evidence,
    waypoints: [],
    nextWaypointIndex: 0,
    pathNodeCount: 0,
    searchedNodeCount: 0,
    failureReason: "actor-immobile",
    failureDetail: "actor has zero movement speed in ruleset",
    blockedStepCount: 0,
    ignoreDynamicActorIds: [...command.actorIds].sort()
  };
  if (entity.pathing.terrainRestrictionId !== undefined) {
    route.terrainRestrictionId = entity.pathing.terrainRestrictionId;
  }

  return route;
}
