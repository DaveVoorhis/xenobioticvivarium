export interface SpatialItem {
  alive: boolean;
  position: { x: number; y: number; z: number };
}

/**
 * Zero-GC 3D spatial hash grid for fast neighborhood queries.
 * Uses integer cell keys and reusable bucket arrays to avoid per-frame allocations.
 */
export class SpatialHashGrid<T extends SpatialItem> {
  private readonly invCellSize: number;
  private readonly buckets = new Map<number, T[]>();
  private readonly activeBuckets: T[][] = [];

  constructor(cellSize = 4.0) {
    this.invCellSize = 1.0 / Math.max(0.5, cellSize);
  }

  private static hash(cx: number, cy: number, cz: number): number {
    return ((cx + 512) << 20) | ((cy + 512) << 10) | (cz + 512);
  }

  clear(): void {
    for (let i = 0; i < this.activeBuckets.length; i++) {
      this.activeBuckets[i].length = 0;
    }
    this.activeBuckets.length = 0;
  }

  insert(item: T): void {
    if (!item.alive) return;
    const p = item.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return;
    const cx = Math.floor(p.x * this.invCellSize);
    const cy = Math.floor(p.y * this.invCellSize);
    const cz = Math.floor(p.z * this.invCellSize);
    const key = SpatialHashGrid.hash(cx, cy, cz);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    if (bucket.length === 0) {
      this.activeBuckets.push(bucket);
    }
    bucket.push(item);
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (let i = 0; i < items.length; i++) {
      this.insert(items[i]);
    }
  }

  query(x: number, y: number, z: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || radius <= 0) {
      return out;
    }
    const rSq = radius * radius;
    const minX = Math.floor((x - radius) * this.invCellSize);
    const maxX = Math.floor((x + radius) * this.invCellSize);
    const minY = Math.floor((y - radius) * this.invCellSize);
    const maxY = Math.floor((y + radius) * this.invCellSize);
    const minZ = Math.floor((z - radius) * this.invCellSize);
    const maxZ = Math.floor((z + radius) * this.invCellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cz = minZ; cz <= maxZ; cz++) {
          const bucket = this.buckets.get(SpatialHashGrid.hash(cx, cy, cz));
          if (!bucket || bucket.length === 0) continue;
          for (let i = 0; i < bucket.length; i++) {
            const item = bucket[i];
            if (!item.alive) continue;
            const dx = item.position.x - x;
            const dy = item.position.y - y;
            const dz = item.position.z - z;
            if (dx * dx + dy * dy + dz * dz <= rSq) {
              out.push(item);
            }
          }
        }
      }
    }
    return out;
  }
}
