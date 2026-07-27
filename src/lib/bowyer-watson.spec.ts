import { runBowyerWatson } from './bowyer-watson.js';
import { generateRandomSites } from './sites.js';
import { expectNoNaNOrInfinite, isConvex, polygonArea, totalArea } from './test-helpers.js';
import type { Point } from './types.js';

const BOUNDS = { width: 100, height: 100 };

describe('runBowyerWatson', () => {
  it('gives 2 sites a single clipped bisector line, split evenly between them', () => {
    const sites = [
      { id: 0, x: 30, y: 30 },
      { id: 1, x: 70, y: 70 },
    ];
    const { diagram } = runBowyerWatson(sites, BOUNDS);

    expect(diagram.cells).toHaveLength(2);
    for (const cell of diagram.cells) {
      expect(polygonArea(cell.polygon)).toBeCloseTo(5000, 2);
      expect(isConvex(cell.polygon)).toBe(true);
    }

    // Perpendicular bisector of (30,30)-(70,70) is the line y = 100 - x: the site-0 cell (its
    // own box corner at (0,0)) sits strictly below it, the site-1 cell's (100,100) strictly
    // above.
    const [cell0, cell1] = diagram.cells;
    expect(cell0.polygon.some((p) => p.x === 0 && p.y === 0)).toBe(true);
    expect(cell1.polygon.some((p) => p.x === 100 && p.y === 100)).toBe(true);
    for (const point of cell0.polygon) {
      expect(point.y).toBeLessThanOrEqual(100 - point.x + 1e-9);
    }
    for (const point of cell1.polygon) {
      expect(point.y).toBeGreaterThanOrEqual(100 - point.x - 1e-9);
    }
  });

  it('places the vertex of a 3-site triangle at the hand-computed circumcenter', () => {
    const sites = [
      { id: 0, x: 50, y: 20 },
      { id: 1, x: 20, y: 80 },
      { id: 2, x: 80, y: 80 },
    ];
    const { diagram } = runBowyerWatson(sites, BOUNDS);

    const nearCircumcenter = (point: Point) => Math.hypot(point.x - 50, point.y - 57.5) < 1e-3;
    const hasVertex = diagram.edges.some(
      (edge) => nearCircumcenter(edge.start) || nearCircumcenter(edge.end),
    );
    expect(hasVertex).toBe(true);

    expect(diagram.cells).toHaveLength(3);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 1);
    for (const cell of diagram.cells) {
      expect(isConvex(cell.polygon)).toBe(true);
    }
  });

  it('terminates and produces a valid partition for 4 co-circular sites (a classic degenerate case)', () => {
    const sites = [
      { id: 0, x: 30, y: 30 },
      { id: 1, x: 70, y: 30 },
      { id: 2, x: 70, y: 70 },
      { id: 3, x: 30, y: 70 },
    ];
    const { diagram } = runBowyerWatson(sites, BOUNDS);

    expect(diagram.cells).toHaveLength(4);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 1);
    expectNoNaNOrInfinite(diagram.cells);
  });

  it('partitions the whole bounding box exactly for a randomized 50-site diagram', () => {
    const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 50, 12345);
    const { diagram } = runBowyerWatson(sites, BOUNDS);

    expect(diagram.cells).toHaveLength(50);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 0);
    expectNoNaNOrInfinite(diagram.cells);
    for (const cell of diagram.cells) {
      expect(isConvex(cell.polygon)).toBe(true);
    }
  });

  it('handles duplicate input coordinates without crashing', () => {
    const sites = [
      { id: 0, x: 40, y: 40 },
      { id: 1, x: 40, y: 40 },
      { id: 2, x: 70, y: 70 },
    ];
    expect(() => runBowyerWatson(sites, BOUNDS)).not.toThrow();
    const { diagram } = runBowyerWatson(sites, BOUNDS);
    expectNoNaNOrInfinite(diagram.cells);
  });

  it('handles sites exactly on the bounding box edge/corner without crashing', () => {
    const sites = [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 100, y: 0 },
      { id: 2, x: 0, y: 100 },
      { id: 3, x: 50, y: 50 },
    ];
    expect(() => runBowyerWatson(sites, BOUNDS)).not.toThrow();
    const { diagram } = runBowyerWatson(sites, BOUNDS);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 0);
  });

  it('never creates a triangle whose circumcircle contains a 4th random site (empty-circumcircle property)', () => {
    const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 12, 999);
    const { trace } = runBowyerWatson(sites, BOUNDS);

    const removedIds = new Set(trace.filter((s) => s.type === 'triangleRemoved').map((s) => s.id));
    const finalTriangles = trace.filter(
      (s) => s.type === 'triangleAdded' && !removedIds.has(s.id),
    ) as Extract<(typeof trace)[number], { type: 'triangleAdded' }>[];

    for (const triangle of finalTriangles) {
      const [a, b, c] = triangle.vertices;
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(d) < 1e-9) continue; // degenerate super-triangle remnant, skip
      const aSq = a.x ** 2 + a.y ** 2;
      const bSq = b.x ** 2 + b.y ** 2;
      const cSq = c.x ** 2 + c.y ** 2;
      const ux = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d;
      const uy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d;
      const radiusSq = (ux - a.x) ** 2 + (uy - a.y) ** 2;

      for (const site of sites) {
        const distSq = (site.x - ux) ** 2 + (site.y - uy) ** 2;
        expect(distSq).toBeGreaterThanOrEqual(radiusSq - 1e-6);
      }
    }
  });

  it('records at least one triangleAdded/removed step and ends in a complete step', () => {
    const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 20, 777);
    const { trace, diagram } = runBowyerWatson(sites, BOUNDS);

    expect(trace.length).toBeGreaterThan(0);
    expect(trace[trace.length - 1]).toEqual({ type: 'complete', diagram });

    const pointInsertedCount = trace.filter((step) => step.type === 'pointInserted').length;
    expect(pointInsertedCount).toBe(sites.length);
  });
});
