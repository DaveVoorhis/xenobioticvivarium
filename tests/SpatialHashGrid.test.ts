import { describe, expect, it } from 'vitest';
import { SpatialHashGrid, type SpatialItem } from '../src/core/SpatialHashGrid';

interface TestNode extends SpatialItem {
  id: number;
}

describe('SpatialHashGrid', () => {
  it('queries items accurately across cell boundaries and excludes dead items', () => {
    const grid = new SpatialHashGrid<TestNode>(3.0);
    const items: TestNode[] = [
      { id: 1, alive: true, position: { x: 0.2, y: 1.0, z: 0.2 } },
      { id: 2, alive: true, position: { x: 2.9, y: 1.1, z: 0.3 } },
      { id: 3, alive: true, position: { x: 3.2, y: 1.0, z: 0.1 } },
      { id: 4, alive: false, position: { x: 0.5, y: 1.0, z: 0.2 } },
      { id: 5, alive: true, position: { x: 10.0, y: 1.0, z: 10.0 } },
    ];
    grid.rebuild(items);

    const near = grid.query(1.5, 1.0, 0.2, 2.0);
    const ids = near.map((n) => n.id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3]);
  });

  it('ignores non-finite coordinates safely', () => {
    const grid = new SpatialHashGrid<TestNode>(2.0);
    grid.insert({ id: 1, alive: true, position: { x: Number.NaN, y: 0, z: 0 } });
    grid.insert({ id: 2, alive: true, position: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 } });
    grid.insert({ id: 3, alive: true, position: { x: 0, y: 0, z: 0 } });

    const out = grid.query(0, 0, 0, 5.0);
    expect(out.map((n) => n.id)).toEqual([3]);
    expect(grid.query(Number.NaN, 0, 0, 5.0)).toEqual([]);
  });

  it('clears and reuses buckets without leaking stale items', () => {
    const grid = new SpatialHashGrid<TestNode>(2.0);
    const a: TestNode = { id: 1, alive: true, position: { x: 1, y: 1, z: 1 } };
    const b: TestNode = { id: 2, alive: true, position: { x: -4, y: 1, z: -4 } };
    grid.rebuild([a]);
    expect(grid.query(1, 1, 1, 1).length).toBe(1);

    grid.rebuild([b]);
    expect(grid.query(1, 1, 1, 1).length).toBe(0);
    expect(grid.query(-4, 1, -4, 1).map((n) => n.id)).toEqual([2]);
  });
});
