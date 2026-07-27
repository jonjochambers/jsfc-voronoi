import type { Point } from './types.js';

function isInside(point: Point, boundaryPoint: Point, insideDirection: Point): boolean {
  const dx = point.x - boundaryPoint.x;
  const dy = point.y - boundaryPoint.y;
  return dx * insideDirection.x + dy * insideDirection.y >= 0;
}

function intersection(a: Point, b: Point, boundaryPoint: Point, insideDirection: Point): Point {
  const da =
    (a.x - boundaryPoint.x) * insideDirection.x + (a.y - boundaryPoint.y) * insideDirection.y;
  const db =
    (b.x - boundaryPoint.x) * insideDirection.x + (b.y - boundaryPoint.y) * insideDirection.y;
  const t = da / (da - db);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Sutherland-Hodgman clip of a convex `polygon` against a single half-plane: the line through
 * `boundaryPoint` perpendicular to `insideDirection`, keeping the side `insideDirection` points
 * toward. Used by `brute-force.ts` to intersect a site's cell (starting from the bounding box)
 * against every other site's perpendicular-bisector half-plane, one site at a time. */
export function clipPolygonByHalfPlane(
  polygon: readonly Point[],
  boundaryPoint: Point,
  insideDirection: Point,
): Point[] {
  if (polygon.length === 0) return [];

  const output: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const previous = polygon[(i - 1 + polygon.length) % polygon.length];
    const currentInside = isInside(current, boundaryPoint, insideDirection);
    const previousInside = isInside(previous, boundaryPoint, insideDirection);

    if (currentInside !== previousInside) {
      output.push(intersection(previous, current, boundaryPoint, insideDirection));
    }
    if (currentInside) {
      output.push(current);
    }
  }
  return output;
}
