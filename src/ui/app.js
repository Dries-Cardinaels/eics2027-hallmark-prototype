import { createTerrainExperiment } from './terrain-experiment.js';
import { sunProfile, sunArrow } from './sun-profile.js';
// Browser presentation: one consumer of the core's evaluation and query records. Everything it
// displays about a cell is read from query(); the maps read the per-cell evaluation records.
import * as core from '../core/index.js';
import { DATASETS, BOOKMARKS, datasetById, LUNAR_METADATA } from '../fixtures/terrain.js';
import { overview } from './overview.js';
import { regionBoundary } from './map-geometry.js';
import { loadPreviewAssets } from './preview-loader.js';
import { USE_CASES, spacing, evidenceLayers, inputEvidence, summariseEvidence, warmRamp } from './evidence.js';

const { evaluate, query, graphPaths, createPipeline, createDatasetPipeline, analysisGrid, MARGIN, CATEGORY_TEXT, OUTCOME_TEXT, DEFAULT_LIMITS, qualityLabel } = core;
let pipeline = createPipeline();
const $ = (id) => document.getElementById(id);

const initialExample = {dataset:'copernicus-langtang',node:'slope',mode:'assessment',cell:USE_CASES['copernicus-langtang'].cell};
const state = { dataset: initialExample.dataset, limits: { ...DEFAULT_LIMITS }, node: initialExample.node, mode: initialExample.mode, evidenceLayer: null, basemap: false, cell: { ...initialExample.cell }, footprint: 'node', compare: false, sourceMap: false, trace: false, recordedTime:-1 };
let ev = null;
let pinnedLocation = null;
let terrainExperiment = null;

// ---------------------------------------------------------------------------
// Encodings
// ---------------------------------------------------------------------------
const ORIGIN_STYLE = {
  observed: { name: 'Observed', letter: 'O' },
  interpolated: { name: 'Includes interpolation', letter: 'I' },
  undocumented: { name: 'Includes undocumented history', letter: 'U' },
  absent: { name: 'Required height absent', letter: '×' },
};
const HEIGHT_ORIGIN_NAME = { observed: 'Observed', interpolated: 'Interpolated', undocumented: 'Undocumented', absent: 'Absent' };
const QUALITY_FILL = {correlated:'#e4eaeb',suspicious:'#8056a3',other:'#b1a7bd'};
// Published quality layers default to LROC's stereo-status vocabulary; a dataset may declare its own
// (`quality.terms`) so a different product is described in its own documented terms.
const QT_DEFAULT = {layer:'Published stereo quality',encoding:'Published stereo quality · m',production:'LROC stereo reconstruction',cellHistory:'Individual filling history unavailable',flagged:'Suspicious',flaggedLower:'suspicious',flaggedNoun:'suspicious supporting heights',nominal:'Successful correlation',nominalLower:'successful',nominalRange:'10–14'};
const qt = () => ({...QT_DEFAULT, ...(ev?.dataset.quality?.terms || {})});
// LROC declares that per-cell origins are not supplied; other delivered products (Copernicus) do
// supply them through their own masks, so origin wording keys on the declaration status, not presence.
const originNotSupplied = () => ev?.dataset.originDeclaration?.status === 'not-supplied';
const isEdm = () => ev?.dataset.quality?.kind === 'copernicus-edm';
const isFlaggedCode = c => { const q = ev?.dataset.quality; return !!q && (q.flaggedCodes ? q.flaggedCodes.includes(c) : c === 3); };
// Absolute counts within a step; never a per-cell confidence or error estimate.
const qualityCountLimit = op => Math.max(1, ...ev.records[op.id].map(r => r.quality?.total || 0));
const qualityCountFill = (n, max) => n === 0 ? QUALITY_FILL.correlated : `rgb(${[238,229,245].map((v,i)=>Math.round(v+([99,53,139][i]-v)*n/max)).join(',')})`;
const qualitySwatch = q => swatch(QUALITY_FILL[q.headline], q.headline === 'suspicious' ? label(9,9,'?','#fff') : '');
const qualityCounts = q => `${q.correlated} ${qt().nominalLower} · ${q.suspicious} ${qt().flaggedLower}${q.total-q.correlated-q.suspicious ? ` · ${q.total-q.correlated-q.suspicious} other` : ''}`;
const originName = o => originNotSupplied() ? 'Stereo DEM · cell filling history unavailable'
  : isEdm() ? (o === 'observed' ? 'Recorded as observed' : o === 'interpolated' ? 'Declared interpolated' : o === 'absent' ? 'Height missing' : 'Earlier history undocumented')
  : o === 'observed' ? (ev?.dataset.acquisition ? 'Stereo-reconstructed' : 'Supplied height')
  : o === 'interpolated' ? 'Gap-filled (interpolated)' : o === 'undocumented' ? 'Production history undocumented' : 'Height missing';
const originSymbol = o => o === 'observed' ? (ev?.dataset.acquisition ? 'R' : 'S') : o === 'interpolated' ? 'G' : o === 'absent' ? '×' : 'U';
const productionText = q => ev.dataset.quality ? qt().production : q.kind === 'source' ? originName(q.origin.declared)
  : q.origin.counts.absent ? 'Required height missing' : q.origin.counts.undocumented ? 'Includes undocumented production history'
  : q.origin.counts.interpolated ? 'Includes gap-filled heights' : ev.dataset.acquisition ? 'Stereo-reconstructed heights' : 'Supplied heights';
const SUPPORT_ORIGIN_NAME = { observed: 'Uses only observed heights', interpolated: 'Uses interpolated heights', undocumented: 'Height origin undocumented', absent: 'Required height value missing' };
const ASSESS_STYLE = {
  neither: { fill: 'var(--a-neither)', letter: '–', ink: '#333' },
  slope: { fill: 'var(--a-slope)', letter: 'S', ink: '#fff' },
  illumination: { fill: '#8b671b', letter: 'L', ink: '#fff' },
  roughness: { fill: 'var(--a-rough)', letter: 'R', ink: '#fff' },
  both: { fill: 'var(--a-both)', letter: 'S+R', ink: '#fff' },
  incomplete: { fill: 'url(#P-incomplete)', letter: '?', ink: '#222' },
};

function defs(p) {
  return `<defs>
  <pattern id="${p}-observed" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(24,136,144,.16)"/><line x1="1" y1="0" x2="1" y2="6" stroke="rgb(24,136,144)" stroke-width="1.8"/></pattern>
  <pattern id="${p}-interpolated" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(200,139,31,.22)"/><path d="M1 0V6M0 1H6" stroke="rgb(200,139,31)" stroke-width="1.8"/></pattern>
  <pattern id="${p}-undocumented" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#e4e4e7"/><circle cx="3" cy="3" r="1.3" fill="#62656c"/></pattern>
  <pattern id="${p}-incomplete" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="6" height="6" fill="#fff"/><line x1="1" y1="0" x2="1" y2="6" stroke="#9a9a9a" stroke-width="1.2"/></pattern>
  <pattern id="${p}-unknown-overlay" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="1" y1="0" x2="1" y2="6" stroke="#203239" stroke-width="1.2"/></pattern>
  </defs>`;
}
const originFill = (p, o) => (o === 'absent' ? '#fff' : `url(#${p}-${o})`);
const absentMark = (x, y, s) => `<path d="M${x + s*.25} ${y + s*.25}L${x + s*.75} ${y + s*.75}M${x + s*.75} ${y + s*.25}L${x + s*.25} ${y + s*.75}" stroke="#555" stroke-width="${Math.min(1.4,s*.15)}" pointer-events="none"/>`;
const label = (x, y, text, ink = '#1f2328', halo = null) =>
  `<text class="mtext" x="${x}" y="${y}" fill="${ink}"${halo ? ` stroke="${halo}" stroke-width="3" paint-order="stroke"` : ''}>${text}</text>`;
function ramp(t) {   // light → dark slate; used only for values, never for origin or assessment
  const a = [244, 244, 246], b = [44, 52, 64], m = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}
const VOID_FILL = '#eef1f2';   // continuous layer: a cell the product left without an estimate
// Evidence layers a delivery exposes to the map's layer switcher. A delivery declares them
// (mapLayers); otherwise the default is a single built-in layer — the published quality layer when
// present, else origin support. The tool renders whatever is declared and nothing else.
function evidenceLayersOf(ds) {
  if (USE_CASES[ds.id]) return evidenceLayers(ds);
  if (ds.mapLayers?.length) return ds.mapLayers;
  return [ds.quality ? { id: 'quality', type: 'quality', label: 'Quality flags' } : { id: 'origins', type: 'origin', label: 'Input evidence' }];
}
const evidenceLayerId = () => { const ls = evidenceLayersOf(ev.dataset); return ls.some(l => l.id === state.evidenceLayer) ? state.evidenceLayer : ls[0].id; };
const layerOf = (ds, id) => (ds.mapLayers || []).find(l => l.id === id);
function swatch(fill, extra = '', p = 'L') {
  return `<svg viewBox="0 0 18 18">${defs(p)}<rect x="1" y="1" width="16" height="16" fill="${fill}" stroke="#777" stroke-width=".8"/>${extra}</svg>`;
}
const fmtValue = (node, v) => (v == null ? '—' : node === 'slope' ? `${v.toFixed(1)}°` : node === 'illumination' ? `${v.toFixed(1)}%` : `${v.toFixed(3)} m`);
const fmtLimit = (node, v) => (node === 'slope' ? `${v}°` : node === 'illumination' ? `${v}%` : `${v} m`);
const cellName = (c) => `row ${c.row}, col ${c.col}`;
const branchOfNode = (id) => (id.startsWith('slope') ? 'slope' : id.startsWith('roughness') ? 'roughness' : id.startsWith('illumination') ? 'illumination' : null);

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------
const LAYOUT = {
  heights: { x: 2, y: 46, sub: 'Delivered grid' },
  slope: { x: 168, y: 4, sub: 'Horn · 3×3' },
  roughness: { x: 168, y: 46, sub: 'Std dev · 5×5' },
  'slope-criterion': { x: 334, y: 4, sub: '' },
  'roughness-criterion': { x: 334, y: 46, sub: '' },
  illumination: { x:168,y:88,sub:'24 h · JPL Sun' },
  'illumination-criterion': { x:334,y:88,sub:'' },
  combined: { x: 500, y: 46, sub: 'All three criteria' },
};
const NW = 126, NH = 36;
const ancestors = (id) => new Set(graphPaths(pipeline, id).flat());

function nodeState(id, q) {
  if (!q.available && q.kind !== 'combination') return 'unavailable';
  if (q.kind === 'source') return `${q.value.toFixed(3)} m, ${HEIGHT_ORIGIN_NAME[q.origin.declared]}`;
  if (q.kind === 'value') return `${fmtValue(id, q.value)}, ${q.origin.text}`;
  if (q.kind === 'criterion') return `${q.node==='illumination-criterion'?(q.outcome==='not-exceeded'?'minimum met':q.outcome==='exceeded'?'below minimum':'unavailable'):OUTCOME_TEXT[q.outcome].toLowerCase()}, declared support: ${q.origin.text}`;
  return `${CATEGORY_TEXT[q.category]}, declared support: ${q.origin.text}`;
}

function renderGraph() {
  const hadFocus = Boolean(document.activeElement?.closest?.('.gnode'));
  const on = ancestors(state.node);
  const layout=ev.dataset.illuminationPeriod?LAYOUT:{...LAYOUT,heights:{...LAYOUT.heights,y:25},combined:{...LAYOUT.combined,y:25}};
  $('graph').setAttribute('viewBox',ev.dataset.illuminationPeriod?'0 0 630 130':'0 0 630 88');
  const edges = pipeline.edges.map(({ from, to }) => {
    const a = layout[from], b = layout[to], x1 = a.x + NW, x2 = b.x;
    // Separate branch ports so converging arrowheads remain distinct.
    const y1 = a.y + NH / 2 + (from === 'heights' ? (to === 'slope' ? -9 : to==='illumination' ? 9 : 0) : 0);
    const y2 = b.y + NH / 2 + (to === 'combined' ? (from === 'slope-criterion' ? -9 : from==='illumination-criterion' ? 9 : 0) : 0);
    const cls = on.has(from) && on.has(to) ? 'gedge onpath' : 'gedge';
    // Finish the bend before the entire 8-unit arrowhead, including its inset base.
    // A horizontal terminal segment keeps the shaft centred beneath the marker.
    const tipX = x2 - 4, bendEndX = tipX - 12;
    return `<path aria-hidden="true" class="${cls}" d="M${x1} ${y1}C${x1 + 9} ${y1} ${bendEndX - 9} ${y2} ${bendEndX} ${y2}H${tipX}" marker-end="url(#arrow-${cls.includes('onpath') ? 'on' : 'off'})"/>`;
  }).join('');
  const nodes = pipeline.operations.map(op => {
    const q = query(ev, op.id, op.kind === 'source' ? centreHeight() : state.cell);
    const origin = op.kind === 'source' ? q.origin.declared : q.origin.headline;
    const L = layout[op.id], sub = op.kind === 'criterion' ? `${op.id==='illumination-criterion'?'Min':'Limit'} ${fmtLimit(op.inputs[0], ev.limits[op.limitKey])}` : op.id==='combined' ? (ev.dataset.illuminationPeriod?'Three criteria':'Both criteria') : op.id==='illumination' ? '24 h · JPL Sun' : L.sub;
    const name = op.id === 'combined' ? 'Combined' : op.kind === 'criterion' ? op.title.replace('criterion','limit') : op.title;
    const cls = `gnode${on.has(op.id) ? ' onpath' : ''}${op.id === state.node ? ' selected' : ''}`;
    return `<g class="${cls}" data-node="${op.id}" tabindex="${op.id === state.node ? 0 : -1}" role="radio" aria-controls="map branch-map selection-summary" aria-checked="${op.id === state.node}" aria-label="${name}: ${nodeState(op.id,q)}">
      <rect x="${L.x}" y="${L.y}" width="${NW}" height="${NH}" rx="6"/>
      <text class="t" x="${L.x + 8}" y="${L.y + 15}">${name}</text>
      <text class="s" x="${L.x + 8}" y="${L.y + 29}">${sub}</text>
      <title>${op.kind === 'source' ? 'Height origin' : 'Declared support'}: ${op.kind === 'source' ? HEIGHT_ORIGIN_NAME[origin] : q.origin.text}</title>
</g>`;
  }).join('');
  $('graph').innerHTML = `<defs>
    <marker id="arrow-on" markerUnits="userSpaceOnUse" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path class="arrow-head" d="M0 0L8 4L0 8L2 4z" fill="var(--path)"/></marker>
    <marker id="arrow-off" markerUnits="userSpaceOnUse" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path class="arrow-head" d="M0 0L8 4L0 8L2 4z" fill="var(--path-off)"/></marker></defs>${edges}${nodes}
    `;
  $('graph-selection').textContent = `Selected: ${pipeline.byId[state.node].title}`;
  const ids = pipeline.operations.map(op=>op.id);
  const pick = id => {
    select({node:id}); // The graph changes the step, never the visualisation style.
    $('graph').querySelector(`[data-node="${id}"]`).focus({preventScroll:true});
  };
  $('graph').querySelectorAll('.gnode').forEach(g => {
    g.addEventListener('click', () => pick(g.dataset.node));
    g.addEventListener('keydown', e => {
      const index=ids.indexOf(g.dataset.node);
      let target;
      if (e.key==='ArrowRight' || e.key==='ArrowDown') target=ids[(index+1)%ids.length];
      else if (e.key==='ArrowLeft' || e.key==='ArrowUp') target=ids[(index+ids.length-1)%ids.length];
      else if (e.key==='Home') target=ids[0];
      else if (e.key==='End') target=ids.at(-1);
      else if (e.key==='Enter' || e.key===' ') target=g.dataset.node;
      if (target) { e.preventDefault(); pick(target); }
    });
  });
  if (hadFocus) $('graph').querySelector(`[data-node="${state.node}"]`).focus({preventScroll:true});
}

// ---------------------------------------------------------------------------
// Output map
// ---------------------------------------------------------------------------
const centreHeight = () => ({ row: state.cell.row + MARGIN, col: state.cell.col + MARGIN });

// Distinct shapes retain evidence categories without changing outcome colours.
function evidenceMarkers(rec,x,y,s,counts=rec.origin?.counts || {},showSuspicious=true) {
  const d=s*.25, py=y+s-d-.3;
  let marks='';
  if(showSuspicious && rec.quality?.suspicious) marks+=`<rect data-evidence-marker="suspicious" x="${x+.4}" y="${py}" width="${d}" height="${d}" fill="#8056a3" stroke="#fff" stroke-width=".35"/>`;
  if(counts.absent) marks+=`<path data-evidence-marker="missing" d="M${x+s-d-.4},${py}l${d},${d}m0,${-d}l${-d},${d}" stroke="#172d35" stroke-width=".8"/>`;
  return `<g pointer-events="none" aria-hidden="true">${marks}</g>`;
}

function createMapLayer(node = state.node, prefix = 'P', mode = state.mode) {
  const op = pipeline.byId[node], isHeights = op.grid === 'heights', ds = ev.dataset;
  const grid = isHeights ? { W: ds.W, H: ds.H } : analysisGrid(ds), size = 360, s = size / ds.W, recs = ev.records[isHeights ? 'heights' : op.id];
  const finite = recs.filter(r => r.available && typeof r.value === 'number').map(r => r.value);
  const lo = Math.min(...finite), hi = Math.max(...finite);
  const countLimit = mode === 'quality' && !isHeights ? qualityCountLimit(op) : 1;
  const layer = layerOf(ds, mode);   // declared categorical/continuous evidence layer, if this mode is one
  let body = '';
  // Derived outputs occupy the interior of the delivered grid; preserve its scale and origin.
  if (!isHeights) for (let r = 0; r < ds.H; r++) for (let c = 0; c < ds.W; c++) {
    if (r >= MARGIN && c >= MARGIN && r < ds.H - MARGIN && c < ds.W - MARGIN) continue;
    body += `<rect x="${c*s}" y="${r*s}" width="${s}" height="${s}" fill="#edf0f1" stroke="#fff" stroke-width=".6"><title>Height cell (${r}, ${c}): outside the assessment area</title></rect>`;
  }
  for (let k = 0; k < recs.length; k++) {
    const r = Math.floor(k / grid.W), c = k % grid.W, hr = r + (isHeights ? 0 : MARGIN), hc = c + (isHeights ? 0 : MARGIN), x = hc * s, y = hr * s, rec = recs[k], cx = x + s / 2, cy = y + s / 2;
    const inAnalysis = !isHeights || (r >= MARGIN && c >= MARGIN && r < ds.H - MARGIN && c < ds.W - MARGIN);
    let fill, mark = '';
    if (mode === 'quality') {
      const n = rec.quality.suspicious;
      fill = isHeights ? QUALITY_FILL[rec.quality.headline] : qualityCountFill(n, countLimit);
      if (isHeights && n) mark = label(cx,cy,'?','#fff').replace('class="mtext"', `class="mtext${grid.W > 40 ? ' very-dense' : grid.W > 20 ? ' dense' : ''}"`);
      else if (!isHeights && n) mark = `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${n/countLimit>.55?'#fff':'#39234b'}" font-size="${s*(String(n).length>2?.29:.42)}" pointer-events="none">${n}</text>`;
    } else if (mode === 'origins') {
      const o = isHeights ? ds.origins[k] : rec.origin.headline;
      fill = originFill(prefix, o);
      mark = o === 'absent' ? absentMark(x, y, s) : (grid.W <= 20 ? label(cx, cy, originSymbol(o), '#1f2328', '#fff') : '');
    } else if (layer && layer.type === 'categorical') {
      // Per-cell category from a declared mask (e.g. fill source); derived cells take the dominant
      // category over their declared supporting heights.
      const codes = ds.source[layer.codesRef];
      const catColour = (code) => (layer.categories[code] ? layer.categories[code].colour : layer.base.colour);
      if (isHeights) { fill = catColour(codes[k]); }
      else {
        const donors = rec.sources.map(i => codes[i]).filter(code => layer.categories[code]);
        if (donors.length) { const top = donors.sort((a,b)=>donors.filter(v=>v===b).length-donors.filter(v=>v===a).length)[0]; fill = layer.categories[top].colour; if (grid.W <= 20) mark = `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${s*.42}" pointer-events="none">${donors.length}</text>`; }
        else fill = layer.base.colour;
      }
    } else if (layer && layer.type === 'continuous') {
      // Per-cell value from a declared mask (e.g. height-error σ); void cells are left uncoloured.
      // Derived cells take the maximum σ over their available supporting heights.
      const vals = ds.source[layer.valuesRef], span = (layer.max - layer.min) || 1;
      const norm = (v) => warmRamp((v - layer.min) / span);
      if (isHeights) { const v = vals[k]; fill = v != null ? norm(v) : VOID_FILL; }
      else { const evidence=summariseEvidence(ds,rec.sources,mode); fill=evidence.max===null?VOID_FILL:norm(evidence.max); if(evidence.missing && evidence.present) mark+=`<path data-partial-error="true" d="M${x} ${y+s}L${x+s} ${y}" stroke="#213b45" stroke-width=".65" pointer-events="none"/>`; }
    } else if (op.kind === 'criterion') {
      const st = rec.outcome === 'exceeded' ? ASSESS_STYLE[branchOfNode(op.id)] : rec.outcome === 'unavailable' ? ASSESS_STYLE.incomplete : ASSESS_STYLE.neither;
      fill = st.fill.replace('#P', `#${prefix}`);
      if (rec.outcome === 'exceeded') mark = label(cx, cy, st.letter, st.ink).replace('class="mtext"', `class="mtext${grid.W > 40 ? ' very-dense' : grid.W > 20 ? ' dense' : ''}"`);
    } else if (op.kind === 'combination') {
      const decision = overview(rec.outcomes);
      fill = decision.unmet.length ? 'var(--a-unmet)' : decision.incomplete ? '#fff' : 'var(--a-neither)';
      if (decision.unmet.length) mark = label(cx,cy,'!','#fff').replace('class="mtext"', `class="mtext${grid.W > 40 ? ' very-dense' : grid.W > 20 ? ' dense' : ''}"`);
      if (decision.incomplete) mark += `<rect data-incomplete="true" x="${x}" y="${y}" width="${s}" height="${s}" fill="url(#${prefix}-unknown-overlay)" pointer-events="none"/>`;
    } else {
      fill = rec.available ? ramp(hi > lo ? (rec.value - lo) / (hi - lo) : 0) : '#fff';
      if (!rec.available) mark = absentMark(x, y, s);
    }
    if(mode === 'assessment') mark += evidenceMarkers(rec,x,y,s,isHeights ? {[ds.origins[k]]:1} : rec.origin.counts,!['criterion','combination'].includes(op.kind));
    body += `<rect class="cell${inAnalysis ? '' : ' disabled'}" data-r="${isHeights ? r - MARGIN : r}" data-c="${isHeights ? c - MARGIN : c}" data-ok="${inAnalysis}" ${mode === 'quality' && !isHeights ? `data-suspicious-count="${rec.quality.suspicious}" data-support-count="${rec.quality.total}"` : ''} x="${x}" y="${y}" width="${s}" height="${s}" fill="${fill}" stroke="#fff" stroke-width=".6">
      <title>Hovered ${isHeights ? 'source height' : 'result at height'} cell (${hr}, ${hc}) · ${cellTitle(op, k, rec, isHeights)}${isHeights ? acquisitionTip(ds, k) : ''}${mode!=='assessment'&&ds.quality?' · '+escapeHtml(summariseEvidence(ds,rec.sources,mode).summary):''}</title></rect>${mark}`;
  }
  // Draw after every cell so neighbouring fills cannot cover a region edge.
  let boundary = '';
  if (mode === 'assessment' && ['criterion','combination'].includes(op.kind)) {
    const mask = recs.map(rec => op.kind === 'criterion' ? rec.outcome === 'exceeded' : Object.values(rec.outcomes).includes('exceeded'));
    const path = regionBoundary(mask,grid.W,s,MARGIN);
    if (path) boundary = `<path data-exceeded-boundary="true" d="${path}" fill="none" stroke="#203239" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-linecap="square" pointer-events="none" aria-hidden="true"/>`;
  }
  const frame = `<rect x="${MARGIN * s}" y="${MARGIN * s}" width="${(ds.W - 2 * MARGIN) * s}" height="${(ds.H - 2 * MARGIN) * s}" fill="none" stroke="#555" stroke-dasharray="3 3" pointer-events="none"/>`;
  const tickStep = ds.W > 40 ? 8 : ds.W > 20 ? 4 : 1;
  // Reserve room for the endpoint instead of drawing adjacent labels such as 48 and 49.
  const ticks = length => Array.from({length}, (_,i)=>i).filter(i =>
    i === 0 || i === length-1 || (i % tickStep === 0 && length-1-i >= Math.ceil(tickStep/2)));
  const axes = ticks(ds.W).map(c => `<text class="axis" x="${(c + .5) * s}" y="-9" text-anchor="middle">${c}</text>`).join('')
    + ticks(ds.H).map(r => `<text class="axis" x="-9" y="${(r + .5) * s}" text-anchor="end" dominant-baseline="middle">${r}</text>`).join('');

  const element = document.createElementNS('http://www.w3.org/2000/svg','g');
  element.innerHTML = defs(prefix) + body + boundary + frame + axes;
  return {element,op,isHeights,ds,s,size,grid,lo,hi};
}

// Cache the six selected steps and the second Combined branch by view.
// Cell selection updates only the overlays; graph/style changes reuse map layers.
let layerEvaluation = null, activeMapLayer = null, activeBranchMapLayer = null, activeMapPresentation = null;
const mapLayers = new Map();
function renderMap() {
  if (layerEvaluation !== ev) { mapLayers.clear(); activeMapLayer=null; activeBranchMapLayer=null; activeMapPresentation=null; layerEvaluation=ev; }
  const getLayer=(mode,prefix,node=state.node)=>{
    const key=`${node}:${mode}:${prefix}`;
    if(!mapLayers.has(key)) mapLayers.set(key,createMapLayer(node,prefix,mode));
    return mapLayers.get(key);
  };
  const values=getLayer('assessment','P');
  const evidenceMode=evidenceLayerId();
  const evidenceNode=values.op.kind==='criterion'?values.op.inputs[0]:values.op.kind==='combination'&&USE_CASES[state.dataset]?state.footprint:state.node;
  const evidence=getLayer(evidenceMode,'B',evidenceNode);
  const downstream=['criterion','combination'].includes(values.op.kind);
  const evidenceTitle=state.node==='heights'?'Height evidence':`${evidence.op.title} evidence result`;
  for(const [id,layer,active] of [['map',values,activeMapLayer],['branch-map',evidence,activeBranchMapLayer]]) {
    if(active!==layer) {
      $(id+'-content').replaceChildren(layer.element);
      $(id).setAttribute('viewBox',`-22 -22 ${layer.size+28} ${layer.size+28}`);
    }
  }
  activeMapLayer=values; activeBranchMapLayer=evidence;
  const key=`${state.node}:${evidenceMode}:${evidenceNode}`;
  if(activeMapPresentation!==key) {
    $('map-views').replaceChildren($('primary-map-panel'),$('secondary-map-panel'));
    $('map-views').setAttribute('data-comparison','true');
    $('map-views').setAttribute('data-input-result','false');
    $('secondary-map-panel').hidden=false;
    $('map-primary-title').hidden=false;
    $('source-map-legend').hidden=false;
    $('map-h').textContent=values.op.title;
    $('map-primary-title').textContent=state.node==='heights'?'Input heights':`${values.op.title} result`;
    $('map-secondary-title').textContent=evidenceTitle;
    $('primary-map-panel').setAttribute('aria-labelledby','map-primary-title');
    $('map').setAttribute('aria-label',`${values.op.title}: values`);
    $('branch-map').setAttribute('aria-label',`${evidenceTitle}: ${state.node==='heights'?'each original height’s evidence':'evidence propagated from supporting heights'}`);
    $('map-layer').textContent=state.node==='heights'?'Input heights + evidence':values.op.kind==='criterion'?`${evidence.op.title} evidence retained through the limit comparison`:values.op.kind==='combination'?'Assessment outcomes · markers identify supporting evidence':`${values.op.title} result + evidence from its supporting heights`;
    renderMapLegend(values.op,values.lo,values.hi,false,'assessment','map-legend');
    renderMapLegend(evidence.op,evidence.lo,evidence.hi,false,evidenceMode,'source-map-legend');
    activeMapPresentation=key;
  }
  for(const id of ['show-source-map','back-overview']) $(id).hidden=true;
  let support=state.footprint==='node' ? currentQuery() : query(ev,state.footprint,state.cell);
  const time=recordedSunTrace();
  if(time) {const indices=new Set(time.sample.sources);support={...support,sourceCells:support.sourceCells.filter(c=>indices.has(c.index))};}
  if(support.illumination) $('map-layer').textContent=`Period result · ${support.illumination.period.label} · ${time?'recorded calculation in inspector: '+time.sample.utc.replace('T',' ').replace(':00Z',' UTC'):'all sample inputs; inspect a timestamp below'}`;
  $('map-selection').innerHTML=mapSelection(values,support,['value','criterion','combination'].includes(values.op.kind));
  $('branch-map-selection').innerHTML=mapSelection(evidence,support);
  if(pinnedLocation && pinnedLocation.dataset===state.dataset) {
    for(const id of ['map-selection','branch-map-selection']) {
      const x=(pinnedLocation.cell.col+MARGIN+.5)*values.s,y=(pinnedLocation.cell.row+MARGIN+.5)*values.s;
      $(id).innerHTML+=`<g aria-hidden="true"><circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="#a45122" stroke-width="1.6"/><text x="${x}" y="${y+2}" text-anchor="middle" font-size="6" fill="#743510">A</text></g>`;
    }
  }
}

function mapSelection(layer,support,showFootprint=false) {
  const {s,ds}=layer,{row:hr,col:hc}=centreHeight(),x=hc*s,y=hr*s;
  const mask=Array(ds.W*ds.H).fill(false);
  support.sourceCells.forEach(cell=>{mask[cell.index]=true;});
  const boundary=regionBoundary(mask,ds.W,s);
  return `<g pointer-events="none" aria-hidden="true">${showFootprint ? `<path d="${boundary}" fill="none" stroke="#fff" stroke-width="3.5" vector-effect="non-scaling-stroke"/><path data-support-frame="true" data-source-count="${support.sourceCells.length}" d="${boundary}" fill="none" stroke="#336981" stroke-width="1.8" vector-effect="non-scaling-stroke"/>` : ''}<rect data-selected="true" data-height-r="${hr}" data-height-c="${hc}" x="${x+s*.15}" y="${y+s*.15}" width="${s*.7}" height="${s*.7}" fill="none" stroke="#172d35" stroke-width="2" vector-effect="non-scaling-stroke"/><rect x="${x+s*.28}" y="${y+s*.28}" width="${s*.44}" height="${s*.44}" fill="none" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`;
}

function cellTitle(op, k, rec, isHeights) {
  const ds = ev.dataset;
  if (isHeights) return `Height ${rec.available ? rec.value.toFixed(3) + ' m' : 'absent'} · ${originName(ds.origins[k])}${rec.quality ? ` · ${isEdm()?'Edit code':'Quality code'} ${ds.quality.codes[k]}: ${qualityLabel(ds.quality.codes[k], ds.quality)}` : ''}${isEdm() && ds.source?.hem ? ` · HEM ${ds.source.hem[k] != null ? ds.source.hem[k] + ' m' : 'void'}` : ''}`;
  const parts = [];
  if (op.kind === 'value') parts.push(rec.available ? fmtValue(op.id, rec.value) : 'unavailable');
  if (op.kind === 'criterion') parts.push(OUTCOME_TEXT[rec.outcome]);
  if (op.kind === 'combination') parts.push(overview(rec.outcomes).title, ...Object.entries(rec.outcomes).map(([branch,outcome])=>`${pipeline.byId[branch].title}: ${OUTCOME_TEXT[outcome]}`));
  parts.push(`Origin support: ${originNotSupplied() ? 'Cell origin not supplied' : SUPPORT_ORIGIN_NAME[rec.origin.headline]}`);
  if(rec.quality) parts.push(`${qt().flagged} supporting heights: ${rec.quality.suspicious}/${rec.quality.total} (input count, not confidence)`, `${qt().layer}: ${qualityCounts(rec.quality)}`);
  parts.push(Object.entries(rec.origin.counts).filter(([,n])=>n).map(([o,n])=>`${n} ${HEIGHT_ORIGIN_NAME[o].toLowerCase()}`).join(', '));
  return parts.join(' · ');
}

function renderMapLegend(op, lo, hi, paired = false, mode = state.mode, target = 'map-legend') {
  const items = [];
  const layer = layerOf(ev.dataset, mode);
  const outlined = (fill, letter) => swatch(fill, `<rect x="1" y="1" width="16" height="16" fill="none" stroke="#203239" stroke-width="1.2" vector-effect="non-scaling-stroke"/>${label(9,9,letter,'#fff')}`);
  if (mode === 'quality') {
    const source = op.kind === 'source';
    if (source) items.push(`<span class="item">${swatch(QUALITY_FILL.correlated)}${qt().nominal} (${qt().nominalRange})</span><span class="item">${swatch(QUALITY_FILL.suspicious,label(9,9,'?','#fff'))}${qt().flagged}</span>`);
    else {
      const max = qualityCountLimit(op), ticks = [...new Set([0, Math.ceil(max/2), max])];
      items.push(`<span class="item">${qt().flagged} supporting heights</span>${ticks.map(n=>`<span class="item">${swatch(qualityCountFill(n,max))}${n}</span>`).join('')}<span class="item">Input count · not a confidence score</span>`);
    }
  } else if (mode === 'origins' && originNotSupplied()) {
    items.push(`<span class="item">${swatch(originFill('L','undocumented'))}U · Cell origin not supplied</span>`);
  } else if (mode === 'origins') {
    for (const [o, st] of Object.entries(ORIGIN_STYLE)) {
      const name = o === 'observed' ? (ev.dataset.acquisition ? 'Stereo-reconstructed' : 'Supplied heights') : o === 'interpolated' ? 'Gap-filled (interpolated)' : o === 'undocumented' ? 'Production history undocumented' : 'Required height value missing';
      items.push(`<span class="item">${swatch(originFill('L', o), o === 'absent' ? absentMark(1, 1, 16) : '')}${originSymbol(o)} ${name}</span>`);
    }
  } else if (layer && layer.type === 'categorical') {
    items.push(`<span class="item">${swatch(layer.base.colour)}${layer.base.label}</span>`);
    for (const cat of Object.values(layer.categories)) items.push(`<span class="item">${swatch(cat.colour)}${cat.label}</span>`);
    if (!op.kind || op.kind !== 'source') items.push('<span class="item">Derived cells: most frequent external fill source, when present; inspect all input counts</span>');
  } else if (layer && layer.type === 'continuous') {
    const span = (layer.max - layer.min) || 1, ticks = [layer.min, (layer.min + layer.max) / 2, layer.max];
    items.push(`<span class="item">${layer.label}${layer.unit ? ` (${layer.unit})` : ''}</span>${ticks.map(v => `<span class="item">${swatch(warmRamp((v - layer.min) / span))}${v.toFixed(2)}</span>`).join('')}<span class="item">${swatch(VOID_FILL)}${layer.voidLabel}</span>${op.kind && op.kind !== 'source' ? '<span class="item">Derived cells: maximum σ over supporting heights</span>' : ''}`);
  } else if (op.kind === 'combination') {
    items.push(`<span class="item">${swatch('var(--a-neither)')}All criteria met</span><span class="item">${outlined('var(--a-unmet)','!')}At least one unmet · outline</span><span class="item">${swatch('#fff','<rect x="1" y="1" width="16" height="16" fill="url(#L-unknown-overlay)"/>')}Missing criterion result · hatching</span>`);
  } else if (op.kind === 'criterion') {
    const keys = paired ? ['neither', 'slope', 'roughness', 'incomplete'] : ['neither', branchOfNode(op.id), 'incomplete'];
    const names = { neither: 'Not exceeded', slope: paired ? 'Slope exceeded' : 'Exceeded', roughness: paired ? 'Roughness exceeded' : 'Exceeded', illumination:'Below minimum', incomplete: 'Missing criterion result' };
    for (const k of keys) {
      const style = ASSESS_STYLE[k], fill = style.fill.replace('#P', '#L');
      const exceeded = ['slope','roughness','illumination'].includes(k);
      items.push(`<span class="item">${exceeded ? outlined(fill,style.letter) : swatch(fill)}${names[k]}${exceeded ? ' · outline' : k === 'incomplete' ? ' · hatching' : ''}</span>`);
    }
  } else {
    const unit = op.unit === '°' ? '°' : op.unit === '%' ? '%' : ' m', f = (v) => (op.id === 'slope' ? v.toFixed(1) : v.toFixed(3));
    items.push(`<span class="item">${swatch(ramp(0))}${f(lo)}${unit}</span><span class="item">${swatch(ramp(0.5))}</span><span class="item">${swatch(ramp(1))}${f(hi)}${unit}</span>`);
    items.push(`<span class="item">${swatch('#fff', absentMark(1, 1, 16))}unavailable</span>`);
  }
  if(mode === 'assessment') {
    if(ev.dataset.quality && !['criterion','combination'].includes(op.kind)) items.push(`<span class="item">${swatch('#8056a3')}${qt().flagged} inputs · square</span>`);
    if(ev.dataset.origins.includes('absent')) items.push(`<span class="item">${swatch('#fff',absentMark(1,1,16))}Missing heights · cross</span>`);
  }
  if(mode === 'assessment' && ['value','criterion','combination'].includes(op.kind)) items.push('<span class="item">Blue outline: source-height footprint</span>');
  $(target).innerHTML = items.join('');
}

// ---------------------------------------------------------------------------
// Source-height map
// ---------------------------------------------------------------------------
function footprintNodes() {
  if (state.footprint !== 'node') return [state.footprint];
  return state.node === 'combined' ? Object.keys(pipeline.byId.combined.branches) : branchOfNode(state.node) ? [branchOfNode(state.node)] : [];
}

let sourceLegendRendered = null;
function renderSources() {
  const ds = ev.dataset, hc = centreHeight();
  const q = state.footprint === 'node' ? currentQuery() : query(ev, state.node === 'combined' ? `${state.footprint}-criterion` : state.footprint, state.cell);
  const radius = q.kind === 'source' ? 1 : 2;
  const r0 = Math.max(0, hc.row - radius), r1 = Math.min(ds.H - 1, hc.row + radius);
  const c0 = Math.max(0, hc.col - radius), c1 = Math.min(ds.W - 1, hc.col + radius);
  const s = 56, width = (c1 - c0 + 1) * s, height = (r1 - r0 + 1) * s;
  const src = new Map(q.sourceCells.map(c => [c.index, c]));
  const scope = q.title;
  const branch = branchOfNode(q.node);
  $('src-h').textContent = q.kind === 'source' ? 'Height neighbourhood' : branch ? `Heights used for this ${branch}` : 'Heights used by both branches';
  $('source-encoding').textContent = ds.quality ? qt().encoding : 'Input evidence · production · m';
  $('footprint-node-label').textContent = state.node === 'heights' ? 'Selected height' : 'Selected step';
  $('source-context').textContent = q.kind === 'source' ? 'Selected delivered height with neighbouring values' : `These original heights support the selected ${branch || scope.toLowerCase()} result at (${hc.row}, ${hc.col}).`;
  $('source-composition').textContent = q.kind === 'source' ? '' : q.kind === 'combination'
    ? `Interpolated inputs · Slope: ${q.branches.slope.origin.counts.interpolated} of ${q.branches.slope.sourceCellCount} · Roughness: ${q.branches.roughness.origin.counts.interpolated} of 25. ${supportCounts(q)} in total.`
    : `${q.origin.counts.interpolated} of ${q.sourceCells.length} source heights are interpolated. ${supportCounts(q)}.`;
  if (q.quality) $('source-composition').textContent = q.kind === 'combination'
    ? `${qt().flagged} inputs · Slope ${q.branches.slope.quality.suspicious}/${q.branches.slope.quality.total} · Roughness ${q.branches.roughness.quality.suspicious}/${q.branches.roughness.quality.total}`
    : `${q.quality.suspicious}/${q.quality.total} inputs flagged ${qt().flaggedLower}.`;
  $('source-composition').hidden = true;
  let body = '';
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = r * ds.W + c, x = (c - c0) * s, y = (r - r0) * s;
    const o = ds.origins[k], h = ds.heights[k], inSrc = src.has(k);
    const suspiciousInput = inSrc && isFlaggedCode(ds.quality?.codes[k]);
    const tip = `Height (${r}, ${c}): ${Number.isFinite(h) ? h.toFixed(4) + ' m' : 'absent'} · ${originName(o)}${ds.quality ? ` · ${isEdm()?'Edit code':'Quality'} ${ds.quality.codes[k]}: ${qualityLabel(ds.quality.codes[k], ds.quality)}` : ''}${inSrc ? ' · declared source' : ' · context only'}${acquisitionTip(ds,k)}`;
    if (q.kind === 'value' && q.node === 'slope' && r === hc.row && c === hc.col) {
      body += `<g data-r="${r}" data-c="${c}" data-unused-centre="true"><rect x="${x+1}" y="${y+1}" width="${s-2}" height="${s-2}" rx="3" fill="#fff" stroke="#c8d4d6"/><text class="source-origin" x="${x+s/2}" y="${y+26}" text-anchor="middle">Selected cell</text><text class="source-origin" style="font-size:7px;font-weight:400" x="${x+s/2}" y="${y+39}" text-anchor="middle">Not an input</text><title>${tip} · Selected cell; centre not used by Horn slope</title></g>`;
      continue;
    }
    body += `<g data-r="${r}" data-c="${c}"${inSrc ? ' data-source="true"' : ''}${suspiciousInput ? ' data-suspicious-input="true"' : ''}><rect x="${x + 1}" y="${y + 1}" width="${s - 2}" height="${s - 2}" rx="3" fill="${suspiciousInput ? '#f0e6f7' : inSrc ? '#fff' : '#f1f3f3'}" stroke="${suspiciousInput ? QUALITY_FILL.suspicious : inSrc ? '#c8d4d6' : '#e9eeec'}" stroke-width="${suspiciousInput ? 1.6 : .7}"/>`;
    body += ds.quality ? '' : `<rect data-origin="${o}" x="${x + 5}" y="${y + 5}" width="${s - 10}" height="6" rx="1" fill="${!inSrc ? '#e0e5e5' : ds.quality ? '#d9e3e7' : originFill('Q', o)}"/>`;
    body += `<text class="source-value${ds.quality ? ' published-height' : ''}${inSrc ? '' : ' context-value'}" x="${x + s/2}" y="${y + (inSrc ? 32 : 33)}" text-anchor="middle">${Number.isFinite(h) ? h.toFixed(3) : '—'}</text>`;
    body += !inSrc ? `<text class="source-origin" x="${x+s/2}" y="${y+46}" text-anchor="middle">Context</text><title>${tip}</title></g>` : ds.quality ? `<rect data-quality-code="${ds.quality.codes[k]}" x="${x+5}" y="${y+5}" width="${s-10}" height="6" rx="1" fill="${isFlaggedCode(ds.quality.codes[k]) ? QUALITY_FILL.suspicious : QUALITY_FILL.correlated}"/>${isFlaggedCode(ds.quality.codes[k]) ? `<text x="${x+s/2}" y="${y+46}" text-anchor="middle" class="source-origin" style="font-size:7px;fill:#63358b">${qt().flagged}</text>` : ''}<title>${tip}</title></g>`
      : `<text class="source-origin" x="${x+s/2}" y="${y+46}" text-anchor="middle">${originSymbol(o)}</text><title>${tip}</title></g>`;
  }
  const outline = (radius, dash) => `<rect x="${(hc.col - radius - c0) * s + 1}" y="${(hc.row - radius - r0) * s + 1}" width="${(2 * radius + 1) * s - 2}" height="${(2 * radius + 1) * s - 2}" rx="3" fill="none" stroke="#336981" stroke-width="2"${dash ? ' stroke-dasharray="6 4"' : ''} pointer-events="none"/>`;
  const fp = footprintNodes();
  const outlines = (fp.includes('roughness') ? outline(2, true) : '') + (fp.includes('slope') ? outline(1, false) : '');
  const selectedCentre = `<rect data-selected-centre="true" data-height-r="${hc.row}" data-height-c="${hc.col}" x="${(hc.col-c0)*s+2}" y="${(hc.row-r0)*s+2}" width="${s-4}" height="${s-4}" rx="3" fill="none" stroke="#000" stroke-width="1.8" pointer-events="none"/><rect x="${(hc.col-c0)*s+4.5}" y="${(hc.row-r0)*s+4.5}" width="${s-9}" height="${s-9}" rx="2" fill="none" stroke="#fff" stroke-width="1.1" pointer-events="none"/>`;
  const axes = Array.from({length:c1-c0+1},(_,i)=>`<text class="axis" x="${(i+.5)*s}" y="-8" text-anchor="middle">${c0+i}</text>`).join('') + Array.from({length:r1-r0+1},(_,i)=>`<text class="axis" x="-8" y="${(i+.5)*s}" text-anchor="end" dominant-baseline="middle">${r0+i}</text>`).join('');
  $('sources').setAttribute('viewBox', `-23 -23 ${width + 28} ${height + 28}`);
  $('sources').setAttribute('style', `max-width:${width + 28}px;max-height:${height + 28}px`);
  $('source-map-frame').setAttribute('style', `flex-basis:${height + 28}px`);
  $('sources').setAttribute('aria-label', `${scope}: ${q.sourceCells.length} source heights; centre row ${hc.row}, column ${hc.col}. Values in metres.`);
  $('sources').innerHTML = defs('Q') + body + outlines + selectedCentre + axes;
  if (q.kind === 'value' && ['slope','roughness'].includes(q.node)) {
    const gap=80, offset=width+gap, cx=(hc.col-c0)*s, cy=(hc.row-r0)*s;
    let resultGrid='';
    for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++) {
      const x=(c-c0)*s,y=(r-r0)*s;
      resultGrid+=`<rect x="${x+1}" y="${y+1}" width="${s-2}" height="${s-2}" rx="3" fill="#f5f7f7" stroke="#e0e6e6"/>`;
    }
    const evidenceFill=q.quality ? QUALITY_FILL[q.quality.headline] : originFill('Q',q.origin.headline);
    const evidence=q.quality ? `${q.quality.suspicious}/${q.quality.total} inputs ${qt().flaggedLower}` : productionText(q);
    const resultCell=`<g data-calculated-result="${q.node}"><rect x="${cx+1}" y="${cy+1}" width="${s-2}" height="${s-2}" rx="3" fill="#fff" stroke="#203239" stroke-width="2"/><rect x="${cx+5}" y="${cy+5}" width="${s-10}" height="6" fill="${evidenceFill}"/><text class="source-value" style="font-size:11px" x="${cx+s/2}" y="${cy+32}" text-anchor="middle">${q.available ? fmtValue(q.node,q.value) : 'Missing'}</text><title>Calculated ${q.title.toLowerCase()}: ${fmtValue(q.node,q.value)}. ${evidence}. Other result cells are not shown.</title></g>`;
    $('sources').setAttribute('viewBox',`-23 -45 ${2*width+gap+28} ${height+75}`);
    $('sources').setAttribute('style',`max-width:${2*width+gap+28}px;max-height:${height+75}px`);
    $('sources').setAttribute('aria-label',`Original inputs in metres and calculated ${q.title.toLowerCase()} in ${q.unit}. ${q.node === 'slope' ? 'Original centre is unused and blank.' : 'Original centre is included.'} Result centre: ${fmtValue(q.node,q.value)}. ${evidence}.`);
    $('sources').innerHTML=defs('Q')+`<text class="axis" x="${width/2}" y="-28" text-anchor="middle">Input · original heights (m)</text>`+body+outlines+selectedCentre+axes
      +`<g aria-hidden="true"><path d="M${width+8} ${height/2}h32" fill="none" stroke="#336981" stroke-width="2"/><path d="M${width+32} ${height/2-5}l8 5l-8 5" fill="none" stroke="#336981" stroke-width="2"/></g><text class="axis" x="${width/2}" y="${height+20}" text-anchor="middle">Evidence from used inputs →</text>`
      +`<g transform="translate(${offset} 0)"><text class="axis" x="${width/2}" y="-28" text-anchor="middle">Result · ${q.title.toLowerCase()}</text>${resultGrid}${resultCell}${axes}<text class="axis" x="${width/2}" y="${height+20}" text-anchor="middle">${evidence}</text></g>`;
  }

  if (sourceLegendRendered !== Boolean(ds.quality)) {
  $('source-legend').innerHTML = ['observed','interpolated','undocumented','absent'].map(o => `<span class="item">${swatch(originFill('L',o),o === 'absent' ? absentMark(1,1,16) : '')}${originSymbol(o)} · ${originName(o)}</span>`).join('');
    if (ds.quality) $('source-legend').innerHTML = `<span class="item">${swatch(QUALITY_FILL.suspicious)}${qt().flagged}</span><span class="item">${swatch(QUALITY_FILL.correlated)}${qt().nominal}</span>`;
    sourceLegendRendered = Boolean(ds.quality);
  }
  $('support-note').textContent = q.kind === 'source'
    ? 'Black outline: selected height. Grey neighbours are spatial context. Interpolation inputs are not traced here.'
    : `${state.mode === 'origins' && state.node !== 'heights' ? 'Map colours summarise result support; strips show individual height origins.' : 'Strips show production history.'} ${fp.includes('slope') ? 'Solid outline: eight slope neighbours; centre excluded. ' : ''}${fp.includes('roughness') ? 'Dashed outline: roughness 5×5. ' : ''}Black square: same selected location. Grey cells are not inputs.`;
  if (ds.quality) $('support-note').textContent = 'P: documented product-level processing; individual filling history unavailable. Q: separate quality flag. Slope uses eight neighbours, excluding the centre; roughness uses all 25. Grey cells are context only.';
  for (const footprint of ['node','slope','roughness']) $('footprint-' + footprint).checked = state.footprint === footprint;

}

// ---------------------------------------------------------------------------
// Inspection panel
// ---------------------------------------------------------------------------
const currentQuery = () => query(ev, state.node, state.node === 'heights' ? centreHeight() : state.cell);
const chip = (o, text) => `<span class="chip">${swatch(originFill('L', o), o === 'absent' ? absentMark(1, 1, 16) : '')}${text}</span>`;

function pathList(q) {
  return `<ol class="paths">${q.paths.map(p => `<li>${p.steps.map(st => `${pipeline.byId[st.node].title}${st.cells.length > 1 ? ` (${st.cells.length} cells)` : ''}`).join(' → ')}</li>`).join('')}</ol>`;
}
function boundaries(q) {
  const out = [`<li>${q.boundaries.source}</li>`];
  if (q.originDeclaration?.status !== 'not-supplied' && q.boundaries.undocumented.length) out.push(`<li>${q.boundaries.undocumented.length} declared source height${q.boundaries.undocumented.length > 1 ? 's have' : ' has'} no documented origin; the trace cannot go further back for ${q.boundaries.undocumented.length > 1 ? 'them' : 'it'}.</li>`);
  if (q.boundaries.missing.length) out.push(`<li>Absent: ${q.boundaries.missing.map(m => `height (${m.row}, ${m.col}) required by ${m.branches.join(' and ') || 'this node'}`).join('; ')}.</li>`);
  return `<ul class="paths">${out.join('')}</ul>`;
}
const params = (p) => Object.entries(p).map(([k, v]) => `${k.replace(/_m$/, ' (m)').replace(/Deg$/, ' (°)')}: ${v}`).join(' · ') || '—';

function supportCounts(q) {
  const counts = q.sourceCells.reduce((out, c) => { out[c.origin] = (out[c.origin] || 0) + 1; return out; }, {});
  return Object.entries(counts).map(([o, n]) => `${n} ${HEIGHT_ORIGIN_NAME[o].toLowerCase()}`).join(', ');
}

function acquisitionTip(ds, k) {
  if (!ds.acquisition) return '';
  const reason = ds.acquisition.reasonText[ds.acquisition.reasons[k]];
  return ` · Stereo: ${reason} · ${ds.origins[k] === 'interpolated' ? 'gap-filled from recovered heights' : ds.origins[k] === 'observed' ? 'recovered by matching' : ds.acquisition.inOverlap[k] ? `left absent: beyond the ${ds.acquisition.fillPolicy.maxDistance_m} m filling limit` : 'left absent: outside stereo coverage'}`;
}

function acquisitionExplanation(q, detailed = false) {
  const cells = q.sourceCells, filled = cells.filter(c => c.acquisition.filled);
  const shadow = filled.filter(c => c.acquisition.reasonCode === 1).length;
  if (q.kind === 'source') {
    const c = cells[0];
    if (c.origin === 'absent') return c.acquisition.inCoverage
      ? `Stereo observation: ${c.acquisition.reason}. Left absent: no recovered height within the ${c.acquisition.maxFillDistance_m} m filling limit.`
      : 'No stereo coverage at this height; no replacement was supplied.';
    if (c.origin === 'observed') return 'Recovered by matching the simulated stereo images. This height was not gap-filled.';
    return `Stereo observation: ${c.acquisition.reason}. Interpolated from recovered heights${detailed ? ` (${ev.dataset.acquisition.fillMethod.toLowerCase()})` : ''}.`;
  }
  if (!detailed) {
    const parts = [];
    if (filled.length) {
      const count = filled.length === cells.length ? `All ${cells.length}` : `${filled.length} of ${cells.length}`;
      const cause = shadow === filled.length ? ' after shadow prevented stereo matching' : shadow ? ` (${shadow} after shadow-related matching failures)` : '';
      parts.push(`${count} supporting heights were interpolated${cause}.`);
      if (q.kind === 'combination') {
        const branches = Object.entries(q.branches).filter(([,br])=>br.origin.counts.interpolated).map(([name])=>name);
        if (branches.length === 2) parts.push('Both assessments retain this interpolation in their declared support.');
        else if (branches.length === 1) parts.push(`The ${branches[0]} assessment retains interpolated support.`);
      }
    }
    if (q.origin.counts.absent) parts.push(`${q.origin.counts.absent} required heights are absent; ${q.kind === 'combination' ? 'the assessment is incomplete' : 'the result is unavailable'}.`);
    return parts.length ? parts.join(' ') : `All ${cells.length} supporting heights were recovered by stereo matching.`;
  }
  const parts = [];
  if (filled.length) parts.push(`${filled.length} of ${cells.length} supporting heights were gap-filled${shadow ? `; ${shadow} followed shadow-related stereo failures` : ''}.`);
  if (q.origin.counts.absent) parts.push(`${q.origin.counts.absent} required heights remain absent; ${q.kind === 'combination' ? 'the assessment is incomplete' : 'this value is unavailable'}.`);
  if (!parts.length) parts.push(`All ${cells.length} supporting heights were recovered by stereo matching.`);
  const centre = centreHeight(), k = centre.row*ev.dataset.W+centre.col;
  if (ev.dataset.origins[k] === 'interpolated') parts.push(`The centre height was also gap-filled (${ev.dataset.acquisition.reasonText[ev.dataset.acquisition.reasons[k]]}).`);
  return parts.join(' ');
}

function supportExplanation(q) {
  if(q.quality) return isEdm()
    ? `${q.originDeclaration.explanation} The Edit Data Mask records the last editing step per pixel; an edited pixel is a derived height (external void-fill, interpolation or smoothing), declared by the product, not a calibrated error estimate.`
    : `${q.originDeclaration.explanation} Code 3 marks suspicious matching; it does not establish interpolation. Code 4 means interpolated/extrapolated, but never occurs in this delivered product. No quality flag is treated as a calibrated error estimate.`;
  if (ev.dataset.acquisition) return acquisitionExplanation(q, true);
  if (q.kind === 'source') return q.available
    ? `This height is supplied by the delivery record. Its origin is ${HEIGHT_ORIGIN_NAME[q.origin.declared].toLowerCase()}; earlier acquisition is not reconstructed.`
    : 'This height is absent from the delivery. A missing numerical value is different from undocumented history.';
  const parts = [];
  if (q.boundaries.missing.length) parts.push(`${q.boundaries.missing.length} required source height${q.boundaries.missing.length === 1 ? ' is' : 's are'} absent. ${q.kind === 'combination' ? 'The combined assessment is incomplete; any available branch outcome is retained.' : 'This calculation cannot return a result.'}`);
  if (q.origin.counts.undocumented) parts.push('The local calculation is known, but some source heights have no earlier origin record. Their history remains undocumented.');
  if (q.origin.counts.interpolated) parts.push(q.kind === 'combination'
    ? `${q.origin.text}. Each branch keeps its own support description.`
    : `The ${q.kind === 'criterion' ? 'criterion' : q.title.toLowerCase()} inherits interpolated support through its footprint; its producing method remains ${q.method}.`);
  if (!parts.length) parts.push(`All ${q.sourceCells.length} declared source heights are recorded as observed. This describes their supplied origins, not the accuracy of the ${q.title.toLowerCase()}.`);
  return parts.join(' ');
}

function renderResults() {
  const q = query(ev, 'combined', state.cell);
  const compact = ['criterion','combination'].includes(pipeline.byId[state.node].kind);
  $('results').setAttribute('data-criterion-selector',String(compact));
  $('selected-location').textContent = `Height cell ${centreHeight().row}, ${centreHeight().col}`;
  $('selected-location').setAttribute('title', `Analysis cell (${state.cell.row}, ${state.cell.col}) is centred at height cell (${centreHeight().row}, ${centreHeight().col}). URL and API cell indices remain on the analysis grid.`);
  $('results').innerHTML = `<ul class="criterion-list" style="grid-template-columns:repeat(${Object.keys(q.branches).length},minmax(0,1fr))" aria-label="Criteria at the selected location">${Object.entries(q.branches).map(([branch,br]) => {
    const active = (state.footprint === 'node' ? branchOfNode(state.node) : state.footprint) === branch;
    const interpolated = br.origin.counts.interpolated;
    const centreInterpolated = ev.dataset.origins[centreHeight().row*ev.dataset.W+centreHeight().col] === 'interpolated';
    const gradientInterpolated = interpolated;
    const calculationNote = br.outcome === 'unavailable' ? 'A required height is absent; no numerical result.'
      : branch === 'slope'
        ? (centreInterpolated && !gradientInterpolated
          ? 'The interpolated centre is excluded from slope inputs.'
          : `${gradientInterpolated} of 8 gradient neighbours interpolated; centre weight is zero.`)
        : 'All 25 heights enter the mean and spread calculation.';
    const counts = Object.entries(br.origin.counts).filter(([,n])=>n).map(([origin,n])=>`${n} ${originName(origin).toLowerCase()}`).join(' · ');
    return `<li${pipeline.byId[state.node].kind === 'criterion' && branchOfNode(state.node) !== branch ? ' hidden' : ''} class="criterion-row ${branch}${active ? ' active' : ''}">
      <div class="criterion-heading"><button class="criterion-link" data-criterion="${branch}" aria-pressed="${active}" aria-controls="sources" aria-label="Show heights supporting ${pipeline.byId[branch].title.toLowerCase()}">${pipeline.byId[branch].title}</button><span${compact ? ' hidden' : ''} class="outcome ${br.outcome}">${branch==='illumination' ? (br.outcome==='not-exceeded'?'Minimum met':br.outcome==='exceeded'?'Below minimum':'Unavailable') : OUTCOME_TEXT[br.outcome]}</span></div>
      <div${compact ? ' hidden' : ''} class="criterion-details"><p class="criterion-value"><strong>${fmtValue(branch,br.value)}</strong><span> / ${fmtLimit(branch,br.limit)} ${branch==='illumination'?'minimum':'limit'}</span></p>${branch==='illumination'?`<p class="hint">${ev.dataset.illuminationPeriod.label} · local terrain</p>`:''}
      ${br.quality ? '' : `<div class="card-support">${chip(br.origin.headline,productionText(br))}</div>`}
      ${br.quality ? `<div class="quality-support" data-quality-branch="${branch}" data-suspicious="${br.quality.suspicious}">${qualitySwatch(br.quality)}<span>${br.quality.suspicious}/${br.quality.total} inputs ${qt().flaggedLower}</span></div>` : ''}
      </div><p hidden class="criterion-counts" data-branch="${branch}" data-interpolated="${interpolated}" data-total="${br.sourceCellCount}">${counts}</p>
      <span hidden class="criterion-method">${branch === 'slope' ? 'Horn gradient · 3×3' : 'Height standard deviation · 5×5'}. ${br.quality ? `${branch === 'slope' ? '12 × 12' : '20 × 20'} m input area. Quality flags are not numerical error estimates.` : calculationNote}</span>
    </li>`;
  }).join('')}</ul>`;

}

function resultExplanation(q) {
  if(q.quality) return isEdm() ? (q.kind === 'combination'
      ? `Copernicus GLO-30 · native ~${ev.dataset.res} m posts. Edited inputs: slope ${q.branches.slope.quality.suspicious}/${q.branches.slope.quality.total}; roughness ${q.branches.roughness.quality.suspicious}/${q.branches.roughness.quality.total}. The Edit Data Mask marks void-fill/interpolation, declared by the product.`
      : `Copernicus GLO-30 · ~${ev.dataset.res} m posts. ${q.kind === 'source' ? `Edit code ${q.sourceCells[0].quality.code}: ${q.sourceCells[0].quality.label}.` : `${q.quality.suspicious}/${q.quality.total} inputs flagged edited.`}`)
    : q.kind === 'combination'
    ? `LROC · native 4 m posts. Suspicious inputs: slope ${q.branches.slope.quality.suspicious}/${q.branches.slope.quality.total}; roughness ${q.branches.roughness.quality.suspicious}/25. Quality flags do not establish interpolation.`
    : `Published LROC stereo DEM · 4 m posts. ${q.kind === 'source' ? `Quality code ${q.sourceCells[0].quality.code}: ${q.sourceCells[0].quality.label}.` : `${q.quality.suspicious}/${q.quality.total} inputs flagged suspicious.`}`;
  if (ev.dataset.acquisition) return acquisitionExplanation(q);
  if (q.kind !== 'combination') return supportExplanation(q);
  const slope = query(ev,'slope',state.cell), roughness = query(ev,'roughness',state.cell);
  const slopeCells = new Set(slope.sourceCells.map(c=>c.index));
  const outside = roughness.sourceCells.filter(c=>!slopeCells.has(c.index) && c.origin === 'interpolated').length;
  const undocumented = roughness.sourceCells.filter(c => c.origin === 'undocumented');
  if (slope.origin.headline === 'observed' && roughness.origin.headline === 'undocumented' && undocumented.length === 1 && !roughness.origin.counts.interpolated) {
    const cell = undocumented[0];
    return `Slope uses ${slope.sourceCells.length} observed heights. Roughness also uses an undocumented height at (${cell.row}, ${cell.col}), outside the slope window. The combined result inherits that undocumented history; its centre height is still observed.`;
  }
  if (slope.origin.headline === 'observed' && roughness.origin.headline === 'interpolated' && outside) {
    return `Slope uses ${slope.sourceCells.length} observed heights. Roughness also includes ${outside} interpolated height${outside === 1 ? '' : 's'} outside the slope window. The combined result retains this dependence.`;
  }
  return supportExplanation(q);
}

function renderInspect() {
  const q = currentQuery();
  const originText = productionText(q);
  const selectedValue = q.kind === 'combination' ? overview(q.outcomes).title : q.kind === 'criterion' ? (q.node==='illumination-criterion' ? (q.outcome==='not-exceeded'?'Minimum met':q.outcome==='exceeded'?'Below minimum':'Unavailable') : OUTCOME_TEXT[q.outcome]) : q.available ? fmtValue(q.node,q.value) : 'Unavailable';
  const detail = q.kind === 'criterion' ? `${fmtValue(pipeline.byId[q.node].inputs[0],q.value)} against ${fmtLimit(pipeline.byId[q.node].inputs[0],q.limit)}` : q.kind === 'combination' ? '' : q.kind === 'source' ? '' : `${q.sourceCells.length} declared source heights`;
  const downstream=['criterion','combination'].includes(q.kind);
  $('selection-summary').innerHTML = `<div class="compact-result"><h2 id="selected-title">${q.title}</h2>${q.kind === 'criterion' ? '' : `<p class="selected-value${q.kind === 'combination' || q.kind === 'criterion' ? ' outcome-value' : ''}">${selectedValue}</p>`}</div><div class="evidence-context" aria-label="Input evidence"><p><span class="small-label">Production history</span> ${q.quality ? `${qt().production} · ${qt().cellHistory}` : originText}</p>${q.kind !== 'source' ? '' : `<p><span class="small-label">${q.quality ? qt().layer : 'Quality flags'}</span> ${q.quality ? (q.kind === 'source' ? q.sourceCells[0].quality.label : (['criterion','combination'].includes(q.kind) ? 'Inherited from source heights · counts below' : q.quality.text)) : 'Not supplied separately'}</p>${isEdm() && ev.dataset.source?.hem ? `<p><span class="small-label">Height error (HEM)</span> ${ev.dataset.source.hem[q.cell.index] != null ? ev.dataset.source.hem[q.cell.index] + ' m σ · supplied input estimate' : 'No estimate supplied'}</p>` : ''}`}</div>`;
  if ($('details-dialog').open) renderDetails(q);
}

// Describe supplied evidence without converting quality flags into production history.
function outcomeEvidence(q) {
  const total=q.sourceCells.length, counts=q.origin.counts || {}, lines=[], notes=[];
  const line=(marker,text)=>`<p class="outcome-evidence">${marker}<span>${text}</span></p>`;
  if(q.quality) {
    const n=q.quality.suspicious;
    lines.push(line(qualitySwatch(q.quality),`${n}/${q.quality.total} supporting heights flagged ${qt().flaggedLower} · ${state.node === 'combined' ? pipeline.byId[branchOfNode(q.node)].title + ' contribution to Combined evidence' : 'count at the selected evidence-map cell'}`));
    if(n) notes.push('Review the flagged inputs before relying on this result.');
    else notes.push(`No supporting heights carry the ${qt().flaggedLower} flag; this does not establish result accuracy.`);
  }
  if(counts.interpolated) {
    lines.push(line(swatch(originFill('L','interpolated')),`${counts.interpolated}/${total} supporting heights were interpolated`));
    notes.push('Review the interpolated inputs before relying on this result.');
  }
  if(counts.absent) {
    lines.push(line(swatch('#fff',absentMark(1,1,16)),`${counts.absent}/${total} ${q.available!==false && q.category!=='incomplete'?'tested':'required'} height values missing`));
    notes.length=0;
    notes.push(q.available===false || q.category==='incomplete' ? 'Required inputs are missing; the assessment cannot be completed.' : 'Missing heights remain in the evidence; known terrain blockers establish shadow for the resolved samples.');
  }
  if(counts.undocumented && !q.quality) {
    lines.push(line(swatch(originFill('L','undocumented')),`${counts.undocumented}/${total} supporting heights have undocumented production history`));
    notes.push('Their production history cannot be established from this delivery.');
  }
  if(!lines.length) {
    lines.push(line(swatch(originFill('L','observed')),`${total}/${total} supporting heights recorded as ${ev.dataset.acquisition ? 'stereo-reconstructed' : 'observed'}`));
    notes.push('This records their declared origin, not the accuracy of the result.');
  }
  return `<div class="outcome-evidence-group">${lines.join('')}</div><p class="evidence-explanation">${notes.join(' ')}</p>`;
}

// Recorded-time inspection changes only overlays and explanation, never period values.
function recordedSunTrace() {
  if(state.recordedTime<0 || !ev.records.illumination)return null;
  if(state.footprint!=='node'&&state.footprint!=='illumination')return null;
  if(!state.node.startsWith('illumination') && !(state.trace&&state.footprint==='illumination'))return null;
  return {...core.illuminationTrace(ev,state.cell,state.recordedTime),periodMetric:ev.dataset.illuminationPeriod.gridMetric};
}
function renderIlluminationInspector(q,tracing) {
  const selected=q.node==='illumination'||q.node==='illumination-criterion'||(tracing && state.footprint==='illumination');
  const panel=$('illumination-panel'); panel.hidden=!selected;
  const trace=recordedSunTrace();
  $('sun-profile').hidden=!trace;
  $('source-map-frame').setAttribute('class',trace?'source-map-frame with-sun-profile':'source-map-frame');
  if(!ev.records.illumination)return;
  const iq=query(ev,'illumination',state.cell), info=iq.illumination;
  if(selected) {
    const fixed=info.period.fixedSun,time=trace?.sample;
    const evidence=time ? `${time.sources.length} heights tested${time.suspicious===null?'':' · '+time.suspicious+' suspicious'} · ${time.interpolated===null?'interpolation history not supplied':time.interpolated+' declared interpolated'}` : `${info.suspiciousSamples}/${info.samples.length} samples use suspicious heights · interpolation history not supplied`;
    panel.innerHTML=`<div class="subheading"><h3>${info.period.label}</h3><label class="sun-sample-label" for="recorded-time">Inspect calculation at <select id="recorded-time" aria-controls="sources sun-profile map-selection branch-map-selection" aria-describedby="recorded-time-help"><option value="-1"${state.recordedTime<0?' selected':''}>All samples · period support</option>${info.samples.map((t,i)=>`<option value="${i}"${i===state.recordedTime?' selected':''}>${t.utc.slice(5,16).replace('T',' ')} UTC</option>`).join('')}</select></label></div>
      <p id="recorded-time-help" class="hint">JPL Horizons · recorded hourly samples · ${info.period.startUtc.slice(5,16).replace('T',' ')}–${info.period.endUtc.slice(5,16).replace('T',' ')} UTC. Maps show the full period; 3D preview stays fixed.</p>
      <div class="sun-timeline" role="img" aria-label="Hourly illumination: ${info.samples.map(t=>`${t.utc}: ${t.status}`).join('; ')}">${info.samples.map((t,i)=>`<span class="sun-slot ${t.status}${i===state.recordedTime?' selected':''}" title="${t.utc}: ${t.status}">${t.status==='illuminated'?'☀':t.status==='shadowed'?'—':'?'}</span>`).join('')}</div>
      <div class="recorded-explanation" role="status">${trace?`<strong>${trace.reason}</strong> · Sun ${time.azimuthDeg.toFixed(1)}° azimuth / ${time.elevationDeg.toFixed(2)}° elevation<br>${time.elevationDeg<=0?'Sun is below the local horizon; no terrain test is needed.':trace.reason==='Terrain-blocked'?'A tested height reaches or crosses the Sun line.':trace.reason==='Illuminated'?'Every tested height is below the Sun line within the crop.':'Missing heights prevent a complete line-of-sight test.'} ${trace.contributionHours===null?'This hour remains unresolved.':`This sample contributes ${trace.contributionHours} illuminated hour${trace.contributionHours===1?'':'s'}.`}`:'Select a recorded timestamp to see the directional test. ☀ illuminated · — shadowed · ? unresolved.'}</div>
      <p class="time-evidence">${evidence}</p><p class="hint">Period: ${info.illuminatedHours}/${info.period.durationHours} sampled hours illuminated${info.unknownHours?` · ${info.unknownHours} h unresolved`:` = ${iq.value.toFixed(1)}%`}. Local terrain only. Fixed preview: ${fixed.utc.slice(5,16).replace('T',' ')} UTC.</p>`;
  }
  const sq=state.footprint==='node'?q:query(ev,state.footprint,state.cell);
  const wide=sq.node.startsWith('illumination')||sq.kind==='combination';
  if(!wide || (['criterion','combination'].includes(q.kind)&&!tracing))return;
  const ds=ev.dataset, hc=centreHeight();
  let cells=sq.sourceCells;
  if(trace){const indices=new Set(trace.sample.sources);cells=cells.filter(c=>indices.has(c.index));}
  const used=new Set(cells.map(c=>c.index)),s=360/ds.W;
  let body='';
  for(let i=0;i<ds.W*ds.H;i++) {
    const r=Math.floor(i/ds.W),c=i%ds.W,inSrc=used.has(i);
    const fill=inSrc?(ds.quality?(isFlaggedCode(ds.quality.codes[i])?QUALITY_FILL.suspicious:QUALITY_FILL.correlated):originFill('Q',ds.origins[i])):'#f4f6f6';
    body+=`<rect data-height-index="${i}"${inSrc?' data-source="true"':''}${inSrc && isFlaggedCode(ds.quality?.codes[i])?' data-suspicious-input="true"':''} x="${c*s}" y="${r*s}" width="${s}" height="${s}" fill="${fill}" stroke="#fff" stroke-width=".5"><title>Height (${r}, ${c}): ${Number.isFinite(ds.heights[i])?ds.heights[i].toFixed(3)+' m':'missing'} · ${ds.quality?qualityLabel(ds.quality.codes[i],ds.quality):originName(ds.origins[i])} · ${inSrc?'used input':'context'}</title></rect>`;
  }
  const mask=Array(ds.W*ds.H).fill(false);used.forEach(i=>mask[i]=true);
  body+=`<path d="${regionBoundary(mask,ds.W,s)}" fill="none" stroke="#336981" stroke-width=".8"/><rect data-selected-centre="true" data-height-r="${hc.row}" data-height-c="${hc.col}" x="${hc.col*s}" y="${hc.row*s}" width="${s}" height="${s}" fill="none" stroke="#000" stroke-width="2"/>`;
  if(trace)body+=sunArrow(trace.sample,(hc.col+.5)*s,(hc.row+.5)*s,360,info.period.gridMetric);
  $('src-h').textContent=sq.kind==='combination'?'Heights supporting the criteria':'Heights tested toward the Sun';
  $('source-context').textContent=`${cells.length} unique heights · selected cell (${hc.row}, ${hc.col}) · ${trace?trace.sample.utc.slice(5,16).replace('T',' ')+' UTC':'all contributing samples'}; pale cells are context`;
  $('sources').setAttribute('viewBox','-2 -2 364 364');
  $('sources').setAttribute('style',trace?'max-width:100%;max-height:100%':'max-width:364px;max-height:364px');
  if(trace){$('sun-profile').setAttribute('viewBox','0 0 420 250');$('sun-profile').innerHTML=sunProfile(trace);$('sun-profile').setAttribute('aria-label',`${trace.reason}. Sun elevation ${trace.sample.elevationDeg.toFixed(2)} degrees. Solid line: tested terrain heights relative to selected cell; dashed line: Sun. Outlined points block sunlight. ${trace.sample.missing} missing posts.`);}
  $('sources').setAttribute('aria-label',`${$('source-context').textContent}. Full height values and per-time dependencies are in Full record.`);
  $('sources').innerHTML=defs('Q')+body;
}

// Downstream steps consume calculated values/outcomes; heights remain a separate trace.
function renderStepSupport() {
  const q=currentQuery(), downstream=['criterion','combination'].includes(q.kind);
  renderIlluminationInspector(q,downstream);
  $('results-panel').hidden = q.kind !== 'combination';
  $('source-panel').hidden = false;
  $('step-support').hidden = !downstream;
  $('results-h').textContent = q.kind === 'criterion' ? 'Value used by this criterion' : 'Select a criterion to inspect its heights';
  $('results-panel').setAttribute('data-single-criterion',String(q.kind === 'criterion'));
  if (!downstream) return;
  const supported=q.kind==='combination' ? query(ev,`${state.footprint}-criterion`,state.cell) : q;
  const input=pipeline.byId[supported.node].inputs[0];
  const relation=input==='illumination' ? (supported.outcome==='exceeded'?'<':'≥') : supported.outcome === 'exceeded' ? '>' : '≤';
  const outcome=input==='illumination' ? (supported.outcome==='exceeded'?'Below minimum':'Minimum met') : OUTCOME_TEXT[supported.outcome];
  $('step-support').innerHTML = `<p class="support-equation">${pipeline.byId[input].title} · ${supported.available ? `${fmtValue(input,supported.value)} ${relation} ${fmtLimit(input,supported.limit)} → ${outcome}` : 'Calculated value unavailable → Missing criterion result'}</p>${outcomeEvidence(supported)}`;

}

// The supervisory flow reuses the evaluated records rather than keeping a second assessment.
function inspectionQuery(cell=state.cell) {
  const node=state.node==='combined'?state.footprint:state.node;
  return query(ev,node,node==='heights'?{row:cell.row+MARGIN,col:cell.col+MARGIN}:cell);
}
function evidenceMarkup(q) {
  const e=summariseEvidence(ev.dataset,q.sourceCells.map(c=>c.index),evidenceLayerId());
  return `<p class="evidence-summary" data-evidence-layer="${e.id}" data-support-total="${e.total}"${e.type==='continuous'?` data-present="${e.present}" data-missing="${e.missing}"`:''}>${escapeHtml(e.summary)}</p><p class="hint">${escapeHtml(e.note || '')}</p>`;
}
function renderSupervisor() {
  const ds=ev.dataset, usecase=USE_CASES[ds.id];
  $('case-title').textContent=usecase?.place || ds.title;
  $('case-task').textContent=usecase?.task || 'Inspect the retained terrain evidence.';
  $('case-boundary').textContent=usecase?.boundary || ds.description;
  const metric=spacing(ds), xy=`${metric.x.toFixed(2)} m E–W × ${metric.y.toFixed(2)} m N–S`;
  $('case-scale').textContent=`${ds.source?.product || 'Controlled delivery'} · ${ds.source?.version || ''} · ${xy} spacing`;
  $('quantity-controls').innerHTML=['slope','roughness','heights','combined'].map(node=>`<button data-view-node="${node}" aria-pressed="${state.node===node}">${node==='combined'?'Criteria':pipeline.byId[node].title}</button>`).join('');
  if(!usecase) { $('selection-evidence').innerHTML=''; renderComparison(); return; }
  const q=inspectionQuery(), combined=query(ev,'combined',state.cell), layer=evidenceLayerId();
  const e=summariseEvidence(ds,q.sourceCells.map(c=>c.index),layer);
  $('results-panel').hidden=false;
  $('results-h').textContent='Terrain values · select one to inspect';
  $('results').innerHTML=`<ul class="criterion-list">${Object.entries(combined.branches).map(([name,br])=>`<li class="criterion-row ${name}${q.node.startsWith(name)?' active':''}"><button class="criterion-link" data-criterion="${name}" aria-pressed="${q.node.startsWith(name)}">${pipeline.byId[name].title}<strong>${fmtValue(name,br.value)}</strong></button><p class="hint">${br.outcome==='unavailable'?'Unavailable':br.outcome==='exceeded'?'Exceeds':'Within'} ${fmtLimit(name,br.limit)} illustrative limit</p><span hidden data-branch="${name}" data-interpolated="${br.origin.counts.interpolated}" data-total="${br.sourceCellCount}"></span></li>`).join('')}</ul>`;
  $('step-support').hidden=true;
  $('map-secondary-title').textContent=`${q.title.replace(' criterion','')} · ${e.label.toLowerCase()}`;
  const footprint=q.node==='heights'?1:q.node.startsWith('slope')?3:5;
  $('map-layer').textContent=`${q.node==='heights'?'Delivered height':q.node.startsWith('slope')?'Slope uses eight neighbours; the centre is excluded.':'Roughness is height standard deviation, including terrain tilt.'} ${footprint}×${footprint} grid window · ${(footprint*metric.x).toFixed(1)} × ${(footprint*metric.y).toFixed(1)} m cell extent.`;
  $('selection-evidence').innerHTML=`<div class="subheading"><h3>${escapeHtml(e.label)} for ${escapeHtml(q.title.toLowerCase())}</h3><span class="support-badge">${e.total} source heights</span></div>${evidenceMarkup(q)}${e.type==='continuous'?'':`<ul class="evidence-counts">${e.entries.map(x=>`<li><i style="background:${x.colour}"></i>${escapeHtml(x.label)}${e.type==='quality'?` (code ${x.code})`:''} <strong>${x.count}/${e.total}</strong></li>`).join('')}</ul>`}`;
  $('origin-view-help').textContent=`${e.label}: ${e.note || ''}`;
  $('source-encoding').textContent=`${e.label} · original heights in m`;
  $('src-h').textContent=`Heights supporting ${q.title.toLowerCase()}`;
  $('source-context').textContent='Highlighted cells are the inputs to the selected quantity. Each retains the selected evidence layer.';
  const hc=centreHeight(), sources=new Set(q.sourceCells.map(c=>c.index)), s=56, radius=2;
  let cells='';
  for(let r=hc.row-radius;r<=hc.row+radius;r++)for(let c=hc.col-radius;c<=hc.col+radius;c++){
    const k=r*ds.W+c,x=(c-hc.col+radius)*s,y=(r-hc.row+radius)*s,used=sources.has(k),entry=inputEvidence(ds,k,layer),height=ds.heights[k];
    const short=layer==='height-error'?(entry.value===null?'No estimate':entry.label):layer==='origins'?(entry.code==='undocumented'?'History unknown':entry.code):`Code ${entry.code}`;
    cells+=`<g data-r="${r}" data-c="${c}"${used?' data-source="true"':''}${used&&layer==='quality'?` data-quality-code="${entry.code}"${entry.flagged?' data-suspicious-input="true"':''}`:''}><rect x="${x+1}" y="${y+1}" width="54" height="54" rx="4" fill="${used?'#fff':'#f1f3f3'}" stroke="${used?'#6c8c91':'#e1e7e6'}"/><rect x="${x+5}" y="${y+5}" width="46" height="5" fill="${used?entry.colour:'#e1e7e6'}"/><text x="${x+28}" y="${y+29}" text-anchor="middle" font-size="8.8" fill="#203239">${Number.isFinite(height)?height.toFixed(2):'Missing'}</text><text x="${x+28}" y="${y+44}" text-anchor="middle" font-size="6.7" fill="#53686e">${used?escapeHtml(short):'Context'}</text><title>Height (${r}, ${c}): ${height} m; ${used?entry.label:(q.node==='slope'&&r===hc.row&&c===hc.col?'centre not used by Horn slope':'not an input')}</title></g>`;
  }
  cells+=`<rect data-selected-centre="true" data-height-r="${hc.row}" data-height-c="${hc.col}" x="113" y="113" width="54" height="54" rx="4" fill="none" stroke="#203239" stroke-width="2"/>`;
  $('sources').setAttribute('viewBox','0 0 280 280');$('sources').setAttribute('style','max-width:280px;max-height:280px');
  $('sources').setAttribute('aria-label',`${q.title}: ${e.total} source heights; ${e.label}. ${e.summary}`);$('sources').innerHTML=cells;
  $('source-map-frame').setAttribute('style','');
  $('source-legend').innerHTML=`<details class="input-records"><summary>Read ${e.total} input records</summary><table><thead><tr><th>Cell</th><th>Height (m)</th><th>${escapeHtml(e.label)}</th></tr></thead><tbody>${q.sourceCells.map(c=>`<tr><td>${c.row}, ${c.col}</td><td>${c.height===null?'Missing':c.height.toFixed(3)}</td><td>${escapeHtml(inputEvidence(ds,c.index,layer).label)}</td></tr>`).join('')}</tbody></table></details>`;
  $('selection-summary').innerHTML=`<div class="compact-result"><h2 id="selected-title">${state.node==='combined'?'Configured criteria':q.title}</h2><p class="selected-value">${state.node==='combined'?overview(combined.outcomes).title:fmtValue(q.kind==='criterion'?pipeline.byId[q.node].inputs[0]:q.node,q.value)}</p></div><p class="hint">${state.node==='combined'?`Inspecting ${q.title.toLowerCase()}: `:''}${q.method}. ${q.node.startsWith('roughness')?'Height spread includes tilt; it is not a direct obstacle measure.':''}</p><p class="hint">${escapeHtml(q.production.method)} · ${escapeHtml(q.production.cellHistory)}</p>`;
  if(e.type==='continuous'&&!$('source-map-legend').innerHTML.includes('Diagonal mark:'))$('source-map-legend').innerHTML+='<span class="item">Diagonal mark: some input error estimates missing. Input σ is not derived-result uncertainty.</span>';
  renderComparison();
}
function renderComparison() {
  const hasPin=pinnedLocation?.dataset===state.dataset;
  $('clear-comparison').hidden=!hasPin;$('swap-locations').hidden=!hasPin;
  $('pin-location').textContent=hasPin?'Replace pinned location A':'Pin location A for comparison';
  if(!hasPin){$('comparison-content').innerHTML='<p class="comparison-empty">Pin a location, then select another on either map. Compare their terrain values and supporting evidence under the same settings.</p>';return;}
  const a=pinnedLocation.cell,b=state.cell,qa=inspectionQuery(a),qb=inspectionQuery(b),same=a.row===b.row&&a.col===b.col;
  const ea=summariseEvidence(ev.dataset,qa.sourceCells.map(c=>c.index),evidenceLayerId()),eb=summariseEvidence(ev.dataset,qb.sourceCells.map(c=>c.index),evidenceLayerId());
  const metric=spacing(ev.dataset), distance=Math.hypot((a.col-b.col)*metric.x,(a.row-b.row)*metric.y);
  const rows=['slope','roughness'].map(node=>{const x=query(ev,node,a),y=query(ev,node,b),limit=ev.limits[node==='slope'?'slopeDeg':'roughness_m'];return `<tr><th>${pipeline.byId[node].title}<small>${fmtLimit(node,limit)} illustrative limit</small></th><td>${fmtValue(node,x.value)}<small>${x.value===null?'Unavailable':x.value>limit?'Exceeds limit':'Within limit'}</small></td><td>${fmtValue(node,y.value)}<small>${y.value===null?'Unavailable':y.value>limit?'Exceeds limit':'Within limit'}</small></td></tr>`;}).join('');
  $('comparison-content').innerHTML=`<p class="hint">${same?'Select another location to compare with A.':`${distance.toFixed(1)} m between selected grid locations.`} Both locations use the same dataset, calculations and current limits. Neither outcome establishes safe passage.</p><table class="comparison-table"><thead><tr><th>Quantity / evidence</th><th>A · pinned (${a.row+MARGIN}, ${a.col+MARGIN})</th><th>B · selected (${b.row+MARGIN}, ${b.col+MARGIN})</th></tr></thead><tbody>${rows}<tr><th>${escapeHtml(ea.label)}<small>Supporting ${escapeHtml(qa.title.toLowerCase())}</small></th><td>${evidenceMarkup(qa)}</td><td>${evidenceMarkup(qb)}</td></tr>${ea.type==='continuous'?'':Array.from(new Set([...ea.entries,...eb.entries].map(e=>e.code))).map(code=>{const x=ea.entries.find(e=>e.code===code),y=eb.entries.find(e=>e.code===code);return `<tr class="evidence-row"><th>${escapeHtml((x||y).label)}${ea.type==='quality'?` (code ${code})`:''}</th><td>${x?.count||0}/${ea.total}</td><td>${y?.count||0}/${eb.total}</td></tr>`;}).join('')}<tr><th>Source history</th><td colspan="2">${escapeHtml(ev.dataset.originDeclaration?.explanation||'History stops at the delivered source records.')}</td></tr></tbody></table>`;
}

function renderDetails(q = currentQuery()) {
  const el = $('inspect');
  const where = q.kind === 'source' ? `height cell ${cellName(q.cell)}` : `analysis cell ${cellName(q.cell)} (centre height ${cellName(q.centreHeightCell)})`;
  let main = '';
  if (q.kind === 'combination') {
    main = `<dl class="props">
      <dt>Outcome</dt><dd><b>${CATEGORY_TEXT[q.category]}</b></dd>
      ${Object.entries(q.branches).map(([name,br])=>`<dt>${pipeline.byId[br.criterionNode].title}</dt><dd>${name==='illumination'?(br.outcome==='not-exceeded'?'Minimum met':br.outcome==='exceeded'?'Below minimum':'Unavailable'):OUTCOME_TEXT[br.outcome]} · ${fmtValue(name,br.value)} against ${fmtLimit(name,br.limit)}</dd>`).join('')}
      <dt>Method</dt><dd>${q.method}</dd>
      <dt>Calculation</dt><dd>${q.calculation}</dd>
      <dt>Origin rule</dt><dd>${q.origin.rule}</dd>
    </dl>`;
  } else {
    const value = q.kind === 'criterion' ? `${fmtValue(pipeline.byId[q.node].inputs[0], q.value)} against limit ${fmtLimit(pipeline.byId[q.node].inputs[0], q.limit)}` : q.kind === 'source' ? (q.available ? `${q.value.toFixed(3)} m` : 'absent') : fmtValue(q.node, q.value);
    main = `<dl class="props">
      <dt>Value</dt><dd>${value}${q.reason ? ` <span class="muted">(${q.reason})</span>` : ''}</dd>
      ${q.kind === 'criterion' ? `<dt>Outcome</dt><dd><b>${OUTCOME_TEXT[q.outcome]}</b></dd>` : ''}
      <dt>Quantity</dt><dd>${q.quantity}${q.unit ? ` (${q.unit})` : ''}</dd>
      <dt>Method</dt><dd>${q.method}</dd>
      <dt>Calculation</dt><dd>${q.calculation}</dd>
      <dt>Parameters</dt><dd>${params(q.parameters)}</dd>
      <dt>Production history</dt><dd>${q.quality ? `${qt().production}; ${qt().cellHistory}` : chip(q.kind === 'source' ? q.origin.declared : q.origin.headline,productionText(q))}</dd>
      <dt>Origin rule</dt><dd>${q.origin.rule}</dd>
      ${q.immediateInputs.length ? `<dt>Immediate inputs</dt><dd>${q.immediateInputs.map(i => `${i.cells.length} ${pipeline.byId[i.node].title.toLowerCase()} cell${i.cells.length > 1 ? 's' : ''}`).join(', ')}</dd>` : ''}
    </dl>`;
  }
  const counts = Object.entries(q.origin.counts || {}).filter(([, n]) => n).map(([o, n]) => `${n} ${HEIGHT_ORIGIN_NAME[o].toLowerCase()}`).join(', ');
  el.innerHTML = `<div class="explanation"><span class="small-label">${q.title} · ${where}</span><h3>${productionText(q)}</h3><p>${supportExplanation(q)}</p></div>
    <div class="inspect-grid"><div><h3>Value and method</h3>${main}</div>
    <div><h2>Declared source cells</h2><p>${q.sourceCells.length} height${q.sourceCells.length > 1 ? 's' : ''}: ${counts || HEIGHT_ORIGIN_NAME[q.origin.declared].toLowerCase()}${q.kind === 'combination' ? `; ${q.sharedSourceCellCount} shared between branches, counted once` : ''}.</p>
      <p class="muted">${q.declaredNote}</p>
      <h2>Retained processing paths</h2>${pathList(q)}
      <h2 style="margin-top:8px">Trace boundaries</h2>${boundaries(q)}</div></div>
    ${ev.dataset.acquisition ? `<h2>Observation and filling records</h2><p>Acquisition Sun elevation ${ev.dataset.acquisition.sunElevation_deg}° (separate from the illumination-analysis schedule). Shadow means an image patch was too dark to match. Origins describe the delivered heights after filling.</p><table class="acquisition-table"><thead><tr><th>Height cell</th><th>Stereo observation</th><th>Delivered origin</th></tr></thead><tbody>${q.sourceCells.map(c=>`<tr><td>(${c.row}, ${c.col})</td><td>${c.acquisition.reason}</td><td>${HEIGHT_ORIGIN_NAME[c.origin]}${c.origin === 'absent' ? c.acquisition.inCoverage ? ' · beyond filling limit' : ' · outside coverage' : ''}</td></tr>`).join('')}</tbody></table><p>${ev.dataset.acquisition.fillMethod}. The source-to-result paths above begin at the delivered grid.</p>` : ''}
    ${q.quality && isEdm() ? `<h2>Copernicus DEM editing &amp; filling record</h2><p><a href="${q.source.url}" target="_blank" rel="noopener">${q.source.product}</a> · ${q.source.version} · geocell ${q.source.geocell}. ${q.source.credit}</p><p>Native 1″ posting: ${q.source.res_m_ns} m north–south × ${q.source.res_m_ew} m east–west at this latitude; no resampling applied. Fill sources in this crop: ${Object.entries(q.source.fillSourceCounts).map(([k,n])=>`${n}× ${k}`).join(', ')||'none'}. The Height Error Mask (per-pixel σ) is listed below where present and is void on every edited pixel (${q.source.hemSummary.count} cells carry it, ${q.source.hemSummary.min_m}–${q.source.hemSummary.max_m} m, mean ${q.source.hemSummary.mean_m} m). The Water Body Mask reports every cell as land. Assessment limits are illustrative.</p><table class="acquisition-table"><thead><tr><th>Height cell</th><th>Earlier history</th><th>Edit code</th><th>Edit status</th><th>Fill source</th><th>Height error (HEM)</th></tr></thead><tbody>${q.sourceCells.map(c=>{const flm=q.source.flmCodes[c.index];const hem=q.source.hem[c.index];return `<tr><td>(${c.row}, ${c.col})</td><td>${HEIGHT_ORIGIN_NAME[c.origin]}</td><td>${c.quality.code}</td><td>${c.quality.label}</td><td>${q.source.flmDefinitions[flm] || `Unmapped code ${flm}`} (code ${flm})</td><td>${hem!=null?hem+' m σ':'No estimate supplied'}</td></tr>`;}).join('')}</tbody></table><p>${q.source.policy}</p>` : q.quality ? `<h2>Published LROC stereo quality</h2><p><a href="${q.source.url}" target="_blank" rel="noopener">${q.source.product}</a> · ${q.source.version} · ${q.source.credit}. Native 4 m posts; product cell (${q.source.crop.row_start_zero_based+centreHeight().row}, ${q.source.crop.col_start_zero_based+centreHeight().col}).</p><p>Reported product precision: ${q.source.precision_m} m; LOLA RMS: ${q.source.lolaRms_m} m. These are product diagnostics, not per-cell uncertainties. Assessment limits are illustrative.</p><table class="acquisition-table"><thead><tr><th>Height cell</th><th>Origin declaration</th><th>Raw quality code</th><th>Published status</th></tr></thead><tbody>${q.sourceCells.map(c=>`<tr><td>(${c.row}, ${c.col})</td><td>Stereo DEM; cell filling history unavailable</td><td>${c.quality.code}</td><td>${c.quality.label}</td></tr>`).join('')}</tbody></table><p>${q.source.policy}</p>` : ''}
    ${q.illumination ? `<h2>Illumination time samples</h2><p>${q.illumination.period.label}. NASA/JPL Horizons · ${q.illumination.period.startUtc} to ${q.illumination.period.endUtc}. ${q.illumination.period.boundary}.</p><table class="acquisition-table"><thead><tr><th>Hour</th><th>Sun azimuth / elevation</th><th>Status</th><th>Suspicious inputs</th><th>Interpolated inputs</th></tr></thead><tbody>${q.illumination.samples.map(t=>`<tr><td>${t.utc||t.hour}</td><td>${t.azimuthDeg.toFixed(1)}° / ${t.elevationDeg.toFixed(1)}°</td><td>${t.status}</td><td>${t.suspicious===null?'Not supplied':t.suspicious}</td><td>${t.interpolated===null?'Not supplied':t.interpolated}</td></tr>`).join('')}</tbody></table>` : ''}
    <details><summary>Query record (JSON)</summary><pre>${escapeHtml(JSON.stringify(q, null, 1))}</pre></details>`;

}
const escapeHtml = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// A separate reference-surface preview. Its controls never call select() or evaluate().
let previewAssets = null;
const previewState = { dataset: 'lunar-low-sun', view: 'sampled', scale: '1' };
function renderTerrainPreview() {
  if (!previewAssets) return;
  const preview = previewAssets.previews.find(p => p.id === previewState.dataset);
  const ds = datasetById(preview.id), shadows = Boolean(ds.terrain);
  const sceneLabel = `Seed ${LUNAR_METADATA.settings.seed} · ${preview.extent_m} × ${preview.extent_m} m`; 
  if (!shadows && ['shadows','sampled'].includes(previewState.view)) previewState.view = 'comparison';
  if(preview.kind === 'published-dem') previewState.view='3d';
  $('preview-view').disabled = preview.kind === 'published-dem';
  $('preview-delivery').value = preview.id;
  $('preview-view').value = previewState.view;
  if(preview.fixedSun)previewState.scale='1';
  $('preview-scale').value = previewState.scale;
  $('preview-shadow-option').disabled = !shadows;
  $('preview-sampled-option').disabled = !shadows;
  $('preview-scale-control').hidden = preview.fixedSun || previewState.view === 'shadows';
  const image = $('preview-image');
  $('preview-status').textContent = 'Loading image…';
  $('preview-status').hidden = false;
  $('preview-retry').hidden = true;
  image.hidden = true;
  image.onload = () => { image.hidden = false; $('preview-status').hidden = true; };
  image.onerror = () => { $('preview-status').textContent = 'This preview image could not be loaded. Keep the preview folder beside the HTML and retry.'; $('preview-retry').hidden = false; };
  image.src = previewState.view === 'sampled' ? preview.sampled[previewState.scale] : previewState.view === 'comparison' ? preview.comparisons[previewState.scale] : previewState.view === '3d' ? preview.images[previewState.scale] : previewAssets.shadows[ds.id];
  image.alt = preview.kind === 'published-dem' ? (preview.id.startsWith('copernicus-') ? `Copernicus DEM delivered surface over ${datasetById(preview.id)?.source.place || 'the site'}, ${preview.extent_m} m square, vertical scale ×${previewState.scale}; orange marks edited cells, grey marks cells labelled not edited by the producer.` : 'Published LROC Nassau DEM surface; not an independent reference scene.') : previewState.view === 'sampled'
    ? `${preview.title}: full LunarBlock scene on the left and its sampled heightmap on the right. Shared orthographic viewpoint, metre-labelled axes and vertical scale ×${previewState.scale}.`
    : previewState.view === 'comparison'
    ? `${preview.title}: actual terrain (${preview.kind === 'simulated-reference' ? 'simulation' : 'controlled fixture'}) on the left and delivered heightmap on the right. Shared orthographic viewpoint, metre-labelled axes and vertical scale ×${previewState.scale}. ${preview.comparison.missingHeights} missing heights remain gaps.`
    : previewState.view === '3d'
    ? `${preview.title}: orthographic 3D reference surface, ${preview.extent_m} metres square, vertical scale ×${previewState.scale}. Metre-labelled east, north and height axes.`
    : `${preview.title}: simulated top-down acquisition surface with cast shadows, sunlight from the west.`;
  $('preview-caption').textContent = preview.fixedSun ? `Fixed Sun: ${ds.illuminationPeriod.fixedSun.utc} · JPL Horizons. Same DEM as the period calculation; local cast shadows only. No adjustable Sun position. The 24-hour result uses all archived hourly samples.` : preview.kind === 'published-dem' ? (preview.id.startsWith('copernicus-') ? (() => { const src = datasetById(preview.id)?.source || {}; return `ESA/EU Copernicus GLO-30 · geocell ${src.geocell} (${src.place}). Delivered elevation surface: grey is labelled not edited in the Edit Data Mask; orange is edited. These labels do not reconstruct the complete measurement history. Illustrative lighting, not independent ground truth.`; })() : 'NASA/GSFC/Arizona State University · NAC_DTM_NASSAU02 v1.9. Native 4 m posts; 200 × 200 m crop. Delivered DEM surface with illustrative lighting, not independent ground truth.') : previewState.view === 'sampled'
    ? `${sceneLabel}. Left: LunarBlock terrain, ordinary boulders and pebbles; spires excluded before sampling. Right: its ${preview.res} m heightmap from the original builder, before stereo observation. Same scene, seed and height datum; sampling smooths small features. Neutral illustrative lighting.`
    : previewState.view === 'comparison'
    ? preview.kind === 'simulated-reference'
      ? `${preview.title}. ${sceneLabel}. Left: LunarBlock terrain, ordinary boulders and pebbles; spires excluded before sampling. Right: delivered heights after stereo matching and gap filling. Both panels use the same scales and illustrative lighting. Missing heights stay absent.`
      : `${preview.title}. Left: the defined test surface. Right: this delivery's heights. These controlled examples assign origins without simulating reconstruction; finite values are identical. Choose LunarBlock to compare reconstructed heights.`
    : previewState.view === '3d' ? preview.caption
    : `${preview.title}. Same reference terrain and sun settings as acquisition; dark regions include cast shadows. This image is a top-down simulation, before height reconstruction.`;
}
async function showTerrainPreview() {
  const controls = ['preview-delivery','preview-view','preview-scale'];
  controls.forEach(id => { $(id).disabled = true; });
  $('preview-image').hidden = true;
  $('preview-caption').textContent = '';
  $('preview-status').textContent = 'Loading terrain preview…';
  $('preview-status').hidden = false;
  $('preview-retry').hidden = true;
  try {
    previewAssets = await loadPreviewAssets($('show-terrain-preview').dataset.assets);
    $('preview-delivery').innerHTML = previewAssets.previews.filter(p=>USE_CASES[p.id]).map(p=>`<option value="${p.id}">${p.title}</option>`).join('');
    controls.forEach(id => { $(id).disabled = false; });
    renderTerrainPreview();
  } catch {
    $('preview-status').textContent = 'The preview could not be loaded. Keep the preview folder beside the HTML and retry. The assessment remains available.';
    $('preview-retry').hidden = false;
  }
}
function openTerrainPreview() {
  previewState.dataset = (datasetById(state.dataset).acquisition || datasetById(state.dataset).quality) ? state.dataset : 'lunar-low-sun';
  previewState.view = 'sampled';
  previewState.scale = '1';
  if (!$('terrain-dialog').open) $('terrain-dialog').showModal();
  return showTerrainPreview();
}

// ---------------------------------------------------------------------------
// State, controls and URL
// ---------------------------------------------------------------------------
function select(patch) {
  const recompute = 'dataset' in patch || 'limits' in patch;
  if ('node' in patch && !('footprint' in patch)) state.footprint = 'node';
  if ('node' in patch || 'dataset' in patch) { state.trace = false; }
  if('dataset' in patch){state.recordedTime=-1;state.evidenceLayer=null;pinnedLocation=null;}
  if ('node' in patch && !('compare' in patch)) state.compare = false;
  Object.assign(state, patch);
  const ds=datasetById(state.dataset);
  if(recompute || !ev) pipeline=createDatasetPipeline(ds);
  if('dataset' in patch && !('node' in patch)) state.node=USE_CASES[ds.id]?'slope':ds.preferredNode||'combined';
  if(!pipeline.byId[state.node])state.node=USE_CASES[ds.id]?'slope':ds.preferredNode||'combined';
  if(state.footprint!=='node' && !pipeline.byId[state.footprint])state.footprint='node';
  delete state.sunSample;
  const n=ds.illuminationPeriod?.samples.length||0;
  if(!Number.isInteger(state.recordedTime)||state.recordedTime<0||state.recordedTime>=n)state.recordedTime=-1;
  state.sourceMap = ['slope','roughness'].includes(state.node);
  const bounds = analysisGrid(datasetById(state.dataset));
  state.cell = { row: Math.min(bounds.H-1, Math.max(0,state.cell.row)), col: Math.min(bounds.W-1, Math.max(0,state.cell.col)) };
  if (recompute || !ev) {
    ev = evaluate(datasetById(state.dataset), state.limits, pipeline);
    // The core no longer stores source heights or evidence summaries with each record. This older view reads
    // `rec.sources`, `rec.origin` and `rec.quality`, so it gets getters that walk the declarations back to the
    // heights on each read (core.declaredSourceIndices, core.qualityAt).
    for (const [id, recs] of Object.entries(ev.records)) recs.forEach((r, k) => {
      const sources = () => core.declaredSourceIndices(ev, id, k);
      Object.defineProperty(r, 'sources', { get: sources, configurable: true, enumerable: false });
      Object.defineProperty(r, 'origin', { get: () => core.summariseOrigins(sources(), i => ev.dataset.origins[i]), configurable: true, enumerable: false });
      if (ev.dataset.quality) Object.defineProperty(r, 'quality', { get: () => core.qualityAt(ev, id, k), configurable: true, enumerable: false });
    });
  }
  // Old input-view links retain the selected node/cell and open its values.
  if (!['assessment','origins','quality'].includes(state.mode) || (state.mode === 'quality' && !ev.dataset.quality)) state.mode = 'assessment';
  if (state.mode === 'origins' && ev.dataset.quality) state.mode = 'quality';
  render();
}

function render() {
  const op = pipeline.byId[state.node];
  state.compare = true;
  if(op.kind === 'combination' && !Object.hasOwn(op.branches,state.footprint)) state.footprint=Object.keys(op.branches)[0];
  if(op.kind === 'criterion') state.footprint='node';
  state.trace=['criterion','combination'].includes(op.kind);
  $('view-values-label').textContent = 'Values';
  $('mode-assessment').checked = state.mode === 'assessment';
  $('mode-origins').checked = state.mode === 'origins' || state.mode === 'quality';
  $('mode-quality').checked = false;
  $('mode-quality').disabled = true;
  $('quality-choice').hidden = true;
  $('provenance-note').textContent = ev.dataset.quality ? (isEdm() ? `Copernicus GLO-30: ~${ev.dataset.res} m posts (native 1″). Limits are illustrative. The Edit Data Mask is not an error estimate.` : 'LROC: 4 m posts; 12 m / 20 m input windows. Limits are illustrative. Quality flags are not error estimates.') : 'Support labels persist after thresholding. They describe provenance, not numerical error.';
  $('view-origins-label').textContent = 'Input evidence';
  $('origin-view-help').textContent = ev.dataset.quality ? (isEdm() ? 'Shows the Copernicus Edit Data Mask (editing status) per cell. Origins are shown separately in Input evidence; the mask is the product’s own declaration, not an error estimate.' : 'Shows published stereo quality flags. Production history is shown separately in Input evidence; quality does not establish filling history.') : op.kind === 'source'
    ? 'Shows the declared production history of each delivered height. Quality flags, if supplied, are kept separate.'
    : 'Shows the origins of the heights supporting each result. Uses interpolated heights does not mean the result itself was interpolated. Select a cell to inspect those heights.';
  $('dataset').value = state.dataset;
  $('illumination-limit-control').hidden = !ev.dataset.illuminationPeriod;
  $('illumination-limit').value = ev.limits.illuminationMinPercent;
  $('slope-limit').value = state.limits.slopeDeg; $('rough-limit').value = state.limits.roughness_m;
  renderEvidenceSwitcher();
  renderResults(); renderGraph(); renderMap(); renderSources(); renderInspect(); renderStepSupport();
  renderBasemap();
  renderSupervisor();
  terrainExperiment?.update({evaluation:ev,node:state.node,activeQuery:inspectionQuery(),cell:{...state.cell},pin:pinnedLocation,layer:evidenceLayerId(),evidenceLabel:evidenceLayersOf(ev.dataset).find(l=>l.id===evidenceLayerId())?.label || 'Source history',valueTitle:pipeline.byId[state.node].title,valueLegend:$('map-legend').innerHTML,evidenceLegend:$('source-map-legend').innerHTML});
  writeHash();
}

// An optional reference satellite image under the evidence map, aligned to the delivery's crop
// bounding box. It is geographic context only — not part of the delivery and not ground truth —
// so it is offered solely for deliveries that declare one, and the evidence colours stay on top.
let basemapApplied = '';   // last-applied image URL ('' = off); guards DOM writes on the 4356-cell map
function renderBasemap() {
  const bm = ev.dataset.source?.basemap, url = (state.basemap && bm && previewAssets?.basemaps?.[ev.dataset.id]) || '';
  $('basemap-toggle').hidden = !bm;
  $('basemap-check').checked = state.basemap && !!bm;
  // Only touch the evidence map's attributes when the overlay actually changes, so re-evaluating the
  // `[data-basemap] .cell` selector against every cell does not run on ordinary cell selections.
  if (basemapApplied !== url) {
    const img = $('branch-map-basemap');
    if (url) img.setAttribute('href', url);
    img.hidden = !url;
    $('branch-map').setAttribute('data-basemap', url ? 'true' : 'false');
    $('basemap-credit').hidden = !url;
    if (url) $('basemap-credit').textContent = `Reference imagery under the evidence map: ${bm.attribution}. Context only — not part of the delivery and not independent ground truth; aligned to the crop bounding box.`;
    basemapApplied = url;
  }
}

// The map's evidence-layer switcher is generated from whatever the delivery declares, so each
// delivery offers exactly the queryable layers its producer supplied — nothing is assumed.
function renderEvidenceSwitcher() {
  const layers = evidenceLayersOf(ev.dataset), current = evidenceLayerId();
  $('evidence-layer-controls').hidden = layers.length < 2;
  $('evidence-layer-options').innerHTML = layers.map(l =>
    `<label class="view-choice"><input class="sr-only" type="radio" name="evidence-layer" value="${l.id}"${l.id === current ? ' checked' : ''} aria-controls="map branch-map"><span>${l.label}</span></label>`).join('');
  const note = layers.find(l => l.id === current)?.note;
  $('evidence-layer-help').textContent = note || '';
}

function writeHash() {
  const h = `ds=${state.dataset}&node=${state.node}&mode=${state.mode}&layer=${evidenceLayerId()}&cell=${state.cell.row},${state.cell.col}&slope=${state.limits.slopeDeg}&rough=${state.limits.roughness_m}&fp=${state.footprint}${state.sourceMap ? '&evidence=1' : ''}${state.recordedTime>=0?'&at='+state.recordedTime:''}`;
  history.replaceState(null, '', `#${h}${pinnedLocation?'&pin='+pinnedLocation.cell.row+','+pinnedLocation.cell.col:''}`);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.compare = p.get('compare') === '1';
  state.sourceMap = p.get('evidence') === '1';
  state.trace = p.get('trace') === '1';
  state.recordedTime=p.has('at')?Number(p.get('at')):-1;
  if (p.get('ds') && datasetById(p.get('ds')) && !datasetById(p.get('ds')).illuminationPeriod) state.dataset = p.get('ds');
  if (p.get('node') && !p.get('node').startsWith('illumination') && pipeline.byId[p.get('node')]) state.node = p.get('node');
  if (['assessment', 'origins', 'quality', 'sources', 'terrain'].includes(p.get('mode'))) state.mode = p.get('mode');
  if (p.get('layer')) state.evidenceLayer = p.get('layer');
  if (['node', 'slope', 'roughness'].includes(p.get('fp'))) state.footprint = p.get('fp');
  const cell = (p.get('cell') || '').split(',').map(Number), grid = analysisGrid(datasetById(state.dataset));
  if (cell.length === 2 && cell.every(n => Number.isInteger(n) && n >= 0) && cell[0] < grid.H && cell[1] < grid.W) state.cell = { row: cell[0], col: cell[1] };
  const sl = parseFloat(p.get('slope')), rl = parseFloat(p.get('rough'));
  if (Number.isFinite(sl)&&sl>=0&&sl<=90) state.limits.slopeDeg = sl;
  if (Number.isFinite(rl)&&rl>=0) state.limits.roughness_m = rl;
  const pin=(p.get('pin')||'').split(',').map(Number);if(pin.length===2&&pin.every(Number.isInteger)&&pin[0]>=0&&pin[0]<grid.H&&pin[1]>=0&&pin[1]<grid.W)pinnedLocation={dataset:state.dataset,cell:{row:pin[0],col:pin[1]}};
  const sunmin=Number(p.get('sunmin')); if(p.has('sunmin')&&Number.isFinite(sunmin)&&sunmin>=0&&sunmin<=100)state.limits.illuminationMinPercent=sunmin;
}

function init() {
  $('quantity-controls').addEventListener('click',e=>{const b=e.target.closest('[data-view-node]');if(b){const node=b.dataset.viewNode;select({node});$('quantity-controls').querySelector(`[data-view-node="${node}"]`).focus({preventScroll:true});}});
  $('pin-location').addEventListener('click',()=>{pinnedLocation={dataset:state.dataset,cell:{...state.cell}};render();});
  $('clear-comparison').addEventListener('click',()=>{pinnedLocation=null;render();});
  $('swap-locations').addEventListener('click',()=>{if(!pinnedLocation)return;const cell={...pinnedLocation.cell};pinnedLocation.cell={...state.cell};select({cell});});

  $('show-source-map').addEventListener('click', () => select({sourceMap:!state.sourceMap,compare:false}));
  $('results').addEventListener('click', e => {
    const button = e.target.closest('[data-criterion]');
    if (!button) return;
    select(USE_CASES[state.dataset]&&state.node!=='combined'?{node:button.dataset.criterion}:{footprint:button.dataset.criterion,trace:true});
    $('results').querySelector(`[data-criterion="${button.dataset.criterion}"]`).focus({preventScroll:true});
  });
  $('illumination-panel').addEventListener('change',e=>{if(e.target.id!=='recorded-time')return;const value=Number(e.target.value);select({recordedTime:value,...(value>=0&&['criterion','combination'].includes(pipeline.byId[state.node].kind)?{trace:true}:{})});$('recorded-time').focus({preventScroll:true});});
  $('dataset').innerHTML = Object.entries(USE_CASES).map(([id,c]) => `<option value="${id}">${c.title}</option>`).join('');
  $('dataset').addEventListener('change', e => { const ds=datasetById(e.target.value); select({dataset:ds.id,cell:{...(USE_CASES[ds.id]?.cell||ds.preferredCell||{row:0,col:0})}}); });
  for (const mode of ['assessment', 'origins', 'quality']) {
    $(`mode-${mode}`).addEventListener('change', e => {
      if (e.target.checked) select({mode:mode === 'origins' && ev.dataset.quality ? 'quality' : mode});
    });
  }
  $('evidence-layer-controls').addEventListener('change', e => {
    if (e.target.name === 'evidence-layer' && e.target.checked) {const value=e.target.value;select({evidenceLayer:value});$('evidence-layer-options').querySelector(`input[value="${value}"]`).focus({preventScroll:true});}
  });
  $('basemap-check').addEventListener('change', async e => {
    state.basemap = e.target.checked;
    if (state.basemap && !previewAssets?.basemaps) { try { previewAssets = await loadPreviewAssets($('show-terrain-preview').dataset.assets); } catch { state.basemap = false; $('basemap-credit').textContent = 'Reference imagery could not be loaded; keep the preview folder beside the HTML.'; $('basemap-credit').hidden = false; } }
    renderBasemap();
  });
  const limit = (key, el) => el.addEventListener('input', () => { const v = parseFloat(el.value); if (Number.isFinite(v) && v >= 0 && (key!=='slopeDeg'||v<=90) && (key!=='illuminationMinPercent'||v<=100)) select({ limits: { ...state.limits, [key]: v } }); });
  limit('illuminationMinPercent', $('illumination-limit'));
  limit('slopeDeg', $('slope-limit')); limit('roughness_m', $('rough-limit'));
  for (const footprint of ['node','slope','roughness']) {
    $('footprint-' + footprint).addEventListener('change', e => {
      if (e.target.checked) select({footprint});
    });
  }
  for (const mapId of ['map','branch-map']) {
    $(mapId).addEventListener('click', e => {
      const cell=e.target.closest('.cell');
      if (cell?.dataset.ok === 'true') {
        $(mapId).focus({preventScroll:true});
        select({cell:{row:+cell.dataset.r,col:+cell.dataset.c}});
      }
    });
    $(mapId).addEventListener('keydown', e => {
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const A = analysisGrid(ev.dataset), row = Math.min(A.H - 1, Math.max(0, state.cell.row + d[0])), col = Math.min(A.W - 1, Math.max(0, state.cell.col + d[1]));
      select({ cell: { row, col } });
    });
  }

  $('show-details').addEventListener('click', () => { renderDetails(); $('details-dialog').showModal(); });
  $('show-terrain-preview').addEventListener('click', openTerrainPreview);
  $('preview-retry').addEventListener('click', showTerrainPreview);
  $('preview-delivery').addEventListener('change', e => {
    if (previewAssets?.previews.some(p=>p.id===e.target.value)) { previewState.dataset=e.target.value; renderTerrainPreview(); }
  });
  $('preview-view').addEventListener('change', e => {
    if (['sampled','comparison','3d','shadows'].includes(e.target.value)) { previewState.view=e.target.value; renderTerrainPreview(); }
  });
  $('preview-scale').addEventListener('change', e => {
    if (['1','3'].includes(e.target.value)) { previewState.scale=e.target.value; renderTerrainPreview(); }
  });
  readHash();
  if(typeof window.addEventListener==='function')terrainExperiment=createTerrainExperiment(cell=>select({cell}));
  select({});
}

// The documented JavaScript interface: the core, the fixtures and the presentation's current state.
window.hallmark = {
  ...core, datasets: DATASETS, bookmarks: BOOKMARKS,
  current: () => ({ evaluation: ev, selection: { node: state.node, cell: { ...state.cell }, mode: state.mode, compare: state.compare, sourceMap: state.sourceMap, trace: state.trace, footprint: state.footprint, recordedTime:state.recordedTime }, limits: { ...state.limits } }),
  // With no arguments: the record the inspection panel shows. Cells are on the node's own grid.
  inspect: (node, cell) => (node ? query(ev, node, cell ?? (node === 'heights' ? centreHeight() : state.cell)) : currentQuery()),
  select: (patch) => select(patch),
};
init();
