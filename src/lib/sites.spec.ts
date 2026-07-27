import { generateRandomSites } from './sites.js';

describe('generateRandomSites', () => {
  it('generates exactly the requested count', () => {
    const sites = generateRandomSites(800, 600, 50, 1);
    expect(sites).toHaveLength(50);
  });

  it('keeps every site within bounds', () => {
    const sites = generateRandomSites(800, 600, 100, 2);
    for (const site of sites) {
      expect(site.x).toBeGreaterThanOrEqual(0);
      expect(site.x).toBeLessThanOrEqual(800);
      expect(site.y).toBeGreaterThanOrEqual(0);
      expect(site.y).toBeLessThanOrEqual(600);
    }
  });

  it('assigns sequential, unique ids', () => {
    const sites = generateRandomSites(800, 600, 30, 3);
    expect(sites.map((site) => site.id)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it('is deterministic for a given seed', () => {
    const a = generateRandomSites(800, 600, 40, 99);
    const b = generateRandomSites(800, 600, 40, 99);
    expect(a).toEqual(b);
  });

  it('produces no exactly-coincident points', () => {
    const sites = generateRandomSites(800, 600, 200, 4);
    const keys = new Set(sites.map((site) => `${site.x}:${site.y}`));
    expect(keys.size).toBe(sites.length);
  });
});
