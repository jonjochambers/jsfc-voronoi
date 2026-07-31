import type { AlgorithmId } from './algorithms.js';
import { runAlgorithm } from './algorithms.js';
import { buildCells } from './build-cells.js';
import { attachGraph } from './build-graph.js';
import { generateRandomSites } from './sites.js';
import type { Site, VoronoiEdge } from './types.js';

// Same fixture as build-cells.spec.ts: two sites symmetric about x=50 in a 100x100 box, so the
// expected corners/neighbors are hand-verifiable.
const SITE_A: Site = { id: 0, x: 25, y: 50 };
const SITE_B: Site = { id: 1, x: 75, y: 50 };
const BOUNDS = { width: 100, height: 100 };
const BISECTOR: VoronoiEdge = {
  id: 0,
  siteLeft: SITE_A.id,
  siteRight: SITE_B.id,
  start: { x: 50, y: 0 },
  end: { x: 50, y: 100 },
};

describe('attachGraph', () => {
  it('dedupes corners and wires up neighbor/corner adjacency for a hand-verifiable split', () => {
    const cells = buildCells([SITE_A, SITE_B], [BISECTOR], BOUNDS);
    const diagram = attachGraph({
      sites: [SITE_A, SITE_B],
      edges: [BISECTOR],
      cells,
      bounds: BOUNDS,
      corners: [],
    });

    // 4 box corners + 2 bisector endpoints, each cell touching exactly 4 of them.
    expect(diagram.corners).toHaveLength(6);

    const cellA = diagram.cells.find((cell) => cell.site.id === SITE_A.id);
    const cellB = diagram.cells.find((cell) => cell.site.id === SITE_B.id);
    expect(cellA?.neighborIds).toEqual([SITE_B.id]);
    expect(cellB?.neighborIds).toEqual([SITE_A.id]);

    // The two bisector-endpoint corners are shared by both cells and connected to each other.
    const shared = diagram.corners.filter(
      (corner) => corner.point.x === 50 && (corner.point.y === 0 || corner.point.y === 100),
    );
    expect(shared).toHaveLength(2);
    for (const corner of shared) {
      expect(corner.cellIds.sort()).toEqual([SITE_A.id, SITE_B.id]);
    }
    const [top, bottom] = shared.sort((a, b) => a.point.y - b.point.y);
    expect(top.cornerIds).toContain(bottom.id);
    expect(bottom.cornerIds).toContain(top.id);

    // Box corners belong to exactly one cell each and aren't "neighbors" of anything through them.
    const boxCorner = diagram.corners.find(
      (corner) => corner.point.x === 0 && corner.point.y === 0,
    );
    expect(boxCorner?.cellIds).toEqual([SITE_A.id]);
  });

  it('gives every cell cornerIds matching its polygon length, 1:1 in the same order', () => {
    const sites = generateRandomSites(400, 400, 30, 7);
    const { diagram } = runAlgorithm('fortune', sites, { width: 400, height: 400 });
    for (const cell of diagram.cells) {
      expect(cell.cornerIds).toHaveLength(cell.polygon.length);
      // toBeCloseTo, not toEqual: two cells sharing a corner may each land on it via a
      // fractionally different float (that's exactly why attachGraph dedupes with an epsilon
      // rather than exact equality), so an ULP-level mismatch here is expected, not a bug.
      cell.cornerIds?.forEach((id, i) => {
        expect(diagram.corners[id].point.x).toBeCloseTo(cell.polygon[i].x, 6);
        expect(diagram.corners[id].point.y).toBeCloseTo(cell.polygon[i].y, 6);
      });
    }
  });

  const algorithms: AlgorithmId[] = ['fortune', 'brute-force', 'bowyer-watson'];

  it.each(algorithms)(
    'produces a symmetric neighbor graph and self-consistent corners for %s across randomized configurations',
    (algorithm) => {
      for (let seed = 0; seed < 25; seed++) {
        const bounds = { width: 300, height: 300 };
        const sites = generateRandomSites(bounds.width, bounds.height, 20, seed);
        const { diagram } = runAlgorithm(algorithm, sites, bounds);

        const cellById = new Map(diagram.cells.map((cell) => [cell.site.id, cell]));
        for (const cell of diagram.cells) {
          for (const neighborId of cell.neighborIds ?? []) {
            // Neighbor relation must be symmetric: if A lists B, B lists A.
            expect(cellById.get(neighborId)?.neighborIds).toContain(cell.site.id);
          }
        }

        for (const corner of diagram.corners) {
          // Every cell a corner claims to touch must actually have that corner in its cornerIds.
          for (const cellSiteId of corner.cellIds) {
            expect(cellById.get(cellSiteId)?.cornerIds).toContain(corner.id);
          }
          // Corner adjacency is symmetric too.
          for (const neighborCornerId of corner.cornerIds) {
            expect(diagram.corners[neighborCornerId].cornerIds).toContain(corner.id);
          }
        }
      }
    },
  );
});
