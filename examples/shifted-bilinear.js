// Negative-control operation for plan step 4.2 (decided 6 Nov 2026).
//
// Bilinear interpolation of heights at a point shifted by half a cell (+0.5 row, +0.5 column)
// from each analysis cell's centre height. At that point the four bilinear weights are equal, so
// the value reads four heights: (r, c), (r, c+1), (r+1, c) and (r+1, c+1).
//
// The footprint deliberately declares only the nearest cell (r, c), as a nearest-cell
// declaration would. Three of the four heights read are therefore undeclared. The perturbation
// diagnostic (src/core/diagnostic.js) must report them. The output stays on the analysis grid
// (same spacing): this is a shift, not a change of grid spacing, which the core cannot hold.
import { MARGIN, analysisGrid } from '../src/core/index.js';

// Height indices (r, c), (r, c+1), (r+1, c), (r+1, c+1) for analysis cell `cell`.
export function bilinearCorners(cell, ds) {
  const A = analysisGrid(ds), r = Math.floor(cell / A.W) + MARGIN, c = (cell % A.W) + MARGIN;
  return [r * ds.W + c, r * ds.W + c + 1, (r + 1) * ds.W + c, (r + 1) * ds.W + c + 1];
}

export const shiftedBilinearDeclaredNearest = {
  id: 'shifted-bilinear-declared-nearest', title: 'Half-cell bilinear height, declared as nearest cell',
  kind: 'value', grid: 'analysis', inputs: ['heights'],
  quantity: 'interpolated height at (+0.5, +0.5) cell', unit: 'm',
  method: 'bilinear interpolation at a half-cell shift; footprint deliberately declares only the nearest cell',
  calculation: 'mean of the 4 surrounding heights (equal bilinear weights at the half-cell point)',
  parameters: () => ({ shift: '+0.5 row, +0.5 column', declared: 'nearest cell only' }),
  footprint: (cell, ds) => ({ heights: [bilinearCorners(cell, ds)[0]] }),
  compute: (inputs, ds, limits, records, { cell }) => {
    const z = bilinearCorners(cell, ds).map(i => ds.heights[i]);
    return { value: z.reduce((a, b) => a + b, 0) / 4 };
  },
  originRule: { id: 'union', text: 'summary over every source height reached through the footprints' },
};
