import { breakpointX, circumcircle, parabolaY } from './geometry.js';

describe('parabolaY', () => {
  it('has its vertex at the focus x, midway between focus and directrix', () => {
    const focus = { x: 5, y: 2 };
    const directrixY = 10;
    expect(parabolaY(focus, directrixY, focus.x)).toBeCloseTo((focus.y + directrixY) / 2, 10);
  });

  it('increases in y (moves away from the sweep line, toward the focus) away from the vertex', () => {
    const focus = { x: 0, y: 0 };
    const directrixY = 10;
    const atVertex = parabolaY(focus, directrixY, 0);
    const offVertex = parabolaY(focus, directrixY, 3);
    expect(offVertex).toBeLessThan(atVertex);
  });
});

describe('breakpointX', () => {
  it('is the midpoint when both foci share the same y', () => {
    expect(breakpointX({ x: 0, y: 4 }, { x: 10, y: 4 }, 20)).toBeCloseTo(5, 10);
  });

  it('matches a hand-computed asymmetric case (site closer to the sweep on the left)', () => {
    // left focus (10,5) is closer to the directrix (y=20) than right focus (0,0); solving
    // parabolaY(left,x) = parabolaY(right,x) by hand gives two roots, ≈1.2702 and ≈78.7298.
    // `left` must have the *higher* value immediately before the root (it's the arc currently
    // visible on the beachline there — the geometrically closer site) and `right` immediately
    // after; that's the larger root here, ≈78.7298, not the smaller one.
    const x = breakpointX({ x: 10, y: 5 }, { x: 0, y: 0 }, 20);
    expect(x).toBeCloseTo(78.7298, 1);
  });

  it('matches the mirrored hand-computed case (the other root, swapping left/right)', () => {
    const x = breakpointX({ x: 0, y: 0 }, { x: 10, y: 5 }, 20);
    expect(x).toBeCloseTo(1.2702, 2);
  });
});

describe('circumcircle', () => {
  it('finds the circumcenter/radius of a right triangle (midpoint/half of the hypotenuse)', () => {
    const result = circumcircle({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 });
    expect(result).not.toBeNull();
    expect(result?.center.x).toBeCloseTo(2, 10);
    expect(result?.center.y).toBeCloseTo(1.5, 10);
    expect(result?.radius).toBeCloseTo(2.5, 10);
  });

  it('returns null for collinear points', () => {
    expect(circumcircle({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });
});
