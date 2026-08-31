import type { EvidenceClass, PlayerDefinition, RenderEntitySnapshot } from "../replay/model";
import type { EntityBlockFootprint } from "./entity-footprints";
import {
  entityBlockFootprint,
  footprintPixels,
  isVisualBuildingEntity,
  visualBuildingFootprintPixels
} from "./entity-footprints";
import { drawCompactTreeResourceCanopy, isTreeResourceEntity } from "./tree-visuals";

const evidenceColors: Record<EvidenceClass, string> = {
  observed: "#f4ead7",
  simulated: "#e6b34c",
  reconciled: "#76d3c5"
};

export function drawPixelToken(
  context: CanvasRenderingContext2D,
  entity: RenderEntitySnapshot,
  players: readonly PlayerDefinition[],
  x: number,
  y: number,
  tileSize: number
): void {
  const player = players.find((candidate) => candidate.id === entity.playerId);
  const color = player?.color ?? "#aeb8a4";

  context.save();
  context.translate(Math.round(x), Math.round(y));

  if (isTreeResourceEntity(entity)) {
    drawCompactTreeResourceCanopy(
      context,
      `${entity.label ?? ""} ${entity.kind} ${entity.resourceNode?.family ?? ""}`,
      0,
      0,
      tileSize,
      entity.lifecycle.state === "dead" || Boolean(entity.resourceNode?.depleted),
      [entity.position.x, entity.position.y, entity.label ?? entity.kind]
    );
    context.restore();
    return;
  }

  if (entity.lifecycle.state === "dead") {
    drawEntityBlock(context, "#5f5b53", entityBlockFootprint(entity), tileSize);
    context.restore();
    return;
  }

  if (isVisualBuildingEntity(entity)) {
    drawBuildingBlock(context, entity, color, tileSize);
  } else if (entity.resourceNode || isResource(entity.kind)) {
    drawEntityBlock(context, resourceAccent(entity), entityBlockFootprint(entity), tileSize);
  } else {
    drawEntityBlock(context, color, entityBlockFootprint(entity), tileSize);
  }

  context.restore();
}

export function evidenceColor(evidence: EvidenceClass): string {
  return evidenceColors[evidence];
}

function drawEntityBlock(
  context: CanvasRenderingContext2D,
  color: string,
  footprint: EntityBlockFootprint,
  tileSize: number
): void {
  const size = footprintPixels(footprint, tileSize);
  context.fillStyle = color;
  context.fillRect(-Math.floor(size.width / 2), -Math.floor(size.height / 2), size.width, size.height);
}

function drawBuildingBlock(
  context: CanvasRenderingContext2D,
  entity: RenderEntitySnapshot,
  color: string,
  tileSize: number
): void {
  const size = visualBuildingFootprintPixels(entity, tileSize);
  const left = -Math.floor(size.width / 2);
  const top = -Math.floor(size.height / 2);
  context.fillStyle = entity.lifecycle.state === "dead" ? "#5f5b53" : "#d8c89a";
  context.fillRect(left, top, size.width, size.height);

  if (entity.playerId !== "gaia") {
    const chip = Math.max(1, Math.min(size.width, Math.round(tileSize / 3)));
    context.fillStyle = color;
    context.fillRect(left, top, chip, Math.max(1, Math.min(size.height, chip)));
  }
}

function resourceAccent(entity: RenderEntitySnapshot): string {
  const kind = entity.kind.toLowerCase();
  switch (entity.resourceNode?.resource) {
    case "gold":
      return "#e2c34f";
    case "stone":
      return "#c4ccc7";
    case "food":
      return kind.includes("bush") ? "#c85d78" : "#dfc58b";
    case "wood":
      return "#4f7c36";
    default:
      return "#b34f58";
  }
}

function isResource(kind: string): boolean {
  const normalized = kind.toLowerCase();
  return (
    normalized.includes("berry") ||
    normalized.includes("bush") ||
    normalized.includes("tree") ||
    normalized.includes("mine") ||
    normalized.includes("stone") ||
    normalized.includes("deer") ||
    normalized.includes("sheep") ||
    normalized.includes("boar") ||
    normalized.includes("chicken") ||
    normalized.includes("ibex")
  );
}
