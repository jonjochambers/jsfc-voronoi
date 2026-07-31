import { createRandom } from './random.js';
import type { ElevationTier, VoronoiDiagram } from './types.js';

export interface IslandConfig {
  /** Base "coastline" radius as a fraction of `min(width,height)/2`. */
  baseRadiusFactor: number;
  /** How much the radius varies by angle, as a fraction of the base radius (0 = perfect circle). */
  jitterAmplitude: number;
  /** Number of random control angles the jittered radius is interpolated between. */
  jitterControlPoints?: number;
  seed?: number;
  /** Layers of fractal value-noise blended into the radial shape (each doubles frequency, halves
   * amplitude vs. the last). More octaves add finer texture on top of the same broad shape. */
  noiseOctaves?: number;
  /** Spatial frequency of the noise's first octave, in cycles across the map. Higher = smaller,
   * more numerous features. */
  noiseFrequency?: number;
  /** How much the noise layer perturbs elevation vs. the radial shape alone, 0 (shape only) to 1
   * (noise only). */
  noiseWeight?: number;
}

const DEFAULT_NOISE_OCTAVES = 4;
const DEFAULT_NOISE_FREQUENCY = 3;
const DEFAULT_NOISE_WEIGHT = 0.25;

/** Ascending elevation breakpoints: a cell falls in the first tier whose bound it's below. Chosen
 * symmetrically around the 0.5 blend midpoint (see `applyIslandShape`) so that fully saturated
 * land/water shape values land safely inside MOUNTAIN/OCEAN regardless of `noiseWeight`'s share of
 * the blend. */
const TIER_UPPER_BOUNDS: ReadonlyArray<readonly [ElevationTier, number]> = [
  ['OCEAN', 0.3],
  ['COAST', 0.4],
  ['PLAIN', 0.6],
  ['HILL', 0.8],
  ['MOUNTAIN', Number.POSITIVE_INFINITY],
];

export function tierForElevation(elevation: number): ElevationTier {
  for (const [tier, upperBound] of TIER_UPPER_BOUNDS) {
    if (elevation < upperBound) return tier;
  }
  return 'MOUNTAIN';
}

/** The jittered coastline radius at `angle`: linear interpolation between `controlMultipliers`
 * (evenly spaced around the circle) times `baseRadius`. Extracted from `applyIslandShape` so its
 * min/max bounds are unit-testable independent of the noise layer blended into elevation. */
export function coastlineRadiusAt(
  angle: number,
  baseRadius: number,
  controlMultipliers: readonly number[],
): number {
  const controlPoints = controlMultipliers.length;
  const twoPi = Math.PI * 2;
  const normalized = ((angle % twoPi) + twoPi) % twoPi;
  const step = twoPi / controlPoints;
  const index = normalized / step;
  const i0 = Math.floor(index) % controlPoints;
  const i1 = (i0 + 1) % controlPoints;
  const t = index - Math.floor(index);
  const multiplier = controlMultipliers[i0] * (1 - t) + controlMultipliers[i1] * t;
  return baseRadius * multiplier;
}

/** Deterministic pseudo-random value in [0,1) for an integer lattice point, hashed from `seed`
 * through the same mulberry32 PRNG used elsewhere (`random.ts`) — avoids a second noise
 * dependency for what's otherwise a standard value-noise lattice hash. */
function latticeValue(ix: number, iy: number, seed: number): number {
  const mixed =
    (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519)) | 0;
  return createRandom(mixed)();
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Bilinear-interpolated value noise at continuous `(x, y)`: hashes the 4 surrounding lattice
 * points and blends them with a smoothstep easing curve so the field has no visible grid seams. */
function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = latticeValue(x0, y0, seed);
  const v10 = latticeValue(x0 + 1, y0, seed);
  const v01 = latticeValue(x0, y0 + 1, seed);
  const v11 = latticeValue(x0 + 1, y0 + 1, seed);
  const top = v00 * (1 - tx) + v10 * tx;
  const bottom = v01 * (1 - tx) + v11 * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Fractal Brownian motion: `octaves` layers of `valueNoise2D`, each doubling frequency and
 * halving amplitude vs. the last, normalized back to [0,1]. */
function fractalNoise(x: number, y: number, seed: number, octaves: number): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeSum = 0;
  for (let octave = 0; octave < octaves; octave++) {
    // Offset by a large odd-ish constant per octave so octaves sample unrelated regions of the
    // lattice rather than aliasing against each other at integer-multiple frequencies.
    total += valueNoise2D(x * frequency, y * frequency, seed + octave * 101) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / amplitudeSum;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Assigns each cell a continuous `elevation` (and its bucketed `tier`) by blending two signals:
 * the existing jittered-radius coastline shape, and layered seeded value-noise for texture that
 * a pure radial falloff can't produce. `Math.tanh` saturates the shape term before blending, so a
 * cell deep inside or far outside the coastline lands solidly in its tier regardless of noise —
 * only cells near the coastline are noise-sensitive, which is exactly where organic variation is
 * wanted. Fully decoupled from `runAlgorithm`; swapping in a different elevation model later only
 * touches this file. */
export function applyIslandShape(diagram: VoronoiDiagram, config: IslandConfig): VoronoiDiagram {
  const {
    baseRadiusFactor,
    jitterAmplitude,
    jitterControlPoints = 10,
    seed = Date.now(),
    noiseOctaves = DEFAULT_NOISE_OCTAVES,
    noiseFrequency = DEFAULT_NOISE_FREQUENCY,
    noiseWeight = DEFAULT_NOISE_WEIGHT,
  } = config;
  const random = createRandom(seed);

  const center = { x: diagram.bounds.width / 2, y: diagram.bounds.height / 2 };
  const baseRadius = (baseRadiusFactor * Math.min(diagram.bounds.width, diagram.bounds.height)) / 2;
  const controlMultipliers = Array.from(
    { length: jitterControlPoints },
    () => 1 + (random() * 2 - 1) * jitterAmplitude,
  );
  // Offset from the shape seed so identical seeds don't correlate the two layers into a single
  // scalar (which would just be `elevation = f(distance)` with extra steps).
  const noiseSeed = (seed + 0x9e3779b9) | 0;

  const cells = diagram.cells.map((cell) => {
    const dx = cell.site.x - center.x;
    const dy = cell.site.y - center.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const coastRadius = coastlineRadiusAt(angle, baseRadius, controlMultipliers);

    // 1 at the center, 0 exactly at the coastline, negative beyond it.
    const shapeValue = Math.tanh(1 - distance / coastRadius);

    // fractalNoise returns [0,1]; recenter to [-1,1] so it can push elevation either side of the
    // coastline rather than only ever raising it.
    const noiseValue =
      fractalNoise(
        (cell.site.x / diagram.bounds.width) * noiseFrequency,
        (cell.site.y / diagram.bounds.height) * noiseFrequency,
        noiseSeed,
        noiseOctaves,
      ) *
        2 -
      1;

    const blended = shapeValue * (1 - noiseWeight) + noiseValue * noiseWeight;
    const elevation = clamp01(0.5 + blended * 0.5);

    return { ...cell, elevation, tier: tierForElevation(elevation) };
  });

  return { ...diagram, cells };
}
