import { MAX_MAP_DIMENSION, MAX_POINTS_CAP, MIN_POINTS_FLOOR, minPointCount } from './sizing.js';

describe('minPointCount', () => {
  it('is at least the floor for the minimum map size', () => {
    expect(minPointCount(512, 512)).toBeGreaterThanOrEqual(MIN_POINTS_FLOOR);
  });

  it('is clamped to the cap for a very large area', () => {
    expect(minPointCount(10000, 10000)).toBe(MAX_POINTS_CAP);
  });

  it('stays within the cap at the maximum supported map size', () => {
    expect(minPointCount(MAX_MAP_DIMENSION, MAX_MAP_DIMENSION)).toBeLessThanOrEqual(MAX_POINTS_CAP);
  });

  it('is clamped to the floor for a tiny/degenerate area', () => {
    expect(minPointCount(1, 1)).toBe(MIN_POINTS_FLOOR);
  });

  it('is monotonically non-decreasing as width grows', () => {
    const heights = 800;
    let previous = minPointCount(512, heights);
    for (const width of [600, 800, 1000, 1200, 1600, 2000]) {
      const current = minPointCount(width, heights);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('is symmetric in width/height (depends only on area)', () => {
    expect(minPointCount(1200, 700)).toBe(minPointCount(700, 1200));
  });
});
