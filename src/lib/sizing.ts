export const MIN_MAP_DIMENSION = 512;
export const MAX_MAP_DIMENSION = 2048;
export const MIN_POINTS_FLOOR = 16;
export const MAX_POINTS_CAP = 800;

// Target average area (px²) per Voronoi cell — tuned for a diagram that reads as
// detailed without becoming visually noisy. A starting value, not derived from
// anything other than area math; expect to retune once the animation is on screen.
const TARGET_CELL_AREA_PX2 = 6000;

/** Sensible minimum point count for a map of the given size, floored and capped for perf/legibility. */
export function minPointCount(width: number, height: number): number {
  const raw = Math.round((width * height) / TARGET_CELL_AREA_PX2);
  return Math.min(MAX_POINTS_CAP, Math.max(MIN_POINTS_FLOOR, raw));
}
