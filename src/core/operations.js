import { illuminationGeometry, illuminationPeriod, calculateIllumination } from './illumination.js';
// Declared operations of the slope/roughness assessment.
//
// Every operation declares its inputs, output quantity and unit, the numerical calculation, the
// input cells each output cell requires (its declared footprint), its parameters and the rule by
// which its origin summary follows from its inputs. The pipeline runner applies the declarations;
// no operation sets origins itself.
//
// Grids. Heights live on the delivered height grid (W × H). Every derived node lives on the
// analysis grid: the height grid minus a margin of 2 cells on each side, so that every analysed
// cell has a complete 3×3 and 5×5 window and no edge rule is needed. Analysis cell (r, c) is
// centred on height cell (r + margin, c + margin).

export const MARGIN = 2;

export const analysisGrid = (ds) => ({ W: ds.W - 2 * MARGIN, H: ds.H - 2 * MARGIN, res: ds.res });

// Height indices of the (2k+1) × (2k+1) window centred on analysis cell `cell`.
function windowCells(cell, ds, k) {
  const A = analysisGrid(ds), r = Math.floor(cell / A.W) + MARGIN, c = (cell % A.W) + MARGIN, out = [];
  for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) out.push((r + dr) * ds.W + (c + dc));
  return out;
}

const ORIGIN_RULE = {
  declared: { id: 'declared', text: 'origin as declared by the delivery record for this height' },
  union: { id: 'union', text: 'summary over every source height reached through the footprints' },
  branches: { id: 'branches', text: 'each branch summary is retained; the overall summary counts shared source heights once' },
};

// Delivered heights: the earliest retained record. Earlier acquisition and processing are not
// reconstructed; an undocumented origin is a boundary of what can be traced.
export const heights = {
  id: 'heights', title: 'Heights', kind: 'source', grid: 'heights', inputs: [],
  quantity: 'height', unit: 'm',
  method: 'delivered height grid',
  calculation: 'value supplied by the delivery; no calculation',
  parameters: (ds) => ({ cellSize_m: ds.res }),
  originRule: ORIGIN_RULE.declared,
};

// Horn's method on the 3×3 window: the same weights as the Hallmark core's slope step.
export const slope = {
  id: 'slope', title: 'Slope', kind: 'value', grid: 'analysis', inputs: ['heights'],
  quantity: 'slope angle', unit: '°',
  method: "Horn's method, 3×3 window",
  calculation: 'atan(√(∂z/∂x² + ∂z/∂y²)); Horn gradients use east–west spacing for x and north–south spacing for y, over the eight neighbours of the selected height.',
  parameters: (ds) => ({ window: '3×3', eastWestSpacing_m: ds.source?.res_m_ew ?? ds.res, northSouthSpacing_m: ds.source?.res_m_ns ?? ds.res }),
  footprint: (cell, ds) => ({ heights: windowCells(cell, ds, 1).filter((_, i) => i !== 4) }),
  compute({ heights: [a, b, c, d, f, g, h, i] }, ds) {
    const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * (ds.source?.res_m_ew ?? ds.res));
    const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * (ds.source?.res_m_ns ?? ds.res));
    return { value: (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI };
  },
  originRule: ORIGIN_RULE.union,
};

// Population standard deviation of the 25 heights in the 5×5 window (as the core's boxStd).
// Displayed as "Height spread" (D3): no plane is removed, so tilt is included. The id stays `roughness`.
export const roughness = {
  id: 'roughness', title: 'Height spread', kind: 'value', grid: 'analysis', inputs: ['heights'],
  quantity: 'height spread (standard deviation of the 25 raw heights, tilt included)', unit: 'm',
  method: 'standard deviation of heights, 5×5 window',
  calculation: '√(Σ(zᵢ − z̄)² / 25) over the 25 heights of the window',
  parameters: () => ({ window: '5×5', estimator: 'population standard deviation' }),
  footprint: (cell, ds) => ({ heights: windowCells(cell, ds, 2) }),
  compute({ heights: z }) {
    const m = z.reduce((s, v) => s + v, 0) / z.length;
    return { value: Math.sqrt(z.reduce((s, v) => s + (v - m) ** 2, 0) / z.length) };
  },
  originRule: ORIGIN_RULE.union,
};

export const illumination = {
  id:'illumination',title:'Illumination',kind:'value',grid:'analysis',inputs:['heights'],
  quantity:'sampled direct-sun visibility within the DEM crop',unit:'%',acceptsUnavailable:true,
  method:'Directional height-ray tests at hourly Sun samples',
  calculation:'100 × illuminated sample hours / period hours; missing-ray samples remain unknown',
  parameters:ds=>illuminationPeriod(ds),
  footprint:(cell,ds)=>({heights:illuminationGeometry(ds,cell).sources}),
  compute:({heights},ds,limits,records,context)=>calculateIllumination(ds,context.cell,heights),
  originRule:ORIGIN_RULE.union,
};
export const illuminationCriterion = {
  id:'illumination-criterion',title:'Illumination criterion',kind:'criterion',grid:'analysis',inputs:['illumination'],limitKey:'illuminationMinPercent',
  quantity:'sampled sunlight compared with minimum',unit:null,
  method:'compare sampled sunlight with the configured minimum',
  calculation:'unmet if percent < minimum; equality meets the minimum',
  parameters:(ds,limits)=>({minimumPercent:limits.illuminationMinPercent}),
  footprint:cell=>({illumination:[cell]}),
  compute:({illumination:[value]},ds,limits)=>({value,limit:limits.illuminationMinPercent,outcome:value<limits.illuminationMinPercent?'exceeded':'not-exceeded'}),
  originRule:ORIGIN_RULE.union,
};

// Compare one value with its configured limit. Equality does not exceed the limit.
export function criterion({ id, title, input, limitKey, label = input }) {
  return {
    id, title, kind: 'criterion', grid: 'analysis', inputs: [input], limitKey,
    quantity: `${label} compared with limit`, unit: null,
    method: `compare ${label} with the configured ${label} limit`,
    calculation: 'exceeded if value > limit; a value equal to the limit is not exceeded',
    parameters: (ds, limits) => ({ limit: limits[limitKey] }),
    footprint: (cell) => ({ [input]: [cell] }),
    compute(inputs, ds, limits) {
      const value = inputs[input][0], limit = limits[limitKey];
      if (limit === null) return { available:false, value:null, limit, outcome:'unavailable', reason:'No limit configured' };
      return { value, limit, outcome: value > limit ? 'exceeded' : 'not-exceeded' };
    },
    originRule: ORIGIN_RULE.union,
  };
}

export const slopeCriterion = criterion({ id: 'slope-criterion', title: 'Slope criterion', input: 'slope', limitKey: 'slopeDeg' });
export const roughnessCriterion = criterion({ id: 'roughness-criterion', title: 'Height spread criterion', input: 'roughness', limitKey: 'roughness_m', label: 'height spread' });

// Combined assessment: names which configured limits are exceeded and keeps both branch outcomes.
// It is the one operation that accepts unavailable inputs, so that it can report an incomplete
// assessment while retaining the available branch's outcome.
export const combined = {
  id: 'combined', title: 'Combined assessment', kind: 'combination', grid: 'analysis',
  inputs: ['slope-criterion', 'roughness-criterion', 'illumination-criterion'], branches: { slope: 'slope-criterion', roughness: 'roughness-criterion', illumination:'illumination-criterion' },
  acceptsUnavailable: true,
  quantity: 'configured limits exceeded', unit: null,
  method: 'combine slope, height spread and illumination criterion outcomes',
  calculation: 'all criteria must be met; retain each outcome and mark incomplete if any criterion is unavailable',
  parameters: () => ({}),
  footprint: (cell) => ({ 'slope-criterion': [cell], 'roughness-criterion': [cell], 'illumination-criterion':[cell] }),
  compute(_, ds, limits, records) {
    const outcomes=Object.fromEntries(Object.entries(records).map(([id,list])=>[id.replace('-criterion',''),list[0].available?list[0].outcome:'unavailable']));
    const unmet=Object.keys(outcomes).filter(name=>outcomes[name]==='exceeded');
    const incomplete=Object.values(outcomes).includes('unavailable');
    return {value:null,category:incomplete?'incomplete':unmet.length?'unmet':'neither',outcomes};
  },
  originRule: ORIGIN_RULE.branches,
};

export const OPERATIONS = [heights, slope, roughness, slopeCriterion, roughnessCriterion, illumination, illuminationCriterion, combined];
