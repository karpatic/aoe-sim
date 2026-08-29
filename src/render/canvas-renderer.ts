import { drawPixelToken, evidenceColor } from "./pixel-tokens";
import {
  drawForestTerrainCanopy,
  drawTreeResourceCanopy,
  forestTerrainFloorColor,
  isForestTerrainId,
  isTreeResourceEntity
} from "./tree-visuals";
import type {
  EntityId,
  MapBounds,
  PlaybackRenderFrame,
  PlayerDefinition,
  RenderEntitySnapshot,
  SnapshotProjectile,
  WorldSnapshot
} from "../replay/model";

interface TerrainCache {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
}

interface TreeCache {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
}

type EntityDrawMode = "dense" | "tokens";

export interface RendererDrawTiming {
  readonly mergeMs: number;
  readonly drawMs: number;
  readonly totalMs: number;
}

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private terrainCache: TerrainCache | undefined;
  private treeCache: TreeCache | undefined;
  private treeCacheDirty = true;
  private map: MapBounds | undefined;
  private players: readonly PlayerDefinition[] = [];
  private readonly playerColors = new Map<string, string>();
  private readonly entityCache = new Map<EntityId, RenderEntitySnapshot>();
  private readonly nonTreeEntities = new Map<EntityId, RenderEntitySnapshot>();
  private readonly treeEntityIds = new Set<EntityId>();
  private projectiles: readonly SnapshotProjectile[] = [];
  private renderedTimeMs: number | undefined;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", {
      alpha: false
    });

    if (!context) {
      throw new Error("Canvas 2D is unavailable");
    }

    this.context = context;
    this.context.imageSmoothingEnabled = false;
  }

  public draw(snapshot: WorldSnapshot): RendererDrawTiming {
    const mergeStartMs = performance.now();
    this.resetFromSnapshot(snapshot);
    const drawStartMs = performance.now();
    this.drawCurrent();
    const endMs = performance.now();
    return {
      mergeMs: drawStartMs - mergeStartMs,
      drawMs: endMs - drawStartMs,
      totalMs: endMs - mergeStartMs
    };
  }

  public drawFrame(frame: PlaybackRenderFrame): RendererDrawTiming | undefined {
    if (!this.map || frame.fromTimeMs !== this.renderedTimeMs) {
      return undefined;
    }

    const mergeStartMs = performance.now();
    for (const entity of frame.entityUpdates) {
      this.applyEntityUpdate(entity);
    }
    this.projectiles = frame.projectiles;
    this.renderedTimeMs = frame.timeMs;
    const drawStartMs = performance.now();
    this.drawCurrent();
    const endMs = performance.now();
    return {
      mergeMs: drawStartMs - mergeStartMs,
      drawMs: endMs - drawStartMs,
      totalMs: endMs - mergeStartMs
    };
  }

  private resetFromSnapshot(snapshot: WorldSnapshot): void {
    this.terrainCache = undefined;
    this.treeCache = undefined;
    this.treeCacheDirty = true;
    this.map = snapshot.map;
    this.players = snapshot.players;
    this.projectiles = snapshot.combat.projectiles;
    this.renderedTimeMs = snapshot.timeMs;
    this.playerColors.clear();
    this.entityCache.clear();
    this.nonTreeEntities.clear();
    this.treeEntityIds.clear();

    for (const id of snapshot.render.representedTreeEntityIds) {
      this.treeEntityIds.add(id);
    }

    for (const player of snapshot.players) {
      this.playerColors.set(player.id, player.color);
    }
    for (const entity of snapshot.entities) {
      this.applyEntityUpdate(entity);
    }
    this.treeCacheDirty = true;
  }

  private applyEntityUpdate(entity: RenderEntitySnapshot): void {
    const wasTree = this.treeEntityIds.has(entity.id);
    const isTree = entity.representedTreeResource ?? wasTree;

    if (isTree) {
      this.entityCache.set(entity.id, entity);
      this.treeEntityIds.add(entity.id);
      this.nonTreeEntities.delete(entity.id);
      this.treeCacheDirty = true;
      return;
    }

    if (isDeadCharacterEntity(entity)) {
      this.entityCache.delete(entity.id);
      this.nonTreeEntities.delete(entity.id);
      if (wasTree) {
        this.treeEntityIds.delete(entity.id);
        this.treeCacheDirty = true;
      }
      return;
    }

    this.entityCache.set(entity.id, entity);
    this.nonTreeEntities.set(entity.id, entity);
    if (wasTree) {
      this.treeEntityIds.delete(entity.id);
      this.treeCacheDirty = true;
    }
  }

  private drawCurrent(): void {
    const map = this.map;
    if (!map) {
      return;
    }

    this.syncCanvasLayout(map);

    const { context, canvas } = this;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#1f2917";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const tileSize = Math.max(
      1,
      Math.floor(Math.min((canvas.width - 16) / map.widthTiles, (canvas.height - 16) / map.heightTiles))
    );
    const originX = Math.floor((canvas.width - map.widthTiles * tileSize) / 2);
    const originY = Math.floor((canvas.height - map.heightTiles * tileSize) / 2);
    const drawMode: EntityDrawMode = this.entityCache.size > 1200 || tileSize <= 2 ? "dense" : "tokens";

    if (drawMode === "dense") {
      this.drawTerrain(map, originX, originY, tileSize);
      this.drawTreeLayer(map, originX, originY, tileSize, drawMode);
      this.drawTasks(originX, originY, tileSize);
      this.drawProjectiles(originX, originY, tileSize);
      this.drawDenseEntities(originX, originY, tileSize);
      return;
    }

    this.drawTerrain(map, originX, originY, tileSize);
    this.drawTreeLayer(map, originX, originY, tileSize, drawMode);
    this.drawTasks(originX, originY, tileSize);
    this.drawProjectiles(originX, originY, tileSize);
    for (const entity of [...this.nonTreeEntities.values()].sort(compareEntityDepth)) {
      const screen = worldToScreen(entity.position.x, entity.position.y, originX, originY, tileSize);
      drawPixelToken(context, entity, this.players, screen.x, screen.y, tileSize);
    }
  }

  private drawTerrain(map: MapBounds, originX: number, originY: number, tileSize: number): void {
    const { context } = this;

    if (map.tileGrid) {
      context.drawImage(this.renderTerrainCache(map, tileSize).canvas, originX, originY);
    } else {
      context.fillStyle = "#26351c";
      context.fillRect(originX, originY, map.widthTiles * tileSize, map.heightTiles * tileSize);
    }

    context.strokeStyle = "#52623b";
    context.lineWidth = 1;
    context.strokeRect(
      originX - 1,
      originY - 1,
      map.widthTiles * tileSize + 2,
      map.heightTiles * tileSize + 2
    );
  }

  private drawTreeLayer(
    map: MapBounds,
    originX: number,
    originY: number,
    tileSize: number,
    drawMode: EntityDrawMode
  ): void {
    if (!this.treeEntityIds.size) {
      return;
    }

    this.context.drawImage(this.renderTreeCache(map, tileSize, drawMode).canvas, originX, originY);
  }

  private drawTasks(originX: number, originY: number, tileSize: number): void {
    const { context } = this;

    for (const entity of this.nonTreeEntities.values()) {
      if (entity.task.kind !== "moving" || !entity.task.destination) {
        continue;
      }

      const start = worldToScreen(entity.position.x, entity.position.y, originX, originY, tileSize);
      const end = worldToScreen(entity.task.destination.x, entity.task.destination.y, originX, originY, tileSize);
      const remainingWaypoints = entity.task.route?.waypoints.slice(entity.task.route.nextWaypointIndex) ?? [];

      context.strokeStyle = evidenceColor("simulated");
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(start.x, start.y);
      for (const waypoint of remainingWaypoints) {
        const point = worldToScreen(waypoint.x, waypoint.y, originX, originY, tileSize);
        context.lineTo(point.x, point.y);
      }
      if (!remainingWaypoints.length) {
        context.lineTo(end.x, end.y);
      }
      context.stroke();

      context.fillStyle = evidenceColor(entity.task.evidence);
      context.fillRect(end.x - 1, end.y - 1, 3, 3);
    }

    for (const entity of this.nonTreeEntities.values()) {
      if (entity.task.kind !== "path-failed" || !entity.task.destination) {
        continue;
      }

      const end = worldToScreen(entity.task.destination.x, entity.task.destination.y, originX, originY, tileSize);
      context.strokeStyle = "#e2665f";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(end.x - 3, end.y - 3);
      context.lineTo(end.x + 3, end.y + 3);
      context.moveTo(end.x + 3, end.y - 3);
      context.lineTo(end.x - 3, end.y + 3);
      context.stroke();
    }
  }

  private drawProjectiles(originX: number, originY: number, tileSize: number): void {
    const { context } = this;
    context.save();
    context.strokeStyle = "#f6d77f";
    context.fillStyle = "#fff1a8";
    context.lineWidth = 1;

    for (const projectile of this.projectiles) {
      const start = worldToScreen(projectile.start.x, projectile.start.y, originX, originY, tileSize);
      const point = worldToScreen(projectile.x, projectile.y, originX, originY, tileSize);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.fillRect(point.x - 1, point.y - 1, 3, 3);
    }

    context.restore();
  }

  private drawDenseEntities(originX: number, originY: number, tileSize: number): void {
    const { context } = this;
    context.save();

    // Stable Gaia objects belong behind player buildings and moving units. Rendering in explicit
    // passes also prevents dense resource markers from covering an overlapping building footprint.
    for (const drawLayer of ["gaia", "building", "unit"] as const) {
      for (const entity of this.nonTreeEntities.values()) {
        if (denseEntityLayer(entity) === drawLayer) {
          drawDenseEntity(context, entity, this.playerColors, this.players, originX, originY, tileSize);
        }
      }
    }

    context.restore();
  }

  private renderTerrainCache(map: MapBounds, tileSize: number): TerrainCache {
    const grid = map.tileGrid;
    if (!grid) {
      throw new Error("Cannot cache terrain without a tile grid");
    }

    const key = `${map.widthTiles}x${map.heightTiles}:${tileSize}:${map.sourceMapId ?? "unknown"}`;
    if (this.terrainCache?.key === key) {
      return this.terrainCache;
    }

    const terrainCanvas = document.createElement("canvas");
    terrainCanvas.width = map.widthTiles * tileSize;
    terrainCanvas.height = map.heightTiles * tileSize;
    const terrainContext = terrainCanvas.getContext("2d", {
      alpha: false
    });
    if (!terrainContext) {
      throw new Error("Canvas 2D is unavailable");
    }

    terrainContext.imageSmoothingEnabled = false;
    const forestTiles: { x: number; y: number; terrainId: number; elevation: number }[] = [];
    for (let y = 0; y < map.heightTiles; y += 1) {
      for (let x = 0; x < map.widthTiles; x += 1) {
        const index = y * map.widthTiles + x;
        const terrainId = grid.terrainIds[index] ?? 0;
        const elevation = grid.elevations[index] ?? 0;
        if (isForestTerrainId(terrainId)) {
          forestTiles.push({ x, y, terrainId, elevation });
          terrainContext.fillStyle = forestTerrainFloorColor(terrainId, elevation);
        } else {
          terrainContext.fillStyle = terrainColor(terrainId, elevation);
        }
        terrainContext.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    for (const tile of forestTiles) {
      drawForestTerrainCanopy(
        terrainContext,
        tile.x * tileSize + tileSize / 2,
        tile.y * tileSize + tileSize / 2,
        tileSize,
        tile.terrainId,
        tile.elevation,
        [tile.x, tile.y, tile.terrainId]
      );
    }

    this.terrainCache = {
      key,
      canvas: terrainCanvas
    };
    return this.terrainCache;
  }

  private renderTreeCache(map: MapBounds, tileSize: number, drawMode: EntityDrawMode): TreeCache {
    const key = `${map.widthTiles}x${map.heightTiles}:${tileSize}:${map.sourceMapId ?? "unknown"}:${drawMode}`;
    if (!this.treeCacheDirty && this.treeCache?.key === key) {
      return this.treeCache;
    }

    const treeCanvas = document.createElement("canvas");
    treeCanvas.width = map.widthTiles * tileSize;
    treeCanvas.height = map.heightTiles * tileSize;
    const treeContext = treeCanvas.getContext("2d", {
      alpha: true
    });
    if (!treeContext) {
      throw new Error("Canvas 2D is unavailable");
    }

    treeContext.imageSmoothingEnabled = false;
    const trees: RenderEntitySnapshot[] = [];
    for (const id of this.treeEntityIds) {
      const entity = this.entityCache.get(id);
      if (entity) {
        trees.push(entity);
      }
    }

    for (const entity of trees.sort(compareEntityDepth)) {
      const screen = worldToScreen(entity.position.x, entity.position.y, 0, 0, tileSize);
      drawTreeResourceCanopy(treeContext, entity, screen.x, screen.y, tileSize);
    }

    this.treeCache = {
      key,
      canvas: treeCanvas
    };
    this.treeCacheDirty = false;
    return this.treeCache;
  }

  private syncCanvasLayout(map: MapBounds): void {
    const widthTiles = Math.max(1, map.widthTiles);
    const heightTiles = Math.max(1, map.heightTiles);
    this.canvas.style.setProperty("--map-aspect", (widthTiles / heightTiles).toFixed(4));
    this.canvas.style.setProperty("--map-ratio", `${widthTiles} / ${heightTiles}`);

    const bounds = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = bounds.width || this.canvas.clientWidth || this.canvas.width;
    const height = bounds.height || this.canvas.clientHeight || this.canvas.height;
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));

    if (this.canvas.width === targetWidth && this.canvas.height === targetHeight) {
      return;
    }

    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;
    this.context.imageSmoothingEnabled = false;
  }
}

function worldToScreen(
  x: number,
  y: number,
  originX: number,
  originY: number,
  tileSize: number
): { x: number; y: number } {
  return {
    x: Math.round(originX + x * tileSize),
    y: Math.round(originY + y * tileSize)
  };
}

function compareEntityDepth(left: RenderEntitySnapshot, right: RenderEntitySnapshot): number {
  return left.position.y - right.position.y || left.id.localeCompare(right.id);
}

function drawDenseEntity(
  context: CanvasRenderingContext2D,
  entity: RenderEntitySnapshot,
  colors: ReadonlyMap<string, string>,
  players: readonly PlayerDefinition[],
  originX: number,
  originY: number,
  tileSize: number
): void {
  const screen = worldToScreen(entity.position.x, entity.position.y, originX, originY, tileSize);
  if (isTreeResourceEntity(entity)) {
    drawTreeResourceCanopy(context, entity, screen.x, screen.y, tileSize);
    return;
  }
  if (isDenseBuilding(entity)) {
    drawDenseBuilding(context, entity, colors, players, screen.x, screen.y, tileSize);
    return;
  }
  if (entity.playerId !== "gaia" && !entity.resourceNode) {
    drawDenseUnitMarker(context, entity, colors, players, screen.x, screen.y, tileSize);
    return;
  }

  const size = entity.resourceNode
    ? Math.max(3, Math.round(tileSize * 0.65))
    : entity.playerId === "gaia"
      ? 1
      : Math.max(2, tileSize);
  context.fillStyle = denseEntityColor(entity, colors, players);
  context.fillRect(screen.x - Math.floor(size / 2), screen.y - Math.floor(size / 2), size, size);
}

function drawDenseUnitMarker(
  context: CanvasRenderingContext2D,
  entity: RenderEntitySnapshot,
  colors: ReadonlyMap<string, string>,
  players: readonly PlayerDefinition[],
  x: number,
  y: number,
  tileSize: number
): void {
  const family = denseUnitFamily(entity);
  const color = denseEntityColor(entity, colors, players);
  const half = Math.max(3, Math.round(tileSize * 0.85));
  const rim = Math.max(1, Math.round(tileSize * 0.18));

  context.save();
  context.translate(x, y);
  context.fillStyle = "rgba(5, 8, 10, 0.82)";
  context.beginPath();
  context.arc(0, 0, half + 2, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#f9f0d0";
  context.lineWidth = rim;
  context.beginPath();
  context.arc(0, 0, half + 1, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = entity.lifecycle.state === "dead" ? "#6a645b" : color;

  if (family === "cavalry") {
    context.fillRect(
      -half,
      -Math.max(1, Math.floor(half / 3)),
      half * 2,
      Math.max(3, Math.floor(half * 0.75))
    );
    context.fillStyle = "#f9f0d0";
    context.fillRect(Math.max(0, half - 2), -half + 1, 2, 3);
  } else if (family === "ranged") {
    context.beginPath();
    context.moveTo(0, -half);
    context.lineTo(half, half);
    context.lineTo(-half, half);
    context.closePath();
    context.fill();
    context.strokeStyle = "#101214";
    context.lineWidth = 1;
    context.stroke();
  } else if (family === "support") {
    context.beginPath();
    context.arc(0, 0, half, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f9f0d0";
    context.fillRect(half - 1, -half - 1, 2, half * 2 + 2);
  } else if (family === "siege") {
    context.fillRect(-half, -Math.max(2, Math.floor(half / 2)), half * 2, half + 2);
    context.fillStyle = "#101214";
    context.fillRect(-half + 1, half - 1, 2, 2);
    context.fillRect(half - 3, half - 1, 2, 2);
    context.fillStyle = "#f9f0d0";
    context.fillRect(0, -half - 1, half + 2, 2);
  } else {
    context.beginPath();
    context.moveTo(0, -half);
    context.lineTo(half, 0);
    context.lineTo(0, half);
    context.lineTo(-half, 0);
    context.closePath();
    context.fill();
    context.fillStyle = "#f9f0d0";
    context.fillRect(-1, -half, 2, half * 2);
    context.fillRect(-half, -1, half * 2, 2);
  }

  context.restore();
}

function denseUnitFamily(entity: RenderEntitySnapshot): "infantry" | "cavalry" | "ranged" | "support" | "siege" {
  const kind = entity.kind.toLowerCase();
  const classId = entity.classId;
  if (
    classId === 13
    || classId === 54
    || classId === 55
    || /\b(ram|mangonel|onager|scorpion|trebuchet|bombard|siege|ballista|catapult)\b/.test(kind)
  ) {
    return "siege";
  }
  if (classId === 18 || classId === 43 || /\b(monk|priest|missionary)\b/.test(kind)) {
    return "support";
  }
  if (
    classId === 0
    || classId === 23
    || classId === 36
    || classId === 44
    || /\b(archer|skirmisher|crossbow|bowman|cannoneer|janissary|slinger)\b/.test(kind)
  ) {
    return "ranged";
  }
  if (
    classId === 12
    || classId === 47
    || /\b(cavalry|knight|cavalier|paladin|hussar|camel|elephant|lancer|scout)\b/.test(kind)
  ) {
    return "cavalry";
  }
  return "infantry";
}

function denseEntityLayer(entity: RenderEntitySnapshot): "gaia" | "building" | "unit" {
  if (isDenseBuilding(entity)) {
    return "building";
  }
  return entity.playerId === "gaia" || entity.resourceNode ? "gaia" : "unit";
}

function isDenseBuilding(entity: RenderEntitySnapshot): boolean {
  return (
    entity.classId === 80 ||
    entity.kind.includes("town-center") ||
    entity.kind.includes("house") ||
    entity.kind.includes("mill") ||
    entity.kind.includes("camp") ||
    entity.kind.includes("dock") ||
    entity.kind.includes("barracks") ||
    entity.kind.includes("range") ||
    entity.kind.includes("stable") ||
    entity.kind.includes("workshop") ||
    entity.kind.includes("castle") ||
    entity.kind.includes("tower") ||
    entity.kind.includes("wall") ||
    entity.kind.includes("gate")
  );
}

function isDeadCharacterEntity(entity: RenderEntitySnapshot): boolean {
  return (
    entity.lifecycle.state === "dead" &&
    entity.playerId !== "gaia" &&
    !entity.resourceNode &&
    !isDenseBuilding(entity)
  );
}

function drawDenseBuilding(
  context: CanvasRenderingContext2D,
  entity: RenderEntitySnapshot,
  colors: ReadonlyMap<string, string>,
  players: readonly PlayerDefinition[],
  x: number,
  y: number,
  tileSize: number
): void {
  const halfSize = Math.max(2, Math.round(Math.max(entity.radiusTiles, 0.55) * tileSize));
  const size = halfSize * 2 + 1;
  context.fillStyle = "#241f18";
  context.fillRect(x - halfSize - 1, y - halfSize - 1, size + 2, size + 2);
  context.fillStyle = denseEntityColor(entity, colors, players);
  context.fillRect(x - halfSize, y - halfSize, size, size);
  context.fillStyle = "#d8c89a";
  context.fillRect(x - Math.max(1, Math.floor(halfSize / 2)), y - 1, Math.max(2, halfSize), 2);
}

function denseEntityColor(
  entity: RenderEntitySnapshot,
  colors: ReadonlyMap<string, string>,
  players: readonly PlayerDefinition[]
): string {
  if (entity.lifecycle.state === "dead") {
    return "#5f5b53";
  }
  if (entity.resourceNode?.depleted) {
    return "#7c6f55";
  }
  if (entity.resourceNode?.resource === "gold") {
    return "#e2c34f";
  }
  if (entity.resourceNode?.resource === "stone") {
    return "#c4ccc7";
  }
  if (entity.resourceNode?.resource === "food") {
    return entity.kind.includes("bush") ? "#c85d78" : "#dfc58b";
  }
  if (entity.resourceNode?.resource === "wood") {
    return "#4f7c36";
  }
  if (entity.playerId !== "gaia") {
    return colors.get(entity.playerId) ?? players.find((player) => player.id === entity.playerId)?.color ?? "#f4ead7";
  }

  if (entity.kind.includes("gold")) {
    return "#d0b65d";
  }
  if (entity.kind.includes("stone")) {
    return "#b5beb9";
  }
  if (entity.kind.includes("tree") || entity.kind.includes("bush") || entity.kind.includes("plant")) {
    return "#4f7c36";
  }
  if (entity.kind.includes("boar") || entity.kind.includes("sheep") || entity.kind.includes("ibex")) {
    return "#d8c38f";
  }

  return "#96a17d";
}


function terrainColor(terrainId: number, elevation: number): string {
  const palette = new Map([
    [3, "#536044"],
    [11, "#243b26"],
    [14, "#325b32"],
    [48, "#5d6647"],
    [89, "#2b4424"],
    [112, "#394a2d"]
  ]);
  const base = palette.get(terrainId) ?? "#34412c";

  if (elevation <= 0) {
    return base;
  }

  return elevation === 1 ? lighten(base, 12) : lighten(base, 22);
}

function lighten(color: string, amount: number): string {
  const red = Math.min(255, Number.parseInt(color.slice(1, 3), 16) + amount);
  const green = Math.min(255, Number.parseInt(color.slice(3, 5), 16) + amount);
  const blue = Math.min(255, Number.parseInt(color.slice(5, 7), 16) + amount);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
