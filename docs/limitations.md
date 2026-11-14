# Limitations

These limitations describe the artifact: the core in `src/core/` and the 3D editor in `editor/`, on the retained NASA and Earth cases. The paper configuration (`/editor/?paper=1`) shows a subset of the editor; see the README. Material kept only for regression tests and the earlier page is listed at the end.

## Data

- **Supplied products, not validated ground truth.** The lunar cases are NASA products used as delivered: NAC_DTM_NASSAU02 v1.9 (256 × 256 crop, 4 m spacing) and NASA PGDA 78 Site01 adjusted 5 m LDEM, "Connecting Ridge" (256 × 256 crop, 5 m spacing). No resampling, reprojection or scaling is applied. Hallmark does not assess whether a supplied height is accurate.
- **Earlier per-cell history is not supplied.** Neither lunar product delivers a per-cell acquisition or processing history, so every lunar height has the internal origin value `undocumented` (shown as "History unknown"). Hallmark does not reconstruct it. For Connecting Ridge the supplier states that surface height Z is given "with interpolation filling empty pix"; the exact interpolation donors are not supplied.
- **Supplied evidence is kept in the supplier's own terms.** Nassau keeps its raw quality codes (code 3 = Suspicious). Connecting Ridge keeps two numeric layers per cell: total height RMS in metres and the number of LOLA returns. A LOLA count of 0 is shown as "no LOLA return"; it is not relabelled as interpolated, missing or less accurate. Non-finite or negative counts are "LOLA count not supplied", never zero.
- **Every number about a crop is a crop statistic.** Counts and shares (for example in `demo/research/paper-numbers.json`) describe the shipped 256 × 256 crop, not the whole product.

## Calculations

- **Criteria, not safety.** Slope, height-spread and (where available) illumination criteria compare a value with a configured limit. Slope and height-spread limits may be unset ("No limit configured"; the combined result is then incomplete); an unset illumination minimum counts as met. The paper configuration opens with the slope and height-spread limits unset, and the default lunar limits elsewhere are scenario settings, not rover requirements. Nothing assesses traversability, wheel–soil interaction, localisation or mission risk.
- **Criterion operators.** Slope and height-spread limits are exceeded only when the value is strictly greater than the limit (`>`; equality is within). The illumination criterion is unmet when the value is strictly less than its minimum (`<`). The manuscript's worked example says "at least"; this wording is under review (plan step 1.5).
- **Height spread includes tilt.** It is the population standard deviation of the 25 raw heights in the 5 × 5 window, not residuals about a fitted plane. Its internal id is `roughness`; the interface calls it "Height spread".
- **Edge handling.** A two-cell margin is excluded (`MARGIN = 2`): the 256 × 256 lunar crops have 252 × 252 analysis results (Nuugaatsiaq 250 × 250 → 246 × 246; Blatten 200 × 200 or 400 × 400 by survey). Margin heights serve only as inputs.
- **Illumination is not evaluated on the editor cases.** The core has illumination and illumination-criterion operations, but they run only for datasets with an illumination period. No editor case has one; the illumination example exists only in the test fixtures.

## Provenance

- **Declared inputs, checked by perturbation.** The inputs of a result are those its operation declares. The perturbation diagnostic (`src/core/diagnostic.js`) changes each input height, recomputes, and reports outputs that change outside their declared inputs. It found no undeclared dependency for the core operations on a 14 × 14 synthetic grid and a 16 × 16 Connecting Ridge crop (`tests/diagnostic.test.mjs`), and it reports deliberately wrong declarations (`tests/negative-control-bilinear.test.mjs`). It tests these grids only, with one perturbation size per grid (0.5 m on the synthetic grid, 1 m on the Ridge crop); it is not a proof for every input. A declared input may have zero weight: Horn's slope excludes the centre height from its eight declared inputs, while height spread includes it.
- **Supplied evidence is summarised, not propagated.** For a derived result, the inspector reports the supplied evidence of its declared inputs as counts out of a total (for example "LOLA return in k of 8 declared inputs") and the input height RMS range with known/total coverage. These are summaries of supplier values. No uncertainty is estimated for derived results; the interface reads "Not estimated".
- **Origins are categorical.** Headline precedence (absent › undocumented › interpolated) is a display choice; the counts are retained.
- **Read-only graph.** The processing graph cannot be edited in the interface. New operations can be added in code with a declared footprint (see `examples/smoothing.js`). There is no live rover data.

## Editor features outside the paper configuration

- **Route planning is a scenario tool, not a rover planner.** The full editor runs four-neighbour A* over native cells with fixed cost constants (`editor/planner.js`), plus revisions, exclusions, local approval and Previous/Proposed comparison. It has no vehicle model and sends no commands. The paper configuration does not run the planner; it shows one fixed transect chosen by a written rule (`demo/research/paper-route-rule.md`). Its route strip reuses the planning grid, which computes a terrain cost per cell internally; that cost is neither shown nor exported in the paper configuration.
- **Editor-side operations.** The full editor adds `traversal-cost` and `height-support` (flagged input fraction) nodes to the pipeline (`editor/traversal-cost.js`). Both are hidden in the paper configuration.
- **RMS review threshold.** The optional review threshold in the full editor is an operator setting, not a supplier value or a requirement. It is hidden in the paper configuration.

## Interface

- **Accessibility is partial.** Colour is supplemented by patterns and letters, and the 3D map accepts arrow keys for selection. No screen-reader evaluation was done.
- **No user study.** No claim is made that the interface improves supervision or decisions.

## Kept for tests and the earlier page only

These are not used by the editor or the paper configuration.

- `src/fixtures/terrain.js`: controlled test terrains (for example `reference`: 32 × 32 heights at 0.25 m with 282 cells declared interpolated by synthetic delivery metadata), a 50 × 50 LROC fixture, an illumination example and a Copernicus fixture.
- `src/fixtures/lunar-data.js`: simulated lunar fixtures produced by an external terrain simulator, with stereo-match and gap-fill records. They feed regression tests and the earlier page only.
- `dist/hallmark-prototype.html` and `mockups/`: the earlier 2D page and design variants. `npm run build` and `npm run check:interactions` concern this page, not the editor.
