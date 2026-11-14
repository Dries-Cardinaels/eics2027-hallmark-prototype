import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareLolaEditorData} from '../tools/prepare-lola-editor-data.mjs';
import {loadTerrain,availableSurfaces} from '../editor/data.js';
import {createSession} from '../editor/session.js';
import {terrainCaseId,lunarScenarioHTML,scenarioLimitsText} from '../editor/case-presentation.js';
import {initialViewState,preferredSurface} from '../editor/view-state.js';
import {numericEvidenceFields,NUMERIC_EVIDENCE} from '../editor/source-evidence.js';
import {createSurfaceMap,sampleSurfaceMap,qualityCategories} from '../editor/surface-map.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {inspectorHTML,selectionKeyHTML} from '../editor/inspector.js';
import {layerGrid,cellCenter} from '../editor/spatial.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {createPlanningGrid,planRoute} from '../editor/planner.js';
import {traversalCostField} from '../editor/traversal-cost.js';
import {createProposedPath} from '../editor/proposed-path.js';
import {tracePresentation} from '../editor/evidence-geometry.js';
import {pathAssessmentScope,pathDisplayColour} from '../editor/path-evidence.js';
import {nativeSampleCounts} from '../src/core/sample-counts.js';

const fixture=new URL('../fixtures/lola/connecting-ridge/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',fixture)));
const sample=JSON.parse(readFileSync(new URL('sample.json',fixture))),hash=b=>createHash('sha256').update(b).digest('hex');
let dataset,fields;
async function load(t){
 t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(new URL(url))));
 dataset??=await loadTerrain('connecting-ridge','ground');
 if(!fields){const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(dataset,id)]));fields={...values,...evaluateLimitRasters(dataset,values),...numericEvidenceFields(dataset)};fields['traversal-cost']=traversalCostField(dataset,fields);}
 return dataset;
}

test('both lunar cases lead the selector and missing or invalid case IDs open Nassau',()=>{
 for(const id of [undefined,null,'atami','garbage'])assert.equal(terrainCaseId(id),'moon');
 for(const id of ['moon','connecting-ridge','earth','blatten'])assert.equal(terrainCaseId(id),id);
 const html=readFileSync(new URL('../editor/index.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('value="moon"')<html.indexOf('value="connecting-ridge"'));
 assert.ok(html.indexOf('label="Lunar cases"')<html.indexOf('label="Earth examples"'));assert.doesNotMatch(html,/value="atami"/);
 assert.deepEqual(initialViewState(new URLSearchParams(),'moon'),{layer:'assessment',branch:'combined',showLidarGaps:false});
 assert.equal(initialViewState(new URLSearchParams('map=height-rms'),'connecting-ridge').branch,'slope');
});

test('LOLA offline preparation preserves all native float32 arrays and their source-grid registration',()=>{
 const out=mkdtempSync(join(tmpdir(),'hallmark-lola-'));
 try{
  const entry=prepareLolaEditorData(out);assert.deepEqual(prepareLolaEditorData(out),entry);assert.equal(entry.W,256);assert.equal(entry.res,5);
  for(const [key,file] of [['height',entry.files.ground],['heightRms',entry.heightRMSFile],['counts',entry.lolaCountsFile]]){
   const bytes=readFileSync(join(out,file));assert.equal(hash(bytes),manifest.layers[key].cropSha256);
   const values=Array.from(new Float32Array(bytes.buffer,bytes.byteOffset,bytes.length/4));assert.deepEqual(values,sample[key==='height'?'heights':key]);
   assert.deepEqual(manifest.layers[key].sourceTransform,[5,0,-19000,0,-5,-4000]);
  }
  assert.deepEqual(cellCenter(layerGrid(entry,{grid:'heights'}),{row:128,col:128}),{east:-11857.5,north:-12142.5});
  assert.equal(entry.grid.east,manifest.layers.height.sourceTransform[2]+manifest.window.col_off*5);assert.equal(entry.grid.north,manifest.layers.height.sourceTransform[5]-manifest.window.row_off*5);
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('LOLA loading preserves counts separately from quality and native missing-height evidence',async t=>{
 const ds=await load(t);assert.deepEqual(await availableSurfaces('connecting-ridge'),[{id:'ground',label:ds.date}]);
 assert.equal(preferredSurface('connecting-ridge',[{id:'ground'}],'bad'),'ground');
 assert.equal(ds.quality,undefined);assert.equal(nativeSampleCounts(ds),undefined);
 const source=createSession(ds,{selection:{layerId:'heights',cell:{row:0,col:0}}}).getSnapshot();
 assert.equal(source.record.available,true);assert.equal(source.record.value,1671.8094482421875);assert.equal(source.sources[0].heightRMS_m,.6303908228874207);assert.equal(source.sources[0].lolaSpots,0);
 assert.doesNotMatch(inspectorHTML(source),/Output uncertainty|Input height RMS|Quality not supplied|Input flags/);
 assert.equal(source.heightHere.lolaSpots,0);assert.equal(source.record.inputHeightRMS.known,1);assert.ok(ds.origins.every(v=>v==='undocumented'));
});

test('RMS evidence summaries follow exact Horn, roughness and cost source support, excluding the Horn center',async t=>{
 const ds=await load(t),session=createSession(ds,{selection:{layerId:'slope',cell:{row:126,col:126}}});
 for(const [id,count] of [['slope',8],['roughness',25],['combined',25],['traversal-cost',25]]){
  const snap=session.dispatch({type:'select',layerId:id,cell:{row:126,col:126}}),rms=snap.sources.map(c=>ds.heightRMS[c.index]);
  assert.equal(snap.sources.length,count);assert.equal(snap.record.inputHeightRMS.total,count);assert.equal(snap.record.inputHeightRMS.known,count);
  assert.equal(snap.record.inputHeightRMS.min,Math.min(...rms));assert.equal(snap.record.inputHeightRMS.max,Math.max(...rms));
  assert.equal(snap.sources.some(c=>c.index===32896),id!=='slope');assert.equal(snap.heightHere.heightRMS_m,.4600980877876282);
 }
});

test('unknown supplier evidence differs from zero and survives an absent height independently',async t=>{
 const base=await load(t),heightRMS=[...base.heightRMS],lolaCounts=[...base.lolaCounts],heights=[...base.heights];
 heightRMS[0]=0;heightRMS[1]=NaN;lolaCounts[0]=0;lolaCounts[1]=NaN;heights[0]=NaN;
 const ds={...base,heightRMS,lolaCounts,heights,origins:heights.map(h=>Number.isFinite(h)?'undocumented':'absent')},session=createSession(ds,{selection:{layerId:'heights',cell:{row:0,col:0}}});
 const zero=session.getSnapshot();assert.equal(zero.record.available,false);assert.equal(zero.sources[0].height,null);assert.equal(zero.sources[0].heightRMS_m,0);assert.equal(zero.sources[0].lolaSpots,0);assert.equal(zero.record.inputHeightRMS.known,1);
 const unknown=session.dispatch({type:'select',layerId:'heights',cell:{row:0,col:1}});assert.equal(unknown.record.available,true);assert.equal(unknown.sources[0].heightRMS_m,null);assert.equal(unknown.sources[0].lolaSpots,null);assert.equal(unknown.record.inputHeightRMS.known,0);assert.equal(unknown.record.inputHeightRMS.min,null);
 const maps=numericEvidenceFields(ds);assert.equal(maps['height-rms'].values[0],0);assert.ok(Number.isNaN(maps['height-rms'].values[1]));
 assert.match(inspectorHTML(zero,new Set(),{},null,null,'height-rms'),/>0 m</);assert.match(inspectorHTML(unknown,new Set(),{},null,null,'height-rms'),/>Unknown</);
});

test('numeric source maps retain literal source values and derived selection, route and exact blue inputs',async t=>{
 const ds=await load(t),session=createSession(ds,{selection:{layerId:'slope',cell:{row:126,col:126}}}),snap=session.getSnapshot();
 const path=createProposedPath(ds,fields,[{row:128,col:127},{row:128,col:129}]);
 for(const layer of Object.keys(NUMERIC_EVIDENCE)){
  const map=createSurfaceMap(ds,fields,layer,{heights:true,affected:true});assert.equal(map.node,'heights');assert.equal(map.flags,false);assert.equal(map.heightFlags,false);assert.equal(map.showLidarGaps,false);
  assert.equal(sampleSurfaceMap(map,{row:128,col:128}).value,layer==='height-rms'?ds.heightRMS[32896]:ds.lolaCounts[32896]);
  const trace=tracePresentation(snap,path,true);assert.equal(trace.selectedResult,true);assert.equal(trace.centreRole,'result');assert.equal(trace.routeContext,true);
  const html=inspectorHTML(snap,new Set(['sources']),{},null,null,layer);assert.match(html,new RegExp(NUMERIC_EVIDENCE[layer].title));assert.match(html,/Input height RMS/);assert.match(html,/8 \/ 8 known/);assert.match(html,/.4600980877876282 m/);assert.match(html,/<th>LOLA returns per cell<\/th>/);
  assert.match(selectionKeyHTML(snap,true,{},layer),new RegExp('Map: '+NUMERIC_EVIDENCE[layer].label.replace(/[()]/g,'\\$&')));
  assert.match(mapLegendHTML(map,true),/Queried heights/);assert.equal(pathAssessmentScope(layer),null);assert.equal(pathDisplayColour({value:0,state:0},layer),pathDisplayColour({value:10,state:1},layer));
 }
 assert.deepEqual(session.getSnapshot().selection,{layerId:'slope',cell:{row:126,col:126}});
});

test('supplier RMS and spot counts cannot change terrain cost, slope or route priorities',async t=>{
 const ds=await load(t),changed={...ds,heightRMS:ds.heightRMS.map(()=>999),lolaCounts:ds.lolaCounts.map(()=>0)};
 const alteredValues=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(changed,id)]));
 const altered={...alteredValues,...evaluateLimitRasters(changed,alteredValues)};altered['traversal-cost']=traversalCostField(changed,altered);
 assert.deepEqual(altered.slope.values,fields.slope.values);assert.deepEqual(altered['traversal-cost'].values,fields['traversal-cost'].values);
 const normal=createPlanningGrid(ds,fields,[],{branch:'combined'}),numeric=createPlanningGrid(changed,altered,[],{branch:'combined'});assert.deepEqual(normal.costs,numeric.costs);assert.deepEqual(normal.objectiveOrder,['terrainCost']);
 const options={start:ds.proposalStart,goal:ds.proposalGoal,branch:'combined'};const a=planRoute(ds,fields,options),b=planRoute(changed,altered,options);assert.ok(a.ok);assert.deepEqual(a.vertices,b.vertices);
});

test('Nassau has a complete categorical code key; lunar scenarios distinguish evidence from mission claims',async t=>{
 const ds=await load(t),moon=await loadTerrain('moon','ground');
 const snap=createSession(moon,{selection:{layerId:'slope',cell:{row:118,col:125}}}).getSnapshot(),html=inspectorHTML(snap,new Set(['source','sources']));
 assert.match(html,/Supplied cell code key/);for(const label of ['NoData / outside boundary','Shadowed','Saturated','Suspicious','Interpolated / extrapolated','Successful correlation','Manually edited'])assert.match(html,new RegExp(label));
 assert.match(html,/codes? 10–14 do not guarantee accuracy/i);assert.match(html,/code 3/);assert.match(html,/NAC_DTM_NASSAU02_README/);
 const categories=qualityCategories(moon);assert.equal(categories.filter(c=>c.label.includes('Successful correlation')).length,1);assert.ok(categories.some(c=>c.label==='3 · Suspicious'));assert.ok(categories.some(c=>c.label==='10–14 · Successful correlation'));
 for(const terrain of [ds,moon]){const scenario=lunarScenarioHTML(terrain);assert.match(scenario,/Knowledge laundering/);assert.match(scenario,/not an actual mission route/);assert.match(scenarioLimitsText(terrain),/scenario settings[^.]*not rover requirements/);}
});

test('flagged-route shortcut inspects the active branch and prefers actual interior support, including roughness-only inputs',async()=>{
 const {flaggedRouteInspection}=await import('../editor/flagged-route-inspection.js');
 const path={cells:[
  {index:0,suspicious:1,slope:{suspicious:1},roughness:{suspicious:1},priority:{heightFlag:true}},
  {index:1,suspicious:1,slope:{suspicious:0},roughness:{suspicious:1},priority:{heightFlag:false}},
  {index:2,suspicious:0,slope:{suspicious:0},roughness:{suspicious:0},priority:{heightFlag:false}},
 ]};
 for(const branch of ['combined','traversal-cost'])assert.deepEqual(flaggedRouteInspection(path,branch),{cell:path.cells[1],layerId:'combined'});
 for(const branch of ['roughness','roughness-criterion'])assert.deepEqual(flaggedRouteInspection(path,branch),{cell:path.cells[1],layerId:'roughness'});
 for(const branch of ['slope','slope-criterion'])assert.deepEqual(flaggedRouteInspection(path,branch),{cell:path.cells[0],layerId:'slope'});
 assert.deepEqual(flaggedRouteInspection(path,'heights'),{cell:path.cells[0],layerId:'heights'});
 assert.equal(flaggedRouteInspection({cells:[path.cells[2]]},'combined'),null);assert.equal(flaggedRouteInspection(null,'combined'),null);
});
