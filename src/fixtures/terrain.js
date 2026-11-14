import { NASSAU_SUN_PERIOD } from './lunar-sun-data.js';
// Synthetic deliveries: the primary fixtures come from LunarBlock’s original scene and
// acquisition workers, followed by the documented bounded-fill export policy.
// The separate controlled fixtures below use assigned origin labels.
import { ORIGIN } from '../core/origins.js';
import { LUNAR_DATA } from './lunar-data.js';
import { LROC_DATA } from './lroc-data.js';
import { EARTH_DATA } from './earth-data.js';
import { EARTH_DIEPENBEEK_DATA } from './earth-diepenbeek-data.js';

export const LUNAR_METADATA = LUNAR_DATA.metadata;
export const LUNAR_DATASETS = LUNAR_DATA.datasets.map(d => ({ ...d, heights: d.heights.map(h => h === null ? NaN : h) }));

export const W = 32, H = 32, RES = 0.25;   // 32 × 32 heights: an 8 m × 8 m patch
export const NORTH_EDGE = 4; // Preserve the original northwest 4 m × 4 m worked-example tile.

// Cell (row, col) is centred at x = (col + ½)·RES east and y = NORTH_EDGE − (row + ½)·RES north, in metres.
const centre = (row, col) => ({ x: (col + 0.5) * RES, y: NORTH_EDGE - (row + 0.5) * RES });
const bump = (x, y, cx, cy, amp, sigma) => amp * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma ** 2));

// Gentle eastward tilt, a steep planar ramp in the north-east, and a few boulders.
export function surface(x, y) {
  let z = 0.05 * x;
  z += 0.4 * Math.max(0, x - 2.25) * (y > 1.75 ? 1 : 0);   // ramp, north of y = 1.75 m
  z += 0.4 * Math.max(0, x - 2.25) * Math.min(1, Math.max(0, (y - 1.0) / 0.75)) * (y <= 1.75 ? 1 : 0);
  z += bump(x, y, 0.875, 1.625, 0.9, 0.12);    // boulder B1 (west), its top is filled by interpolation
  z += bump(x, y, 3.375, 3.125, 0.35, 0.18);   // boulder B2 on the ramp
  z += bump(x, y, 1.875, 0.625, 0.45, 0.16);   // boulder B3 (south)
  // The extension adds southern undulations and an eastern ridge; these terms are zero in
  // the original tile so previously linked numerical examples remain reproducible.
  const east = Math.max(0, x - 4), south = Math.max(0, -y);
  z += 0.22 * east * Math.sin(1.4 * y) + 0.08 * east * east;
  z += 0.32 * south * Math.sin(1.8 * x) + 0.08 * south * south;
  z += Math.min(1, south) * bump(x, y, 2.4, -2.1, 0.7, 0.32);
  return z;
}

export const index = (row, col) => row * W + col;

function baseHeights() {
  const out = new Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const { x, y } = centre(r, c); out[index(r, c)] = +surface(x, y).toFixed(4); }
  return out;
}

// Cells whose delivered heights are declared interpolated in every variant.
export const INTERPOLATED = (() => {
  const cells = new Map();
  const add = (r, c) => cells.set(`${r},${c}`, [r, c]);
  [[9,3],[13,9],[13,10],[14,9]].forEach(([r,c]) => add(r,c));
  // A broad eastern gap with a gently varying boundary.
  for (let r = 4; r <= 21; r++) {
    const left = 20 + Math.round(1.5 * Math.sin(r * 0.4));
    for (let c = left; c <= 28; c++) add(r,c);
  }
  // An elliptical patch in the newly added southern terrain.
  for (let r = 19; r <= 29; r++) for (let c = 3; c <= 16; c++) {
    if (((r - 24)/5.2)**2 + ((c - 9)/6.2)**2 <= 1) add(r,c);
  }
  // A narrow diagonal strip: neighbourhood operations spread its footprint differently.
  for (let r = 23; r <= 30; r++) for (let dc = 0; dc < 2; dc++) add(r,18 + Math.floor((r-23)/2) + dc);
  return [...cells.values()].sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
})();
// Cells delivered without an origin record in the undocumented variant (an older merged tile).
export const UNDOCUMENTED_BLOCK = (() => { const out = []; for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) out.push([r, c]); return out; })();
// The height removed in the missing-height variant: in the focus cell's 5×5 window, outside its 3×3.
export const ABSENT_CELL = [7, 7];

function dataset(id, title, description, edit = () => {}) {
  const heights = baseHeights(), origins = new Array(W * H).fill(ORIGIN.OBSERVED);
  for (const [r, c] of INTERPOLATED) origins[index(r, c)] = ORIGIN.INTERPOLATED;
  edit(heights, origins);
  return { id, title, description, synthetic: true, W, H, res: RES, heights, origins };
}

export const DATASETS = [
  ...LUNAR_DATASETS,
  { ...LROC_DATA, origins: LROC_DATA.heights.map(h => Number.isFinite(h) ? ORIGIN.UNDOCUMENTED : ORIGIN.ABSENT) },
  { ...LROC_DATA, id:'lroc-nassau02-illumination', title:'LROC · Nassau illumination · 3–4 Oct 2026', description:'Separate 24-hour illumination example with JPL Horizons Sun positions. Same native Nassau crop and published quality flags; local terrain only.', illuminationPeriod:NASSAU_SUN_PERIOD, preferredNode:'illumination', origins:LROC_DATA.heights.map(h=>Number.isFinite(h)?ORIGIN.UNDOCUMENTED:ORIGIN.ABSENT) },
  // EDM records the last edit, not complete observation history. Only code 3 explicitly
  // declares interpolation. Preserve other edit/fill classes in their own evidence layers.
  ...[EARTH_DATA, EARTH_DIEPENBEEK_DATA].map(DATA => {
    const heights = DATA.heights.map(h => h === null ? NaN : h);
    const origins = heights.map((h, i) => !Number.isFinite(h) ? ORIGIN.ABSENT : DATA.quality.codes[i] === 3 ? ORIGIN.INTERPOLATED : ORIGIN.UNDOCUMENTED);
    return { ...DATA, heights, origins };
  }),
  dataset('reference', 'Controlled test · reference',
    `Synthetic 8 × 8 m terrain · 32 × 32 heights · ${INTERPOLATED.length} interpolated (${(100 * INTERPOLATED.length / (W * H)).toFixed(1)}%). Broad patches and a narrow strip have declared interpolated origins.`),
  dataset('undocumented', 'Controlled test · undocumented tile',
    'Synthetic 8 × 8 m terrain with interpolated regions; a 4 × 4 northwest tile has undocumented origins.',
    (h, o) => { for (const [r, c] of UNDOCUMENTED_BLOCK) o[index(r, c)] = ORIGIN.UNDOCUMENTED; }),
  dataset('missing', 'Controlled test · missing height',
    'Synthetic 8 × 8 m terrain with interpolated regions; one required height near the original boulder is absent.',
    (h, o) => { const k = index(...ABSENT_CELL); h[k] = NaN; o[k] = ORIGIN.ABSENT; }),
];
export const datasetById = (id) => DATASETS.find(d => d.id === id);

// Bookmarks name a dataset, an analysis cell (row, col on the 28 × 28 analysis grid), a node and a
// display mode. What each bookmark demonstrates is checked in tests/verify.mjs.
export const BOOKMARKS = [
  ...LUNAR_DATA.bookmarks,
  { id:'lroc-quality', title:'LROC · quality through roughness', dataset:'lroc-nassau02', cell:{row:11,col:18}, node:'combined', mode:'quality', note:'Published stereo status: slope has 0/9 suspicious inputs; roughness has 8/25. Cell origin declarations are not supplied.' },
  { id:'earth-voidfill-roughness', title:'Copernicus · void-fill through roughness', dataset:'copernicus-langtang', cell:{row:3,col:4}, node:'combined', mode:'origins', note:'Slope’s 3×3 window is entirely TanDEM-X radar observation; the larger 5×5 roughness window reaches cells void-filled from ASTER/SRTM30. The combined result therefore depends on substituted elevation.' },
  { id:'earth-village-quality', title:'Copernicus · Langtang village · editing status', dataset:'copernicus-langtang', cell:{row:23,col:23}, node:'combined', mode:'quality', note:'At the buried-village location the delivered height is itself void-filled (EDM: infill of external elevation data). The quality view counts edited supporting heights, separate from the elevation origin.' },
  { id: 'wide-regions', title: 'Wider terrain · interpolated regions', dataset: 'reference', cell: { row: 11, col: 15 }, node: 'combined', mode: 'origins',
    note: 'The slope window is observed; four interpolated heights enter through the larger roughness window at the eastern region boundary.' },
  { id: 'interpolated-interior', title: 'Entire neighbourhood interpolated', dataset: 'reference', cell: { row: 10, col: 23 }, node: 'combined', mode: 'origins',
    note: 'All 25 heights supporting this assessment are declared interpolated.' },
  { id: 'southern-patch', title: 'Southern interpolated patch', dataset: 'reference', cell: { row: 22, col: 7 }, node: 'combined', mode: 'origins',
    note: 'Both branches read the interior of a broad interpolated patch.' },
  { id: 'narrow-strip', title: 'Narrow strip · mixed support', dataset: 'reference', cell: { row: 24, col: 18 }, node: 'combined', mode: 'origins',
    note: 'A narrow interpolation strip contributes to both neighbourhoods.' },
  { id: 'focus', title: 'Interpolation through roughness only', dataset: 'reference', cell: { row: 7, col: 3 }, node: 'combined', mode: 'assessment',
    note: 'Observed cell. Its 3×3 slope window is all observed; its 5×5 roughness window includes the interpolated boulder top.' },
  { id: 'slope-branch', title: 'Interpolation through the slope branch', dataset: 'reference', cell: { row: 7, col: 2 }, node: 'combined', mode: 'origins',
    note: 'The interpolated boulder top lies in the 3×3 slope window, and therefore also in the 5×5 roughness window.' },
  { id: 'undocumented', title: 'Undocumented source history', dataset: 'undocumented', cell: { row: 2, col: 2 }, node: 'combined', mode: 'origins',
    note: 'Some declared source heights have no origin record; the trace stops at the delivery.' },
  { id: 'absent', title: 'Absent required height', dataset: 'missing', cell: { row: 7, col: 3 }, node: 'combined', mode: 'assessment',
    note: 'Roughness is unavailable; the slope outcome is retained and the assessment is incomplete.' },
  { id: 'neither', title: 'Neither limit exceeded', dataset: 'reference', cell: { row: 3, col: 6 }, node: 'combined', mode: 'assessment' },
  { id: 'slope-only', title: 'Slope limit only', dataset: 'reference', cell: { row: 6, col: 8 }, node: 'combined', mode: 'assessment' },
  { id: 'both', title: 'Both limits', dataset: 'reference', cell: { row: 2, col: 10 }, node: 'combined', mode: 'assessment' },
];
