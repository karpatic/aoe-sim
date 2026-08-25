import { drawPixelToken, evidenceColor } from "./pixel-tokens";
import type { EntitySnapshot, WorldSnapshot } from "../replay/model";

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;

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
      Math.floor(Math.min((canvas.width - 16) / snapshot.map.widthTiles, (canvas.height - 16) / snapshot.map.heightTiles))
    );
    const originX = Math.floor((canvas.width - snapshot.map.widthTiles * tileSize) / 2);
    const originY = Math.floor((canvas.height - snapshot.map.heightTiles * tileSize) / 2);

    this.drawTerrain(snapshot, originX, originY, tileSize);
    this.drawTasks(snapshot, originX, originY, tileSize);

    for (const entity of [...snapshot.entities].sort(compareEntityDepth)) {
      const screen = worldToScreen(entity.position.x, entity.position.y, originX, originY, tileSize);
      drawPixelToken(context, entity, snapshot.players, screen.x, screen.y, tileSize);
    }
  }

  private drawTerrain(snapshot: WorldSnapshot, originX: number, originY: number, tileSize: number): void {
    const { context } = this;
    context.fillStyle = "#26351c";
    context.fillRect(originX, originY, snapshot.map.widthTiles * tileSize, snapshot.map.heightTiles * tileSize);

    for (let y = 0; y < snapshot.map.heightTiles; y += 1) {
      for (let x = 0; x < snapshot.map.widthTiles; x += 1) {
        context.fillStyle = (x + y) % 2 === 0 ? "#2b3b20" : "#314324";
        context.fillRect(originX + x * tileSize, originY + y * tileSize, tileSize, tileSize);
      }
    }

    context.strokeStyle = "#52623b";
    context.lineWidth = 1;
    context.strokeRect(originX - 1, originY - 1, snapshot.map.widthTiles * tileSize + 2, snapshot.map.heightTiles * tileSize + 2);
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
}

function worldToScreen(x: number, y: number, originX: number, originY: number, tileSize: number): { x: number; y: number } {
  return {
    x: Math.round(originX + x * tileSize),
    y: Math.round(originY + y * tileSize)
  };
}

function compareEntityDepth(left: EntitySnapshot, right: EntitySnapshot): number {
  return left.position.y - right.position.y || left.id.localeCompare(right.id);
}
