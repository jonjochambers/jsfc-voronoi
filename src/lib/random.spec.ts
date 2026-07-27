import { createRandom } from './random.js';

describe('createRandom', () => {
  it('produces values in [0, 1)', () => {
    const random = createRandom(42);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = createRandom(123);
    const b = createRandom(123);
    const sequenceA = Array.from({ length: 20 }, () => a());
    const sequenceB = Array.from({ length: 20 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    const sequenceA = Array.from({ length: 20 }, () => a());
    const sequenceB = Array.from({ length: 20 }, () => b());
    expect(sequenceA).not.toEqual(sequenceB);
  });
});
