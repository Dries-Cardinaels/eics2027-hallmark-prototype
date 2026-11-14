import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetById} from '../src/fixtures/terrain.js';
import {createDatasetPipeline,createPipeline,evaluateLazy,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {createSession} from '../editor/session.js';
import {createSurfaceMap,sampleSurfaceMap,paintSurfaceMap} from '../editor/surface-map.js';
import {lidarGapCells} from '../editor/evidence-geometry.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {selectionKeyHTML,inspectorHTML} from '../editor/inspector.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {pathDisplayRecord,pathDisplayColour} from '../editor/path-evidence.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {withTraversalCost,traversalCostField} from '../editor/traversal-cost.js';
import {initialViewState,earthRestartView} from '../editor/view-state.js';
import {palette} from '../editor/palette.js';

function isolatedGap(){
  const base=datasetById('reference'),heights=[...base.heights];heights[8*base.W+8]=NaN;
  return {...base,caseId:'earth',res:1,heights,origins:heights.map(h=>Number.isFinite(h)?'observed':'absent'),groundCounts:heights.map(h=>Number.isFinite(h)?3:0)};
}
function fieldsFor(ds){
  const values=Object.fromEntries(['heights','slope','roughness','combined'].map(node=>[node,evaluateRaster(ds,node)]));
  const fields={...values,...evaluateLimitRasters(ds,values)};
  return {...fields,'traversal-cost':traversalCostField(ds,fields)};
}
const center={row:8,col:8},adjacent={row:8,col:9};

test('Atami starts and restarts in Heights with the slope branch and DSM gaps on; ground links retain gaps off',()=>{
  assert.deepEqual(initialViewState(new URLSearchParams(),'atami'),{layer:'terrain',branch:'slope',showLidarGaps:true});
  assert.equal(initialViewState(new URLSearchParams('surface=ground'),'earth').showLidarGaps,false);
  assert.equal(earthRestartView('ground').showLidarGaps,false);
  assert.equal(initialViewState(new URLSearchParams('surface=july3-dsm&gaps=0'),'earth').showLidarGaps,false);
  assert.deepEqual(earthRestartView('july3-dsm'),initialViewState(new URLSearchParams(),'atami'));
  assert.deepEqual(earthRestartView(),initialViewState(new URLSearchParams(),'earth'));
  for(const map of ['terrain','slope','roughness','assessment','traversal-cost']){
    assert.deepEqual(initialViewState(new URLSearchParams({map,gaps:'1'}),'earth'),{layer:map,branch:'slope',showLidarGaps:true});
    assert.equal(initialViewState(new URLSearchParams({map,branch:'roughness'}),'earth').branch,'roughness');
  }
  assert.equal(initialViewState(new URLSearchParams('map=slope&mode=limits&branch=heights&gaps=1'),'earth').layer,'slope-criterion');
  assert.equal(initialViewState(new URLSearchParams('branch=heights'),'earth').branch,'heights');
  assert.deepEqual(initialViewState(new URLSearchParams(),'moon'),{layer:'assessment',branch:'combined',showLidarGaps:false});
  assert.equal(initialViewState(new URLSearchParams('map=roughness'),'moon').branch,'roughness');
});

test('every Earth map marks exactly the results with missing native heights in its declared source union',()=>{
  const ds=isolatedGap(),fields=fieldsFor(ds),pipeline=withTraversalCost(createDatasetPipeline(ds)),evaluation=evaluateLazy(ds,undefined,pipeline);
  for(const layer of ['terrain','slope','roughness','slope-criterion','roughness-criterion','assessment','traversal-cost']){
    const map=createSurfaceMap(ds,fields,layer,{gaps:true},undefined,pipeline),markers=new Set(lidarGapCells(map).map(c=>c.index));
    let expectedCount=0;
    for(let row=0;row<map.grid.H;row++)for(let col=0;col<map.grid.W;col++){
      const native={row:row+map.offset.row,col:col+map.offset.col},record=query(evaluation,map.node,{row,col});
      const missing=record.sourceCells.filter(c=>c.height===null).length;
      assert.equal(sampleSurfaceMap(map,native).missingHeights,missing);
      assert.equal(markers.has(native.row*ds.W+native.col),missing>0);
      expectedCount+=Number(missing>0);
    }
    assert.equal(markers.size,expectedCount);
    const atCentre=sampleSurfaceMap(map,center);
    assert.equal(atCentre.missingHeights,['slope','slope-criterion'].includes(layer)?0:1);
    assert.equal(sampleSurfaceMap(map,adjacent).missingHeights,layer==='terrain'?0:1);
    if(layer!=='terrain')assert.equal(sampleSurfaceMap(map,{row:0,col:0}).missingHeights,null,'crop margin is outside the result, not a native gap');
    const legend=mapLegendHTML(map);
    assert.match(legend,layer==='terrain'?/Missing native height · 0 ground returns/:/Uses missing native heights/);
    const off=createSurfaceMap(ds,fields,layer,{gaps:false});
    assert.deepEqual(lidarGapCells(off),[]);
    assert.doesNotMatch(mapLegendHTML(off),/ground-gap-key|Uses missing native heights/);
    assert.equal(off.field,map.field);
  }
});

test('gap evidence respects a conservative declared footprint even when a computation can return a value',()=>{
  const ds=isolatedGap(),base=createDatasetPipeline(ds),missing=8*ds.W+8;
  const operation={...base.byId.slope,footprint:()=>({heights:[0,missing]}),acceptsUnavailable:true,compute:({heights})=>({value:heights[0]})};
  const pipeline=createPipeline([base.byId.heights,operation]),field=evaluateRaster(ds,'slope',pipeline);
  const map=createSurfaceMap(ds,{slope:field},'slope',{gaps:true},undefined,pipeline);
  assert.ok(Number.isFinite(sampleSurfaceMap(map,center).value));
  assert.equal(sampleSurfaceMap(map,center).missingHeights,1);
  assert.equal(lidarGapCells(map).length,map.grid.W*map.grid.H);
});

test('route gaps follow the map branch while the planning branch, approval and route stay unchanged',()=>{
  const ds=isolatedGap(),fields=fieldsFor(ds),model=createSupervisoryPlan(ds,fields,{start:{row:4,col:4},goal:{row:5,col:4},branch:'slope'});
  model.dispatch({type:'plan'});model.dispatch({type:'approve'});
  const plan=model.getSnapshot(),approved=model.exportPlan(),path=createProposedPath(ds,fields,[center,adjacent],null,{branch:'slope',active:true}),original=structuredClone(path);
  for(const layer of ['terrain','slope','slope-criterion','roughness','roughness-criterion','assessment','traversal-cost']){
    const map=createSurfaceMap(ds,fields,layer,{gaps:true});
    for(const cell of path.cells)assert.equal(pathDisplayRecord(cell,layer).missingHeights,sampleSurfaceMap(map,cell).missingHeights);
    const html=proposedPathHTML(path,null,{planning:plan,layer,showLidarGaps:true});
    const rows=[...html.matchAll(/data-path-row="lidar-gaps" class="([^"]+)">([^<]+)</g)];
    assert.equal(rows.length,path.cells.length);
    for(const [index,row] of rows.entries())assert.equal(row[1]==='lidar-gap-affected',sampleSurfaceMap(map,path.cells[index]).missingHeights>0);
    assert.match(html,/data-planning-branch="slope"/);
    const off=proposedPathHTML(path,null,{planning:plan,layer,showLidarGaps:false});
    assert.doesNotMatch(off,/data-path-row="lidar-gaps"|lidar-gap-affected/);
    assert.match(proposedPathHTML(path,null,{layer,showLidarGaps:true}),/data-path-row="lidar-gaps"/);
  }
  assert.equal(pathDisplayColour(path.cells[0].height,'terrain'),palette.unavailable,'missing native route height remains unavailable with gaps off');
  assert.deepEqual(model.exportPlan(),approved);assert.deepEqual(path,original);
});

test('hiding gap emphasis preserves missing source values and tracing disclosure',()=>{
  const ds=isolatedGap(),fields=fieldsFor(ds),original=structuredClone({heights:ds.heights,counts:ds.groundCounts,fields});
  for(const layerId of ['heights','slope','roughness','combined','traversal-cost']){
    const snapshot=createSession(ds,{selection:{layerId,cell:layerId==='heights'?center:{row:6,col:6}}}).getSnapshot();
    const html=inspectorHTML(snapshot,new Set(['inputs','sources']),{gaps:false});
    assert.match(html,/Missing ground height|Missing<\/td>/);
    assert.match(html,/display only|display fill/);
    if(layerId==='slope'){
      assert.ok(snapshot.record.available);
      assert.doesNotMatch(selectionKeyHTML(snapshot,false,{gaps:true}),/ground-gap-key/);
      assert.doesNotMatch(selectionKeyHTML(snapshot,true,{gaps:false}),/excluded/);
    }else{
      assert.doesNotMatch(selectionKeyHTML(snapshot,false,{gaps:false}),/ground-gap-key/);
      assert.match(selectionKeyHTML(snapshot,true,{gaps:false}),/missing declared height input|Missing native height/);
    }
  }
  const map=createSurfaceMap(ds,fields,'slope',{gaps:false}),on=createSurfaceMap(ds,fields,'slope',{gaps:true});
  assert.notDeepEqual(paintSurfaceMap(map).pixels,paintSurfaceMap(on).pixels);
  assert.match(mapLegendHTML(map,true),/Missing traced height/);
  assert.deepEqual({heights:ds.heights,counts:ds.groundCounts,fields},original);
});

test('the lidar display switch has no effect on lunar maps, legends, traces or routes',()=>{
  const ds=datasetById('missing'),fields=fieldsFor(ds),path=createProposedPath(ds,fields,[center,adjacent]);
  for(const layer of ['slope','roughness','assessment']){
    const off=createSurfaceMap(ds,fields,layer,{gaps:false}),on=createSurfaceMap(ds,fields,layer,{gaps:true});
    assert.equal(on.showLidarGaps,false);assert.equal(on.gapEvidence,null);
    assert.deepEqual(paintSurfaceMap(on),paintSurfaceMap(off));
    assert.equal(mapLegendHTML(on,true),mapLegendHTML(off,true));
    assert.equal(proposedPathHTML(path,null,{layer,showLidarGaps:true}),proposedPathHTML(path,null,{layer,showLidarGaps:false}));
  }
});
