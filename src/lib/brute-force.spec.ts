import { runBruteForce } from './brute-force.js';
import { generateRandomSites } from './sites.js';
import { expectNoNaNOrInfinite, isConvex, polygonArea, totalArea } from './test-helpers.js';
import type { Point } from './types.js';

const BOUNDS = { width: 100, height: 100 };

describe('runBruteForce', () => {
  it('gives 2 sites a single clipped bisector line, split evenly between them', () => {
    const sites = [
      { id: 0, x: 30, y: 30 },
      { id: 1, x: 70, y: 70 },
    ];
    const { diagram } = runBruteForce(sites, BOUNDS);

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

  it('places a vertex of a 3-site triangle at the hand-computed circumcenter', () => {
    const sites = [
      { id: 0, x: 50, y: 20 },
      { id: 1, x: 20, y: 80 },
      { id: 2, x: 80, y: 80 },
    ];
    const { diagram } = runBruteForce(sites, BOUNDS);

    const nearCircumcenter = (point: Point) => Math.hypot(point.x - 50, point.y - 57.5) < 1e-3;
    const hasVertex = diagram.cells.some((cell) => cell.polygon.some(nearCircumcenter));
    expect(hasVertex).toBe(true);

    expect(diagram.cells).toHaveLength(3);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 1);
    for (const cell of diagram.cells) {
      expect(isConvex(cell.polygon)).toBe(true);
    }
  });

  it('produces a valid partition for 4 co-circular sites (a classic degenerate case)', () => {
    const sites = [
      { id: 0, x: 30, y: 30 },
      { id: 1, x: 70, y: 30 },
      { id: 2, x: 70, y: 70 },
      { id: 3, x: 30, y: 70 },
    ];
    const { diagram } = runBruteForce(sites, BOUNDS);

    expect(diagram.cells).toHaveLength(4);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 1);
    expectNoNaNOrInfinite(diagram.cells);
  });

  it('partitions the whole bounding box exactly for a randomized 50-site diagram', () => {
    const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 50, 12345);
    const { diagram } = runBruteForce(sites, BOUNDS);

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
    expect(() => runBruteForce(sites, BOUNDS)).not.toThrow();
    const { diagram } = runBruteForce(sites, BOUNDS);
    expectNoNaNOrInfinite(diagram.cells);
  });

  it('handles sites exactly on the bounding box edge/corner without crashing', () => {
    const sites = [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 100, y: 0 },
      { id: 2, x: 0, y: 100 },
      { id: 3, x: 50, y: 50 },
    ];
    expect(() => runBruteForce(sites, BOUNDS)).not.toThrow();
    const { diagram } = runBruteForce(sites, BOUNDS);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 0);
  });

  it('records a cellComputed step per site and ends in a complete step', () => {
    const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 20, 777);
    const { trace, diagram } = runBruteForce(sites, BOUNDS);

    expect(trace.length).toBe(sites.length + 1);
    expect(trace[trace.length - 1]).toEqual({ type: 'complete', diagram });
    const cellComputedCount = trace.filter((step) => step.type === 'cellComputed').length;
    expect(cellComputedCount).toBe(sites.length);
  });
});
