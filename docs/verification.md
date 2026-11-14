# Verification record (29 October 2026)

## Separate 3D preview revision

- 18 acceptance tests pass, including hashes proving the surface figures come from reference heights rather than stereo-recovered or filled values. The same reference geometry underlies both sunlight conditions.
- `npm run check:previews` reproduces six PNG figures and their embedded data module exactly. The figures have been visually checked for axis labels, proportions, title/caption placement and the declared vertical exaggeration. The taller controlled fixture uses an adjusted framing to prevent clipping.
- The standalone presentation check opens the preview from the user's legacy URL, switches terrain, vertical scale and view, and confirms the assessment record and URL are unchanged. Shadow-image availability follows the preview terrain, independently of the main delivery.
- The preview is a native dialog with a close form and browser-provided Escape handling. Live browser layout, focus restoration and viewport fit remain unverified because local-file browser access is blocked. The tested figures are data artifacts, not screenshots of the UI.

## Original controlled-fixture acceptance tests (historical)

| Plan check | Test |
|---|---|
| Observed slope branch and interpolated roughness branch stay distinguishable | focus cell: slope 9/9 observed, roughness 24 observed + 1 interpolated; outcomes not exceeded / exceeded |
| Combined origin reports interpolation without relabelling both branches | text "Includes interpolation through the height spread branch"; the slope and slope-criterion nodes stay observed |
| All four complete combinations | bookmarks give neither / slope / roughness / both; for every cell, the category is recomputed from raw values |
| Unavailable → explicitly incomplete | missing-height dataset: incomplete, slope outcome and value retained; exactly the cells whose 5×5 (or 3×3) window holds the absent height are affected |
| Limits change outcomes only | values, sources and origins of heights, slope and roughness are identical under other limits; outcomes change. Equality is not exceeded (tested at value and value − 1e‑12) |
| Graph paths and source cells match | query paths equal the graph paths; source cells equal independently computed 3×3 and 5×5 windows, for every cell |
| Shared sources deduplicated, both paths kept | 25 unique sources, 9 tagged with both branches, 2 paths, origin total 25 |
| Numbers match worked examples | plane z = 0.2x: slope 11.30993°, roughness 0.0707107 m; focus cell recomputed from the closed-form surface with Horn weights written out in the test |
| Determinism | repeated evaluation of all datasets is identical; query records survive JSON round-trip |

## Earlier interface — browser consistency: `tests/browser-check.js` → 42 checks, 0 failures

For each of the 7 bookmarks × 6 graph nodes, the check confirms three things: the highlighted cells in the source map equal `query().sourceCells`; the highlighted graph nodes equal the nodes on `query().paths`; and the selected graph node is the inspected node. It was run on both the module build (served) and `dist/hallmark-prototype.html`, with no console errors.

## Earlier interface — manual walkthrough

The README walkthrough steps were performed in the browser pane at 1480×1000: selection persists across mode, node, dataset and limit changes, and the incomplete assessment shows the retained slope outcome. Screenshots in `screenshots/` were captured with headless Chrome from the standalone file.

## Not verified

No user study. No screen-reader testing. Layout was checked at desktop width (1480 px) and at 800 px, where it uses a single column. It was not checked on phones. Browsers other than Chrome were not tested.

## Interface revision (29 October 2026)

- Existing 11 core acceptance tests pass after the presentation changes.
- `npm run check:presentation` checks the rebuilt standalone file in a Node VM with a minimal DOM sink. Across all 42 bookmark/node combinations it compares source-highlight cells, selected graph nodes and retained graph paths with the query records; it also checks the three overview cards and combined outcome text.
- Additional presentation checks cover the originally linked slope-criterion state, missing data, undocumented history, changes to limits, the numeric-input handler, arrow-key selection and URL state.
- These checks execute rendering logic but do not use a browser layout engine or verify visual appearance, keyboard focus, responsive layout, or screen-reader behavior. Live browser verification of this revision was unavailable because local-file browser access was blocked. Existing screenshots and browser walkthrough records above belong to the earlier interface.

### Single-view revision

The desktop layout now allocates the viewport height between compact controls, the result row, a shared graph/maps row, and the summary bar. Detailed inspection moved into a native dialog. The non-browser presentation check also exercises the Details click handler and verifies the selected-result summary is populated. Core tests and all 42 presentation states pass. Browser policy blocked reading even the existing local-file tab, so no claim of measured viewport fit or dialog focus verification is made. Narrow or very short viewports retain document scrolling for readability.

### Result-centred reorganization

- Main terrain map, selected-result inspector, local height neighbourhood and compact graph replace the three equal columns and repeated top summaries.
- The selected method and origin explanation are visible without opening the full record. The default combined example explicitly explains the interpolated height outside the slope window.
- All 11 core tests pass. Standalone presentation checks cover 42 bookmark/node states, 14 branch comparisons and all four analysis-grid corner crops. They verify all declared source cells remain in the local crop, source values match records, method/title match selection, and switching nodes resets the support comparison.
- The close-up shows context cells in neutral grey, excludes them from declared counts, and includes row/column coordinates. Full query history and the conservative-footprint note remain in the Full record dialog.
- This revision has not been rendered in a browser by the agent. Visual layout, viewport fit, focus behavior and publication screenshot quality still require a final visual check. No claim of publication readiness is based on the DOM-sink checks.

### Expanded terrain

The reference delivery now contains 32×32 heights over 8×8 m, with 282 declared interpolated cells and a 28×28 analysis grid. Broad connected patches and a narrow strip supplement the original northwest examples. All 12 acceptance tests pass, including unchanged original numerical examples, fully interpolated interiors, mixed strip support and four interpolated roughness inputs outside an observed slope window. Standalone rendering checks pass 66 bookmark/node states, 22 branch comparisons and four boundary crops. They additionally verify URL restoration at analysis cell (27,25) and keyboard clamping at (27,27). These remain non-browser checks; the previous visual-verification limitation still applies.

### Terrain/source alignment repair

A failing rendered-geometry check reproduced the mismatch: the selected analysis cell (7,3) was drawn at x=38.5714 on a stretched 28-column map, while its corresponding height cell (9,5) belongs at x=56.25 in the 32-column delivered frame. Exhaustive checks of 3,920 reference derived-cell queries found correct declared source windows; the issue was presentation, not numerical support.

All terrain layers now share the delivered-height frame and coordinate labels. Derived layers retain a grey unassessed border. Matching selected-cell outlines appear in both views, and the terrain map outlines the source footprint. URL and API indices are unchanged. The presentation regression invokes registered click handlers at four locations (including both corners) across all six layers, verifies the selected cell-to-source conversion, stable cell geometry, matching centre markers and exact footprint bounds. All 24 cases pass alongside the existing checks. Browser-level visual verification remains outstanding.

### Inherited versus source-origin comparison

The screenshot centred at height (7,7) was reproduced with the undocumented delivery: 24 supporting heights are observed, while (5,5) is undocumented and enters only through roughness. The centre height is observed, but the combined output inherits undocumented history. Hovered result (7,9) is independently observed. This is correct propagation, not a remaining index mismatch.

The map now names Inherited origins separately from Source origins and explains the active semantics above the map. Source origins retains the inspected derived result while displaying the exact source-height categories. A failing comparison regression was added before implementation; it now passes for the screenshot and all bookmarks, including absent heights. The selected-result explanation names the single undocumented input and responsible branch. Existing tests remain green; these checks do not substitute for browser visual QA.

### Clearer origin labels

The map controls and headings now use Height origins and Origins of supporting heights. Inline explanations distinguish one height's recorded origin from the summary over every supporting height; the close-up and inspector badge name their scope explicitly. Existing mode keys remain unchanged for saved links. Build and presentation checks pass, including assertions for both labels, explanations and the source-height badge.

## LunarBlock generation revision

- `npm test`: 16 tests pass, including per-height matching/filling invariants, shadow-filled estimates differing from truth, the same-location sun comparison and shadow support entering through roughness alone.
- `npm run check:lunar`: both generated exports reproduce byte for byte, including source hashes. Filling is replayed from matched heights. Replacing the truth array does not change delivered values.
- The shared-scale data figure exposed gross false matches with the simulator’s regional ±120 m search prior. Generation now explicitly uses a ±12 m prior around zero for this small scene. Fixed-scene grading guards against recurrence; neither corrections nor origins use truth. Matched-height mean absolute error is about 0.082 m in both runs. Filled-height mean absolute error is about 0.531 m at 5° and 0.443 m at 25°.
- The rebuilt standalone passes 84 bookmark/node states, 28 footprint comparisons, four corner crops, 24 original map-click geometry cases, plus three 64-grid click cases and the 64→32 grid switch. It verifies a fresh page chooses the new LunarBlock example, acquisition records are visible and no negative SVG sizes are produced by dense-map markers.
- `figures/lunar-deliveries.png` is visually inspected as a data figure. Browser layout and viewport fit remain unverified; these checks use a DOM sink, not a browser renderer.

## Terrain and shadow view

- 17 acceptance tests pass. The added raster check decodes the embedded PNG, checks image/grid dimensions and sun settings, verifies fractional shadow coverage, and confirms geometric shadows are not equated with dark-patch matching failures.
- Generation compares the visualization shadow field exactly with the acquisition pipeline's fine shadow field. The PNGs, browser data and audit file regenerate byte for byte. Delivered values, origins and acquisition records are unchanged from the preceding revision.
- Presentation checks cover fill-outline counts against producer records, overlay visibility, retaining the selected result across input views, changing sunlight/delivery, restoring terrain and overlay state from a URL, and gracefully falling back for legacy fixtures without terrain imagery.
- Both generated terrain PNGs were visually inspected. The main interface still has no live browser layout verification; the existing local-file access restriction remains.

## Actual versus heightmap comparison

- 19 acceptance tests pass. Reference and delivered-height hashes establish that each panel uses its intended numerical array; shared axis limits, absent counts, finite-value error summaries and exported images are checked. All five deliveries have separate comparison records, including the legacy missing-height case.
- The preview defaults to comparison mode. Presentation checks cover this default, scale and delivery changes, the reference-only and shadow views, fallback from unavailable shadow imagery, and unchanged analysis state/URL throughout preview interaction.
- All twenty figures regenerate exactly. The low-sun, high-sun and missing-height comparison figures were visually inspected. Live browser layout remains unverified.

## Full original LunarBlock scene replacement

This revision supersedes the earlier simplified LunarBlock fixture and the earlier claim that its sampled reference grid was the actual generated scene.

- The adapter executes the original `main.js` terrain generation and heightmap builder with Three.js 0.160.0, plus the original terrain, detail and production workers. It retains seed 2217320, the 100 m area and default scene/heightmap settings. Original geometry contains 68,121 ground vertices, 74 rocks and 240 pebbles. Source files are hashed; the local LunarBlock checkout is not edited.
- The saved heightmap job contains the exact 5,276 rock/pebble triangles exported to the scientific scene. Tests verify every triangle, catalogue-crater parameter, seed, heightmap spacing, relief setting, scene hash and detail-normal hash. Both sun deliveries reuse one reference job.
- 20 acceptance tests pass. They check actual matching/filling records, sampling/reconstruction provenance, exact errors, absent geometry, and original core behavior. No truth-based correction or narrow stereo-search override is used. Deep low-sun interpolation errors are preserved and reported.
- `check:lunar` reproduces the data, geometry, normal field, worker job and acquisition images byte for byte. `check:previews` verifies 24 scientific figures and their embedded bundle. Preview hashes distinguish original mesh geometry from sampled reference and delivered grids.
- Presentation checks pass 84 bookmark/node states, 28 branch comparisons, four corner crops, map-click geometry, the new 50-cell grid and legacy transitions. The preview defaults to the full LunarBlock scene versus its sampled heightmap at ×1, even from an older controlled-test URL. Switching to delivered heights, shadows, legacy fixtures and other scales preserves analysis state and URL.
- Full-scene, sampled-grid and delivered-grid figures were visually inspected. They share physical coordinates, datum, viewpoint and scale. Scene geometry is shown with neutral scientific shading; rover, decorative base and original material styling are outside this terrain preview. Live browser layout/overflow verification remains outstanding due to the existing local-file access restriction.

## Spire exclusion

- Removed exactly one spire from the generated scene before invoking the original heightmap builder. Seed 2217320, scene settings, sampling settings, camera, coverage and both sun elevations are unchanged. The exclusion is explicit in the scene signature and delivery metadata.
- Compared the regenerated scene with the pre-change export: every ground vertex, hill, crater, ordinary boulder, pebble and detail-normal record is identical. All 73 ordinary boulders and 240 pebbles remain, including nearby ordinary rocks. Removing the spire does not rerun or shift placement decisions.
- Both sampled and stereo-delivered heightmaps are regenerated from the filtered scene. The worker now rasterizes exactly 5,250 triangles from the retained boulders and pebbles. Tests reject any spire in the export and still compare every retained triangle to the worker job.
- Low sun now yields 1,207 matched, 542 filled (522 shadow-related), and 751 absent heights; high sun yields 1,610 matched, 139 filled (118 shadow-related), and 751 absent heights. These are recomputed outputs, not edits to the old heightmap.
- After regeneration, all 20 acceptance tests and the rebuilt standalone's presentation checks pass. `check:lunar` reproduces the filtered scene and both deliveries exactly. The updated scene-versus-sampled figure was visually inspected; the pillar is absent from both panels.


## Input-selector removal

- Removed the Terrain & shadows / Height origins input selector, main-map image rendering, filled-height overlay, related handlers and CSS. Processing step → Result is now a two-control row. Heights → Height origins remains available through the result control; derived origins still summarize declared support.
- The separate 3D preview and its acquisition image remain. Its embedded scientific images still account for approximately 8 MB; removing the input selector is not evidence of a large load-time improvement. No live-browser performance claim is made.
- Old terrain/source-view links migrate to the selected step's values while preserving dataset, cell and limits. Fresh LunarBlock bookmarks open assessment mode. No delivered heights, origin labels or producer records change.
- All 20 acceptance tests and the presentation check pass. Checks cover both result views, individual versus inherited origins, retired links, removal of the old controls/rendering, and the retained 3D preview. Live browser layout remains unverified.


## On-demand preview loading

- Initial HTML is 327,048 bytes (319.4 KiB), down from approximately 8.5 MB. No preview PNG bytes, scientific-preview module, preload link or startup preview request remain in the page. The acquisition PNGs are also excluded from the initial dataset.
- First opening loads a 5,294-byte classic-script index, then only the selected image. File and HTTP paths are resolved relative to that index. Other views use separate PNGs with content hashes in their names. The index is cached, simultaneous opens share one request, and failed loading permits retry. Preview files must remain alongside the HTML in `dist/preview/`.
- All 23 acceptance tests pass, including zero startup requests, concurrent loads, cache reuse, failed/missing-index retry, a 400 KiB initial-bundle budget, and exact byte comparisons for all 24 scientific figures plus two acquisition PNGs. Source geometry, delivered heights and origin records remain unchanged.
- Presentation checks pass, including a main-interface render during a pending preview request, first-open failure, retry, image error, cached reopening and preserved analysis state/URL. Browser load-time and interaction benchmarks remain unmeasured; the measured improvement is initial document size and the tested request boundary.


## Cell-selection and processing-step performance

The red-capable loop is `node tools/profile-interactions.mjs --check`. It runs the actual UI handlers using a DOM sink and rejects full-map replacement on selection, rebinding per-cell listeners, repeated cached-layer construction, unnecessary reevaluation, or rendering a closed Full record. Initial run failed with `Selecting a cell must not replace the full map (1 !== 0)`.

Baseline (50×50 LunarBlock fixture, combined assessment): each cell interaction replaced about **841,331 bytes of map markup**, rebound **2,116 cell handlers**, and generated approximately **19,214 bytes** for the closed Full record. The map-render function consumed about **2.6 ms** of JavaScript/string work in this sink; all numerical evaluation was already reused. Browser SVG parsing/layout/painting was not measured and would add work beyond this timing.

Changes:

- Separate retained map content from its selection/support overlay. Selection writes approximately **530 bytes** to that overlay; it does not replace or swap the main layer.
- Retain SVG layers by processing node and result mode for the current evaluation (at most twelve). Switching back reuses the actual detached DOM, not merely a markup-string cache. Changing dataset or limits invalidates these layers. The first visit still constructs that layer.
- Delegate clicks to one map listener. Use interactive rectangles with their existing native titles, omitting redundant per-cell group wrappers. Labels and absence marks remain non-interactive, so clicks reach the rectangle beneath.
- Build the long details table and JSON only on opening Full record; update it while open. Keep visible summaries current on every selection. Reuse the unchanged source legend.

After the change, map-render work on selection is approximately **0.04 ms** in this sink. Cached processing-step interactions measured approximately **0.26 ms median / 0.31 ms p95** in a 30-interaction run. These are JavaScript/sink measurements, not browser interaction-to-paint timings; wall-clock budgets are deliberately not used as flaky acceptance gates. Selection timing in this harness also includes looking up a synthetic click target.

All **26** acceptance tests and presentation checks pass. New tests exercise real click/step handlers, layer identity across cell changes and all twelve views, evaluation reuse, cache invalidation after limit/dataset changes, matching map/support coordinates, and on-demand Full record freshness. The original workload regression now passes. Performance probes stay in the test harness; no debug instrumentation is shipped in the interface.


## Graph selection and visualisation style

- Removed the processing-step dropdown and duplicate result-card selection buttons. The map offers only Visualisation style. Graph selection preserves that style and the selected cell; cached layers and evaluation remain reused.
- Added a labelled link that moves focus to the selected graph node. The graph follows the WAI-ARIA radio-group keyboard pattern (https://www.w3.org/WAI/ARIA/apg/patterns/radio/): one checked radio, roving tabindex, wrapped arrow-key selection, Space activation, and normal Tab exit. Enter and Home/End are supported as additional shortcuts. Accessible names include the visible step label and a readable result/origin description. Focus survives graph redraws; changing style does not steal it. Visible focus and forced-colour styles are supplied.
- Removed the explanatory legend text and the visible coordinate note beneath it. Legend keys remain; map keyboard instructions are available through aria-describedby without inserting a visible note.
- 29 acceptance tests cover graph pointer/keyboard selection, selected-state semantics, style retention, entry and exit, focus after redraws and current map/graph labels. Presentation and interaction-workload checks also pass. This verifies behavior and markup with a DOM sink; browser rendering and live assistive-technology evaluation are still outstanding, so this is not an accessibility-conformance claim.
## Graph above the map and compact view choices

- Moved the graph before the map in both document order and desktop/responsive layouts. The map heading names the selected processing step; the graph explicitly controls the map and selection summary.
- Replaced the stretched dropdown and graph-jump link with a labelled fieldset containing native radio choices. Values/Assessment and Input origins/Height origins adapt to the selected step. Checked styling, keyboard focus and forced-colour styling distinguish the selected view. Supporting-height semantics remain available through an accessible description.
- All 30 acceptance tests, presentation checks and interaction workload checks pass. Style changes preserve step, location, evaluation and focus; graph changes preserve style. Map caching and lazy previews remain intact.
- Verification uses the DOM sink and source inspection. Browser layout, native radio keyboard behaviour and rendered focus styling have not been visually verified in this environment.



## Paper title and header controls

- Header and document title now use “Hallmark: Preventing Knowledge Laundering in Terrain Map Pipelines”. Removed the simulation metadata strip and its render handlers; selected height-cell coordinates remain in the inspector.
- Delivery and Example use labelled native selects of matching height, followed by a separate 3D preview button. The header wraps on narrow screens. Existing keyboard focus styles and demand-loaded preview behaviour remain in place.
- All 30 acceptance tests, presentation checks and interaction workload checks pass. Verification remains source/DOM-based; live browser appearance has not been verified.


## Inspector refinement

- Removed the processing graph's accent border. Condensed the inspector header and result summary, placed the method beside its result, and removed repeated height-cell coordinates.
- Kept individual height origins distinct from origins of supporting heights. Simplified the source-grid caption and removed repeated context text inside neighbouring cells; grey styling, explanatory text and per-cell tooltips retain the distinction.
- The main acquisition explanation omits the interpolation recipe; Full record retains the complete filling method. Assessment cards and support notes use consistent, quieter typography.
- All 30 tests, 84 bookmark/node presentation states, branch/crop/click checks and interaction workload checks pass. Live browser layout remains unverified.


## Compact height neighbourhood and support view

- Bounded the source SVG to its natural grid dimensions (196 px for 3×3, 308 px for 5×5), shrinking to fit the available space. Heights are shown on plain cells with narrow patterned origin strips and letter codes; the selected centre and branch outlines retain their coordinates.
- Heights now shows a Height neighbourhood with an explicit statement that interpolation inputs are not traced. Derived views retain Supporting heights, count the origins of actual inputs and label comparison modes explicitly. Native radio inputs replace the previous custom comparison buttons.
- Presentation checks exercise the real comparison handlers and confirm source membership, coordinates, default selection, compact source sizing and the interpolation boundary. Browser layout remains unverified.


## Result-origin map versus individual height origins

- Reproduced the reported screenshot exactly at low-sun height cell (14, 37), value 2.073 m: all 25 inputs in rows 12–16, columns 35–39 are observed. The result at height cell (16, 35) is nevertheless yellow because its own support includes interpolated heights at row 18, columns 34–37. This is a difference in what the two views encode, not a coordinate mismatch.
- Map metadata now explicitly says colours summarise each result’s inputs; the close-up says Individual height origins. Numerical data and origin propagation are unchanged. The actual height-origin map remains available by selecting Heights in the graph.
- Shortened acquisition summaries, omitted the redundant centre-height sentence and moved combined-method/shared-input metadata into Full record. Missing-input and branch-specific dependence are retained.
- Added screenshot-coordinate regression coverage through the real rendered map and source cells, plus a concise-summary/detail-retention check. Both tests failed on the previous labels/text and pass after the change. All 32 tests and the interaction checks pass. Browser appearance remains unverified.


## Matching origin grids (supersedes the separate-encoding design above)

- Height origins now consistently displays the delivered height origin at each coordinate, for every graph step. Overview cells, legends and hover text use the source-height records; aggregated result origins remain in the inspector and Full record. Assessment/value map rendering is unchanged.
- Local context cells now retain their own origin strips and letters, while their backgrounds, tooltips and input outlines distinguish context from declared support. Context heights are not added to input counts. Border heights retain their actual colours even though those centres cannot be assessed.
- The screenshot cell now has matching observed origins in both grids. Regression checks compare every rendered local cell, including context and boundaries, against the overview across all examples, six graph steps and three footprint choices. All four origin states are covered.
- All 33 tests, presentation checks and interaction workload checks pass. The earlier colour-mismatch test failed before this change and passes now. Live browser appearance remains unverified.


## Paper alignment and branch-specific interpolation

Reviewed `demo/paper/sections/worked-example.tex`, `pipeline.tex`, `inspection.tex`, `prototype.tex` and the relevant introduction/discussion text against the standalone core and interface.

- The declared-support contract matches: source origins remain distinct from production methods, slope and roughness retain separate 9/25-cell support, both criteria preserve origin history, and the combined query deduplicates shared source heights.
- Matching origin grids deliberately show individual source records. This differs from the manuscript’s propagated map-label overlay. Result-origin summaries are preserved in cards, Full record and now badges throughout the graph. The standalone is a focused demonstration, not the full simulator/planner/evidence-scale implementation described in the paper.
- Each branch card now states its method, exact interpolated count over declared support, and numerical role. Horn uses eight gradient neighbours and has zero centre weight; roughness uses all 25 heights in the mean/spread calculation. Unavailable inputs remain explicitly unavailable. Support descriptions do not claim a numerical error or counterfactual change.
- Added rendered-interface checks for the paper’s eastern-neighbour example (atan(1/8), about 7.1 degrees, interpolation retained below the limit), interpolation only in the outer roughness region, persistence after raising thresholds, undocumented/absent inputs, and an interpolated centre whose perturbation changes roughness but not slope.
- **Pre-existing threshold discrepancy remains:** `worked-example.tex` says “at least 15 degrees” (>=); the standalone criterion is explicitly value > limit, with equality not exceeded. This was not changed during the provenance-presentation update and must be reconciled before claiming exact equivalence. The paper source was not edited.
- Browser appearance and screen-reader use remain unverified; automated rendering checks use a DOM sink.

## Wider stereo coverage and bounded filling (2026-10-29)

This supersedes the earlier default-width coverage and unbounded filling descriptions.

- Widened both stereo footprints from 35 m to 80 m across the 100 m site. Seed 2217320, original terrain geometry, ordinary boulders/craters, camera, matcher, sample spacing and sun angles are retained. No missing regions are painted into the data.
- Refilled from original stereo matches with an explicit 4 m eligibility bound along covered four-neighbour paths. Newly interpolated posts cannot expand eligibility. The original nearest-seed/60-pass smoother runs only on eligible posts; this limit does not bound all donor influence through smoothing.
- Low sun: 1,655 observed, 387 interpolated (263 shadow-related), 458 absent (116 outside coverage; 342 beyond the filling limit). Higher sun: 2,228 observed, 112 interpolated (80 shadow-related), 160 absent (100 outside coverage; 60 beyond the limit). No interior column is entirely absent. Undocumented history is not inferred from acquisition failure.
- Verified the pre-change scene, heightmap job and detail-normal compressed files are byte-identical; scene hash remains `2d1693f0641dc9e2214ceb07f01d050cf0f16859f19b30d0c95e07dbd8e6d2d5`. All 2,500 sampled reference heights are exactly unchanged. Both sun deliveries still reuse one original reference job.
- Regenerated fixture records, top-down acquisition images, all 24 scientific previews and standalone HTML/lazy image assets. Inspected both delivered comparison figures and an origin-grid diagnostic: the central coverage strip is gone, and missing interiors align with localized failure regions. The preview surfaces omit faces needing absent heights.
- Inspector text and Full record distinguish covered failures beyond the filling limit from locations outside stereo coverage. The record includes coverage, distance to an original match and the limit. Matching-origin grid and branch-support checks remain in place.
- Passed all 41 tests; exact `check:lunar` and `check:previews` regeneration; 84 bookmark/node states, 28 branch comparisons, 4 boundary crops and 24 click-handler geometry cases. The former all-interpolated LunarBlock summary fixture is no longer possible under the bound; its summary check now uses the real partially interpolated focus example, retaining method/shared-input assertions.
- Interaction checks pass: cell-selection JavaScript median 1.09 ms (95th percentile 2.47 ms); step-selection median 0.31 ms including first visits, 0.32 ms cached. These are DOM-sink timings, excluding browser layout and paint. The main HTML is 361.3 KiB; previews remain demand-loaded. Live browser layout remains unverified.
- Updated generation documentation and limitations. The manuscript is unchanged.


## Explicit output support and source origins (2026-10-29)

Supersedes “Matching origin grids”: matching colours everywhere hid provenance propagation. The graph now selects the mapped records in both Values and Origin support. Heights uses delivered origins; derived steps use the selected node’s per-cell support summary. Legends distinguish “Interpolated height” from “Uses interpolated heights”, and subtitles identify the encoded quantity. Tooltips retain mixed-origin counts behind the headline precedence.

The close-up retains each individual height’s origin and names the result it supports. Interpolation counts use declared inputs, with separate slope/roughness counts for Combined. Context heights are excluded. Matching solid slope/dashed roughness outlines and the same selected centre connect the views without implying matching colours. Horn’s zero centre weight remains explicit in the branch card. No calculation, source data, preview or manuscript content was changed.

Validation: all 42 tests passed, including per-result map colours across all bookmarks and six steps, every local origin across three footprint choices, an observed centre with interpolated support, roughness-only propagation through criteria/Combined, absent and undocumented support, keyboard focus and style/selection persistence. Presentation checks passed 84 bookmark/node states, 28 branch comparisons, four boundary crops and 24 click geometry cases. Interaction workload checks retain evaluation/layer caching and on-demand details/previews. Cell-selection JavaScript median was 1.07 ms; cached step median 0.34 ms, excluding browser layout/paint. Standalone rebuilt at 362.8 KiB. Verification uses the DOM sink; live browser layout remains unverified because local-file browsing is unavailable.

## Linked branch maps for Combined (2026-10-29)

- Replaced the Combined aggregate map with a slope-criterion map and a roughness-criterion map. Values shows each criterion outcome; Origin support shows each branch's declared source-origin summary. Combined outcomes and deduplicated provenance remain in the inspector and query API.
- Both maps use the same scale, delivered-height coordinates and one selected analysis cell. Clicks and arrow keys in either synchronize both centre markers and the inspector, with keyboard focus retained. Each map keeps its own 3×3 or 5×5 footprint even when the close-up compares a different branch.
- Added a second map renderer using the existing cached-layer function and distinct SVG pattern IDs. Cell selection updates only two small overlays; it does not rebuild layers or recompute results. Switching to an individual step restores the full-width single map. Saved Combined links open the paired view without changing their state format.
- Layout uses two equal columns inside the existing flexible map area, bounded by the same desktop viewport layout, with one shared legend. No extra vertical panel or scroll container was added. Narrow-window/high-zoom accessibility fallback remains. Live viewport overflow and visual appearance are unverified because local-file browser access remains unavailable; DOM checks cannot establish browser layout correctness.
- Passed all 45 tests. New checks compare every painted cell in both maps against independent branch records across all datasets and both styles, including absent and undocumented inputs. They exercise actual click and keyboard handlers in both maps, corner selection, retained focus, layer caching, saved links, branch-specific footprints, limit changes and single-map restoration.
- Passed the 84-state presentation check, 28 footprint comparisons, four boundary crops and 24 geometry cases. Interaction workload checks pass: cell-selection JavaScript median 1.09 ms, cached graph-step median 0.28 ms, excluding layout/paint. Standalone rebuilt at 367.0 KiB; preview loading and terrain generation are unchanged.


## Combined overview with optional Compare (2026-10-30)

Supersedes the default paired-map presentation above. Combined now opens one overview with an explicit all-criteria rule. Failure fill/exclamation and incomplete hatching are independent; a known failure remains visible when another branch is unavailable. Origin support uses the combined declared sources. The compact criterion list always shows branch values, limits, outcomes and all nonzero origin counts. No numerical calculations, source data, previews or manuscript text changed.

Compare opens the existing synchronized branch maps in the same flexible map area. Returning preserves the cell and style and reuses the evaluated records and cached layers. Saved Compare links use `compare=1`; old Combined links open the overview. Native buttons expose comparison state, criterion inspection transfers focus to its graph node, and returning transfers focus to the persistent Compare button. No extra vertical panel or scrolling container was introduced. Desktop viewport sizing and the accessible small-window/high-zoom fallback remain.

Validation: 49 tests passed, including every overview cell across all datasets and both styles, all 27 three-criterion outcome combinations, known failure plus missing result with mixed source origins, Compare navigation/state restoration and criterion inspection/return. Existing linked-map, origin propagation, numerical, keyboard and demand-loaded preview checks pass. Presentation checks passed 84 bookmark/node states, 28 footprint comparisons, four boundary crops and 24 click-handler geometry cases. Interaction checks passed: cell-selection JavaScript median 1.30 ms, cached step median 0.30 ms (DOM sink; excludes browser layout and paint). Build: approximately 371 KiB standalone HTML, with preview assets still loaded only on demand.

Live viewport fit and visual appearance remain unverified: the browser tool reports “Local browser use is disabled in Work settings.” No alternate browser or server was used to bypass that setting.

## Illumination criterion — 2026-10-30

Added an illustrative 12-hour illumination period (12 hourly midpoint samples), a minimum illuminated-time criterion, and a third branch in Combined. Directional terrain dependencies are retained per time sample; suspicious quality flags and declared interpolation remain separate. Unavailable per-height interpolation history remains unavailable rather than becoming a zero count. Missing heights leave unresolved samples unless known terrain already establishes shadow.

Validation: all 73 automated tests pass. The presentation audit passes 144 dataset/step/location states, 144 source-support checks, 216 per-time dependency checks, and 8 shared keyboard selections. After the final selected-time evidence wording change, both illumination UI tests pass and the standalone build succeeds.

Interaction checks pass: cell selection JavaScript median 4.69 ms (95th percentile 7.13 ms); cached processing-step changes median 3.08 ms (95th percentile 5.09 ms). These exclude browser rendering. Illumination evaluation is cached across threshold changes and invalidates when terrain, evidence, or period changes.

The existing two-map layout is retained with compact period controls and three criterion cards. Browser layout, actual scrolling, and paint performance could not be verified because local browser use is disabled. The Sun schedule is illustrative, not a lunar ephemeris; terrain outside the delivered crop is excluded. See [illumination model](illumination.md) for assumptions and limitations.

## Separate JPL illumination example — 2026-10-30

Supersedes the illustrative-period integration above. The original Nassau, LunarBlock and controlled deliveries now use six-node slope/roughness graphs. Only `lroc-nassau02-illumination` adds the third criterion. Regression checks compare the original Nassau records before and after evaluating the new delivery and compare its unchanged source, slope and roughness records with the new example.

The archive contains 24 NASA/JPL Horizons hourly midpoint Sun positions for 2026-10-03 12:00 through 2026-10-04 12:00 UTC. Checks verify the response SHA-256, Sun/Moon identifiers, DE441 and mean-Earth frame, exact source angles, UTC bin coverage and crop-coordinate derivation. The fixed preview uses the archived 2026-10-04 00:30 UTC position. It was visually inspected as a standalone scientific figure. Its lazy-loading test verifies a single scale, a disabled view selector and unchanged image after cell/scale events. The period timeline has no time selector or lighting controls.

All **76 tests pass**. The presentation audit passes **132 states**, **132 source-support checks**, **72 per-time evidence checks**, and **8 shared keyboard selections**. The interaction check passes for both LunarBlock and the new illumination example: cell-selection JavaScript medians 1.43 ms and 2.91 ms respectively; cached step medians 0.33 ms and 0.64 ms. Browser layout, actual scrolling and paint remain unverified because local browser use is unavailable. The same permanent two-map layout is retained; the read-only timeline adds no maps.

Standalone build: about 474.4 KiB. The fixed preview remains external and loads only when opened. Rebuilding the ephemeris fixture from the archived response succeeds without network access. See [illumination.md](illumination.md) for physical scope, frame and temporal-resolution limitations.

## Recorded timestamp inspection — 2026-10-30

The dated illumination example now offers an archived-timestamp selector plus an All samples option. This supersedes the earlier absence of a timestamp control; the control inspects recorded calculations, not an arbitrary Sun position. Timestamp changes retain location, evaluated period records, both cached map layers and the fixed preview. Both map overlays and the source grid show the exact sample footprint and Sun direction. The profile shares the existing source area, plots evaluated heights relative to the target and marks posts that block the Sun line. Below-horizon samples test no heights; missing heights appear as gaps with unresolved contribution.

All 79 automated tests pass. New analytical tests verify ordered original posts, metric distances, relative heights, blocking angles, independent quality/origin evidence, contribution hours, night and missing data. UI tests exercise the actual selector handler, focus restoration, UTC URL round-trip, invalid indices, exact per-sample source membership, synchronized arrows, period-layer retention, criterion tracing, return to all samples, original-example isolation and fixed preview preservation. The presentation audit passes 132 states, 132 support checks, 72 sample evidence checks and eight shared keyboard selections. Interaction checks pass without evaluation or full-map rebuilds during selection.

Standalone document is approximately 484.3 KiB. Desktop flex/grid constraints and a side-by-side source/profile layout reuse the existing inspector space. Browser layout, scrolling and painting remain unverified because local browser use is unavailable. Small-screen responsive fallback remains available. The standalone profile SVG was generated for inspection, but no SVG rasterizer is available in this environment; geometric/semantic assertions are automated, not a substitute for browser visual review.

## Original height inputs → calculated results — 2026-10-30

The left pane now renders the full original elevation grid in greyscale, with independent per-height suspicious-quality markers, transparent interpolation hatching, undocumented-origin markers where applicable and missing-height crosses. It no longer renders propagated evidence at result locations. LROC quality flags still do not establish interpolation. The right pane retains calculated values or criterion outcomes. Original evidence remains visible when a height is not used by a particular calculation; membership is conveyed by the exact input outline, not by changing that height's evidence.

Only the input pane receives dependency outlines and recorded-time Sun arrows. The output pane's selection overlay marks one output cell. Exact contour tests include the unused centre hole in slope's eight-height support. Input layers are shared across graph steps; both map coordinate frames remain fixed, with matching 88 px legend tracks. The existing two-pane layout and inspector remain in use; no additional permanent map was added.

All 80 tests pass. Tests verify every input cell's original value/origin, original marker counts, unchanged input layers across steps, exact source contours, output-only selection, synchronized location, separate coexisting quality/interpolation overlays, time inspection and the fixed preview. The presentation audit passes 132 states, 132 source-support checks, 72 time-evidence checks and eight keyboard selections. Interaction checks pass: median cell-selection JavaScript is 1.49 ms for LunarBlock and 2.88 ms for the dated LROC example; cached step changes are 0.39 ms and 0.56 ms. Browser painting and viewport scrolling remain unverified because local browser use is unavailable.

## Graph-stage result/evidence pairs — 2026-10-30

Supersedes the combined elevation/evidence overlay above. Heights shows input elevations followed by individual height evidence. Calculators show their numerical result followed by propagated evidence. Criteria show the upstream calculator's evidence followed by the criterion outcome. Combined shows combined evidence followed by combined outcome. The criterion's evidence layer is the same cached layer as its upstream value's evidence. No quality/origin translation or numerical recalculation was introduced.

Both map overlays now identify the selected result location only. Exact source footprints, recorded-time arrows and terrain profiles remain in the inspector. The two-pane dimensions and fixed preview remain unchanged. Removed overlay rendering and legends are no longer present in the source/build.

All 80 tests pass, including each stage's DOM order, labels, per-cell evidence, layer reuse, selected coordinates and inspector source counts. The presentation audit passes 132 states, 132 source checks, 72 sample checks and eight keyboard selections. Interaction checks pass with cached-step JavaScript medians of 0.32 ms (LunarBlock) and 0.52 ms (dated LROC). Browser layout and scrolling remain unverified. Standalone build is approximately 483.3 KiB.

### Suspicious support counts — 2026-10-30

Derived quality maps now show absolute suspicious supporting-height counts; source maps retain published categories. Tests compare every rendered count with its record across graph stages and datasets, check distinct count colours, and match a selected 5/25 count with the criterion report. The confidence disclaimer is verified. All 81 tests pass. Presentation checks pass across 132 states, with 72 timestamp dependency checks and 8 keyboard selection checks. Interaction checks pass. Existing panel dimensions are unchanged; browser layout and scrolling remain unverified because browser access is unavailable.

### Trace highlights — 2026-10-30

Used source heights with published quality code 3 now have a purple tint, border and explicit Suspicious label in the close-up. Context heights are excluded, including the unused slope centre. The source context reports the highlighted count. Tests check highlighted membership and agreement with the selected slope, roughness and combined records. All 82 tests and the 132-state presentation audit pass; browser layout remains unverified. No panel dimensions changed.

### Immediate supporting heights — 2026-10-30

Removed the trace disclosure and placed compact outcome evidence above the always-visible height grid. Combined selects one branch (slope by default), with criterion cards controlling both grid and explanation. Tests cover immediate visibility, legacy URLs, branch switching without changing map/evaluation, exact highlighted input membership and separate quality/production labels. Presentation audit: 132 states, 132 supporting-height checks, 72 timestamp checks, 8 keyboard selections; interaction checks pass. Desktop flex sizing is retained with a compact explanation; actual browser scrolling is unverified because browser access is unavailable.

### Inspector deduplication — 2026-10-30

Criterion outcomes and evidence counts are shown once in the compact support summary, directly above supporting heights. The duplicate heading outcome is removed, source context no longer repeats the suspicious count, and Combined criterion controls show names only (their detailed card bodies are hidden from display and accessibility). The overall Combined outcome remains distinct from the selected criterion outcome. Edit limits remains available in the inspector header. All 83 tests and the 132-state presentation audit pass; the final summary-copy adjustment also passed 10 focused tests. Browser layout remains unverified.

### Primary assessment with evidence markers — 2026-10-30

Default view is now one result map. Independent suspicious/interpolated/missing markers retain the original outcome fills. Tests verify each marker count against actual supporting records for LROC, LunarBlock and missing-data fixtures; Compare toggles visibility without replacing the result layer or evaluation and retains keyboard focus. The 84-test suite had one stale metadata-label expectation; after updating that expectation, the focused interaction tests pass. The 132-state presentation audit and interaction performance checks pass. Browser layout/scrolling remains unverified.

### Linked selection emphasis — 2026-10-30

Both maps now share a dark selected-cell outline with a white halo and four short crosshair arms. Non-scaling strokes preserve contrast when maps resize; no fill obscures the selected result. Selection overlays remain pointer-transparent. Eight focused tests pass, including identical overlays and coordinates at interior and boundary cells. Panel dimensions are unchanged; browser visual verification remains unavailable.

## Lunar categorical and numeric source evidence (5 November 2026)

Nassau is the editor default, retaining `case=moon` and existing Earth case links. Connecting Ridge is a separate 5 m NASA PGDA 78 native fixture with independently retained total height RMS and LOLA spot counts. The source table, immediate height grid and query expose the actual supplier evidence; full source documentation distinguishes all Nassau codes and groups 10–14 only for the map legend.

Focused tests verify all three retained array hashes, bit-for-bit Float32 equality to the JSON fixture, source-window geometry and half-cell centre registration, separate counts rather than native-height gaps, exact Horn/roughness/cost support summaries, unknown versus zero including absent height with known evidence, categorical visibility, numeric map values and selection/route traces, and terrain-cost/route invariance under replaced RMS/counts. The numeric maps are display fields, not graph operations. Source RMS remains unpropagated.

Worked Connecting Ridge slope-plan route: 193 native cells from (128,32) to (128,224). At route midpoint (128,128), height = 1918.23779296875 m, supplied height RMS = 0.4600980877876282 m, LOLA spots = 1. Horn slope = 9.12715065337261°; its eight actual input heights have supplied RMS range 0.26884445548057556–0.4081250727176666 m, 8/8 known. The centre is excluded, so its larger RMS does not enter that range. All eight neighbours here have zero LOLA spots and finite heights/RMS; they remain usable delivered samples, without implying known interpolation donors. The provider supplied RMS is neither a suspicious flag nor a route safety verdict.

Nassau's branch-aware **Inspect flagged route inputs** shortcut selects interior Path #2 at native (119,116) on the default Assessment-planned route. Its combined source union contains one suspicious input out of 25, while the slope branch has 0/8 and roughness has 1/25. The suspicious cell is native (121,116), delivered height −179.30117797851562 m, supplier code 3; it reaches this result only through roughness. The selected slope is 13.12016109440007° and roughness is 1.2981641956746297 m. The shortcut follows the persistent planning branch and reports when no affected route location exists instead of choosing an unrelated cell.
