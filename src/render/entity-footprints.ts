import type { RenderEntitySnapshot } from "../replay/model";

export interface EntityBlockFootprint {
  readonly widthSubcells: number;
  readonly heightSubcells: number;
}

const fullTileFootprint: EntityBlockFootprint = Object.freeze({ widthSubcells: 3, heightSubcells: 3 });
const largeUnitFootprint: EntityBlockFootprint = Object.freeze({ widthSubcells: 2, heightSubcells: 2 });
const mountedUnitFootprint: EntityBlockFootprint = Object.freeze({ widthSubcells: 2, heightSubcells: 1 });
const smallUnitFootprint: EntityBlockFootprint = Object.freeze({ widthSubcells: 1, heightSubcells: 1 });

export function entityBlockFootprint(entity: RenderEntitySnapshot): EntityBlockFootprint {
  if (isFullTileResourceEntity(entity)) {
    return fullTileFootprint;
  }
  if (isLargeUnitEntity(entity)) {
    return largeUnitFootprint;
  }
  if (isMountedUnitEntity(entity)) {
    return mountedUnitFootprint;
  }
  return smallUnitFootprint;
}

export function footprintPixels(
  footprint: EntityBlockFootprint,
  tileSize: number
): { readonly width: number; readonly height: number } {
  return {
    width: Math.max(1, Math.round(tileSize * footprint.widthSubcells / 3)),
    height: Math.max(1, Math.round(tileSize * footprint.heightSubcells / 3))
  };
}

export function isVisualBuildingEntity(entity: RenderEntitySnapshot): boolean {
  const kind = normalizedEntityKind(entity);
  return (
    entity.classId === 80 ||
    kind.includes("town-center") ||
    kind.includes("house") ||
    kind.includes("mill") ||
    kind.includes("camp") ||
    kind.includes("dock") ||
    kind.includes("barracks") ||
    kind.includes("range") ||
    kind.includes("stable") ||
    kind.includes("workshop") ||
    kind.includes("castle") ||
    kind.includes("tower") ||
    kind.includes("wall") ||
    kind.includes("gate")
  );
}

export function visualBuildingFootprintPixels(
  entity: RenderEntitySnapshot,
  tileSize: number
): { readonly width: number; readonly height: number } {
  const tiles = normalizedEntityKind(entity).includes("house") ? 1 : Math.max(1, entity.radiusTiles * 2);
  const size = Math.max(1, Math.round(tiles * tileSize));
  return {
    width: size,
    height: size
  };
}

function isFullTileResourceEntity(entity: RenderEntitySnapshot): boolean {
  const kind = normalizedEntityKind(entity);
  return (
    entity.resourceNode?.resource === "gold" ||
    entity.resourceNode?.resource === "stone" ||
    kind.includes("gold") ||
    kind.includes("stone") ||
    kind.includes("rock") ||
    kind.includes("mine")
  );
}

function isLargeUnitEntity(entity: RenderEntitySnapshot): boolean {
  const kind = normalizedEntityKind(entity);
  return (
    entity.classId === 13 ||
    entity.classId === 54 ||
    entity.classId === 55 ||
    kind.includes("elephant") ||
    /\b(ram|mangonel|onager|scorpion|trebuchet|bombard|siege|ballista|catapult)\b/.test(kind)
  );
}

function isMountedUnitEntity(entity: RenderEntitySnapshot): boolean {
  const kind = normalizedEntityKind(entity);
  return (
    entity.classId === 12 ||
    entity.classId === 47 ||
    /\b(cavalry|knight|cavalier|paladin|hussar|camel|lancer|scout|horse)\b/.test(kind)
  );
}

function normalizedEntityKind(entity: RenderEntitySnapshot): string {
  return entity.kind.toLowerCase();
}
