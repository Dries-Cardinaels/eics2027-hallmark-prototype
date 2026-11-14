import {evaluateRaster} from '../src/core/raster.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate,query,createDatasetPipeline,createPipeline} from '../src/core/index.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {createSession} from '../editor/session.js';
import {createSurfaceMap,sampleSurfaceMap,paintSurfaceMap,valueColour} from '../editor/surface-map.js';

const quantities=['heights','slope','roughness'];
const fieldsFor = ds => Object.fromEntries(quantities.map(id=>[id,evaluateRaster(ds,id)]));

for(const id of ['reference','missing','undocumented'])test(`overview values and quality match inspected records throughout ${id}`,()=>{
 const base=datasetById(id),ds={...base,quality:{codes:base.heights.map((_,i)=>i%7===0?3:14),flaggedCodes:[3]}};
 const ev=evaluate(ds);
 for(const node of quantities){
  const f=evaluateRaster(ds,node);let min=Infinity,max=-Infinity;
  for(let i=0;i<f.values.length;i++){
   const q=query(ev,node,i);
   assert.equal(f.values[i],q.available?q.value:NaN);
   assert.equal(f.quality.suspicious[i],q.quality.suspicious);
   assert.equal(f.quality.total[i],q.sourceCells.length);
   if(Number.isFinite(f.values[i])){min=Math.min(min,f.values[i]);max=Math.max(max,f.values[i]);}
  }
  assert.deepEqual(f.range,[min,max]);
 }
});

test('a suspicious center affects roughness support but not Horn slope support',()=>{
 const base=datasetById('reference'),codes=base.heights.map(()=>14);
 codes[9*base.W+5]=3;
 const ds={...base,quality:{codes,flaggedCodes:[3]}},fields=fieldsFor(ds),cell={row:9,col:5};
 const slope=sampleSurfaceMap(createSurfaceMap(ds,fields,'slope',true),cell);
 const rough=sampleSurfaceMap(createSurfaceMap(ds,fields,'roughness',true),cell);
 assert.equal(slope.suspicious,0);assert.equal(slope.total,8);
 assert.equal(rough.suspicious,1);assert.equal(rough.total,25);
});

test('native spacing and nonzero grid origins preserve overview-to-query correspondence',()=>{
 for(const res of [1,4]){
  const ds={...datasetById('reference'),res,grid:{east:252500,north:161012}};
  const fields=fieldsFor(ds),ev=evaluate(ds);
  for(const node of ['slope','roughness']){
   const map=createSurfaceMap(ds,fields,node,true);
   assert.deepEqual(map.offset,{row:2,col:2});
   assert.equal(sampleSurfaceMap(map,{row:9,col:5}).value,query(ev,node,{row:7,col:3}).value);
   assert.equal(sampleSurfaceMap(map,{row:0,col:0}).outside,true);
  }
 }
});

test('quality overlays change pixels without changing values, flags or origins',()=>{
 const base=datasetById('reference'),ds={...base,quality:{codes:base.heights.map(()=>3)}};
 const fields=fieldsFor(ds),before=structuredClone({heights:ds.heights,origins:ds.origins,codes:ds.quality.codes,values:fields.slope.values});
 const a=createSurfaceMap(ds,fields,'slope',false),b=createSurfaceMap(ds,fields,'slope',true);
 assert.equal(a.field,b.field);
 assert.notDeepEqual(paintSurfaceMap(a).pixels,paintSurfaceMap(b).pixels);
 assert.deepEqual({heights:ds.heights,origins:ds.origins,codes:ds.quality.codes,values:fields.slope.values},before);
 const unflagged=paintSurfaceMap(a),cell={row:9,col:5},sample=sampleSurfaceMap(a,cell);
 const pixel=((cell.row*4+2)*unflagged.width+cell.col*4+2)*4;
 assert.deepEqual([...unflagged.pixels.slice(pixel,pixel+3)],valueColour(sample.value,a.field.range));
});

test('unsupplied quality remains absent and missing values never become zero',()=>{
 const ds=datasetById('missing'),fields=fieldsFor(ds),map=createSurfaceMap(ds,fields,'roughness',true);
 assert.equal(fields.roughness.quality,null);assert.equal(map.flags,false);
 assert.equal(sampleSurfaceMap(map,{row:0,col:0}).suspicious,null);
 assert.throws(()=>createSurfaceMap(ds,fields,'quality',true),/not supplied/);
 const i=fields.roughness.values.findIndex(v=>!Number.isFinite(v));assert.ok(i>=0);
 const sample=sampleSurfaceMap(map,{row:Math.floor(i/map.grid.W)+2,col:i%map.grid.W+2});
 assert.equal(Number.isNaN(sample.value),true);assert.equal(sample.suspicious,null);
});

test('lidar gap dots follow the displayed result inputs and remain separate from unavailable hatching',()=>{
  const base=datasetById('reference'), center={row:8,col:8}, gap=8*base.W+8;
  const heights=[...base.heights]; heights[gap]=NaN;
  const ds={...base,heights,groundCounts:heights.map(h=>Number.isFinite(h)?1:0),
    origins:heights.map(h=>Number.isFinite(h)?'observed':'absent')};
  const fields=fieldsFor(ds), map=createSurfaceMap(ds,fields,'slope',{gaps:true});
  const sample=sampleSurfaceMap(map,center);
  const scale=12, raster=paintSurfaceMap(map), sourceInk=[38,52,67];
  function colourAt(row,col,x,y){
    const i=4*((row*scale+y)*raster.width+col*scale+x);
    return Array.from(raster.pixels.slice(i,i+3));
  }
  assert.ok(Number.isFinite(sample.value));
  assert.deepEqual(colourAt(8,8,5,5),valueColour(sample.value,map.field.range));
  assert.deepEqual(colourAt(8,8,1,2),valueColour(sample.value,map.field.range));
  // Its neighbour has a ground measurement but needs the missing input for slope.
  assert.ok(Number.isNaN(sampleSurfaceMap(map,{row:8,col:9}).value));
  assert.deepEqual(colourAt(8,9,5,5),sourceInk);
  const off=paintSurfaceMap(createSurfaceMap(ds,fields,'slope',{gaps:false}));
  const pixel=4*((8*scale+5)*off.width+9*scale+5);
  assert.notDeepEqual(Array.from(off.pixels.slice(pixel,pixel+3)),sourceInk);
  assert.notDeepEqual(colourAt(8,9,0,0),colourAt(8,9,1,0));
});

test('conservative footprints remain in overview flag counts',()=>{
 const base=datasetById('reference'),codes=base.heights.map(()=>14);codes[4]=3;
 const ds={...base,quality:{codes}},p=createDatasetPipeline(ds);
 const op={...p.byId.slope,footprint:()=>({heights:[0,1,2,3,4,5,6,7,8]}),compute:({heights})=>({value:heights[0]})};
 const pipeline=createPipeline([p.byId.heights,op]),f=evaluateRaster(ds,'slope',pipeline);
 assert.equal(f.values[0],ds.heights[0]);assert.equal(f.quality.suspicious[0],1);assert.equal(f.quality.total[0],9);
});

test('after upstream tracing, a new map pick selects the displayed result layer',()=>{
 const ds=datasetById('reference'),session=createSession(ds,{selection:{layerId:'slope',cell:{row:7,col:3}}});
 const before=session.getSnapshot(),input=before.inputs[0];
 session.dispatch({type:'input',layerId:input.layerId,cell:input.cells[0].cell});
 const picked=session.dispatch({type:'pick',layerId:'slope',point:before.point});
 assert.deepEqual(picked.selection,before.selection);assert.equal(picked.trail.length,1);
 assert.deepEqual(picked.sources,before.sources);
});

test('the native Nassau overview matches the worked slope and its exact flagged support',()=>{
 const raw=JSON.parse(readFileSync(new URL('../fixtures/lroc/nassau02-belief-candidate/sample.json',import.meta.url)));
 const ds={...raw,origins:raw.heights.map(()=> 'undocumented'),quality:{codes:raw.quality_codes}},fields=fieldsFor(ds);
 const map=createSurfaceMap(ds,fields,'slope',true),sample=sampleSurfaceMap(map,{row:25,col:25});
 assert.ok(Math.abs(sample.value-14.99246742611901)<1e-9);assert.equal(sample.suspicious,7);assert.equal(sample.total,8);
});
