import { expect } from 'vitest';
import type { Point, VoronoiCell } from './types.js';

/** Shared spec-only invariant checks reused across the algorithm suites (fortune/brute-force/
 * bowyer-watson) so all three can be validated against the same hand-computed fixtures. Not
 * exported from the package barrel — test infrastructure only. */

export function polygonArea(polygon: Point[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

export function isConvex(polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const c = polygon[(i + 2) % polygon.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const thisSign = Math.sign(cross);
    if (sign === 0) sign = thisSign;
    else if (thisSign !== sign) return false;
  }
  return true;
}

export function totalArea(cells: VoronoiCell[]): number {
  return cells.reduce((sum, cell) => sum + polygonArea(cell.polygon), 0);
}

export function expectNoNaNOrInfinite(cells: VoronoiCell[]): void {
  for (const cell of cells) {
    for (const point of cell.polygon) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  }
}
