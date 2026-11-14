# Blatten / Tennmatten ground baseline

This is real terrain from the **2024 edition of standard swissALTI3D**, before
the 28 May 2025 Blatten collapse. It does **not** show the collapse deposit or
current conditions. The individual survey acquisition date has **not been
verified**. The TIFF contains no acquisition-date field, and the STAC metadata
endpoint timed out during preparation. A product edition must not be presented
as an acquisition date.

Source: **Federal Office of Topography swisstopo**.
[Product description](https://www.swisstopo.admin.ch/en/height-model-swissalti3d).
[Standard OGD terms](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices)
permit use, redistribution, processing and commercial use with attribution.
These are standard national terrain tiles, **not Rapid Mapping data**. No
Rapid Mapping imagery, heights, or derivatives are included in this fixture.

The manifest records both original asset URLs and SHA-256 hashes, the exact
native source windows, output hashes, numerical spot checks, and provenance.
Only the compact crop is included; the original tiles can be downloaded from
those URLs. `blatten-2024-ground-2m.tif` is the georeferenced crop.
`blatten-2024-ground-2m.f32` stores the same heights for the browser.

- Grid: 200 × 200 cells, **native 2 m** resolution, 400 × 400 m footprint.
- Horizontal CRS: CH1903+ / LV95, EPSG:2056. Vertical: LN02, EPSG:5728.
- Bounds: E 2627500–2627900; N 1139800–1140200.
- Native floating point samples copied exactly: no resampling, interpolation,
  gap filling, smoothing, or height quantization.
- Row zero is north, column zero west; index = row × 200 + column.
- Cell centre: E = 2627500 + (column + 0.5) × 2;
  N = 1140200 − (row + 0.5) × 2.
- Source NoData = −9999. All 40,000 crop cells are valid.
- Height range: 1420.7855224609375–1589.2987060546875 m.
- Float32 encoding: little-endian, row-major, 160,000 bytes.

The crop crosses the native tile boundary at output rows 99/100. Source windows
are recorded separately; neither tile is rescaled. Focus row 98, column 106
is close to the Tennmatten/Tännmattu locality. Demonstration start (171,45) and
goal (50,145) are **illustrative inspection endpoints**, not known rescue-team
positions or a validated route. No per-cell survey support or error mask is
available in this crop. A finite height does not establish present-day access.

Normal offline editor preparation adds Blatten alongside Atami and Nassau:

```js
await prepareTerrainData(outputDirectory, {earthCase: 'atami'});
```

To reproduce the source crop, download the two URLs in `manifest.json` to local
files, then use Python with rasterio and numpy:

```sh
python prototype/tools/prepare-blatten-fixture.py north.tif south.tif
```

The script verifies original and output checksums, resolution, CRS, NoData,
cell ordering and sample values before writing. It performs no network access.
The fixture's Float32 SHA-256 is
`521fb942ce32ae73122b2a5651c5cd615b44db44dd1b75e0acfaddba9b984e16`.
