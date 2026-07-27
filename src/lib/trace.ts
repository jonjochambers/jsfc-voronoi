import { breakpointX, parabolaY } from './geometry.js';
import type { Point, Site, VoronoiBounds, VoronoiDiagram } from './types.js';

/** One recorded step of Fortune's-algorithm execution, in the order it actually happened.
 * A flat array of these, recorded once as a side effect of `runFortune`, is the entire contract
 * between the algorithm and the UI's animated replay — the UI never re-runs any algorithm
 * logic, only this trace plus the presentational `evaluateBeachlineAt` geometry evaluator.
 * Named distinctly from the other algorithms' trace types (`BruteForceTraceStep`,
 * `BowyerWatsonTraceStep`) since each algorithm's interesting moments are shaped differently. */
export type FortuneTraceStep =
  | { type: 'sweepAdvance'; y: number; beachlineSnapshot: number[] }
  | { type: 'siteEvent'; site: Site }
  | { type: 'circleEvent'; vertex: Point; removedArcSite: number; y: number }
  | { type: 'edgeStart'; edgeId: number; siteLeft: number; siteRight: number; start: Point }
  | {
      type: 'edgeFinalize';
      edgeId: number;
      start: Point;
      end: Point;
      siteLeft: number;
      siteRight: number;
    }
  | { type: 'complete'; diagram: VoronoiDiagram };

export interface BeachlineEvaluation {
  /** One sampled polyline per active arc, left to right, clipped to the map width. */
  arcs: Point[][];
  /** The breakpoint between each adjacent pair of arcs (`arcs.length - 1` of them). */
  breakpoints: Point[];
}

/** Pure, presentational geometry evaluation: given a recorded beachline snapshot (just the
 * ordered list of active arcs' site ids) and an arbitrary sweep position, reconstructs the
 * sampled parabola shape of every arc and the breakpoints between them. No algorithmic decisions
 * are made here — it's the same closed-form math `runFortune` itself uses, replayed at whatever
 * sweep position/frame rate the UI wants, independent of how sparse the recorded events are. */
export function evaluateBeachlineAt(
  snapshot: readonly number[],
  sites: readonly Site[],
  sweepY: number,
  bounds: VoronoiBounds,
  samplesPerArc = 24,
): BeachlineEvaluation {
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const arcSites = snapshot.map((id) => {
    const site = siteById.get(id);
    if (!site) throw new Error(`evaluateBeachlineAt: unknown site id ${id} in snapshot`);
    return site;
  });

  const breakpoints: Point[] = [];
  for (let i = 0; i < arcSites.length - 1; i++) {
    const x = breakpointX(arcSites[i], arcSites[i + 1], sweepY);
    breakpoints.push({ x, y: parabolaY(arcSites[i], sweepY, x) });
  }

  const arcs: Point[][] = arcSites.map((site, i) => {
    const xStart = i === 0 ? 0 : breakpoints[i - 1].x;
    const xEnd = i === arcSites.length - 1 ? bounds.width : breakpoints[i].x;
    const lo = Math.max(0, Math.min(xStart, xEnd));
    const hi = Math.min(bounds.width, Math.max(xStart, xEnd));
    if (hi <= lo) return [];

    const points: Point[] = [];
    for (let s = 0; s <= samplesPerArc; s++) {
      const x = lo + ((hi - lo) * s) / samplesPerArc;
      points.push({ x, y: parabolaY(site, sweepY, x) });
    }
    return points;
  });

  return { arcs, breakpoints };
}
