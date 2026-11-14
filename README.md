# Hallmark

A 3D provenance inspection editor for lunar terrain data. Select a terrain result, inspect its producing method, see its declared input heights and the evidence the supplier gives for each of them, and navigate upstream. The project follows the [visual design guidelines](docs/design.md).

## Run

```sh
npm install
npm run editor
```

Open the paper configuration at <http://127.0.0.1:8772/editor/?paper=1>. Without `?paper=1` the full editor opens; it adds route planning, an RMS review threshold and Earth cases, described in [the full editor](docs/full-editor.md).

Data preparation reads the retained local fixtures; runtime uses local Three.js r160 and OrbitControls. No CDN, web service or application framework is required. The local preview disables caching so module changes appear on reload.

## Paper configuration

The paper configuration shows the inspection features and one fixed illustrative route. Hidden features keep their code and tests.

- **Cases.** Connecting Ridge opens by default; the case selector also offers Nassau. Earth cases cannot be reached.
- **Limits.** The page opens with **Scenario limits: Not set**. Slope and height-spread criterion stages then read "No limit configured", and every Assessment (combined) result is incomplete. A limit can be entered; it is a scenario setting, not a rover requirement. Slope and height-spread limits are exceeded only when the value is strictly greater than the limit.
- **Map layers.** Assessment, Slope (°), Height spread (m), Slope limit, Height spread limit and Terrain. Supplier layers: Height RMS (m) and LOLA returns per cell for Connecting Ridge; Quality codes for Nassau. Height spread is the population standard deviation of the 25 raw heights in a 5 × 5 window, tilt included (internal id `roughness`).
- **Select a result** by clicking the terrain or using arrow keys on the canvas. The **Pipeline** graph selects a processing step; the producing method expands to show its calculation and parameters.
- **Trace inputs** shows the declared input heights of the selected result: eight for slope (Horn's method; the centre height is excluded and shown as a dashed context cell) and 25 for height spread. The spatial input grid mirrors the 3 × 3 or 5 × 5 window; select a height to navigate upstream. Branch cards on the combined result lead to each criterion and its inputs.
- **Supplied evidence** of a height, in the supplier's terms. Connecting Ridge: height RMS in metres, and "LOLA return in cell · count k", "no LOLA return" or "LOLA count not supplied". Nassau: the raw quality code and its supplier name (for example "3 Suspicious").
- **Inherited evidence** of a derived result, as counts over its declared inputs. Connecting Ridge: "LOLA return in k of 8 declared inputs" (slope) or "k of 25" (height spread), with known/total, and **Input height RMS** as a minimum–maximum range with known/total. Nassau: **Input flags** as suspicious / total declared inputs. **Derived uncertainty** reads "Not estimated": supplier values are summarised, never propagated.
- **Height flags** and **Affected results** show Nassau's code 3 on heights and on results that use them. They change only the display.
- **Illustrative route.** One straight transect along the crop's middle row, 252 cells, fixed by a written rule ([paper-route-rule.md](docs/paper-route-rule.md)). The planner does not run, and no cost is shown or exported. (The route strip reuses the editor's planning grid, which computes a terrain cost per cell internally.) The route strip shows **Max input RMS (m)** per route cell over its slope inputs; **Inspect largest RMS** selects the route cell with the largest known value. For Nassau, **Inspect flagged route inputs** selects a route cell whose declared inputs include code 3 and traces them.
- **Export** writes the selected query, the limits, the view, the route rule and the route cells with their slope, height-spread and supplied-evidence values as JSON, without cost.

Hidden in the paper configuration: planner controls, route objectives, route comparison, the RMS review threshold, the flagged input fraction and traversal-cost layers, source gaps, the palette picker and the Earth cases.

Drag to orbit, scroll to zoom and right-drag to pan. Keyboard: F focuses inputs, Shift-F fits, T gives a top view. Visible cell addresses use the height grid; exported queries keep each operation's own grid coordinates.

## Lunar cases

**Connecting Ridge**, NASA PGDA 78 Site01 adjusted 5 m LDEM: a native 256 × 256 crop at 5 m, MOON_ME / DE421 south polar stereographic. Per cell, the supplier gives the surface height, its total height RMS in metres and the number of LOLA returns. The supplier's README describes the height as "surface height Z (meters) with interpolation filling empty pix"; which heights were filled, and from which donors, is not supplied. A count of 0 therefore reads "no LOLA return", not "interpolated". Height RMS and counts never change terrain values. The window has no resampling, reprojection or scaling; preparation verifies all three array hashes offline. [Provider definitions](docs/lunar-evidence-cases.md) · [Native arrays and reproduction](fixtures/lola/connecting-ridge/README.md).

**Nassau**, NAC_DTM_NASSAU02 v1.9: a native 256 × 256 crop at 4 m. Supplier cell codes: **0** NoData/outside boundary; **1** Shadowed; **2** Saturated; **3** Suspicious (edge, corner, did not correlate, etc.); **4** Interpolated/extrapolated (e.g. from neighbouring pixels); **10–14** Successful correlation; **15** Manually edited. The legend groups 10–14; source cells and export keep the actual code. Successful correlation does not guarantee accuracy. Earlier per-cell history is not supplied, so every height has the internal origin value `undocumented` (shown as "History unknown"); this is kept separate from the quality code.

Knowledge laundering is treating supplied terrain information as reliable while the supplier's own traces of its origin qualify it, because processing (heights → slope / height spread → cost → route) drops those qualifications. The inspector keeps those traces attached to every result.

## Data

| Case | Heightmap | Supplied evidence | Shown in |
| --- | --- | --- | --- |
| Connecting Ridge | NASA PGDA 78 Site01; 256 × 256 crop at 5 m | Total height RMS (m) and LOLA returns per cell | Paper configuration (default) and full editor |
| Nassau | NAC_DTM_NASSAU02 v1.9; 256 × 256 crop at 4 m | Raw stereo quality codes and product metadata; no earlier per-cell history | Paper configuration and full editor (default) |
| Nuugaatsiaq, Greenland | ArcticDEM strip crop, 250 × 250 cells at 2 m | Edge/water/cloud bitmask and matchtag | Full editor only |
| Blatten, Switzerland | 1 m surface from 30 May 2025 and 2 m swissALTI3D (2024) | Survey source, date and method | Full editor only |

These are supplied terrain products, not ground truth. Lunar code 3 is a suspicious reconstruction flag, not an interpolation label or error probability. Height RMS is the supplier's per-cell value in metres of height; it is not slope or output uncertainty.

## Architecture

`input → Hallmark evaluation → provenance query → inspection snapshot → 3D view + inspector`

- `src/core/` owns the core operations (heights, slope, height spread, illumination, their criteria and the combined result), declared footprints, origin propagation, queries and the perturbation diagnostic (`diagnostic.js`). Eager and on-demand evaluation share the same record computation. `src/core/height-evidence.js` summarises supplied height RMS and LOLA counts over declared inputs.
- `editor/traversal-cost.js` defines two editor-side operations with their own footprints, `traversal-cost` and `height-support` (flagged input fraction). `editor/session.js` adds them to the pipeline in the full editor; the paper configuration leaves them out. Planner cost terms are in `editor/planner.js`.
- `examples/` holds operations defined outside the core: a 3 × 3 smoothing step and a negative control with a deliberately wrong declaration.
- `src/core/raster.js` creates compact value and support-flag arrays with the same record computation; `src/core/limit-rasters.js` applies the criteria to them. `editor/field-worker.js` calculates them off the main thread.
- `editor/session.js` owns the selected layer and cell, inspection history and limits (`dispatch(action)`, `getSnapshot()`). `editor/paper-config.js` defines the paper configuration and its route rule.
- `editor/spatial.js` maps layer coordinates to physical positions; source marks are projected from `query().sourceCells`. `editor/view3d.js` renders native geometry and those marks; it performs no calculations. `editor/inspector.js` presents the snapshot; `editor/app.js` connects browser events to the session.
- `tools/prepare-editor.mjs` prepares the editor data (`npm run prepare:editor`). It calls `tools/prepare-terrain-data.mjs` with the Nuugaatsiaq Earth case (the archived mockups use Voeren); that tool prepares Nassau and the Earth cases and calls `tools/prepare-lola-editor-data.mjs` for Connecting Ridge.

The central invariant: when inspection is open, highlighted source indices, inspected source rows and query inputs must match. Origin history, producing method, supplier quality codes and supplied numbers remain separate. Missing and outside-grid results stay explicit. Inputs stay immutable during on-demand evaluation; changing the heightmap or limits creates a new evaluation.

## Verify

```sh
npm run prepare:editor
npm test
```

`npm test` runs the node tests (285 on 6 November 2026). They cover eager/on-demand/overview equivalence, exact declared inputs, the perturbation diagnostic and its negative controls, an operation defined outside the core, branch separation, upstream navigation, criterion edits and equality, missing inputs, query bounds, the Connecting Ridge labels and their wording, byte-identical Nassau queries, the paper configuration and its route rule, and the full editor's planner, approval and comparison.

The editor has no automated browser test. `tests/browser-check.js`, `npm run build` and `npm run check:interactions` concern the earlier page in `dist/`. The editor and the paper configuration were checked by hand in a browser.

The numbers the paper reports for Connecting Ridge come from `node ../demo/research/paper-numbers.mjs` and are cross-checked by `uv run --with numpy python ../demo/research/paper-numbers-crosscheck.py` (run from `prototype/`).

The earlier standalone page remains at `dist/hallmark-prototype.html` and the design variants at `mockups/terrain-pipeline/`. See [the earlier interface](docs/previous-interface.md), [limitations](docs/limitations.md) and [the core query interface](docs/api.md).
