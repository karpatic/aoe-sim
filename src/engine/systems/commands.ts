import type { MoveCommand, ReplayCommand, RulesetV1 } from "../../replay/model";
import { toFixedPoint, type WorldState } from "../world";

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
  const destination = {
    xFp: toFixedPoint(command.intentDestination.x),
    yFp: toFixedPoint(command.intentDestination.y)
  };

  for (const actorId of command.actorIds) {
    const entity = world.entities.get(actorId);
    if (!entity) {
      world.warn(`Move command ${command.id} references missing actor ${actorId}`);
      continue;
    }

    const resolved = entity.dataId === undefined ? knownKinds.has(entity.kind) : knownDataIds.has(entity.dataId);
    if (!resolved) {
      const identity = entity.dataId === undefined ? entity.kind : `${entity.dataId}:${entity.kind}`;
      world.warn(`Move command ${command.id} references actor with unresolved unit rule ${identity}`);
    }

    entity.task = {
      kind: "moving",
      commandId: command.id,
      destination,
      evidence: command.evidence,
      sourceSequence: command.sourceSequence
    };
  }

  world.appliedCommandIds.push(command.id);
}
