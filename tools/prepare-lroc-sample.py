"""Verify the pinned Nassau02 products and extract an unmodified native-grid sample.
Usage: python3 tools/prepare-lroc-sample.py /path/to/downloaded/products
Requires NumPy and Pillow. Download URLs/hashes: fixtures/lroc/nassau02/sources.json.
This prepares research data; it does not assign Hallmark origins or change the UI.
"""
from pathlib import Path
import sys, re, json, hashlib, math, urllib.request
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
out = root / 'fixtures/lroc/nassau02'
raw = Path(sys.argv[1])
raw.mkdir(parents=True, exist_ok=True)
for source in json.loads((out / 'sources.json').read_text()):
    target = raw / source['name']
    if not target.exists() and '--download' in sys.argv:
        with urllib.request.urlopen(source['url'], timeout=90) as response:
            data = response.read()
        assert len(data) == source['bytes'] and hashlib.sha256(data).hexdigest() == source['sha256'], source['name']
        target.write_bytes(data)
    data = target.read_bytes()
    assert len(data) == source['bytes'], source['name']
    assert hashlib.sha256(data).hexdigest() == source['sha256'], source['name']

def value(label, key):
    return re.search(r'^\s*' + re.escape(key) + r'\s*=\s*([^\r\n]+)', label, re.M)[1].strip().strip('"').split(' <')[0]

binary = (raw / 'NAC_DTM_NASSAU02_CONF.IMG').read_bytes()
label = binary[:re.search(rb'\nEND\s*\r?\n', binary[:20000]).end()].decode('ascii')
(out / 'NAC_DTM_NASSAU02_CONF_LABEL.TXT').write_text(label)
dem_label = (raw / 'NAC_DTM_NASSAU02.LBL').read_text()
for key in ['LINES', 'LINE_SAMPLES', 'CENTER_LATITUDE', 'CENTER_LONGITUDE', 'LINE_PROJECTION_OFFSET', 'SAMPLE_PROJECTION_OFFSET', 'MAP_SCALE', 'A_AXIS_RADIUS']:
    assert math.isclose(float(value(label, key)), float(value(dem_label, key)), rel_tol=1e-12), key
assert value(label, 'SAMPLE_BITS') == '8'
assert value(label, 'SAMPLE_TYPE') == 'MSB_UNSIGNED_INTEGER'
rows, cols = int(value(label, 'LINES')), int(value(label, 'LINE_SAMPLES'))
offset = (int(value(label, '^IMAGE')) - 1) * int(value(label, 'RECORD_BYTES'))
assert len(binary) - offset == rows * cols
codes = np.frombuffer(binary, dtype=np.uint8, offset=offset).reshape(rows, cols)
height_image = Image.open(raw / 'NAC_DTM_NASSAU02.TIF')
confidence_image = Image.open(raw / 'NAC_DTM_NASSAU02_CONF.TIF')
assert height_image.mode == 'F' and height_image.size == confidence_image.size == (cols, rows)
for tag in [33550, 33922, 34735, 34736, 34737]:
    assert height_image.tag_v2[tag] == confidence_image.tag_v2[tag], tag
heights = np.asarray(height_image)
nodata = np.float32(height_image.tag_v2[42113])
valid = heights != nodata
assert np.array_equal(~valid, codes == 0)
assert np.isfinite(heights[valid]).all()
# The TIFF is a stretched browse product, not the raw confidence class raster.
browse = np.asarray(confidence_image)
lookup = {0: 0, 3: 1, 10: 179, 11: 204, 12: 229, 13: 255, 14: 255}
for original, displayed in lookup.items():
    assert np.all(browse[codes == original] == displayed)
assert set(np.unique(codes).tolist()) == set(lookup)

# Demonstrative crop: maximize code-3 count among fully valid 50x50 windows
# on a 25-pixel lattice. Ties use the smallest row, then column. Not a random sample.
n = 50
candidates = []
for row in range(0, rows-n+1, 25):
    for col in range(0, cols-n+1, 25):
        if valid[row:row+n, col:col+n].all():
            candidates.append((-int((codes[row:row+n, col:col+n] == 3).sum()), row, col))
_, row, col = min(candidates)
assert (row, col) == (775, 2350)
z, q = heights[row:row+n, col:col+n], codes[row:row+n, col:col+n]
spacing = float(height_image.tag_v2[33550][0])
tie = height_image.tag_v2[33922]
x0, y0 = tie[3] + col*spacing, tie[4] - row*spacing
histogram = lambda a: {str(k): int(v) for k,v in zip(*np.unique(a, return_counts=True))}
sample = {
    'id': 'lroc-nassau02-research-sample', 'product': 'NAC_DTM_NASSAU02', 'product_version': 'v1.9',
    'status': 'Research sample; not yet registered in the prototype UI',
    'W': n, 'H': n, 'res': spacing, 'synthetic': False,
    'crop': {'row_start_zero_based': row, 'col_start_zero_based': col, 'width_pixels': n, 'height_pixels': n,
             'selection': 'Most suspicious-code cells among all-finite 50x50 crops on a 25-pixel lattice; row/column tie break. Illustrative, not representative sampling.'},
    'projection': {'type': 'Equirectangular Moon', 'radius_m': 1737400, 'central_meridian_deg': 180,
                   'standard_parallel_deg': -22, 'raster_pixel_is_area': True,
                   'top_left_outer_corner_m': [x0,y0], 'row_direction': 'south', 'column_direction': 'east'},
    'height_datum': {'unit': 'metre', 'reference_radius_m': 1737400, 'source': 'https://www.lroc.asu.edu/data/support/downloads/LROC_NAC_Processing_Guide.pdf', 'note': 'Official NAC processing guide: add 1737400 m to NAC DEM heights to obtain radius. No offset is applied to this crop.'},
    'height_policy': 'Original float32 DEM elevations in metres. No resampling, filling, smoothing or vertical offset.',
    'quality_policy': 'Original CONF.IMG category codes. Not percentages, uncertainties or Hallmark origin labels. Code 3 does not establish interpolation.',
    'quality_code_definitions': {'0': 'NoData / outside boundary', '1': 'Shadowed', '2': 'Saturated',
        '3': 'Suspicious (edge, corner, did not correlate, etc.)', '4': 'Interpolated / extrapolated',
        '10-14': 'Successful correlations', '15': 'Manually edited'},
    'quality_counts': histogram(q), 'heights': z.astype(float).ravel().tolist(), 'quality_codes': q.ravel().tolist(),
}
(out / 'sample.json').write_text(json.dumps(sample, indent=2, allow_nan=False)+'\n')
audit = {'full_grid': {'W': cols, 'H': rows, 'quality_counts': histogram(codes), 'finite_heights': int(valid.sum()),
          'height_range_m': [float(heights[valid].min()), float(heights[valid].max())]},
         'checks': ['SHA-256 and size of all five official files', 'DEM and CONF.IMG dimensions, projection and offsets',
                    'DEM and confidence TIFF GeoTIFF georeferencing tags equal', 'CONF.IMG code 0 exactly matches DEM NoData',
                    'No quality code 4 occurs anywhere in this delivered product', 'Native crop floats and classes copied without resampling'],
         'browse_tiff_remapping': lookup, 'warning': 'Confidence browse TIFF merges raw classes 13 and 14; use CONF.IMG for scientific class values.'}
(out / 'raster-audit.json').write_text(json.dumps(audit, indent=2)+'\n')
print(f'Verified {cols}x{rows} raster; exported {n}x{n} native crop at row {row}, col {col}.')
print('Crop quality counts:', histogram(q))
