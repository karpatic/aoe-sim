import type { EvidenceClass, PlayerDefinition, RenderEntitySnapshot } from "../replay/model";

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
  const size = Math.max(3, Math.round(tileSize * 0.42));
  const half = Math.max(2, Math.floor(size / 2));

  context.save();
  context.translate(Math.round(x), Math.round(y));
  drawEvidenceFrame(context, entity.lifecycle.evidence, half + 2);

  if (entity.lifecycle.state === "dead") {
    drawDead(context, half);
    context.restore();
    return;
  }

  if (entity.kind.includes("scout")) {
    drawScout(context, color, half, entity.facing);
  } else if (entity.kind.includes("villager")) {
    drawVillager(context, color, half);
  } else if (entity.classId === 80 || entity.kind.includes("town-center") || entity.kind.includes("house")) {
    drawBuilding(context, color, half);
  } else if (isResource(entity.kind)) {
    drawResource(context, entity, half);
  } else {
    drawMarker(context, color, half);
  }

  if (entity.carry?.resource && entity.carry.amountFp > 0) {
    drawCarry(context, entity.carry.resource, half);
  }

  context.restore();
}

export function evidenceColor(evidence: EvidenceClass): string {
  return evidenceColors[evidence];
}

function drawEvidenceFrame(context: CanvasRenderingContext2D, evidence: EvidenceClass, radius: number): void {
  context.strokeStyle = evidenceColors[evidence];
  context.lineWidth = 1;
  context.strokeRect(-radius, -radius, radius * 2, radius * 2);
}

function drawScout(context: CanvasRenderingContext2D, color: string, half: number, facing: -1 | 1): void {
  context.fillStyle = "#221814";
  context.fillRect(-half, -half + 1, half * 2, half * 2 - 2);
  context.fillStyle = color;
  context.fillRect(-half + 1, -half, half * 2 - 2, half);
  context.fillStyle = "#f7e4ad";
  context.fillRect(facing > 0 ? half - 1 : -half, -1, 2, 2);
}

function drawVillager(context: CanvasRenderingContext2D, color: string, half: number): void {
  context.fillStyle = color;
  context.fillRect(-half + 1, -half, half * 2 - 2, half * 2);
  context.fillStyle = "#f2d9a6";
  context.fillRect(-half + 2, -half - 1, half * 2 - 4, 2);
  context.fillStyle = "#2f2418";
  context.fillRect(-1, -half + 1, 2, half * 2 - 1);
}

function drawMarker(context: CanvasRenderingContext2D, color: string, half: number): void {
  context.fillStyle = color;
  context.fillRect(-1, -half, 2, half * 2);
  context.fillRect(-half, -1, half * 2, 2);
  context.fillStyle = "#f4ead7";
  context.fillRect(-1, -1, 2, 2);
}

function drawBuilding(context: CanvasRenderingContext2D, color: string, half: number): void {
  context.fillStyle = "#241f18";
  context.fillRect(-half - 1, -half - 1, half * 2 + 2, half * 2 + 2);
  context.fillStyle = color;
  context.fillRect(-half, -half, half * 2, half * 2);
  context.fillStyle = "#d8c89a";
  context.fillRect(-Math.max(1, Math.floor(half / 2)), -1, Math.max(2, half), 2);
}

function drawResource(context: CanvasRenderingContext2D, entity: RenderEntitySnapshot, half: number): void {
  const depleted = Boolean(entity.resourceNode?.depleted);
  context.fillStyle = depleted ? "#403a2c" : "#4c7b39";
  context.fillRect(-half, -half + 1, half * 2, half * 2 - 2);
  context.fillStyle = depleted ? "#7c6f55" : resourceAccent(entity);
  context.fillRect(-half + 1, -half + 1, 2, 2);
  context.fillRect(half - 2, -1, 2, 2);
  context.fillRect(-1, half - 2, 2, 2);
}

function resourceAccent(entity: RenderEntitySnapshot): string {
  switch (entity.resourceNode?.resource) {
    case "gold":
      return "#e2c34f";
    case "stone":
      return "#c4ccc7";
    case "food":
      return entity.kind.includes("bush") ? "#c85d78" : "#dfc58b";
    case "wood":
      return "#4f7c36";
    default:
      return "#b34f58";
  }
}

function drawDead(context: CanvasRenderingContext2D, half: number): void {
  context.strokeStyle = "#c86458";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-half, -half);
  context.lineTo(half, half);
  context.moveTo(half, -half);
  context.lineTo(-half, half);
  context.stroke();
  context.fillStyle = "#302b25";
  context.fillRect(-1, -1, 2, 2);
}

function drawCarry(context: CanvasRenderingContext2D, resource: string, half: number): void {
  context.fillStyle = carryColor(resource);
  context.fillRect(-half, half + 2, half * 2, 2);
}

function carryColor(resource: string): string {
  switch (resource) {
    case "food":
      return "#d86d5a";
    case "wood":
      return "#9f6b3e";
    case "stone":
      return "#c3c9c0";
    case "gold":
      return "#d8b84f";
    default:
      return "#f4ead7";
  }
}

function isResource(kind: string): boolean {
  return (
    kind.includes("berry") ||
    kind.includes("bush") ||
    kind.includes("tree") ||
    kind.includes("mine") ||
    kind.includes("stone") ||
    kind.includes("sheep") ||
    kind.includes("boar") ||
    kind.includes("ibex")
  );
}
