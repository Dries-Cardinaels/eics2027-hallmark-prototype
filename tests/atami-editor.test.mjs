import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {availableSurfaces,loadTerrain} from '../editor/data.js';
import {initialViewState,earthRestartView,preferredSurface} from '../editor/view-state.js';
import {atamiScenarioHTML,sourceGapLabel} from '../editor/case-presentation.js';
import {createSession} from '../editor/session.js';
import {inspectorHTML,heightComparisonHTML,selectionKeyHTML} from '../editor/inspector.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {defaultPlanEndpoints} from '../editor/proposed-path.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {cellCenter,cellCoordinates,layerGrid} from '../editor/spatial.js';

test('Atami opens the incident-day DSM; explicit later-survey and gap links remain independent',async t=>{
  t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(new URL(url))));
  const surfaces=await availableSurfaces('atami');
  assert.equal(preferredSurface('atami',surfaces,null),'july3-dsm');
  assert.equal(preferredSurface('atami',surfaces,'ground'),'ground');
  assert.equal(preferredSurface('atami',surfaces,'missing'),'july3-dsm');
  assert.deepEqual(initialViewState(new URLSearchParams(),'atami'),earthRestartView('july3-dsm'));
  assert.equal(initialViewState(new URLSearchParams('surface=july3-dsm&gaps=0'),'atami').showLidarGaps,false);
  assert.equal(initialViewState(new URLSearchParams('surface=ground'),'atami').showLidarGaps,false);
  assert.equal(initialViewState(new URLSearchParams('surface=ground&gaps=1'),'atami').showLidarGaps,true);
  const dsm=await loadTerrain('atami','july3-dsm'),ground=await loadTerrain('atami','ground');
  assert.equal(sourceGapLabel(dsm),'DSM gaps');
  assert.equal(sourceGapLabel(ground),'lidar gaps');
  assert.deepEqual(earthRestartView('ground'),{layer:'terrain',branch:'slope',showLidarGaps:false});
});

test('road-start slope and roughness expose their own DSM samples and true missing heights',async t=>{
  t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(new URL(url))));
  const dataset=await loadTerrain('atami','july3-dsm');
  const road=dataset.proposalStart,point=cellCenter(layerGrid(dataset,{grid:'heights'}),road);
  const session=createSession(dataset,{selection:{layerId:'heights',cell:road}});
  assert.deepEqual(road,{row:15,col:42});
  assert.equal(session.getSnapshot().limits.slopeDeg,null);
  assert.equal(session.getSnapshot().limits.roughness_m,null);
  const values=Object.fromEntries(['slope','roughness','combined'].map(id=>[id,evaluateRaster(dataset,id)]));
  const fields={...values,...evaluateLimitRasters(dataset,values,session.getSnapshot().limits)};
  const model=createSupervisoryPlan(dataset,fields,{...defaultPlanEndpoints(dataset),branch:'slope',limits:session.getSnapshot().limits});
  const plan=model.dispatch({type:'plan'});
  assert.equal(plan.status,'Needs review');
  assert.equal(plan.datasetId,dataset.id);
  assert.equal(plan.route.proposal,undefined);
  assert.deepEqual(plan.route.vertices[0],road);
  const select=layerId=>session.dispatch({type:'path-select',pathId:plan.route.id,index:0,layerId,cell:cellCoordinates(layerGrid(dataset,{grid:'analysis'}),point)});
  const slope=select('slope'),slopeHTML=inspectorHTML(slope);
  assert.equal(slope.record.value.toFixed(2),'41.42');
  assert.equal(slope.sources.length,8);
  assert.match(slopeHTML,/41.42°/);
  assert.match(slopeHTML,/8 \/ 8 required heights present/);
  assert.match(slopeHTML,/DSM source samples/);
  assert.match(slopeHTML,/<th>DSM samples<\/th>/);
  assert.doesNotMatch(slopeHTML,/\d+ ground returns|display fill|interpolated for display/);
  assert.match(selectionKeyHTML(slope,true),/15, 42.*Path #1/);
  const roughness=select('roughness'),roughnessHTML=inspectorHTML(roughness);
  assert.deepEqual(roughness.point,slope.point);
  assert.equal(roughness.record.available,false);
  assert.equal(roughness.sources.length,25);
  assert.match(roughnessHTML,/23 \/ 25 required heights present/);
  assert.match(roughnessHTML,/class="result unavailable">Incomplete/);
  const missing=roughness.sources.filter(cell=>cell.height===null);
  assert.deepEqual(missing.map(({row,col})=>({row,col})),[{row:13,col:43},{row:13,col:44}]);
  for(const cell of missing){
    const source=session.dispatch({type:'input',layerId:'heights',cell});
    const html=inspectorHTML(source);
    assert.equal(source.record.available,false);
    assert.match(html,/Missing DSM height/);
    assert.match(html,/0 DSM source samples · missing analysis height/);
    assert.match(selectionKeyHTML(source,true),/Missing native height · 0 DSM source samples/);
    assert.deepEqual(session.dispatch({type:'back'}).point,point);
  }
  assert.deepEqual(model.getSnapshot(),plan,'tracing another branch does not replace the slope plan');
});

test('Atami source and same-location comparison show the correct dates in either direction',async t=>{
  t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(new URL(url))));
  for(const [surface,current,other] of [['july3-dsm','3 July 2021','5–6 July 2021'],['ground','5–6 July 2021','3 July 2021']]){
    const dataset=await loadTerrain('atami',surface);
    const snapshot=createSession(dataset,{selection:{layerId:'heights',cell:dataset.proposalStart}}).getSnapshot();
    const html=heightComparisonHTML(snapshot);
    assert.match(html,new RegExp(current+' · Current survey'));
    assert.match(html,new RegExp(other));
    assert.match(html,/3 July video surface/);
    assert.match(html,/5–6 July lidar ground/);
    assert.doesNotMatch(html,/Pre-event|30 May/);
    assert.deepEqual(snapshot.comparisonHeight.cell,dataset.proposalStart);
    const scenario=atamiScenarioHTML(dataset,{changed:false,atRoadStart:true});
    assert.match(scenario,new RegExp(current));
    assert.match(scenario,/Planning and review use the selected heightmap/);
    assert.match(scenario,/data-demo-branch="slope"/);
    assert.match(scenario,/data-demo-branch="roughness"/);
    assert.doesNotMatch(scenario,/data-demo-road|data-demo-restart|Proposed on|Reviewing 5/);
    assert.match(atamiScenarioHTML(dataset,{changed:true,atRoadStart:false}),/Return to road start/);
  }
});
