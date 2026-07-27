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

/** A cell's `polygon` is angularly sorted around `site` and closed (no repeated first/last point). */
export interface VoronoiCell {
  site: Site;
  polygon: Point[];
  isLand?: boolean;
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
}
