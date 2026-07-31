import { applyIslandShape } from './island.js';
import type { VoronoiDiagram } from './types.js';

const BOUNDS = { width: 100, height: 100 };

function diagramWithSiteAt(x: number, y: number): VoronoiDiagram {
  const site = { id: 0, x, y };
  return {
    sites: [site],
    edges: [],
    cells: [{ site, polygon: [] }],
    bounds: BOUNDS,
    corners: [],
  };
}

describe('applyIslandShape', () => {
  it('always classifies the exact map center as land', () => {
    const diagram = diagramWithSiteAt(50, 50);
    const result = applyIslandShape(diagram, {
      baseRadiusFactor: 0.1,
      jitterAmplitude: 0.9,
      seed: 1,
    });
    expect(result.cells[0].isLand).toBe(true);
  });

  it('classifies a map corner as water for a modest base radius', () => {
    const diagram = diagramWithSiteAt(0, 0);
    const result = applyIslandShape(diagram, {
      baseRadiusFactor: 0.5,
      jitterAmplitude: 0.25,
      seed: 1,
    });
    expect(result.cells[0].isLand).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const diagram = diagramWithSiteAt(30, 70);
    const a = applyIslandShape(diagram, { baseRadiusFactor: 0.6, jitterAmplitude: 0.4, seed: 42 });
    const b = applyIslandShape(diagram, { baseRadiusFactor: 0.6, jitterAmplitude: 0.4, seed: 42 });
    expect(a.cells[0].isLand).toBe(b.cells[0].isLand);
  });

  it('never lets the jittered threshold exceed the configured amplitude bounds', () => {
    const baseRadiusFactor = 0.6;
    const jitterAmplitude = 0.3;
    const minRadius = ((baseRadiusFactor * 100) / 2) * (1 - jitterAmplitude);
    const maxRadius = ((baseRadiusFactor * 100) / 2) * (1 + jitterAmplitude);

    // Sample many angles indirectly via many sites at a fixed radius from center, all at the
    // radius boundary, and confirm land/water agrees with the guaranteed-safe min/max bounds.
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const insideSafe = {
        sites: [
          {
            id: 0,
            x: 50 + Math.cos(angle) * (minRadius - 0.01),
            y: 50 + Math.sin(angle) * (minRadius - 0.01),
          },
        ],
        edges: [],
        cells: [
          {
            site: {
              id: 0,
              x: 50 + Math.cos(angle) * (minRadius - 0.01),
              y: 50 + Math.sin(angle) * (minRadius - 0.01),
            },
            polygon: [],
          },
        ],
        bounds: BOUNDS,
        corners: [],
      } satisfies VoronoiDiagram;
      const outsideSafe = {
        sites: [
          {
            id: 0,
            x: 50 + Math.cos(angle) * (maxRadius + 0.01),
            y: 50 + Math.sin(angle) * (maxRadius + 0.01),
          },
        ],
        edges: [],
        cells: [
          {
            site: {
              id: 0,
              x: 50 + Math.cos(angle) * (maxRadius + 0.01),
              y: 50 + Math.sin(angle) * (maxRadius + 0.01),
            },
            polygon: [],
          },
        ],
        bounds: BOUNDS,
        corners: [],
      } satisfies VoronoiDiagram;

      expect(
        applyIslandShape(insideSafe, { baseRadiusFactor, jitterAmplitude, seed: 7 }).cells[0]
          .isLand,
      ).toBe(true);
      expect(
        applyIslandShape(outsideSafe, { baseRadiusFactor, jitterAmplitude, seed: 7 }).cells[0]
          .isLand,
      ).toBe(false);
    }
  });
});
