import {nativeSampleCounts} from './sample-counts.js';
// Runs the declared operations over a dataset and keeps, for every output cell, its value or
// outcome and its availability. Records hold no source heights or evidence: a query finds the source
// heights of a result by walking the declared footprints back (query.js), when it is asked.
import { OPERATIONS, analysisGrid, illumination } from './operations.js';
import { ORIGIN } from './origins.js';

const illuminationCache = new WeakMap();

export const DEFAULT_LIMITS = Object.freeze({ slopeDeg: 15, roughness_m: 0.15, illuminationMinPercent: 50 });

export function createPipeline(operations = OPERATIONS) {
  const byId = Object.fromEntries(operations.map(op => [op.id, op]));
  const order = [], seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    if (!byId[id]) throw new Error(`Undeclared input ${id}`);
    seen.add(id);
    byId[id].inputs.forEach(visit);
    order.push(byId[id]);
  };
  operations.forEach(op => visit(op.id));
  const edges = operations.flatMap(op => op.inputs.map(from => ({ from, to: op.id })));
  return { operations: order, byId, edges };
}

// Illumination belongs only to explicitly configured examples. Existing deliveries keep
// their original two-criterion graph and never evaluate an implicit Sun schedule.
export function createDatasetPipeline(dataset) {
  if (dataset.illuminationPeriod) return createPipeline();
  const base = OPERATIONS.find(op=>op.id==='combined');
  const branches={slope:'slope-criterion',roughness:'roughness-criterion'};
  const combination={...base,inputs:Object.values(branches),branches,
    method:'combine slope and height spread criterion outcomes',
    footprint:cell=>Object.fromEntries(Object.values(branches).map(id=>[id,[cell]]))};
  const operations = OPERATIONS.filter(op => !op.id.startsWith('illumination')).map(op => {
    if (op.id === 'combined') return combination;
    if (op.kind === 'source' && dataset.groundCounts) return {
      ...op,
      method: 'Median of ground lidar returns',
      calculation: 'Hallmark takes the median elevation of the ground returns in each 1 m square. A square with zero returns has no height.',
    };
    if (op.kind === 'source' && dataset.dsmSampleCounts) return {
      ...op, method:'Median of valid 10 cm DSM pixels',
      calculation:'Use the median of valid 3 July DSM pixels with centres in this 1 m square. Zero valid pixels leaves a missing height.',
    };
    if (op.kind === 'source' && dataset.caseId==='blatten' && dataset.production?.method) return {
      ...op,
      method: dataset.production.method,
      calculation: `${dataset.production.scope||'Native source heights retained for inspection'}. The graph begins at the delivered height grid; per-cell reconstruction ancestry is not supplied.`,
    };
    return op;
  });
  return createPipeline(operations);
}

// dataset: { id, W, H, res, heights: number[] (NaN = absent), origins: string[] }.
export function evaluate(dataset, limits = DEFAULT_LIMITS, pipeline = createDatasetPipeline(dataset)) {
  validateDataset(dataset);
  limits = {...DEFAULT_LIMITS,...limits};
  const records = {};
  const terrainSignature=JSON.stringify([dataset.W,dataset.H,dataset.res,dataset.heights,dataset.origins,dataset.quality,dataset.originDeclaration?.status,dataset.illuminationPeriod]);
  for (const op of pipeline.operations) {
    const cached=op===illumination ? illuminationCache.get(dataset) : null;
    if(cached?.signature===terrainSignature){records[op.id]=cached.records;continue;}
    if (op.kind === 'source') {
      records[op.id] = dataset.heights.map((_, cell) => recordFor(dataset, op, cell, (id, i) => records[id][i], limits));
      continue;
    }
    const A = analysisGrid(dataset), out = new Array(A.W * A.H);
    for (let cell = 0; cell < out.length; cell++) out[cell] = recordFor(dataset, op, cell, (id, i) => records[id][i], limits);
    records[op.id] = out;
    if(op===illumination)illuminationCache.set(dataset,{signature:terrainSignature,records:out});
  }
  return { dataset, limits: { ...limits }, pipeline, records };
}

// Same operators and records as evaluate(), resolved only when the query reads a cell.
// Iterating a records array intentionally evaluates that array. Inspection does not iterate it.
export function evaluateLazy(dataset, limits = DEFAULT_LIMITS, pipeline = createDatasetPipeline(dataset)) {
  validateDataset(dataset);
  limits = { ...DEFAULT_LIMITS, ...limits };
  const records = {};
  for (const op of pipeline.operations) {
    const grid = op.kind === 'source' ? dataset : analysisGrid(dataset);
    const count = grid.W * grid.H, cache = new Map();
    records[op.id] = new Proxy(new Array(count), {
      get(target, key, receiver) {
        if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return Reflect.get(target, key, receiver);
        const cell = Number(key);
        if (cell >= count) return undefined;
        if (!cache.has(cell)) cache.set(cell, recordFor(dataset, op, cell, (id, i) => records[id][i], limits));
        return cache.get(cell);
      },
      has(target, key) {
        return typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < count || Reflect.has(target, key);
      },
    });
  }
  return { dataset, limits, pipeline, records };
}

export function recordFor(dataset, op, cell, recordAt, limits) {
  let rec;
  if (op.kind === 'source') {
    const value = dataset.heights[cell];
    const available = dataset.origins[cell] !== ORIGIN.ABSENT && Number.isFinite(value);
    rec = { available, value: available ? value : null, ...(available ? {} : { reason: 'height absent from the delivery' }) };
  } else {
    const footprint = op.footprint(cell, dataset), inputRecords = {}, inputValues = {}, missing = [];
    for (const [input, cells] of Object.entries(footprint)) {
      inputRecords[input] = cells.map(i => recordAt(input, i));
      inputValues[input] = inputRecords[input].map(r => r.value);
      inputRecords[input].forEach((r, j) => { if (!r.available) missing.push({ node: input, cell: cells[j] }); });
    }
    rec = { available: true };
    if (missing.length && !op.acceptsUnavailable) {
      Object.assign(rec, { available: false, value: null, ...(op.kind === 'criterion' ? { outcome: 'unavailable', limit: limits[op.limitKey] } : {}), reason: `${missing.length} footprint cell${missing.length > 1 ? 's' : ''} unavailable`, missing });
    } else {
      Object.assign(rec, op.compute(inputValues, dataset, limits, inputRecords, { cell, footprint }));
      if (op.kind === 'combination' && rec.category === 'incomplete') rec.reason = 'at least one criterion is unavailable';
    }
  }
  // Supplied evidence (quality codes, origins, height RMS, LOLA returns) stays on the heights. Its summary
  // for a result is computed only when a query walks the declarations back to the heights (query.js),
  // never stored with the record.
  return rec;
}

export function validateDataset(ds) {
  const N = ds.W * ds.H;
  if (ds.heights.length !== N || ds.origins.length !== N) throw new Error('Heights and origins must cover the grid');
  const counts=nativeSampleCounts(ds);
  if (counts && counts.length !== N) throw new Error('Sample counts must cover the height grid');
  if (ds.quality && (ds.quality.codes.length !== N || ds.quality.codes.some(c=>!Number.isInteger(c)||c<0||c>255))) throw new Error('Quality codes must cover the grid with raw byte categories');
  ds.origins.forEach((o, i) => {
    if (!Object.values(ORIGIN).includes(o)) throw new Error(`Unknown origin "${o}" at ${i}`);
    if ((o === ORIGIN.ABSENT) !== !Number.isFinite(ds.heights[i])) throw new Error(`Height ${i}: absent origin and missing value must coincide`);
    if (counts) {
      const count = counts[i];
      if (!Number.isSafeInteger(count) || count < 0 || (count === 0) !== (o === ORIGIN.ABSENT)) {
        throw new Error(`Height ${i}: a median height requires one or more valid samples`);
      }
    }
  });
}
