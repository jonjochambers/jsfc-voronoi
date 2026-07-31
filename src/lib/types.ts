export interface Point {
  x: number;
  y: number;
}

/** An input site (seed point) for the Voronoi diagram. `id` indexes into the sites array. */
export interface Site extends Point {
  id: number;
}

export interface VoronoiEdge {
  id: number;
  siteLeft: number;
  siteRight: number;
  start: Point;
  end: Point;
}

/** Named elevation bands, ascending. Shared with moisture/biome lookup (Phase 1B) and rendering
 * (Phase 1C) — this is the vocabulary those depend on, not just an `island.ts` implementation
 * detail. */
export type ElevationTier = 'OCEAN' | 'COAST' | 'PLAIN' | 'HILL' | 'MOUNTAIN';

/** A cell's `polygon` is angularly sorted around `site` and closed (no repeated first/last point). */
export interface VoronoiCell {
  site: Site;
  polygon: Point[];
  /** Continuous height in [0, 1], populated by `applyIslandShape` — absent until then. */
  elevation?: number;
  /** `elevation` bucketed into a named band, populated alongside it. */
  tier?: ElevationTier;
  /** Ids into `VoronoiDiagram.corners`, one per `polygon` point at the same index (closed loop,
   * populated by `attachGraph` — absent until then, same optionality as `elevation`). */
  cornerIds?: number[];
  /** Site ids of cells sharing a real interior edge (two consecutive corners) with this one —
   * populated by `attachGraph`. Points shared only along the bounding-box perimeter don't count. */
  neighborIds?: number[];
}

/** A deduplicated Voronoi vertex shared between however many cells/edges actually meet there —
 * `polygon: Point[]` alone repeats each vertex once per bordering cell with no shared identity,
 * which rivers (steepest-descent corner-to-corner) and noisy edges (consistent per-edge
 * displacement between the two cells that share it) both need. Populated by `attachGraph`. */
export interface VoronoiCorner {
  id: number;
  point: Point;
  /** Site ids of every cell whose polygon includes this corner. */
  cellIds: number[];
  /** Ids of other corners directly connected to this one by a shared polygon edge. */
  cornerIds: number[];
}

export interface VoronoiBounds {
  width: number;
  height: number;
}

export interface VoronoiDiagram {
  sites: Site[];
  edges: VoronoiEdge[];
  cells: VoronoiCell[];
  bounds: VoronoiBounds;
  /** Populated by `attachGraph` — empty until then. */
  corners: VoronoiCorner[];
}
