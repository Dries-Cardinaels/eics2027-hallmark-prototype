# Earlier page: `window.hallmark` and UI history

This file holds the page-only helpers and the UI change notes of the earlier 2D page in `dist/` (see [previous-interface.md](previous-interface.md)). They do not describe the 3D editor or the paper configuration. The notes were written one after another and record superseded states: for example, the Compare toggle described under "Primary assessment map" was later removed (see "Always-visible evidence"). `window.hallmark` also includes every export of the core (`...core`, `src/ui/app.js`). Moved from `api.md` on 6 November 2026 (plan step 8.1) without other changes.

## Page-only helpers (`window.hallmark`)

`datasets`, `bookmarks`, `current()` (evaluation, selection, limits), `inspect(node?, cell?)` (the record shown in the panel by default), `select({ dataset, node, cell, mode, footprint, limits, compare })`.

Modes: `assessment` and `origins`. The `assessment` view displays the selected node’s values or outcomes. The `origins` view is labelled Origin support and follows the selected node. Heights displays individual delivered-height origins; each derived node displays its per-result origin summary over declared source heights. For Combined, the default Values overview applies an all-criteria rule to the retained `outcomes`: any exceeded criterion marks the cell unmet, and any unavailable criterion adds independent hatching. Known failures remain visible alongside missing assessments. Origin support uses the combined source-origin summary. `compare: true` opens linked slope-criterion and roughness-criterion maps in either style; `inspect()` always returns the complete Combined record. Both maps select the same `cell` and preserve the selected `node`. `current().selection.compare` exposes the presentation flag. The URL writes `compare=1` only for active Combined comparison; old links default to the overview. Graph/criterion selection resets comparison unless explicitly supplied in the same patch. Returning between overview and Compare preserves cell, mode, limits and evaluation. The summary rule accepts any number of outcomes, while the current calculators and comparison UI remain slope and roughness only. The local close-up always retains individual height origins. Both views share coordinates and selection, but their colours need not match. Graph selection determines the mapped records, support outline and inspector. Old `sources` and `terrain` URL modes normalize to `assessment`, preserving node, cell, dataset and limits. The retired `fills` URL parameter is ignored and no longer written.

The optional `dataset.terrain` record is used only by the separate 3D preview's acquisition-shadow view. It contains image dimensions, sun angles, nadir emission angle and per-height shadow fractions. It is visualization context, never an assessment input. The main map no longer renders terrain imagery or fill overlays.

The preview asset loader requests a classic-script metadata index only on opening the preview, resolving image paths relative to that index for both file and HTTP URLs. The initial dataset contains no image bytes. `dist/preview/` holds the index and PNGs with content hashes in their filenames; it must accompany the HTML for previews. Loading failure, image failure and retry are isolated to the preview.

### Unified input evidence presentation

The map now has Values and Input evidence choices. Input evidence maps declared production categories for LunarBlock/controlled examples, and the independently supplied quality flags for LROC. Legacy LROC `mode=origins` links normalize to `quality`; the UI never presents the uniform missing cell-origin declaration as its evidence map. Compare retains branch-specific evidence and synchronized selection.

The inspector groups Production history and Quality flags under Input evidence. LROC reports its documented stereo-reconstruction method at delivery scope and explicitly unavailable individual filling history, independently of successful-correlation/suspicious codes. LunarBlock uses Stereo-reconstructed and Gap-filled production labels; no separate quality dataset is fabricated. Controlled examples use Supplied height rather than claiming actual stereo acquisition. The original origin enum remains in the API for compatibility, with an additional `production` record specifying method, scope and cell-history availability. Quality remains a separate field and never changes values, availability or origin categories. The manuscript is unchanged.

### Exact Horn slope support

Slope declares eight inputs: the neighbours in its 3×3 window, excluding the centre (zero Horn weight). Its availability, production summary and published quality counts use those eight original DEM cells. Roughness uses all 25 cells in its 5×5 window. Combined support remains 25 unique cells, with eight shared between branches. A missing centre alone therefore prevents roughness but not slope. The supporting-height view retains excluded cells as grey spatial context. Quality summaries preserve original source flags; they do not assign a producer quality flag or numerical uncertainty to the derived result.

### Current graph-stage panes

The combined elevation/evidence overlay has been removed. The graph determines the pair and its order:

| Selected step | Left pane | Right pane |
| --- | --- | --- |
| Heights | Input heights (elevations) | Height evidence (individual origins or published quality) |
| Slope, Roughness, Illumination | Calculated result | Evidence result propagated from source heights |
| A criterion | Its upstream value's evidence result | Criterion result |
| Combined | Combined evidence result | Combined assessment result |

A criterion reuses the upstream calculated value's evidence layer rather than recomputing or reclassifying it. Published quality and production history remain separate in query records and inspector labels. The standalone maps use quality where supplied and declared origins otherwise. Both maps mark the same selected result location; source-height footprints and recorded-time Sun arrows belong to the inspector, not to result-grid cells. The height source step shows original evidence directly. Existing datasets, numerical calculations, thresholds, fixed preview and the compact two-map layout remain unchanged. Legacy view modes do not change this pair. Earlier style/Compare/overlay descriptions above document superseded UI states.

### Suspicious supporting-height counts

Derived LROC evidence maps encode `record.quality.suspicious` as a number and a sequential colour. The scale runs from zero to the maximum supporting-height total for that step; it does not divide by each cell's total. Hover text supplies the exact numerator and denominator used by the inspector report. Zero has a neutral fill and no numeral. The legend explicitly identifies an input count, not a confidence score. The Heights evidence map retains the original categorical quality flags. Production-history evidence, including interpolation, is unchanged.

The count map locates results that depend on flagged inputs. Trace to heights identifies the individual inputs and their positions within the calculation's support; counts alone do not convey their numerical influence.

### Immediate supporting heights

Criteria now display the outcome equation, evidence count and source-height grid together. The trace disclosure button is removed. Combined defaults to the slope criterion and keeps its combined outcome visible; selecting a criterion card changes the supporting grid and compact explanation together without changing the map or selected location. The active card uses `aria-pressed`, keeps keyboard focus after updates, and names its supporting heights. Old trace URL parameters no longer control visibility. Technical detail remains in Full record.

### Primary assessment map and optional evidence comparison

The default is one values/outcomes map, with independent supporting-evidence markers: purple square for suspicious published quality, amber dot for declared interpolation, cross for missing heights. Markers derive from the same record support as the inspector, do not alter numeric values or outcome colours, and are not confidence scores. Source steps use their individual height declarations. The legend lists the applicable evidence categories separately from assessment outcomes.

Compare evidence opens the full propagated evidence map alongside the main map; Close comparison returns to the single map. Both share cell selection, cached layers and evaluation. Compare is available at every graph step and is preserved in the URL. Criteria and Combined retain their always-visible supporting-height inspector.

### Always-visible evidence

The evidence map is permanently visible beside the result map at every step. The Compare toggle has been removed; legacy compare URL/API settings do not hide evidence. Selection, result markers and the compact supporting-height inspector are unchanged.

### Linking support to a selected result

The close-up caption identifies the original heights as support for the selected result and gives that result's height-grid coordinates. The single suspicious-count line explicitly links to the selected evidence-map cell. For Combined it instead identifies the selected branch's contribution, avoiding an incorrect equivalence with the union count across all branches. No count is repeated in the caption.

### Supporting-region selection

The maps use a small selected-cell marker plus a blue outline of the exact supporting-height positions, replacing crosshairs. Both maps share the same footprint as the inspector's selected criterion; slope excludes its unused centre, roughness includes all 25 heights, and recorded illumination samples use their tested heights. These outlines refer to source-height coordinates, not additional selected output cells.

### Criterion footprints versus evidence cells

Criterion and Combined result maps show the source-height footprint for the inspector's active criterion. The legend names it explicitly. Evidence maps mark only the selected result, since neighbouring evidence counts are not numerical inputs. Slope footprints contain eight neighbours with the centre excluded; roughness contains 25 heights. Combined follows the selected criterion, including its recorded illumination sample when applicable.
