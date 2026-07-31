import { moistureLevel } from './moisture.js';
import type { Biome, ElevationTier, VoronoiCell, VoronoiDiagram } from './types.js';

/** Whittaker-style elevation x moisture lookup. Rows/columns trimmed to the tiers/levels this
 * project actually produces rather than a full academic diagram. */
const WHITTAKER_TABLE: Record<ElevationTier, Record<ReturnType<typeof moistureLevel>, Biome>> = {
  OCEAN: {
    ARID: 'OCEAN',
    DRY: 'OCEAN',
    MODERATE: 'OCEAN',
    WET: 'OCEAN',
    SATURATED: 'OCEAN',
  },
  COAST: {
    ARID: 'BEACH',
    DRY: 'BEACH',
    MODERATE: 'BEACH',
    WET: 'BEACH',
    SATURATED: 'BEACH',
  },
  PLAIN: {
    ARID: 'DESERT',
    DRY: 'GRASSLAND',
    MODERATE: 'GRASSLAND',
    WET: 'RAIN_FOREST',
    SATURATED: 'RAIN_FOREST',
  },
  HILL: {
    ARID: 'DESERT',
    DRY: 'GRASSLAND',
    MODERATE: 'TAIGA',
    WET: 'TAIGA',
    SATURATED: 'RAIN_FOREST',
  },
  MOUNTAIN: {
    ARID: 'TUNDRA',
    DRY: 'TUNDRA',
    MODERATE: 'TUNDRA',
    WET: 'SNOW',
    SATURATED: 'SNOW',
  },
};

export function biomeFor(tier: ElevationTier, moisture: number): Biome {
  return WHITTAKER_TABLE[tier][moistureLevel(moisture)];
}

const defaultTierForCell = (cell: VoronoiCell): ElevationTier => cell.tier ?? 'OCEAN';

/** Combines each cell's elevation tier (`cell.tier` by default, from 1A's `applyIslandShape`;
 * override via `tierForCell` for a diagram that hasn't had elevation assigned yet) with its
 * already-assigned `moisture` (see `assignMoisture`) into a named biome. */
export function assignBiomes(
  diagram: VoronoiDiagram,
  tierForCell: (cell: VoronoiCell) => ElevationTier = defaultTierForCell,
): VoronoiDiagram {
  const cells = diagram.cells.map((cell) => ({
    ...cell,
    biome: biomeFor(tierForCell(cell), cell.moisture ?? 0),
  }));
  return { ...diagram, cells };
}
