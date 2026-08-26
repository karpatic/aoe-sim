import type {
  CommandDestination,
  EntityId,
  EvidenceClass,
  FixedPoint,
  MapBounds,
  PathFailureReason,
  RulesetV1
} from "../../replay/model";
import type { EntityState, FixedPointWaypoint, PlannedRoute } from "../world";

const FIXED_POINT_SCALE = 1000;
const ORTHOGONAL_COST = 1000;
const DIAGONAL_COST = 1414;
const SEARCH_NODE_LIMIT = 20000;

const neighbors: readonly Neighbor[] = [
  { dx: 1, dy: 0, cost: ORTHOGONAL_COST },
  { dx: 0, dy: 1, cost: ORTHOGONAL_COST },
  { dx: -1, dy: 0, cost: ORTHOGONAL_COST },
  { dx: 0, dy: -1, cost: ORTHOGONAL_COST },
  { dx: 1, dy: 1, cost: DIAGONAL_COST },
  { dx: -1, dy: 1, cost: DIAGONAL_COST },
  { dx: -1, dy: -1, cost: DIAGONAL_COST },
  { dx: 1, dy: -1, cost: DIAGONAL_COST }
];

export interface RoutePlanContext {
  readonly commandId: string;
  readonly plannedAtMs: number;
  readonly sourceSequence: number;
  readonly evidence: EvidenceClass;
  readonly ignoreDynamicActorIds: readonly EntityId[];
}

export interface OccupancyCheck {
  readonly ok: boolean;
  readonly reason?: "out-of-bounds" | "terrain-blocked" | "static-blocked" | "dynamic-blocked";
  readonly blockerId?: EntityId;
  readonly tileX?: number;
  readonly tileY?: number;
}

interface Neighbor {
  readonly dx: number;
  readonly dy: number;
  readonly cost: number;
}

interface Tile {
  readonly x: number;
  readonly y: number;
}

interface StaticBlocker {
  readonly entityId: EntityId;
  readonly kind: string;
}

interface OpenNode {
  readonly index: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly g: number;
  readonly h: number;
  readonly f: number;
  readonly ordinal: number;
}

interface SearchResult {
  readonly status: "found" | "failed";
  readonly reason?: "search-limit" | "no-route";
  readonly tiles: readonly Tile[];
  readonly searchedNodeCount: number;
}

export class PathingState {
  private readonly terrainPassableByRestriction = new Map<number, ReadonlySet<number>>();
  private readonly terrainPassableFallback = new Map<number, boolean>();
  private staticBlockers: Array<StaticBlocker | undefined>;
  private mutableStaticVersion = 1;
  private mutableStaticBlockedTiles = 0;

  public constructor(
    private readonly map: MapBounds,
    ruleset: RulesetV1,
    entities: ReadonlyMap<EntityId, EntityState>
  ) {
    this.staticBlockers = new Array(map.widthTiles * map.heightTiles);
    this.readTerrainRules(ruleset);
    this.rebuildStaticObstacles(entities, false);
  }

  public get staticVersion(): number {
    return this.mutableStaticVersion;
  }

  public get staticBlockedTiles(): number {
    return this.mutableStaticBlockedTiles;
  }

  public rebuildStaticObstacles(entities: ReadonlyMap<EntityId, EntityState>, incrementVersion = true): void {
    this.staticBlockers = new Array(this.map.widthTiles * this.map.heightTiles);
    const staticEntities = [...entities.values()]
      .filter((entity) => entity.lifecycle.state === "alive" && entity.pathing.occupancyKind === "static")
      .sort((left, right) => left.id.localeCompare(right.id));

    for (const entity of staticEntities) {
      this.markStaticFootprint(entity);
    }

    this.mutableStaticBlockedTiles = this.staticBlockers.filter(Boolean).length;
    if (incrementVersion) {
      this.mutableStaticVersion += 1;
    }
  }

  public planRoute(
    entity: EntityState,
    destination: Pick<CommandDestination, "x" | "y">,
    context: RoutePlanContext,
    entities: ReadonlyMap<EntityId, EntityState>
  ): PlannedRoute {
    const destinationFp = {
      xFp: toFixedPoint(destination.x),
      yFp: toFixedPoint(destination.y)
    };
    const fail = (
      reason: PathFailureReason,
      detail: string,
      searchedNodeCount = 0,
      pathNodeCount = 0
    ): PlannedRoute =>
      this.createRoute(entity, destinationFp, context, [], pathNodeCount, searchedNodeCount, reason, detail);

    if (!this.isPointInsideMap(entity.position.xFp, entity.position.yFp)) {
      return fail("start-out-of-bounds", "actor position is outside map bounds");
    }
    if (!this.isPointInsideMap(destinationFp.xFp, destinationFp.yFp)) {
      return fail("destination-out-of-bounds", "destination is outside map bounds");
    }

    const start = pointToTile(entity.position.xFp, entity.position.yFp);
    const goal = pointToTile(destinationFp.xFp, destinationFp.yFp);
    const ignoreDynamicActorIds = new Set(context.ignoreDynamicActorIds);
    const startCheck = this.checkTile(entity, start.x, start.y, ignoreDynamicActorIds, entities, false);
    if (!startCheck.ok) {
      return fail(startFailureReason(startCheck), formatBlockDetail(startCheck));
    }

    const destinationCheck = this.checkOccupancyAtPosition(
      entity,
      destinationFp.xFp,
      destinationFp.yFp,
      ignoreDynamicActorIds,
      entities,
      false
    );
    if (!destinationCheck.ok) {
      return fail(destinationFailureReason(destinationCheck), formatBlockDetail(destinationCheck));
    }

    const search = this.search(entity, start, goal, ignoreDynamicActorIds, entities);
    if (search.status === "failed") {
      return fail(search.reason ?? "no-route", search.reason ?? "no route found", search.searchedNodeCount);
    }

    const waypoints = buildWaypoints(search.tiles, destinationFp);
    return this.createRoute(
      entity,
      destinationFp,
      context,
      waypoints,
      search.tiles.length,
      search.searchedNodeCount
    );
  }

  public checkOccupancyAtPosition(
    entity: EntityState,
    xFp: FixedPoint,
    yFp: FixedPoint,
    ignoreDynamicActorIds: ReadonlySet<EntityId>,
    entities: ReadonlyMap<EntityId, EntityState>,
    checkDynamic = true,
    dynamicEntities: Iterable<EntityState> = entities.values()
  ): OccupancyCheck {
    if (!this.isPointInsideMap(xFp, yFp)) {
      return {
        ok: false,
        reason: "out-of-bounds"
      };
    }

    const tile = pointToTile(xFp, yFp);
    const tileCheck = this.checkTile(entity, tile.x, tile.y, ignoreDynamicActorIds, entities, false);
    if (!tileCheck.ok) {
      return tileCheck;
    }

    if (checkDynamic) {
      const dynamicBlocker = this.findDynamicBlocker(entity, xFp, yFp, ignoreDynamicActorIds, dynamicEntities);
      if (dynamicBlocker) {
        return {
          ok: false,
          reason: "dynamic-blocked",
          blockerId: dynamicBlocker.id,
          tileX: tile.x,
          tileY: tile.y
        };
      }
    }

    return {
      ok: true,
      tileX: tile.x,
      tileY: tile.y
    };
  }

  public isTileTerrainPassable(entity: EntityState, tileX: number, tileY: number): boolean {
    if (!isInsideTileBounds(this.map, tileX, tileY)) {
      return false;
    }
    if (!this.map.tileGrid || entity.pathing.flyMode > 0) {
      return true;
    }

    const terrainId = this.map.tileGrid.terrainIds[this.index(tileX, tileY)];
    if (terrainId === undefined) {
      return false;
    }
    const terrainRestriction = entity.pathing.terrainRestrictionId;
    if (terrainRestriction !== undefined) {
      const passableTerrainIds = this.terrainPassableByRestriction.get(terrainRestriction);
      if (passableTerrainIds) {
        return passableTerrainIds.has(terrainId);
      }
    }

    return this.terrainPassableFallback.get(terrainId) ?? true;
  }

  public isStaticTileBlocked(tileX: number, tileY: number): boolean {
    return Boolean(this.staticBlockers[this.index(tileX, tileY)]);
  }

  public staticBlockerAt(tileX: number, tileY: number): StaticBlocker | undefined {
    return this.staticBlockers[this.index(tileX, tileY)];
  }

  private readTerrainRules(ruleset: RulesetV1): void {
    for (const terrain of ruleset.terrain) {
      if (terrain.id !== undefined) {
        this.terrainPassableFallback.set(terrain.id, terrain.passable);
      }
    }

    for (const restriction of ruleset.terrainRestrictions ?? []) {
      const id = readInteger(restriction.id);
      const passableTerrainIds = readNumberArray(restriction.passableTerrainIds);
      if (id !== undefined && passableTerrainIds) {
        this.terrainPassableByRestriction.set(id, new Set(passableTerrainIds));
      }
    }
  }

  private markStaticFootprint(entity: EntityState): void {
    const halfWidth = entity.pathing.footprintHalfWidthFp / FIXED_POINT_SCALE;
    const halfHeight = entity.pathing.footprintHalfHeightFp / FIXED_POINT_SCALE;
    if (halfWidth <= 0 || halfHeight <= 0) {
      return;
    }

    const centerX = entity.position.xFp / FIXED_POINT_SCALE;
    const centerY = entity.position.yFp / FIXED_POINT_SCALE;
    const minTileX = Math.max(0, Math.floor(centerX - halfWidth));
    const maxTileX = Math.min(this.map.widthTiles - 1, Math.floor(centerX + halfWidth));
    const minTileY = Math.max(0, Math.floor(centerY - halfHeight));
    const maxTileY = Math.min(this.map.heightTiles - 1, Math.floor(centerY + halfHeight));
    const blocker = {
      entityId: entity.id,
      kind: entity.kind
    };

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const tileCenterX = tileX + 0.5;
        const tileCenterY = tileY + 0.5;
        if (
          tileCenterX < centerX - halfWidth ||
          tileCenterX > centerX + halfWidth ||
          tileCenterY < centerY - halfHeight ||
          tileCenterY > centerY + halfHeight
        ) {
          continue;
        }

        const index = this.index(tileX, tileY);
        const existing = this.staticBlockers[index];
        if (!existing || blocker.entityId.localeCompare(existing.entityId) < 0) {
          this.staticBlockers[index] = blocker;
        }
      }
    }
  }

  private search(
    entity: EntityState,
    start: Tile,
    goal: Tile,
    ignoreDynamicActorIds: ReadonlySet<EntityId>,
    entities: ReadonlyMap<EntityId, EntityState>
  ): SearchResult {
    const tileCount = this.map.widthTiles * this.map.heightTiles;
    const maxSearchedNodes = Math.max(64, Math.min(tileCount, SEARCH_NODE_LIMIT));
    const startIndex = this.index(start.x, start.y);
    const goalIndex = this.index(goal.x, goal.y);
    const gScore = new Array<number>(tileCount).fill(Number.POSITIVE_INFINITY);
    const parent = new Array<number>(tileCount).fill(-1);
    const closed = new Uint8Array(tileCount);
    const open: OpenNode[] = [];
    let ordinal = 0;
    let searchedNodeCount = 0;

    gScore[startIndex] = 0;
    open.push(makeOpenNode(startIndex, start.x, start.y, 0, heuristic(start, goal), ordinal));
    ordinal += 1;

    while (open.length) {
      const openIndex = findBestOpenIndex(open);
      const current = open.splice(openIndex, 1)[0];
      if (!current || closed[current.index]) {
        continue;
      }

      closed[current.index] = 1;
      searchedNodeCount += 1;
      if (searchedNodeCount > maxSearchedNodes) {
        return {
          status: "failed",
          reason: "search-limit",
          tiles: [],
          searchedNodeCount
        };
      }

      if (current.index === goalIndex) {
        return {
          status: "found",
          tiles: reconstructTiles(parent, startIndex, goalIndex, this.map.widthTiles),
          searchedNodeCount
        };
      }

      for (const neighbor of neighbors) {
        const nextX = current.tileX + neighbor.dx;
        const nextY = current.tileY + neighbor.dy;
        if (!isInsideTileBounds(this.map, nextX, nextY)) {
          continue;
        }

        const nextIndex = this.index(nextX, nextY);
        if (closed[nextIndex]) {
          continue;
        }
        if (!this.canStepTo(entity, current.tileX, current.tileY, nextX, nextY, ignoreDynamicActorIds, entities)) {
          continue;
        }

        const tentativeG = current.g + neighbor.cost;
        if (tentativeG >= (gScore[nextIndex] ?? Number.POSITIVE_INFINITY)) {
          continue;
        }

        gScore[nextIndex] = tentativeG;
        parent[nextIndex] = current.index;
        const h = heuristic({ x: nextX, y: nextY }, goal);
        open.push(makeOpenNode(nextIndex, nextX, nextY, tentativeG, h, ordinal));
        ordinal += 1;
      }
    }

    return {
      status: "failed",
      reason: "no-route",
      tiles: [],
      searchedNodeCount
    };
  }

  private canStepTo(
    entity: EntityState,
    fromX: number,
    fromY: number,
    nextX: number,
    nextY: number,
    ignoreDynamicActorIds: ReadonlySet<EntityId>,
    entities: ReadonlyMap<EntityId, EntityState>
  ): boolean {
    if (!this.checkTile(entity, nextX, nextY, ignoreDynamicActorIds, entities, false).ok) {
      return false;
    }

    const isDiagonal = fromX !== nextX && fromY !== nextY;
    if (!isDiagonal) {
      return true;
    }

    return (
      this.checkTile(entity, nextX, fromY, ignoreDynamicActorIds, entities, false).ok &&
      this.checkTile(entity, fromX, nextY, ignoreDynamicActorIds, entities, false).ok
    );
  }

  private checkTile(
    entity: EntityState,
    tileX: number,
    tileY: number,
    ignoreDynamicActorIds: ReadonlySet<EntityId>,
    entities: ReadonlyMap<EntityId, EntityState>,
    checkDynamic: boolean,
    dynamicEntities: Iterable<EntityState> = entities.values()
  ): OccupancyCheck {
    if (!isInsideTileBounds(this.map, tileX, tileY)) {
      return {
        ok: false,
        reason: "out-of-bounds",
        tileX,
        tileY
      };
    }

    if (!this.isTileTerrainPassable(entity, tileX, tileY)) {
      return {
        ok: false,
        reason: "terrain-blocked",
        tileX,
        tileY
      };
    }

    const staticBlocker = this.staticBlockerAt(tileX, tileY);
    if (staticBlocker) {
      return {
        ok: false,
        reason: "static-blocked",
        blockerId: staticBlocker.entityId,
        tileX,
        tileY
      };
    }

    if (checkDynamic) {
      const dynamicBlocker = this.findDynamicBlocker(
        entity,
        toFixedPoint(tileX + 0.5),
        toFixedPoint(tileY + 0.5),
        ignoreDynamicActorIds,
        dynamicEntities
      );
      if (dynamicBlocker) {
        return {
          ok: false,
          reason: "dynamic-blocked",
          blockerId: dynamicBlocker.id,
          tileX,
          tileY
        };
      }
    }

    return {
      ok: true,
      tileX,
      tileY
    };
  }

  private findDynamicBlocker(
    entity: EntityState,
    xFp: FixedPoint,
    yFp: FixedPoint,
    ignoreDynamicActorIds: ReadonlySet<EntityId>,
    entities: Iterable<EntityState>
  ): EntityState | undefined {
    let blocker: EntityState | undefined;
    for (const other of entities) {
      if (
        other.id === entity.id ||
        ignoreDynamicActorIds.has(other.id) ||
        other.lifecycle.state !== "alive" ||
        other.pathing.occupancyKind !== "dynamic"
      ) {
        continue;
      }

      const dx = other.position.xFp - xFp;
      const dy = other.position.yFp - yFp;
      const minimumDistance = entity.pathing.collisionRadiusFp + other.pathing.collisionRadiusFp;
      if (dx * dx + dy * dy >= minimumDistance * minimumDistance) {
        continue;
      }

      if (!blocker || other.id.localeCompare(blocker.id) < 0) {
        blocker = other;
      }
    }

    return blocker;
  }

  private createRoute(
    entity: EntityState,
    destination: { readonly xFp: FixedPoint; readonly yFp: FixedPoint },
    context: RoutePlanContext,
    waypoints: FixedPointWaypoint[],
    pathNodeCount: number,
    searchedNodeCount: number,
    failureReason?: PathFailureReason,
    failureDetail?: string
  ): PlannedRoute {
    const route: PlannedRoute = {
      commandId: context.commandId,
      status: failureReason ? "failed" : "planned",
      plannedAtMs: context.plannedAtMs,
      staticVersion: this.staticVersion,
      actorRadiusFp: entity.pathing.collisionRadiusFp,
      destination,
      sourceSequence: context.sourceSequence,
      evidence: context.evidence,
      waypoints,
      nextWaypointIndex: 0,
      pathNodeCount,
      searchedNodeCount,
      blockedStepCount: 0,
      ignoreDynamicActorIds: [...context.ignoreDynamicActorIds].sort()
    };
    if (entity.pathing.terrainRestrictionId !== undefined) {
      route.terrainRestrictionId = entity.pathing.terrainRestrictionId;
    }
    if (failureReason !== undefined) {
      route.failureReason = failureReason;
    }
    if (failureDetail !== undefined) {
      route.failureDetail = failureDetail;
    }

    return route;
  }

  private isPointInsideMap(xFp: FixedPoint, yFp: FixedPoint): boolean {
    return (
      xFp >= 0 &&
      yFp >= 0 &&
      xFp < this.map.widthTiles * FIXED_POINT_SCALE &&
      yFp < this.map.heightTiles * FIXED_POINT_SCALE
    );
  }

  private index(tileX: number, tileY: number): number {
    return tileY * this.map.widthTiles + tileX;
  }
}

export function isInsideMap(map: MapBounds, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.widthTiles && y < map.heightTiles;
}

function isInsideTileBounds(map: MapBounds, tileX: number, tileY: number): boolean {
  return tileX >= 0 && tileY >= 0 && tileX < map.widthTiles && tileY < map.heightTiles;
}

function buildWaypoints(
  tiles: readonly Tile[],
  destination: { readonly xFp: FixedPoint; readonly yFp: FixedPoint }
): FixedPointWaypoint[] {
  const waypoints: FixedPointWaypoint[] = [];
  for (let index = 1; index < tiles.length; index += 1) {
    const tile = tiles[index];
    if (!tile) {
      continue;
    }
    waypoints.push({
      xFp: toFixedPoint(tile.x + 0.5),
      yFp: toFixedPoint(tile.y + 0.5),
      tileX: tile.x,
      tileY: tile.y
    });
  }

  const finalTile = tiles[tiles.length - 1];
  const finalWaypoint = {
    xFp: destination.xFp,
    yFp: destination.yFp,
    tileX: finalTile?.x ?? pointToTile(destination.xFp, destination.yFp).x,
    tileY: finalTile?.y ?? pointToTile(destination.xFp, destination.yFp).y
  };
  const last = waypoints[waypoints.length - 1];
  if (!last || last.xFp !== finalWaypoint.xFp || last.yFp !== finalWaypoint.yFp) {
    waypoints.push(finalWaypoint);
  }

  return waypoints;
}

function makeOpenNode(
  index: number,
  tileX: number,
  tileY: number,
  g: number,
  h: number,
  ordinal: number
): OpenNode {
  return {
    index,
    tileX,
    tileY,
    g,
    h,
    f: g + h,
    ordinal
  };
}

function findBestOpenIndex(open: readonly OpenNode[]): number {
  let bestIndex = 0;
  for (let index = 1; index < open.length; index += 1) {
    const candidate = open[index];
    const best = open[bestIndex];
    if (candidate && best && compareOpenNodes(candidate, best) < 0) {
      bestIndex = index;
    }
  }

  return bestIndex;
}

function compareOpenNodes(left: OpenNode, right: OpenNode): number {
  return (
    left.f - right.f ||
    left.h - right.h ||
    left.g - right.g ||
    left.tileY - right.tileY ||
    left.tileX - right.tileX ||
    left.ordinal - right.ordinal
  );
}

function heuristic(left: Tile, right: Tile): number {
  const dx = Math.abs(left.x - right.x);
  const dy = Math.abs(left.y - right.y);
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;
  return diagonal * DIAGONAL_COST + straight * ORTHOGONAL_COST;
}

function reconstructTiles(
  parent: readonly number[],
  startIndex: number,
  goalIndex: number,
  widthTiles: number
): readonly Tile[] {
  const reversed: Tile[] = [];
  let current = goalIndex;

  while (current !== -1) {
    reversed.push(indexToTile(current, widthTiles));
    if (current === startIndex) {
      break;
    }
    current = parent[current] ?? -1;
  }

  return reversed.reverse();
}

function pointToTile(xFp: FixedPoint, yFp: FixedPoint): Tile {
  return {
    x: Math.floor(xFp / FIXED_POINT_SCALE),
    y: Math.floor(yFp / FIXED_POINT_SCALE)
  };
}

function indexToTile(index: number, widthTiles: number): Tile {
  return {
    x: index % widthTiles,
    y: Math.floor(index / widthTiles)
  };
}

function toFixedPoint(value: number): FixedPoint {
  return Math.round(value * FIXED_POINT_SCALE);
}

function startFailureReason(check: OccupancyCheck): PathFailureReason {
  switch (check.reason) {
    case "out-of-bounds":
      return "start-out-of-bounds";
    case "terrain-blocked":
      return "start-terrain-blocked";
    case "static-blocked":
      return "start-static-blocked";
    case "dynamic-blocked":
      return "dynamic-blocked";
    default:
      return "no-route";
  }
}

function destinationFailureReason(check: OccupancyCheck): PathFailureReason {
  switch (check.reason) {
    case "out-of-bounds":
      return "destination-out-of-bounds";
    case "terrain-blocked":
      return "destination-terrain-blocked";
    case "static-blocked":
      return "destination-static-blocked";
    case "dynamic-blocked":
      return "dynamic-blocked";
    default:
      return "no-route";
  }
}

function formatBlockDetail(check: OccupancyCheck): string {
  const tile = check.tileX === undefined || check.tileY === undefined ? "" : ` at ${check.tileX},${check.tileY}`;
  const blocker = check.blockerId ? ` by ${check.blockerId}` : "";
  return `${check.reason ?? "blocked"}${tile}${blocker}`;
}

function readInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readNumberArray(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const output: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      return undefined;
    }
    output.push(item);
  }

  return output;
}
