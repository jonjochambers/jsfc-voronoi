import { clipSegmentToBox } from './clip.js';

const BOUNDS = { width: 100, height: 100 };

describe('clipSegmentToBox', () => {
  it('clips a diagonal segment crossing corner-to-corner to exactly the box', () => {
    const result = clipSegmentToBox({ x: -10, y: -10 }, { x: 110, y: 110 }, BOUNDS);
    expect(result).not.toBeNull();
    const [start, end] = result as [{ x: number; y: number }, { x: number; y: number }];
    expect(start.x).toBeCloseTo(0, 6);
    expect(start.y).toBeCloseTo(0, 6);
    expect(end.x).toBeCloseTo(100, 6);
    expect(end.y).toBeCloseTo(100, 6);
  });

  it('returns null for a segment entirely outside the box on one axis', () => {
    const result = clipSegmentToBox({ x: 200, y: 50 }, { x: 300, y: 50 }, BOUNDS);
    expect(result).toBeNull();
  });

  it('does not crash when the segment only grazes a single corner', () => {
    const result = clipSegmentToBox({ x: 0, y: 0 }, { x: -10, y: -10 }, BOUNDS);
    expect(result).not.toBeNull();
    const [start, end] = result as [{ x: number; y: number }, { x: number; y: number }];
    expect(start).toEqual({ x: 0, y: 0 });
    expect(end).toEqual({ x: 0, y: 0 });
  });

  it('clips a rightward segment from the box center out past the right edge', () => {
    const result = clipSegmentToBox({ x: 50, y: 50 }, { x: 500, y: 50 }, BOUNDS);
    expect(result).not.toBeNull();
    const [start, end] = result as [{ x: number; y: number }, { x: number; y: number }];
    expect(start.x).toBeCloseTo(50, 6);
    expect(start.y).toBeCloseTo(50, 6);
    expect(end.x).toBeCloseTo(100, 6);
    expect(end.y).toBeCloseTo(50, 6);
  });

  it('returns null for a segment pointing entirely away from the box', () => {
    const result = clipSegmentToBox({ x: 200, y: 200 }, { x: 500, y: 500 }, BOUNDS);
    expect(result).toBeNull();
  });
});
