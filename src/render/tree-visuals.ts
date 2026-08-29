import type { RenderEntitySnapshot } from "../replay/model";

interface TreeCanopyStyle {
  readonly floor: string;
  readonly shade: string;
  readonly canopy: string;
  readonly highlight: string;
  readonly trunk: string;
}

interface DrawCanopyOptions {
  readonly alpha: number;
  readonly drawTrunk: boolean;
  readonly terrainMass: boolean;
}

const forestTerrainStyles = new Map<number, TreeCanopyStyle>([
  [19, {
    floor: "#304934",
    shade: "#14301d",
    canopy: "#245c35",
    highlight: "#3f7d47",
    trunk: "#6a5230"
  }],
  [48, {
    floor: "#36513a",
    shade: "#143a24",
    canopy: "#25683f",
    highlight: "#3f8750",
    trunk: "#6d5631"
  }],
  [89, {
    floor: "#36513a",
    shade: "#31451f",
    canopy: "#6b8b43",
    highlight: "#82a35a",
    trunk: "#6a5730"
  }],
  [88, {
    floor: "#3e5135",
    shade: "#24381f",
    canopy: "#5d7940",
    highlight: "#7a9854",
    trunk: "#6a5432"
  }],
  [112, {
    floor: "#36513a",
    shade: "#173d24",
    canopy: "#2f7a45",
    highlight: "#51a05b",
    trunk: "#71582e"
  }]
]);

const defaultTreeStyle: TreeCanopyStyle = {
  floor: "#36513a",
  shade: "#163821",
  canopy: "#3f743f",
  highlight: "#5d8f4d",
  trunk: "#695334"
};

export function isForestTerrainId(terrainId: number): boolean {
  return forestTerrainStyles.has(terrainId);
}

export function isTreeResourceEntity(entity: RenderEntitySnapshot): boolean {
  const kind = entity.kind.toLowerCase();
  const label = entity.label?.toLowerCase() ?? "";
  return Boolean(entity.representedTreeResource) || (
    entity.resourceNode?.resource === "wood" &&
    (entity.resourceNode.family === "tree" || kind.includes("tree") || label.includes("tree"))
  );
}

export function forestTerrainFloorColor(terrainId: number, elevation: number): string {
  return elevateColor((forestTerrainStyles.get(terrainId) ?? defaultTreeStyle).floor, elevation);
}

export function drawForestTerrainCanopy(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tileSize: number,
  terrainId: number,
  elevation: number,
  seedParts: readonly unknown[]
): number {
  return drawOrganicCanopy(
    context,
    centerX,
    centerY,
    tileSize,
    elevatedTreeStyle(forestTerrainStyles.get(terrainId) ?? defaultTreeStyle, elevation),
    stableTreeVisualSeed(...seedParts),
    {
      alpha: 0.58,
      drawTrunk: false,
      terrainMass: true
    }
  );
}

export function drawTreeResourceCanopy(
  context: CanvasRenderingContext2D,
  entity: RenderEntitySnapshot,
  centerX: number,
  centerY: number,
  tileSize: number
): number {
  const style = treeStyleForName(`${entity.label ?? ""} ${entity.kind} ${entity.resourceNode?.family ?? ""}`);
  const seed = stableTreeVisualSeed(entity.position.x, entity.position.y, entity.label ?? entity.kind);
  const depleted = entity.lifecycle.state === "dead" || Boolean(entity.resourceNode?.depleted);

  if (depleted) {
    return drawDepletedTreeStump(context, centerX, centerY, tileSize, style, seed);
  }

  return drawOrganicCanopy(context, centerX, centerY, tileSize, style, seed, {
    alpha: 0.92,
    drawTrunk: tileSize >= 3,
    terrainMass: false
  });
}

export function drawCompactTreeResourceCanopy(
  context: CanvasRenderingContext2D,
  name: string,
  centerX: number,
  centerY: number,
  tileSize: number,
  depleted: boolean,
  seedParts: readonly unknown[]
): number {
  const style = treeStyleForName(name);
  const seed = stableTreeVisualSeed(...seedParts);
  if (depleted) {
    return drawDepletedTreeStump(context, centerX, centerY, tileSize, style, seed);
  }
  return drawOrganicCanopy(context, centerX, centerY, tileSize, style, seed, {
    alpha: 0.94,
    drawTrunk: tileSize >= 4,
    terrainMass: false
  });
}

function drawOrganicCanopy(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tileSize: number,
  style: TreeCanopyStyle,
  seed: number,
  options: DrawCanopyOptions
): number {
  const baseRadius = tileSize * (options.terrainMass ? 0.68 : 0.58);
  const radius = Math.max(1.6, baseRadius * (0.92 + (((seed >>> 7) & 7) / 48)));
  const lobeRadius = radius * (0.52 + (((seed >>> 11) & 3) / 24));
  const jitterScale = tileSize * (options.terrainMass ? 0.12 : 0.08);
  const x = centerX + signedUnit(seed, 0) * jitterScale;
  const y = centerY + signedUnit(seed, 8) * jitterScale;
  const angle = ((seed >>> 16) & 1023) / 1024 * Math.PI * 2;
  const canopyPoints = [
    [0, 0, radius],
    [Math.cos(angle) * radius * 0.42, Math.sin(angle) * radius * 0.34, lobeRadius],
    [Math.cos(angle + 2.2) * radius * 0.38, Math.sin(angle + 2.2) * radius * 0.4, lobeRadius * 0.9],
    [Math.cos(angle + 4.15) * radius * 0.34, Math.sin(angle + 4.15) * radius * 0.36, lobeRadius * 0.82]
  ] as const;

  context.save();
  context.globalAlpha *= options.alpha;
  context.fillStyle = style.shade;
  drawCircle(context, x + radius * 0.09, y + radius * 0.13, radius * 1.05);
  context.fillStyle = style.canopy;
  for (const [offsetX, offsetY, itemRadius] of canopyPoints) {
    drawCircle(context, x + offsetX, y + offsetY, itemRadius);
  }
  if (tileSize >= 4) {
    context.globalAlpha *= 0.78;
    context.fillStyle = style.highlight;
    drawCircle(context, x - radius * 0.18, y - radius * 0.2, Math.max(1, radius * 0.32));
  }
  if (options.drawTrunk) {
    const trunkWidth = Math.max(1, Math.round(tileSize * 0.16));
    const trunkHeight = Math.max(2, Math.round(tileSize * 0.5));
    context.globalAlpha = Math.min(1, context.globalAlpha * 1.15);
    context.fillStyle = style.trunk;
    context.fillRect(Math.round(x - trunkWidth / 2), Math.round(y), trunkWidth, trunkHeight);
  }
  context.restore();

  return Math.ceil(Math.PI * radius * radius * 1.85);
}

function drawDepletedTreeStump(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tileSize: number,
  style: TreeCanopyStyle,
  seed: number
): number {
  const radius = Math.max(1, tileSize * 0.22);
  const x = centerX + signedUnit(seed, 0) * tileSize * 0.05;
  const y = centerY + signedUnit(seed, 8) * tileSize * 0.05;

  context.save();
  context.globalAlpha *= 0.34;
  context.fillStyle = style.trunk;
  drawCircle(context, x, y, radius);
  if (tileSize >= 4) {
    context.globalAlpha *= 0.72;
    context.fillStyle = style.shade;
    drawCircle(context, x + radius * 0.85, y + radius * 0.45, Math.max(1, radius * 0.72));
  }
  context.restore();

  return Math.ceil(Math.PI * radius * radius * 1.4);
}

function treeStyleForName(name: string): TreeCanopyStyle {
  const normalized = name.toLowerCase();
  if (normalized.includes("palm")) {
    return forestTerrainStyles.get(112) ?? defaultTreeStyle;
  }
  if (normalized.includes("pine")) {
    return forestTerrainStyles.get(19) ?? defaultTreeStyle;
  }
  if (normalized.includes("olive") || normalized.includes("mediterranean")) {
    return forestTerrainStyles.get(88) ?? defaultTreeStyle;
  }
  if (normalized.includes("dragon")) {
    return forestTerrainStyles.get(48) ?? defaultTreeStyle;
  }
  if (normalized.includes("bush")) {
    return forestTerrainStyles.get(89) ?? defaultTreeStyle;
  }
  return defaultTreeStyle;
}

function elevatedTreeStyle(style: TreeCanopyStyle, elevation: number): TreeCanopyStyle {
  return {
    floor: elevateColor(style.floor, elevation),
    shade: elevateColor(style.shade, elevation),
    canopy: elevateColor(style.canopy, elevation),
    highlight: elevateColor(style.highlight, elevation),
    trunk: style.trunk
  };
}

function stableTreeVisualSeed(...parts: readonly unknown[]): number {
  const text = parts.map((part) => typeof part === "number" ? part.toFixed(3) : String(part ?? "")).join(":");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function signedUnit(seed: number, shift: number): number {
  return (((seed >>> shift) & 255) / 255 - 0.5) * 2;
}

function drawCircle(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function elevateColor(color: string, elevation: number): string {
  if (elevation <= 0) {
    return color;
  }
  return adjustHexColor(color, elevation === 1 ? 10 : 18);
}

function adjustHexColor(color: string, amount: number): string {
  const red = clampColor(Number.parseInt(color.slice(1, 3), 16) + amount);
  const green = clampColor(Number.parseInt(color.slice(3, 5), 16) + amount);
  const blue = clampColor(Number.parseInt(color.slice(5, 7), 16) + amount);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}
