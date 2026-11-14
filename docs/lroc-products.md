# Official LROC NAC terrain and confidence products

Research checked 2026-10-30 against official LROC/PDS/USGS sources. This note concerns existing lunar products, not the simulated LunarBlock acquisition. No product-quality flag should be silently promoted to complete cell lineage.

## Recommendation

Use **North of Nassau Crater**, product group `NAC_DTM_NASSAU02`, for the first real-height example. Its official catalog offers a 4 m floating-point DTM (25.99 MB) and a matching-resolution confidence IMG (6.50 MB), substantially smaller than a long NAC strip. The catalog bounds agree for the two products. Exact grid alignment has now been checked against the downloaded labels and GeoTIFF tags. The product is compact enough to preserve original files and hashes for reproducibility. [DTM catalog](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_NASSAU02), [confidence catalog](https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_NASSAU02_CONF).

This is a **terrain-processing-status** example. The verified Nassau sample shows how slope and roughness depend differently on successful-correlation and suspicious-status inputs. Other products would need separate file checks before demonstrating interpolation or manual edits. It cannot support the same exhaustive observed/interpolated/absent truth claims as a fully instrumented simulation.

## Verified product choices

The following metrics come from the respective product READMEs. SOCET precision and LOLA RMS are product-level diagnostics, not per-cell uncertainty maps. LOLA RMS combines errors in both reference and terrain data.

| Group / exact PDS elevation IMG ID | Spacing | SOCET precision | LOLA RMS / tracks | Project date | Selection relevance |
|---|---:|---:|---:|---|---|
| `NAC_DTM_NASSAU02` / `NAC_DTM_NASSAU02_E216S1785` | 4 m | 3.62 m | 2.46 m / 25 | 2022-08-22 | Small crop already delivered by producer; highland/impact terrain |
| `NAC_DTM_TMAYERDOME1` / `NAC_DTM_TMAYERDOME1_E137N3339` | 5 m | 2.01 m | 1.29 m / 19 | 2016-07-02 | Mare/volcanism; larger strip; alternative if its flags provide a better demonstration |
| `NAC_DTM_APOLLO11` / `NAC_DTM_APOLLO11_E008N0234` | 2 m | 0.77 m | 1.81 m / 7 | 2012-09-17 | Finer sampling and familiar location; older product; check README/version carefully |

Sources: [Nassau README](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02_README.TXT), [T Mayer README](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/TMAYERDOME1/NAC_DTM_TMAYERDOME1_README.TXT), [Apollo 11 README](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO11/NAC_DTM_APOLLO11_README.TXT).

All three have the same README confidence lookup. A catalog entry does not establish that a given raster actually contains every listed code. Inspect histograms before promising an interpolation or manual-edit example.

## What the confidence codes establish

| Value | Meaning in the product README | Safe interpretation for analysis |
|---:|---|---|
| 0 | Outside/no data | Treat as unavailable; also check the height raster's no-data mask |
| 1 | Shadow flag | Acquisition problem; does not identify how a finite height was produced |
| 2 | Saturation flag | Acquisition problem; does not identify how a finite height was produced |
| 3 | Suspect result, including boundaries and correlation failure | Quality concern with unresolved production history |
| 4 | Interpolation or extrapolation | Explicit filling status; donor cells and algorithm are not supplied |
| 10–14 | Correlation succeeded | Successful stereo correlation status, not direct altimeter observations |
| 15 | Human edit | Edited status; not necessarily interpolation |
| Other | No definition in these READMEs | Preserve raw code and mark unmapped; do not guess |

Source: the confidence lookup in each linked README. These are discrete classes, not probabilities, percentages, calibrated error bounds, or an ordinal sequence in which 15 is better than 14. The READMEs do not explain distinctions within 10–14.

The NASA/PDS confidence product label and original byte values should be retained. **Use `NAC_DTM_NASSAU02_CONF.IMG` for categorical analysis. The confidence GeoTIFF is not a substitute:** comparison of all 6,808,500 cells in the downloaded files found the GeoTIFF under `EXTRAS/BROWSE` has the same shape and geotags but display-stretched values. Raw IMG codes map to GeoTIFF values as follows: `0 → 0`, `3 → 1`, `10 → 179`, `11 → 204`, `12 → 229`, `13 → 255`, and `14 → 255`. The last two categories are irreversibly merged. Grid agreement therefore does not prove semantic equivalence. This mapping is an empirical comparison reproduced by `tools/prepare-lroc-sample.py`, not a documented universal transformation for other LROC products. Do not infer categories from browse PNGs, shaded images, or generic confidence legends from a different producer.

USGS describes related LMMP confidence maps as derived from SOCET SET **figure-of-merit** information. That establishes the general processing connection; it does not establish identical code encodings across ASU and USGS deliveries. Apply the README belonging to the selected product. [USGS LMMP product description](https://astrogeology.usgs.gov/ckan/dataset/765cff1e-22e6-416d-a7c7-37523e9d9f8d/resource/c8a64995-b1d4-44d2-a36e-8200301db2db/download/usgs-digitqal-terrain-models-and-mosaics-for-lmmp.pdf).

Important inference: the README warns that failed matching in bland/shadowed regions can produce interpolated facets, and tells users to inspect suspicious flags. Therefore code 4 cannot be assumed to identify **all** interpolation, and code 3 cannot be confidently relabeled as either observed or interpolated. All released terrain has also undergone processing and resampling; even correlation-success cells do not expose complete dependencies. The official pipeline describes dense matching followed by coarser DTM sampling to reduce noise. [LROC processing description](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_NASSAU02).

## Nassau files and metadata

Official directory prefix:

`https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/`

| Purpose | Exact file |
|---|---|
| Floating-point elevations | [NAC_DTM_NASSAU02.TIF](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02.TIF) |
| Detached elevation metadata | [NAC_DTM_NASSAU02.LBL](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02.LBL) |
| Original confidence raster and attached label | [NAC_DTM_NASSAU02_CONF.IMG](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02_CONF.IMG) |
| Product explanations | [NAC_DTM_NASSAU02_README.TXT](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02_README.TXT) |

As checked, these download links redirect to the NASA archive under `https://pds.mcp.nasa.gov/data/store/img/lunar_reconnaissance_orbiter/pds4/lroc/lro-l-lroc-5-rdr/LROLRC_2001/…`. The delivered `.LBL` still identifies its label syntax as PDS3. Record both requested and resolved URLs rather than interpreting the new directory name as a conversion of file format.

The GeoTIFF label records `PRODUCT_VERSION_ID = v1.9`, producer `LRO_LROC_TEAM`, Arizona State University, dataset `LRO-L-LROC-5-RDR-V1.0`, and volume `LROLRC_2001`. It gives 2,550 rows × 2,670 columns, one 32-bit floating-point band, 4 m map scale, and no-data value approximately −3.40282266×10^38. Its equirectangular map center is latitude −22°, longitude 180°, with a spherical radius of 1,737.4 km. Filename `E216S1785` describes the site's naming coordinates; it is **not** the map's projection center. The projected rectangular array covers 10,680 × 10,200 m; valid terrain can occupy less than that rectangle. [Elevation label](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02.LBL).

Source images are `M1413993891 L/R` and `M1414000918 L/R`, acquired 2022-08-01. The README notes cropping to roughly −21.72° through −21.39° latitude. It names SOCET SET NGATE 5.5; the label additionally records ISIS 3.10.2 with SER enhancements and GDAL. [Nassau README](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02_README.TXT), [label](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02.LBL).

## Physical interpretation and reproducible crop

The following are implementation recommendations and consequences of sampling, not claims of scientific validation:

- Keep native 4 m posts and original raw flags. A 50 × 50 crop is a 200 m raster extent, with 196 m between extreme cell centers. Display metre units explicitly.
- Verify CRS, dimensions, pixel spacing, grid origin, orientation, and valid-data masks before pairing rasters. Equal catalog bounds alone are insufficient.
- Record exact row/column crop bounds and coordinate convention, original-file SHA-256 hashes, product version, source image IDs, requested/resolved URLs, code lookup, and every transformation.
- Calculate slope and roughness from numeric heights, never from `_SLOPE` colors. Record each derivative's stencil and physical footprint: a 3 × 3 stencil spans 8 m between extreme post centers; 5 × 5 spans 16 m. Missing inputs must remain visible.
- A 4 m raster cannot justify sub-metre boulder or wheel-contact hazard claims. Product-level precision of 3.62 m also warns against interpreting local height differences as exact; it cannot be converted directly into independent per-cell errors.
- Keep a separate raw-status field. If the interface requires origin classes, preserve 1/2/3/15 as unresolved or explicitly edited instead of manufacturing a binary observed/interpolated distinction. Code 4 can be explicitly interpolation/extrapolation flagged; 10–14 can be explicitly correlation-success flagged.
- Report flags over the **complete dependency footprint** of each result, not only its central cell. Retain successful/edited/suspect inputs separately when aggregating.
- A small illustrative crop should include legitimate interior terrain and a useful mix of statuses without implying representativeness. Disclose selection criteria and full-product code frequencies.

The README's generic artifact list includes processing boxes, camera seams, facets, and noise; these are possibilities, not confirmed Nassau defects. Inspect shaded relief, derivatives, source imagery, and status maps together. Success flags alone do not certify artifact-free terrain. [Nassau README](https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/NASSAU02/NAC_DTM_NASSAU02_README.TXT).

## Downloaded raster validation

The preparation tool downloaded and parsed the original Nassau raster files on 2026-10-30, retaining the raw downloads under `/tmp/lroc-nassau02`. Checks establish exact alignment at 2,550 × 2,670 cells and 4 m spacing without resampling. Its full-image original-IMG confidence histogram is:

| Code | Cell count |
|---:|---:|
| 0 | 1,259,470 |
| 3 | 144,079 |
| 10 | 452 |
| 11 | 5,976 |
| 12 | 66,089 |
| 13 | 750,662 |
| 14 | 4,581,772 |
| 1, 2, 4, 15 | 0 |

The counts total 6,808,500 cells. Every code-0 cell has no elevation data, and every other code has a finite elevation. These are empirical file checks, not counts published in the README. The pinned hashes, labels and checks are retained alongside the sample.

**Nassau cannot demonstrate explicitly interpolation-flagged or manually edited terrain: neither code 4 nor code 15 occurs.** It can demonstrate successful-correlation versus suspicious-input dependencies. Preserve the separate simulated example when explaining explicit interpolation lineage. There is no evidence yet that T Mayer or Apollo 11 contains code 4 merely because its README defines it.

## Selected reproducible sample

The coordinating task selected a native 50 × 50 crop starting at zero-based row **775**, column **2350**: rows `[775, 825)` and columns `[2350, 2400)`. It contains **398 suspicious cells out of 2,500** (15.92%), with finite heights throughout and no explicit interpolation flags. Selection maximized code-3 count among all-finite 50 × 50 windows searched on a 25-pixel lattice. This is deliberately an illustrative concentration of suspicious inputs, not a representative random sample of the product.

The sample preserves native posts without resampling and keeps raw confidence categories separate from any origin classification. Completed artifacts are in `prototype/fixtures/lroc/nassau02/`: `sample.json`, `sources.json`, the source README/labels, `raster-audit.json`, and `analysis.json`. The preview is `prototype/figures/lroc-nassau02-sample.png`.

At crop height cell **(13, 20)**, corresponding to original product cell **(788, 2370)** (zero-based), the existing prototype kernels calculate **3.815859° slope** and **0.340741 m roughness**. Slope uses **0/9 suspicious inputs**; roughness uses **8/25**. This is a dependency-quality example, not evidence that the flags caused a particular numerical error. All 2,116 numerical results and suspicious-input counts were independently checked with NumPy against the existing JavaScript kernels. No operational thresholds were applied.

The official NAC processing guide converts elevation to radius by adding 1,737,400 m. The sample preserves the original elevations in metres without any vertical offset. [LROC NAC processing guide, pp. 3–4](https://www.lroc.asu.edu/data/support/downloads/LROC_NAC_Processing_Guide.pdf).

The interface is **not yet connected** to this sample. The next UI change should expose published stereo status separately from height origin; it should not silently fit the codes into the existing observed/interpolated/undocumented categories. Exact numeric status checks do not establish artifact-free terrain or complete production history.

## Reproduce the prepared example

From `prototype/`, with Python NumPy, Pillow and Matplotlib installed, and Node available:

```sh
python3 tools/prepare-lroc-sample.py /tmp/lroc-nassau02 --download
node tools/analyse-lroc-sample.mjs
MPLCONFIGDIR=/tmp/hallmark-matplotlib python3 tools/plot-lroc-sample.py
```

`--download` retrieves missing originals using the pinned official URLs. All five source files must match their recorded lengths and SHA-256 hashes before extraction; existing files are not silently replaced. Without `--download`, preparation is fully offline. The source confidence TIFF is downloaded only to verify alignment and document its lossy display remapping; the crop always reads categories from the original IMG. The crop and numerical audit are deterministic; figure bytes may vary with plotting-library/font versions.

The real-data example is additional to the current application; no UI, synthetic fixture, manuscript or existing assessment logic was changed during this preparation.

## Prototype integration

The example is now available as **LROC · Nassau · 4 m** in Delivery. Its native heights and raw IMG quality codes are embedded in the standalone build. `Quality flags` is a separate style available for this delivery; branch summaries retain suspicious-input counts in Values, Origins and Compare. Per-cell observed/interpolated declarations are not supplied, represented internally by the existing `undocumented` origin state and explicitly labelled **Cell origin not supplied**. Successful correlation is not relabelled observed, and suspicious is not relabelled interpolated. Full record retains source metadata and exact raw codes. LunarBlock remains available for its explicit interpolation records. The lazy LROC 3D preview renders the delivered DEM only, with no independent ground-truth claim.

Generate the browser fixture with `npm run generate:lroc`; generate its two optional surface previews with `python3 tools/generate-lroc-preview.py`, then rebuild. Existing fixed map-panel tracks and compact inspector rows are retained. Browser layout verification remains unavailable because local browser use is disabled.


### Unified input evidence presentation

The map now has Values and Input evidence choices. Input evidence maps declared production categories for LunarBlock/controlled examples, and the independently supplied quality flags for LROC. Legacy LROC `mode=origins` links normalize to `quality`; the UI never presents the uniform missing cell-origin declaration as its evidence map. Compare retains branch-specific evidence and synchronized selection.

The inspector groups Production history and Quality flags under Input evidence. LROC reports its documented stereo-reconstruction method at delivery scope and explicitly unavailable individual filling history, independently of successful-correlation/suspicious codes. LunarBlock uses Stereo-reconstructed and Gap-filled production labels; no separate quality dataset is fabricated. Controlled examples use Supplied height rather than claiming actual stereo acquisition. The original origin enum remains in the API for compatibility, with an additional `production` record specifying method, scope and cell-history availability. Quality remains a separate field and never changes values, availability or origin categories. The manuscript is unchanged.
