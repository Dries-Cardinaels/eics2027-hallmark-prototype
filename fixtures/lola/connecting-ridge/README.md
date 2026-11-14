# Connecting Ridge — PGDA78 native crop

A 256 × 256, 5 m/pixel window of NASA's Site01 (Connecting Ridge) LDEM and its co-registered supplied total height RMS error and LOLA return count. The 1.28 km square deliberately contains varying supplied RMS values while keeping actual finite terrain values. It is an illustrative evidence-inspection scene; its candidate path is not an operational rover plan.

See `manifest.json` for precise source URLs, full-source and crop SHA-256 hashes, source/crop transforms, CRS WKT, nodata, coverage and statistics. See `PGDA78-README.txt` for the retained original supplier definitions. The full raster downloads are cached externally, not retained here.

`height.f32`, `heightRms.f32`, `counts.f32`: native values serialized as little-endian Float32, row-major, 65,536 samples each, no header. `sample.json` contains identical native values as JSON numbers: `heights`, `heightRms`, `counts`, plus dimensions/transform/units. The original TIFFs also store Float32; no normalization, scaling, reprojection, rounding or interpolation is introduced by this fixture.

Reproduce with a Python environment containing numpy and rasterio:

```sh
python prototype/fixtures/lola/connecting-ridge/reproduce.py --cache /tmp/lola78
```

The script downloads the three source TIFFs when absent, extracts the fixed manifest window and checks exact binary32 equality. The default downloaded filenames in the external cache are `surf.tif`, `toterr.tif`, `ldec.tif`. Source hashes identify the actual acquisition; future producer revisions may legitimately change these hashes.

`toterr` is supplier **surface-height RMS error in metres**, conditional on the provider's orbit/interpolation/range/sampling model. It is not Hallmark-derived slope uncertainty, a confidence probability or a suspicious-terrain category. `ldec` is returns per pixel; zero does not invalidate a finite interpolated height. The TIFF heights and RMS use metres; the README's kilometre units apply to the separate XYZI point clouds only.

Interpretation, model details and citations: [lunar evidence research](../../../../demo/research/lunar-evidence-cases.md).
