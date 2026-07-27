import { createRandom } from './random.js';
import type { Site } from './types.js';

/** Uniform-random sites within `[0,width] x [0,height]`. Coincident points are re-rolled —
 * two sites at the exact same coordinate are a degenerate case for Fortune's algorithm
 * (their perpendicular bisector is undefined). `seed` defaults to a fresh value per call so
 * generation is non-deterministic in normal use; pass one explicitly for reproducible output
 * (tests, "regenerate this exact map" tooling). */
export function generateRandomSites(
  width: number,
  height: number,
  count: number,
  seed: number = Date.now(),
): Site[] {
  const random = createRandom(seed);
  const seen = new Set<string>();
  const sites: Site[] = [];

  while (sites.length < count) {
    const x = random() * width;
    const y = random() * height;
    const key = `${x}:${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sites.push({ id: sites.length, x, y });
  }

  return sites;
}
