import { createRandom } from './random.js';
import type { VoronoiCell, VoronoiCorner, VoronoiDiagram } from './types.js';

export interface RiverConfig {
  /** How many river sources to trace. Tributaries that merge downstream reduce the final segment
   * count below this, since a merge stops one of the two paths early. */
  sourceCount: number;
  /** Only corners at or above this elevation quantile (0-1, e.g. 0.8 = top 20% by elevation)
   * among non-coastal corners are eligible as sources. */
  sourceElevationQuantile?: number;
  seed?: number;
}

export interface RiverSegment {
  fromCornerId: number;
  toCornerId: number;
  /** Number of sources whose path flows through this segment, accumulating as tributaries merge
   * downstream. Always >= 1 — a rendering/width mapping is a consumer concern, not baked in here. */
  flow: number;
}

export interface RiverNetwork {
  segments: RiverSegment[];
}

/** A corner's elevation isn't tracked directly (Phase 0's graph predates Phase 1A's per-cell
 * elevation) — derived as the average elevation of the cells that meet there. Cells missing
 * `elevation` (i.e. `applyIslandShape` hasn't run) contribute 0. */
export function cornerElevation(diagram: VoronoiDiagram, corner: VoronoiCorner): number {
  if (corner.cellIds.length === 0) return 0;
  const cellsBySite = new Map(diagram.cells.map((cell) => [cell.site.id, cell]));
  let total = 0;
  for (const siteId of corner.cellIds) {
    total += cellsBySite.get(siteId)?.elevation ?? 0;
  }
  return total / corner.cellIds.length;
}

/** True if any cell touching this corner is OCEAN-tiered — the corner is a river mouth candidate,
 * not somewhere a river keeps flowing past. */
export function isCoastalCorner(
  corner: VoronoiCorner,
  cellsBySite: ReadonlyMap<number, VoronoiCell>,
): boolean {
  return corner.cellIds.some((siteId) => cellsBySite.get(siteId)?.tier === 'OCEAN');
}

function pickRandom<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

/** Traces `sourceCount` rivers by steepest-descent along the corner graph (Phase 0), from
 * randomly chosen high-elevation inland corners down to the coast (or an inland sink, if the
 * descent bottoms out in a basin that never reaches OCEAN).
 *
 * Every non-coastal corner is assigned at most one "downstream" neighbor — whichever connected
 * corner has the lowest elevation, if it's lower than its own (a single-parent forest, since
 * elevation strictly decreases along each edge, so it's guaranteed acyclic and finite). Coastal
 * corners never have a downstream: reaching the sea always terminates a river, even if some
 * neighboring open-water corner happens to read lower. Flow is then accumulated by walking every
 * corner in descending-elevation order and pushing its flow one step downstream — since a
 * corner's own flow is only ever fed by strictly-higher-elevation corners, this single descending
 * pass fully accumulates before forwarding.
 *
 * Requires `attachGraph` (corner graph) and `applyIslandShape` (elevation/tier) to have already
 * run; an empty `diagram.corners` (attachGraph not applied) yields an empty network. */
export function traceRivers(diagram: VoronoiDiagram, config: RiverConfig): RiverNetwork {
  const { sourceCount, sourceElevationQuantile = 0.8, seed = Date.now() } = config;
  const { corners } = diagram;
  if (corners.length === 0 || sourceCount <= 0) return { segments: [] };

  const cellsBySite = new Map(diagram.cells.map((cell) => [cell.site.id, cell]));
  const elevations = corners.map((corner) => cornerElevation(diagram, corner));
  const coastal = corners.map((corner) => isCoastalCorner(corner, cellsBySite));

  const downstream: (number | undefined)[] = corners.map((corner, id) => {
    if (coastal[id]) return undefined;
    let best: number | undefined;
    let bestElevation = elevations[id];
    for (const neighborId of corner.cornerIds) {
      if (elevations[neighborId] < bestElevation) {
        bestElevation = elevations[neighborId];
        best = neighborId;
      }
    }
    return best;
  });

  const inlandElevations = elevations.filter((_, id) => !coastal[id]).sort((a, b) => a - b);
  const eligibleSources = corners.map((_, id) => id).filter((id) => !coastal[id]);

  if (inlandElevations.length === 0 || eligibleSources.length === 0) return { segments: [] };

  const quantileIndex = Math.min(
    inlandElevations.length - 1,
    Math.floor(sourceElevationQuantile * (inlandElevations.length - 1)),
  );
  const elevationThreshold = inlandElevations[quantileIndex];
  const sourcePool = eligibleSources.filter((id) => elevations[id] >= elevationThreshold);
  if (sourcePool.length === 0) return { segments: [] };

  const random = createRandom(seed);
  const sources = pickRandom(sourcePool, sourceCount, random);

  const flow = new Array<number>(corners.length).fill(0);
  for (const sourceId of sources) flow[sourceId] += 1;

  const descendingOrder = corners.map((_, id) => id).sort((a, b) => elevations[b] - elevations[a]);

  const segments: RiverSegment[] = [];
  for (const id of descendingOrder) {
    if (flow[id] <= 0) continue;
    const to = downstream[id];
    if (to === undefined) continue;
    flow[to] += flow[id];
    segments.push({ fromCornerId: id, toCornerId: to, flow: flow[id] });
  }

  return { segments };
}
