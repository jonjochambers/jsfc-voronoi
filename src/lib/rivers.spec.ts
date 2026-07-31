import { cornerElevation, isCoastalCorner, traceRivers } from './rivers.js';
import type { Site, VoronoiCell, VoronoiCorner, VoronoiDiagram } from './types.js';

const BOUNDS = { width: 100, height: 100 };

function site(id: number, x: number, y: number): Site {
  return { id, x, y };
}

function cell(s: Site, elevation: number, tier: VoronoiCell['tier']): VoronoiCell {
  return { site: s, polygon: [], elevation, tier };
}

function corner(id: number, cellIds: number[], cornerIds: number[]): VoronoiCorner {
  return { id, point: { x: id, y: 0 }, cellIds, cornerIds };
}

describe('cornerElevation', () => {
  it('averages the elevation of every touching cell', () => {
    const siteA = site(0, 0, 0);
    const siteB = site(1, 10, 0);
    const diagram: VoronoiDiagram = {
      sites: [siteA, siteB],
      edges: [],
      cells: [cell(siteA, 0.9, 'MOUNTAIN'), cell(siteB, 0.5, 'PLAIN')],
      bounds: BOUNDS,
      corners: [],
    };
    expect(cornerElevation(diagram, corner(0, [0, 1], []))).toBeCloseTo(0.7);
  });

  it('is 0 for a corner touching no cells', () => {
    const diagram: VoronoiDiagram = {
      sites: [],
      edges: [],
      cells: [],
      bounds: BOUNDS,
      corners: [],
    };
    expect(cornerElevation(diagram, corner(0, [], []))).toBe(0);
  });
});

describe('isCoastalCorner', () => {
  it('is true if any touching cell is OCEAN-tiered', () => {
    const siteA = site(0, 0, 0);
    const siteB = site(1, 10, 0);
    const cellsBySite = new Map([
      [0, cell(siteA, 0.5, 'PLAIN')],
      [1, cell(siteB, 0.1, 'OCEAN')],
    ]);
    expect(isCoastalCorner(corner(0, [0, 1], []), cellsBySite)).toBe(true);
    expect(isCoastalCorner(corner(1, [0], []), cellsBySite)).toBe(false);
  });
});

describe('traceRivers', () => {
  it('returns no segments for an empty corner graph', () => {
    const diagram: VoronoiDiagram = {
      sites: [],
      edges: [],
      cells: [],
      bounds: BOUNDS,
      corners: [],
    };
    expect(traceRivers(diagram, { sourceCount: 3 }).segments).toEqual([]);
  });

  it('returns no segments when sourceCount is 0 or negative', () => {
    const siteA = site(0, 0, 0);
    const diagram: VoronoiDiagram = {
      sites: [siteA],
      edges: [],
      cells: [cell(siteA, 0.9, 'MOUNTAIN')],
      bounds: BOUNDS,
      corners: [corner(0, [0], [])],
    };
    expect(traceRivers(diagram, { sourceCount: 0 }).segments).toEqual([]);
    expect(traceRivers(diagram, { sourceCount: -1 }).segments).toEqual([]);
  });

  it('returns no segments when every corner is coastal (no inland source is possible)', () => {
    const siteA = site(0, 0, 0);
    const diagram: VoronoiDiagram = {
      sites: [siteA],
      edges: [],
      cells: [cell(siteA, 0.1, 'OCEAN')],
      bounds: BOUNDS,
      corners: [corner(0, [0], [])],
    };
    expect(traceRivers(diagram, { sourceCount: 3 }).segments).toEqual([]);
  });

  it('traces a single river by steepest descent and stops at the first coastal corner', () => {
    // Chain: c0 (MOUNTAIN, 0.9) -- c1 (avg 0.7) -- c2 (avg 0.3, coastal) -- c3 (OCEAN, 0.1).
    // A pure-water hop from c2 to c3 must never appear: the river's mouth is c2.
    const siteMountain = site(0, 0, 0);
    const sitePlain = site(1, 10, 0);
    const siteOcean = site(2, 20, 0);
    const diagram: VoronoiDiagram = {
      sites: [siteMountain, sitePlain, siteOcean],
      edges: [],
      cells: [
        cell(siteMountain, 0.9, 'MOUNTAIN'),
        cell(sitePlain, 0.5, 'PLAIN'),
        cell(siteOcean, 0.1, 'OCEAN'),
      ],
      bounds: BOUNDS,
      corners: [
        corner(0, [0], [1]),
        corner(1, [0, 1], [0, 2]),
        corner(2, [1, 2], [1, 3]),
        corner(3, [2], [2]),
      ],
    };

    // quantile 1 -> only the single highest-elevation inland corner (c0) is eligible, so the
    // source is deterministic regardless of the seed's random pick.
    const { segments } = traceRivers(diagram, { sourceCount: 1, sourceElevationQuantile: 1 });

    expect(segments).toEqual([
      { fromCornerId: 0, toCornerId: 1, flow: 1 },
      { fromCornerId: 1, toCornerId: 2, flow: 1 },
    ]);
  });

  it('accumulates flow where two tributaries merge before reaching the coast', () => {
    // cA (0.9) and cB (0.85) both drain into cM (0.5), which drains into coastal cC (0.1).
    const siteA = site(0, 0, 0);
    const siteB = site(1, 10, 0);
    const siteM = site(2, 5, 10);
    const siteC = site(3, 5, 20);
    const diagram: VoronoiDiagram = {
      sites: [siteA, siteB, siteM, siteC],
      edges: [],
      cells: [
        cell(siteA, 0.9, 'MOUNTAIN'),
        cell(siteB, 0.85, 'MOUNTAIN'),
        cell(siteM, 0.5, 'PLAIN'),
        cell(siteC, 0.1, 'OCEAN'),
      ],
      bounds: BOUNDS,
      corners: [
        corner(0, [0], [2]), // cA
        corner(1, [1], [2]), // cB
        corner(2, [2], [0, 1, 3]), // cM
        corner(3, [3], [2]), // cC, coastal
      ],
    };

    const { segments } = traceRivers(diagram, { sourceCount: 2, sourceElevationQuantile: 0.5 });

    expect(segments).toEqual([
      { fromCornerId: 0, toCornerId: 2, flow: 1 },
      { fromCornerId: 1, toCornerId: 2, flow: 1 },
      { fromCornerId: 2, toCornerId: 3, flow: 2 },
    ]);
  });

  it('is deterministic for a given seed', () => {
    const sites = Array.from({ length: 6 }, (_, i) => site(i, i * 10, 0));
    const cells = sites.map((s, i) =>
      cell(s, i === 0 ? 0.2 : 0.4 + i * 0.1, i === 0 ? 'OCEAN' : 'MOUNTAIN'),
    );
    const corners = sites.map((_, i) =>
      corner(
        i,
        [i],
        [i - 1, i + 1].filter((n) => n >= 0 && n < sites.length),
      ),
    );
    const diagram: VoronoiDiagram = { sites, edges: [], cells, bounds: BOUNDS, corners };

    const a = traceRivers(diagram, { sourceCount: 2, seed: 99 });
    const b = traceRivers(diagram, { sourceCount: 2, seed: 99 });
    expect(a).toEqual(b);
  });
});
