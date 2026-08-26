import type { EntityId } from "../replay/model";
import type { EntityState, WorldState } from "./world";

export class SimulationStepContext {
  public readonly activeEntities: EntityState[];
  public readonly movingEntities: readonly EntityState[];
  public readonly workerEntities: readonly EntityState[];
  public readonly producerEntities: readonly EntityState[];
  public readonly attackerEntities: readonly EntityState[];
  public readonly hasCombatState: boolean;
  public readonly hasContinuousState: boolean;
  private readonly activeEntityIds: Set<EntityId>;

  private constructor(
    activeEntities: EntityState[],
    movingEntities: EntityState[],
    workerEntities: EntityState[],
    producerEntities: EntityState[],
    attackerEntities: EntityState[],
    activeEntityIds: Set<EntityId>,
    hasCombatState: boolean,
    hasContinuousState: boolean
  ) {
    this.activeEntities = activeEntities;
    this.movingEntities = movingEntities;
    this.workerEntities = workerEntities;
    this.producerEntities = producerEntities;
    this.attackerEntities = attackerEntities;
    this.hasCombatState = hasCombatState;
    this.hasContinuousState = hasContinuousState;
    this.activeEntityIds = activeEntityIds;
  }

  public static create(world: WorldState): SimulationStepContext {
    const activeEntities = [...world.activeSimulationEntities()];
    const activeEntityIds = new Set<EntityId>();
    const movingEntities: EntityState[] = [];
    const workerEntities: EntityState[] = [];
    const producerEntities: EntityState[] = [];
    const attackerEntities: EntityState[] = [];

    for (const entity of activeEntities) {
      activeEntityIds.add(entity.id);
      if (entity.lifecycle.state !== "alive") {
        continue;
      }
      if (entity.task.kind === "moving" && entity.speedFpPerSecond > 0) {
        movingEntities.push(entity);
      }
      if (entity.workerTask !== undefined) {
        workerEntities.push(entity);
      }
      if ((entity.production?.queue.length ?? 0) > 0) {
        producerEntities.push(entity);
      }
      if (entity.combat?.active !== undefined) {
        attackerEntities.push(entity);
      }
    }
    const hasCombatState =
      world.combatProjectiles.size > 0 ||
      attackerEntities.some((entity) => entity.combat?.active?.state !== "unsupported");
    const hasContinuousState =
      hasCombatState ||
      movingEntities.length > 0 ||
      workerEntities.some((entity) => entity.workerTask?.phase !== "stalled") ||
      producerEntities.length > 0;

    return new SimulationStepContext(
      activeEntities,
      movingEntities,
      workerEntities,
      producerEntities,
      attackerEntities,
      activeEntityIds,
      hasCombatState,
      hasContinuousState
    );
  }

  public observeActiveEntity(entity: EntityState): void {
    if (this.activeEntityIds.has(entity.id)) {
      return;
    }

    this.activeEntityIds.add(entity.id);
    this.activeEntities.push(entity);
  }
}
