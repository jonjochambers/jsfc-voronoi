import { clipPolygonByHalfPlane } from './half-plane-clip.js';
import type { Point, Site, VoronoiBounds, VoronoiCell, VoronoiDiagram } from './types.js';

/** One recorded step of the brute-force construction, in the order it actually happened. Each
 * site's cell is computed whole (not edge-by-edge like Fortune's), so the interesting moments
 * here are just "this cell finished" rather than a sweep or a growing mesh. */
export type BruteForceTraceStep =
  | { type: 'cellComputed'; site: Site; polygon: Point[] }
  | { type: 'complete'; diagram: VoronoiDiagram };

/** Simplest possible correct Voronoi construction: for each site, start from the bounding box and
 * clip it against every other site's perpendicular-bisector half-plane in turn (the set of points
 * closer to `site` than `other` is a half-plane through their midpoint, normal to the vector
 * between them — see `half-plane-clip.ts`). No sweep, no event queue, no ambiguous root-selection
 * — just direct geometric intersection, `O(n)` half-plane clips per site. `O(n²)`-ish overall,
 * which is plenty fast in-browser at this package's point-count cap, and serves as an
 * always-correct reference alongside the more elaborate `fortune.ts`/`bowyer-watson.ts`. */
export function runBruteForce(
  sites: readonly Site[],
  bounds: VoronoiBounds,
): { diagram: VoronoiDiagram; trace: BruteForceTraceStep[] } {
  const trace: BruteForceTraceStep[] = [];
  const boxPolygon: Point[] = [
    { x: 0, y: 0 },
    { x: bounds.width, y: 0 },
    { x: bounds.width, y: bounds.height },
    { x: 0, y: bounds.height },
  ];

  const cells: VoronoiCell[] = sites.map((site) => {
    let polygon = boxPolygon;
    for (const other of sites) {
      if (other.id === site.id) continue;
      const midpoint = { x: (site.x + other.x) / 2, y: (site.y + other.y) / 2 };
      const towardSite = { x: site.x - other.x, y: site.y - other.y };
      polygon = clipPolygonByHalfPlane(polygon, midpoint, towardSite);
      if (polygon.length === 0) break;
    }
    trace.push({ type: 'cellComputed', site, polygon });
    return { site, polygon };
  });

  // No edge list: nothing downstream needs one (final rendering and land/water classification
  // only ever read `cells`), and this algorithm doesn't naturally produce edges shared between
  // exactly two sites the way Fortune's/Bowyer-Watson's do.
  const diagram: VoronoiDiagram = { sites: [...sites], edges: [], cells, bounds, corners: [] };
  trace.push({ type: 'complete', diagram });

  return { diagram, trace };
}
