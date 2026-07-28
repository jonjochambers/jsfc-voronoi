import type { Point } from './types.js';

// Simultaneous site events (equal y, tie-broken by x) mean two beachline arcs can momentarily
// share the sweep line's exact y. Flooring the focus-to-directrix distance at a tiny epsilon
// avoids a division by zero there — the arc just renders as an extremely narrow spike for that
// one instant rather than NaN/Infinity. Exported so callers evaluating a parabola *away* from its
// own focus (e.g. `fortune.ts`'s new-edge start point) can detect when they're in this floored
// regime themselves: the floored value is only meaningful infinitesimally close to `focus.x` —
// evaluated any real distance away, it explodes to a huge, physically meaningless magnitude (the
// distance-squared term divides by the same tiny floor), which is a numerically different problem
// from the ordinary "which of two roots" ambiguity `breakpointX` handles.
export const MIN_FOCUS_DISTANCE = 1e-6;

/** y-coordinate of the parabola with the given focus and horizontal directrix (`directrixY`,
 * the sweep line), evaluated at `x`. Standard focus/directrix form, rearranged so the vertex
 * sits at `(focus.x, (focus.y + directrixY) / 2)`. `focus.y` must be at or above the directrix
 * (`directrixY >= focus.y`) — only arcs the sweep has already passed are ever on the beachline. */
export function parabolaY(focus: Point, directrixY: number, x: number): number {
  const d = Math.max(directrixY - focus.y, MIN_FOCUS_DISTANCE);
  return (focus.y + directrixY) / 2 - (x - focus.x) ** 2 / (2 * d);
}

/** x-coordinate of the breakpoint between the arc of `left` (currently the left arc on the
 * beachline) and the arc of `right` (currently the right arc), at sweep position `directrixY`.
 *
 * The two parabolas generally cross at two points, and which one is the true left→right
 * breakpoint isn't reliably predictable from a simple comparison of `left.y`/`right.y` alone (an
 * earlier version of this function tried exactly that and was wrong for some configurations) —
 * so instead this checks the defining property directly: `left` must dominate (have the *higher*
 * parabola value — the site whose arc is closer to the sweep line, i.e. geometrically closer to
 * the query point, per `parabolaY`'s own vertex-form derivation) immediately before the returned
 * x, and `right` immediately after. */
export function breakpointX(left: Point, right: Point, directrixY: number): number {
  if (left.y === right.y) {
    return (left.x + right.x) / 2;
  }

  const d1 = Math.max(directrixY - left.y, MIN_FOCUS_DISTANCE);
  const d2 = Math.max(directrixY - right.y, MIN_FOCUS_DISTANCE);

  // Coefficients of a·x² + b·x + c = 0 for parabolaY(left,…) = parabolaY(right,…).
  const a = d2 - d1;
  const b = 2 * (right.x * d1 - left.x * d2);
  const c = d2 * left.x ** 2 - d1 * right.x ** 2 - (left.y - right.y) * d1 * d2;

  const discriminant = Math.max(0, b ** 2 - 4 * a * c);
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const candidates = [(-b + sqrtDiscriminant) / (2 * a), (-b - sqrtDiscriminant) / (2 * a)];

  const gap = Math.abs(candidates[0] - candidates[1]) || 1;
  const probe = Math.max(gap * 1e-4, 1e-6);
  for (const x of candidates) {
    const leftDominatesBefore =
      parabolaY(left, directrixY, x - probe) > parabolaY(right, directrixY, x - probe);
    const rightDominatesAfter =
      parabolaY(right, directrixY, x + probe) > parabolaY(left, directrixY, x + probe);
    if (leftDominatesBefore && rightDominatesAfter) {
      return x;
    }
  }

  // Shouldn't be reachable for a genuinely adjacent left/right pair — fall back to whichever
  // candidate is finite rather than propagate NaN.
  return Number.isFinite(candidates[0]) ? candidates[0] : candidates[1];
}

/** The raw, sorted (ascending) x-roots of the two same-directrix parabolas crossing — i.e. both
 * candidate breakpoints between `a` and `b`, without picking one. Used where the caller has
 * other context (e.g. which of two sibling edges should get the smaller vs. larger root) to
 * disambiguate more reliably than a local dominance check can — see `breakpointX`'s docs for why
 * that check isn't trustworthy far from where a breakpoint was established. */
export function breakpointCandidates(a: Point, b: Point, directrixY: number): [number, number] {
  if (a.y === b.y) {
    const mid = (a.x + b.x) / 2;
    return [mid, mid];
  }

  const d1 = Math.max(directrixY - a.y, MIN_FOCUS_DISTANCE);
  const d2 = Math.max(directrixY - b.y, MIN_FOCUS_DISTANCE);

  const coeffA = d2 - d1;
  const coeffB = 2 * (b.x * d1 - a.x * d2);
  const coeffC = d2 * a.x ** 2 - d1 * b.x ** 2 - (a.y - b.y) * d1 * d2;

  const discriminant = Math.max(0, coeffB ** 2 - 4 * coeffA * coeffC);
  const sqrtDiscriminant = Math.sqrt(discriminant);
  const x1 = (-coeffB + sqrtDiscriminant) / (2 * coeffA);
  const x2 = (-coeffB - sqrtDiscriminant) / (2 * coeffA);

  return x1 <= x2 ? [x1, x2] : [x2, x1];
}

export interface Circumcircle {
  center: Point;
  radius: number;
}

/** Circumcircle of three points, or `null` if they're collinear (no finite circumcenter). */
export function circumcircle(a: Point, b: Point, c: Point): Circumcircle | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) {
    return null;
  }

  const aSq = a.x ** 2 + a.y ** 2;
  const bSq = b.x ** 2 + b.y ** 2;
  const cSq = c.x ** 2 + c.y ** 2;

  const ux = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d;
  const uy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d;

  const center = { x: ux, y: uy };
  const radius = Math.hypot(center.x - a.x, center.y - a.y);
  return { center, radius };
}
