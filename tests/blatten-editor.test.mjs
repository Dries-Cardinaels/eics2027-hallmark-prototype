import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainCaseId,isEarthCase,scenarioLimitsText,blattenScenarioHTML} from '../editor/case-presentation.js';
import {initialViewState,preferredSurface} from '../editor/view-state.js';
import {defaultPlanEndpoints,createProposedPath,proposedPathHTML,proposedPathSummary} from '../editor/proposed-path.js';
import {createSession} from '../editor/session.js';
import {layerGrid,cellCoordinates,cellCenter} from '../editor/spatial.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {createPlanningGrid} from '../editor/planner.js';
import {pipelineHTML,inspectorHTML,heightComparisonHTML,selectionKeyHTML} from '../editor/inspector.js';
import {planControlsHTML} from '../editor/plan-controls.js';
import {createSurfaceMap} from '../editor/surface-map.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {displayMetres} from '../editor/display-units.js';

const dataset={
  id:'blatten:ground',caseId:'blatten',surface:'ground',surveyPhase:'pre-event',
  W:12,H:12,res:2,grid:{east:2600000,north:1140000},focus:[5,6],
  heights:Array.from({length:144},(_,i)=>1500+Math.floor(i/12)*.3+(i%12)*.2),
  origins:Array(144).fill('undocumented'),
  proposalStart:{row:3,col:3},proposalGoal:{row:8,col:8},
  source:{product:'Baseline product',date:'2024',url:'https://example.com/baseline'},
};
const scenarioLimits=session=>{const {slopeDeg,roughness_m}=session.getSnapshot().limits;return {slopeDeg,roughness_m};};

test('Blatten deep links retain their case, view, branch, and an explicitly selected available survey',()=>{
  assert.equal(terrainCaseId('blatten'),'blatten');
  assert.equal(terrainCaseId('earth'),'earth');
  assert.equal(terrainCaseId('moon'),'moon');
  assert.equal(terrainCaseId('unknown'),'moon');
  assert.equal(isEarthCase(dataset),true);
  assert.deepEqual(initialViewState(new URLSearchParams(),'blatten'),{layer:'terrain',branch:'slope',showLidarGaps:false});
  assert.deepEqual(initialViewState(new URLSearchParams('map=roughness&branch=roughness&gaps=0'),'blatten'),{layer:'roughness',branch:'roughness',showLidarGaps:false});
  const surfaces=[{id:'ground',label:'Pre-event baseline'},{id:'post-event',label:'Post-event terrain'}];
  assert.equal(preferredSurface('blatten',surfaces,null),'post-event');
  assert.equal(preferredSurface('blatten',surfaces,'ground'),'ground');
  assert.equal(preferredSurface('blatten',surfaces,'post-event'),'post-event');
  assert.equal(preferredSurface('blatten',surfaces.slice(0,1),'post-event'),'ground');
  assert.equal(preferredSurface('earth',surfaces,null),'ground');
  assert.deepEqual(initialViewState(new URLSearchParams(),'moon'),{layer:'assessment',branch:'combined',showLidarGaps:false});
});

test('Blatten source summary distinguishes baseline terrain from the selected post-event product',()=>{
  const baseline=blattenScenarioHTML(dataset);
  assert.match(baseline,/Simulated rover reconnaissance/);
  assert.match(baseline,/near the Tennmatten search area/);
  assert.match(baseline,/2 June 2025<\/a>; no clearance boundary is supplied/);
  assert.match(baseline,/href="https:\/\/www.policevalais.ch\//);
  assert.match(baseline,/Pre-event baseline/);
  assert.match(baseline,/Baseline product · 2024/);
  assert.match(baseline,/predates the collapse/);
  const later=blattenScenarioHTML({...dataset,surface:'post-event',surveyPhase:'post-event',source:{product:'Post-event product',date:'2025-06-02'}});
  assert.match(later,/Post-event terrain/);
  assert.match(later,/Post-event product · 2025-06-02/);
  assert.doesNotMatch(later,/Baseline product|predates|Atami|Moon|lidar|returns|gap/i);
  assert.doesNotMatch(scenarioLimitsText(dataset),/Atami|Moon/);
  assert.equal(blattenScenarioHTML({...dataset,caseId:'earth'}),'');
});

test('post-event orthophoto and survey diagnostics never become lidar support or per-cell uncertainty',()=>{
  const event={...dataset,id:'blatten:post-event',surface:'post-event',surveyPhase:'post-event',groundRGB:new Uint8Array(dataset.W*dataset.H*3),production:{method:'Photogrammetric DSM',scope:'Retrospective crop'},source:{product:'Post-event DSM',date:'2025-06-02',surveyControl:'18 ground controls',positionalResidual:'1.6 m mean positional residual; survey-level, not per-cell uncertainty'}};
  const snapshot=createSession(event).getSnapshot();
  const html=inspectorHTML(snapshot,new Set(['source']));
  assert.match(html,/Photogrammetric DSM/);
  assert.match(html,/18 ground controls/);
  assert.match(html,/Survey-level positional residual/);
  assert.match(html,/1.6 m mean positional residual; survey-level, not per-cell uncertainty/);
  assert.match(html,/Uncertainty<\/dt><dd>Not estimated/);
  assert.doesNotMatch(html,/lidar|ground returns|fill the gaps|Atami|Moon|LROC|LOLA/i);
  const legend=mapLegendHTML(createSurfaceMap(event,{},'terrain',{}));
  assert.match(legend,/Heights · survey orthophoto/);
  assert.match(legend,/Source: FOEN, swisstopo/);
  assert.doesNotMatch(legend,/lidar|interpolated|gaps/i);
});

test('height comparison floors the same projected point into the companion native grid and shows both dates',()=>{
  const companion={label:'30 May surface',date:'30 May 2025',grid:{W:6,H:6,res:4,east:2600001,north:1140001},heights:Array.from({length:36},(_,i)=>1600+i)};
  const snapshot=createSession({...dataset,comparisonSurface:companion},{selection:{layerId:'heights',cell:{row:5,col:6}}}).getSnapshot();
  const html=heightComparisonHTML(snapshot,new Set(['height-comparison']));
  assert.match(html,/id="height-comparison" class="height-comparison" open/);
  assert.match(html,/Pre-event ground/);
  assert.match(html,/2024 · Current survey/);
  assert.match(html,/30 May surface/);
  assert.match(html,/30 May 2025/);
  assert.match(html,/1621.00 m/);
  assert.match(html,/different surface models with separate alignment/);
  assert.match(html,/does not estimate deposit thickness/);
  const distant={...dataset,comparisonSurface:{...companion,grid:{...companion.grid,east:2700000}}};
  const outside=heightComparisonHTML(createSession(distant,{selection:snapshot.selection}).getSnapshot());
  assert.match(outside,/Outside crop/);
  assert.doesNotMatch(outside,/1621.00 m/);
});

test('nominal metric labels round affine spacing while grid calculations retain its exact value',()=>{
  const res=1.000040000000072,event={...dataset,res,surface:'post-event',surveyPhase:'post-event',production:{method:'Photogrammetric reconstruction',scope:'Native DSM crop'}};
  const session=createSession(event,{selection:{layerId:'heights',cell:{row:5,col:6}}}),snapshot=session.getSnapshot();
  assert.equal(displayMetres(res),'1');
  assert.match(proposedPathSummary({cells:Array(3),res}),/3 cells · 1 × 1 m/);
  assert.match(selectionKeyHTML(snapshot,false),/1 × 1 m/);
  assert.doesNotMatch(inspectorHTML(snapshot),/1.000040/);
  assert.equal(snapshot.record.method,'Photogrammetric reconstruction');
  assert.match(snapshot.record.calculation,/per-cell reconstruction ancestry is not supplied/);
  const values=Object.fromEntries(['slope','roughness','combined'].map(id=>[id,evaluateRaster(event,id)]));
  const fields={...values,...evaluateLimitRasters(event,values,snapshot.limits)};
  assert.equal(createPlanningGrid(event,fields,[],{branch:'slope'}).res,res);
  assert.equal(event.res,res);
});

test('Blatten uses native scenario endpoints, unset limits, and slope A* through exclusion, replan, and approval',()=>{
  const {start,goal}=defaultPlanEndpoints(dataset);
  assert.deepEqual({start,goal},{start:{row:3,col:3},goal:{row:8,col:8}});
  const session=createSession(dataset,{selection:{layerId:'heights',cell:{row:5,col:6}}});
  assert.deepEqual(scenarioLimits(session),{slopeDeg:null,roughness_m:null});
  const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(dataset,id)]));
  const fields={...values,...evaluateLimitRasters(dataset,values,session.getSnapshot().limits)};
  const branch=initialViewState(new URLSearchParams(),'blatten').branch;
  const model=createSupervisoryPlan(dataset,fields,{start,goal,branch,limits:session.getSnapshot().limits});
  const first=model.dispatch({type:'plan'});
  assert.equal(first.status,'Needs review');
  assert.equal(first.branch,'slope');
  assert.ok(Number.isFinite(first.route.cost));
  assert.equal(first.route.breakdown.roughness,0);
  assert.equal(first.route.breakdown.exceeded,0);
  assert.equal(model.dispatch({type:'approve'}).approval.routeId,first.route.id);
  const excluded=first.route.vertices[5];
  const changed=model.dispatch({type:'exclude',cell:excluded});
  assert.equal(changed.status,'Draft');
  assert.equal(changed.approval,null);
  assert.throws(()=>model.dispatch({type:'approve'}),/Plan a current route/);
  const revised=model.dispatch({type:'plan'});
  assert.ok(revised.route.vertices.every(c=>c.row!==excluded.row||c.col!==excluded.col));
  assert.equal(model.dispatch({type:'approve'}).approval.routeId,revised.route.id);
  const grid=createPlanningGrid(dataset,fields,[],{branch});
  const path=createProposedPath(dataset,fields,revised.route.vertices,revised.route,{branch,grid,active:true});
  assert.match(proposedPathHTML(path,null,{planning:revised,layer:'terrain'}),/data-path-cell=/);
  assert.match(planControlsHTML(revised),/A\* · four neighbours/);
  assert.doesNotMatch(pipelineHTML(session.getSnapshot()),/pipeline-evidence/);
  assert.doesNotMatch(inspectorHTML(session.getSnapshot()),/Atami|Moon|LOLA|ground returns/);
});

test('Blatten spatial tracing retains native location and separate scenario limit edits',()=>{
  const cell={row:5,col:6},session=createSession(dataset,{selection:{layerId:'heights',cell}});
  const point=cellCenter(layerGrid(dataset,{grid:'heights'}),cell);
  const slope=session.dispatch({type:'layer',layerId:'slope'});
  assert.deepEqual(slope.point,point);
  assert.deepEqual(slope.heightCell,cell);
  assert.equal(slope.sources.length,8);
  assert.ok(slope.sources.every(c=>!('groundCount' in c)&&!c.quality));
  const selected=slope.inputs[0].cells[0].cell;
  const input=session.dispatch({type:'input',layerId:'heights',cell:selected});
  assert.deepEqual(input.selection.cell,selected);
  assert.deepEqual(session.dispatch({type:'back'}).point,point);
  const roughness=session.dispatch({type:'layer',layerId:'roughness'});
  assert.equal(roughness.sources.length,25);
  assert.deepEqual(cellCoordinates(layerGrid(dataset,{grid:'heights'}),roughness.point),cell);
  session.dispatch({type:'limits',limits:{slopeDeg:12,roughness_m:.2}});
  assert.deepEqual(scenarioLimits(createSession(dataset)),{slopeDeg:null,roughness_m:null});
  assert.deepEqual(scenarioLimits(createSession(dataset,{limits:{slopeDeg:9}})),{slopeDeg:9,roughness_m:null});
});
