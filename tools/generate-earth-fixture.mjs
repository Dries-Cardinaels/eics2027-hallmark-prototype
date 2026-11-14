// Offline: build an Earth delivery from a native Copernicus DEM crop and its published masks, for a
// named site. Editing and filling records retain their producer-defined meanings;
// the Edit Data Mask is retained as a categorical quality layer. Nothing is resampled or invented.
// Usage: node tools/generate-earth-fixture.mjs <site>   (site = langtang | diepenbeek; default langtang)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const site = process.argv[2] || 'langtang';
const base = new URL(`../fixtures/earth/${site}/`, import.meta.url);
const s = JSON.parse(readFileSync(new URL('sample.json', base), 'utf8'));
const sources = JSON.parse(readFileSync(new URL('sources.json', base), 'utf8'));
// Optional reference satellite image (context only), described in basemap.json; the image itself is
// bundled as a lazy asset by build-standalone and never inlined in the page.
const bmPath = new URL('basemap.json', base);
const basemap = existsSync(bmPath) ? (({ source, attribution, licence }) => ({ source, attribution, licence }))(JSON.parse(readFileSync(bmPath, 'utf8'))) : null;
const N = s.W * s.H;
assert.equal(s.heights.length, N);
assert.equal(s.edm_codes.length, N);
assert.equal(s.flm_codes.length, N);

// Heights: NaN marks an absent delivery (serialised to null; terrain.js restores NaN).
const heights = s.heights.map(h => h == null ? NaN : h);

// Last-edit codes do not establish complete acquisition history. Only EDM 3 explicitly
// records interpolation; the remaining finite samples retain undocumented earlier origins.
const ORIGIN = { UNDOCUMENTED: 'undocumented', INTERPOLATED: 'interpolated', ABSENT: 'absent' };
const origins = heights.map((h, i) => !Number.isFinite(h) ? ORIGIN.ABSENT : s.edm_codes[i] === 3 ? ORIGIN.INTERPOLATED : ORIGIN.UNDOCUMENTED);
origins.forEach((o, i) => assert.equal(o === ORIGIN.ABSENT, !Number.isFinite(heights[i])));

const n = (v) => origins.filter(o => o === v).length;
const filled = s.flm_codes.filter(c => c >= 3).length;              // 3+ = a named external fill source
const observed = s.edm_codes.filter(c => c === 1).length;

// The Edit Data Mask as an independent, categorical quality layer (raw bytes + published legend).
const flaggedCodes = [...new Set(s.edm_codes)].filter(c => c !== 1 && c !== 0).sort((a, b) => a - b);
const quality = {
  kind: 'copernicus-edm', codes: s.edm_codes, definitions: s.edm_definitions, nominalCodes: [1], flaggedCodes,
  terms: {
    layer: 'Copernicus Edit Data Mask (EDM)', encoding: 'Edit Data Mask · code',
    production: 'Copernicus DEM production: TanDEM-X InSAR, with documented external void-fill',
    cellHistory: 'Edit and fill source declared per pixel',
    flagged: 'Edited', flaggedLower: 'edited', flaggedNoun: 'edited supporting heights',
    nominal: 'Not edited', nominalLower: 'unedited', nominalRange: '1',
    note: 'The Edit Data Mask records the last editing step applied to each pixel. "Edited" marks a derived height (external infill, interpolation or smoothing); it is the product’s own declaration, not a confidence or error estimate.',
  },
};

// Height Error Mask: the product's per-pixel height-error σ (m), reported exactly as delivered; void
// over edited pixels; this does not establish raw observation provenance.
const hem = s.hem_m.map(v => (v == null ? null : Math.round(v * 100) / 100));
const hemPresent = hem.filter(v => v != null);
const hemSummary = {
  count: hemPresent.length, min_m: Math.min(...hemPresent), max_m: Math.max(...hemPresent),
  mean_m: Math.round((hemPresent.reduce((a, b) => a + b, 0) / hemPresent.length) * 1000) / 1000,
  voidCount: hem.length - hemPresent.length,
};

// Water Body Mask: counts, and the per-cell codes when any water is present.
const wbmCounts = s.wbm_codes.reduce((m, c) => (m[s.wbm_definitions[c]] = (m[s.wbm_definitions[c]] || 0) + 1, m), {});
const WATER_COLOURS = { 1: { label: 'Ocean', colour: '#1f6f8b' }, 2: { label: 'Lake', colour: '#3a7ca5' }, 3: { label: 'River', colour: '#5bc0be' } };
const waterPresent = [...new Set(s.wbm_codes)].filter(c => c > 0).sort((a, b) => a - b);
const hasWater = waterPresent.length > 0;
const waterCount = s.wbm_codes.filter(c => c > 0).length;
const waterBreakdown = waterPresent.map(c => `${s.wbm_codes.filter(x => x === c).length} ${WATER_COLOURS[c].label.toLowerCase()}`).join(', ');

// Declared evidence layers for the map's layer switcher — the developer configures, per delivery,
// which per-cell records are queryable. Built-in types (origin, quality) plus generic categorical /
// continuous ones resolved against the delivered masks. A water layer is declared only where there
// is water to show, so the menu differs between sites.
const FILL_COLOURS = { 3: '#2a9d8f', 4: '#4e79a7', 5: '#e8833a', 6: '#b07aa1', 7: '#59a14f', 8: '#9c6b4f', 9: '#8056a3', 100: '#6b8f9c', 101: '#79a65f', 102: '#a569bd' };
const fillCategories = Object.fromEntries([...new Set(s.flm_codes)].filter(c => c >= 3).sort((a, b) => a - b).map(c => [c, { label: s.flm_definitions[c], colour: FILL_COLOURS[c] || '#8056a3' }]));
const fillNames = Object.values(fillCategories).map(c => c.label).join(', ');
const mapLayers = [
  { id: 'quality', type: 'quality', label: 'Editing status', note: 'Copernicus Edit Data Mask: edited (void-filled, interpolated or smoothed) versus not edited.' },
  { id: 'origins', type: 'origin', label: 'Source history', note: 'Explicitly declared interpolation is retained; other last-edit classes do not establish complete observation history.' },
  { id: 'fill-source', type: 'categorical', label: 'Fill source', codesRef: 'flmCodes', categories: fillCategories, base: { label: 'No named external fill source', colour: '#dfe4e6' }, note: 'Filling Mask: named external sources are coloured by mission. Other codes retain their producer labels in the input records; the mask does not reconstruct earlier measurement history.' },
  { id: 'height-error', type: 'continuous', label: 'Height error', valuesRef: 'hem', unit: 'm', min: hemSummary.min_m, max: hemSummary.max_m, voidLabel: 'No estimate supplied', note: 'Per-pixel height-error σ from the Height Error Mask; void over every edited pixel.' },
];
if (hasWater) mapLayers.push({ id: 'water-body', type: 'categorical', label: 'Water body', codesRef: 'wbmCodes', categories: Object.fromEntries(waterPresent.map(c => [c, WATER_COLOURS[c]])), base: { label: 'Land', colour: '#e7ebe8' }, note: 'Copernicus Water Body Mask: cells classified and hydro-edited as ocean, lake or river.' });

const centre = Math.floor((s.W - 4) / 2);   // middle of the assessed interior (2-cell margin)
const waterSentence = hasWater ? ` The Water Body Mask marks ${waterCount} cells as water (${waterBreakdown}).` : ' The Water Body Mask reports every cell as land.';
const id = `copernicus-${site}`;
const shortName = s.place.split(/[,(—]/)[0].trim();

const data = {
  id, title: `Copernicus DEM · ${shortName} · 30 m`,
  description: `Native Copernicus GLO-30 crop over ${s.place} (${s.context}). ${observed} of ${N} cells are marked not edited; ${filled ? `${filled} are void-filled from other missions (${fillNames})` : 'external void-fill is negligible'}.${waterSentence} Heights are delivered values; the Editing and Filling masks record editing and replacement sources, and the Edit Data Mask is kept as a separate quality layer.`,
  synthetic: false,
  W: s.W, H: s.H, res: s.res_m,
  heights,
  originDeclaration: {
    status: 'partial',
    explanation: 'The Edit Data Mask records the last editing step, and the Filling Mask identifies replacement sources. Neither is a complete observation history. Explicit interpolation (EDM 3) is retained; other finite samples have undocumented earlier origins.',
  },
  quality, mapLayers,
  source: {
    product: s.product, version: s.product_version, url: sources.url, credit: sources.credit, handbook: sources.handbook,
    geocell: s.geocell, place: s.place, crop: s.crop, centre: s.centre, projection: s.projection,
    res_m_ns: s.res_m_ns, res_m_ew: s.res_m_ew,
    flmCodes: s.flm_codes, flmDefinitions: s.flm_definitions,
    fillSourceCounts: s.flm_codes.reduce((m, c) => (c >= 3 ? (m[s.flm_definitions[c]] = (m[s.flm_definitions[c]] || 0) + 1, m) : m), {}),
    hem, hemSummary, waterBody: wbmCounts, ...(hasWater ? { wbmCodes: s.wbm_codes } : {}),
    ...(basemap ? { basemap } : {}),
    files: sources.files,
    policy: `Native delivered elevations and all four published masks (EDM, FLM, HEM, WBM) for geocell ${s.geocell}, cropped at product pixel (col ${s.crop.col_start_zero_based}, row ${s.crop.row_start_zero_based}). No resampling, gap filling, smoothing or vertical offset is applied here. The native posting is ${s.res_m_ns} m north–south and ${s.res_m_ew} m east–west at this latitude; the slope calculation uses these separate axis spacings. Raw editing and filling classes are retained separately from incomplete observation history. The Height Error Mask is the product's per-pixel σ, reported where present (${hemSummary.count} cells, ${hemSummary.min_m}–${hemSummary.max_m} m) and void over every edited pixel; it is a product diagnostic, not a term in any criterion.${waterSentence} Assessment limits are illustrative.`,
  },
  preferredCell: { row: centre, col: centre },
};

const exportName = site === 'langtang' ? 'EARTH_DATA' : `EARTH_${site.toUpperCase()}_DATA`;
const outFile = site === 'langtang' ? 'earth-data.js' : `earth-${site}-data.js`;
writeFileSync(new URL(`../src/fixtures/${outFile}`, import.meta.url),
  `// Generated by tools/generate-earth-fixture.mjs from the native Copernicus DEM crop and its published masks.\nexport const ${exportName} = ` + JSON.stringify(data) + ';\n');
console.log(`Generated ${site}: ${observed} not edited, ${n('interpolated')} interpolated (${filled} external void-fill), ${n('absent')} absent, ${waterCount} water over ${N} cells → ${outFile}`);
