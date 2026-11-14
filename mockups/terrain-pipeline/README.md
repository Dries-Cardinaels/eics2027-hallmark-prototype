# Hallmark: fresh interface mockups

Three independent mockups address: **How can configurable terrain-processing pipelines preserve the dependencies needed to support consistent origin summaries and on-demand inspection of derived map values?**

Run `npm run mockups` from `prototype/`, then open `http://127.0.0.1:8766/mockups/terrain-pipeline/`. If the existing prototype server is already running on8765, the same path works there after `npm run build:mockups`.

- `?variant=A`: terrain workspace. The 3D chunk is primary; a compact pipeline and persistent value/origin inspector connect a spatial selection to its calculation.
- `?variant=B`: pipeline workbench. Processing steps and their roughness branch are primary; the selected stage updates the terrain and inspection tray.
- `?variant=C`: inspection trail. Start with the heightmap belief, examine the derived slope, then open the retained source evidence. Two Nassau locations show distinct input-quality support.

The floating switcher cycles views, including left/right keys outside inputs and the terrain canvas. `?case=earth` or `?case=moon` selects the data. Earth opens with the DSM to show the supplied object-surface relief; switch to the DTM in configuration, or open with `&surface=ground`. Other exploration state is intentionally in memory. These are exploratory mockups, not a production interface, a study or a chosen final design. No existing UI or assessment implementation is imported.

## Data and rendering

Earth uses the verified native512×512,1m DHMVII DTM and aligned DSM for Veurserveld, Voeren. Both are supplied terrain beliefs. Date, source-product information, missing cellwise quality and unavailable cell history stay explicit. Credit: **Bron: Digitaal Vlaanderen — Digitaal Hoogtemodel Vlaanderen II (2013–2015)**. Source URLs and licence records remain in `fixtures/earth/voeren-candidate/manifest.json`.

Moon uses a larger native256×256,4m Nassau02 context surrounding the same worked cells. Expanding the original50×50 patch exposes more of the actual landform without changing its values. The context was extracted from the same verified parent DEM and raw CONF.IMG and saved as `fixtures/lroc/nassau02-belief-candidate/context.json`. Its zero-based parent origin is(1208,1960). Worked A is local cell(128,128), parent(1336,2088); B is local(131,124), parent(1339,2084). Credit: **NASA/GSFC/Arizona State University**. The original crop, product labels and source hashes are retained beside it.

Top geometry uses every native height estimate at true horizontal and vertical proportions. Side walls close the perimeter; a flat base and contact shadows make the model look like a terrain chunk. The base thickness, neutral/albedo styling and fine surface colour variation are illustrative. They are not additional terrain measurements, mapped land cover or a measured subsurface. No craters, rocks, vegetation or other obstacle geometry is invented. Geometry remains the initial input heightmap when a derived processing stage is selected; value/evidence overlays show the selected stage.

Three.js r160 and OrbitControls are copied locally by the preparation command; the MIT licence accompanies them. The downloaded source GeoTIFFs are decoded offline to small binary float32 arrays. No CDN, imagery account, network data service or application backend is needed at runtime. A local HTTP server is required for modules and data loading.

## Working interactions

Orbit, pan, zoom and select a location on the chunk. Arrow keys on the canvas move by one native cell. Select pipeline stages, inspect original source values, producing methods or producer records, switch between natural styling, values and inherited quality, and focus the exact input region in3D. Configuration switches the Earth input between DTM/DSM, adds/removes a3×3 mean before both derived branches, and changes the illustrative slope limit.

The small calculation model is new and local to the mockup. Every operation declares its input and required cells; on-demand inspection recursively resolves those declarations and deduplicates the original source indices. Horn slope reads eight neighbours, excluding the centre. Roughness is standard deviation of a5×5 raw-height window, including tilt. Mean smoothing expands slope's distinct source support to25 heights and roughness to49. The criterion inherits slope's support; changing a limit changes that comparison rather than its supporting heights.

Nassau code3 remains a suspicious-quality flag, distinct from origin history and numerical uncertainty. Finite heights have undocumented earlier per-cell history in both real products. No uncertainty distribution, safety conclusion or historical ground truth is invented. The display is about retained dependencies and evidence.

## Checks and open design choice

Direct Nassau A reproduces14.99246742611901° with7/8 flagged inputs. Adding3×3 mean gives13.455948017555329°, with15/25 flagged. Native sources are deduplicated; selected support counts match the inherited count layers. The nearby direct B is14.54415985129793° with0/8 flagged inputs. Earth defaults to native cell(259,256): ground-model slope14.156004775059946°, surface-model slope74.74820235474908°, with17.699996948242188m DSM−DTM at that cell. This location was chosen near the crop center to expose a surface-definition difference, not to estimate terrain error; DSM slopes may concern object surfaces rather than the ground grade. These values and configuration/inspection interactions were checked during mockup construction; no mockup test suite was added. Browser layout and interaction checks accompany screenshot previews in `screenshots/`.

Choose which starting point works best before developing a production system. This workspace has no Git repository, so the mockups and this decision record are retained here rather than on a throwaway branch.
