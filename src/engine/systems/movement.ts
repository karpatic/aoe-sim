import type { WorldState } from "../world";

export function advanceMovement(world: WorldState, deltaMs: number): void {
  if (deltaMs <= 0) {
    return;
  }

  const entities = [...world.entities.values()].sort((left, right) => left.id.localeCompare(right.id));

  for (const entity of entities) {
    if (entity.task.kind !== "moving" || entity.speedFpPerSecond <= 0) {
      continue;
    }

    const dx = entity.task.destination.xFp - entity.position.xFp;
    const dy = entity.task.destination.yFp - entity.position.yFp;
    const distanceFp = integerSqrt(dx * dx + dy * dy);

    if (distanceFp <= 0) {
      entity.task = {
        kind: "idle",
        evidence: "simulated"
      };
      continue;
    }

    const travelFp = Math.floor((entity.speedFpPerSecond * deltaMs) / 1000);
    entity.facing = dx < 0 ? -1 : 1;

    if (travelFp >= distanceFp) {
      entity.position = {
        xFp: entity.task.destination.xFp,
        yFp: entity.task.destination.yFp,
        evidence: "simulated"
      };
      entity.task = {
        kind: "idle",
        evidence: "simulated"
      };
      continue;
    }

    entity.position = {
      xFp: entity.position.xFp + Math.trunc((dx * travelFp) / distanceFp),
      yFp: entity.position.yFp + Math.trunc((dy * travelFp) / distanceFp),
      evidence: "simulated"
    };
  }
}

function integerSqrt(value: number): number {
  return Math.floor(Math.sqrt(value));
}
