import { EventQueue, type FortuneEvent, type SiteEvent } from './event-queue.js';

function siteEvent(x: number, y: number, id: number): SiteEvent {
  return { kind: 'site', x, y, site: { id, x, y } };
}

describe('EventQueue', () => {
  it('pops in ascending y order for a randomized push sequence', () => {
    const queue = new EventQueue();
    const events: SiteEvent[] = [];
    // Deterministic pseudo-random-ish sequence, no need for a real PRNG here.
    for (let i = 0; i < 100; i++) {
      const y = (i * 37) % 101;
      const event = siteEvent(i, y, i);
      events.push(event);
      queue.push(event);
    }

    const expected = [...events].sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    const popped: FortuneEvent[] = [];
    let next = queue.pop();
    while (next !== undefined) {
      popped.push(next);
      next = queue.pop();
    }

    expect(popped).toEqual(expected);
  });

  it('breaks ties on equal y by ascending x', () => {
    const queue = new EventQueue();
    queue.push(siteEvent(5, 10, 0));
    queue.push(siteEvent(1, 10, 1));
    queue.push(siteEvent(3, 10, 2));

    expect(queue.pop()?.x).toBe(1);
    expect(queue.pop()?.x).toBe(3);
    expect(queue.pop()?.x).toBe(5);
  });

  it('returns undefined when popping an empty queue', () => {
    const queue = new EventQueue();
    expect(queue.pop()).toBeUndefined();
  });

  it('lets a popped event be flagged invalid and skipped without breaking subsequent pops', () => {
    const queue = new EventQueue();
    const circleEvent = {
      kind: 'circle' as const,
      x: 5,
      y: 1,
      vertex: { x: 5, y: 1 },
      arc: {} as never,
      valid: true,
    };
    queue.push(circleEvent);
    queue.push(siteEvent(0, 2, 0));

    const popped = queue.pop();
    expect(popped).toBe(circleEvent);
    if (popped?.kind === 'circle') popped.valid = false;
    expect(circleEvent.valid).toBe(false);

    expect(queue.pop()?.kind).toBe('site');
    expect(queue.size).toBe(0);
  });
});
