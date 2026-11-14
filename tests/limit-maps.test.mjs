import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters,LIMIT_STATE} from '../src/core/limit-rasters.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {createSurfaceMap,sampleSurfaceMap,paintSurfaceMap,mapNode,mapStage} from '../editor/surface-map.js';
import {createSession} from '../editor/session.js';
import {inspectorHTML,comparisonText} from '../editor/inspector.js';
import {mapLegendHTML} from '../editor/map-legend.js';

const fieldsFor=ds=>Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)]));
const stateOf=q=>{
 const outcomes=q.outcomes?Object.values(q.outcomes):[q.available?q.outcome:'unavailable'];
 return outcomes.includes('exceeded')?1:outcomes.includes('unavailable')?2:0;
};

for(const id of ['reference','missing','undocumented'])test(`limit maps match every criterion and combined query: ${id}`,()=>{
 const base=datasetById(id),ds={...base,quality:{codes:base.heights.map((_,i)=>i%5===0?3:14)}},fields=fieldsFor(ds);
 for(const limits of [{slopeDeg:15,roughness_m:.15},{slopeDeg:0,roughness_m:0},{slopeDeg:90,roughness_m:100}]){
  const maps=evaluateLimitRasters(ds,fields,limits),ev=evaluate(ds,limits);
  for(const node of ['slope-criterion','roughness-criterion','combined']){
   const field=maps[node],states=[0,0,0];let incomplete=0;
   for(let i=0;i<field.states.length;i++){
    const q=query(ev,node,i),state=stateOf(q);states[state]++;
    const missing=node==='combined'?q.category==='incomplete':!q.available;if(missing)incomplete++;
    assert.equal(field.states[i],state);assert.equal(field.incomplete[i],Number(missing));
    assert.equal(field.quality.suspicious[i],q.quality.suspicious);assert.equal(field.quality.total[i],q.sourceCells.length);
   }
   assert.deepEqual([field.stats.within,field.stats.exceeded,field.stats.unavailable],states);assert.equal(field.stats.incomplete,incomplete);
  }
 }
});

test('values exactly equal to either limit remain within it',()=>{
 const ds=datasetById('reference'),fields=fieldsFor(ds),i=7*fields.slope.grid.W+3;
 const maps=evaluateLimitRasters(ds,fields,{slopeDeg:fields.slope.values[i],roughness_m:fields.roughness.values[i]});
 assert.equal(maps.combined.states[i],LIMIT_STATE.within);assert.equal(maps.combined.incomplete[i],0);
});

test('a missing branch cannot hide a known exceeded branch',()=>{
 const ds=datasetById('missing'),fields=fieldsFor(ds),maps=evaluateLimitRasters(ds,fields,{slopeDeg:0,roughness_m:0});
 const i=fields.roughness.values.findIndex((v,i)=>!Number.isFinite(v)&&fields.slope.values[i]>0);
 assert.ok(i>=0);assert.equal(maps.combined.states[i],LIMIT_STATE.exceeded);assert.equal(maps.combined.incomplete[i],1);
});

test('limit edits change map outcomes without altering values or source quality',()=>{
 const ds=datasetById('reference'),fields=fieldsFor(ds),a=evaluateLimitRasters(ds,fields,{slopeDeg:0,roughness_m:0}),b=evaluateLimitRasters(ds,fields,{slopeDeg:90,roughness_m:100});
 assert.notDeepEqual(a.combined.states,b.combined.states);
 for(const node of ['slope-criterion','roughness-criterion','combined']){assert.equal(a[node].values,b[node].values);assert.equal(a[node].quality,b[node].quality);}
 const before=createSurfaceMap(ds,{...fields,...a},'assessment',false),after=createSurfaceMap(ds,{...fields,...b},'assessment',false);
 assert.notDeepEqual(paintSurfaceMap(before).pixels,paintSurfaceMap(after).pixels);
});

test('map modes select the actual producing stage and retain native coordinates',()=>{
 const ds=datasetById('reference'),base=fieldsFor(ds),fields={...base,...evaluateLimitRasters(ds,base)};
 assert.equal(mapNode('assessment'),'combined');assert.equal(mapNode('slope','limits'),'slope-criterion');assert.equal(mapNode('slope','values'),'slope');
 const map=createSurfaceMap(ds,fields,'slope',false,'limits'),sample=sampleSurfaceMap(map,{row:9,col:5}),q=query(evaluate(ds),'slope-criterion',{row:7,col:3});
 assert.equal(sample.value,q.value);assert.equal(sample.state,stateOf(q));assert.deepEqual(map.offset,{row:2,col:2});
 assert.equal(sampleSurfaceMap(map,{row:0,col:0}).outside,true);
});

test('spatial input controls are exactly the heights declared by the selected operation',()=>{
 const ds=datasetById('reference');
 for(const layerId of ['slope','roughness']){
  const snapshot=createSession(ds,{selection:{layerId,cell:{row:7,col:3}}}).getSnapshot(),html=inspectorHTML(snapshot);
  const buttons=[...html.matchAll(/data-hover-source="(\d+)"/g)].map(m=>Number(m[1])).sort((a,b)=>a-b);
  assert.deepEqual(buttons,snapshot.record.sourceCells.map(c=>c.index));
 }
});

test('quantity and limit stages remain explicit while older mode links still resolve',()=>{
 for(const quantity of ['slope','roughness']){
  assert.equal(mapStage(quantity,'values'),quantity);
  assert.equal(mapStage(quantity,'limits'),`${quantity}-criterion`);
  assert.equal(mapNode(`${quantity}-criterion`),`${quantity}-criterion`);
  assert.equal(mapStage(`${quantity}-criterion`,'limits'),`${quantity}-criterion`);
 }
});

test('limit inspection leads with an outcome while the value stage remains numerical',()=>{
 const ds=datasetById('reference'),limits={slopeDeg:9.5,roughness_m:.85};
 const base=fieldsFor(ds),fields={...base,...evaluateLimitRasters(ds,base,limits)};
 for(const quantity of ['slope','roughness']){
  const value=createSession(ds,{limits,selection:{layerId:quantity,cell:{row:7,col:3}}}).getSnapshot();
  const check=createSession(ds,{limits,selection:{layerId:`${quantity}-criterion`,cell:{row:7,col:3}}}).getSnapshot();
  const html=inspectorHTML(check),primary=html.match(/class="result criterion-result [^"]+">([^<]+)</)[1];
  assert.equal(primary,check.record.outcome==='exceeded'?'Exceeded':'Within limit');
  assert.ok(!inspectorHTML(value).includes('criterion-result'));
  assert.equal(check.record.value,value.record.value);assert.deepEqual(check.sources,value.sources);
  const map=createSurfaceMap(ds,fields,`${quantity}-criterion`,false);
  assert.ok(mapLegendHTML(map).includes(`${quantity==='slope'?'Slope':'Height spread'} ≤ ${check.record.limit}`));
 }
});

test('rounded comparisons do not display equal numbers as a strict exceedance',()=>{
 for(const [value,limit] of [[14.99246742611901,14.99],[.0000001,0]]){
  const text=comparisonText(value,limit,'°','exceeded'),numbers=text.match(/(?:\d+(?:\.\d+)?(?:e[-+]?\d+)?)/g).map(Number);
  assert.ok(numbers[0]>numbers[1]);
 }
});

test('unset Earth scenario limits leave values inspectable and independent checks unclassified',()=>{
 const base=datasetById('reference');
 const ds={...base,caseId:'earth',groundCounts:base.heights.map(h=>Number.isFinite(h)?1:0)};
 const values=fieldsFor(ds),cell={row:7,col:3},session=createSession(ds,{selection:{layerId:'slope',cell}});
 const slope=session.getSnapshot();
 assert.equal(slope.limits.slopeDeg,null);
 assert.ok(Number.isFinite(slope.record.value));
 const unset=session.dispatch({type:'layer',layerId:'slope-criterion'});
 assert.equal(unset.record.available,false);
 assert.equal(unset.record.reason,'No limit configured');
 const maps=evaluateLimitRasters(ds,values,unset.limits);
 assert.ok(maps['slope-criterion'].states.every(s=>s===LIMIT_STATE.unavailable));
 assert.deepEqual(maps.combined.unsetLimits,['slope','roughness']);
 const set=session.dispatch({type:'limits',limits:{slopeDeg:0}});
 assert.equal(set.record.outcome,'exceeded');
 const partial=evaluateLimitRasters(ds,values,set.limits);
 assert.equal(partial.combined.states[cell.row*partial.combined.grid.W+cell.col],LIMIT_STATE.exceeded);
 assert.deepEqual(partial.combined.unsetLimits,['roughness']);
 assert.equal(session.dispatch({type:'limits',limits:{slopeDeg:null}}).record.available,false);
});
