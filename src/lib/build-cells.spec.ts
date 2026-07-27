import { buildCells } from './build-cells.js';
import type { Site, VoronoiEdge } from './types.js';

// Two sites symmetric about the vertical line x=50 in a 100x100 box: their perpendicular
// bisector is exactly that vertical line, so the expected cells are the left/right halves of
// the box — hand-verifiable, including which box corners belong to which site.
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

function signedArea(polygon: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

describe('buildCells', () => {
  it('inserts the correct bounding-box corners for a boundary-touching cell', () => {
    const cells = buildCells([SITE_A, SITE_B], [BISECTOR], BOUNDS);
    const cellA = cells.find((cell) => cell.site.id === SITE_A.id);
    const cellB = cells.find((cell) => cell.site.id === SITE_B.id);

    expect(cellA?.polygon).toHaveLength(4);
    expect(cellA?.polygon).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ]),
    );

    expect(cellB?.polygon).toHaveLength(4);
    expect(cellB?.polygon).toEqual(
      expect.arrayContaining([
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ]),
    );
  });

  it('produces consistently wound (non-self-intersecting, single-signed) polygons', () => {
    const cells = buildCells([SITE_A, SITE_B], [BISECTOR], BOUNDS);
    const areas = cells.map((cell) => signedArea(cell.polygon));
    for (const area of areas) {
      expect(Math.sign(area)).toBe(Math.sign(areas[0]));
    }
    // Each half of a 100x100 box is 5000 px² — confirms both winding AND correct shape.
    for (const area of areas) {
      expect(Math.abs(area)).toBeCloseTo(5000, 6);
    }
  });

  it('has every edge endpoint present in both of its bordering cells (adjacency consistency)', () => {
    const cells = buildCells([SITE_A, SITE_B], [BISECTOR], BOUNDS);
    const cellA = cells.find((cell) => cell.site.id === BISECTOR.siteLeft);
    const cellB = cells.find((cell) => cell.site.id === BISECTOR.siteRight);

    for (const point of [BISECTOR.start, BISECTOR.end]) {
      expect(cellA?.polygon).toContainEqual(point);
      expect(cellB?.polygon).toContainEqual(point);
    }
  });

  it('gives every site a cell even with a single site and no edges (covers the whole box)', () => {
    const cells = buildCells([SITE_A], [], BOUNDS);
    expect(cells).toHaveLength(1);
    expect(Math.abs(signedArea(cells[0].polygon))).toBeCloseTo(BOUNDS.width * BOUNDS.height, 6);
  });
});
