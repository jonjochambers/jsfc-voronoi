import { assignMoisture, moistureLevel } from './moisture.js';
import type { VoronoiCell, VoronoiDiagram } from './types.js';

function cell(siteId: number, isLandCell: boolean, neighborIds: number[]): VoronoiCell {
  return {
    site: { id: siteId, x: siteId, y: 0 },
    polygon: [],
    tier: isLandCell ? 'PLAIN' : 'OCEAN',
    neighborIds,
  };
}

function diagramOf(cells: VoronoiCell[]): VoronoiDiagram {
  return {
    sites: cells.map((c) => c.site),
    edges: [],
    cells,
    bounds: { width: 100, height: 100 },
    corners: [],
  };
}

const isLand = (c: VoronoiCell) => c.tier !== 'OCEAN';

describe('moistureLevel', () => {
  it('buckets the 0-1 range into named levels', () => {
    expect(moistureLevel(0)).toBe('ARID');
    expect(moistureLevel(0.19)).toBe('ARID');
    expect(moistureLevel(0.2)).toBe('DRY');
    expect(moistureLevel(0.4)).toBe('MODERATE');
    expect(moistureLevel(0.6)).toBe('WET');
    expect(moistureLevel(0.8)).toBe('SATURATED');
    expect(moistureLevel(1)).toBe('SATURATED');
  });
});

describe('assignMoisture', () => {
  it('gives every land cell 0 moisture when seedCount is 0', () => {
    const diagram = diagramOf([cell(0, true, [1]), cell(1, true, [0])]);
    const result = assignMoisture(diagram, isLand, { seedCount: 0, seed: 1 });
    expect(result.cells.every((c) => c.moisture === 0)).toBe(true);
  });

  it('gives ocean cells 0 moisture even when adjacent to a seeded source', () => {
    const diagram = diagramOf([cell(0, true, [1]), cell(1, false, [0])]);
    const result = assignMoisture(diagram, isLand, { seedCount: 1, seed: 1 });
    const ocean = result.cells.find((c) => c.site.id === 1);
    expect(ocean?.moisture).toBe(0);
  });

  it('decays moisture by falloffPerHop across each land-neighbor hop, never crossing water', () => {
    // 0 - 1 - 2(water) - 3 : a chain where the source at 0 can only reach 1, not 3 (blocked by
    // water at 2), so 3 must stay at 0 regardless of graph distance.
    const diagram = diagramOf([
      cell(0, true, [1]),
      cell(1, true, [0, 2]),
      cell(2, false, [1, 3]),
      cell(3, true, [2]),
    ]);
    const result = assignMoisture(diagram, isLand, {
      seedCount: 1,
      falloffPerHop: 0.5,
      seed: 1,
    });
    const bySite = new Map(result.cells.map((c) => [c.site.id, c.moisture]));
    // With only one possible source (cells 0 or 1 by seed choice) and falloff of 0.5, adjacent
    // land cells differ by exactly half, and cell 3 across the water stays unreached.
    expect(bySite.get(3)).toBe(0);
    const source = bySite.get(0) === 1 ? 0 : 1;
    const other = source === 0 ? 1 : 0;
    expect(bySite.get(source)).toBe(1);
    expect(bySite.get(other)).toBeCloseTo(0.5, 10);
  });

  it('is deterministic for a given seed', () => {
    const cells = Array.from({ length: 10 }, (_, i) =>
      cell(
        i,
        true,
        [i - 1, i + 1].filter((n) => n >= 0 && n < 10),
      ),
    );
    const a = assignMoisture(diagramOf(cells), isLand, { seedCount: 3, seed: 42 });
    const b = assignMoisture(diagramOf(cells), isLand, { seedCount: 3, seed: 42 });
    expect(a.cells.map((c) => c.moisture)).toEqual(b.cells.map((c) => c.moisture));
  });

  it('handles a diagram with no land cells without throwing', () => {
    const diagram = diagramOf([cell(0, false, []), cell(1, false, [])]);
    const result = assignMoisture(diagram, isLand, { seedCount: 5, seed: 1 });
    expect(result.cells.every((c) => c.moisture === 0)).toBe(true);
  });
});
