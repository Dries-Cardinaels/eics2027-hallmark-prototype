import {paletteOptions,setPalette,contrastColour} from '../editor/palette.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLazy,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {createSession} from '../editor/session.js';
import {createPlanningGrid,planRoute} from '../editor/planner.js';
import {traversalCostField,heightSupportField} from '../editor/traversal-cost.js';
import {createSurfaceMap,sampleSurfaceMap,costColour,costHexColour,paintSurfaceMap} from '../editor/surface-map.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {inspectorHTML,pipelineHTML} from '../editor/inspector.js';
import {tracePresentation} from '../editor/evidence-geometry.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {pathAssessmentScope,pathAssessmentLayer,pathDisplayColour,pathDisplayText} from '../editor/path-evidence.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {planControlsHTML} from '../editor/plan-controls.js';

const cell={row:7,col:3},native={row:9,col:5},limits={slopeDeg:15,roughness_m:.15};
const base=datasetById('reference');
const dataset=()=>({...base,quality:{codes:base.heights.map((_,i)=>i===native.row*base.W+native.col?3:14)}});
const valuesFor=ds=>Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)]));
const fieldsFor=(ds,values,limits)=>{
  const fields={...values,...evaluateLimitRasters(ds,values,limits)};
  return {...fields,'traversal-cost':traversalCostField(ds,fields),'height-support':heightSupportField(fields)};
};
const selection={layerId:'traversal-cost',cell};

test('selected density, raster, planner cell terms and route integration agree exactly at both permissive and exceeded limits',()=>{
  const ds=dataset(),values=valuesFor(ds);
  for(const limits of [{slopeDeg:90,roughness_m:100},{slopeDeg:0,roughness_m:0}]){
    const fields=fieldsFor(ds,values,limits),session=createSession(ds,{selection,limits}),s=session.getSnapshot();
    const grid=createPlanningGrid(ds,fields),index=grid.indexOf(native);
    assert.deepEqual(s.record.terms,grid.terms(index));assert.equal(s.record.value,grid.costs[index]);
    assert.equal(sampleSurfaceMap(createSurfaceMap(ds,fields,'traversal-cost',false),native).value,s.record.value);
    assert.equal(s.record.terms.exceeded,limits.slopeDeg===0?16:0);
    const route=planRoute(ds,fields,{start:native,goal:{row:10,col:7}});assert.equal(route.ok,true);
    for(let i=0;i<route.vertices.length;i++){
      const n=route.vertices[i],r=session.dispatch({type:'select',layerId:'traversal-cost',cell:{row:n.row-2,col:n.col-2}}).record;
      assert.equal(r.value,route.cellCosts[i].density);assert.deepEqual(r.terms,grid.terms(grid.indexOf(n)));
    }
    let integrated=0;for(let i=1;i<route.cellCosts.length;i++)integrated+=ds.res*(route.cellCosts[i-1].density+route.cellCosts[i].density)/2;
    assert.equal(integrated,route.cost);
    assert.ok(Math.abs(Object.values(route.breakdown).reduce((a,b)=>a+b,0)-route.cost)<1e-10);
  }
});

test('every contribution reaches actual height inputs; slope excludes the center and roughness includes it',()=>{
  const ds=dataset(),session=createSession(ds,{selection}),initial=session.getSnapshot();
  const expected=query(evaluateLazy(ds),'combined',cell).sourceCells.map(c=>c.index);
  assert.deepEqual(initial.sources.map(c=>c.index),expected);assert.equal(initial.sources.length,25);
  assert.ok(!initial.record.immediateInputs.some(i=>i.node==='combined'));
  for(const [layer,count,included] of [['slope',8,false],['roughness',25,true],['slope-criterion',8,false],['roughness-criterion',25,true]]){
    session.dispatch({type:'back',index:0});
    const s=session.dispatch({type:'input',layerId:layer,cell});
    assert.equal(s.sources.length,count);assert.equal(s.heightHere.used,included);assert.equal(s.trail[0].layerId,'traversal-cost');
    if(layer.endsWith('-criterion')){
      assert.equal(s.record.limit,layer==='slope-criterion'?limits.slopeDeg:limits.roughness_m);
      const value=session.dispatch({type:'input',layerId:s.inputs[0].layerId,cell});
      assert.equal(value.sources.length,count);assert.equal(value.trail.length,3);
    }
  }
  assert.deepEqual(initial.record.immediateInputs.map(i=>i.node),['slope','roughness','slope-criterion','roughness-criterion']);
  assert.ok(initial.record.paths.every(path=>!path.nodes.includes('height-support')));
  const support=session.dispatch({type:'layer',layerId:'height-support'});assert.equal(support.record.kind,'support');assert.equal(support.record.value,1/25);
  assert.deepEqual(support.sources.map(c=>c.index),expected);
  const source=session.dispatch({type:'input',layerId:'heights',cell:native});
  assert.equal(source.record.kind,'source');assert.equal(source.record.value,ds.heights[native.row*ds.W+native.col]);
  assert.equal(source.trail.length,2);
  assert.equal(session.dispatch({type:'back',index:0}).selection.layerId,'height-support');
  const trace=tracePresentation(initial,null,true);assert.equal(trace.selectedResult,true);assert.equal(trace.centreRole,'input');
  const html=inspectorHTML(initial);
  assert.match(html,/<div class="cost-contribution"[^>]*><span>Baseline<small>Constant · no height inputs/);
  assert.doesNotMatch(html,/data-input-layer="height-support"|data-input-layer="combined"|assessment-result|criterion-result|Flag preference/);
});

test('unknown quality, supplied zero and unavailable terrain remain distinct, without making cost depend on quality availability',()=>{
  for(const known of [false,true]){
    const ds={...base,...(known?{quality:{codes:base.heights.map(()=>14)}}:{})},values=valuesFor(ds),fields=fieldsFor(ds,values,limits);
    const session=createSession(ds,{selection}),s=session.getSnapshot();
    assert.equal(s.record.available,true);assert.equal(Boolean(s.record.quality),known);
    assert.deepEqual(Object.keys(s.record.terms),['baseline','slope','roughness','exceeded']);
    if(known){assert.equal(s.record.quality.suspicious,0);assert.equal(s.record.quality.total,25);}
    const support=session.dispatch({type:'layer',layerId:'height-support'});
    assert.equal(support.record.available,known);assert.equal(support.record.value,known?0:null);
    assert.match(inspectorHTML(support),known?/0 \/ 25 suspicious/:/Not supplied/);
    if(!known){assert.doesNotMatch(inspectorHTML(support),/0 \/ 25 suspicious/);assert.match(mapLegendHTML(createSurfaceMap(ds,fields,'height-support',false)),/Quality not supplied/);}
  }
  const ds=dataset(),index=native.row*ds.W+native.col;
  ds.heights=[...ds.heights];ds.origins=[...ds.origins];ds.heights[index]=NaN;ds.origins[index]='absent';
  const fields=fieldsFor(ds,valuesFor(ds),limits),s=createSession(ds,{selection}).getSnapshot();
  assert.equal(s.record.available,false);assert.equal(s.record.value,null);assert.ok(s.sources.some(c=>c.height===null));
  assert.ok(Number.isNaN(sampleSurfaceMap(createSurfaceMap(ds,fields,'traversal-cost',false),native).value));
  assert.match(inspectorHTML(s),/Unavailable terrain or incomplete limit assessment/);
  const outside=createSession(ds,{selection:{layerId:'heights',cell:{row:0,col:0}}}).dispatch({type:'layer',layerId:'traversal-cost'});
  assert.equal(outside.record.outside,true);assert.match(inspectorHTML(outside),/Outside layer/);
});

test('limit edits refresh density and invalidate approval while evidence stays independent',()=>{
  const ds=dataset(),values=valuesFor(ds),fields=fieldsFor(ds,values,{slopeDeg:90,roughness_m:100});
  const session=createSession(ds,{selection,limits:{slopeDeg:90,roughness_m:100}}),before=session.getSnapshot();
  const evidence=session.dispatch({type:'layer',layerId:'height-support'});
  const evidenceEdited=session.dispatch({type:'limits',limits:{slopeDeg:0,roughness_m:0}});
  assert.equal(evidenceEdited.record.value,evidence.record.value);assert.deepEqual(evidenceEdited.sources,evidence.sources);
  const changed=session.dispatch({type:'layer',layerId:'traversal-cost'});
  assert.equal(changed.record.value,before.record.value+16);assert.deepEqual(changed.sources,before.sources);
  const model=createSupervisoryPlan(ds,fields,{start:native,goal:{row:10,col:7},limits:{slopeDeg:90,roughness_m:100}});
  model.dispatch({type:'plan'});model.dispatch({type:'approve'});
  const newFields=fieldsFor(ds,values,changed.limits);
  const draft=model.dispatch({type:'limits',fields:newFields,limits:changed.limits});
  assert.equal(draft.route,null);assert.equal(draft.approval,null);assert.ok(draft.previous.approval);
});

test('cost rendering uses a numeric palette consistently across map, selected record and route, with explicit density versus total labels',()=>{
  const ds=dataset(),fields=fieldsFor(ds,valuesFor(ds),limits),s=createSession(ds,{selection}).getSnapshot();
  const map=createSurfaceMap(ds,fields,'traversal-cost',{heights:false,affected:false}),sample=sampleSurfaceMap(map,native),colour=costColour(sample.value,map.field.range);
  assert.equal(map.limits,false);assert.equal(map.mode,'values');assert.equal(sample.state,undefined);
  const pixels=paintSurfaceMap(map,new Uint8Array(ds.W*ds.H*4),1).pixels,index=(native.row*ds.W+native.col)*4;
  assert.deepEqual([...pixels.subarray(index,index+3)],colour);
  assert.equal(pathAssessmentScope('traversal-cost'),null);assert.equal(pathAssessmentLayer('traversal-cost'),'traversal-cost');
  const path=createProposedPath(ds,fields,[native]);assert.equal(path.cells[0].cost.value,s.record.value);
  assert.equal(pathDisplayColour(path.cells[0].cost,'traversal-cost',map.field.range),'#'+colour.map(v=>v.toString(16).padStart(2,'0')).join(''));
  assert.match(pathDisplayText(path.cells[0],'traversal-cost'),/density$/);
  const legend=mapLegendHTML(map);assert.match(legend,/Terrain cost density · per 1 m/);assert.doesNotMatch(legend,/Within limits|Exceeded|Roughness|Height spread/);
  const html=proposedPathHTML(path,null,{layer:'traversal-cost',qualityOptions:{heights:false,affected:false}});
  assert.match(html,/data-path-row="cost"/);assert.match(html,/Cost density/);assert.match(html,/Slope limit/);assert.match(html,/Height spread limit/);
  const graph=pipelineHTML(s);assert.match(graph,/data-layer="traversal-cost"/);assert.doesNotMatch(graph,/Combined result → Traversal cost/);
  const hidden=inspectorHTML(s,new Set(),{heights:false,affected:false});assert.doesNotMatch(hidden,/preference|quality term|code 3|Input flags/i);
});

test('excluding a native cell blocks route search without changing its terrain cost or inventing source support',()=>{
  const ds=dataset(),fields=fieldsFor(ds,valuesFor(ds),limits),grid=createPlanningGrid(ds,fields,[native]);
  assert.equal(grid.costs[grid.indexOf(native)],Infinity);
  const s=createSession(ds,{selection}).getSnapshot();assert.equal(s.record.available,true);assert.ok(Number.isFinite(s.record.value));
  assert.equal(sampleSurfaceMap(createSurfaceMap(ds,fields,'traversal-cost',false),native).value,s.record.value);
  const plan=createSupervisoryPlan(ds,fields,{start:native,goal:native,limits});plan.dispatch({type:'plan'});
  const html=planControlsHTML(plan.getSnapshot(),{selectedCell:native});assert.match(html,/terrain cost 0/);assert.match(html,/Total route cost contributions/);assert.doesNotMatch(html,/Selected cell cost terms|Selected route cell/);
});

test('pipeline scopes calculation edges to its chosen output and always exposes independent flag evidence',()=>{
  const ds=dataset(),session=createSession(ds,{selection}),snapshot=session.getSnapshot();
  const assessment=pipelineHTML(snapshot,'combined');
  assert.match(assessment,/Slope limit → Combined result/);
  assert.doesNotMatch(assessment,/Slope → Traversal cost|Flagged input fraction → Traversal cost/);
  const cost=pipelineHTML(snapshot,'traversal-cost');
  assert.match(cost,/Scaled values/);assert.match(cost,/Penalty if exceeded: \+8/);
  assert.doesNotMatch(assessment,/Scaled values|Penalty if exceeded/);
  const inspector=inspectorHTML(snapshot);assert.match(inspector,/Baseline[\s\S]*Scaled values[\s\S]*Exceedance penalties/);
  for(const edge of ['Slope → Traversal cost','Slope limit → Traversal cost','Height spread → Traversal cost','Height spread limit → Traversal cost'])assert.ok(cost.includes(edge));
  assert.doesNotMatch(cost,/Slope limit → Combined result|Flagged input fraction → Traversal cost/);
  for(const graph of [assessment,cost]){
    assert.match(graph,/pipeline-canvas" style="height:(108|126)px"/);
    assert.match(graph,/pipeline-evidence/);assert.match(graph,/data-layer="height-support"/);
    assert.match(graph,/Evidence/);assert.match(graph,/Inspect source flags/);
    assert.doesNotMatch(graph,/Heights → Flagged input fraction/);
  }
  const support=session.dispatch({type:'layer',layerId:'height-support'});
  const selectedSupport=pipelineHTML(support,'traversal-cost');
  assert.match(selectedSupport,/data-layer="height-support" aria-pressed="true"/);
  assert.deepEqual(support.record.immediateInputs.map(i=>i.node),['heights']);
  assert.equal(support.sources.length,25);
});

test('changing or removing quality changes evidence but leaves every cost raster, query term and A* result unchanged',()=>{
  const variants=[
    {...base},
    {...base,quality:{codes:base.heights.map(()=>14)}},
    dataset(),
    {...base,quality:{codes:base.heights.map(()=>3)}},
  ];
  const results=variants.map(ds=>{
    const fields=fieldsFor(ds,valuesFor(ds),limits),session=createSession(ds,{selection,limits}),snapshot=session.getSnapshot();
    return {ds,fields,snapshot,grid:createPlanningGrid(ds,fields),route:planRoute(ds,fields,{start:native,goal:{row:10,col:7}}),evidence:session.dispatch({type:'layer',layerId:'height-support'}).record};
  });
  const expected=results[0];
  for(const {ds,fields,snapshot,grid,route} of results){
    assert.deepEqual(fields['traversal-cost'].values,expected.fields['traversal-cost'].values);
    assert.deepEqual(grid.costs,expected.grid.costs);assert.deepEqual(route,expected.route);
    assert.equal(snapshot.record.value,expected.snapshot.record.value);assert.deepEqual(snapshot.record.terms,expected.snapshot.record.terms);
    assert.deepEqual(snapshot.record.parameters,{});assert.equal('policy' in snapshot,false);assert.equal('policy' in snapshot.record,false);
    assert.deepEqual(snapshot.record.immediateInputs.map(i=>i.node),['slope','roughness','slope-criterion','roughness-criterion']);
    const evaluation=evaluateLazy(ds,limits,snapshot.pipeline);
    for(let row=0;row<fields.slope.grid.H;row++)for(let col=0;col<fields.slope.grid.W;col++){
      const queryResult=query(evaluation,'traversal-cost',{row,col}),index=row*fields.slope.grid.W+col;
      assert.equal(queryResult.value,expected.grid.costs[index]);
      assert.deepEqual(evaluation.records['traversal-cost'][index].terms,expected.grid.terms(index));
    }
  }
  assert.equal(results[0].snapshot.record.quality,undefined);assert.equal(results[0].evidence.available,false);assert.equal(results[0].evidence.value,null);
  for(const [i,count] of [[1,0],[2,1],[3,25]]){
    assert.equal(results[i].snapshot.record.quality.suspicious,count);assert.equal(results[i].snapshot.record.quality.total,25);
    assert.equal(results[i].evidence.value,count/25);assert.equal(results[i].evidence.available,true);
  }
});

test('legacy flag preference options cannot restore a penalty or persist in exported state',()=>{
  const ds=dataset(),fields=fieldsFor(ds,valuesFor(ds),limits),legacy={policy:'prefer-fewer-flags',qualityWeight:1000},options={start:native,goal:{row:10,col:7}};
  assert.deepEqual(planRoute(ds,fields,{...options,...legacy}),planRoute(ds,fields,options));
  assert.deepEqual(traversalCostField(ds,fields,'prefer-fewer-flags'),fields['traversal-cost']);
  assert.throws(()=>createPlanningGrid(ds,fields,'prefer-fewer-flags'),/exclusions must be an array/);
  const session=createSession(ds,{selection,...legacy});assert.deepEqual(session.getSnapshot().record.terms,createSession(ds,{selection}).getSnapshot().record.terms);
  assert.throws(()=>session.dispatch({type:'policy',policy:'prefer-fewer-flags'}),/Unknown inspection action/);
  const model=createSupervisoryPlan(ds,fields,{...options,limits,...legacy});model.dispatch({type:'plan'});model.dispatch({type:'approve'});
  const before=model.exportPlan();assert.doesNotMatch(JSON.stringify(before),/policy|qualityWeight|qualityFraction/);
  assert.doesNotMatch(planControlsHTML(model.getSnapshot()),/Preference|prefer-fewer-flags|Flag preference/);
  assert.throws(()=>model.dispatch({type:'policy',policy:'prefer-fewer-flags'}),/Unknown planning action/);assert.deepEqual(model.exportPlan(),before);
});


test('the whole contribution table matches the selected total cell on the observed cost domain',()=>{
  const ds=dataset(),values=valuesFor(ds);
  try{
    for(const {id} of paletteOptions)for(const permissive of [true,false]){
      setPalette(id);
      const checks=permissive?{slopeDeg:90,roughness_m:100}:{slopeDeg:0,roughness_m:0};
      const fields=fieldsFor(ds,values,checks),snapshot=createSession(ds,{selection,limits:checks}).getSnapshot();
      const range=fields['traversal-cost'].range,originalRange=[...range];
      assert.ok(range[0]>=1);
      const html=inspectorHTML(snapshot,new Set(),{},range),colour=costHexColour(snapshot.record.value,range);
      assert.ok(html.includes(`style="background-color:${colour};color:${contrastColour(colour)}"`));
      assert.equal(pathDisplayColour(snapshot.record,'traversal-cost',range),colour);
      assert.equal([...html.matchAll(/class="cost-contribution"/g)].length,5);
      assert.doesNotMatch(html,/cost-share|class="cost-contribution"[^>]*style=/);
      assert.match(html,/data-input-layer="slope"/);assert.match(html,/data-input-layer="roughness-criterion"/);
      assert.doesNotMatch(html,/cost-group-label values|cost-group-label penalties/);
      assert.ok(mapLegendHTML(createSurfaceMap(ds,fields,'traversal-cost',false)).includes(`<span>${range[0].toFixed(2)}</span>`));
      const missing={...snapshot,record:{...snapshot.record,available:false,value:null,terms:{...snapshot.record.terms,slope:NaN}}};
      const missingHTML=inspectorHTML(missing,new Set(),{},range);
      assert.match(missingHTML,/class="cost-contributions cost-unavailable"/);
      assert.ok(missingHTML.includes('background-color:'+costHexColour(NaN,range)));
      assert.match(missingHTML,/<strong>— <span/);
      assert.deepEqual(range,originalRange);
    }
  }finally{setPalette('5');}
});
