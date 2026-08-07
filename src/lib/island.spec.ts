import { applyIslandShape, coastlineRadiusAt, tierForElevation } from './island.js';
import type { VoronoiDiagram } from './types.js';

const BOUNDS = { width: 100, height: 100 };

function diagramWithSiteAt(x: number, y: number): VoronoiDiagram {
  return diagramWithSiteAtBounds(x, y, BOUNDS);
}

function diagramWithSiteAtBounds(
  x: number,
  y: number,
  bounds: { width: number; height: number },
): VoronoiDiagram {
  const site = { id: 0, x, y };
  return {
    sites: [site],
    edges: [],
    cells: [{ site, polygon: [] }],
    bounds,
    corners: [],
  };
}

describe('applyIslandShape', () => {
  it('always keeps the exact map center well above the OCEAN/COAST bands', () => {
    const diagram = diagramWithSiteAt(50, 50);
    const result = applyIslandShape(diagram, {
      baseRadiusFactor: 0.1,
      jitterAmplitude: 0.9,
      seed: 1,
    });
    expect(result.cells[0].elevation).toBeGreaterThan(0.4);
    expect(['PLAIN', 'HILL', 'MOUNTAIN']).toContain(result.cells[0].tier);
  });

  it('classifies a far corner as OCEAN for a modest, saturated-shape base radius', () => {
    const diagram = diagramWithSiteAt(0, 0);
    const result = applyIslandShape(diagram, {
      baseRadiusFactor: 0.2,
      jitterAmplitude: 0.25,
      seed: 1,
    });
    expect(result.cells[0].tier).toBe('OCEAN');
  });

  it('keeps the long-axis edge midpoints out of land tiers on a non-square canvas', () => {
    // Regression: a coastline radius derived from min(width, height) alone let land persist past
    // the longer axis's edge on wide/tall canvases (e.g. 800x608), even though the shorter axis
    // correctly stayed within the coastline. jitterAmplitude is 0 here to isolate the geometric
    // containment claim from the organic bulges jitter is deliberately allowed to produce.
    const bounds = { width: 800, height: 608 };
    const edgeMidpoints = [
      { x: 0, y: bounds.height / 2 },
      { x: bounds.width, y: bounds.height / 2 },
    ];
    for (const { x, y } of edgeMidpoints) {
      for (let seed = 0; seed < 20; seed++) {
        const diagram = diagramWithSiteAtBounds(x, y, bounds);
        const result = applyIslandShape(diagram, {
          baseRadiusFactor: 0.75,
          jitterAmplitude: 0,
          seed,
        });
        expect(['OCEAN', 'COAST']).toContain(result.cells[0].tier);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const diagram = diagramWithSiteAt(30, 70);
    const a = applyIslandShape(diagram, { baseRadiusFactor: 0.6, jitterAmplitude: 0.4, seed: 42 });
    const b = applyIslandShape(diagram, { baseRadiusFactor: 0.6, jitterAmplitude: 0.4, seed: 42 });
    expect(a.cells[0].elevation).toBe(b.cells[0].elevation);
    expect(a.cells[0].tier).toBe(b.cells[0].tier);
  });

  it('varies elevation across cells at the same radius (noise layer has an effect)', () => {
    const sites = Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      return { id: i, x: 50 + Math.cos(angle) * 25, y: 50 + Math.sin(angle) * 25 };
    });
    const diagram: VoronoiDiagram = {
      sites,
      edges: [],
      cells: sites.map((site) => ({ site, polygon: [] })),
      bounds: BOUNDS,
      corners: [],
    };
    const result = applyIslandShape(diagram, {
      baseRadiusFactor: 0.6,
      jitterAmplitude: 0,
      seed: 3,
    });
    const elevations = result.cells.map((cell) => cell.elevation);
    expect(new Set(elevations).size).toBeGreaterThan(1);
  });
});

describe('coastlineRadiusAt', () => {
  it('never exceeds the configured jitter amplitude bounds, for any angle or control multipliers', () => {
    const baseRadius = 30;
    const jitterAmplitude = 0.3;
    const minRadius = baseRadius * (1 - jitterAmplitude);
    const maxRadius = baseRadius * (1 + jitterAmplitude);

    for (let seed = 0; seed < 5; seed++) {
      const controlMultipliers = Array.from(
        { length: 10 },
        (_, i) => 1 + Math.sin(i * 0.7 + seed) * jitterAmplitude,
      );
      for (let i = 0; i < 48; i++) {
        const angle = (i / 48) * Math.PI * 2;
        const radius = coastlineRadiusAt(angle, baseRadius, controlMultipliers);
        expect(radius).toBeGreaterThanOrEqual(minRadius - 1e-9);
        expect(radius).toBeLessThanOrEqual(maxRadius + 1e-9);
      }
    }
  });
});

describe('tierForElevation', () => {
  it('buckets elevation into the five named tiers at the expected breakpoints', () => {
    expect(tierForElevation(0)).toBe('OCEAN');
    expect(tierForElevation(0.29)).toBe('OCEAN');
    expect(tierForElevation(0.3)).toBe('COAST');
    expect(tierForElevation(0.4)).toBe('PLAIN');
    expect(tierForElevation(0.6)).toBe('HILL');
    expect(tierForElevation(0.8)).toBe('MOUNTAIN');
    expect(tierForElevation(1)).toBe('MOUNTAIN');
  });
});
