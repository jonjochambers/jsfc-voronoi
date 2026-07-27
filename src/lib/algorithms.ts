import type { BowyerWatsonTraceStep } from './bowyer-watson.js';
import { runBowyerWatson } from './bowyer-watson.js';
import type { BruteForceTraceStep } from './brute-force.js';
import { runBruteForce } from './brute-force.js';
import { runFortune } from './fortune.js';
import type { FortuneTraceStep } from './trace.js';
import type { Site, VoronoiBounds, VoronoiDiagram } from './types.js';

export type AlgorithmId = 'fortune' | 'brute-force' | 'bowyer-watson';

export interface AlgorithmInfo {
  label: string;
  description: string;
}

export const ALGORITHMS: Record<AlgorithmId, AlgorithmInfo> = {
  'bowyer-watson': {
    label: 'Bowyer-Watson (incremental Delaunay)',
    description:
      'Inserts sites one at a time into a growing Delaunay triangulation, then dualizes it into ' +
      'the Voronoi diagram. Every decision reduces to a single circumcircle-vs-point test.',
  },
  'brute-force': {
    label: 'Brute-force (half-plane intersection)',
    description:
      "Builds each site's cell directly by intersecting the bounding box with every other " +
      "site's perpendicular-bisector half-plane. Simplest possible correct construction.",
  },
  fortune: {
    label: "Fortune's sweep line (experimental — known bug)",
    description:
      'A sweep-line beachline of parabolic arcs. Kept in as a work-in-progress reference: its ' +
      'final open-edge resolution still overshoots cell areas for some configurations.',
  },
};

export type AlgorithmRun =
  | { kind: 'fortune'; diagram: VoronoiDiagram; trace: FortuneTraceStep[] }
  | { kind: 'brute-force'; diagram: VoronoiDiagram; trace: BruteForceTraceStep[] }
  | { kind: 'bowyer-watson'; diagram: VoronoiDiagram; trace: BowyerWatsonTraceStep[] };

/** Thin dispatch over the three independent algorithm implementations — each stays a
 * self-contained, independently-testable module (`fortune.ts`/`brute-force.ts`/
 * `bowyer-watson.ts`); this just tags the result with which one produced it so the UI can pick
 * the matching renderer. */
export function runAlgorithm(
  id: AlgorithmId,
  sites: readonly Site[],
  bounds: VoronoiBounds,
): AlgorithmRun {
  switch (id) {
    case 'fortune': {
      const { diagram, trace } = runFortune(sites, bounds);
      return { kind: 'fortune', diagram, trace };
    }
    case 'brute-force': {
      const { diagram, trace } = runBruteForce(sites, bounds);
      return { kind: 'brute-force', diagram, trace };
    }
    case 'bowyer-watson': {
      const { diagram, trace } = runBowyerWatson(sites, bounds);
      return { kind: 'bowyer-watson', diagram, trace };
    }
  }
}
