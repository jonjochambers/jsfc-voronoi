import type { CircleEvent } from './event-queue.js';
import { parabolaY } from './geometry.js';
import type { Site } from './types.js';

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
   * Deliberately does NOT solve for the breakpoint's x-coordinate and compare against it — that
   * quadratic generally has two roots (see `geometry.ts`), and picking the right one by formula
   * turned out to be unreliable in several configurations. Walking left to right and directly
   * comparing parabola *values* at the query `x` itself sidesteps that ambiguity entirely: no
   * equation-solving, just "which of these two sites is lower right here," which is the direct
   * definition of which arc is visible. */
  findArcAbove(x: number, directrixY: number): Arc {
    if (!this.head) {
      throw new Error('cannot search an empty beachline');
    }
    let arc = this.head;
    while (
      arc.next &&
      parabolaY(arc.site, directrixY, x) > parabolaY(arc.next.site, directrixY, x)
    ) {
      arc = arc.next;
    }
    return arc;
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
