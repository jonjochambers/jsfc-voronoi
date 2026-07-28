import type { CircleEvent } from './event-queue.js';
import { breakpointX, parabolaY } from './geometry.js';
import type { Site } from './types.js';

// How close two arcs' parabola values must be, relative to the map scale, to be considered
// "tied" for findArcAbove's purposes — see that function's doc comment.
const TIE_EPSILON = 1e-6;

/** A node on the beachline — a doubly-linked list of arcs (parabola pieces), left to right.
 *
 * A balanced-BST beachline gives O(log n) arc lookup vs. this list's O(n) scan, but at this
 * project's capped point counts (see sizing.ts) the O(n²) worst case is comfortably fast
 * client-side, and a plain linked list is far less bug-prone than augmenting a self-balancing
 * tree with live parabola breakpoints — the right tradeoff for correctness here. */
export interface Arc {
  site: Site;
  prev: Arc | null;
  next: Arc | null;
  circleEvent: CircleEvent | null;
}

export class Beachline {
  head: Arc | null = null;

  isEmpty(): boolean {
    return this.head === null;
  }

  /** Insert the very first arc (beachline starts empty). */
  insertFirst(site: Site): Arc {
    const arc: Arc = { site, prev: null, next: null, circleEvent: null };
    this.head = arc;
    return arc;
  }

  /** The arc whose parabola sits directly above `x` at the current sweep position.
   *
   * By definition, the beachline at any `x` is whichever currently-swept site is closest to
   * `(x, directrixY)` — equivalently, whichever site's parabola gives the *highest* value there
   * (a higher arc means that site is pushing the equidistant-from-directrix boundary further
   * up, i.e. it's geometrically closer). Evaluating every arc's own parabola directly and taking
   * the maximum is a direct implementation of that definition, and doesn't depend on any
   * particular arc's neighbors — which matters here because a single site can legitimately occupy
   * more than one, non-adjacent arc (an earlier arc of that site got split by a later site
   * insertion), and comparing breakpoints *pairwise* between neighbors breaks down in that case:
   * two arcs of the *same* site produce identical pairwise-breakpoint results against a site
   * sandwiched between them regardless of that middle site's actual position, incorrectly reading
   * as "zero width" and walking straight past it. A still-earlier version of this function had a
   * different, related bug — comparing raw values only between *adjacent* pairs while walking,
   * which fails once a query point is past the second of two crossings between just that one pair.
   * Evaluating every arc's value against the true global maximum (not pairwise, not stopping
   * early) has neither failure mode.
   *
   * A tie between two (or more) arcs — which, since two genuinely different sites essentially
   * never land on the exact same value, only really happens between multiple arcs of the *same*
   * site — can't be broken by the value alone; blindly preferring the leftmost or rightmost tied
   * occurrence is wrong in general (each is correct for some configurations and wrong for others).
   * What actually disambiguates it is each tied candidate's *own* immediate neighbors: exactly one
   * of them will have `x` genuinely between its own left and right breakpoints (computed the
   * ordinary pairwise way, which is reliable at this short range — see `breakpointX`'s own doc
   * comment on why that's only trustworthy near the true breakpoint, which this is). */
  findArcAbove(x: number, directrixY: number): Arc {
    const head = this.head;
    if (!head) {
      throw new Error('cannot search an empty beachline');
    }

    let bestValue = Number.NEGATIVE_INFINITY;
    for (let arc: Arc | null = head; arc; arc = arc.next) {
      bestValue = Math.max(bestValue, parabolaY(arc.site, directrixY, x));
    }

    let fallback = head;
    for (let arc: Arc | null = head; arc; arc = arc.next) {
      const value = parabolaY(arc.site, directrixY, x);
      if (value < bestValue - TIE_EPSILON) continue;
      fallback = arc;

      const withinLeft = !arc.prev || x >= breakpointX(arc.prev.site, arc.site, directrixY);
      const withinRight = !arc.next || x <= breakpointX(arc.site, arc.next.site, directrixY);
      if (withinLeft && withinRight) return arc;
    }
    // Shouldn't be reachable for a genuinely valid beachline — every x belongs to exactly one
    // arc's local bounds — but fall back to the last tied-for-max candidate rather than throw.
    return fallback;
  }

  /** Split `arc` around a new site event, inserting `site`'s arc in the middle. Returns the
   * three resulting arcs (the outer two share `arc`'s original site). */
  splitArc(arc: Arc, site: Site): [left: Arc, middle: Arc, right: Arc] {
    const left: Arc = { site: arc.site, prev: arc.prev, next: null, circleEvent: null };
    const middle: Arc = { site, prev: left, next: null, circleEvent: null };
    const right: Arc = { site: arc.site, prev: middle, next: arc.next, circleEvent: null };
    left.next = middle;
    middle.next = right;

    if (arc.prev) arc.prev.next = left;
    else this.head = left;
    if (arc.next) arc.next.prev = right;

    return [left, middle, right];
  }

  /** Remove `arc` (squeezed out by a circle event), reconnecting its former neighbors. */
  removeArc(arc: Arc): void {
    if (arc.prev) arc.prev.next = arc.next;
    else this.head = arc.next;
    if (arc.next) arc.next.prev = arc.prev;
  }

  /** All arcs left to right — used for trace snapshots and final cleanup. */
  toArray(): Arc[] {
    const arcs: Arc[] = [];
    for (let arc = this.head; arc; arc = arc.next) {
      arcs.push(arc);
    }
    return arcs;
  }
}
