import type { Point, VoronoiBounds } from './types.js';

/** Liang–Barsky segment-vs-box clip. Returns the portion of segment `p0`→`p1` that lies within
 * `[0,bounds.width] x [0,bounds.height]`, or `null` if none of it does. Works for segments with
 * either or both endpoints outside the box (not just rays from inside). */
export function clipSegmentToBox(
  p0: Point,
  p1: Point,
  bounds: VoronoiBounds,
): [Point, Point] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  const accept = (p: number, q: number): boolean => {
    if (p === 0) {
      // Parallel to this boundary pair — outside if it starts on the wrong side.
      return q >= 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  const inside =
    accept(-dx, p0.x) &&
    accept(dx, bounds.width - p0.x) &&
    accept(-dy, p0.y) &&
    accept(dy, bounds.height - p0.y);

  if (!inside || t1 < t0) return null;

  return [
    { x: p0.x + t0 * dx, y: p0.y + t0 * dy },
    { x: p0.x + t1 * dx, y: p0.y + t1 * dy },
  ];
}
