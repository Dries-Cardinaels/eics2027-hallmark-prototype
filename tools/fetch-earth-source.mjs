// One-time network extraction of a native Copernicus DEM window + its quality masks, for a named
// site. Writes a self-contained sample.json/sources.json that the offline fixture generator
// consumes. Nothing here is resampled: pixels are copied exactly as delivered.
// Usage: node tools/fetch-earth-source.mjs <site> --write        (site = langtang | diepenbeek)
import { fromUrl } from 'geotiff';
import { writeFileSync, mkdirSync } from 'node:fs';

const SITES = {
  langtang: { geocell: 'N28_00_E085_00', lon: 85.5209, lat: 28.2085, n: 50,
    place: 'Langtang, Nepal', context: 'Langtang valley — co-seismic rock-and-ice avalanche site of the 2015 Gorkha earthquake' },
  diepenbeek: { geocell: 'N50_00_E005_00', lon: 5.3920, lat: 50.9300, n: 66,
    place: 'Diepenbeek, Belgium', context: 'UHasselt Campus Diepenbeek — flat lowland with a lake, a river and hydro-edited terrain' },
};

const site = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'langtang';
const WRITE = process.argv.includes('--write');
const S = SITES[site];
if (!S) { console.error(`Unknown site "${site}". Known: ${Object.keys(SITES).join(', ')}`); process.exit(1); }

const GEOCELL = S.geocell;
const TILE = `Copernicus_DSM_COG_10_${GEOCELL}_DEM`;
const BASE = `https://copernicus-dem-30m.s3.amazonaws.com/${TILE}`;
const url = (name) => `${BASE}/AUXFILES/Copernicus_DSM_COG_10_${GEOCELL}_${name}.tif`;
const LAYERS = { DEM: `${BASE}/${TILE}.tif`, EDM: url('EDM'), FLM: url('FLM'), HEM: url('HEM'), WBM: url('WBM') };

const dem = await (await fromUrl(LAYERS.DEM)).getImage();
const [ox, oy] = dem.getOrigin();
const [rx, ry] = dem.getResolution();         // degrees/pixel; ry negative
const N = S.n;
// Centre the window on the site's lon/lat (so the campus / village is in the middle of the map).
const col = Math.round((S.lon - ox) / rx), row = Math.round((S.lat - oy) / ry);
const COL0 = col - Math.floor(N / 2), ROW0 = row - Math.floor(N / 2);
const win = [COL0, ROW0, COL0 + N, ROW0 + N];

// Ground spacing of the native posting at this latitude (metres). No resampling is applied;
// these describe how large the native cells are so the square-grid pipeline can be documented.
const latMid = oy + ry * (ROW0 + N / 2);
const M_PER_DEG_LAT = 111320;
const resNS = Math.abs(ry) * M_PER_DEG_LAT;
const resEW = Math.abs(rx) * M_PER_DEG_LAT * Math.cos(latMid * Math.PI / 180);

const read = async (u) => { const img = await (await fromUrl(u)).getImage(); const [band] = await img.readRasters({ window: win }); return { band, nodata: img.getGDALNoData() }; };
const demR = await read(LAYERS.DEM), edmR = await read(LAYERS.EDM), flmR = await read(LAYERS.FLM), hemR = await read(LAYERS.HEM), wbmR = await read(LAYERS.WBM);

const heights = Array.from(demR.band, v => (demR.nodata != null && v === demR.nodata) ? null : Math.round(v * 100) / 100);
const edm = Array.from(edmR.band, v => v);
const flm = Array.from(flmR.band, v => v);
const hem = Array.from(hemR.band, v => (v === -32767 || (hemR.nodata != null && v === hemR.nodata)) ? null : Math.round(v * 1000) / 1000);
const wbm = Array.from(wbmR.band, v => v);

const tally = (arr) => { const m = {}; for (const v of arr) m[v] = (m[v] || 0) + 1; return m; };
const summary = {
  cells: N * N, heights_present: heights.filter(h => h != null).length,
  height_min: Math.min(...heights.filter(h => h != null)), height_max: Math.max(...heights.filter(h => h != null)),
  edm: tally(edm), flm: tally(flm), wbm: tally(wbm),
  hem_present: hem.filter(h => h != null).length,
  resNS: Math.round(resNS * 100) / 100, resEW: Math.round(resEW * 100) / 100,
};
console.log(site, JSON.stringify(summary, null, 2));

const EDM_DEF = {0:'Void (no data)',1:'Not edited',2:'Infill of external elevation data',3:'Interpolated',4:'Smoothed',5:'Airport editing',6:'Raised negative elevation',7:'Flattened',8:'Ocean',9:'Lake',10:'River',11:'Shoreline',12:'Morphed (manually set)',13:'Shifted'};
const FLM_DEF = {0:'Void (no data)',1:'Edited (not filled)',2:'Not edited / not filled',3:'ASTER',4:'SRTM90',5:'SRTM30',6:'GMTED2010',7:'SRTM30plus',8:'TerraSAR-X Radargrammetric DEM',9:'AW3D30',100:'Norway DEM',101:'DSM05 Spain',102:'Norway DEM v2'};
const WBM_DEF = {0:'No water',1:'Ocean',2:'Lake',3:'River'};

if (WRITE) {
  const sample = {
    site, place: S.place, context: S.context,
    product: 'Copernicus DEM GLO-30 (COG)', product_version: '2022_1', geocell: GEOCELL,
    W: N, H: N, res_m: Math.round(((resNS + resEW) / 2) * 100) / 100, res_m_ns: summary.resNS, res_m_ew: summary.resEW,
    projection: 'EPSG:4326 geographic; heights in metres above EGM2008 geoid',
    centre: { lon: S.lon, lat: S.lat },
    crop: { col_start_zero_based: COL0, row_start_zero_based: ROW0,
      lon_west: Math.round((ox + rx * COL0) * 1e6) / 1e6, lat_north: Math.round((oy + ry * ROW0) * 1e6) / 1e6 },
    heights, edm_codes: edm, flm_codes: flm, hem_m: hem, wbm_codes: wbm,
    edm_definitions: EDM_DEF, flm_definitions: FLM_DEF, wbm_definitions: WBM_DEF,
    dem_nodata: demR.nodata, summary,
  };
  const dir = new URL(`../fixtures/earth/${site}/`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('sample.json', dir), JSON.stringify(sample));
  writeFileSync(new URL('sources.json', dir), JSON.stringify({
    credit: '© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.',
    url: `https://copernicus-dem-30m.s3.amazonaws.com/${TILE}/`,
    handbook: 'Copernicus DEM Product Handbook (GEO1988-CopernicusDEM-SPE-002) v5.0',
    files: Object.fromEntries(Object.entries(LAYERS).map(([k, v]) => [k, v.replace(BASE + '/', '')])),
  }));
  console.log(`WROTE fixtures/earth/${site}/sample.json + sources.json`);
}
