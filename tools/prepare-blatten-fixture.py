"""Reproduce the bundled native crop from the two downloaded standard OGD tiles.

Usage: python prepare-blatten-fixture.py north.tif south.tif
Requires rasterio and numpy; downloads are intentionally separate.
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.windows import from_bounds

fixture = Path(__file__).resolve().parent.parent / 'fixtures/earth/blatten'
manifest = json.loads((fixture / 'manifest.json').read_text())
crop = np.empty((200, 200), dtype='<f4')
for path, source in zip(sys.argv[1:], manifest['sources'], strict=True):
    raw = Path(path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != source['sha256']:
        raise ValueError(f'Source checksum mismatch: {path}')
    with rasterio.open(path) as data:
        if data.crs.to_epsg() != 2056 or data.res != (2, 2) or data.nodata != -9999:
            raise ValueError('Unexpected source CRS, resolution, or NoData')
        row = source['outputRowStart']
        north = 1140200 - row * 2
        window = from_bounds(2627500, north - 200, 2627900, north, data.transform)
        values = data.read(1, window=window)
        if values.shape != (100, 200):
            raise ValueError('Unexpected native crop size')
        crop[row:row + 100] = values
if not np.isfinite(crop).all() or np.any(crop == -9999):
    raise ValueError('The pinned crop unexpectedly contains missing values')
raw = crop.tobytes()
if hashlib.sha256(raw).hexdigest() != manifest['raster']['sha256']:
    raise ValueError('Crop checksum mismatch')
for check in manifest['checks']:
    assert check['index'] == check['row'] * 200 + check['col']
    assert float(crop[check['row'], check['col']]) == check['height']
(fixture / 'blatten-2024-ground-2m.f32').write_bytes(raw)
with rasterio.open(fixture / 'blatten-2024-ground-2m.tif', 'w', driver='GTiff',
                   height=200, width=200, count=1, dtype='float32', crs='EPSG:2056',
                   transform=from_origin(2627500, 1140200, 2, 2), nodata=-9999,
                   compress='lzw') as output:
    output.write(crop, 1)
print('Verified 40,000 native elevations and source/crop SHA-256 hashes.')
