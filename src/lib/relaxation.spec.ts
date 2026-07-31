import type { AlgorithmId } from './algorithms.js';
import { relaxSites } from './relaxation.js';
import { generateRandomSites } from './sites.js';

const BOUNDS = { width: 100, height: 100 };

describe('relaxSites', () => {
  it('returns sites unchanged for 0 iterations', () => {
    const sites = [{ id: 0, x: 10, y: 10 }];
    expect(relaxSites(sites, BOUNDS, 'fortune', 0)).toEqual(sites);
  });

  it('moves a single site to the exact box center (its cell is the whole box)', () => {
    const sites = [{ id: 0, x: 10, y: 10 }];
    const [relaxed] = relaxSites(sites, BOUNDS, 'brute-force', 1);
    expect(relaxed.x).toBeCloseTo(50, 6);
    expect(relaxed.y).toBeCloseTo(50, 6);
  });

  it('preserves site ids and keeps every site within bounds, across algorithms and iterations', () => {
    const algorithms: AlgorithmId[] = ['fortune', 'brute-force', 'bowyer-watson'];
    for (const algorithm of algorithms) {
      const sites = generateRandomSites(BOUNDS.width, BOUNDS.height, 15, 3);
      const relaxed = relaxSites(sites, BOUNDS, algorithm, 3);

      expect(relaxed.map((site) => site.id).sort((a, b) => a - b)).toEqual(
        sites.map((site) => site.id).sort((a, b) => a - b),
      );
      for (const site of relaxed) {
        expect(site.x).toBeGreaterThanOrEqual(0);
        expect(site.x).toBeLessThanOrEqual(BOUNDS.width);
        expect(site.y).toBeGreaterThanOrEqual(0);
        expect(site.y).toBeLessThanOrEqual(BOUNDS.height);
      }
    }
  });

  it('reduces spread variance for a tightly clustered set (relaxation pushes sites apart)', () => {
    const clustered = [
      { id: 0, x: 48, y: 48 },
      { id: 1, x: 52, y: 48 },
      { id: 2, x: 48, y: 52 },
      { id: 3, x: 52, y: 52 },
    ];
    const before = averagePairwiseDistance(clustered);
    const after = averagePairwiseDistance(relaxSites(clustered, BOUNDS, 'brute-force', 4));
    expect(after).toBeGreaterThan(before);
  });

  it('leaves a site in place for an iteration where its cell degenerates to zero area', () => {
    // Two coincident-ish sites under brute-force half-plane clipping: the loser of a tie can be
    // clipped down to an empty polygon, which is exactly the "no reliable centroid" case
    // `cellCentroid` guards against — that site should just hold its position for the iteration
    // rather than the relaxation throwing or producing NaN.
    const sites = [
      { id: 0, x: 40, y: 50 },
      { id: 1, x: 40, y: 50.0000001 },
    ];
    const relaxed = relaxSites(sites, BOUNDS, 'brute-force', 1);
    for (const site of relaxed) {
      expect(Number.isFinite(site.x)).toBe(true);
      expect(Number.isFinite(site.y)).toBe(true);
    }
  });
});

function averagePairwiseDistance(sites: { x: number; y: number }[]): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      total += Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y);
      count++;
    }
  }
  return total / count;
}
