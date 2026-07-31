import { createRandom } from './random.js';
import type { VoronoiCell, VoronoiDiagram } from './types.js';

export type MoistureLevel = 'ARID' | 'DRY' | 'MODERATE' | 'WET' | 'SATURATED';

export interface MoistureConfig {
  /** How many land cells start as moisture sources (1.0). */
  seedCount: number;
  /** Multiplicative decay applied per BFS hop away from a source, 0-1. */
  falloffPerHop?: number;
  seed?: number;
}

/** Buckets a continuous 0-1 moisture value into a named level for biome lookup. */
export function moistureLevel(moisture: number): MoistureLevel {
  if (moisture >= 0.8) return 'SATURATED';
  if (moisture >= 0.6) return 'WET';
  if (moisture >= 0.4) return 'MODERATE';
  if (moisture >= 0.2) return 'DRY';
  return 'ARID';
}

function pickRandom<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

/** Seeds moisture at `seedCount` random land cells and propagates it outward across land
 * neighbors via multi-source BFS, decaying by `falloffPerHop` at each hop. Requires
 * `attachGraph` to have already populated `cell.neighborIds` (Phase 0) — cells with no
 * neighbor data just get 0. Water cells always get 0; moisture doesn't cross open water. */
export function assignMoisture(
  diagram: VoronoiDiagram,
  isLand: (cell: VoronoiCell) => boolean,
  config: MoistureConfig,
): VoronoiDiagram {
  const { seedCount, falloffPerHop = 0.2, seed = Date.now() } = config;
  const random = createRandom(seed);

  const landCells = diagram.cells.filter(isLand);
  const cellsBySite = new Map(diagram.cells.map((cell) => [cell.site.id, cell]));
  const moistureBySite = new Map<number, number>();

  if (landCells.length > 0) {
    // Multi-source BFS: every source starts in the queue at hop 0, so the first time a cell is
    // reached is guaranteed to be via its nearest source (unweighted graph, uniform per-hop
    // decay) — no need to revisit a cell once it has a value.
    const queue: number[] = [];
    for (const cell of pickRandom(landCells, seedCount, random)) {
      moistureBySite.set(cell.site.id, 1);
      queue.push(cell.site.id);
    }

    let head = 0;
    while (head < queue.length) {
      const siteId = queue[head++];
      const next = (moistureBySite.get(siteId) ?? 0) * (1 - falloffPerHop);
      if (next <= 0) continue;
      for (const neighborId of cellsBySite.get(siteId)?.neighborIds ?? []) {
        if (moistureBySite.has(neighborId)) continue;
        const neighborCell = cellsBySite.get(neighborId);
        if (!neighborCell || !isLand(neighborCell)) continue;
        moistureBySite.set(neighborId, next);
        queue.push(neighborId);
      }
    }
  }

  const cells = diagram.cells.map((cell) => ({
    ...cell,
    moisture: moistureBySite.get(cell.site.id) ?? 0,
  }));
  return { ...diagram, cells };
}
