import type { Point, Site, VoronoiBounds, VoronoiCell, VoronoiEdge } from './types.js';

const DEDUPE_EPSILON = 1e-6;

function addPoint(bySite: Map<number, Point[]>, siteId: number, point: Point): void {
  const list = bySite.get(siteId) ?? [];
  const isDuplicate = list.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < DEDUPE_EPSILON);
  if (!isDuplicate) list.push(point);
  bySite.set(siteId, list);
}

/** Angle of `point` around `site`, for sorting a cell's polygon into boundary order. A point
 * exactly coincident with the site (a site sitting exactly on a map corner, which then legally
 * "owns" that corner as one of its own polygon vertices) has no real angle — atan2(0,0) is 0,
 * which can collide with a genuine point that happens to sit due "east" of the site and corrupt
 * the sort. For that case, use the corner's inward diagonal direction instead (derived from which
 * half of the map the site sits in), which is a stable stand-in that keeps the corner vertex in
 * its correct place in the winding order without needing to special-case it out of the polygon. */
function angleAround(site: Site, point: Point, bounds: VoronoiBounds): number {
  const dx = point.x - site.x;
  const dy = point.y - site.y;
  if (Math.abs(dx) < DEDUPE_EPSILON && Math.abs(dy) < DEDUPE_EPSILON) {
    const inwardX = site.x < bounds.width / 2 ? 1 : -1;
    const inwardY = site.y < bounds.height / 2 ? 1 : -1;
    return Math.atan2(inwardY, inwardX);
  }
  return Math.atan2(dy, dx);
}

/** Builds each site's cell polygon from the finished, bounds-clipped edge list.
 *
 * A Voronoi cell is convex and always contains its own site, so it's star-shaped around that
 * site — meaning every vertex of the cell's polygon, angularly sorted around the site, comes
 * back out in the correct boundary order with no further stitching needed. That includes
 * bounding-box corners: a box corner belongs to whichever site is nearest to it (the ordinary
 * Voronoi rule, just evaluated at the box's 4 fixed corner points), so assigning each corner to
 * its nearest site before the angular sort reproduces the same box-boundary-following shape a
 * half-edge implementation would build by explicit corner-stitching — just without needing to
 * detect box-side transitions by hand. */
export function buildCells(
  sites: readonly Site[],
  edges: readonly VoronoiEdge[],
  bounds: VoronoiBounds,
): VoronoiCell[] {
  const pointsBySite = new Map<number, Point[]>();

  for (const edge of edges) {
    addPoint(pointsBySite, edge.siteLeft, edge.start);
    addPoint(pointsBySite, edge.siteLeft, edge.end);
    addPoint(pointsBySite, edge.siteRight, edge.start);
    addPoint(pointsBySite, edge.siteRight, edge.end);
  }

  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: bounds.width, y: 0 },
    { x: bounds.width, y: bounds.height },
    { x: 0, y: bounds.height },
  ];

  for (const corner of corners) {
    let nearest = sites[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const site of sites) {
      const distance = Math.hypot(site.x - corner.x, site.y - corner.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = site;
      }
    }
    if (nearest) addPoint(pointsBySite, nearest.id, corner);
  }

  return sites.map((site) => {
    const points = pointsBySite.get(site.id) ?? [];
    const polygon = [...points].sort(
      (a, b) => angleAround(site, a, bounds) - angleAround(site, b, bounds),
    );
    return { site, polygon };
  });
}
