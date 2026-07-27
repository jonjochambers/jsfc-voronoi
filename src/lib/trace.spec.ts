import { evaluateBeachlineAt } from './trace.js';
import type { Site } from './types.js';

const BOUNDS = { width: 100, height: 100 };

describe('evaluateBeachlineAt', () => {
  it('returns an empty evaluation for an empty snapshot', () => {
    const result = evaluateBeachlineAt([], [], 50, BOUNDS);
    expect(result.arcs).toEqual([]);
    expect(result.breakpoints).toEqual([]);
  });

  it('spans the full map width for a single-arc snapshot with no breakpoints', () => {
    const sites: Site[] = [{ id: 0, x: 50, y: 10 }];
    const result = evaluateBeachlineAt([0], sites, 50, BOUNDS, 4);
    expect(result.breakpoints).toEqual([]);
    expect(result.arcs).toHaveLength(1);
    expect(result.arcs[0][0].x).toBeCloseTo(0, 6);
    expect(result.arcs[0][result.arcs[0].length - 1].x).toBeCloseTo(BOUNDS.width, 6);
  });

  it('matches the hand-computed breakpoint for a known 2-site case', () => {
    // Same fixture as geometry.spec.ts's asymmetric breakpointX case.
    const sites: Site[] = [
      { id: 0, x: 10, y: 5 },
      { id: 1, x: 0, y: 0 },
    ];
    const result = evaluateBeachlineAt([0, 1], sites, 20, BOUNDS, 4);
    expect(result.breakpoints).toHaveLength(1);
    expect(result.breakpoints[0].x).toBeCloseTo(1.2702, 2);
  });

  it('throws if the snapshot references an unknown site id', () => {
    expect(() => evaluateBeachlineAt([99], [], 50, BOUNDS)).toThrow();
  });
});
