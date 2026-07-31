import { buildCells } from './build-cells.js';
import { clipSegmentToBox } from './clip.js';
import { circumcircle } from './geometry.js';
import { clipPolygonByHalfPlane } from './half-plane-clip.js';
import type { Point, Site, VoronoiBounds, VoronoiDiagram, VoronoiEdge } from './types.js';

/** One recorded step of the incremental-Delaunay construction, in the order it actually
 * happened. The interesting moments here are a growing/re-triangulating mesh, not a sweep or
 * whole-cell reveals — visually distinct from both `fortune.ts` and `brute-force.ts`. */
export type BowyerWatsonTraceStep =
  | { type: 'pointInserted'; site: Site }
  | { type: 'triangleAdded'; id: number; vertices: [Point, Point, Point] }
  | { type: 'triangleRemoved'; id: number }
  | { type: 'complete'; diagram: VoronoiDiagram };

interface Vertex extends Point {
  id: number;
}

interface Triangle {
  id: number;
  vertices: [Vertex, Vertex, Vertex];
  circumcenter: Point;
  circumradiusSq: number;
}

// Two real input sites landing on (near-)identical coordinates can't both be distinct
// triangulation vertices — treated the same degenerate way `fortune.ts` and `brute-force.ts`
// handle duplicate coordinates: skip inserting a second vertex, let `buildCells` give the
// duplicate an empty polygon rather than crash or produce NaN.
const DUPLICATE_EPSILON = 1e-6;

function edgeKey(a: Vertex, b: Vertex): string {
  return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
}

function triangleEdges(t: Triangle): [Vertex, Vertex][] {
  const [a, b, c] = t.vertices;
  return [
    [a, b],
    [b, c],
    [c, a],
  ];
}

function inCircumcircle(t: Triangle, p: Point): boolean {
  const dx = p.x - t.circumcenter.x;
  const dy = p.y - t.circumcenter.y;
  // Strict, with a small tolerance: a point exactly *on* a circumcircle (the classic co-circular
  // case) is treated as outside, so those configurations still terminate with *a* valid
  // triangulation, just not a uniquely-determined one — the point that geometrically falls
  // inside a triangle is always strictly inside that triangle's circumcircle too (a point
  // interior to a chord is strictly inside the circle it subtends), so termination doesn't
  // depend on this tolerance either way.
  return dx * dx + dy * dy < t.circumradiusSq - 1e-9;
}

/** Classic incremental Delaunay triangulation (Bowyer-Watson), then dualized into a Voronoi
 * diagram: each Delaunay edge shared by two triangles becomes a Voronoi edge between their
 * circumcenters; a hull edge (only one adjacent triangle) becomes a ray from that circumcenter,
 * perpendicular to the hull edge and pointing away from the triangle's third vertex — direction
 * is unambiguous by construction here, unlike Fortune's breakpoint-quadratic root selection
 * (the class of bug `fortune.ts` still has). Only the incircle test (itself just a
 * circumcircle-vs-point comparison) drives every decision. */
export function runBowyerWatson(
  sites: readonly Site[],
  bounds: VoronoiBounds,
): { diagram: VoronoiDiagram; trace: BowyerWatsonTraceStep[] } {
  const trace: BowyerWatsonTraceStep[] = [];

  if (sites.length < 3) {
    // Fewer than 3 real sites can't form a single Delaunay triangle without at least one
    // super-triangle vertex, so the "discard every triangle touching a super vertex" step below
    // would discard everything, leaving zero edges. This never arises through the app itself
    // (MIN_POINTS_FLOOR is 16) — it only matters for this package's own small-n edge-case
    // coverage — so just build cells directly via the same half-plane clipping `brute-force.ts`
    // uses, rather than complicating the main Delaunay/dual logic for a case that can't occur in
    // practice.
    for (const site of sites) trace.push({ type: 'pointInserted', site });
    const boxPolygon: Point[] = [
      { x: 0, y: 0 },
      { x: bounds.width, y: 0 },
      { x: bounds.width, y: bounds.height },
      { x: 0, y: bounds.height },
    ];
    const cells = sites.map((site) => {
      let polygon = boxPolygon;
      for (const other of sites) {
        if (other.id === site.id) continue;
        const midpoint = { x: (site.x + other.x) / 2, y: (site.y + other.y) / 2 };
        const towardSite = { x: site.x - other.x, y: site.y - other.y };
        polygon = clipPolygonByHalfPlane(polygon, midpoint, towardSite);
        if (polygon.length === 0) break;
      }
      return { site, polygon };
    });
    const diagram: VoronoiDiagram = { sites: [...sites], edges: [], cells, bounds, corners: [] };
    trace.push({ type: 'complete', diagram });
    return { diagram, trace };
  }

  let nextTriangleId = 0;
  let nextSuperId = -1;

  const margin = 20 * (bounds.width + bounds.height + 1);
  const superVertices: [Vertex, Vertex, Vertex] = [
    { id: nextSuperId--, x: -margin, y: -margin },
    { id: nextSuperId--, x: bounds.width + margin, y: -margin },
    { id: nextSuperId--, x: bounds.width / 2, y: bounds.height + margin },
  ];

  function addTriangle(a: Vertex, b: Vertex, c: Vertex): Triangle | null {
    const circle = circumcircle(a, b, c);
    if (!circle) return null; // collinear triple — degenerate, not a real triangle
    const triangle: Triangle = {
      id: nextTriangleId++,
      vertices: [a, b, c],
      circumcenter: circle.center,
      circumradiusSq: circle.radius ** 2,
    };
    trace.push({
      type: 'triangleAdded',
      id: triangle.id,
      vertices: [a, b, c].map((v) => ({ x: v.x, y: v.y })) as [Point, Point, Point],
    });
    return triangle;
  }

  const triangles = new Map<number, Triangle>();
  const seed = addTriangle(...superVertices);
  if (seed) triangles.set(seed.id, seed);

  const insertedVertices: Vertex[] = [...superVertices];

  for (const site of sites) {
    trace.push({ type: 'pointInserted', site });

    const isDuplicate = insertedVertices.some(
      (v) => Math.hypot(v.x - site.x, v.y - site.y) < DUPLICATE_EPSILON,
    );
    if (isDuplicate) continue;

    const badTriangles: Triangle[] = [];
    for (const triangle of triangles.values()) {
      if (inCircumcircle(triangle, site)) badTriangles.push(triangle);
    }

    const edgeCounts = new Map<string, { edge: [Vertex, Vertex]; count: number }>();
    for (const triangle of badTriangles) {
      for (const edge of triangleEdges(triangle)) {
        const key = edgeKey(edge[0], edge[1]);
        const existing = edgeCounts.get(key);
        if (existing) existing.count++;
        else edgeCounts.set(key, { edge, count: 1 });
      }
    }
    // A boundary edge of the "hole" left by the bad triangles is one not shared between two of
    // them — i.e. it borders a still-good triangle (or, for the very first insertion, nothing).
    const boundary = [...edgeCounts.values()].filter((e) => e.count === 1).map((e) => e.edge);

    for (const triangle of badTriangles) {
      triangles.delete(triangle.id);
      trace.push({ type: 'triangleRemoved', id: triangle.id });
    }

    for (const [u, v] of boundary) {
      const created = addTriangle(u, v, site);
      if (created) triangles.set(created.id, created);
    }

    insertedVertices.push(site);
  }

  // Discard triangles touching a super-triangle vertex — they were only scaffolding to give the
  // very first real sites something to insert into.
  for (const triangle of [...triangles.values()]) {
    if (triangle.vertices.some((v) => v.id < 0)) {
      triangles.delete(triangle.id);
      trace.push({ type: 'triangleRemoved', id: triangle.id });
    }
  }

  const remaining = [...triangles.values()];
  const edgeAdjacency = new Map<string, { edge: [Vertex, Vertex]; triangles: Triangle[] }>();
  for (const triangle of remaining) {
    for (const edge of triangleEdges(triangle)) {
      const key = edgeKey(edge[0], edge[1]);
      const existing = edgeAdjacency.get(key);
      if (existing) existing.triangles.push(triangle);
      else edgeAdjacency.set(key, { edge, triangles: [triangle] });
    }
  }

  const edges: VoronoiEdge[] = [];
  let nextEdgeId = 0;
  const farScale = 10 * (bounds.width + bounds.height + 1);

  for (const { edge, triangles: adjacent } of edgeAdjacency.values()) {
    const [u, v] = edge;

    if (adjacent.length === 2) {
      const clipped = clipSegmentToBox(adjacent[0].circumcenter, adjacent[1].circumcenter, bounds);
      if (!clipped) continue;
      edges.push({
        id: nextEdgeId++,
        siteLeft: u.id,
        siteRight: v.id,
        start: clipped[0],
        end: clipped[1],
      });
      continue;
    }

    const triangle = adjacent[0];
    const third = triangle.vertices.find((vertex) => vertex.id !== u.id && vertex.id !== v.id);
    if (!third) continue;

    const mid = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
    let perp = { x: -(v.y - u.y), y: v.x - u.x };
    const len = Math.hypot(perp.x, perp.y) || 1;
    perp = { x: perp.x / len, y: perp.y / len };
    const towardThird = (third.x - mid.x) * perp.x + (third.y - mid.y) * perp.y;
    if (towardThird > 0) perp = { x: -perp.x, y: -perp.y };

    const far = {
      x: triangle.circumcenter.x + perp.x * farScale,
      y: triangle.circumcenter.y + perp.y * farScale,
    };
    const clipped = clipSegmentToBox(triangle.circumcenter, far, bounds);
    if (!clipped) continue;
    edges.push({
      id: nextEdgeId++,
      siteLeft: u.id,
      siteRight: v.id,
      start: clipped[0],
      end: clipped[1],
    });
  }

  const cells = buildCells(sites, edges, bounds);
  const diagram: VoronoiDiagram = { sites: [...sites], edges, cells, bounds, corners: [] };
  trace.push({ type: 'complete', diagram });

  return { diagram, trace };
}
