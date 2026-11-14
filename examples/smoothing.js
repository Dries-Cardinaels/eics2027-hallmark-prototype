// External operation example (plan step 4.1, decision D1b).
//
// This operation is defined outside src/core. It uses only the public operation contract that the
// core operations use: id, kind, grid, inputs, declared footprint, compute, parameters and origin
// rule. The core pipeline (createPipeline, evaluate, query) runs it without any change to src/core.
//
// Smoothing, not block aggregation: a 3×3 mean keeps the output on the analysis grid (same spacing
// as the heights), which the core can represent. Block aggregation produces a coarser grid; the core
// creates every derived node on the analysis grid (pipeline.js evaluate/evaluateLazy), so a coarser
// output would need core changes. See demo/research/phase4-reusability-note.md.
import { MARGIN, analysisGrid } from '../src/core/index.js';

// Height indices of the 3×3 window centred on analysis cell `cell` (centre included).
export function meanWindow(cell, ds) {
  const A = analysisGrid(ds), r = Math.floor(cell / A.W) + MARGIN, c = (cell % A.W) + MARGIN, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.push((r + dr) * ds.W + (c + dc));
  return out;
}

export const smoothedHeight = {
  id: 'smoothed-height', title: 'Smoothed height', kind: 'value', grid: 'analysis', inputs: ['heights'],
  quantity: 'mean height', unit: 'm',
  method: 'arithmetic mean of heights, 3×3 window',
  calculation: 'Σzᵢ / 9 over the 9 heights of the window, centre included',
  parameters: () => ({ window: '3×3', weights: 'equal', centre: 'included' }),
  footprint: (cell, ds) => ({ heights: meanWindow(cell, ds) }),
  compute({ heights: z }) {
    return { value: z.reduce((s, v) => s + v, 0) / z.length };
  },
  originRule: { id: 'union', text: 'summary over every source height reached through the footprints' },
};
