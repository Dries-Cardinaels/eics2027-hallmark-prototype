// Perturbation diagnostic: does an operation read only the heights it declares?
//
// For one dataset and one operation (a node of the pipeline), the diagnostic changes one source
// height at a time by a stated amount, recomputes the operation and its declared upstream nodes on
// the whole grid, and compares every output cell with the unperturbed result. An output whose
// result changed although the changed height is not among its declared source heights is an
// undeclared dependency: that height's supplier evidence would be missing from the output's record.
//
// Declared source heights are resolved as query() resolves them: following every declared
// footprint backwards, along every graph path, down to the source heights.
//
// Scope of what one run covers, and therefore of what a zero count means:
// - one perturbation size (`delta`, in the height unit) applied to each listed finite height;
//   absent heights are not perturbed and are counted as skipped;
// - one set of limits and the operation's parameters on this dataset;
// - the compared result fields (RESULT_FIELDS below). Provenance fields (sources, origin, quality,
//   missing, reason) are not compared: they follow from the declaration, not from the calculation.
// A dependency that does not change these fields for this delta, grid and limits is not detected.
//
// Every output is recomputed after each perturbation (no window shortcut), because some operations
// (illumination rays) declare inputs far from the output cell. Keep grids small.
//
// Declared heights whose perturbation changed nothing are reported separately. They are not errors:
// declared inputs may exceed influence (e.g. Horn's slope gives the centre height zero weight, and a
// criterion outcome does not flip for every small change).
import { OPERATIONS, analysisGrid } from './operations.js';
import { DEFAULT_LIMITS, createPipeline, evaluate } from './pipeline.js';

export const RESULT_FIELDS = Object.freeze(['available', 'value', 'outcome', 'category', 'outcomes', 'illumination.samples[].status', 'illumination.samples[].horizonDeg']);

const result = (rec) => JSON.stringify([
  rec.available, rec.value ?? null, rec.outcome ?? null, rec.category ?? null, rec.outcomes ?? null,
  rec.illumination ? rec.illumination.samples.map(s => [s.status, s.horizonDeg]) : null,
]);

const gridOf = (op, ds) => (op.kind === 'source' || op.grid === 'heights' ? { W: ds.W, H: ds.H } : analysisGrid(ds));

// The operation and every node it depends on, as a pipeline.
function upstreamPipeline(op, byId) {
  const needed = new Map();
  const visit = (node) => {
    if (needed.has(node.id)) return;
    needed.set(node.id, node);
    for (const input of node.inputs) {
      if (!byId[input]) throw new Error(`Undeclared input ${input}`);
      visit(byId[input]);
    }
  };
  visit(op);
  return createPipeline([...needed.values()]);
}

// Declared source heights of every cell of `nodeId`, through all declared footprints.
export function declaredSourceSets(pipeline, ds, nodeId) {
  const memo = new Map();
  const support = (id, cell) => {
    let byCell = memo.get(id);
    if (!byCell) memo.set(id, byCell = new Map());
    if (byCell.has(cell)) return byCell.get(cell);
    const op = pipeline.byId[id], out = new Set();
    if (op.kind === 'source') out.add(cell);
    else for (const [input, cells] of Object.entries(op.footprint(cell, ds))) for (const i of cells) for (const s of support(input, i)) out.add(s);
    byCell.set(cell, out);
    return out;
  };
  const g = gridOf(pipeline.byId[nodeId], ds);
  return Array.from({ length: g.W * g.H }, (_, cell) => support(nodeId, cell));
}

/**
 * perturbationDiagnostic(dataset, target, options) → plain report.
 * target: node id (resolved in options.pipeline or options.operations) or an operation object
 *         (its inputs are resolved in options.operations, default OPERATIONS).
 * options: { operations, pipeline, limits, delta = 1, inputs (height indices; default all), maxExamples = 20 }
 */
export function perturbationDiagnostic(dataset, target, options = {}) {
  const { limits: given = DEFAULT_LIMITS, delta = 1, maxExamples = 20 } = options;
  if (!Number.isFinite(delta) || delta === 0) throw new Error('Perturbation size must be a non-zero number');
  const limits = { ...DEFAULT_LIMITS, ...given };
  const byId = Object.fromEntries((options.pipeline?.operations ?? options.operations ?? OPERATIONS).map(op => [op.id, op]));
  const op = typeof target === 'string' ? byId[target] : target;
  if (!op) throw new Error(`Unknown node ${target}`);
  byId[op.id] = op;
  const pipeline = upstreamPipeline(op, byId);

  const base = evaluate(dataset, limits, pipeline).records[op.id].map(result);
  const declared = declaredSourceSets(pipeline, dataset, op.id);
  const out = gridOf(op, dataset), N = dataset.W * dataset.H;
  const candidates = options.inputs ?? Array.from({ length: N }, (_, i) => i);
  const perturbed = candidates.filter(i => Number.isFinite(dataset.heights[i]));

  let undeclaredCount = 0, declaredChanged = 0, declaredUnchanged = 0;
  const examples = [], undeclaredOutputs = new Set(), undeclaredInputs = new Set();
  for (const i of perturbed) {
    const heights = Array.from(dataset.heights);
    heights[i] += delta;
    const after = evaluate({ ...dataset, heights }, limits, pipeline).records[op.id];
    for (let cell = 0; cell < base.length; cell++) {
      const changed = result(after[cell]) !== base[cell], isDeclared = declared[cell].has(i);
      if (isDeclared) changed ? declaredChanged++ : declaredUnchanged++;
      else if (changed) {
        undeclaredCount++;
        undeclaredOutputs.add(cell);
        undeclaredInputs.add(i);
        if (examples.length < maxExamples) examples.push({
          output: { cell, row: Math.floor(cell / out.W), col: cell % out.W },
          input: { cell: i, row: Math.floor(i / dataset.W), col: i % dataset.W },
          before: JSON.parse(base[cell]), after: JSON.parse(result(after[cell])),
        });
      }
    }
  }

  return {
    operation: op.id, title: op.title ?? op.id,
    nodes: pipeline.operations.map(o => o.id),
    grid: { heights: { W: dataset.W, H: dataset.H }, output: { W: out.W, H: out.H } },
    perturbation: { delta, unit: 'height unit of the dataset (m)', direction: delta > 0 ? 'raise' : 'lower' },
    parameters: op.parameters ? op.parameters(dataset, limits) : {},
    limits,
    comparedFields: [...RESULT_FIELDS],
    inputsPerturbed: perturbed.length,
    inputsSkipped: candidates.length - perturbed.length,
    outputsChecked: base.length,
    pairsChecked: perturbed.length * base.length,
    undeclared: {
      count: undeclaredCount,
      outputs: undeclaredOutputs.size,
      inputs: undeclaredInputs.size,
      examples,
    },
    declared: {
      pairs: declaredChanged + declaredUnchanged,
      changed: declaredChanged,
      withoutChange: declaredUnchanged,
      note: 'Declared without change is not an error: a footprint may hold cells that do not change the result.',
    },
  };
}
