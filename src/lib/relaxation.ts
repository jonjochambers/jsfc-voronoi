import type { AlgorithmId } from './algorithms.js';
import { runAlgorithm } from './algorithms.js';
import type { Point, Site, VoronoiBounds, VoronoiCell } from './types.js';

/** Area-weighted centroid of a cell's polygon (the standard shoelace-based formula, not a naive
 * vertex average — vertex averaging skews toward wherever a polygon happens to have more
 * vertices, which biases the relaxation). `null` for degenerate cells (fewer than 3 points, or
 * zero area) — the caller leaves those sites in place for that iteration rather than dividing by
 * zero. */
function cellCentroid(polygon: readonly Point[]): Point | null {
  if (polygon.length < 3) return null;

  let signedArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    const cross = p.x * q.y - q.x * p.y;
    signedArea += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  signedArea /= 2;
  if (Math.abs(signedArea) < 1e-9) return null;

  return { x: cx / (6 * signedArea), y: cy / (6 * signedArea) };
}

function siteFromCell(cell: VoronoiCell, bounds: VoronoiBounds): Site {
  const centroid = cellCentroid(cell.polygon);
  if (!centroid) return cell.site;
  return {
    id: cell.site.id,
    x: Math.min(bounds.width, Math.max(0, centroid.x)),
    y: Math.min(bounds.height, Math.max(0, centroid.y)),
  };
}

/** Lloyd relaxation: rebuild the diagram, move each site to its own cell's centroid, repeat.
 * Produces a more evenly-spaced, less "spiky" point set than raw uniform-random sampling — pure
 * input-site perturbation, so it works identically no matter which of the three algorithms
 * builds each intermediate diagram. `iterations: 0` returns `sites` unchanged. */
export function relaxSites(
  sites: readonly Site[],
  bounds: VoronoiBounds,
  algorithm: AlgorithmId,
  iterations: number,
): Site[] {
  let current: readonly Site[] = sites;
  for (let i = 0; i < iterations; i++) {
    const { diagram } = runAlgorithm(algorithm, current, bounds);
    current = diagram.cells.map((cell) => siteFromCell(cell, bounds));
  }
  // Cheap defensive sort — every algorithm already builds `cells` in the same order as the
  // `sites` it was given, but `Site.id` is documented as indexing into the sites array, so this
  // keeps that invariant true for callers even if that internal ordering ever drifts.
  return [...current].sort((a, b) => a.id - b.id);
}
