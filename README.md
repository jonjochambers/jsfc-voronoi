# @jsfc/voronoi

[![CI](https://github.com/jonjochambers/jsfc-voronoi/actions/workflows/ci.yml/badge.svg)](https://github.com/jonjochambers/jsfc-voronoi/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/jonjochambers/jsfc-voronoi/badges/coverage.json)](https://github.com/jonjochambers/jsfc-voronoi/actions/workflows/ci.yml)

Three independent, from-scratch Voronoi diagram implementations, each computing both a
finished diagram and a complete, replayable trace of its own execution — extracted from
[jsfc-dev](https://github.com/jonjochambers/jsfc-dev), where it powers the
[Voronoi Island Map](https://jsfc.dev/portfolio/voronoi-map) portfolio piece.

## What's in here

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
  three, tagging the result with which one produced it.
- **`island.ts`** / **`sizing.ts`** / **`random.ts`** — a simple jittered-radial "is this
  cell land or sea" heuristic, point-count/dimension sizing helpers, and random site
  generation, used by the demo app but not required to use the algorithms directly.

All three algorithms are verified correct against thousands of randomized
configurations (not just a handful of hand-picked fixtures) — see each algorithm's
`.spec.ts` file.

## Usage

```ts
import { generateRandomSites, runAlgorithm } from '@jsfc/voronoi';

const bounds = { width: 800, height: 600 };
const sites = generateRandomSites(bounds.width, bounds.height, 60);
const { diagram, trace } = runAlgorithm('fortune', sites, bounds);
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
