import { createRandom } from './random.js';
import type { VoronoiDiagram } from './types.js';

export interface IslandConfig {
  /** Base "coastline" radius as a fraction of `min(width,height)/2`. */
  baseRadiusFactor: number;
  /** How much the radius varies by angle, as a fraction of the base radius (0 = perfect circle). */
  jitterAmplitude: number;
  /** Number of random control angles the jittered radius is interpolated between. */
  jitterControlPoints?: number;
  seed?: number;
}

/** Marks each cell as land or water via a simple jittered-radius rule: no Perlin/simplex noise
 * (that's an explicit v2 idea), just a handful of random radius multipliers at evenly-spaced
 * angles, linearly interpolated — enough to avoid a perfect circle without a noise dependency.
 * Fully decoupled from `runFortune`; swapping in a different coastline rule later only touches
 * this file. */
export function applyIslandShape(diagram: VoronoiDiagram, config: IslandConfig): VoronoiDiagram {
  const { baseRadiusFactor, jitterAmplitude, jitterControlPoints = 10, seed = Date.now() } = config;
  const random = createRandom(seed);

  const center = { x: diagram.bounds.width / 2, y: diagram.bounds.height / 2 };
  const baseRadius = (baseRadiusFactor * Math.min(diagram.bounds.width, diagram.bounds.height)) / 2;
  const controlMultipliers = Array.from(
    { length: jitterControlPoints },
    () => 1 + (random() * 2 - 1) * jitterAmplitude,
  );

  function thresholdAt(angle: number): number {
    const twoPi = Math.PI * 2;
    const normalized = ((angle % twoPi) + twoPi) % twoPi;
    const step = twoPi / jitterControlPoints;
    const index = normalized / step;
    const i0 = Math.floor(index) % jitterControlPoints;
    const i1 = (i0 + 1) % jitterControlPoints;
    const t = index - Math.floor(index);
    const multiplier = controlMultipliers[i0] * (1 - t) + controlMultipliers[i1] * t;
    return baseRadius * multiplier;
  }

  const cells = diagram.cells.map((cell) => {
    const dx = cell.site.x - center.x;
    const dy = cell.site.y - center.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    return { ...cell, isLand: distance <= thresholdAt(angle) };
  });

  return { ...diagram, cells };
}
