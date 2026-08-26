import type {
  CommandDestination,
  EntityId,
  FixedPoint,
  ObservedIntentCommand,
  ReplayCommandBase,
  RulesetUnit,
  SimTimeMs
} from "../../replay/model";
import {
  FIXED_POINT_SCALE,
  fromFixedPoint,
  toFixedPoint,
  type ActiveCombatState,
  type CombatIntentState,
  type CombatProjectileState,
  type CombatVectorEntryState,
  type DamageCalculationState,
  type DamageEventState,
  type EntityState,
  type PlannedRoute,
  type WorldState
} from "../world";
import type { SimulationStepContext } from "../step-context";
import { cancelWorkerTaskForCommand } from "./economy";

const EXPLICIT_ATTACK_KINDS = new Set(["ATTACK", "ATTACK_OBJECT", "ATTACK_MOVE"]);
const GROUND_ATTACK_KINDS = new Set(["ATTACK_GROUND"]);
const ACQUISITION_RADIUS_FP = toFixedPoint(6);
const MELEE_CONTACT_PADDING_FP = toFixedPoint(0.12);
const APPROACH_PADDING_FP = toFixedPoint(0.2);
const FRAME_RATE = 30;

export function applyCombatIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  if (command.rawKind === "STOP") {
    for (const actorId of command.actorIds) {
      const actor = world.entities.get(actorId);
      if (actor) {
        cancelCombatForCommand(world, actor);
      }
    }
    return false;
  }

  if (GROUND_ATTACK_KINDS.has(command.rawKind)) {
    return recordGroundAttackIntent(world, command);
  }

  const explicitAttack = EXPLICIT_ATTACK_KINDS.has(command.rawKind);
  const target = command.targetId ? world.entities.get(command.targetId) : undefined;
  if (!explicitAttack && !isCombatOrder(world, command, target)) {
    return false;
  }

  world.combatStats.observedIntentCount += 1;
  let handled = false;
  for (const actorId of command.actorIds) {
    const actor = world.entities.get(actorId);
    if (!actor) {
      world.combatStats.unresolvedAttackIntents += 1;
      world.recordCombatDivergence(`unresolved combat actor ${actorId}`, command.id);
      world.recordCombatEvent(`unresolved intent ${command.id}: missing actor ${actorId}`);
      handled = true;
      continue;
    }

    const intent = createIntent(command, {
      resolution: target ? "resolved-target" : "unresolved-target",
      targetId: command.targetId,
      reason: target ? undefined : "target id did not resolve in scenario entity set"
    });
    ensureCombat(actor).intent = intent;
    world.markRenderDirty(actor);

    if (!target) {
      world.combatStats.unresolvedAttackIntents += 1;
      world.recordCombatDivergence(`unresolved combat target ${command.targetId ?? "none"}`, command.id);
      world.recordCombatEvent(`unresolved intent ${command.id}: missing target ${command.targetId ?? "none"}`);
      handled = true;
      continue;
    }

    const profile = readCombatProfile(world, actor);
    if (!profile) {
      markUnsupportedIntent(world, actor, intent, `actor ${actor.id} has no represented attack vector`);
      handled = true;
      continue;
    }

    if (!canAttackTarget(world, actor, target, explicitAttack)) {
      markUnsupportedIntent(world, actor, intent, `target ${target.id} is not a represented hostile combat target`);
      handled = true;
      continue;
    }

    startCombatEpisode(world, actor, target, intent, profile);
    handled = true;
  }

  return handled;
}

export function reconcileObservedActorActivity(world: WorldState, command: ReplayCommandBase): void {
  for (const actorId of command.actorIds) {
    const actor = world.entities.get(actorId);
    if (!actor || actor.lifecycle.state !== "dead" || actor.lifecycle.evidence !== "simulated") {
      continue;
    }

    const previousDeathAtMs = actor.lifecycle.deadAtMs;
    actor.lifecycle = dropUndefined({
      state: "alive",
      evidence: "reconciled",
      reconciledAtMs: world.timeMs,
      correctionReason: `observed actor activity in ${command.id}`,
      previousDeathAtMs
    }) as EntityState["lifecycle"];
    actor.hp = Math.max(1, Math.min(actor.maxHp, actor.hp || Math.ceil(actor.maxHp / 4)));
    actor.evidence = "reconciled";
    const combat = ensureCombat(actor);
    delete combat.active;
    world.dynamicCollisionIndex.update(actor);
    world.markRenderDirty(actor);
    world.markTreeActiveSetDirtyForEntity(actor);
    world.combatStats.reconciliations += 1;
    world.recordCombatReconciliation(`reconciled ${actor.id}: observed actor in ${command.id} after simulated death`);
    if (actor.pathing.occupancyKind === "static") {
      world.pathing.rebuildStaticObstacles(world.entities);
    }
  }
}

export function cancelCombatForCommand(world: WorldState, entity: EntityState): void {
  if (!entity.combat?.active && !entity.combat?.intent) {
    return;
  }

  delete entity.combat.active;
  if (entity.task.kind === "attacking") {
    entity.task = {
      kind: "idle",
      evidence: "simulated"
    };
  }
  world.markRenderDirty(entity);
}

export function advanceCombat(world: WorldState, deltaMs: SimTimeMs, context: SimulationStepContext): void {
  if (deltaMs <= 0) {
    return;
  }

  resolveProjectileImpacts(world, world.timeMs);

  for (const attacker of context.attackerEntities) {
    if (attacker.lifecycle.state !== "alive" || !attacker.combat?.active) {
      continue;
    }
    advanceAttacker(world, attacker, context);
  }

  resolveProjectileImpacts(world, world.timeMs + deltaMs);
}

export function hasCombatState(world: WorldState, context?: SimulationStepContext): boolean {
  if (world.combatProjectiles.size > 0) {
    return true;
  }

  for (const entity of context?.attackerEntities ?? world.activeSimulationEntities()) {
    if (entity.lifecycle.state === "alive" && entity.combat?.active && entity.combat.active.state !== "unsupported") {
      return true;
    }
  }

  return false;
}

function recordGroundAttackIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  world.combatStats.observedIntentCount += 1;
  world.combatStats.unsupportedIntents += 1;
  world.recordCombatUnsupported("attack-ground projectile area damage is deferred", command.id);

  let handled = false;
  for (const actorId of command.actorIds) {
    const actor = world.entities.get(actorId);
    if (!actor) {
      world.combatStats.unresolvedAttackIntents += 1;
      world.recordCombatDivergence(`unresolved attack-ground actor ${actorId}`, command.id);
      handled = true;
      continue;
    }

    const intent = createIntent(command, {
      resolution: "ground-unsupported",
      reason: "attack-ground has no target entity; area damage is intentionally deferred"
    });
    ensureCombat(actor).intent = intent;
    ensureCombat(actor).active = {
      id: world.createCombatEpisodeId("ground"),
      state: "unsupported",
      targetSource: "command",
      startedAtMs: world.timeMs,
      lastStateChangeMs: world.timeMs,
      nextAttackReadyAtMs: world.timeMs,
      reloadMs: 0,
      minRangeFp: 0,
      maxRangeFp: 0,
      retargetCount: 0,
      unsupportedMechanic: "attack-ground area damage"
    };
    world.markRenderDirty(actor);
    world.recordCombatEvent(`unsupported ${command.id}: attack-ground intent from ${actor.id}`);
    handled = true;
  }

  return handled || command.actorIds.length === 0;
}

function isCombatOrder(
  world: WorldState,
  command: ObservedIntentCommand,
  target: EntityState | undefined
): boolean {
  if (command.rawKind !== "ORDER" || !target) {
    return false;
  }

  for (const actorId of command.actorIds) {
    const actor = world.entities.get(actorId);
    if (!actor || !readCombatProfile(world, actor)) {
      continue;
    }
    if (canAttackTarget(world, actor, target, false)) {
      return true;
    }
  }

  return false;
}

function createIntent(
  command: ObservedIntentCommand,
  resolution: {
    readonly resolution: CombatIntentState["resolution"];
    readonly targetId?: EntityId | undefined;
    readonly reason?: string | undefined;
  }
): CombatIntentState {
  return dropUndefined({
    commandId: command.id,
    rawKind: command.rawKind,
    issuedAtMs: command.issuedAtMs,
    sourceSequence: command.sourceSequence,
    targetId: resolution.targetId,
    destination: command.destination,
    evidence: command.evidence,
    resolution: resolution.resolution,
    reason: resolution.reason
  }) as CombatIntentState;
}

function startCombatEpisode(
  world: WorldState,
  actor: EntityState,
  target: EntityState,
  intent: CombatIntentState,
  profile: CombatProfile
): void {
  cancelWorkerTaskForCommand(world, actor);
  actor.combat = {
    ...actor.combat,
    intent,
    active: {
      id: world.createCombatEpisodeId("target"),
      state: "closing",
      targetId: target.id,
      targetSource: "command",
      startedAtMs: world.timeMs,
      lastStateChangeMs: world.timeMs,
      nextAttackReadyAtMs: world.timeMs,
      reloadMs: profile.reloadMs,
      minRangeFp: profile.minRangeFp,
      maxRangeFp: profile.maxRangeFp,
      retargetCount: 0
    }
  };
  actor.task = {
    kind: "idle",
    evidence: "simulated"
  };
  world.markRenderDirty(actor);
  world.combatStats.resolvedAttackIntents += 1;
  world.recordCombatEvent(`intent ${intent.commandId}: ${actor.id} targets ${target.id}`);
}

function markUnsupportedIntent(
  world: WorldState,
  actor: EntityState,
  intent: CombatIntentState,
  reason: string
): void {
  ensureCombat(actor).active = dropUndefined({
    id: world.createCombatEpisodeId("unsupported"),
    state: "unsupported",
    targetId: intent.targetId,
    targetSource: "command",
    startedAtMs: world.timeMs,
    lastStateChangeMs: world.timeMs,
    nextAttackReadyAtMs: world.timeMs,
    reloadMs: 0,
    minRangeFp: 0,
    maxRangeFp: 0,
    retargetCount: 0,
    unsupportedMechanic: reason
  }) as ActiveCombatState;
  world.combatStats.unsupportedIntents += 1;
  world.markRenderDirty(actor);
  world.recordCombatUnsupported(reason, intent.commandId);
  world.recordCombatEvent(`unsupported ${intent.commandId}: ${reason}`);
}

function advanceAttacker(world: WorldState, attacker: EntityState, context: SimulationStepContext): void {
  const combat = attacker.combat;
  const active = combat?.active;
  if (!combat || !active) {
    return;
  }
  if (active.state === "unsupported") {
    return;
  }

  const profile = readCombatProfile(world, attacker);
  if (!profile) {
    active.state = "unsupported";
    active.unsupportedMechanic = "attacker lost represented combat profile";
    world.recordCombatUnsupported(active.unsupportedMechanic, combat.intent?.commandId);
    world.markRenderDirty(attacker);
    return;
  }

  const target = resolveActiveTarget(world, attacker, active, profile, context);
  if (!target) {
    return;
  }

  const distanceFp = distanceBetween(attacker, target);
  active.lastDistanceFp = distanceFp;
  active.inRange = isInRange(attacker, target, profile, distanceFp);

  if (!active.inRange) {
    setCombatState(active, "closing", world.timeMs);
    planApproachRoute(world, attacker, target, active, profile, combat.intent);
    return;
  }

  if (attacker.task.kind === "moving") {
    attacker.lastRoute = attacker.task.route;
    attacker.task = {
      kind: "idle",
      evidence: "simulated"
    };
    world.markRenderDirty(attacker);
  }

  const facing = target.position.xFp < attacker.position.xFp ? -1 : 1;
  if (attacker.facing !== facing) {
    attacker.facing = facing;
    world.markRenderDirty(attacker);
  }
  const commandId = combat.intent?.commandId ?? active.id;
  const sourceSequence = combat.intent?.sourceSequence ?? active.startedAtMs;
  attacker.task = {
    kind: "attacking",
    commandId,
    targetId: target.id,
    evidence: "simulated",
    sourceSequence
  };
  world.markRenderDirty(attacker);

  if (world.timeMs < active.nextAttackReadyAtMs) {
    setCombatState(active, "reloading", world.timeMs);
    return;
  }

  performAttack(world, attacker, target, active, profile, commandId);
}

function resolveActiveTarget(
  world: WorldState,
  attacker: EntityState,
  active: ActiveCombatState,
  profile: CombatProfile,
  context: SimulationStepContext
): EntityState | undefined {
  const current = active.targetId ? world.entities.get(active.targetId) : undefined;
  if (current && current.lifecycle.state === "alive" && canAttackTarget(world, attacker, current, true)) {
    return current;
  }

  const next = acquireTarget(world, attacker, profile, context);
  if (!next) {
    delete active.targetId;
    delete active.inRange;
    setCombatState(active, "retargeting", world.timeMs);
    if (attacker.task.kind === "attacking") {
      attacker.task = {
        kind: "idle",
        evidence: "simulated"
      };
      world.markRenderDirty(attacker);
    }
    const combat = ensureCombat(attacker);
    delete combat.active;
    world.markRenderDirty(attacker);
    world.recordCombatEvent(`combat ${active.id}: no retarget for ${attacker.id}`);
    return undefined;
  }

  active.targetId = next.id;
  active.targetSource = "acquired";
  delete active.routeTargetId;
  active.retargetCount += 1;
  world.combatStats.retargets += 1;
  setCombatState(active, "retargeting", world.timeMs);
  world.markRenderDirty(attacker);
  world.recordCombatEvent(`retarget ${attacker.id}: ${next.id}`);
  return next;
}

function acquireTarget(
  world: WorldState,
  attacker: EntityState,
  profile: CombatProfile,
  context: SimulationStepContext
): EntityState | undefined {
  const radiusFp = Math.max(profile.maxRangeFp + ACQUISITION_RADIUS_FP, toFixedPoint(2));
  const candidates = context.activeEntities
    .filter(
      (target) =>
        target.id !== attacker.id &&
        target.lifecycle.state === "alive" &&
        canAttackTarget(world, attacker, target, true)
    )
    .map((target) => ({
      target,
      distanceFp: distanceBetween(attacker, target)
    }))
    .filter((candidate) => candidate.distanceFp <= radiusFp)
    .sort(
      (left, right) =>
        left.distanceFp - right.distanceFp ||
        left.target.playerId.localeCompare(right.target.playerId) ||
        left.target.id.localeCompare(right.target.id)
    );

  return candidates[0]?.target;
}

function planApproachRoute(
  world: WorldState,
  attacker: EntityState,
  target: EntityState,
  active: ActiveCombatState,
  profile: CombatProfile,
  intent: CombatIntentState | undefined
): void {
  if (attacker.task.kind === "moving" && active.routeTargetId === target.id) {
    return;
  }

  const candidates = approachCandidates(attacker, target, profile);
  const commandId = intent?.commandId ? `combat:${intent.commandId}:${attacker.id}` : active.id;
  const sourceSequence = intent?.sourceSequence ?? active.startedAtMs;
  let firstFailedRoute: PlannedRoute | undefined;

  for (const destination of candidates) {
    const route = world.pathing.planRoute(
      attacker,
      destination,
      {
        commandId,
        plannedAtMs: world.timeMs,
        sourceSequence,
        evidence: "simulated",
        ignoreDynamicActorIds: [attacker.id]
      },
      world.entities
    );
    if (route.status === "failed") {
      firstFailedRoute ??= route;
      continue;
    }

    attacker.lastRoute = route;
    attacker.task = {
      kind: "moving",
      commandId: route.commandId,
      destination: route.destination,
      evidence: "simulated",
      sourceSequence,
      route
    };
    active.routeTargetId = target.id;
    world.routeStats.planned += 1;
    world.markRenderDirty(attacker);
    world.recordRouteEvent(`planned ${route.commandId} ${attacker.id}: combat approach ${target.id}`);
    return;
  }

  const failedRoute = firstFailedRoute ?? createFallbackRoute(world, attacker, target, commandId, sourceSequence);
  attacker.lastRoute = failedRoute;
  attacker.task = {
    kind: "path-failed",
    commandId: failedRoute.commandId,
    destination: failedRoute.destination,
    evidence: "simulated",
    sourceSequence,
    route: failedRoute
  };
  active.routeTargetId = target.id;
  active.unsupportedMechanic = failedRoute.failureDetail ?? "no legal path into attack range";
  world.routeStats.failed += 1;
  world.markRenderDirty(attacker);
  world.recordRouteEvent(`failed ${failedRoute.commandId} ${attacker.id}: combat approach`);
  world.recordCombatDivergence(active.unsupportedMechanic, intent?.commandId);
}

function approachCandidates(
  attacker: EntityState,
  target: EntityState,
  profile: CombatProfile
): readonly CommandDestination[] {
  const desiredDistanceFp = desiredAttackDistanceFp(attacker, target, profile);
  const baseDx = attacker.position.xFp - target.position.xFp;
  const baseDy = attacker.position.yFp - target.position.yFp;
  const directions: Direction[] = [];
  const baseDistance = integerSqrt(baseDx * baseDx + baseDy * baseDy);

  if (baseDistance > 0) {
    directions.push({
      dxFp: Math.trunc((baseDx * FIXED_POINT_SCALE) / baseDistance),
      dyFp: Math.trunc((baseDy * FIXED_POINT_SCALE) / baseDistance)
    });
  }

  directions.push(
    { dxFp: FIXED_POINT_SCALE, dyFp: 0 },
    { dxFp: 0, dyFp: FIXED_POINT_SCALE },
    { dxFp: -FIXED_POINT_SCALE, dyFp: 0 },
    { dxFp: 0, dyFp: -FIXED_POINT_SCALE },
    { dxFp: 707, dyFp: 707 },
    { dxFp: -707, dyFp: 707 },
    { dxFp: -707, dyFp: -707 },
    { dxFp: 707, dyFp: -707 }
  );

  const seen = new Set<string>();
  return directions
    .map((direction) => ({
      xFp: target.position.xFp + Math.trunc((direction.dxFp * desiredDistanceFp) / FIXED_POINT_SCALE),
      yFp: target.position.yFp + Math.trunc((direction.dyFp * desiredDistanceFp) / FIXED_POINT_SCALE)
    }))
    .filter((point) => {
      const key = `${point.xFp},${point.yFp}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        distanceSquared(attacker.position.xFp, attacker.position.yFp, left.xFp, left.yFp) -
          distanceSquared(attacker.position.xFp, attacker.position.yFp, right.xFp, right.yFp) ||
        left.xFp - right.xFp ||
        left.yFp - right.yFp
    )
    .map((point) => ({
      x: fromFixedPoint(point.xFp),
      y: fromFixedPoint(point.yFp),
      source: "point",
      evidence: "simulated",
      isMapCoordinate: true
    }));
}

function createFallbackRoute(
  world: WorldState,
  attacker: EntityState,
  target: EntityState,
  commandId: string,
  sourceSequence: number
): PlannedRoute {
  const destination = {
    xFp: target.position.xFp,
    yFp: target.position.yFp
  };
  return {
    commandId,
    status: "failed",
    plannedAtMs: world.timeMs,
    staticVersion: world.pathing.staticVersion,
    actorRadiusFp: attacker.pathing.collisionRadiusFp,
    destination,
    sourceSequence,
    evidence: "simulated",
    waypoints: [],
    nextWaypointIndex: 0,
    pathNodeCount: 0,
    searchedNodeCount: 0,
    failureReason: "no-route",
    failureDetail: "no legal path into attack range",
    blockedStepCount: 0,
    ignoreDynamicActorIds: [attacker.id]
  };
}

function performAttack(
  world: WorldState,
  attacker: EntityState,
  target: EntityState,
  active: ActiveCombatState,
  profile: CombatProfile,
  commandId: string
): void {
  const calculation = calculateDamage(world, attacker, target);
  if (!calculation) {
    active.state = "unsupported";
    active.unsupportedMechanic = "damage calculation has no represented attack and armor class overlap";
    active.lastStateChangeMs = world.timeMs;
    world.recordCombatUnsupported(active.unsupportedMechanic, commandId);
    return;
  }

  setCombatState(active, "reloading", world.timeMs);
  active.nextAttackReadyAtMs = world.timeMs + profile.reloadMs;
  world.markRenderDirty(attacker);

  if (profile.projectileUnitId !== undefined && profile.projectileUnitId >= 0 && profile.maxRangeFp > 0) {
    launchProjectile(world, attacker, target, profile, calculation, commandId);
    return;
  }

  world.combatStats.meleeContacts += 1;
  world.recordCombatEvent(`contact ${attacker.id} -> ${target.id}`);
  const event = applyDamage(world, attacker, target, calculation, {
    source: "melee",
    commandId,
    timeMs: world.timeMs
  });
  active.lastDamage = event;
  ensureCombat(attacker).lastDamage = event;
}

function launchProjectile(
  world: WorldState,
  attacker: EntityState,
  target: EntityState,
  profile: CombatProfile,
  calculation: DamageCalculationState,
  commandId: string
): void {
  const projectileRule =
    profile.projectileUnitId === undefined ? undefined : world.resolveUnitRule(profile.projectileUnitId, undefined);
  const speedFpPerSecond = Math.max(1, projectileRule?.speedFpPerSecond ?? toFixedPoint(7));
  const frameDelayMs = Math.max(0, profile.frameDelayMs);
  const travelDistanceFp = distanceBetween(attacker, target);
  const travelMs = Math.max(1, Math.ceil((travelDistanceFp * 1000) / speedFpPerSecond));
  const projectile: CombatProjectileState = dropUndefined({
    id: world.createProjectileId(),
    attackerId: attacker.id,
    targetId: target.id,
    launchedAtMs: world.timeMs + frameDelayMs,
    impactAtMs: world.timeMs + frameDelayMs + travelMs,
    startXFp: attacker.position.xFp,
    startYFp: attacker.position.yFp,
    targetXFp: target.position.xFp,
    targetYFp: target.position.yFp,
    projectileRuleId: projectileRule?.id,
    projectileKind: projectileRule?.kind,
    speedFpPerSecond,
    commandId,
    damage: calculation,
    evidence: "simulated"
  }) as CombatProjectileState;

  world.combatProjectiles.set(projectile.id, projectile);
  world.combatStats.projectilesLaunched += 1;
  world.markRenderDirty(attacker);
  world.recordCombatEvent(
    `projectile ${projectile.id}: ${attacker.id} -> ${target.id} impact ${projectile.impactAtMs}ms`
  );
}

function resolveProjectileImpacts(world: WorldState, upToTimeMs: SimTimeMs): void {
  const due = [...world.combatProjectiles.values()]
    .filter((projectile) => projectile.impactAtMs <= upToTimeMs)
    .sort((left, right) => left.impactAtMs - right.impactAtMs || left.id.localeCompare(right.id));

  for (const projectile of due) {
    world.combatProjectiles.delete(projectile.id);
    world.combatStats.projectilesImpacted += 1;
    const attacker = world.entities.get(projectile.attackerId);
    const target = world.entities.get(projectile.targetId);
    if (!attacker || !target || target.lifecycle.state !== "alive") {
      world.recordCombatEvent(`projectile ${projectile.id}: target unavailable at impact`, projectile.impactAtMs);
      continue;
    }

    const event = applyDamage(world, attacker, target, projectile.damage, dropUndefined({
      source: "projectile",
      projectileId: projectile.id,
      commandId: projectile.commandId,
      timeMs: projectile.impactAtMs
    }));
    const active = attacker.combat?.active;
    if (active) {
      active.lastDamage = event;
    }
    ensureCombat(attacker).lastDamage = event;
  }
}

function applyDamage(
  world: WorldState,
  attacker: EntityState,
  target: EntityState,
  calculation: DamageCalculationState,
  context: {
    readonly source: "melee" | "projectile";
    readonly timeMs: SimTimeMs;
    readonly projectileId?: string | undefined;
    readonly commandId?: string | undefined;
  }
): DamageEventState {
  const hpBefore = target.hp;
  const wasTreeActivationRelevant = world.treeActiveSet.entityCanAffectActivation(world, target);
  target.hp = Math.max(0, target.hp - calculation.appliedDamage);
  const event = dropUndefined({
    id: world.createDamageEventId(),
    timeMs: context.timeMs,
    attackerId: attacker.id,
    targetId: target.id,
    amount: calculation.appliedDamage,
    targetHpBefore: hpBefore,
    targetHpAfter: target.hp,
    source: context.source,
    projectileId: context.projectileId,
    commandId: context.commandId,
    calculation,
    evidence: "simulated"
  }) as DamageEventState;

  world.combatStats.damageEvents += 1;
  world.markRenderDirty(target);
  world.combatDamageEvents.push(event);
  if (world.combatDamageEvents.length > 40) {
    world.combatDamageEvents.shift();
  }
  world.recordCombatEvent(
    `damage ${event.amount} ${attacker.id} -> ${target.id}: ` +
      `${hpBefore}/${target.maxHp} to ${target.hp}/${target.maxHp}`,
    context.timeMs
  );

  if (target.hp <= 0) {
    markDead(world, target, attacker, event, wasTreeActivationRelevant);
  }

  return event;
}

function markDead(
  world: WorldState,
  target: EntityState,
  attacker: EntityState,
  event: DamageEventState,
  wasTreeActivationRelevant: boolean
): void {
  if (target.lifecycle.state === "dead") {
    return;
  }

  const wasTrackedTree = world.isTrackedTreeResource(target, target.resourceNode);
  target.lifecycle = {
    state: "dead",
    evidence: "simulated",
    deadAtMs: event.timeMs,
    killedById: attacker.id,
    deathReason: "combat"
  };
  target.task = {
    kind: "idle",
    evidence: "simulated"
  };
  const targetCombat = ensureCombat(target);
  delete targetCombat.active;
  delete target.workerTask;
  world.dynamicCollisionIndex.remove(target);
  world.markRenderDirty(target);
  world.combatStats.deaths += 1;
  world.combatDeaths.push(event);
  if (world.combatDeaths.length > 40) {
    world.combatDeaths.shift();
  }
  world.recordCombatEvent(`death ${target.id} killed by ${attacker.id}`, event.timeMs);
  if (target.pathing.occupancyKind === "static") {
    world.pathing.rebuildStaticObstacles(world.entities);
  }
  if (wasTrackedTree) {
    world.rebuildTreeTopology();
  } else if (wasTreeActivationRelevant) {
    world.markTreeActiveSetDirty();
  }
}

function calculateDamage(
  world: WorldState,
  attacker: EntityState,
  target: EntityState
): DamageCalculationState | undefined {
  const attackerRule = world.resolveUnitRule(attacker.dataId, attacker.kind);
  const targetRule = world.resolveUnitRule(target.dataId, target.kind);
  const attackVector = readCombatVector(attackerRule?.combat?.attacks);
  const armorVector = readCombatVector(targetRule?.combat?.armors);
  if (!attackVector.length || !armorVector.length) {
    return undefined;
  }

  const armorByClass = new Map(armorVector.map((entry) => [entry.classId, entry.amount]));
  const matches = [];
  const skippedAttackClasses = [];
  let rawDamage = 0;

  for (const attack of attackVector) {
    const armor = armorByClass.get(attack.classId);
    if (armor === undefined) {
      skippedAttackClasses.push(attack.classId);
      continue;
    }

    const appliedAmount = Math.max(0, attack.amount - armor);
    rawDamage += appliedAmount;
    matches.push({
      classId: attack.classId,
      attackAmount: attack.amount,
      armorAmount: armor,
      appliedAmount
    });
  }

  if (!matches.length) {
    return undefined;
  }

  const appliedDamage = Math.max(1, Math.trunc(rawDamage));
  return dropUndefined({
    attackerRuleId: attackerRule?.id,
    attackerKind: attackerRule?.kind ?? attacker.kind,
    targetRuleId: targetRule?.id,
    targetKind: targetRule?.kind ?? target.kind,
    attackVector,
    armorVector,
    matches,
    skippedAttackClasses,
    rawDamage,
    appliedDamage,
    minimumDamageApplied: appliedDamage === 1 && rawDamage < 1
  }) as DamageCalculationState;
}

function canAttackTarget(
  world: WorldState,
  actor: EntityState,
  target: EntityState,
  explicitAttack: boolean
): boolean {
  if (target.lifecycle.state !== "alive" || actor.id === target.id) {
    return false;
  }

  const targetRule = world.resolveUnitRule(target.dataId, target.kind);
  if (!targetRule?.combat || target.maxHp <= 0) {
    return false;
  }

  if (world.areHostilePlayers(actor.playerId, target.playerId)) {
    return explicitAttack || !isHerdableOrPassiveResource(target, targetRule);
  }

  if (target.playerId === "gaia") {
    return hasPositiveAttack(targetRule);
  }

  return explicitAttack && actor.playerId !== target.playerId;
}

function isHerdableOrPassiveResource(entity: EntityState, rule: RulesetUnit): boolean {
  if (entity.resourceNode && !hasPositiveAttack(rule)) {
    return true;
  }

  const label = `${entity.kind} ${entity.label ?? ""} ${rule.label ?? ""}`.toLowerCase();
  return /\b(sheep|goat|turkey|cow|pig|llama|deer|zebra|ostrich|ibex|forage|tree|mine|gold|stone)\b/.test(label);
}

function isInRange(
  attacker: EntityState,
  target: EntityState,
  profile: CombatProfile,
  distanceFp: FixedPoint
): boolean {
  const maxRangeFp = effectiveMaxRangeFp(attacker, target, profile);
  const minRangeFp = profile.minRangeFp;
  return distanceFp <= maxRangeFp && distanceFp >= minRangeFp;
}

function desiredAttackDistanceFp(attacker: EntityState, target: EntityState, profile: CombatProfile): FixedPoint {
  if (profile.maxRangeFp <= 0) {
    return attacker.radiusFp + target.radiusFp + MELEE_CONTACT_PADDING_FP;
  }

  const safeMinimum = profile.minRangeFp > 0 ? profile.minRangeFp + APPROACH_PADDING_FP : 0;
  return Math.max(safeMinimum, Math.max(APPROACH_PADDING_FP, profile.maxRangeFp - APPROACH_PADDING_FP));
}

function effectiveMaxRangeFp(attacker: EntityState, target: EntityState, profile: CombatProfile): FixedPoint {
  if (profile.maxRangeFp <= 0) {
    return attacker.radiusFp + target.radiusFp + MELEE_CONTACT_PADDING_FP;
  }

  return profile.maxRangeFp + target.radiusFp;
}

function readCombatProfile(world: WorldState, entity: EntityState): CombatProfile | undefined {
  const rule = world.resolveUnitRule(entity.dataId, entity.kind);
  const attacks = readCombatVector(rule?.combat?.attacks);
  if (!rule?.combat || !attacks.some((attack) => attack.amount > 0)) {
    return undefined;
  }

  const maxRangeFp = toFixedPoint(readNumber(rule.combat.maxRange, 0));
  return dropUndefined({
    rule,
    attacks,
    minRangeFp: toFixedPoint(readNumber(rule.combat.minRange, 0)),
    maxRangeFp,
    reloadMs: Math.max(world.ruleset.stepMs, Math.round(readNumber(rule.combat.reloadTime, 1) * 1000)),
    frameDelayMs: Math.round((readNumber(rule.combat.frameDelay, 0) * 1000) / FRAME_RATE),
    projectileUnitId: readInteger(rule.combat.projectileUnitId)
  }) as CombatProfile;
}

function readCombatVector(value: unknown): readonly CombatVectorEntryState[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): CombatVectorEntryState | undefined => {
      if (!entry || typeof entry !== "object") {
        return undefined;
      }
      const record = entry as Record<string, unknown>;
      const classId = readInteger(record.classId);
      const amount = readNumber(record.amount, Number.NaN);
      if (classId === undefined || !Number.isFinite(amount)) {
        return undefined;
      }
      return {
        classId,
        amount
      };
    })
    .filter((entry): entry is CombatVectorEntryState => Boolean(entry));
}

function hasPositiveAttack(rule: RulesetUnit): boolean {
  return readCombatVector(rule.combat?.attacks).some((attack) => attack.amount > 0);
}

function ensureCombat(entity: EntityState): NonNullable<EntityState["combat"]> {
  entity.combat ??= {};
  return entity.combat;
}

function setCombatState(active: ActiveCombatState, state: ActiveCombatState["state"], timeMs: SimTimeMs): void {
  if (active.state === state) {
    return;
  }

  active.state = state;
  active.lastStateChangeMs = timeMs;
}

function distanceBetween(left: EntityState, right: EntityState): FixedPoint {
  return integerSqrt(
    distanceSquared(left.position.xFp, left.position.yFp, right.position.xFp, right.position.yFp)
  );
}

function distanceSquared(leftX: FixedPoint, leftY: FixedPoint, rightX: FixedPoint, rightY: FixedPoint): number {
  const dx = leftX - rightX;
  const dy = leftY - rightY;
  return dx * dx + dy * dy;
}

function integerSqrt(value: number): number {
  return Math.floor(Math.sqrt(value));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }

  return value;
}

interface CombatProfile {
  readonly rule: RulesetUnit;
  readonly attacks: readonly CombatVectorEntryState[];
  readonly minRangeFp: FixedPoint;
  readonly maxRangeFp: FixedPoint;
  readonly reloadMs: SimTimeMs;
  readonly frameDelayMs: SimTimeMs;
  readonly projectileUnitId?: number | undefined;
}

interface Direction {
  readonly dxFp: FixedPoint;
  readonly dyFp: FixedPoint;
}
