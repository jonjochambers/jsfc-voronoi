# @jsfc/voronoi

[![CI](https://github.com/jonjochambers/jsfc-voronoi/actions/workflows/ci.yml/badge.svg)](https://github.com/jonjochambers/jsfc-voronoi/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jonjochambers/jsfc-voronoi/badges/coverage.json)](https://github.com/jonjochambers/jsfc-voronoi/actions/workflows/ci.yml)

Three independent, from-scratch Voronoi diagram implementations, each computing both a
finished diagram and a complete, replayable trace of its own execution — extracted from
[jsfc-dev](https://github.com/jonjochambers/jsfc-dev), where it powers the
[Voronoi Island Map](https://jsfc.dev/portfolio/voronoi-map) portfolio piece.

## What's in here

### Core diagrams

- **`fortune.ts`** — Fortune's sweep line. Sweeps a line down the plane, maintaining a
  "beachline" of parabolic arcs that split and resolve into edges as site and circle
  events are processed. The only `O(n log n)` approach of the three.
- **`brute-force.ts`** — half-plane intersection. Builds each site's cell directly by
  intersecting the bounding box with every other site's perpendicular-bisector
  half-plane. Simplest possible correct construction, `O(n²)`-ish overall.
- **`bowyer-watson.ts`** — incremental Delaunay triangulation, dualized into the Voronoi
  diagram. Inserts sites one at a time, re-triangulating around each; every decision
  reduces to a single circumcircle-vs-point test.
- **`algorithms.ts`** — `runAlgorithm(id, sites, bounds)`: a thin dispatcher over the
  three, tagging the result with which one produced it and attaching the shared corner
  graph (`build-graph.ts`) to every result identically, regardless of algorithm.

All three algorithms are verified correct against thousands of randomized
configurations (not just a handful of hand-picked fixtures) — see each algorithm's
`.spec.ts` file.

### Island generation pipeline

Layered on top of the core diagram, following the general shape of Amit Patel's
["Polygon Map Generation"](https://www-cs-students.stanford.edu/~amitp/game-programming/polygon-map-generation/)
approach:

- **`build-graph.ts`** — `attachGraph`: derives a deduplicated corner/vertex graph
  (corner↔corner and corner↔cell links, plus per-cell neighbor lists) from each cell's
  polygon. Everything below depends on this — elevation lives on cells, but rivers
  trace corner-to-corner and noisy edges displace per shared edge. Corner dedup uses a
  spatial hash (not a linear scan) to stay fast at high point counts.
- **`relaxation.ts`** — `relaxSites`: Lloyd relaxation. Iterates {build diagram → move
  each site to its own cell's area-weighted centroid → repeat}, producing a more evenly
  spaced, less "spiky" site distribution than raw uniform-random sampling. Pure
  input-site perturbation — works identically regardless of which algorithm builds each
  intermediate diagram.
- **`island.ts`** — `applyIslandShape`: assigns each cell a continuous `elevation`
  (blending a jittered-radius coastline shape with layered seeded value-noise) and
  buckets it into a named `tier` (OCEAN/COAST/PLAIN/HILL/MOUNTAIN).
- **`moisture.ts`** — `assignMoisture`: seeds moisture at a handful of land cells and
  propagates it outward across land neighbors via multi-source BFS with per-hop decay,
  using the corner graph's adjacency. Water never carries moisture across it.
  `moistureLevel` buckets the continuous value into a named level (ARID..SATURATED).
- **`biomes.ts`** — `assignBiomes`: combines each cell's elevation tier and moisture
  level via a small Whittaker-style lookup table into a named `Biome` (OCEAN, BEACH,
  SNOW, TUNDRA, TAIGA, GRASSLAND, DESERT, RAIN_FOREST).
- **`rivers.ts`** — `traceRivers`: picks high-elevation inland corners as sources and
  traces steepest-descent along the corner graph down to the coast (or an inland sink),
  accumulating flow as tributaries merge downstream.
- **`sizing.ts`** / **`random.ts`** — point-count/dimension sizing helpers and seeded
  random site generation, used by the demo app but not required to use the algorithms
  directly.

## Usage

```ts
import {
  generateRandomSites,
  relaxSites,
  runAlgorithm,
  applyIslandShape,
  assignMoisture,
  assignBiomes,
  traceRivers,
} from '@jsfc/voronoi';

const bounds = { width: 800, height: 600 };
const sites = generateRandomSites(bounds.width, bounds.height, 60);
const relaxed = relaxSites(sites, bounds, 'fortune', 2);
const { diagram: rawDiagram } = runAlgorithm('fortune', relaxed, bounds);

const shaped = applyIslandShape(rawDiagram, { baseRadiusFactor: 0.75, jitterAmplitude: 0.25 });
const moistened = assignMoisture(shaped, (cell) => cell.tier !== 'OCEAN', { seedCount: 6 });
const diagram = assignBiomes(moistened);
const rivers = traceRivers(diagram, { sourceCount: 5 });
```

## Development

```sh
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test           # vitest
pnpm run test:coverage  # vitest with coverage report
```

## Contributing

Issues and pull requests are welcome. All changes land through a pull request — direct
pushes to `main` aren't accepted, and PRs need CI green (typecheck, lint, test) plus at
least one approval before merging. For anything non-trivial, please open an issue first
to discuss the approach.

## License

[MIT](./LICENSE)
