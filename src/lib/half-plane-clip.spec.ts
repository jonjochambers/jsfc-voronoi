import { clipPolygonByHalfPlane } from './half-plane-clip.js';
import { polygonArea } from './test-helpers.js';

const SQUARE = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('clipPolygonByHalfPlane', () => {
  it('clips a square by a diagonal half-plane down to the upper-right triangle', () => {
    // Boundary line x + y = 10, keeping the side where x + y >= 10.
    const result = clipPolygonByHalfPlane(SQUARE, { x: 5, y: 5 }, { x: 1, y: 1 });

    expect(polygonArea(result)).toBeCloseTo(50, 6);
    for (const point of result) {
      expect(point.x + point.y).toBeGreaterThanOrEqual(10 - 1e-9);
    }
  });

  it('is a no-op when the whole polygon is already on the inside', () => {
    // Boundary line x = -100, keeping x >= -100 — the whole square qualifies.
    const result = clipPolygonByHalfPlane(SQUARE, { x: -100, y: 0 }, { x: 1, y: 0 });

    expect(polygonArea(result)).toBeCloseTo(100, 6);
  });

  it('removes the whole polygon when it is entirely outside the half-plane', () => {
    // Boundary line x = 100, keeping x >= 100 — no part of the square qualifies.
    const result = clipPolygonByHalfPlane(SQUARE, { x: 100, y: 0 }, { x: 1, y: 0 });

    expect(result).toHaveLength(0);
  });
});
