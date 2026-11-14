import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareNuugaatsiaqEditorData} from '../tools/prepare-nuugaatsiaq-editor-data.mjs';
import {availableSurfaces,loadTerrain} from '../editor/data.js';
import {initialViewState,preferredSurface} from '../editor/view-state.js';
import {nuugaatsiaqScenarioHTML,scenarioLimitsText,terrainCaseId} from '../editor/case-presentation.js';
import {createSession} from '../editor/session.js';
import {inspectorHTML,selectionKeyHTML} from '../editor/inspector.js';
import {cellCenter,cellCoordinates,layerGrid} from '../editor/spatial.js';
import {qualityLabel,evaluateLazy,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {createPlanningGrid,planRoute} from '../editor/planner.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {createSurfaceMap,sampleSurfaceMap,qualityCategories} from '../editor/surface-map.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {withTraversalCost,traversalCostField,heightSupportField} from '../editor/traversal-cost.js';

const fixture=new URL('../fixtures/earth/nuugaatsiaq/',import.meta.url);
const m=JSON.parse(readFileSync(new URL('manifest.json',fixture)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const native={row:165,col:80},analysis={row:163,col:78};
const mockFetch=t=>t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(new URL(url))));
let ds,fields;
async function load(t){
 mockFetch(t);ds??=await loadTerrain('earth','ground');
 if(!fields){const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)]));fields={...values,...evaluateLimitRasters(ds,values,{slopeDeg:15,roughness_m:.15})};Object.assign(fields,{'traversal-cost':traversalCostField(ds,fields),'height-support':heightSupportField(fields)});}
 return ds;
}
const ring=JSON.parse(readFileSync(new URL('land-context.json',fixture))).coastlineLandRing;
function onLand({row:r,col:c}){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [ri,ci]=ring[i],[rj,cj]=ring[j];if((ri>r)!==(rj>r)&&c<(cj-ci)*(r-ri)/(rj-ri)+ci)inside=!inside;}return inside;}

// Raw supplier downloads are optional; retained-fixture tests below always run.
const sourceDirectory=process.env.HALLMARK_NUUGAATSIAQ_SOURCE ||
 resolve(fileURLToPath(new URL('../local-data/nuugaatsiaq-20170619/',import.meta.url)));
const missingRawSources=Object.values(m.rasters).some(asset=>!existsSync(join(sourceDirectory,asset.source)));
test('Nuugaatsiaq preparation is offline, deterministic and preserves every native DEM/mask/matchtag sample',{
 skip: !process.env.HALLMARK_NUUGAATSIAQ_SOURCE && missingRawSources
  ? 'Set HALLMARK_NUUGAATSIAQ_SOURCE to verify optional original supplier downloads' : false,
},async()=>{
 const out=mkdtempSync(join(tmpdir(),'hallmark-nuugaatsiaq-'));
 try{
  const catalog=await prepareNuugaatsiaqEditorData(out);
  assert.equal(catalog.W,250);assert.equal(catalog.res,2);assert.equal(catalog.qualityKind,'arcticdem-bitmask');
  assert.deepEqual(await prepareNuugaatsiaqEditorData(out),catalog);
  for(const asset of Object.values(m.rasters))assert.equal(hash(readFileSync(join(out,asset.file))),asset.sha256);
  const b=readFileSync(join(out,m.rasters.dem.file));const h=new Float32Array(b.buffer,b.byteOffset,b.length/4);
  const mask=readFileSync(join(out,m.rasters.mask.file)),tag=readFileSync(join(out,m.rasters.matchtag.file));
  assert.ok(h.every(Number.isFinite));assert.equal(mask.filter(v=>v&4).length,18412);assert.equal(mask.filter(v=>v&2).length,656);assert.equal(tag.filter(v=>v===0).length,4758);
  assert.deepEqual([...new Set(mask)].sort(),[0,4,6]);
  for(const check of m.checks){const i=check.row*250+check.col;assert.equal(h[i],check.height);assert.equal(mask[i],check.mask);assert.equal(tag[i],check.matchtag);}
 }finally{rmSync(out,{recursive:true,force:true});}
});

test('the live Earth case uses the real ArcticDEM surface and old Atami surface links fall back sanely',async t=>{
 await load(t);const surfaces=await availableSurfaces('earth');assert.deepEqual(surfaces,[{id:'ground',label:'19 June 2017 imagery'}]);
 assert.equal(preferredSurface('earth',surfaces,'july3-dsm'),'ground');assert.equal(terrainCaseId('atami'),'moon');
 assert.deepEqual(initialViewState(new URLSearchParams(),'earth'),{layer:'terrain',branch:'slope',showLidarGaps:false});
 assert.match(ds.title,/Nuugaatsiaq/);assert.equal(ds.groundRGB,undefined);assert.equal(ds.quality.kind,'arcticdem-bitmask');
 assert.ok(ds.origins.every(v=>v==='undocumented'),'stereo matching does not claim observed ground truth');
 assert.equal(ds.quality.codes[165*250+80],4);assert.equal(ds.matchtags[165*250+80],1);
 for(const [code,label] of [[0,'No supplied mask flag'],[1,'Edge'],[2,'Water'],[3,'Edge + Water'],[4,'Cloud'],[6,'Water + Cloud'],[7,'Edge + Water + Cloud']])assert.equal(qualityLabel(code,ds.quality),label);
 assert.deepEqual(qualityCategories(ds).map(q=>q.label),['No supplied mask flag','Cloud','Water + Cloud']);
});

test('native positions and the real proposed path lie on the mapped settlement peninsula, including cloud-flagged finite heights',async t=>{
 await load(t);const point=cellCenter(layerGrid(ds,{grid:'heights'}),native);assert.deepEqual(point,{east:-288217,north:-1996453});assert.deepEqual(cellCoordinates(layerGrid(ds,{grid:'analysis'}),point),analysis);
 for(const matchSettings of [{heights:true,affected:true},{heights:false,affected:false}]){
  const route=planRoute(ds,fields,{start:ds.proposalStart,goal:ds.proposalGoal,branch:'slope',matchSettings});assert.ok(route.ok);assert.equal(route.vertices.length,76);assert.ok(route.vertices.every(onLand));
  assert.ok(route.vertices.every(c=>!(ds.quality.codes[c.row*250+c.col]&2)),'default route does not run through supplied water flags');
  assert.ok(route.vertices.some(c=>ds.quality.codes[c.row*250+c.col]===4));
 }
});

test('slope, roughness and traversal cost retain distinct declared height dependencies with exact supplied mask and matchtag evidence',async t=>{
 await load(t);const session=createSession(ds,{selection:{layerId:'slope',cell:analysis},limits:{slopeDeg:15,roughness_m:.15}});const slope=session.getSnapshot();
 assert.equal(slope.heightHere.height,28.96875);assert.equal(slope.sources.length,8);assert.equal(slope.record.quality.suspicious,8);assert.equal(slope.heightHere.used,false);assert.ok(slope.sources.every(c=>c.quality.code===4&&c.stereoMatch.code===1));
 const rough=session.dispatch({type:'select',layerId:'roughness',cell:analysis});assert.equal(rough.sources.length,25);assert.equal(rough.heightHere.used,true);assert.ok(rough.sources.some(c=>c.row===native.row&&c.col===native.col));
 const source=session.dispatch({type:'input',layerId:'heights',cell:native});assert.equal(source.record.value,28.96875);assert.equal(source.heightHere.stereoMatch.label,'Stereo matched');assert.equal(source.heightHere.quality.code,4);assert.equal(session.dispatch({type:'back'}).selection.layerId,'roughness');
 const cost=session.dispatch({type:'select',layerId:'traversal-cost',cell:analysis});assert.equal(cost.sources.length,25);assert.ok(Number.isFinite(cost.record.value));assert.deepEqual(cost.record.sourceCells.map(c=>c.index),rough.record.sourceCells.map(c=>c.index));
 const other=ds.matchtags.findIndex(v=>v===0);const interpolated=createSession(ds,{selection:{layerId:'heights',cell:{row:Math.floor(other/250),col:other%250}}}).getSnapshot();assert.ok(interpolated.record.available);assert.equal(interpolated.heightHere.stereoMatch.label,'Interpolated');assert.equal(interpolated.heightHere.stereoMatch.code,0);
 assert.match(inspectorHTML(interpolated),/Interpolated · matchtag 0/);assert.doesNotMatch(inspectorHTML(interpolated),/Missing DSM|\+\/−|±/);
});

test('quality switches hide their evidence summaries while source values and query evidence remain intact',async t=>{
 await load(t);const snapshot=createSession(ds,{selection:{layerId:'slope',cell:analysis}}).getSnapshot();const before=JSON.stringify(snapshot.record);
 const on=inspectorHTML(snapshot,new Set(['inputs']),{heights:true,affected:true});assert.match(on,/Cloud · mask 4/);assert.match(on,/Stereo matched · matchtag 1/);assert.match(on,/Input flags/);assert.match(on,/<th>Matchtag<\/th>/);
 const off=inspectorHTML(snapshot,new Set(['inputs']),{heights:false,affected:false});assert.doesNotMatch(off,/Cloud · mask 4|Stereo matched · matchtag 1|<th>Matchtag<\/th>|<span>Input flags<\/span>/);assert.equal(JSON.stringify(snapshot.record),before);
 assert.doesNotMatch(selectionKeyHTML(snapshot,true,{heights:false,affected:false}),/Flagged height input/);
 const map=createSurfaceMap(ds,fields,'slope',{heights:false,affected:false});assert.equal(map.flags,false);assert.equal(map.heightFlags,false);assert.equal(sampleSurfaceMap(map,native).suspicious,8);assert.doesNotMatch(mapLegendHTML(map,true),/Height flags · supplied|Affected results · input flags/);
});

test('flag priorities remain explicit lexicographic choices, not arbitrary cost penalties, and inspection preserves the plan',async t=>{
 await load(t);const plan=createSupervisoryPlan(ds,fields,{start:ds.proposalStart,goal:ds.proposalGoal,branch:'slope',matchSettings:{heights:true,affected:true}});const state=plan.dispatch({type:'plan'});assert.deepEqual(state.route.objectiveOrder,['matchingCells','terrainCost']);
 const grid=createPlanningGrid(ds,fields,[],{branch:'slope',matchSettings:{heights:true,affected:true}}),plain=createPlanningGrid(ds,fields,[],{branch:'slope'});assert.deepEqual(grid.costs,plain.costs);
 const path=createProposedPath(ds,fields,state.route.vertices,state.route,{branch:'slope',matchSettings:state.matchSettings,grid});const candidates=path.cells.filter(c=>c.slope.suspicious>0);assert.ok(candidates.length>0);const c=candidates.find(c=>c.index>0&&c.index<path.cells.length-1),session=createSession(ds);session.dispatch({type:'path-select',pathId:path.id,index:c.index,layerId:'slope',cell:{row:c.row-2,col:c.col-2}});assert.deepEqual(plan.getSnapshot(),state);
 const revised=plan.dispatch({type:'exclude',cell:{row:c.row,col:c.col}});assert.equal(revised.status,'Draft');const replanned=plan.dispatch({type:'plan'});assert.ok(replanned.route);assert.ok(!replanned.route.vertices.some(v=>v.row===c.row&&v.col===c.col));assert.equal(ds.quality.codes[165*250+80],4);
});

test('scenario and source disclosure state the retrospective timing, categorical scope and knowledge laundering risk',async t=>{
 await load(t);const html=nuugaatsiaqScenarioHTML(ds,{atRoadStart:true});assert.match(html,/Retrospective rover inspection/);assert.match(html,/<details id="scenario-details">/);assert.match(html,/Knowledge laundering/);assert.match(html,/heights → slope \/ height spread → cost → route/);assert.match(html,/not a documented deployment or rescue route/);assert.match(html,/2018.*2021.*2022/);assert.match(html,/data-demo-flag/);assert.doesNotMatch(html,/data-demo-road/);assert.match(scenarioLimitsText(ds),/No rover limits/);
 const source=inspectorHTML(createSession(ds,{selection:{layerId:'heights',cell:native}}).getSnapshot(),new Set(['source']));assert.match(source,/WGS84 ellipsoidal/);assert.match(source,/upstream SETSM smoothing/);assert.match(source,/DSM includes buildings/);assert.match(source,/License.*CC BY 4.0/);assert.match(source,/Uncertainty<\/dt><dd>Not supplied/);assert.doesNotMatch(source,/LROC|LOLA/);
});
