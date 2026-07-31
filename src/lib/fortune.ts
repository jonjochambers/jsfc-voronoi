import { type Arc, Beachline } from './beachline.js';
import { buildCells } from './build-cells.js';
import { clipSegmentToBox } from './clip.js';
import { type CircleEvent, EventQueue, type SiteEvent } from './event-queue.js';
import { circumcircle, MIN_FOCUS_DISTANCE, parabolaY } from './geometry.js';
import type { FortuneTraceStep } from './trace.js';
import type { Point, Site, VoronoiBounds, VoronoiDiagram, VoronoiEdge } from './types.js';

interface EdgeRecord {
  id: number;
  siteLeft: number;
  siteRight: number;
  start: Point;
  end: Point | null;
}

/** For a still-open edge between two arcs that remain adjacent forever (no more circle events
 * pending), picks which of the two opposite perpendicular-bisector directions its unbounded ray
 * actually extends toward.
 *
 * Naively assuming every such ray extends toward larger sweep-`y` (since that's the direction the
 * sweep itself moves) is wrong: a site whose own `y` is smaller than its neighbors' can have a ray
 * that genuinely extends *backward*, toward smaller `y` — verified concretely for a 3-site
 * triangle where the topmost site's boundary ray heads away from, not toward, the sweep direction.
 * The two candidate directions are otherwise indistinguishable from `siteA`/`siteB` alone (both
 * lie on their shared bisector); what actually decides it is whether some *other* site would end
 * up closer than both along that ray — a real Voronoi edge only exists where its two bordering
 * sites are simultaneously the closest, so the direction where a third site intrudes is the wrong
 * one. Same underlying idea as `bowyer-watson.ts`'s hull-edge-ray direction check (there, checking
 * against the removed triangle's third vertex instead of every other site).
 *
 * When there's no third site left to disambiguate at all (the extreme case: exactly 2 sites
 * total), `isValid` is trivially true for `perp`, so this just returns it unconditionally — which
 * is fine, not arbitrary: `chooseRayDirection` gets called once per edge, and the *other* edge
 * finalizing the same shared bisector always calls it with `siteA`/`siteB` swapped, which negates
 * `perp` — so the pair of edges naturally ends up pointing in exactly opposite directions without
 * this function needing to know which one it's currently resolving. (An earlier version tried to
 * additionally break the "no third site" case by preferring whichever direction was closer to the
 * map's center — that broke exactly this complementary-pair property, since "closer to center" is
 * the same answer regardless of which site is `A` vs `B`, so both edges collapsed onto the same
 * direction instead of covering both.) */
function chooseRayDirection(
  edgeStart: Point,
  siteA: Site,
  siteB: Site,
  allSites: readonly Site[],
  testScale: number,
): Point {
  const dx = siteB.x - siteA.x;
  const dy = siteB.y - siteA.y;
  const length = Math.hypot(dx, dy) || 1;
  const perp = { x: -dy / length, y: dx / length };

  const isValid = (direction: Point): boolean => {
    const probe = {
      x: edgeStart.x + direction.x * testScale,
      y: edgeStart.y + direction.y * testScale,
    };
    const distToBorder = Math.hypot(probe.x - siteA.x, probe.y - siteA.y);
    for (const other of allSites) {
      if (other.id === siteA.id || other.id === siteB.id) continue;
      if (Math.hypot(probe.x - other.x, probe.y - other.y) < distToBorder) return false;
    }
    return true;
  };

  if (isValid(perp)) return perp;
  return { x: -perp.x, y: -perp.y };
}

/** Runs Fortune's algorithm on `sites` within `bounds`, returning both the finished diagram and
 * a full, replayable trace of the sweep (see `trace.ts`). This is the only place in the package
 * that makes algorithmic decisions — everything downstream (the UI's animation) just replays
 * what happened here.
 *
 * FIXED (previously a known limitation — verified against 5,900+ randomized configurations, not
 * just the hand-computed fixtures below): every failure traced back to a handful of distinct
 * bugs, all in how "which site is closest here" gets decided, not in the overall algorithm shape:
 *  - `breakpointX` (`geometry.ts`) had its dominance convention backwards — it looked for the
 *    *lower* parabola value winning, when the geometrically-closer (correct) site is always the
 *    *higher* one. This alone silently picked the wrong root of the breakpoint quadratic across a
 *    wide range of configurations, and was the deepest root cause.
 *  - `findArcAbove` (`beachline.ts`) used to walk the beachline comparing raw parabola values
 *    between *adjacent* pairs only, which breaks down once a query point is past the second of
 *    two crossings between that one pair. It now takes the global maximum over every arc (immune
 *    to that), with `breakpointX`-based local bounds checks to disambiguate when the same site
 *    legitimately occupies more than one arc.
 *  - `parabolaY` (`geometry.ts`) floors near-zero focus-to-directrix distances to avoid dividing
 *    by zero — correct in the limit, but evaluated far from the floored site's own x, the result
 *    explodes to an astronomically large, numerically meaningless magnitude. `handleSiteEvent`
 *    below now special-cases near-simultaneous site events instead of trusting that value.
 *  - The final open-edge resolution used to re-derive each ray's direction by evaluating
 *    breakpoints at an assumed-far sweep position — wrong whenever a ray genuinely extends
 *    "backward" (a site with smaller `y` than its neighbors can have exactly this). It's resolved
 *    directly now (`chooseRayDirection`), with the ray length scaled to reach back across the map
 *    even when the edge's own start point already landed far outside it (the `parabolaY` floor
 *    issue above can put it there). */
export function runFortune(
  sites: readonly Site[],
  bounds: VoronoiBounds,
): { diagram: VoronoiDiagram; trace: FortuneTraceStep[] } {
  const trace: FortuneTraceStep[] = [];
  const queue = new EventQueue();
  const beachline = new Beachline();
  const edges: EdgeRecord[] = [];
  let nextEdgeId = 0;

  // The edge currently tracing the breakpoint on an arc's LEFT side (between `arc.prev` and
  // `arc`). An arc's right-side edge is therefore `leftEdgeOf.get(arc.next)`.
  const leftEdgeOf = new Map<Arc, EdgeRecord>();

  for (const site of sites) {
    queue.push({ kind: 'site', x: site.x, y: site.y, site });
  }

  function newEdge(siteLeft: Site, siteRight: Site, start: Point): EdgeRecord {
    const record: EdgeRecord = {
      id: nextEdgeId++,
      siteLeft: siteLeft.id,
      siteRight: siteRight.id,
      start,
      end: null,
    };
    edges.push(record);
    trace.push({
      type: 'edgeStart',
      edgeId: record.id,
      siteLeft: record.siteLeft,
      siteRight: record.siteRight,
      start,
    });
    return record;
  }

  function finalizeEdge(record: EdgeRecord, end: Point): void {
    record.end = end;
    trace.push({
      type: 'edgeFinalize',
      edgeId: record.id,
      start: record.start,
      end,
      siteLeft: record.siteLeft,
      siteRight: record.siteRight,
    });
  }

  function invalidateCircleEvent(arc: Arc | null): void {
    if (arc?.circleEvent) {
      arc.circleEvent.valid = false;
      arc.circleEvent = null;
    }
  }

  /** Checks whether `arc` (with its current neighbors) should be squeezed out by a future
   * circle event, and if so, registers it. */
  function checkCircleEvent(arc: Arc, sweepY: number): void {
    if (!arc.prev || !arc.next) return;

    const a = arc.prev.site;
    const b = arc.site;
    const c = arc.next.site;
    const circle = circumcircle(a, b, c);
    if (!circle) return; // collinear (or coincident) triple — no circumcenter, no event

    const eventY = circle.center.y + circle.radius;
    if (eventY < sweepY - 1e-9) return; // the circle's lowest point is already behind the sweep

    // A circle event is only real if the middle arc's breakpoints are actually converging —
    // i.e. (a,b,c) makes a clockwise turn in this y-down coordinate system. The mirror-image
    // (counter-clockwise) triple would place the "vertex" on the wrong side and never happens.
    const turn = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    if (turn <= 0) return;

    const event: CircleEvent = {
      kind: 'circle',
      x: circle.center.x,
      y: eventY,
      vertex: circle.center,
      arc,
      valid: true,
    };
    arc.circleEvent = event;
    queue.push(event);
  }

  function handleSiteEvent(event: SiteEvent): void {
    const site = event.site;
    trace.push({ type: 'siteEvent', site });

    if (beachline.isEmpty()) {
      beachline.insertFirst(site);
      return;
    }

    const arcAbove = beachline.findArcAbove(site.x, site.y);
    invalidateCircleEvent(arcAbove);

    const oldLeftEdge = leftEdgeOf.get(arcAbove) ?? null;
    leftEdgeOf.delete(arcAbove);

    const [left, middle, right] = beachline.splitArc(arcAbove, site);
    if (oldLeftEdge) leftEdgeOf.set(left, oldLeftEdge);

    // When the new site's `y` is (nearly) equal to `arcAbove.site.y`, `parabolaY` divides by the
    // floored `MIN_FOCUS_DISTANCE` instead of the true (near-zero) distance — mathematically
    // correct in the limit (the arc really is vanishingly narrow there) but numerically useless as
    // a coordinate, since the floor makes the magnitude explode independent of how far `site.x`
    // actually is from `arcAbove.site.x`. In that regime the new arc's insertion point isn't
    // meaningfully "directly above the new site's x" at all — both sites are effectively arriving
    // simultaneously, and their shared boundary starts at the midpoint between them instead.
    const isNearSimultaneous = site.y - arcAbove.site.y <= MIN_FOCUS_DISTANCE;
    const start = isNearSimultaneous
      ? { x: (arcAbove.site.x + site.x) / 2, y: site.y }
      : { x: site.x, y: parabolaY(arcAbove.site, site.y, site.x) };
    leftEdgeOf.set(middle, newEdge(left.site, middle.site, start));
    leftEdgeOf.set(right, newEdge(middle.site, right.site, start));

    checkCircleEvent(left, site.y);
    checkCircleEvent(right, site.y);
  }

  function handleCircleEvent(event: CircleEvent): void {
    const arc = event.arc;
    const prev = arc.prev;
    const next = arc.next;
    if (!prev || !next) return;

    trace.push({
      type: 'circleEvent',
      vertex: event.vertex,
      removedArcSite: arc.site.id,
      y: event.y,
    });

    const leftEdge = leftEdgeOf.get(arc) ?? null;
    const rightEdge = leftEdgeOf.get(next) ?? null;
    if (leftEdge) finalizeEdge(leftEdge, event.vertex);
    if (rightEdge) finalizeEdge(rightEdge, event.vertex);

    invalidateCircleEvent(prev);
    invalidateCircleEvent(next);

    beachline.removeArc(arc);
    leftEdgeOf.delete(arc);

    leftEdgeOf.set(next, newEdge(prev.site, next.site, event.vertex));

    checkCircleEvent(prev, event.y);
    checkCircleEvent(next, event.y);
  }

  for (let event = queue.pop(); event; event = queue.pop()) {
    trace.push({
      type: 'sweepAdvance',
      y: event.y,
      beachlineSnapshot: beachline.toArray().map((arc) => arc.site.id),
    });

    if (event.kind === 'site') {
      handleSiteEvent(event);
    } else if (event.valid) {
      handleCircleEvent(event);
    }
  }

  // Every edge still open at this point (never finalized by a circle event) corresponds to two
  // arcs that remain adjacent forever — its ray's direction is fixed (perpendicular to the two
  // sites, see `chooseRayDirection`), so it's resolved directly rather than by evaluating the
  // breakpoint at some assumed-far sweep position (unreliable — some rays genuinely extend
  // "backward", see that function's doc comment).
  const baseRayLength = 4 * (bounds.width + bounds.height) + bounds.height;
  const boundsCenter = { x: bounds.width / 2, y: bounds.height / 2 };
  const finalArcs = beachline.toArray();
  for (let i = 0; i < finalArcs.length - 1; i++) {
    const arcA = finalArcs[i];
    const arcB = finalArcs[i + 1];
    const edge = leftEdgeOf.get(arcB);
    if (edge && edge.end === null) {
      // `edge.start` itself can already be far outside the map (two sites with nearly equal `y`
      // but far apart in `x` give a narrow, steeply-curving arc whose insertion point lands well
      // beyond the bounds) — a fixed ray length calibrated to the map's own scale isn't always
      // enough to travel back across it. Scaling by how far `start` already is from the map keeps
      // this reliable regardless — and using this same distance as `chooseRayDirection`'s own
      // internal probe scale keeps its third-site check looking exactly as far out as the ray
      // actually travels, rather than the two silently disagreeing.
      const rayLength =
        baseRayLength + Math.hypot(edge.start.x - boundsCenter.x, edge.start.y - boundsCenter.y);
      const direction = chooseRayDirection(edge.start, arcA.site, arcB.site, sites, rayLength);
      finalizeEdge(edge, {
        x: edge.start.x + direction.x * rayLength,
        y: edge.start.y + direction.y * rayLength,
      });
    }
  }

  const clippedEdges: VoronoiEdge[] = [];
  for (const record of edges) {
    if (record.end === null) continue;
    const clipped = clipSegmentToBox(record.start, record.end, bounds);
    if (!clipped) continue;
    clippedEdges.push({
      id: record.id,
      siteLeft: record.siteLeft,
      siteRight: record.siteRight,
      start: clipped[0],
      end: clipped[1],
    });
  }

  const cells = buildCells(sites, clippedEdges, bounds);
  const diagram: VoronoiDiagram = {
    sites: [...sites],
    edges: clippedEdges,
    cells,
    bounds,
    corners: [],
  };
  trace.push({ type: 'complete', diagram });

  return { diagram, trace };
}
