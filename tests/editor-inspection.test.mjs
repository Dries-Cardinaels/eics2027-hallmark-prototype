import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate, evaluateLazy, query, createPipeline, createDatasetPipeline} from '../src/core/index.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {createSession} from '../editor/session.js';
import {cellCenter, cellAt, layerGrid} from '../editor/spatial.js';

const ids = ['heights','slope','roughness','slope-criterion','roughness-criterion','combined'];
const selection = {layerId:'combined',cell:{row:7,col:3}};

for (const id of ['reference','undocumented','missing']) {
  test(`on-demand queries match existing evaluation for every layer: ${id}`,()=>{
    const ds=datasetById(id),a=evaluate(ds),b=evaluateLazy(ds);
    for(const node of ids)for(const cell of [{row:0,col:0},{row:7,col:3}])assert.deepEqual(query(b,node,cell),query(a,node,cell));
  });
}

test('a query computes its dependencies once, without evaluating the entire map',()=>{
 const ds=datasetById('reference'),base=createDatasetPipeline(ds);let calls=0;
 const ops=base.operations.map(op=>op.id==='slope'?{...op,compute(...args){calls++;return op.compute(...args);}}:op);
 const ev=evaluateLazy(ds,undefined,createPipeline(ops));assert.equal(calls,0);
 const a=query(ev,'slope',{row:7,col:3});assert.equal(calls,1);
 assert.equal(query(ev,'slope',{row:7,col:3}).value,a.value);assert.equal(calls,1);
});

test('selected sources and method are the Hallmark query, including both branches',()=>{
 const ds=datasetById('reference'),session=createSession(ds,{selection}),s=session.getSnapshot();
 const expected=query(evaluate(ds),'combined',selection.cell);
 assert.equal(s.record.method,expected.method);
 assert.deepEqual(s.sources.map(c=>c.index),expected.sourceCells.map(c=>c.index));
 assert.equal(new Set(s.sources.map(c=>c.index)).size,25);
 assert.deepEqual(s.record.branches.slope.origin,expected.branches.slope.origin);
 assert.equal(s.record.branches.slope.sourceCellCount,8);
 assert.equal(s.record.branches.roughness.sourceCellCount,25);
});

test('upstream navigation follows actual input cells and returns to the original result',()=>{
 const session=createSession(datasetById('reference'),{selection});
 const initial=session.getSnapshot();
 let input=initial.inputs.find(i=>i.layerId==='slope-criterion');
 let s=session.dispatch({type:'input',layerId:input.layerId,cell:input.cells[0].cell});
 assert.equal(s.selection.layerId,'slope-criterion');
 input=s.inputs[0];s=session.dispatch({type:'input',layerId:input.layerId,cell:input.cells[0].cell});
 assert.equal(s.selection.layerId,'slope');assert.equal(s.sources.length,8);
 input=s.inputs[0];const chosen=input.cells[0].cell;
 s=session.dispatch({type:'input',layerId:input.layerId,cell:chosen});
 assert.equal(s.selection.layerId,'heights');assert.equal(s.sources.length,1);
 assert.equal(s.record.value,initial.dataset.heights[chosen.row*initial.dataset.W+chosen.col]);
 assert.throws(()=>session.dispatch({type:'input',layerId:'heights',cell:{row:0,col:0}}),/not an immediate input/);
 s=session.dispatch({type:'back',index:0});assert.deepEqual(s.selection,initial.selection);assert.equal(s.trail.length,1);
});

test('source and derived grids preserve positions at different native spacings and origins',()=>{
 for(const res of [1,4]){
  const base=datasetById('reference'),ds={...base,res,grid:{east:1024,north:4096}};
  const session=createSession(ds,{selection:{layerId:'slope',cell:{row:7,col:3}}});
  const before=session.getSnapshot();
  for(const c of before.sources){assert.equal(c.east,1024+(c.col+.5)*res);assert.equal(c.north,4096-(c.row+.5)*res);}
  const source=session.dispatch({type:'layer',layerId:'heights'});
  assert.deepEqual(source.selection.cell,{row:9,col:5});assert.deepEqual(source.point,before.point);
  assert.deepEqual(source.heightCell,before.heightCell);assert.deepEqual(source.heightCell,{row:9,col:5});
  for(const input of before.inputs)for(const child of input.cells){
   const upstream=session.dispatch({type:'select',layerId:input.layerId,cell:child.cell});
   assert.deepEqual(upstream.heightCell,child.heightCell);
  }
  session.dispatch({type:'select',layerId:'heights',cell:source.selection.cell});
  const derived=session.dispatch({type:'layer',layerId:'slope'});assert.deepEqual(derived.selection,before.selection);
  const grid=layerGrid(ds,{grid:'heights'});assert.deepEqual(cellAt(grid,cellCenter(grid,{row:3,col:4})),{row:3,col:4});
 }
});

test('edge cells stay at their spatial position and report the unavailable derived grid',()=>{
 const session=createSession(datasetById('reference'),{selection:{layerId:'heights',cell:{row:0,col:0}}});
 const before=session.getSnapshot(),s=session.dispatch({type:'layer',layerId:'slope'});
 assert.deepEqual(s.point,before.point);assert.equal(s.record.outside,true);assert.deepEqual(s.sources,[]);
 const back=session.dispatch({type:'layer',layerId:'heights'});assert.deepEqual(back.selection.cell,{row:0,col:0});
});

test('missing inputs are visible and retained instead of silently omitted',()=>{
 const ds=datasetById('missing'),b=ds.heights.findIndex(h=>!Number.isFinite(h));
 const native={row:Math.floor(b/ds.W),col:b%ds.W};
 const s=createSession(ds,{selection:{layerId:'roughness',cell:{row:native.row-2,col:native.col-2}}}).getSnapshot();
 assert.equal(s.record.available,false);assert.ok(s.record.boundaries.missing.length>0);
 assert.ok(s.sources.some(c=>c.index===b&&c.height===null&&c.origin==='absent'));
 assert.equal(s.sources.length,25);
});

test('coordinate queries reject out-of-range columns instead of wrapping into another row',()=>{
 const ev=evaluateLazy(datasetById('reference'));
 for(const cell of [{row:1,col:-1},{row:0,col:ev.dataset.W},{row:0,col:.5}])assert.equal(query(ev,'heights',cell).outside,true);
 for(const index of [NaN,Infinity,-1,.5])assert.equal(query(ev,'heights',index).outside,true);
});

test('inspection retains conservative declared support even when the calculation reads fewer cells',()=>{
 const base=datasetById('reference'),origins=base.origins.map(()=> 'observed');origins[4]='interpolated';
 const ds={...base,origins},source=createDatasetPipeline(ds).byId.heights;
 const probe={...createDatasetPipeline(ds).byId.slope,id:'probe',inputs:['heights'],footprint:()=>({heights:[0,1,2,3,4,5,6,7,8]}),compute:({heights})=>({value:heights[0]})};
 const s=createSession(ds,{pipeline:createPipeline([source,probe]),selection:{layerId:'probe',cell:{row:0,col:0}}}).getSnapshot();
 assert.equal(s.record.value,ds.heights[0]);assert.equal(s.sources.length,9);
 assert.equal(s.record.origin.counts.interpolated,1);
 assert.deepEqual(s.sources.map(c=>c.index),s.record.sourceCells.map(c=>c.index));
 const moved=createSession(ds,{selection});
 const before=moved.getSnapshot();assert.throws(()=>moved.dispatch({type:'select',cell:{row:0,col:ds.W}}),/outside/);
 assert.deepEqual(moved.getSnapshot(),before);
});

test('criteria edits change outcomes without changing methods, values or source support',()=>{
 const session=createSession(datasetById('reference'),{selection:{layerId:'slope-criterion',cell:{row:7,col:3}}});
 const before=session.getSnapshot(),after=session.dispatch({type:'limits',limits:{slopeDeg:0}});
 assert.notEqual(after.record.outcome,before.record.outcome);assert.equal(after.record.method,before.record.method);
 assert.equal(after.record.value,before.record.value);assert.deepEqual(after.sources,before.sources);
});

test('native Nassau query retains the verified value and quality classes',()=>{
 const raw=JSON.parse(readFileSync(new URL('../fixtures/lroc/nassau02-belief-candidate/sample.json',import.meta.url)));
 const ds={...raw,origins:raw.heights.map(()=> 'undocumented'),quality:{kind:'lroc-stereo-status',codes:raw.quality_codes},originDeclaration:{status:'not-supplied',explanation:'Not supplied'}};
 const s=createSession(ds,{selection:{layerId:'slope',cell:{row:23,col:23}}}).getSnapshot();
 assert.ok(Math.abs(s.record.value-14.99246742611901)<1e-9);assert.equal(s.sources.length,8);
 assert.equal(s.record.quality.suspicious,7);assert.equal(s.sources.filter(c=>c.quality.code===3).length,7);
 assert.equal(s.record.origin.counts.undocumented,8);
});
