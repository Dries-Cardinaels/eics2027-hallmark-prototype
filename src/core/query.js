// Queries: the record an interface (or any other consumer) receives for one node at one cell.
// Everything the browser presentation displays is read from these records.
import { MARGIN, analysisGrid } from './operations.js';
import { summariseOrigins } from './origins.js';
import { qualityLabel, summariseQuality } from './quality.js';
import {nativeHeightEvidence,summariseHeightRMS,summariseLolaReturns} from './height-evidence.js';

export const DECLARED_NOTE = 'The footprint holds the cells that the operation declares it reads; not every cell in a footprint necessarily changes the numerical result.';
export const SOURCE_BOUNDARY = 'Delivered heights are the earliest retained record; acquisition and earlier processing are not reconstructed.';

const gridOf = (ev, op) => (op.grid === 'heights' ? { W: ev.dataset.W, H: ev.dataset.H } : analysisGrid(ev.dataset));
const toIndex = (grid, cell) => (typeof cell === 'number' ? cell : cell.row * grid.W + cell.col);
const position = (grid, i) => ({ row: Math.floor(i / grid.W), col: i % grid.W });

// Every chain of nodes from a source to `nodeId`, source first.
export function graphPaths(pipeline, nodeId) {
  const op = pipeline.byId[nodeId];
  if (!op.inputs.length) return [[nodeId]];
  return op.inputs.flatMap(input => graphPaths(pipeline, input).map(p => [...p, nodeId]));
}

// The branch a path belongs to: the first derived node after the source ("slope", "roughness").
const branchOf = (path) => path[1] ?? null;

// Cells reached at each node along one path, following the declared footprints backwards.
function cellPath(ev, path, cell) {
  const steps = [{ node: path[path.length - 1], cells: [cell] }];
  for (let j = path.length - 1; j > 0; j--) {
    const op = ev.pipeline.byId[path[j]], input = path[j - 1], next = new Set();
    for (const c of steps[0].cells) op.footprint(c, ev.dataset)[input].forEach(i => next.add(i));
    steps.unshift({ node: input, cells: [...next].sort((a, b) => a - b) });
  }
  return steps;
}

// Summary of the supplied quality codes behind one result, computed on demand by walking the declarations
// back to the heights. Nothing is stored with the record. Needs only ev.pipeline and ev.dataset.
export function qualityAt(ev, nodeId, cell) {
  return ev.dataset.quality ? summariseQuality(declaredSourceIndices(ev, nodeId, cell), ev.dataset.quality) : null;
}

// Shared declared-support traversal for route evidence and individual queries.
export function declaredSourceIndices(ev,nodeId,cell) {
  return [...new Set(graphPaths(ev.pipeline,nodeId).flatMap(path=>cellPath(ev,path,cell)[0].cells))].sort((a,b)=>a-b);
}

export function query(ev, nodeId, cellRef) {
  const { pipeline, dataset: ds, records } = ev, op = pipeline.byId[nodeId];
  if (!op) throw new Error(`Unknown node ${nodeId}`);
  const grid = gridOf(ev, op), cell = toIndex(grid, cellRef);
  if (!Number.isInteger(cell) || cell < 0 || cell >= grid.W * grid.H || (typeof cellRef !== 'number' && (!Number.isInteger(cellRef.row) || !Number.isInteger(cellRef.col) || cellRef.row < 0 || cellRef.col < 0 || cellRef.row >= grid.H || cellRef.col >= grid.W))) return { node: nodeId, outside: true };
  const rec = records[nodeId][cell], heightsGrid = { W: ds.W, H: ds.H };
  const originOf = (i) => ds.origins[i];

  const paths = graphPaths(pipeline, nodeId).map(path => {
    const steps = cellPath(ev, path, cell);
    return {
      branch: branchOf(path), nodes: path,
      steps: steps.map(s => ({ node: s.node, cells: s.cells.map(i => position(gridOf(ev, pipeline.byId[s.node]), i)) })),
      sourceCells: steps[0].cells,
    };
  });

  // Deduplicated source heights, each listing every branch that reaches it.
  const viaBranch = new Map();
  for (const p of paths) for (const i of p.sourceCells) {
    if (!viaBranch.has(i)) viaBranch.set(i, new Set());
    if (p.branch) viaBranch.get(i).add(p.branch);
  }
  const sourceCells = [...viaBranch.keys()].sort((a, b) => a - b).map(i => ({
    index: i, ...position(heightsGrid, i), height: Number.isFinite(ds.heights[i]) ? ds.heights[i] : null,
    ...(ds.groundCounts ? {groundCount: ds.groundCounts[i]} : {}),
    ...(ds.dsmSampleCounts ? {dsmSampleCount:ds.dsmSampleCounts[i]} : {}),
    ...nativeHeightEvidence(ds,i),
    ...(ds.quality ? {quality:{code:ds.quality.codes[i],label:qualityLabel(ds.quality.codes[i],ds.quality)}} : {}),
    ...(ds.matchtags ? {stereoMatch:{code:ds.matchtags[i],label:ds.matchtags[i]===1?'Stereo matched':'Interpolated'}} : {}),
    origin: originOf(i), branches: [...viaBranch.get(i)],
    ...(ds.acquisition ? { acquisition: {
      reason: ds.acquisition.reasonText[ds.acquisition.reasons[i]],
      reasonCode: ds.acquisition.reasons[i],
      inCoverage: Boolean(ds.acquisition.inOverlap[i]),
      fillDistance_m: ds.acquisition.fillDistance_m[i],
      maxFillDistance_m: ds.acquisition.fillPolicy.maxDistance_m,
      method: originOf(i) === 'observed' ? 'stereo image matching' : originOf(i) === 'interpolated' ? ds.acquisition.fillMethod : 'no delivered height',
      filled: originOf(i) === 'interpolated',
    } } : {}),
  }));

  const immediateInputs = op.inputs.length
    ? Object.entries(op.footprint(cell, ds)).map(([input, cells]) => ({ node: input, cells: cells.map(i => position(gridOf(ev, pipeline.byId[input]), i)) }))
    : [];

  const out = {
    node: nodeId, title: op.title, kind: op.kind, dataset: ds.id,
    cell: { grid: op.grid, index: cell, ...position(grid, cell) },
    ...(op.grid === 'analysis' ? { centreHeightCell: { row: position(grid, cell).row + MARGIN, col: position(grid, cell).col + MARGIN } } : {}),
    quantity: op.quantity, unit: op.unit,
    ...(rec.illumination ? {illumination:rec.illumination} : op.id==='illumination-criterion' ? {illumination:records.illumination[cell].illumination} : {}),
    available: rec.available, value: rec.value ?? null,
    ...(rec.outcome ? { outcome: rec.outcome, limit: rec.limit } : {}),
    ...(rec.category ? { category: rec.category, outcomes: rec.outcomes } : {}),
    ...(rec.reason ? { reason: rec.reason } : {}),
    method: op.method, calculation: op.calculation, parameters: op.parameters(ds, ev.limits),
    origin: { ...summariseOrigins(sourceCells.map(c => c.index), originOf), rule: op.originRule.text, ...(op.kind === 'source' ? { declared: originOf(cell) } : {}) },
    ...(ds.quality ? {quality:summariseQuality(sourceCells.map(c => c.index), ds.quality)} : {}),
    ...(ds.originDeclaration ? {originDeclaration:ds.originDeclaration} : {}),
    ...(ds.source ? {source:ds.source} : {}),
    production: ds.production || (ds.quality ? {method:ds.quality.terms?.production ?? 'LROC stereo reconstruction',scope:'delivery',cellHistory:ds.quality.terms?.cellHistory ?? 'Individual filling history unavailable'}
      : {method:ds.acquisition ? 'Simulated stereo reconstruction and gap filling' : 'Controlled height delivery',scope:'declared source heights',cellHistory:'Declared per input',counts:summariseOrigins(sourceCells.map(c=>c.index),originOf).counts}),
    immediateInputs,
    paths: paths.map(({ sourceCells: _, ...p }) => p),
    sourceCells,
    ...(ds.heightRMS ? {inputHeightRMS:summariseHeightRMS(sourceCells.map(c=>c.index),ds)} : {}),
    ...(ds.lolaCounts ? {inputLolaReturns:summariseLolaReturns(sourceCells.map(c=>c.index),ds)} : {}),
    declaredNote: DECLARED_NOTE,
    boundaries: {
      source: ds.originDeclaration ? ds.originDeclaration.explanation : ds.acquisition ? 'Delivered heights retain simulated stereo-match and gap-fill records. The graph traces delivered-height support; individual interpolation donors are not expanded.' : SOURCE_BOUNDARY,
      undocumented: sourceCells.filter(c => c.origin === 'undocumented').map(({ row, col, branches }) => ({ row, col, branches })),
      missing: sourceCells.filter(c => c.origin === 'absent').map(({ row, col, branches }) => ({ row, col, branches })),
    },
  };
  if (op.kind === 'combination') {
    out.branches = branchDetails(ev, op, cell, paths);
    out.origin.text = combinedOriginText(out.branches, out.origin);
    out.sharedSourceCellCount = sourceCells.filter(c => c.branches.length > 1).length;
  }
  if (ds.originDeclaration?.status === 'not-supplied') {
    out.origin.text = 'Cell origin not supplied';
    out.origin.rule = ds.originDeclaration.explanation;
  }
  return out;
}

function branchDetails(ev, op, cell, paths) {
  const out = {};
  for (const [branch, criterionId] of Object.entries(op.branches)) {
    const crit = ev.records[criterionId][cell], valueNode = ev.pipeline.byId[criterionId].inputs[0];
    const value = ev.records[valueNode][cell], sources = paths.find(p => p.branch === branch).sourceCells;
    out[branch] = {
      ...(value.illumination ? {illumination:value.illumination} : {}),
      valueNode, criterionNode: criterionId, unit: ev.pipeline.byId[valueNode].unit,
      value: value.available ? value.value : null, limit: ev.limits[ev.pipeline.byId[criterionId].limitKey],
      outcome: crit.available ? crit.outcome : 'unavailable',
      ...(ev.dataset.quality ? {quality:summariseQuality(sources, ev.dataset.quality)} : {}),
      origin: summariseOrigins(sources, i => ev.dataset.origins[i]), sourceCellCount: sources.length,
    };
  }
  return out;
}

// "Includes interpolation through the height spread branch": names the branches that bring in each
// non-observed state, so the overall summary never relabels a branch that does not include it.
export function combinedOriginText(branches, origin) {
  const names = Object.keys(branches), phrases = [];
  // Display names (D3): the `roughness` branch is shown as height spread.
  const display = (b) => BRANCH_TEXT[b] ?? b;
  const list = (raw) => { const bs = raw.map(display); return bs.length > 1 ? `the ${bs.slice(0, -1).join(', ')} and ${bs[bs.length - 1]} branches` : `the ${bs[0]} branch`; };
  const states = [['interpolated', 'interpolation through'], ['undocumented', 'undocumented history through'], ['absent', 'an absent height in']];
  for (const [state, phrase] of states) {
    const bs = names.filter(n => branches[n].origin.counts[state] > 0);
    if (bs.length) phrases.push(`${phrase} ${list(bs)}`);
  }
  return phrases.length ? `Includes ${phrases.join('; ')}` : origin.text;
}

const BRANCH_TEXT = { roughness: 'height spread' };

// Plain-language name of a combined category.
export const CATEGORY_TEXT = {
  neither: 'All criteria met',
  unmet: 'One or more criteria unmet',
  slope: 'Slope limit exceeded',
  roughness: 'Height spread limit exceeded',
  both: 'Slope and height spread limits exceeded',
  incomplete: 'Incomplete assessment',
};
export const OUTCOME_TEXT = { exceeded: 'Exceeded', 'not-exceeded': 'Not exceeded', unavailable: 'Unavailable' };
