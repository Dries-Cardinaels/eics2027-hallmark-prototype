// One-time network fetch of a reference satellite image for an Earth delivery's exact crop
// bounding box, from Sentinel-2 cloudless (EOX, CC BY 4.0 — contains modified Copernicus Sentinel
// data). The image is context only, not part of the delivery and not independent ground truth.
// Usage: node tools/fetch-basemap.mjs <site> [--write]      (site = langtang | diepenbeek)
import { readFileSync, writeFileSync } from 'node:fs';

const site = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'langtang';
const WRITE = process.argv.includes('--write');
const dir = new URL(`../fixtures/earth/${site}/`, import.meta.url);
const s = JSON.parse(readFileSync(new URL('sample.json', dir), 'utf8'));

// Exact crop bounding box (WGS84) from the committed sample; the grid renders as a square, so the
// image is requested square and stretched the same way the geographic cells are.
const rxDeg = s.res_m_ew / (111320 * Math.cos(s.crop.lat_north * Math.PI / 180));
const ryDeg = s.res_m_ns / 111320;
const west = s.crop.lon_west, north = s.crop.lat_north;
const east = west + s.W * rxDeg, south = north - s.H * ryDeg;
const bbox = [west, south, east, north];
const px = 640;

const LAYER = 's2cloudless-2020';
const ATTRIBUTION = 'Sentinel-2 cloudless 2020 by EOX IT Services GmbH — contains modified Copernicus Sentinel data 2020, CC BY 4.0';
const url = `https://tiles.maps.eox.at/wms?service=WMS&version=1.1.1&request=GetMap&layers=${LAYER}&srs=EPSG:4326&bbox=${bbox.map(v => v.toFixed(6)).join(',')}&width=${px}&height=${px}&format=image/jpeg`;

const res = await fetch(url);
if (!res.ok) { console.error('fetch failed', res.status, await res.text().catch(() => '')); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
if (buf.length < 2 || buf[0] !== 0xFF || buf[1] !== 0xD8) { console.error('not a JPEG (first bytes', buf.slice(0, 16), ')'); process.exit(1); }
console.log(`${site}: ${buf.length} bytes · bbox ${bbox.map(v => v.toFixed(4)).join(',')} · ${px}x${px}`);

if (WRITE) {
  writeFileSync(new URL('basemap.jpg', dir), buf);
  writeFileSync(new URL('basemap.json', dir), JSON.stringify({
    source: 'Sentinel-2 cloudless 2020 (EOX)', attribution: ATTRIBUTION, licence: 'CC BY 4.0',
    layer: LAYER, bbox, width: px, height: px,
  }));
  console.log(`WROTE fixtures/earth/${site}/basemap.jpg + basemap.json`);
}
