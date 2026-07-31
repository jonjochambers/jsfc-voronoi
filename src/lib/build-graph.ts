import type { Point, VoronoiCell, VoronoiCorner, VoronoiDiagram } from './types.js';

const DEDUPE_EPSILON = 1e-6;

function findOrAddCorner(corners: VoronoiCorner[], points: Point[], point: Point): number {
  for (let i = 0; i < points.length; i++) {
    if (Math.hypot(points[i].x - point.x, points[i].y - point.y) < DEDUPE_EPSILON) {
      return i;
    }
  }
  const id = corners.length;
  points.push(point);
  corners.push({ id, point, cellIds: [], cornerIds: [] });
  return id;
}

function addUnique(list: number[], value: number): void {
  if (!list.includes(value)) list.push(value);
}

function getOrCreate<K>(map: Map<K, number[]>, key: K): number[] {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  return list;
}

/** Derives the shared corner/adjacency graph purely from each cell's already-built `polygon` —
 * works identically regardless of which algorithm produced the cells, since brute-force never
 * populates `VoronoiDiagram.edges` the way Fortune's/Bowyer-Watson's do, so relying on `edges`
 * here would silently miss it.
 *
 * Two cells count as neighbors only if they share a real interior edge (two consecutive polygon
 * corners in common) — a point shared only along the bounding-box perimeter belongs to just one
 * cell and doesn't make it "adjacent" to whatever else touches that same box corner. */
export function attachGraph(diagram: VoronoiDiagram): VoronoiDiagram {
  const corners: VoronoiCorner[] = [];
  const cornerPoints: Point[] = [];

  const cellCornerIds = diagram.cells.map((cell) =>
    cell.polygon.map((point) => findOrAddCorner(corners, cornerPoints, point)),
  );

  // Undirected edge key "min:max" of corner ids -> site ids of every cell whose polygon
  // boundary includes that edge.
  const edgeOwners = new Map<string, number[]>();

  diagram.cells.forEach((cell, cellIndex) => {
    const ids = cellCornerIds[cellIndex];
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      addUnique(corners[a].cellIds, cell.site.id);
      if (a === b) continue; // degenerate single-point polygon — nothing to connect

      addUnique(corners[a].cornerIds, b);
      addUnique(corners[b].cornerIds, a);

      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      addUnique(getOrCreate(edgeOwners, key), cell.site.id);
    }
  });

  const neighborsBySite = new Map<number, number[]>();
  for (const owners of edgeOwners.values()) {
    if (owners.length !== 2) continue; // boundary-only edge (1) or a degenerate overlap (>2)
    const [siteA, siteB] = owners;
    addUnique(getOrCreate(neighborsBySite, siteA), siteB);
    addUnique(getOrCreate(neighborsBySite, siteB), siteA);
  }

  const cells: VoronoiCell[] = diagram.cells.map((cell, cellIndex) => ({
    ...cell,
    cornerIds: cellCornerIds[cellIndex],
    neighborIds: neighborsBySite.get(cell.site.id) ?? [],
  }));

  return { ...diagram, cells, corners };
}
