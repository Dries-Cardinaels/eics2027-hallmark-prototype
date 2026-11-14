# Atami July 2021 terrain source crops

These small, checked-in source assets let `npm run prepare:editor` rebuild the live prototype without network access.

- `atami-20210706-ground-crop.las` is the rectangular crop E `[52100,52225)`, N `[-97346,-97221)` from the ground-filtered LAS in Shizuoka Prefecture’s July 5–6, 2021 release. It retains the LAS point records and header scales/offsets. SHA-256 of the full published ZIP: `b2fda9bc86945cd605751577f91db69fa62bbc53ab8df3f1a5f7d74ded1efc06`. The full archive's single LAS has 6,638,160 points; this subset has 230,413. The adjacent JSON records its checksum, exact bounds and counts. The LAS header has no CRS record. The crop assumes Japanese Plane Rectangular CS VIII (EPSG:6676) for comparison with the independent DSM; this is a co-registration assumption, not a CRS declaration for the LAS.
- `atami-20210703-dsm-crop-10cm.f32` contains the 1,250 × 1,250 source float32 DSM pixels whose pixel centres lie in the same 125 × 125 m footprint. Its origin, pixel scale, source window, NoData value, checksums, CRS and source links are recorded in the adjacent JSON. Full source DSM SHA-256: `d7141217427fa15a66d3682d20637d1cb6504ae24cc01557123ad1aab981e804`.

The 125 m square expands the former 65 m footprint using actual points and source DSM pixels. It has 15,625 cells: 13,160 (84.22%) contain July 5–6 ground returns, 8,891 (56.90%) contain finite earlier DSM samples, and 8,718 (55.80%) contain both. The remaining 2,465 ground cells stay missing. The July 3 DSM has a limited irregular footprint, so its remaining 6,734 cells stay missing too. The crop placement balances support in both products while retaining the entire original footprint; it does not extrapolate either survey.

The original E `[52155,52220)`, N `[-97336,-97271)` footprint is embedded at row offset 50 and column offset 55. Every original ground median, point count, mean RGB and DSM median is unchanged across its 4,225 cells. The earlier worked gap at E 52187.5, N −97303.5 (row 82, column 87) remains in the data. The default road-approach example uses a different naturally empty ground bin, described below. The generation process does not cut new gaps.

The source products are published by Shizuoka Prefecture and distributed under CC BY 4.0 / ODbL according to the publisher. Ground archive: [release page](https://opendata.pref.shizuoka.jp/dataset/8698.html) · [LAS ZIP](https://gsic-opendata.s3.ap-northeast-1.amazonaws.com/local-gov/shizuoka/point-cloud/2021/20210703-atami-dronealb/20210703ATAMI/Izusan_UAV-LiDAR_20210706_Ground.zip). DSM: [catalogue record](https://www.geospatial.jp/ckan/dataset/atami20210703izusan0000shizuokapref01).

The editor exposes two independent surveys, in capture-date order: **3 July · Video surface** (`july3-dsm`) and **5–6 July · Ground lidar** (`ground`). The date of the video surface identifies its footage: captured 3 July 2021. The DSM resource was registered 5 July. Same-day availability to responders is unverified.

The July 5–6 ground heights are Hallmark's median of point elevations in each 1 m square. `groundCounts` counts those source points, totalling 230,413. Empty squares remain NaN; no value is interpolated. The video surface is computed independently as the median of finite, non-NoData 10 cm DSM pixel-centre samples within each 1 m square. Its `dsmSampleCounts` is a `Uint16Array` of these aggregation inputs: **870,850** in total, across **8,891** occupied cells. Source NoData (`-32767`) is excluded. Every source valid pixel is counted once. Zero valid inputs give both a zero count and a missing height. These are raster sample counts, not lidar returns, image-match counts, accuracy or uncertainty.

The DSM includes surface objects and vegetation and is not a ground model. Source reconstruction ancestry and per-cell quality/uncertainty are not supplied. Finite DSM cells therefore retain `undocumented` origins and missing cells `absent`; they do not inherit the ground lidar's observed origin, support, RGB or quality. Each survey has its own source URLs, date, range, grid metadata, production method and history. The DSM declares EPSG:6676 and metre units, with an unspecified vertical datum. The ground LAS's CRS remains an explicit alignment assumption. A companion-height comparison samples the other survey's native cell at the same projected location; it does not establish vertical change or deposit thickness.

## Incident-day-footage road approach

The active video-surface example plans and evaluates on `july3-dsm` alone, starting at `(15,42)` and ending at `(85,87)`. Initial focus is the start. The route is Hallmark's retrospective demonstration, not a documented responder path or evidence that the DSM was available on 3 July.

At the start, the slope uses its eight declared neighbour heights. Roughness uses a 5 × 5 window with two naturally absent DSM cells at `(13,43)` and `(13,44)`. Their source sample counts are both zero; their heights remain NaN. The later lidar has 14 and 33 ground returns there, respectively, but these do not fill or alter the earlier surface. Toggling a gap display changes presentation only. The source bytes and calculated evidence stay fixed.

`tests/atami-surveys.test.mjs` checks the separate loader identities, companion heights in both directions, missing cells and counts, source preservation, original lidar-output checksums, and repeatable offline generation. `tests/atami-inspection.test.mjs` verifies the incident-day-footage route's declared inputs as well as the legacy example below.

## Legacy cross-survey road approach

The standalone `createEarlierSurveyProposal` helper remains for the original comparison tests. The active editor does not invoke it to plan on one survey and assess on another.

Native addresses below are zero-based `(row, column)`; path positions are one-based. The generator derives these addresses from the physical cell centres retained in the ground crop's JSON metadata.

| Role | Native cell | Centre easting (m) | Centre northing (m) |
| --- | --- | --- | --- |
| Start near the apparent road margin | (15, 42) | 52142.5 | −97236.5 |
| Inspection gap | (40, 42) | 52142.5 | −97261.5 |
| Inspection goal | (85, 87) | 52187.5 | −97306.5 |

These endpoints are retrospective demonstration choices. The road correspondence is approximate, and the path is not a documented responder route. Four-neighbour A* on the earlier DSM's slope branch uses density `1 + slope / 90°` and produces 116 cells (115 m horizontal centreline length). Its cell #26 is the inspection gap. The earlier DSM median there is 381.60321045 m; the later ground bin has zero returns. Its eight neighbours have return counts `[13,5,12,5,19,3,1,13]`, supporting a Horn slope of 38.77045330°. Roughness is unavailable because only 24 of its 25 declared inputs have heights.

On this proposal, intersecting each calculation's declared footprint with this particular gap finds slope dependencies at #25 and #27 and roughness dependencies at #24–#28. The slope at #26 excludes its own centre. Other gaps can affect other results. Replanning on the later ground slope branch, with the same endpoints, yields a different 116-cell path that bypasses the inspected gap. This branch requires available slope results but does not enforce either numerical limit or require roughness availability.

At illustrative limits of **15° slope and 0.15 m roughness**, the counts below include both endpoints. Each branch lists **within / exceeded / unavailable** route cells; these are configured comparisons, not vehicle capability evidence. Both geometries in the later-survey rows are evaluated using that same later ground survey.

| Route geometry | Survey used for assessment | Slope | Roughness |
| --- | --- | --- | --- |
| Initial proposal, 116 cells | 3 July DSM | 50 / 66 / 0 | 7 / 108 / 1 |
| Initial proposal, 116 cells | 5–6 July ground lidar | 39 / 75 / 2 | 0 / 108 / 8 |
| Revised proposal, 116 cells | 5–6 July ground lidar | 48 / 68 / 0 | 4 / 88 / 24 |

The revised path has available slope at all 116 cells but unavailable roughness at 24. Reducing the number of slope exceedances does not establish a route that meets both limits. `tests/atami-inspection.test.mjs` verifies these counts, the inspected record, the gap's exact dependencies and the later bypass. See [the case-choice evidence](../../../demo/research/earth-route-case-choice.md) for mission context and the assumed survey alignment.

## Wider photographic context

The preview covers approximately 340 × 276 m around the debris-flow source. The yellow rectangle uses the same assumed local alignment as the two elevation surveys. The 3 July orthophoto is context from an earlier flight than the ground lidar. On the video surface, Terrain colours come from the retained 3 July orthophoto JPEG pixel containing each 1 m cell centre. On the ground surface, they come from the mean supplied RGB of the 5–6 July LAS points per occupied cell. These colours do not classify land cover, add height measurements or change route costs.

The full-size JPEG keeps all 6,793 × 5,516 pixels and the north-up extent of the 5 cm EPSG:6676 orthophoto. Unmapped alpha pixels are composited on charcoal. The thumbnail is reduced to 480 pixels wide. Source TIFF SHA-256: `c624e8e08ad22694edff25f0037d3feadb073d3c7b883b7cd34ff494c7e02f39`. Imagery © Shizuoka Point Cloud Support Team, distributed by CrisisMappers Japan, CC BY 4.0 / ODbL. [Catalogue](https://www.geospatial.jp/ckan/dataset/atami20210703izusan0000shizuokapref01) · [Original GeoTIFF](https://www.geospatial.jp/ckan/dataset/450bb3a3-7685-4758-a224-e2cd899f61a8/resource/4c3658aa-2151-4199-866e-fe2650c60648/download/izusanlsortho.tif)

The 46,875-byte `atami-imagery/atami-july03-orthophoto-1m-rgb.u8` contains 15,625 RGB triples on the terrain grid. Its adjacent JSON records the source JPEG checksum, georeferenced extent, extraction rule and output checksum. These are display colours from a JPEG derivative, not native GeoTIFF radiometry. The image can have colour where the DSM has no measurement; the RGB never changes the height or source count. The existing `groundRGBFile` loader field also carries these independent orthophoto colours for renderer compatibility.

## Offline reproduction

From `prototype/`, run `npm run prepare:editor`. It verifies the pinned source LAS, DSM and orthophoto-RGB fixture checksums, rebuilds both surveys independently, and writes the catalog and binaries under `editor/data/`. It does not fetch data or edit the sources. Both original height arrays and all existing lidar counts/colours retain their prior byte checksums.

To rebuild the small RGB fixture from the retained JPEG, run `python3 tools/prepare-atami-orthophoto.py` (requires Pillow), then `npm run prepare:editor`. Normal preparation needs no image decoder. The RGB recipe samples native JPEG pixels at projected terrain-cell centres without resizing the source image or borrowing neighbouring lidar colours.

Run `node --test tests/atami-surveys.test.mjs tests/atami-inspection.test.mjs tests/blatten-surveys.test.mjs` to verify offline repetition, total source-input counts, layer isolation, both directions of same-location comparison, and the retained road examples.
