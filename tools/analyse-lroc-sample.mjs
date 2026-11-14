// Run the prototype's existing numerical kernels on the native LROC crop.
// Confidence classes are support records, not invented origin/uncertainty values.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {slope,roughness} from '../src/core/operations.js';
const folder=new URL('../fixtures/lroc/nassau02/',import.meta.url);
const ds=JSON.parse(readFileSync(new URL('sample.json',folder),'utf8'));
const values={slope:[],roughness:[]},suspicious={slope:[],roughness:[]};
const A={W:ds.W-4,H:ds.H-4}, candidates=[];
for(let row=0;row<A.H;row++)for(let col=0;col<A.W;col++) {
 for(const op of [slope,roughness]) {
  const indices=op.footprint(row*A.W+col,ds).heights;
  const heights=indices.map(i=>ds.heights[i]);
  assert.ok(heights.every(Number.isFinite));
  values[op.id].push(op.compute({heights},ds).value);
  suspicious[op.id].push(indices.filter(i=>ds.quality_codes[i]===3).length);
 }
 const k=row*A.W+col;
 if(!suspicious.slope[k]&&suspicious.roughness[k]) candidates.push({row,col,k,count:suspicious.roughness[k]});
}
assert.ok(candidates.length,'A branch-specific quality example must exist');
candidates.sort((a,b)=>b.count-a.count||a.k-b.k);
// Retain the published demonstration location as support semantics are refined.
const selected=candidates.find(c=>c.row===11&&c.col===18) ?? candidates[0], global=ds.crop;
const sample={analysis_cell:{row:selected.row,col:selected.col},
 height_cell_in_crop:{row:selected.row+2,col:selected.col+2},
 height_cell_in_product:{row:global.row_start_zero_based+selected.row+2,col:global.col_start_zero_based+selected.col+2},
 slope_deg:values.slope[selected.k],roughness_m:values.roughness[selected.k],
 suspicious_inputs:{slope:[0,8],roughness:[selected.count,25]},
 explanation:'Slope uses only successful-correlation cells. Roughness additionally uses suspicious cells outside the eight slope inputs. This records support quality; it does not quantify numerical error or prove interpolation.'};
const analysis={grid:A,methods:{slope:slope.method,roughness:roughness.method},
 support_area_m:{slope:[3*ds.res,3*ds.res],roughness:[5*ds.res,5*ds.res]},
 ranges:{slope_deg:[Math.min(...values.slope),Math.max(...values.slope)],roughness_m:[Math.min(...values.roughness),Math.max(...values.roughness)]},
 selected:sample,values,suspicious_input_counts:suspicious,
 scope:'Existing numerical kernels only. No provenance mapping, uncertainty propagation or operational acceptance thresholds applied.'};
writeFileSync(new URL('analysis.json',folder),JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify({ranges:analysis.ranges,example:sample},null,2));
