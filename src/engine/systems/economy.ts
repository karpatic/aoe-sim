import type {
  CommandDestination,
  EntityId,
  EvidenceClass,
  FixedPoint,
  ObservedIntentCommand,
  PlayerId,
  ResourceKind,
  RulesetUnit,
  SimTimeMs
} from "../../replay/model";
import {
  createLedgerRecord,
  createResourceRecord,
  fromFixedPoint,
  resourceKinds,
  toFixedPoint,
  type BuildWorkerTask,
  type ConstructionState,
  type EntityState,
  type GatherWorkerTask,
  type PlayerEconomyState,
  type PlannedRoute,
  type ProductionQueueItemState,
  type ResourceCostState,
  type ResourceNodeState,
  type WorkerCarryState,
  type WorkerTaskState,
  type WorldState
} from "../world";

const DEFAULT_STARTING_STOCKPILE: Record<ResourceKind, number> = {
  food: 200,
  wood: 200,
  stone: 200,
  gold: 100
};
const RESOURCE_AMOUNT_DEFAULTS: Record<string, number> = {
  tree: 100,
  forage: 125,
  herdable: 100,
  hunt: 140,
  boar: 340,
  gold: 800,
  stone: 800,
  farm: 175
};
const GATHER_RATE_DEFAULTS: Record<string, number> = {
  wood: 0.39,
  forage: 0.31,
  herdable: 0.33,
  hunt: 0.41,
  boar: 0.41,
  gold: 0.38,
  stone: 0.36,
  farm: 0.53
};
const RETARGET_RADIUS_FP = toFixedPoint(8);
const TOUCH_PADDING_FP = toFixedPoint(0.65);
const POPULATION_CAPACITY_BY_BUILDING_ID = new Map<number, number>([
  [70, 5],
  [109, 5],
  [618, 5],
  [619, 5],
  [620, 5]
]);
const COMMON_DROP_SITES: Record<ResourceKind, readonly number[]> = {
  food: [109, 68, 1808, 2556, 2405],
  wood: [109, 562, 1808, 2556, 2405],
  stone: [109, 584, 1808, 2556, 2405],
  gold: [109, 584, 1808, 2556, 2405]
};

export function initializeEconomy(world: WorldState): void {
  for (const player of world.rulesetPlayerIds()) {
    const stockpile = createResourceRecord(0);
    const ledger = createLedgerRecord(0);
    for (const resource of resourceKinds) {
      const baseline = toFixedPoint(DEFAULT_STARTING_STOCKPILE[resource]);
      stockpile[resource] = baseline;
      ledger[resource].baselineFp = baseline;
    }
    world.playerEconomies.set(player, {
      playerId: player,
      stockpileFp: stockpile,
      ledger,
      population: {
        used: 0,
        reserved: 0,
        capacity: 0
      },
      evidence: "simulated"
    });
  }

  for (const entity of [...world.entities.values()].sort(compareEntities)) {
    initializeEntityEconomy(world, entity);
  }

  for (const entity of [...world.entities.values()].sort(compareEntities)) {
    const economy = world.playerEconomies.get(entity.playerId);
    if (!economy) {
      continue;
    }
    const rule = world.resolveUnitRule(entity.dataId, entity.kind);
    if (isCompletePopulationBuilding(entity)) {
      economy.population.capacity += populationCapacityForBuilding(entity.dataId);
    }
    if (rule && getPopulationCost(rule) > 0 && !isBuildingRule(rule) && !entity.resourceNode) {
      economy.population.used += getPopulationCost(rule);
    }
  }
}

export function applyEconomyIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  switch (command.rawKind) {
    case "ORDER":
      return applyOrderIntent(world, command);
    case "GATHER_POINT":
    case "DE_MULTI_GATHERPOINT":
      return applyGatherPointIntent(world, command);
    case "BUILD":
      return applyBuildIntent(world, command);
    case "DE_QUEUE":
      return applyQueueIntent(world, command);
    case "STOP":
      return applyStopIntent(world, command);
    default:
      world.economyStats.unsupportedIntents += 1;
      return false;
  }
}

export function cancelWorkerTaskForCommand(entity: EntityState): void {
  delete entity.workerTask;
  if (
    entity.task.kind === "gathering" ||
    entity.task.kind === "dropping-off" ||
    entity.task.kind === "building"
  ) {
    entity.task = {
      kind: "idle",
      evidence: "simulated"
    };
  }
}

export function advanceEconomy(world: WorldState, deltaMs: SimTimeMs): void {
  if (deltaMs <= 0) {
    return;
  }

  advanceWorkers(world, deltaMs);
  advanceProduction(world, deltaMs);
}

function initializeEntityEconomy(world: WorldState, entity: EntityState): void {
  const rule = world.resolveUnitRule(entity.dataId, entity.kind);
  if (!rule) {
    return;
  }

  const resourceNode = createResourceNodeState(entity, rule);
  if (resourceNode) {
    entity.resourceNode = resourceNode;
    world.resourceNodes.set(entity.id, resourceNode);
  }

  if (isProductionBuilding(entity, rule)) {
    entity.production = {
      queue: [],
      spawnOrdinal: 0
    };
  }
}

function applyOrderIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  const target = resolveGatherTarget(world, command);
  if (!target && command.targetId) {
    const construction = world.entities.get(command.targetId)?.construction;
    if (construction?.state === "foundation") {
      return assignBuildersToFoundation(world, command, command.targetId);
    }
  }

  if (!target) {
    world.economyStats.unsupportedIntents += 1;
    world.economyStats.unresolvedTargets += 1;
    world.recordEconomyDivergence(`unresolved gather/build target for ${command.rawKind}`, command.id);
    return false;
  }

  let handled = false;
  for (const actorId of command.actorIds) {
    const worker = world.entities.get(actorId);
    if (!worker) {
      world.economyStats.unresolvedActors += 1;
      world.recordEconomyDivergence(`unresolved economy actor ${actorId}`, command.id);
      continue;
    }
    if (!isWorker(world, worker)) {
      continue;
    }

    startGatherTask(world, worker, target, command.id, command.sourceSequence, "simulated");
    handled = true;
  }

  if (handled) {
    world.economyStats.handledIntentCount += 1;
    world.economyStats.gatherCommands += 1;
    world.recordEconomyEvent(`gather ${command.id} -> ${target.id}`);
  }

  return handled;
}

function applyGatherPointIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  const target = resolveGatherTarget(world, command);
  const destination = target
    ? {
        xFp: world.entities.get(target.id)?.position.xFp ?? toFixedPoint(command.destination?.x ?? 0),
        yFp: world.entities.get(target.id)?.position.yFp ?? toFixedPoint(command.destination?.y ?? 0)
      }
    : destinationToFixedPoint(command.destination);
  if (!destination) {
    world.economyStats.unsupportedIntents += 1;
    return false;
  }

  let handled = false;
  for (const actorId of command.actorIds) {
    const actor = world.entities.get(actorId);
    if (!actor) {
      world.economyStats.unresolvedActors += 1;
      world.recordEconomyDivergence(`unresolved gather point actor ${actorId}`, command.id);
      continue;
    }
    if (!actor.production) {
      continue;
    }

    actor.production.gatherPoint = {
      ...destination,
      evidence: "simulated"
    };
    if (target) {
      actor.production.gatherPoint.targetId = target.id;
      actor.production.gatherPoint.resource = target.resource;
    }
    handled = true;
  }

  if (handled) {
    world.economyStats.handledIntentCount += 1;
    world.economyStats.gatherPointCommands += 1;
    world.recordEconomyEvent(`gather point ${command.id}`);
  } else if (target) {
    handled = applyOrderIntent(world, command);
  }

  return handled;
}

function applyBuildIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  const buildingId = readInteger(command.parameters?.building_id);
  const destination = destinationToFixedPoint(command.destination);
  if (buildingId === undefined || !destination) {
    world.economyStats.unsupportedIntents += 1;
    return false;
  }

  const rule = world.resolveUnitRule(buildingId, undefined);
  if (!rule || !isBuildingRule(rule)) {
    world.economyStats.unsupportedIntents += 1;
    world.recordEconomyDivergence(`unsupported build unit ${buildingId}`, command.id);
    return false;
  }

  const playerId = command.playerId ?? firstActorPlayer(world, command.actorIds);
  if (!playerId) {
    world.economyStats.unresolvedActors += 1;
    world.recordEconomyDivergence("build command has no resolvable player", command.id);
    return false;
  }

  const costs = readResourceCosts(rule);
  if (!spendCosts(world, playerId, costs, command.id, "build")) {
    return true;
  }

  const foundation = world.addSimulatedEntity({
    id: world.createSimEntityId(`foundation-${rule.id ?? rule.kind}`),
    rule,
    playerId,
    xFp: destination.xFp,
    yFp: destination.yFp,
    evidence: "simulated",
    hp: Math.max(1, Math.floor(rule.maxHp * 0.08))
  });
  foundation.construction = {
    state: "foundation",
    progressFp: 0,
    requiredWorkFp: Math.max(1000, readTrainTimeMs(rule) ?? 10000),
    startedAtMs: world.timeMs,
    evidence: "simulated"
  };
  if (isProductionBuilding(foundation, rule)) {
    foundation.production = {
      queue: [],
      spawnOrdinal: 0
    };
  }

  const assigned = assignBuildersToFoundation(world, command, foundation.id);
  world.economyStats.handledIntentCount += 1;
  world.economyStats.buildCommands += 1;
  world.recordEconomyEvent(`build ${command.id} ${rule.kind} -> ${foundation.id}`);
  return assigned || command.actorIds.length === 0;
}

function applyQueueIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  const unitId = readInteger(command.parameters?.unit_id);
  const amount = Math.max(1, readInteger(command.parameters?.amount) ?? 1);
  if (unitId === undefined) {
    world.economyStats.unsupportedIntents += 1;
    return false;
  }

  const unitRule = world.resolveUnitRule(unitId, undefined);
  const trainTimeMs = unitRule ? readTrainTimeMs(unitRule) : undefined;
  if (!unitRule || trainTimeMs === undefined) {
    world.economyStats.unsupportedIntents += 1;
    world.recordEconomyDivergence(`unsupported queued unit ${unitId}`, command.id);
    return false;
  }

  let handled = false;
  for (const actorId of command.actorIds) {
    const producer = world.entities.get(actorId);
    if (!producer) {
      world.economyStats.unresolvedActors += 1;
      world.recordEconomyDivergence(`unresolved producer ${actorId}`, command.id);
      continue;
    }
    if (!producer.production) {
      const producerRule = world.resolveUnitRule(producer.dataId, producer.kind);
      if (producerRule && isProductionBuilding(producer, producerRule)) {
        producer.production = {
          queue: [],
          spawnOrdinal: 0
        };
      }
    }
    if (!producer.production) {
      continue;
    }

    for (let index = 0; index < amount; index += 1) {
      const costs = readResourceCosts(unitRule);
      if (!spendCosts(world, producer.playerId, costs, command.id, "queue")) {
        break;
      }
      producer.production.queue.push({
        id: `${command.id}:${producer.id}:${producer.production.spawnOrdinal + producer.production.queue.length}`,
        unitId,
        unitKind: unitRule.kind,
        remainingMs: trainTimeMs,
        trainTimeMs,
        cost: costs,
        evidence: "simulated"
      });
      handled = true;
    }
  }

  if (handled) {
    world.economyStats.handledIntentCount += 1;
    world.economyStats.queueCommands += 1;
    world.recordEconomyEvent(`queue ${command.id} unit ${unitId}`);
  }

  return handled;
}

function applyStopIntent(world: WorldState, command: ObservedIntentCommand): boolean {
  let handled = false;
  for (const actorId of command.actorIds) {
    const actor = world.entities.get(actorId);
    if (!actor) {
      world.economyStats.unresolvedActors += 1;
      continue;
    }
    cancelWorkerTaskForCommand(actor);
    actor.task = {
      kind: "idle",
      evidence: "simulated"
    };
    handled = true;
  }

  if (handled) {
    world.economyStats.handledIntentCount += 1;
    world.recordEconomyEvent(`stop ${command.id}`);
  }

  return handled;
}

function assignBuildersToFoundation(world: WorldState, command: ObservedIntentCommand, foundationId: EntityId): boolean {
  const foundation = world.entities.get(foundationId);
  if (!foundation?.construction || foundation.construction.state !== "foundation") {
    return false;
  }

  let handled = false;
  for (const actorId of command.actorIds) {
    const worker = world.entities.get(actorId);
    if (!worker) {
      world.economyStats.unresolvedActors += 1;
      world.recordEconomyDivergence(`unresolved builder ${actorId}`, command.id);
      continue;
    }
    if (!isWorker(world, worker)) {
      continue;
    }

    startBuildTask(world, worker, foundation, command.id, command.sourceSequence, "simulated");
    handled = true;
  }

  return handled;
}

function advanceWorkers(world: WorldState, deltaMs: SimTimeMs): void {
  const workers = [...world.entities.values()]
    .filter((entity) => entity.workerTask)
    .sort(compareEntities);
  for (const worker of workers) {
    const task = worker.workerTask;
    if (!task) {
      continue;
    }

    if (task.kind === "gather") {
      advanceGatherWorker(world, worker, task, deltaMs);
    } else {
      advanceBuildWorker(world, worker, task, deltaMs);
    }
  }
}

function advanceGatherWorker(
  world: WorldState,
  worker: EntityState,
  task: GatherWorkerTask,
  deltaMs: SimTimeMs
): void {
  if (task.phase === "to-resource") {
    if (worker.task.kind === "path-failed") {
      stallWorker(world, worker, task, "resource route failed");
    } else if (worker.task.kind === "idle") {
      beginGathering(world, worker, task);
    }
    return;
  }

  if (task.phase === "to-drop-site") {
    if (worker.task.kind === "path-failed") {
      stallWorker(world, worker, task, "drop-site route failed");
    } else if (worker.task.kind === "idle") {
      beginDroppingOff(worker, task);
      depositCarry(world, worker, task);
    }
    return;
  }

  if (task.phase !== "gathering") {
    return;
  }

  const node = world.resourceNodes.get(task.targetId);
  const nodeEntity = world.entities.get(task.targetId);
  if (!node || !nodeEntity || node.depleted) {
    retargetOrReturn(world, worker, task);
    return;
  }

  const carry = ensureCarry(worker, world);
  const capacityLeft = Math.max(0, carry.capacityFp - carry.amountFp);
  if (capacityLeft <= 0) {
    startDropOffRoute(world, worker, task);
    return;
  }

  const accumulator = task.workAccumulator + gatherRateFpPerSecond(node) * deltaMs;
  const availableWork = Math.floor(accumulator / 1000);
  task.workAccumulator = accumulator % 1000;
  if (availableWork <= 0) {
    return;
  }

  const extractedFp = Math.min(availableWork, capacityLeft, node.remainingAmountFp);
  if (extractedFp <= 0) {
    retargetOrReturn(world, worker, task);
    return;
  }

  node.remainingAmountFp -= extractedFp;
  node.extractedAmountFp += extractedFp;
  carry.resource = node.resource;
  carry.amountFp += extractedFp;
  carry.evidence = "simulated";
  const economy = requireEconomy(world, worker.playerId);
  economy.ledger[node.resource].extractedFp += extractedFp;

  if (node.remainingAmountFp <= 0) {
    depleteNode(world, nodeEntity, node);
    if (node.family === "farm" && tryReseedFarm(world, nodeEntity, node, worker.playerId, task.commandId)) {
      return;
    }
  }
  if (carry.amountFp >= carry.capacityFp) {
    startDropOffRoute(world, worker, task);
    return;
  }
  if (node.depleted) {
    retargetOrReturn(world, worker, task);
  }
}

function advanceBuildWorker(
  world: WorldState,
  worker: EntityState,
  task: BuildWorkerTask,
  deltaMs: SimTimeMs
): void {
  const target = world.entities.get(task.targetId);
  const construction = target?.construction;
  if (!target || !construction) {
    stallWorker(world, worker, task, "foundation disappeared");
    return;
  }
  if (construction.state === "complete") {
    finishBuilderAfterConstruction(world, worker, target);
    return;
  }

  if (task.phase === "to-foundation") {
    if (worker.task.kind === "path-failed") {
      stallWorker(world, worker, task, "foundation route failed");
    } else if (worker.task.kind === "idle") {
      task.phase = "building";
      worker.task = {
        kind: "building",
        commandId: task.commandId,
        targetId: target.id,
        evidence: task.evidence,
        sourceSequence: task.sourceSequence
      };
    }
    return;
  }

  if (task.phase !== "building") {
    return;
  }

  const accumulator = task.workAccumulator + builderWorkRateFpPerSecond(world, worker) * deltaMs;
  const work = Math.floor(accumulator / 1000);
  task.workAccumulator = accumulator % 1000;
  if (work <= 0) {
    return;
  }

  construction.progressFp = Math.min(construction.requiredWorkFp, construction.progressFp + work);
  const maxHp = world.resolveUnitRule(target.dataId, target.kind)?.maxHp ?? target.hp;
  target.hp = Math.max(1, Math.floor((maxHp * construction.progressFp) / Math.max(1, construction.requiredWorkFp)));
  if (construction.progressFp >= construction.requiredWorkFp) {
    completeConstruction(world, target, construction);
  }
}

function advanceProduction(world: WorldState, deltaMs: SimTimeMs): void {
  const producers = [...world.entities.values()]
    .filter((entity) => entity.production?.queue.length)
    .sort(compareEntities);
  for (const producer of producers) {
    const production = producer.production;
    if (!production) {
      continue;
    }

    let availableMs = deltaMs;
    while (availableMs > 0 && production.queue.length) {
      const item = production.queue[0];
      if (!item) {
        break;
      }
      item.remainingMs -= availableMs;
      if (item.remainingMs > 0) {
        break;
      }

      availableMs = Math.abs(item.remainingMs);
      production.queue.shift();
      spawnProductionItem(world, producer, item);
    }
  }
}

function startGatherTask(
  world: WorldState,
  worker: EntityState,
  node: ResourceNodeState,
  commandId: string,
  sourceSequence: number,
  evidence: EvidenceClass
): void {
  cancelWorkerTaskForCommand(worker);
  const carry = ensureCarry(worker, world);
  const task: GatherWorkerTask = {
    kind: "gather",
    phase: "to-resource",
    commandId,
    sourceSequence,
    targetId: node.id,
    resource: node.resource,
    family: node.family,
    evidence,
    retargetCount: 0,
    workAccumulator: 0
  };
  worker.workerTask = task;

  if (carry.amountFp > 0 && carry.resource && carry.resource !== node.resource) {
    startDropOffRoute(world, worker, task);
    return;
  }
  if (carry.amountFp >= carry.capacityFp) {
    startDropOffRoute(world, worker, task);
    return;
  }

  routeWorkerToTarget(world, worker, world.entities.get(node.id), task, "to-resource");
}

function startBuildTask(
  world: WorldState,
  worker: EntityState,
  foundation: EntityState,
  commandId: string,
  sourceSequence: number,
  evidence: EvidenceClass
): void {
  cancelWorkerTaskForCommand(worker);
  const task: BuildWorkerTask = {
    kind: "build",
    phase: "to-foundation",
    commandId,
    sourceSequence,
    targetId: foundation.id,
    evidence,
    workAccumulator: 0
  };
  worker.workerTask = task;
  routeWorkerToTarget(world, worker, foundation, task, "to-foundation");
}

function beginGathering(world: WorldState, worker: EntityState, task: GatherWorkerTask): void {
  const node = world.resourceNodes.get(task.targetId);
  if (!node || node.depleted) {
    retargetOrReturn(world, worker, task);
    return;
  }

  task.phase = "gathering";
  worker.task = {
    kind: "gathering",
    commandId: task.commandId,
    targetId: task.targetId,
    resource: task.resource,
    evidence: task.evidence,
    sourceSequence: task.sourceSequence
  };
}

function beginDroppingOff(worker: EntityState, task: GatherWorkerTask): void {
  task.phase = "dropping-off";
  worker.task = {
    kind: "dropping-off",
    commandId: task.commandId,
    targetId: task.dropSiteId ?? task.targetId,
    resource: task.resource,
    evidence: task.evidence,
    sourceSequence: task.sourceSequence
  };
}

function depositCarry(world: WorldState, worker: EntityState, task: GatherWorkerTask): void {
  const carry = worker.carry;
  if (!carry?.resource || carry.amountFp <= 0) {
    routeBackToResource(world, worker, task);
    return;
  }

  const economy = requireEconomy(world, worker.playerId);
  economy.stockpileFp[carry.resource] += carry.amountFp;
  economy.ledger[carry.resource].depositedFp += carry.amountFp;
  world.recordEconomyEvent(`deposit ${worker.id} ${fromFixedPoint(carry.amountFp)} ${carry.resource}`);
  carry.amountFp = 0;
  delete carry.resource;
  routeBackToResource(world, worker, task);
}

function routeBackToResource(world: WorldState, worker: EntityState, task: GatherWorkerTask): void {
  const node = world.resourceNodes.get(task.targetId);
  if (!node || node.depleted) {
    retargetOrReturn(world, worker, task);
    return;
  }

  task.phase = "to-resource";
  delete task.dropSiteId;
  routeWorkerToTarget(world, worker, world.entities.get(node.id), task, "to-resource");
}

function retargetOrReturn(world: WorldState, worker: EntityState, task: GatherWorkerTask): void {
  const currentEntity = world.entities.get(task.targetId);
  const center = currentEntity?.position ?? worker.position;
  const nextNode = findNearestResourceNode(world, center.xFp, center.yFp, {
    resource: task.resource,
    family: task.family,
    excludedId: task.targetId,
    maxDistanceFp: RETARGET_RADIUS_FP
  });
  if (nextNode) {
    task.targetId = nextNode.id;
    task.retargetCount += 1;
    task.phase = "to-resource";
    routeWorkerToTarget(world, worker, world.entities.get(nextNode.id), task, "to-resource");
    world.recordEconomyEvent(`retarget ${worker.id} -> ${nextNode.id}`);
    return;
  }

  if ((worker.carry?.amountFp ?? 0) > 0) {
    startDropOffRoute(world, worker, task);
    return;
  }

  delete worker.workerTask;
  worker.task = {
    kind: "idle",
    evidence: "simulated"
  };
}

function startDropOffRoute(world: WorldState, worker: EntityState, task: GatherWorkerTask): void {
  const dropSite = findNearestDropSite(world, worker, task.resource);
  if (!dropSite) {
    stallWorker(world, worker, task, `no ${task.resource} drop site`);
    world.recordEconomyDivergence(`no ${task.resource} drop site`, task.commandId);
    return;
  }

  task.phase = "to-drop-site";
  task.dropSiteId = dropSite.id;
  routeWorkerToTarget(world, worker, dropSite, task, "to-drop-site");
}

function routeWorkerToTarget(
  world: WorldState,
  worker: EntityState,
  target: EntityState | undefined,
  task: WorkerTaskState,
  phase: WorkerTaskState["phase"]
): void {
  if (!target) {
    stallWorker(world, worker, task, "target missing");
    return;
  }
  unstickWorkerFromStaticFootprint(world, worker);

  if (isTouching(worker, target)) {
    task.phase = phase;
    worker.task = {
      kind: "idle",
      evidence: "simulated"
    };
    return;
  }

  const route = planTouchRoute(world, worker, target, task.commandId, task.sourceSequence, task.evidence);
  worker.lastRoute = route;
  if (route.status === "failed") {
    world.routeStats.failed += 1;
    world.recordRouteEvent(`failed ${task.commandId} ${worker.id}: ${route.failureReason ?? "unknown"}`);
    worker.task = {
      kind: "path-failed",
      commandId: task.commandId,
      destination: route.destination,
      evidence: task.evidence,
      sourceSequence: task.sourceSequence,
      route
    };
    stallWorker(world, worker, task, route.failureReason ?? "route failed");
    return;
  }

  world.routeStats.planned += 1;
  worker.task = {
    kind: "moving",
    commandId: task.commandId,
    destination: route.destination,
    evidence: task.evidence,
    sourceSequence: task.sourceSequence,
    route
  };
}

function unstickWorkerFromStaticFootprint(world: WorldState, worker: EntityState): void {
  const current = world.pathing.checkOccupancyAtPosition(
    worker,
    worker.position.xFp,
    worker.position.yFp,
    new Set([worker.id]),
    world.entities,
    false
  );
  if (current.ok || current.reason !== "static-blocked") {
    return;
  }

  const directions: readonly Position[] = [
    { xFp: 1, yFp: 0 },
    { xFp: 0, yFp: 1 },
    { xFp: -1, yFp: 0 },
    { xFp: 0, yFp: -1 },
    { xFp: 1, yFp: 1 },
    { xFp: -1, yFp: 1 },
    { xFp: -1, yFp: -1 },
    { xFp: 1, yFp: -1 }
  ];
  const distances = [toFixedPoint(0.5), toFixedPoint(1), toFixedPoint(1.5), toFixedPoint(2), toFixedPoint(2.5)];
  for (const distance of distances) {
    for (const direction of directions) {
      const normalizer = direction.xFp !== 0 && direction.yFp !== 0 ? 1414 : 1000;
      const candidate = {
        xFp: worker.position.xFp + Math.trunc((direction.xFp * distance * 1000) / normalizer),
        yFp: worker.position.yFp + Math.trunc((direction.yFp * distance * 1000) / normalizer)
      };
      const check = world.pathing.checkOccupancyAtPosition(
        worker,
        candidate.xFp,
        candidate.yFp,
        new Set([worker.id]),
        world.entities,
        true
      );
      if (!check.ok) {
        continue;
      }

      worker.position = {
        ...candidate,
        evidence: "reconciled"
      };
      world.routeStats.corrected += 1;
      world.recordRouteEvent(`corrected ${worker.id}: unblocked economy start`);
      world.recordEconomyEvent(`corrected ${worker.id}: static footprint start`);
      return;
    }
  }
}

function planTouchRoute(
  world: WorldState,
  worker: EntityState,
  target: EntityState,
  commandId: string,
  sourceSequence: number,
  evidence: EvidenceClass
): PlannedRoute {
  const candidates = touchCandidates(worker, target);
  let bestFailed: PlannedRoute | undefined;
  for (const candidate of candidates) {
    const route = world.pathing.planRoute(
      worker,
      { x: fromFixedPoint(candidate.xFp), y: fromFixedPoint(candidate.yFp) },
      {
        commandId,
        plannedAtMs: world.timeMs,
        sourceSequence,
        evidence,
        ignoreDynamicActorIds: [worker.id]
      },
      world.entities
    );
    if (route.status !== "failed") {
      return route;
    }
    bestFailed ??= route;
  }

  return bestFailed ?? world.pathing.planRoute(
    worker,
    { x: fromFixedPoint(target.position.xFp), y: fromFixedPoint(target.position.yFp) },
    {
      commandId,
      plannedAtMs: world.timeMs,
      sourceSequence,
      evidence,
      ignoreDynamicActorIds: [worker.id]
    },
    world.entities
  );
}

function touchCandidates(worker: EntityState, target: EntityState): readonly Position[] {
  const distanceFp = touchDistanceFp(worker, target);
  const directions: readonly Position[] = [
    { xFp: 1, yFp: 0 },
    { xFp: 0, yFp: 1 },
    { xFp: -1, yFp: 0 },
    { xFp: 0, yFp: -1 },
    { xFp: 1, yFp: 1 },
    { xFp: -1, yFp: 1 },
    { xFp: -1, yFp: -1 },
    { xFp: 1, yFp: -1 }
  ];
  const candidates = directions.map((direction) => {
    const normalizer = direction.xFp !== 0 && direction.yFp !== 0 ? 1414 : 1000;
    return {
      xFp: target.position.xFp + Math.trunc((direction.xFp * distanceFp * 1000) / normalizer),
      yFp: target.position.yFp + Math.trunc((direction.yFp * distanceFp * 1000) / normalizer)
    };
  });

  return candidates.sort((left, right) => distanceSquared(worker.position, left) - distanceSquared(worker.position, right)
    || left.yFp - right.yFp
    || left.xFp - right.xFp);
}

function isTouching(worker: EntityState, target: EntityState): boolean {
  return distanceSquared(worker.position, target.position) <= touchDistanceFp(worker, target) ** 2;
}

function touchDistanceFp(worker: EntityState, target: EntityState): FixedPoint {
  return Math.max(
    worker.pathing.collisionRadiusFp + target.pathing.collisionRadiusFp + TOUCH_PADDING_FP,
    worker.pathing.collisionRadiusFp + target.pathing.footprintHalfWidthFp + TOUCH_PADDING_FP,
    worker.pathing.collisionRadiusFp + target.pathing.footprintHalfHeightFp + TOUCH_PADDING_FP
  );
}

function depleteNode(world: WorldState, entity: EntityState, node: ResourceNodeState): void {
  node.depleted = true;
  node.depletionTimeMs = world.timeMs;
  entity.hp = 0;
  entity.pathing = {
    ...entity.pathing,
    occupancyKind: node.family === "farm" ? entity.pathing.occupancyKind : "none"
  };
  if (node.family !== "farm") {
    world.pathing.rebuildStaticObstacles(world.entities);
  }
  world.recordEconomyEvent(`depleted ${node.id} ${node.resource}`);
}

function tryReseedFarm(
  world: WorldState,
  entity: EntityState,
  node: ResourceNodeState,
  playerId: PlayerId,
  commandId: string
): boolean {
  const farmRule = world.resolveUnitRule(entity.dataId, entity.kind);
  if (!farmRule || entity.dataId !== 50) {
    return false;
  }
  const reseedAmount = RESOURCE_AMOUNT_DEFAULTS.farm ?? 175;
  if (!spendCosts(world, playerId, readResourceCosts(farmRule), commandId, "farm reseed")) {
    return false;
  }

  node.farmGeneration = (node.farmGeneration ?? 0) + 1;
  node.initialAmountFp += toFixedPoint(reseedAmount);
  node.remainingAmountFp += toFixedPoint(reseedAmount);
  node.depleted = false;
  delete node.depletionTimeMs;
  node.amountSource = "farm-generation";
  world.recordEconomyEvent(`reseed ${entity.id} gen ${node.farmGeneration}`);
  return true;
}

function completeConstruction(world: WorldState, target: EntityState, construction: ConstructionState): void {
  if (construction.state === "complete") {
    return;
  }

  construction.state = "complete";
  construction.completedAtMs = world.timeMs;
  target.hp = world.resolveUnitRule(target.dataId, target.kind)?.maxHp ?? target.hp;
  const economy = world.playerEconomies.get(target.playerId);
  if (economy) {
    economy.population.capacity += populationCapacityForBuilding(target.dataId);
  }
  if (target.dataId === 50) {
    const node = createFarmResourceNode(target);
    target.resourceNode = node;
    world.resourceNodes.set(target.id, node);
  }
  world.economyStats.completedConstruction += 1;
  world.recordEconomyEvent(`completed ${target.id}`);

  for (const worker of [...world.entities.values()].filter(
    (entity) => entity.workerTask?.kind === "build" && entity.workerTask.targetId === target.id
  )) {
    finishBuilderAfterConstruction(world, worker, target);
  }
}

function finishBuilderAfterConstruction(world: WorldState, worker: EntityState, target: EntityState): void {
  delete worker.workerTask;
  if (target.resourceNode && !target.resourceNode.depleted) {
    startGatherTask(world, worker, target.resourceNode, `farm-${target.id}`, world.timeMs, "simulated");
    return;
  }

  worker.task = {
    kind: "idle",
    evidence: "simulated"
  };
}

function spawnProductionItem(
  world: WorldState,
  producer: EntityState,
  item: ProductionQueueItemState
): void {
  const rule = world.resolveUnitRule(item.unitId, undefined);
  const production = producer.production;
  if (!rule || !production) {
    return;
  }

  const economy = requireEconomy(world, producer.playerId);
  const popCost = item.cost
    .filter((cost) => cost.resource === "population-headroom")
    .reduce((sum, cost) => sum + fromFixedPoint(cost.amountFp), 0);
  economy.population.reserved = Math.max(0, economy.population.reserved - popCost);
  economy.population.used += popCost;

  const position = spawnPosition(producer);
  production.spawnOrdinal += 1;
  const unit = world.addSimulatedEntity({
    id: world.createSimEntityId(`unit-${item.unitId}`),
    rule,
    playerId: producer.playerId,
    xFp: position.xFp,
    yFp: position.yFp,
    evidence: "simulated"
  });
  initializeEntityEconomy(world, unit);
  world.economyStats.spawnedUnits += 1;
  world.recordEconomyEvent(`spawn ${unit.id} from ${producer.id}`);

  const gatherPoint = producer.production?.gatherPoint;
  if (!gatherPoint || !isWorker(world, unit)) {
    return;
  }
  const target = gatherPoint.targetId ? world.resourceNodes.get(gatherPoint.targetId) : undefined;
  const filter: ResourceNodeFilter = {
    maxDistanceFp: RETARGET_RADIUS_FP
  };
  if (gatherPoint.resource) {
    filter.resource = gatherPoint.resource;
  }
  const fallback = target && !target.depleted
    ? target
    : findNearestResourceNode(world, gatherPoint.xFp, gatherPoint.yFp, filter);
  if (fallback) {
    startGatherTask(world, unit, fallback, item.id, world.timeMs, "simulated");
  }
}

function spendCosts(
  world: WorldState,
  playerId: PlayerId,
  costs: readonly ResourceCostState[],
  commandId: string,
  reason: string
): boolean {
  const economy = requireEconomy(world, playerId);
  for (const cost of costs) {
    if (cost.resource === "population-headroom") {
      const amount = fromFixedPoint(cost.amountFp);
      if (economy.population.used + economy.population.reserved + amount > economy.population.capacity) {
        world.recordEconomyDivergence(`insufficient population headroom for ${reason}`, commandId);
        world.recordEconomyEvent(`blocked ${commandId}: population`);
        return false;
      }
      continue;
    }
    if (economy.stockpileFp[cost.resource] < cost.amountFp) {
      world.recordEconomyDivergence(`insufficient ${cost.resource} for ${reason}`, commandId);
      world.recordEconomyEvent(`blocked ${commandId}: ${cost.resource}`);
      return false;
    }
  }

  for (const cost of costs) {
    if (cost.resource === "population-headroom") {
      economy.population.reserved += fromFixedPoint(cost.amountFp);
      continue;
    }
    economy.stockpileFp[cost.resource] -= cost.amountFp;
    economy.ledger[cost.resource].spentFp += cost.amountFp;
  }
  return true;
}

function resolveGatherTarget(world: WorldState, command: ObservedIntentCommand): ResourceNodeState | undefined {
  if (command.targetId) {
    const direct = world.resourceNodes.get(command.targetId);
    if (direct && !direct.depleted) {
      return direct;
    }
  }

  const targetType = readInteger(command.parameters?.target_type);
  const destination = destinationToFixedPoint(command.destination);
  if (!destination) {
    return undefined;
  }

  if (targetType !== undefined && targetType >= 0) {
    const typed = findNearestResourceNode(world, destination.xFp, destination.yFp, {
      dataId: targetType,
      maxDistanceFp: RETARGET_RADIUS_FP
    });
    if (typed) {
      return typed;
    }
  }

  return findNearestResourceNode(world, destination.xFp, destination.yFp, {
    maxDistanceFp: toFixedPoint(1.5)
  });
}

function findNearestResourceNode(
  world: WorldState,
  xFp: FixedPoint,
  yFp: FixedPoint,
  filter: ResourceNodeFilter
): ResourceNodeState | undefined {
  let best: ResourceNodeState | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of world.resourceNodes.values()) {
    if (node.depleted || node.id === filter.excludedId) {
      continue;
    }
    const entity = world.entities.get(node.id);
    if (!entity) {
      continue;
    }
    if (filter.resource && node.resource !== filter.resource) {
      continue;
    }
    if (filter.family && node.family !== filter.family) {
      continue;
    }
    if (filter.dataId !== undefined && entity.dataId !== filter.dataId) {
      continue;
    }
    const distance = distanceSquared({ xFp, yFp }, entity.position);
    if (filter.maxDistanceFp !== undefined && distance > filter.maxDistanceFp ** 2) {
      continue;
    }
    if (!best || distance < bestDistance || (distance === bestDistance && node.id.localeCompare(best.id) < 0)) {
      best = node;
      bestDistance = distance;
    }
  }

  return best;
}

function findNearestDropSite(world: WorldState, worker: EntityState, resource: ResourceKind): EntityState | undefined {
  const acceptedIds = new Set(COMMON_DROP_SITES[resource]);
  let best: EntityState | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entity of world.entities.values()) {
    if (entity.playerId !== worker.playerId || entity.construction?.state === "foundation") {
      continue;
    }
    if (entity.dataId === undefined || !acceptedIds.has(entity.dataId)) {
      continue;
    }
    const distance = distanceSquared(worker.position, entity.position);
    if (!best || distance < bestDistance || (distance === bestDistance && entity.id.localeCompare(best.id) < 0)) {
      best = entity;
      bestDistance = distance;
    }
  }

  return best;
}

function createResourceNodeState(entity: EntityState, rule: RulesetUnit): ResourceNodeState | undefined {
  const classification = classifyResourceNode(entity, rule);
  if (!classification) {
    return undefined;
  }

  const amount = resourceAmountFor(rule, classification.family);
  return {
    id: entity.id,
    resource: classification.resource,
    family: classification.family,
    initialAmountFp: toFixedPoint(amount.value),
    remainingAmountFp: toFixedPoint(amount.value),
    extractedAmountFp: 0,
    depleted: false,
    amountSource: amount.source,
    evidence: "simulated"
  };
}

function createFarmResourceNode(entity: EntityState): ResourceNodeState {
  const amount = RESOURCE_AMOUNT_DEFAULTS.farm ?? 175;
  return {
    id: entity.id,
    resource: "food",
    family: "farm",
    initialAmountFp: toFixedPoint(amount),
    remainingAmountFp: toFixedPoint(amount),
    extractedAmountFp: 0,
    depleted: false,
    amountSource: "farm-generation",
    farmGeneration: 0,
    evidence: "simulated"
  };
}

function classifyResourceNode(
  entity: EntityState,
  rule: RulesetUnit
): { readonly resource: ResourceKind; readonly family: string } | undefined {
  const text = `${entity.kind} ${entity.label ?? ""} ${rule.kind} ${rule.label ?? ""}`.toLowerCase();
  if (entity.dataId === 50 || text.includes("farm")) {
    return { resource: "food", family: "farm" };
  }
  if (text.includes("gold")) {
    return { resource: "gold", family: "gold" };
  }
  if (text.includes("stone")) {
    return { resource: "stone", family: "stone" };
  }
  if (text.includes("tree") || rule.classId === 15) {
    return { resource: "wood", family: "tree" };
  }
  if (text.includes("bush") || text.includes("forage") || text.includes("fruit") || rule.classId === 7) {
    return { resource: "food", family: "forage" };
  }
  if (text.includes("sheep") || rule.classId === 58) {
    return { resource: "food", family: "herdable" };
  }
  if (text.includes("boar")) {
    return { resource: "food", family: "boar" };
  }
  if (text.includes("deer") || text.includes("ibex")) {
    return { resource: "food", family: "hunt" };
  }

  return undefined;
}

function resourceAmountFor(
  rule: RulesetUnit,
  family: string
): { readonly value: number; readonly source: ResourceNodeState["amountSource"] } {
  const capacity = readNumber(rule.economy?.resourceCapacity);
  if (capacity !== undefined && capacity > 0 && family !== "farm") {
    return {
      value: capacity,
      source: "ruleset"
    };
  }

  return {
    value: RESOURCE_AMOUNT_DEFAULTS[family] ?? 100,
    source: "scenario-default"
  };
}

function readResourceCosts(rule: RulesetUnit): readonly ResourceCostState[] {
  const costs = rule.production?.resourceCosts;
  if (!Array.isArray(costs)) {
    return [];
  }

  const output: ResourceCostState[] = [];
  for (const cost of costs) {
    if (!isRecord(cost)) {
      continue;
    }
    const amount = readNumber(cost.amount);
    if (amount === undefined || amount <= 0) {
      continue;
    }
    const resource = resourceKindFromCost(cost);
    if (!resource) {
      continue;
    }
    output.push({
      resource,
      amountFp: toFixedPoint(amount)
    });
  }

  return output;
}

function readTrainTimeMs(rule: RulesetUnit): SimTimeMs | undefined {
  const trainLocations = rule.production?.trainLocations;
  if (!Array.isArray(trainLocations)) {
    return undefined;
  }

  for (const location of trainLocations) {
    if (!isRecord(location)) {
      continue;
    }
    const trainTime = readNumber(location.trainTime);
    if (trainTime !== undefined && trainTime > 0) {
      return Math.round(trainTime * 1000);
    }
  }

  return undefined;
}

function resourceKindFromCost(cost: Record<string, unknown>): ResourceCostState["resource"] | undefined {
  const label = typeof cost.label === "string" ? cost.label : undefined;
  if (label === "food" || label === "wood" || label === "stone" || label === "gold") {
    return label;
  }
  if (label === "population-headroom") {
    return "population-headroom";
  }

  switch (readInteger(cost.type)) {
    case 0:
      return "food";
    case 1:
      return "wood";
    case 2:
      return "stone";
    case 3:
      return "gold";
    case 4:
      return "population-headroom";
    default:
      return undefined;
  }
}

function ensureCarry(worker: EntityState, world: WorldState): WorkerCarryState {
  if (!worker.carry) {
    worker.carry = {
      amountFp: 0,
      capacityFp: workerCarryCapacityFp(world, worker),
      evidence: "simulated"
    };
  }

  return worker.carry;
}

function workerCarryCapacityFp(world: WorldState, worker: EntityState): FixedPoint {
  const rule = world.resolveUnitRule(worker.dataId, worker.kind);
  const capacity = readNumber(rule?.economy?.resourceCapacity);
  return toFixedPoint(capacity && capacity > 0 ? capacity : 10);
}

function gatherRateFpPerSecond(node: ResourceNodeState): FixedPoint {
  return toFixedPoint(GATHER_RATE_DEFAULTS[node.family] ?? GATHER_RATE_DEFAULTS[node.resource] ?? 0.35);
}

function builderWorkRateFpPerSecond(world: WorldState, worker: EntityState): FixedPoint {
  const rule = world.resolveUnitRule(worker.dataId, worker.kind);
  const workRate = readNumber(rule?.economy?.workRate);
  return toFixedPoint(workRate && workRate > 0 ? workRate : 1);
}

function getPopulationCost(rule: RulesetUnit): number {
  return readResourceCosts(rule)
    .filter((cost) => cost.resource === "population-headroom")
    .reduce((sum, cost) => sum + fromFixedPoint(cost.amountFp), 0);
}

function isWorker(world: WorldState, entity: EntityState): boolean {
  const rule = world.resolveUnitRule(entity.dataId, entity.kind);
  const text = `${entity.kind} ${entity.label ?? ""} ${rule?.kind ?? ""} ${rule?.label ?? ""}`.toLowerCase();
  return rule?.token === "villager" || rule?.classId === 4 || text.includes("villager") || text.includes("builder");
}

function isProductionBuilding(entity: EntityState, rule: RulesetUnit): boolean {
  return isBuildingRule(rule) && entity.playerId !== "gaia";
}

function isBuildingRule(rule: RulesetUnit): boolean {
  return rule.typeName === "building" || rule.building !== undefined;
}

function isCompletePopulationBuilding(entity: EntityState): boolean {
  return entity.construction?.state !== "foundation" && populationCapacityForBuilding(entity.dataId) > 0;
}

function populationCapacityForBuilding(dataId: number | undefined): number {
  if (dataId === undefined) {
    return 0;
  }

  return POPULATION_CAPACITY_BY_BUILDING_ID.get(dataId) ?? 0;
}

function requireEconomy(world: WorldState, playerId: PlayerId): PlayerEconomyState {
  let economy = world.playerEconomies.get(playerId);
  if (!economy) {
    economy = {
      playerId,
      stockpileFp: createResourceRecord(0),
      ledger: createLedgerRecord(0),
      population: {
        used: 0,
        reserved: 0,
        capacity: 0
      },
      evidence: "simulated"
    };
    world.playerEconomies.set(playerId, economy);
  }

  return economy;
}

function firstActorPlayer(world: WorldState, actorIds: readonly EntityId[]): PlayerId | undefined {
  for (const actorId of actorIds) {
    const actor = world.entities.get(actorId);
    if (actor) {
      return actor.playerId;
    }
  }

  return undefined;
}

function spawnPosition(producer: EntityState): Position {
  const spacing = touchDistanceFpForSpawn(producer);
  return {
    xFp: producer.position.xFp + spacing,
    yFp: producer.position.yFp
  };
}

function touchDistanceFpForSpawn(producer: EntityState): FixedPoint {
  return Math.max(producer.pathing.footprintHalfWidthFp, producer.pathing.footprintHalfHeightFp) + toFixedPoint(0.75);
}

function stallWorker(world: WorldState, worker: EntityState, task: WorkerTaskState, reason: string): void {
  task.phase = "stalled";
  world.recordEconomyEvent(`stalled ${worker.id}: ${reason}`);
}

function destinationToFixedPoint(destination: CommandDestination | undefined): Position | undefined {
  if (!destination || !destination.isMapCoordinate) {
    return undefined;
  }

  return {
    xFp: toFixedPoint(destination.x),
    yFp: toFixedPoint(destination.y)
  };
}

function distanceSquared(left: Position, right: Position): number {
  const dx = left.xFp - right.xFp;
  const dy = left.yFp - right.yFp;
  return dx * dx + dy * dy;
}

function compareEntities(left: EntityState, right: EntityState): number {
  return left.id.localeCompare(right.id);
}

function readInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface Position {
  readonly xFp: FixedPoint;
  readonly yFp: FixedPoint;
}

interface ResourceNodeFilter {
  resource?: ResourceKind;
  family?: string;
  dataId?: number;
  excludedId?: EntityId;
  maxDistanceFp?: FixedPoint;
}
