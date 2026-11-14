# Earlier prototype: terrain evidence for mobile robot supervision

An interactive technical-note prototype for two scenarios: **Earth search and rescue in Langtang, Nepal**, and **lunar rover exploration near Nassau crater**. Both use published elevation data and supplied evidence. The interface connects calculated terrain values to the exact source heights, producer flags, available height-error estimates and gaps in production history that support them.

The contribution demonstrated here is the interactive evidence chain. Benefits for operators require a later study. The interface does not establish safe passage or execute robot commands. Illumination and resampling are outside this redesign.

## Try it

Run `npm run build` and `npm run serve`, then open http://127.0.0.1:8765. Alternatively, open `dist/hallmark-prototype.html` directly. Keep the generated `dist/preview/` and `dist/terrain/` directories beside the HTML for surface previews and reference imagery. Core inspection and comparison work offline.

1. **Assess terrain.** Choose Earth or Moon, then slope, roughness, delivered heights or configured criteria. The left map shows values or criterion outcomes; the right map shows evidence for the selected quantity. Select a location on either map, or move with the arrow keys.
2. **Inspect the evidence.** The inspector shows both terrain values, the selected calculation, its input neighbourhood, exact producer categories and individual input records. Switching the evidence layer updates the map, input grid and evidence summary together. For criteria, selecting slope or roughness changes the evidence branch while retaining the combined outcome map.
3. **Compare locations.** Pin location A, then select location B. Both columns use the same current calculations, evidence layer and limits. Swap, replace or clear A. Changing a limit updates both outcomes without changing their terrain values or provenance. Changing the use case clears A.
4. **Follow the calculation.** Expand the processing graph or Full record to inspect methods and retained dependencies. These details support the task without occupying the main map area.

The URL preserves the use case, quantity, selected location, evidence layer, limits, active branch and pinned location. A pin stores a location, not a frozen result from older settings.

## Three.js view experiment

The current design question is whether a 3D workspace makes terrain shape easier to understand while preserving access to exact evidence. Three structurally different views share the existing route, evaluation, selection, inspector and comparison:

- `?variant=terrain`: one large interactive terrain surface, coloured by delivered elevation, the selected calculated quantity or its supporting evidence.
- `?variant=hybrid`: an interactive terrain surface beside the linked evidence map.
- `?variant=maps`: the earlier pair of value and evidence maps.

The floating view switcher cycles between them and preserves the current locations. Surface colour, vertical scale and mesh visibility are also retained in the URL. Its arrow buttons also support left/right keys while focused. This is a design exploration; no variant has been selected as a final design or validated through an operator study.

Orbit by dragging, zoom with the wheel, pan with a right drag and click an interior terrain location to inspect it. Arrow keys on the canvas move the same selected cell used by the maps. A and B appear on the surface when comparing locations. Top view gives an orthographic plan view. The support dots identify the exact delivered posts used by the inspected quantity.

Geometry uses native heights and separate horizontal axis spacings. Triangles connect delivered posts; they do not create additional measurements. Missing posts remain holes. The triangle mesh can be shown explicitly. Vertical exaggeration is labelled and affects display geometry only; calculated slope, roughness and limits retain their original values. Result and evidence colours are displayed without shape lighting, and partial input-error coverage retains diagonal marks. Neutral shading is used only for the elevation view.

Three.js r160 and OrbitControls are bundled locally, loaded on demand from `dist/terrain/`; no CDN is required. `THREE-LICENSE.txt` accompanies them. The older pre-rendered surface figure remains available from the header. The prototype is not a Git repository, so the experiment is retained here for review rather than captured on a throwaway branch.

## Data and interpretation

| Use case | Delivered data | What the interface exposes | Interpretation boundary |
|---|---|---|---|
| Earth search and rescue | Native 50 × 50 crop of Copernicus GLO-30, Langtang | Heights, Edit Data Mask, Filling Mask, Height Error Mask and retained source metadata | Approximately 30 m spacing supports regional context, not local robot obstacle clearance or current incident conditions |
| Lunar rover exploration | Native 50 × 50 crop of LROC NAC_DTM_NASSAU02 v1.9, 4 m posts | Heights, stereo quality flags and explicitly undocumented earlier per-cell history | Flags concern reconstruction; no calibrated per-cell uncertainty or traversability guarantee is supplied |

**Earth editing is not observation history.** EDM code 1 means *not edited*, not a raw observation. Code 3 explicitly declares interpolation. Other finite samples retain undocumented earlier origins; external infill, smoothing and other edit categories remain separately named. FLM identifies filling sources without recovering the complete measurement history. The original masks are retained. The Water Body Mask is also in the Earth source records; all cells in this Langtang crop are land.

**Input error is not output uncertainty.** The height-error layer reports supplied HEM values in metres σ. Derived map cells display their maximum available input estimate; partial coverage is marked diagonally. Inspection and comparison report the available count, total count and maximum. Missing estimates stay unknown. No uncertainty propagation to slope or roughness is claimed.

**Map summaries remain inspectable.** Quality maps count flagged supporting heights. The fill-source map highlights the most frequent external fill source when present; all categories and their exact counts are available in the inspector and comparison. A category colour or flag is not a confidence probability. Input history is displayed separately from quality.

**Calculations retain scale.** Horn slope uses eight neighbours in a 3 × 3 window; its centre has zero weight and is excluded from source support. Earth calculations use separate east–west and north–south spacings from the fixture, rather than their nominal average. Roughness is the population standard deviation of the raw 25 heights in a 5 × 5 window: terrain tilt contributes to it. The interface displays spacing and physical window extent. Limits are illustrative and editable, not validated vehicle capability limits.

**Context views remain context.** Earth reference imagery is attributed Sentinel-2 cloudless imagery from EOX. The 3D views render the delivered DEM with illustrative shading. Earth previews distinguish EDM *not edited* and *edited* cells. Neither view is independent ground truth. These assets load on demand.

## Development and verification

| Command | Purpose |
|---|---|
| `npm run build` | Bundle source and lazy preview assets |
| `npm test` | Core and interaction regressions, including comparison restoration, input coverage and axis-specific slope |
| `npm run check:presentation` | Check all six stages at three locations in each visible use case, shared map selection, input counts and comparison consistency |
| `npm run check:interactions` | Check evaluation reuse and map caching through the real handlers; excludes browser layout/paint |
| `npm run generate:earth` | Rebuild Earth fixtures offline from committed source crops |
| `npm run render:earth-surface` | Regenerate Earth surface figures |
| `npm run check:earth-surface` | Verify those figures reproduce |

Build before running tests because interface tests exercise the standalone artifact. Browser checks additionally cover map rendering, location pinning, keyboard selection, evidence changes and use-case switching.

`src/core/` evaluates terrain operations and returns source-linked query records. `src/ui/evidence.js` provides shared evidence interpretations for source inputs, inspection and comparison. `src/ui/app.js` coordinates the shared selection and views. `fixtures/` retains source data; `tools/` builds fixtures and the standalone page.

Legacy controlled and synthetic fixtures remain for numerical regression and reproducibility; they are not choices in the redesigned interface. Illumination calculations remain in legacy core tests but have no exposed workflow. Older screenshots and documents describe earlier versions; this document describes the earlier interaction. See [the core API](api.md) for retained query structures.
