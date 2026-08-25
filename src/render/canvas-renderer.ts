import { drawPixelToken, evidenceColor } from "./pixel-tokens";
import type { EntitySnapshot, MapBounds, PlayerDefinition, WorldSnapshot } from "../replay/model";

interface TerrainCache {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
}

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private terrainCache: TerrainCache | undefined;

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

  public draw(snapshot: WorldSnapshot): void {
    const { context, canvas } = this;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#1f2917";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const tileSize = Math.max(
      1,
      Math.floor(
        Math.min((canvas.width - 16) / snapshot.map.widthTiles, (canvas.height - 16) / snapshot.map.heightTiles)
      )
    );
    const originX = Math.floor((canvas.width - snapshot.map.widthTiles * tileSize) / 2);
    const originY = Math.floor((canvas.height - snapshot.map.heightTiles * tileSize) / 2);

    this.drawTerrain(snapshot, originX, originY, tileSize);
    this.drawTasks(snapshot, originX, originY, tileSize);

    if (snapshot.entities.length > 1200 || tileSize <= 2) {
      this.drawDenseEntities(snapshot, originX, originY, tileSize);
      return;
    }

    for (const entity of [...snapshot.entities].sort(compareEntityDepth)) {
      const screen = worldToScreen(entity.position.x, entity.position.y, originX, originY, tileSize);
      drawPixelToken(context, entity, snapshot.players, screen.x, screen.y, tileSize);
    }
  }

  private drawTerrain(snapshot: WorldSnapshot, originX: number, originY: number, tileSize: number): void {
    const { context } = this;

    if (snapshot.map.tileGrid) {
      context.drawImage(this.renderTerrainCache(snapshot.map, tileSize).canvas, originX, originY);
    } else {
      context.fillStyle = "#26351c";
      context.fillRect(originX, originY, snapshot.map.widthTiles * tileSize, snapshot.map.heightTiles * tileSize);

      for (let y = 0; y < snapshot.map.heightTiles; y += 1) {
        for (let x = 0; x < snapshot.map.widthTiles; x += 1) {
          context.fillStyle = (x + y) % 2 === 0 ? "#2b3b20" : "#314324";
          context.fillRect(originX + x * tileSize, originY + y * tileSize, tileSize, tileSize);
        }
      }
    }

    context.strokeStyle = "#52623b";
    context.lineWidth = 1;
    context.strokeRect(
      originX - 1,
      originY - 1,
      snapshot.map.widthTiles * tileSize + 2,
      snapshot.map.heightTiles * tileSize + 2
    );
  }

  private drawTasks(snapshot: WorldSnapshot, originX: number, originY: number, tileSize: number): void {
    const { context } = this;

    for (const entity of snapshot.entities) {
      if (entity.task.kind !== "moving" || !entity.task.destination) {
        continue;
      }

      const start = worldToScreen(entity.position.x, entity.position.y, originX, originY, tileSize);
      const end = worldToScreen(entity.task.destination.x, entity.task.destination.y, originX, originY, tileSize);
      context.strokeStyle = evidenceColor(entity.task.evidence);
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      context.fillStyle = evidenceColor(entity.task.evidence);
      context.fillRect(end.x - 1, end.y - 1, 3, 3);
    }
  }

  private drawDenseEntities(snapshot: WorldSnapshot, originX: number, originY: number, tileSize: number): void {
    const { context } = this;
    const colors = new Map(snapshot.players.map((player) => [player.id, player.color]));
    context.save();

    for (const entity of snapshot.entities) {
      const screen = worldToScreen(entity.position.x, entity.position.y, originX, originY, tileSize);
      const size = entity.playerId === "gaia" ? 1 : Math.max(2, tileSize);
      context.fillStyle = denseEntityColor(entity, colors, snapshot.players);
      context.fillRect(screen.x, screen.y, size, size);
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
    for (let y = 0; y < map.heightTiles; y += 1) {
      for (let x = 0; x < map.widthTiles; x += 1) {
        const index = y * map.widthTiles + x;
        terrainContext.fillStyle = terrainColor(grid.terrainIds[index] ?? 0, grid.elevations[index] ?? 0);
        terrainContext.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    this.terrainCache = {
      key,
      canvas: terrainCanvas
    };
    return this.terrainCache;
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

function compareEntityDepth(left: EntitySnapshot, right: EntitySnapshot): number {
  return left.position.y - right.position.y || left.id.localeCompare(right.id);
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

function denseEntityColor(
  entity: EntitySnapshot,
  colors: ReadonlyMap<string, string>,
  players: readonly PlayerDefinition[]
): string {
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

function lighten(color: string, amount: number): string {
  const red = Math.min(255, Number.parseInt(color.slice(1, 3), 16) + amount);
  const green = Math.min(255, Number.parseInt(color.slice(3, 5), 16) + amount);
  const blue = Math.min(255, Number.parseInt(color.slice(5, 7), 16) + amount);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
