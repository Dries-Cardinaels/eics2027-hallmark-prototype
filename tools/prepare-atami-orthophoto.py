"""Rebuild the offline 1 m display colours from the retained 3 July JPEG.

Requires Pillow. This samples the source image pixel containing each terrain
cell centre. It does not infer height, fill DSM gaps, or classify land cover.
Normal editor preparation copies the checked-in RGB asset without Pillow.
"""
import hashlib
import json
import math
from pathlib import Path

from PIL import Image

fixture = Path(__file__).resolve().parent.parent / 'fixtures/earth/atami-imagery'
image_file = fixture / 'atami-headscarp.jpg'
asset_file = fixture / 'atami-july03-orthophoto-1m-rgb.u8'
manifest_file = fixture / 'atami-july03-orthophoto-1m-rgb.json'
source_hash = hashlib.sha256(image_file.read_bytes()).hexdigest()
if manifest_file.exists():
    previous = json.loads(manifest_file.read_text())
    if source_hash != previous['sourceJpegSha256']:
        raise ValueError('Retained orthophoto JPEG checksum mismatch')

image = Image.open(image_file).convert('RGB')
if image.size != (6793, 5516):
    raise ValueError('Unexpected retained orthophoto dimensions')
west, north, resolution = 51993.90988107122, -97135.95518412748, .05
rgb = bytearray()
for row in range(125):
    for col in range(125):
        east, northing = 52100 + col + .5, -97221 - row - .5
        x, y = math.floor((east - west) / resolution), math.floor((north - northing) / resolution)
        if not (0 <= x < image.width and 0 <= y < image.height):
            raise ValueError('Terrain cell centre outside the orthophoto')
        rgb.extend(image.getpixel((x, y)))

asset_file.write_bytes(rgb)
manifest = {
    'asset': asset_file.name,
    'assetSha256': hashlib.sha256(rgb).hexdigest(),
    'sourceImage': image_file.name,
    'sourceJpegSha256': source_hash,
    'sourceGeoTiffSha256': 'c624e8e08ad22694edff25f0037d3feadb073d3c7b883b7cd34ff494c7e02f39',
    'source': 'https://www.geospatial.jp/ckan/dataset/atami20210703izusan0000shizuokapref01',
    'sourceDate': '3 July 2021',
    'sourceBounds': {'west': west, 'north': north, 'east': west + image.width * resolution, 'south': north - image.height * resolution},
    'sourcePixelSizeMetres': resolution,
    'width': 125,
    'height': 125,
    'grid': {'east': 52100, 'north': -97221, 'resolutionMetres': 1, 'horizontalCrs': 'EPSG:6676'},
    'method': 'For each 1 m terrain cell, copy the retained 3 July orthophoto JPEG pixel containing its projected centre. No resampling of heights and no neighbouring lidar colours.',
    'limitations': 'Display colours from the JPEG derivative, not native GeoTIFF radiometry. The retained JPEG composites original unmapped alpha pixels on charcoal. Colours do not establish DSM height coverage or accuracy.',
}
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Wrote {len(rgb) // 3:,} independent 3 July RGB samples.')
