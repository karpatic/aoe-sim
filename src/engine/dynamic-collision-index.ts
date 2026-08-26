import type { EntityId, FixedPoint } from "../replay/model";
import type { EntityState } from "./world";

export class DynamicCollisionIndex {
  private readonly buckets = new Map<string, Set<EntityState>>();
  private readonly bucketKeysByEntity = new Map<EntityId, readonly string[]>();

  public constructor(entities: Iterable<EntityState>) {
    this.rebuild(entities);
  }

  public rebuild(entities: Iterable<EntityState>): void {
    this.buckets.clear();
    this.bucketKeysByEntity.clear();

    for (const entity of entities) {
      this.add(entity);
    }
  }

  public candidates(entity: EntityState, xFp: FixedPoint, yFp: FixedPoint): Iterable<EntityState> {
    const candidates = new Set<EntityState>();
    for (const key of collisionBucketKeys(xFp, yFp, entity.pathing.collisionRadiusFp)) {
      for (const candidate of this.buckets.get(key) ?? []) {
        candidates.add(candidate);
      }
    }
    return candidates;
  }

  public update(entity: EntityState): void {
    this.remove(entity);
    this.add(entity);
  }

  public remove(entity: EntityState): void {
    for (const key of this.bucketKeysByEntity.get(entity.id) ?? []) {
      const bucket = this.buckets.get(key);
      bucket?.delete(entity);
      if (bucket?.size === 0) {
        this.buckets.delete(key);
      }
    }
    this.bucketKeysByEntity.delete(entity.id);
  }

  private add(entity: EntityState): void {
    if (entity.lifecycle.state !== "alive" || entity.pathing.occupancyKind !== "dynamic") {
      return;
    }

    const keys = collisionBucketKeys(entity.position.xFp, entity.position.yFp, entity.pathing.collisionRadiusFp);
    this.bucketKeysByEntity.set(entity.id, keys);
    for (const key of keys) {
      const bucket = this.buckets.get(key) ?? new Set<EntityState>();
      bucket.add(entity);
      this.buckets.set(key, bucket);
    }
  }
}

function collisionBucketKeys(xFp: FixedPoint, yFp: FixedPoint, radiusFp: FixedPoint): readonly string[] {
  const minX = Math.floor((xFp - radiusFp) / 1000);
  const maxX = Math.floor((xFp + radiusFp) / 1000);
  const minY = Math.floor((yFp - radiusFp) / 1000);
  const maxY = Math.floor((yFp + radiusFp) / 1000);
  const keys: string[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      keys.push(`${x},${y}`);
    }
  }
  return keys;
}
