import { runFortune } from './fortune.js';
import { generateRandomSites } from './sites.js';
import { expectNoNaNOrInfinite, isConvex, polygonArea, totalArea } from './test-helpers.js';
import type { Point } from './types.js';

const BOUNDS = { width: 100, height: 100 };

describe('runFortune', () => {
  it('gives 2 sites a single clipped bisector line, split evenly between them', () => {
    const sites = [
      { id: 0, x: 30, y: 30 },
      { id: 1, x: 70, y: 70 },
    ];
    const { diagram } = runFortune(sites, BOUNDS);

    expect(diagram.edges.length).toBeGreaterThan(0);
    // Perpendicular bisector of (30,30)-(70,70) is the line y = 100 - x; every edge endpoint
    // should lie on it.
    for (const edge of diagram.edges) {
      for (const point of [edge.start, edge.end]) {
        expect(point.y).toBeCloseTo(100 - point.x, 4);
      }
    }

    expect(diagram.cells).toHaveLength(2);
    for (const cell of diagram.cells) {
      expect(polygonArea(cell.polygon)).toBeCloseTo(5000, 2);
    }
  });

  it('places the vertex of a 3-site triangle at the hand-computed circumcenter', () => {
    const sites = [
      { id: 0, x: 50, y: 20 },
      { id: 1, x: 20, y: 80 },
      { id: 2, x: 80, y: 80 },
    ];
    const { diagram } = runFortune(sites, BOUNDS);

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
    // A square: all 4 sites equidistant from the center, a textbook co-circular configuration.
    const sites = [
      { id: 0, x: 30, y: 30 },
      { id: 1, x: 70, y: 30 },
      { id: 2, x: 70, y: 70 },
      { id: 3, x: 30, y: 70 },
    ];
    const { diagram } = runFortune(sites, BOUNDS);

    expect(diagram.cells).toHaveLength(4);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 1);
    expectNoNaNOrInfinite(diagram.cells);
  });

  it('partitions the whole bounding box exactly for a randomized 50-site diagram', () => {
    const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 50, 12345);
    const { diagram } = runFortune(sites, BOUNDS);

    expect(diagram.cells).toHaveLength(50);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 0);
    expectNoNaNOrInfinite(diagram.cells);
    for (const cell of diagram.cells) {
      expect(isConvex(cell.polygon)).toBe(true);
    }

    // Adjacency consistency: every edge's endpoints appear in both of its bordering cells.
    const cellBySite = new Map(diagram.cells.map((cell) => [cell.site.id, cell]));
    for (const edge of diagram.edges) {
      const left = cellBySite.get(edge.siteLeft);
      const right = cellBySite.get(edge.siteRight);
      for (const point of [edge.start, edge.end]) {
        const nearIn = (polygon: Point[]) =>
          polygon.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < 1e-4);
        expect(nearIn(left?.polygon ?? [])).toBe(true);
        expect(nearIn(right?.polygon ?? [])).toBe(true);
      }
    }
  });

  it('handles duplicate input coordinates without crashing', () => {
    const sites = [
      { id: 0, x: 40, y: 40 },
      { id: 1, x: 40, y: 40 },
      { id: 2, x: 70, y: 70 },
    ];
    expect(() => runFortune(sites, BOUNDS)).not.toThrow();
    const { diagram } = runFortune(sites, BOUNDS);
    expectNoNaNOrInfinite(diagram.cells);
  });

  it('handles sites exactly on the bounding box edge/corner without crashing', () => {
    const sites = [
      { id: 0, x: 0, y: 0 },
      { id: 1, x: 100, y: 0 },
      { id: 2, x: 0, y: 100 },
      { id: 3, x: 50, y: 50 },
    ];
    expect(() => runFortune(sites, BOUNDS)).not.toThrow();
    const { diagram } = runFortune(sites, BOUNDS);
    expect(totalArea(diagram.cells)).toBeCloseTo(BOUNDS.width * BOUNDS.height, 0);
  });

  it('records a trace whose sweep-y is monotonically non-decreasing and ends in a complete step', () => {
    const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 20, 777);
    const { trace, diagram } = runFortune(sites, BOUNDS);

    expect(trace.length).toBeGreaterThan(0);
    expect(trace[trace.length - 1]).toEqual({ type: 'complete', diagram });

    let lastY = Number.NEGATIVE_INFINITY;
    for (const step of trace) {
      if (step.type === 'sweepAdvance') {
        expect(step.y).toBeGreaterThanOrEqual(lastY - 1e-9);
        lastY = step.y;
      }
    }

    const siteEventCount = trace.filter((step) => step.type === 'siteEvent').length;
    expect(siteEventCount).toBe(sites.length);
  });
});
