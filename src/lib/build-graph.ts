import type { Point, VoronoiCell, VoronoiCorner, VoronoiDiagram } from './types.js';

const DEDUPE_EPSILON = 1e-6;

// A spatial hash bucket, several orders of magnitude bigger than DEDUPE_EPSILON so a
// boundary-straddling near-duplicate is still guaranteed to land in one of the 3x3 buckets
// checked around it, but small enough to keep each bucket's candidate list short even at
// thousands of corners. Turns findOrAddCorner's dedup check from an O(n) scan of every corner
// seen so far into an O(1)-average lookup — previously the dominant cost of attachGraph (and, by
// extension, of relaxSites, which reruns attachGraph once per iteration).
const GRID_CELL_SIZE = 1e-3;

function bucketKeyOf(point: Point): string {
  return `${Math.floor(point.x / GRID_CELL_SIZE)}:${Math.floor(point.y / GRID_CELL_SIZE)}`;
}

function findOrAddCorner(
  corners: VoronoiCorner[],
  points: Point[],
  grid: Map<string, number[]>,
  point: Point,
): number {
  const cellX = Math.floor(point.x / GRID_CELL_SIZE);
  const cellY = Math.floor(point.y / GRID_CELL_SIZE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = grid.get(`${cellX + dx}:${cellY + dy}`);
      if (!bucket) continue;
      for (const id of bucket) {
        if (Math.hypot(points[id].x - point.x, points[id].y - point.y) < DEDUPE_EPSILON) {
          return id;
        }
      }
    }
  }
  const id = corners.length;
  points.push(point);
  corners.push({ id, point, cellIds: [], cornerIds: [] });
  getOrCreate(grid, bucketKeyOf(point)).push(id);
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
  const cornerGrid = new Map<string, number[]>();

  const cellCornerIds = diagram.cells.map((cell) =>
    cell.polygon.map((point) => findOrAddCorner(corners, cornerPoints, cornerGrid, point)),
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
