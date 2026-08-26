import type { EntityId, FixedPoint, RulesetUnit, TreeActiveSetDiagnostics } from "../replay/model";
import type { EntityState, ResourceNodeState, WorldState } from "./world";

const FIXED_POINT_SCALE = 1000;
const TREE_RESOURCE_CLASS_ID = 15;
const TREE_CUTTING_SIEGE_CLASS_ID = 13;
const TREE_CUTTING_SIEGE_KINDS = new Set(["onager", "siege-onager"]);

export const TREE_SIEGE_ACTIVATION_RADIUS_TILES = 10;

const TREE_SIEGE_ACTIVATION_RADIUS_FP = TREE_SIEGE_ACTIVATION_RADIUS_TILES * FIXED_POINT_SCALE;
const TREE_SIEGE_ACTIVATION_RADIUS_SQUARED =
  TREE_SIEGE_ACTIVATION_RADIUS_FP * TREE_SIEGE_ACTIVATION_RADIUS_FP;
const TREE_NEIGHBORS: readonly TileOffset[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 }
];

interface Tile {
  readonly x: number;
  readonly y: number;
}

interface TileOffset {
  readonly x: number;
  readonly y: number;
}

export class TreeActiveSet {
  private readonly trackedTreeResourceIds = new Set<EntityId>();
  private readonly liveInteriorTreeIds = new Set<EntityId>();
  private readonly liveExposedTreeIds = new Set<EntityId>();
  private readonly siegeActivatedTreeIds = new Set<EntityId>();
  private readonly activeTreeIds = new Set<EntityId>();
  private readonly activeEntityIdSet = new Set<EntityId>();
  private readonly capableSiegeEntityIds = new Set<EntityId>();
  private allTreeResourceIds: EntityId[] = [];
  private liveTreeResourceIds: EntityId[] = [];
  private activeEntityIds: EntityId[] = [];
  private treeTileCount = 0;
  private interiorTreeTileCount = 0;
  private siegeTreeDestructionActive = false;
  private capableSiegeUnits = 0;

  public rebuild(world: WorldState): void {
    const treeIdsByTile = new Map<string, EntityId[]>();
    const allTreeResourceIds: EntityId[] = [];
    const liveTreeResourceIds: EntityId[] = [];
    this.trackedTreeResourceIds.clear();
    this.liveInteriorTreeIds.clear();
    this.liveExposedTreeIds.clear();

    for (const node of world.resourceNodes.values()) {
      const entity = world.entities.get(node.id);
      if (!entity || !isRepresentedTreeResource(world, entity, node)) {
        continue;
      }

      allTreeResourceIds.push(entity.id);
      this.trackedTreeResourceIds.add(entity.id);
      if (!isLiveTreeResource(entity, node)) {
        continue;
      }

      liveTreeResourceIds.push(entity.id);
      const tile = pointToTile(entity.position.xFp, entity.position.yFp);
      const key = tileKey(tile);
      const ids = treeIdsByTile.get(key);
      if (ids) {
        ids.push(entity.id);
      } else {
        treeIdsByTile.set(key, [entity.id]);
      }
    }

    for (const ids of treeIdsByTile.values()) {
      ids.sort();
    }

    const interiorTileKeys = new Set<string>();
    for (const [key] of [...treeIdsByTile.entries()].sort(compareTileEntries)) {
      const tile = parseTileKey(key);
      if (isInteriorTreeTile(treeIdsByTile, tile)) {
        interiorTileKeys.add(key);
      }
    }

    for (const [key, ids] of treeIdsByTile) {
      const targetSet = interiorTileKeys.has(key) ? this.liveInteriorTreeIds : this.liveExposedTreeIds;
      for (const id of ids) {
        targetSet.add(id);
      }
    }

    this.allTreeResourceIds = allTreeResourceIds.sort();
    this.liveTreeResourceIds = liveTreeResourceIds.sort();
    this.treeTileCount = treeIdsByTile.size;
    this.interiorTreeTileCount = interiorTileKeys.size;
    this.rebuildCapableSiegeIndex(world);
    this.refreshSiegeActivation(world, true);
  }

  public observeEntity(world: WorldState, entity: EntityState): void {
    if (hasRepresentedTreeDestructionIdentity(world, entity)) {
      this.capableSiegeEntityIds.add(entity.id);
    }
    if (!this.trackedTreeResourceIds.has(entity.id)) {
      this.addActiveEntityId(entity.id);
    }
  }

  public refreshSiegeActivation(world: WorldState, forceRebuild = false): void {
    const capableSiege = this.liveTreeCuttingSiegeEntities(world);
    const nextSiegeActivatedTreeIds = new Set<EntityId>();

    if (capableSiege.length) {
      for (const treeId of this.liveInteriorTreeIds) {
        const tree = world.entities.get(treeId);
        if (!tree) {
          continue;
        }
        if (isWithinSiegeActivationRadius(tree, capableSiege)) {
          nextSiegeActivatedTreeIds.add(treeId);
        }
      }
    }

    const nextSiegeTreeDestructionActive = capableSiege.length > 0;
    const changed =
      forceRebuild ||
      nextSiegeTreeDestructionActive !== this.siegeTreeDestructionActive ||
      capableSiege.length !== this.capableSiegeUnits ||
      !setsEqual(nextSiegeActivatedTreeIds, this.siegeActivatedTreeIds);

    if (!changed) {
      return;
    }

    this.siegeActivatedTreeIds.clear();
    this.activeTreeIds.clear();
    for (const id of this.liveExposedTreeIds) {
      this.activeTreeIds.add(id);
    }
    for (const id of nextSiegeActivatedTreeIds) {
      this.siegeActivatedTreeIds.add(id);
      this.activeTreeIds.add(id);
    }

    this.siegeTreeDestructionActive = nextSiegeTreeDestructionActive;
    this.capableSiegeUnits = capableSiege.length;
    this.rebuildActiveEntityIds(world);
  }

  public activeEntities(world: WorldState): EntityState[] {
    const output: EntityState[] = [];
    for (const id of this.activeEntityIds) {
      const entity = world.entities.get(id);
      if (entity) {
        output.push(entity);
      }
    }

    return output;
  }

  public isTrackedTreeResource(entity: EntityState, node: ResourceNodeState | undefined): boolean {
    return node !== undefined && this.trackedTreeResourceIds.has(entity.id);
  }

  public diagnostics(): TreeActiveSetDiagnostics {
    const activeExposed = this.liveExposedTreeIds.size;
    const siegeActivated = this.siegeActivatedTreeIds.size;
    return {
      totalTreeResources: this.allTreeResourceIds.length,
      liveTreeResources: this.liveTreeResourceIds.length,
      treeTileCount: this.treeTileCount,
      interiorTreeTileCount: this.interiorTreeTileCount,
      activeTotal: activeExposed + siegeActivated,
      activeExposed,
      dormantInterior: this.liveInteriorTreeIds.size - siegeActivated,
      siegeActivated,
      siegeTreeDestructionActive: this.siegeTreeDestructionActive,
      capableSiegeUnits: this.capableSiegeUnits,
      siegeActivationRadiusTiles: TREE_SIEGE_ACTIVATION_RADIUS_TILES
    };
  }

  private rebuildCapableSiegeIndex(world: WorldState): void {
    this.capableSiegeEntityIds.clear();
    for (const entity of world.entities.values()) {
      if (hasRepresentedTreeDestructionIdentity(world, entity)) {
        this.capableSiegeEntityIds.add(entity.id);
      }
    }
  }

  private liveTreeCuttingSiegeEntities(world: WorldState): EntityState[] {
    const siege: EntityState[] = [];
    for (const id of [...this.capableSiegeEntityIds].sort()) {
      const entity = world.entities.get(id);
      if (entityHasRepresentedTreeDestructionCapability(world, entity)) {
        siege.push(entity);
      }
    }

    return siege;
  }

  private rebuildActiveEntityIds(world: WorldState): void {
    this.activeEntityIds = [];
    this.activeEntityIdSet.clear();
    for (const entity of world.entities.values()) {
      if (!this.trackedTreeResourceIds.has(entity.id) || this.activeTreeIds.has(entity.id)) {
        this.addActiveEntityId(entity.id);
      }
    }
  }

  private addActiveEntityId(id: EntityId): void {
    if (this.activeEntityIdSet.has(id)) {
      return;
    }

    this.activeEntityIdSet.add(id);
    this.activeEntityIds.push(id);
  }
}

export function isRepresentedTreeResource(
  world: WorldState,
  entity: EntityState,
  node: ResourceNodeState
): boolean {
  const rule = world.resolveUnitRule(entity.dataId, entity.kind);
  if (node.resource !== "wood" || node.family !== "tree" || (rule?.token ?? entity.pathing.token) !== "resource") {
    return false;
  }

  if (hasTreeIdentity(entity, rule)) {
    return true;
  }

  return (
    rule?.classId === TREE_RESOURCE_CLASS_ID &&
    entity.classId !== undefined &&
    !hasForageIdentity(entity, rule)
  );
}

export function entityHasRepresentedTreeDestructionCapability(
  world: WorldState,
  entity: EntityState | undefined
): entity is EntityState {
  if (!entity || entity.lifecycle.state !== "alive") {
    return false;
  }

  return treeCuttingTechnologyAllowsRepresentedState(world, entity) &&
    hasRepresentedTreeDestructionIdentity(world, entity);
}

function treeCuttingTechnologyAllowsRepresentedState(_world: WorldState, _entity: EntityState): boolean {
  // Current snapshots do not carry researched technology state, so represented onager identity is the evidence.
  return true;
}

function hasRepresentedTreeDestructionIdentity(world: WorldState, entity: EntityState): boolean {
  const rule = world.resolveUnitRule(entity.dataId, entity.kind);
  if (!rule || rule.classId !== TREE_CUTTING_SIEGE_CLASS_ID || rule.typeName !== "creatable") {
    return false;
  }

  return TREE_CUTTING_SIEGE_KINDS.has(normalizeKind(rule.kind)) &&
    readNumber(rule.combat?.maxRange, 0) >= 7 &&
    hasPositiveAttack(rule);
}

function isLiveTreeResource(entity: EntityState, node: ResourceNodeState): boolean {
  return entity.lifecycle.state === "alive" && !node.depleted && entity.hp > 0;
}

function isInteriorTreeTile(treeIdsByTile: ReadonlyMap<string, readonly EntityId[]>, tile: Tile): boolean {
  for (const neighbor of TREE_NEIGHBORS) {
    if (!treeIdsByTile.has(tileKey({ x: tile.x + neighbor.x, y: tile.y + neighbor.y }))) {
      return false;
    }
  }

  return true;
}

function isWithinSiegeActivationRadius(tree: EntityState, siege: readonly EntityState[]): boolean {
  for (const entity of siege) {
    if (distanceSquared(tree.position, entity.position) <= TREE_SIEGE_ACTIVATION_RADIUS_SQUARED) {
      return true;
    }
  }

  return false;
}

function hasTreeIdentity(entity: EntityState, rule: RulesetUnit | undefined): boolean {
  return normalizedIdentityText(entity, rule).split(/\s+/).some((part) => part === "tree" || part.startsWith("tree-"));
}

function hasForageIdentity(entity: EntityState, rule: RulesetUnit | undefined): boolean {
  return /\b(bush|forage|fruit)\b/.test(normalizedIdentityText(entity, rule));
}

function normalizedIdentityText(entity: EntityState, rule: RulesetUnit | undefined): string {
  return [
    entity.kind,
    entity.label,
    rule?.kind,
    rule?.label,
    rule?.labels?.internalName,
    rule?.labels?.localizedName
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();
}

function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase();
}

function hasPositiveAttack(rule: RulesetUnit): boolean {
  const attacks = rule.combat?.attacks;
  if (!Array.isArray(attacks)) {
    return false;
  }

  return attacks.some((attack) => {
    if (!attack || typeof attack !== "object") {
      return false;
    }

    return readNumber((attack as Record<string, unknown>).amount, 0) > 0;
  });
}

function pointToTile(xFp: FixedPoint, yFp: FixedPoint): Tile {
  return {
    x: Math.floor(xFp / FIXED_POINT_SCALE),
    y: Math.floor(yFp / FIXED_POINT_SCALE)
  };
}

function tileKey(tile: Tile): string {
  return `${tile.x},${tile.y}`;
}

function parseTileKey(key: string): Tile {
  const [x = "0", y = "0"] = key.split(",");
  return {
    x: Number(x),
    y: Number(y)
  };
}

function compareTileEntries(left: readonly [string, readonly EntityId[]], right: readonly [string, readonly EntityId[]]): number {
  const leftTile = parseTileKey(left[0]);
  const rightTile = parseTileKey(right[0]);
  return leftTile.y - rightTile.y || leftTile.x - rightTile.x;
}

function distanceSquared(
  left: { readonly xFp: FixedPoint; readonly yFp: FixedPoint },
  right: { readonly xFp: FixedPoint; readonly yFp: FixedPoint }
): number {
  const dx = left.xFp - right.xFp;
  const dy = left.yFp - right.yFp;
  return dx * dx + dy * dy;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function setsEqual(left: ReadonlySet<EntityId>, right: ReadonlySet<EntityId>): boolean {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}
