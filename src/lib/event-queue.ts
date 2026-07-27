import type { Arc } from './beachline.js';
import type { Point, Site } from './types.js';

export interface SiteEvent {
  kind: 'site';
  y: number;
  x: number;
  site: Site;
}

export interface CircleEvent {
  kind: 'circle';
  y: number;
  x: number;
  vertex: Point;
  /** The arc that would be squeezed out of the beachline by this event. */
  arc: Arc;
  /** Lazy deletion flag — set `false` when a later event invalidates this one, instead of
   * searching the heap to remove it. Skipped when popped. */
  valid: boolean;
}

export type FortuneEvent = SiteEvent | CircleEvent;

function isLess(a: FortuneEvent, b: FortuneEvent): boolean {
  if (a.y !== b.y) return a.y < b.y;
  return a.x < b.x;
}

/** Array-based binary min-heap of Fortune's-algorithm events, ordered by sweep-line `y`
 * (ties broken by `x`). Chosen over a plain sorted array since circle events are pushed and
 * invalidated continuously during the sweep — O(log n) insert/extract instead of an array's
 * O(n) shift-insert. */
export class EventQueue {
  private readonly heap: FortuneEvent[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(event: FortuneEvent): void {
    this.heap.push(event);
    this.siftUp(this.heap.length - 1);
  }

  pop(): FortuneEvent | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop();
    if (last !== undefined && this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  peek(): FortuneEvent | undefined {
    return this.heap[0];
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!isLess(this.heap[i], this.heap[parent])) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    const size = this.heap.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < size && isLess(this.heap[left], this.heap[smallest])) smallest = left;
      if (right < size && isLess(this.heap[right], this.heap[smallest])) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}
