import { type Arc, Beachline } from './beachline.js';
import { buildCells } from './build-cells.js';
import { clipSegmentToBox } from './clip.js';
import { type CircleEvent, EventQueue, type SiteEvent } from './event-queue.js';
import { circumcircle, parabolaY } from './geometry.js';
import type { FortuneTraceStep } from './trace.js';
import type { Point, Site, VoronoiBounds, VoronoiDiagram, VoronoiEdge } from './types.js';

interface EdgeRecord {
  id: number;
  siteLeft: number;
  siteRight: number;
  start: Point;
  end: Point | null;
}

/** Finds the smallest `x > lowerBound` where dominance between `a` and `b` flips, at sweep
 * position `y` — i.e. the breakpoint immediately to the right of `lowerBound`, found by scanning
 * forward in exponentially growing steps until the parabola-value comparison flips sign, then
 * bisecting within that bracket. Used only for the *final* beachline's remaining arcs (see
 * below), where consecutive breakpoints are guaranteed monotonically increasing — so anchoring
 * each search at the previous breakpoint and scanning strictly rightward always finds the next
 * one specifically, never a stray root belonging to some other, non-adjacent pair. */
function scanForTransition(
  a: Site,
  b: Site,
  y: number,
  lowerBound: number,
  maxStep: number,
): number {
  const f = (x: number) => parabolaY(a, y, x) - parabolaY(b, y, x);

  // Evaluated at `lowerBound + step`, not `lowerBound` itself: `lowerBound` is often *exactly* a
  // root of some other (a,b) pair's quadratic (the previous breakpoint found), and this same
  // pair's own second root can coincide with it too (swapping which site is "a" just negates the
  // function) — sampling a real, nonzero distance away avoids treating floating-point noise
  // right at that shared point as a meaningful sign.
  let step = 1;
  let lo = lowerBound + step;
  let signAtLo = Math.sign(f(lo));
  let hi = lo + step;
  // Capped at `maxStep`: this pair's quadratic has at most two real roots, so if scanning hasn't
  // found a sign flip within a generous multiple of the map's own scale, there isn't one ahead —
  // continuing to double would run off to astronomical, meaningless values that would then poison
  // every later pair's search (each one's lower bound comes from the one before it).
  while (step < maxStep && Math.sign(f(hi)) === signAtLo) {
    lo = hi;
    signAtLo = Math.sign(f(lo));
    step *= 2;
    hi = lo + step;
  }
  if (Math.sign(f(hi)) === signAtLo) {
    return lowerBound + maxStep;
  }

  let fLo = f(lo);
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (fMid === 0) return mid;
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** Runs Fortune's algorithm on `sites` within `bounds`, returning both the finished diagram and
 * a full, replayable trace of the sweep (see `trace.ts`). This is the only place in the package
 * that makes algorithmic decisions — everything downstream (the UI's animation) just replays
 * what happened here.
 *
 * KNOWN LIMITATION (as of this writing): 46/49 of this package's tests pass, including exact
 * results for 2-site and sites-on-the-box-boundary configurations. Three tests still fail —
 * a symmetric 3-site triangle, 4 co-circular sites, and a randomized 50-site diagram — all with
 * cell-area totals larger than they should be, verified against an independent brute-force
 * nearest-neighbor ground truth. The remaining bug appears to be in `scanForTransition`/the final
 * open-edge resolution below: for some site pairs deep in a long chain of still-open edges, the
 * scan hits its `maxStep` cap instead of finding the true breakpoint, and that capped (wrong)
 * value then poisons every subsequent pair's search (each one's lower bound comes from the one
 * before it). Worth investigating next: whether `checkCircleEvent` is failing to register some
 * legitimate future event, leaving stale arcs in the "final" beachline that in fact still have a
 * pending circle event before sweeping to infinity — which would explain a search failing to find
 * a crossing that should exist. This was narrowed down across a long debugging session that tried
 * (and rejected) several other approaches: a `left.y`/`right.y` comparison heuristic for
 * breakpoint root selection, a global "is this candidate visible against every other site" check,
 * an analytical perpendicular-bisector-rotation formula for edge direction, and single-step
 * bisection anchored at a circle event's vertex — all either failed to generalize past the case
 * they were checked against, or worked for some configurations while regressing others. */
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

    const start = { x: site.x, y: parabolaY(arcAbove.site, site.y, site.x) };
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

  // Every edge still open at this point (never finalized by a circle event) corresponds to a
  // breakpoint between two *consecutive* arcs still standing in the final beachline. Rather than
  // guessing which of two algebraic directions each one individually grows in (unreliable — see
  // git history), walk the final beachline once, left to right, at a sweep position far beyond
  // the map: consecutive breakpoints are guaranteed to be monotonically increasing in x, so
  // anchoring each search at the previous one found and scanning strictly rightward lands on
  // each true breakpoint in turn, using only direct parabola-value comparisons (no root-solving).
  const farY = 4 * (bounds.width + bounds.height) + bounds.height;
  const maxStep = 1000 * (bounds.width + bounds.height);
  const finalArcs = beachline.toArray();
  let lowerBound = -farY;
  for (let i = 0; i < finalArcs.length - 1; i++) {
    const arcA = finalArcs[i];
    const arcB = finalArcs[i + 1];
    const edge = leftEdgeOf.get(arcB);
    const farX = scanForTransition(arcA.site, arcB.site, farY, lowerBound, maxStep);
    if (edge && edge.end === null) {
      finalizeEdge(edge, { x: farX, y: parabolaY(arcA.site, farY, farX) });
    }
    lowerBound = farX;
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
  const diagram: VoronoiDiagram = { sites: [...sites], edges: clippedEdges, cells, bounds };
  trace.push({ type: 'complete', diagram });

  return { diagram, trace };
}
