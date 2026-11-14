# JavaScript interface

The core (`src/core/index.js`) is plain ES modules with no DOM dependency. The 3D editor and the earlier standalone page are consumers. The earlier page's `window.hallmark` helpers and its UI notes are in [previous-interface-api.md](previous-interface-api.md).

## Example

With a controlled test terrain from `src/fixtures/terrain.js`:

```js
import { evaluate, query } from './src/core/index.js';
import { datasetById } from './src/fixtures/terrain.js';

const ev = evaluate(datasetById('reference'), { slopeDeg: 15, roughness_m: 0.15 });
const q = query(ev, 'combined', { row: 7, col: 3 });
q.category;                         // 'unmet'
q.outcomes;                         // { slope: 'not-exceeded', roughness: 'exceeded' }
q.branches.slope.origin.headline;   // 'observed'
q.branches.roughness.origin.text;   // 'Includes interpolation'
q.origin.text;                      // 'Includes interpolation through the height spread branch'
```

`src/fixtures/terrain.js` holds only test fixtures. The NASA cases the editor uses (Nassau and Connecting Ridge, 256 × 256) are loaded from `editor/data/` by `loadTerrain(caseId, surface)` in `editor/data.js`; in Node, provide `fetch` for file URLs (see `tests/ridge-interface-text.test.mjs` or `demo/research/paper-numbers.mjs`). The returned dataset is evaluated in the same way.

## Datasets

Required: `{ id, W, H, res, heights: number[], origins: string[] }`, row-major and north to south. `origins[i]` is one of `observed`, `interpolated`, `undocumented` or `absent`; an absent origin must coincide with a non-finite height (validated). Both NASA lunar cases declare every height `undocumented`.

Optional fields read by the core:

| Field | Meaning |
|---|---|
| `quality` | supplier quality codes per height, with their vocabulary (validated as byte codes). Nassau: LROC codes, 3 = Suspicious |
| `heightRMS` | supplier height RMS per height, in metres (Connecting Ridge) |
| `lolaCounts`, `lolaReturns` | supplier LOLA return count per height, and the dataset's wording for it (Connecting Ridge) |
| `matchtags`, `groundCounts`, `dsmSampleCounts` | supplier per-height evidence of Earth and archived cases; count and absent-origin consistency is validated |
| `originDeclaration`, `production` | how the supplier declares origins and production; queries retain these instead of a default label |
| `source` | product metadata; `res_m_ew` / `res_m_ns` set the east–west and north–south spacing used by slope |
| `acquisition` | stereo-match and gap-fill records (simulated test fixtures only) |
| `illuminationPeriod` | enables the illumination operations (see below) |

Derived nodes use the *analysis grid*: the height grid minus a 2-cell margin (`MARGIN`). Analysis cell (r, c) is centred on height cell (r+2, c+2).

## `evaluate(dataset, limits?, pipeline?)`

Runs every declared operation and returns `{ dataset, limits, pipeline, records }`. `pipeline` defaults to `createDatasetPipeline(dataset)`. `records[nodeId][cell]` is `{ available, value, sources, origin?, outcome?, limit?, category?, outcomes?, reason?, missing?, quality? }`. `sources` is the sorted list of declared source height indices. Source (heights) records have no `origin`; derived records do. `quality` is added when the dataset supplies quality codes.

## `evaluateLazy(dataset, limits?, pipeline?)`

Returns the same evaluation interface and query records as `evaluate`, resolving and caching records only when read. Both evaluators use the same record computation. Keep the dataset and pipeline immutable for the evaluation's lifetime; create a new evaluation after an input or limit change. The editor freezes imported source arrays.

`records[nodeId]` supports indexed reads, iteration and array methods. Iterating a layer resolves that layer; a single `query` resolves only the requested dependencies. Use query records for serialization.

## Compact overview rasters

`import {evaluateRaster} from './src/core/raster.js'` provides `evaluateRaster(dataset, nodeId, pipeline?)` for retained operations, including criterion and combination support. It uses the same record computation as inspection and discards each record after copying its scalar result and quality counts.

The result is `{node, grid, unit, method, values: Float64Array, quality, range}`. Values use the operation's own grid; unavailable values are NaN. `quality` is null when not supplied, otherwise `{suspicious: Uint32Array, total: Uint32Array}` over the deduplicated declared source heights. `range` is the finite minimum and maximum, or null. Combination records have no scalar value; their value array contains NaN. These are counts over declared inputs, never output uncertainty.

`evaluateLimitRasters(dataset, fields, limits?, pipeline?)` from `src/core/limit-rasters.js` classifies the cached value arrays through the declared criterion and combination `compute` functions. It returns criterion and combined maps with `states` (0 within, 1 known exceedance, 2 unresolved without a known exceedance), an independent `incomplete` mask and `stats`. Criterion maps keep their `limit`. A limit may be `null` (unset); non-null limits must be finite. The combined map lists unset limits in `unsetLimits`. A known exceedance is kept even when another branch is unavailable.

## `query(evaluation, nodeId, cell)`

`cell` is `{row, col}` on the node's own grid, or a flat index. A cell outside the grid returns `{ node, outside: true }`; it does not throw. Nodes are the ids of the evaluation's pipeline: `heights`, `slope`, `roughness` (displayed as "Height spread"), `slope-criterion`, `roughness-criterion` and `combined`, plus `illumination` and `illumination-criterion` when the dataset has an illumination period. The full editor adds `traversal-cost` and `height-support` (see below).

The returned record is JSON-serialisable:

| Field | Meaning |
|---|---|
| `node`, `title`, `kind`, `dataset`, `cell` | what was queried |
| `centreHeightCell` | the height cell under the queried result |
| `value`, `unit`, `quantity`, `available`, `reason` | numerical result, or why it is unavailable |
| `outcome`, `limit` | criterion nodes |
| `category`, `outcomes`, `branches` | combined node. `category` is `'neither'`, `'unmet'` or `'incomplete'`; `outcomes` gives each criterion's outcome. Each branch is `{ valueNode, criterionNode, unit, value, limit, outcome, origin, sourceCellCount, quality?, illumination? }` |
| `method`, `calculation`, `parameters` | producing method |
| `origin` | `{ headline, text, counts, total, rule }` (`declared` for heights) |
| `production` | supplier production declaration (method, scope, cell history) |
| `quality`, `source`, `originDeclaration` | when the dataset supplies them |
| `immediateInputs` | `[{ node, cells }]`: the declared input cells one step back |
| `paths` | every retained processing path: `{ branch, nodes, steps: [{ node, cells }] }` from source to node |
| `sourceCells` | deduplicated declared source heights (see below) |
| `inputHeightRMS` | when `heightRMS` is supplied: `{ quantity, unit, known, total, min, max, scope }` over `sourceCells` |
| `inputLolaReturns` | when `lolaCounts` is supplied: `{ quantity, present, none, unknown, known, total, text, scope }` over `sourceCells`, for example `text: 'LOLA return in 2 of 25 declared inputs'` |
| `illumination` | illumination nodes and branches (see below) |
| `sharedSourceCellCount` | combined node: sources reached by both branches |
| `boundaries` | `source` (delivery boundary text), `undocumented`, `missing` |
| `declaredNote` | declared cells are not claimed to change the numerical result |

Each `sourceCells` entry is `{ index, row, col, height, origin, branches }`, plus, when supplied: `quality: {code, label}`, `heightRMS_m`, `lolaSpots` (the LOLA return count) with `lolaReturn: {state, count, label}`, `stereoMatch`, `groundCount`, `dsmSampleCount`, and `acquisition: { inCoverage, reason, reasonCode, method, filled, fillDistance_m, maxFillDistance_m }` (simulated test fixtures only). Unknown supplied numbers are `null`.

Slope declares eight inputs: the neighbours in its 3 × 3 window, excluding the centre (zero Horn weight). Height spread declares all 25 heights in its 5 × 5 window. Combined has 25 unique inputs, eight shared between branches. A missing centre alone therefore prevents height spread but not slope.

## Supplied height evidence

`heightRMS` and `lolaCounts` are arrays on the height grid: supplier total Z RMS in metres and LOLA returns per cell. They are evidence attached to heights, not processing nodes, quality codes, missing-height masks or planner inputs. Zero is a known value; non-finite, absent or negative values are unknown. `lolaReturnState(count)` returns `'none'`, `'present'` or `'unknown'`; `lolaReturnLabel(count, vocabulary)` adds the dataset's wording; `summariseLolaReturns(cells, dataset)` and `summariseHeightRMS(cells, dataset)` give the summaries that `query` attaches. They summarise supplier values over declared inputs; they are not propagated output uncertainty.

In the editor, `height-rms` and `lola-spots` are display layers on the source grid ("Height RMS (m)" and "LOLA returns per cell"). Picking them queries the corresponding height; they add no dependency edge.

## Declared operations

Each entry of `OPERATIONS` declares `id, title, kind, grid, inputs, quantity, unit, method, calculation, parameters(ds, limits)` and `originRule`. Derived operations also declare `footprint(cell, ds) → { inputId: [cells] }` and `compute(inputs, ds, limits, records, context)`; the `heights` source operation has neither. Criteria declare `limitKey`; the combined operation declares `branches`. `acceptsUnavailable: true` lets an operation run with unavailable inputs: `combined` and `illumination` in the core, and the editor's `traversal-cost` and `height-support`. `createPipeline(ops)` orders operations and rejects undeclared inputs; `createDatasetPipeline(dataset)` chooses the pipeline for a dataset.

Operations can be defined outside the core and run through the same pipeline and queries; see `examples/smoothing.js` and `tests/external-operation.test.mjs`. The full editor defines `traversal-cost` and `height-support` in `editor/traversal-cost.js`; the paper configuration leaves them out.

## `perturbationDiagnostic(dataset, target, options?)`

From `src/core/diagnostic.js`. Changes each input height by `delta` (default 1), recomputes `target`, and reports outputs that change although the changed height is not one of their declared inputs (`undeclared`), and declared inputs whose change leaves the output unchanged (`declared.withoutChange`). Options: `operations`, `pipeline`, `limits`, `delta`, `inputs`, `maxExamples` (default 20). `declaredSourceSets` returns the declared input sets it compares against. See `tests/diagnostic.test.mjs` and the negative control in `tests/negative-control-bilinear.test.mjs`.

## Illumination (third criterion)

`illumination` reads the delivered heights directly, with per-time directional footprints. `illumination-criterion` requires a minimum percentage (`limits.illuminationMinPercent`, default 50); equality meets it. These operations run only for datasets with an explicit `illuminationPeriod`; Combined then keeps three branches. Its outcome code `exceeded` means below the minimum.

`query(...).illumination` exposes the declared period, Sun samples, per-sample source indices, separate suspicious/interpolated counts, statuses and missing-data bounds. `illuminationTrace(evaluation, cell, sampleIndex)` returns the recorded sample, ordered tested posts (distance, absolute/relative height, angle, blocking status, origin and quality code), outcome reason and contribution hours; null contribution means unresolved. Visibility is computed within the crop only. See [illumination.md](illumination.md).

Only the test fixture `lroc-nassau02-illumination` in `src/fixtures/terrain.js` has an illumination period (archived JPL Horizons samples for 3–4 October 2026 UTC). No editor case has one, so neither the editor nor the paper configuration evaluates illumination.
