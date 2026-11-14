# LunarBlock scene and heightmap export

The primary example uses **LunarBlock's original full terrain-generation path**, seed **2217320**, area **100 × 100 m**, automatic hills, normal crater and rock populations, and a **2 m** heightmap. It replaces the earlier simplified surface assembled directly from `World` splats. Both sun conditions use the same generated scene and sampled reference. Spires are explicitly excluded before sampling; all ordinary boulders, pebbles, craters and ground vertices retain their original positions and shapes.

## Reproduce

From `prototype/`, install the locked dependencies with `npm ci`, then run:

```
npm run generate:lunar
npm run generate:previews
npm run build
npm test
npm run check:lunar
npm run check:previews
npm run check:presentation
```

Generation needs Node 22 or newer and the local LunarBlock checkout (default `Projects/tmp/lunar-block`). Override with `npm run generate:lunar -- --source=/absolute/path/to/lunar-block`. Figure generation needs Python, NumPy and Matplotlib. The generated HTML needs no runtime dependencies or server; keep its generated `preview/` folder alongside it for on-demand images. The LunarBlock checkout is read without modification.

`tools/full-lunar-scene.mjs` parses the checkout's `src/main.js` and executes its original declarations verbatim with Three.js **0.160.0**, matching LunarBlock's import map. It calls the original `generate()` and `buildHeightmap()` functions and runs the original `dtm-worker.js`, `produce-worker.js` and `detail-worker.js`. Missing declarations fail the export. Scene generation, sampling and matching algorithms are not rewritten in the adapter.

UI, rover and decorative-base hooks are omitted. Original material painting is replaced by neutral scientific shading. The detail worker still runs with the original settings; its normal field is retained and used to shade small features. This is the full **terrain**, not a screenshot of LunarBlock's application or its rover scene.

## Scene and production sequence

1. The original generator builds hills and relief shaping, filtered catalogue craters, the ground mesh, rock meshes, smaller boulder instances and pebbles. The export then removes only meshes marked as spires, before either scene export or heightmap generation. This retains the original placement and geometry of every ordinary boulder, including those near the removed spire; no random sequence is changed. This seed contains **68,121 ground vertices / 135,200 ground triangles, 73 ordinary boulder meshes and 240 pebble instances**. The terrain normal field adds the original sub-mesh detail. No geometry is replaced by the delivered grid in the left-hand preview.
2. The original heightmap builder samples that terrain's functions, small-feature fields and **5,250 actual rock/pebble triangles**. The default smoothing is retained: fourfold oversampling, Gaussian sigma **1.5 m** (0.75 times output spacing), truncation at three sigma, and rocks included. It produces **50 × 50** reference heights at **2 m** spacing.
3. The original production worker renders and matches simulated stereo photographs from that sampled reference. Both deliveries use seed 2217320, westward sun azimuth 270°, two overlapping stereo footprints, each **80 m** wide (width fraction **0.8**), the default sharp camera, the original **±120 m** elevation-search range, and confidence delivery. Only sun elevation changes: **5°** versus **25°**. No matcher range is overridden to improve results.
4. Successful stereo matches supply observed heights. The export independently replays the original worker and checks exact equality before applying its explicit bounded-fill policy. A failed post is eligible only within **4 m** of an **original stereo match**, measured along four-neighbour paths through covered posts (two steps on this grid). Newly interpolated posts cannot extend this limit. Starting again from original matches, the original filler seeds eligible posts from the nearest finite match and applies 60 four-neighbour smoothing passes. Outside-coverage posts and larger unmatched interiors remain absent. The distance bounds eligibility, not the reach of every smoothing dependency. This policy is implemented in `tools/bounded-gap-fill.mjs`; it deliberately differs from LunarBlock's default unbounded overlap filling. Substituting unrelated truth values must leave delivered heights unchanged.
5. Both deliveries reuse the same cached reference-heightmap job. Source hashes, scene hash, exact worker job, detail-normal hash, generation settings and coordinate transformation are saved alongside the browser fixture.

| Acquisition sun | Observed | Interpolated | Shadow-related fills | Absent |
|---|---:|---:|---:|---:|
| 5° | 1,655 | 387 | 263 | 458 |
| 25° | 2,228 | 112 | 80 | 160 |

At 5°, absence comprises **116 outside-coverage posts** and **342 covered failures beyond the filling limit**. At 25°, these counts are **100** and **60**. No interior column is entirely absent. The wider overlapping acquisition removes the previous central coverage strip; remaining gaps follow actual matching failures and image boundaries. These are reproducible patches, not painted or randomly scattered missing values.

Shadow-related means the stereo image patch was too dark to match. It does not mean that every geometrically shadowed pixel was filled: coverage, patch windows and successful matches also matter. Other fills follow saturation or other rejection reasons. These complete production records do not contain undocumented history; that class remains an explicit controlled-test variant.

The low-sun filled heights have a mean absolute error of approximately **0.834 m** against the sampled reference, compared with **0.101 m** for matched heights. At 25°, these errors are approximately **0.978 m** and **0.133 m**. Deep shadow and incomplete coverage make the reconstruction visibly different. These errors are retained, not corrected using truth. This is simulated acquisition, not a validated lunar sensing model or an uncertainty estimate.

## Coordinates and exact artifacts

Scene positions are exported as **east, height, south**, in metres, from the actual Three.js vertex buffers and instance transforms. The original builder offsets its heights to a seeded site datum of **−1021 m**. For readable local coordinates, plots and delivered fixtures subtract this same datum from ideal and delivered heights; original scene heights receive `heightmap offset − site datum`. North equals negative south. There is no independent vertical fitting, recentering per panel or shape rescaling.

- `fixtures/lunar-scene.json.gz`: original ground vertices/indices, transformed ordinary boulder and pebble meshes, explicit spire-exclusion record, relief, hills, craters, options, source and geometry hashes.
- `fixtures/lunar-detail-normals.bin.gz`: original 2048 × 2048 RGBA detail normal field.
- `fixtures/lunar-heightmap-job.json.gz`: exact job passed by the original builder to its heightmap worker, including rock triangles and small-feature settings.
- `fixtures/lunar-audit.json`: sampled reference heights in the shared local datum and reconstruction grading statistics.
- `src/fixtures/lunar-data.js`: delivered heights, origins and acquisition evidence for the browser, including coverage, distance to an original match, the fill limit and absence counts by cause. Nonfinite heights serialize as `null` and are restored to `NaN`.
- `src/fixtures/terrain-previews.js`: build-time scientific preview images and hashes; never imported by the browser.
- `dist/preview/manifest.js` and hashed PNGs: a small on-demand index and separate images. The main HTML contains no preview image bytes.

`check:lunar` regenerates all data and acquisition images byte for byte. Tests verify that exported mesh triangles exactly equal the triangles used by the heightmap worker, check the scene/settings hashes, and check reference/delivery alignment and provenance. Source-file hashes prevent unnoticed upstream changes.

## Preview

The first click on **3D terrain preview** loads a small metadata index and requests only the selected image. Other images load when selected; reopening reuses the loaded index. Loading and Retry appear inside the dialog, while assessment remains usable. The header's **3D terrain preview** opens independently of the main input/result controls. Even from an older controlled-test URL it initially shows the actual LunarBlock example, without changing the analysis or URL. Its own Terrain selector can still inspect the controlled fixtures, which are explicitly labelled.

- **Scene → sampled heightmap** (default): original terrain with spires excluded on the left, the original builder's smoothed 2 m reference grid on the right, before observation and filling.
- **Scene → delivered heightmap**: the same terrain with spires excluded on the left, the selected sun condition's actual reconstructed and filled numerical grid on the right.
- **Terrain only**: the original terrain mesh and instances, with detail-normal shading.
- **Acquisition shadow map**: a top-down simulation from the sampled acquisition surface, with the same fine roughness, albedo and cast-shadow field as the stereo pipeline. It is not an original stereo photograph or a render of the delivered heights.

Paired views share orthographic viewpoint, metre-labelled axes, height datum, bounds and illustrative northwest lighting. True proportions (×1) are the default; optional ×3 exaggeration is labelled and applied equally. Detailed terrain and sampled heightmaps naturally differ: normal-map details do not move mesh vertices, while the original heightmap worker samples the continuous small-feature fields as well. The scientific preview retains that original distinction.

Faces requiring an absent delivered height are omitted; gaps are never bridged. Delivered-height MAE is measured against the **sampled reference**, not directly against every original mesh vertex. The terrain-only view uses illustrative western lighting at the selected sun elevation; it does not simulate 3D cast shadows. Use the acquisition shadow map for the actual acquisition shadow field.

These are fixed-camera figures, not an orbitable WebGL viewer. Exported `figures/*-sampled-1x.png`, `*-comparison-1x.png` and their ×3 variants are reusable scientific figures. `check:previews` verifies all **24** figures and the embedded module byte for byte. Browser layout and viewport fit still require live UI verification; source/presentation checks do not establish visual browser correctness.

## Inspection boundary

The default shadow example is **height cell (13,46)**, analysis cell **(11,44)**. At the same location the 25° run produces a successful match. A separate bookmark shows observed slope inputs whose wider roughness footprint includes shadow-filled heights. Both maps retain the same delivered-height coordinates.

The Hallmark graph starts at **delivered heights → slope/roughness → criteria → combined assessment**. Producer records explain each declared height origin, but do not expand the donors or smoothing dependencies of interpolation into this graph. There are **46 × 46 analysis cells** inside the two-cell margin of the 50 × 50 delivered grid; missing coverage can still make an assessment unavailable.

The manuscript's existing controlled numerical worked example remains unchanged. It should not be described as this new LunarBlock example without a separate manuscript revision.
