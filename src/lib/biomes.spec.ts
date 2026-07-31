import { assignBiomes, biomeFor } from './biomes.js';
import type { ElevationTier, VoronoiCell, VoronoiDiagram } from './types.js';

describe('biomeFor', () => {
  it('is always OCEAN regardless of moisture', () => {
    expect(biomeFor('OCEAN', 0)).toBe('OCEAN');
    expect(biomeFor('OCEAN', 1)).toBe('OCEAN');
  });

  it('is always BEACH regardless of moisture', () => {
    expect(biomeFor('COAST', 0)).toBe('BEACH');
    expect(biomeFor('COAST', 1)).toBe('BEACH');
  });

  it('turns arid plains into desert and wet plains into rain forest', () => {
    expect(biomeFor('PLAIN', 0)).toBe('DESERT');
    expect(biomeFor('PLAIN', 1)).toBe('RAIN_FOREST');
  });

  it('turns mountains cold regardless of moisture, snowy when wettest', () => {
    expect(biomeFor('MOUNTAIN', 0)).toBe('TUNDRA');
    expect(biomeFor('MOUNTAIN', 1)).toBe('SNOW');
  });
});

describe('assignBiomes', () => {
  it('combines each cell tier with its assigned moisture', () => {
    const tiers = new Map<number, ElevationTier>([
      [0, 'OCEAN'],
      [1, 'PLAIN'],
    ]);
    const cells: VoronoiCell[] = [
      { site: { id: 0, x: 0, y: 0 }, polygon: [], moisture: 0.9 },
      { site: { id: 1, x: 1, y: 0 }, polygon: [], moisture: 0.1 },
    ];
    const diagram: VoronoiDiagram = {
      sites: cells.map((c) => c.site),
      edges: [],
      cells,
      bounds: { width: 10, height: 10 },
      corners: [],
    };

    const result = assignBiomes(diagram, (cell) => tiers.get(cell.site.id) ?? 'OCEAN');
    expect(result.cells.find((c) => c.site.id === 0)?.biome).toBe('OCEAN');
    expect(result.cells.find((c) => c.site.id === 1)?.biome).toBe('DESERT');
  });

  it('treats a missing moisture value as 0', () => {
    const cells: VoronoiCell[] = [{ site: { id: 0, x: 0, y: 0 }, polygon: [] }];
    const diagram: VoronoiDiagram = {
      sites: cells.map((c) => c.site),
      edges: [],
      cells,
      bounds: { width: 10, height: 10 },
      corners: [],
    };

    const result = assignBiomes(diagram, () => 'PLAIN');
    expect(result.cells[0].biome).toBe('DESERT');
  });

  it('reads cell.tier by default when no tierForCell override is given', () => {
    const cells: VoronoiCell[] = [
      { site: { id: 0, x: 0, y: 0 }, polygon: [], tier: 'MOUNTAIN', moisture: 1 },
      { site: { id: 1, x: 1, y: 0 }, polygon: [], moisture: 1 },
    ];
    const diagram: VoronoiDiagram = {
      sites: cells.map((c) => c.site),
      edges: [],
      cells,
      bounds: { width: 10, height: 10 },
      corners: [],
    };

    const result = assignBiomes(diagram);
    expect(result.cells.find((c) => c.site.id === 0)?.biome).toBe('SNOW');
    // No tier set falls back to OCEAN.
    expect(result.cells.find((c) => c.site.id === 1)?.biome).toBe('OCEAN');
  });
});
