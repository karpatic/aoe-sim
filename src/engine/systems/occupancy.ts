import type { MapBounds } from "../../replay/model";

export function isInsideMap(map: MapBounds, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= map.widthTiles && y <= map.heightTiles;
}
