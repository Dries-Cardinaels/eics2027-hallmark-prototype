import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateLazy,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {createSurfaceMap,sampleSurfaceMap,qualityLayersFromParams} from '../editor/surface-map.js';
import {flaggedResults,flaggedHeights,evidenceVisibility,tracePresentation} from '../editor/evidence-geometry.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {createSession} from '../editor/session.js';
import {inspectorHTML,selectionKeyHTML} from '../editor/inspector.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {pathEvidenceScope,pathSupport,pathFlaggedCells,pathAssessmentLayer} from '../editor/path-evidence.js';
import {compareRoutes,routeComparisonHTML} from '../editor/route-comparison.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {planControlsHTML} from '../editor/plan-controls.js';

const directory=new URL('../editor/data/',import.meta.url),info=JSON.parse(readFileSync(new URL('cases.json',directory),'utf8')).moon;
const bytes=readFileSync(new URL(info.files.ground,directory)),heights=Array.from(new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4));
const codes=Array.from(readFileSync(new URL(info.qualityFile,directory)));
const ds={...info,id:'moon:ground',heights,origins:heights.map(h=>Number.isFinite(h)?'undocumented':'absent'),quality:{codes,flaggedCodes:[3]}};
const fields=Object.fromEntries(['heights','slope','roughness','combined'].map(node=>[node,evaluateRaster(ds,node)]));
const evaluation=evaluateLazy(ds),index=(r,c)=>r*ds.W+c;
const at=(node,row,col)=>query(evaluation,node,{row:row-2,col:col-2});

test('path evidence follows the mapped branch at audited Moon126133 without changing supplied height flags',()=>{
 const canonical={...fields,...evaluateLimitRasters(ds,fields)},native={row:126,col:133},path=createProposedPath(ds,canonical,[native]);
 const cell=path.cells[0],raw=flaggedHeights(createSurfaceMap(ds,canonical,'assessment',{heights:true,affected:true})).map(c=>c.index);
 assert.equal(cell.suspicious,1);assert.equal(cell.total,25);
 assert.equal(cell.slope.suspicious,0);assert.equal(cell.slope.total,8);assert.equal(cell.roughness.suspicious,1);assert.equal(cell.roughness.total,25);
 for(const layer of ['slope','slope-criterion','roughness','roughness-criterion','assessment']){
  const scope=pathEvidenceScope(layer),support=pathSupport(cell,scope),node=scope==='combined'?'combined':scope,expected=at(node,native.row,native.col).quality;
  assert.equal(support.suspicious,expected.suspicious);assert.equal(support.total,expected.total);
  assert.equal(pathFlaggedCells(path,scope).length,Number(expected.suspicious>0));
  const html=proposedPathHTML(path,null,{scope});
  assert.match(html,new RegExp(`${expected.suspicious} of ${expected.total} suspicious height inputs`));
  assert.match(html,new RegExp(scope==='slope'?'Slope inputs':scope==='roughness'?'Height spread inputs':'Height inputs'));
  assert.match(html,new RegExp(`class="quality-${expected.suspicious?'flagged':'unflagged'}">${expected.suspicious?'!':'·'}`));
  const comparison=compareRoutes(path,path,scope);assert.equal(comparison.previous.suspiciousCells,Number(expected.suspicious>0));assert.equal(comparison.proposed.suspiciousCells,Number(expected.suspicious>0));assert.equal(comparison.supportScope,scope);
  assert.deepEqual(flaggedHeights(createSurfaceMap(ds,canonical,layer,{heights:true,affected:true})).map(c=>c.index),raw);
  const session=createSession(ds);session.dispatch({type:'path-select',pathId:path.id,index:0,layerId:layer==='assessment'?'combined':layer,cell:{row:native.row-2,col:native.col-2}});
  assert.equal(session.getSnapshot().selection.layerId,layer==='assessment'?'combined':layer);assert.equal(session.getSnapshot().record.quality.suspicious,expected.suspicious);assert.deepEqual(session.getSnapshot().heightCell,native);
 }
 for(const layer of ['terrain','quality']){
  const scope=pathEvidenceScope(layer);assert.equal(scope,'source');assert.equal(pathSupport(cell,scope),null);assert.deepEqual(pathFlaggedCells(path,scope),[]);
  assert.doesNotMatch(proposedPathHTML(path,null,{scope}),/data-path-row="height-inputs"|Suspicious inputs|suspicious height inputs/);
  assert.equal((routeComparisonHTML(compareRoutes(path,path,scope)).match(/data-comparison-metric=/g)||[]).length,2);
  assert.deepEqual(flaggedHeights(createSurfaceMap(ds,canonical,layer,{heights:true,affected:true})).map(c=>c.index),raw);
 }
 const source=createSession(ds);source.dispatch({type:'path-select',pathId:path.id,index:0,layerId:'heights',cell:native});
 assert.deepEqual(source.getSnapshot().selection,{layerId:'heights',cell:native});assert.equal(source.getSnapshot().record.sourceCells[0].quality.code,codes[index(native.row,native.col)]);
});

test('audited suspicious centre120127 is a supplied flag but not a Horn input; roughness includes it',()=>{
 const session=createSession(ds,{selection:{layerId:'slope',cell:{row:118,col:125}}}),snapshot=session.getSnapshot();
 assert.equal(snapshot.heightHere.quality.code,3);assert.equal(snapshot.heightHere.used,false);assert.equal('excluded' in snapshot.heightHere,false); // 11 Nov 2026 (authors): no slope-specific center marking; the center of a slope is simply not a declared input.
 assert.equal(snapshot.sources.length,8);assert.equal(snapshot.record.quality.suspicious,0);assert.ok(snapshot.sources.every(c=>c.index!==index(120,127)));
 const html=inspectorHTML(snapshot,new Set(['inputs']));
 assert.match(html,/Suspicious · code 3/);assert.match(html,/Input flags<\/span><strong>suspicious in 0 of 8 source heights/);assert.match(html,/Not in the footprint/);
 assert.doesNotMatch(html,/excluded-context/);
 assert.equal((html.match(/data-hover-source=/g)||[]).length,8);
 assert.throws(()=>session.dispatch({type:'input',layerId:'heights',cell:{row:120,col:127}}),/not an immediate input/);
 session.dispatch({type:'layer',layerId:'heights'});
 const source=session.getSnapshot();assert.deepEqual(source.selection.cell,{row:120,col:127});assert.equal(source.trail.length,1);assert.equal(source.record.kind,'source');
 assert.match(inspectorHTML(source),/Supplied quality/);assert.match(inspectorHTML(source),/Suspicious · code 3/);assert.doesNotMatch(inspectorHTML(source),/Suspicious inputs|Input flags/);
 assert.equal(snapshot.sources.length,8);
 const rough=at('roughness',120,127);assert.equal(rough.quality.suspicious,1);assert.equal(rough.sourceCells.length,25);assert.ok(rough.sourceCells.some(c=>c.index===index(120,127)));
 const criterion=createSession(ds,{selection:{layerId:'slope-criterion',cell:{row:118,col:125}}}).getSnapshot();assert.equal(criterion.heightHere.used,false);assert.equal(criterion.record.quality.total,8);
});

test('flagged Moon center remains real inspectable evidence for roughness and an undeclared cell for slope during trace',()=>{
 const canonical={...fields,...evaluateLimitRasters(ds,fields)},native={row:120,col:127},path=createProposedPath(ds,canonical,[{row:120,col:124},{row:120,col:130}]);
 for(const layer of ['slope','roughness']){
  const session=createSession(ds,{selection:{layerId:layer,cell:{row:118,col:125}}}),snapshot=session.getSnapshot(),trace=tracePresentation(snapshot,path,true);
  const selected=sampleSurfaceMap(createSurfaceMap(ds,canonical,pathAssessmentLayer(layer),false),native);
  assert.equal(selected.state,undefined);assert.equal(selected.value,snapshot.record.value);assert.equal(trace.routeFlags,false);assert.equal(trace.selectedResult,true);
  assert.equal(trace.centreRole,layer==='roughness'?'input':'result');assert.equal(Boolean(trace.selectedInput),layer==='roughness');
  if(layer==='roughness'){assert.ok(selectionKeyHTML(snapshot,true).includes('Center included · height input'));assert.ok(inspectorHTML(snapshot).includes('Center included · height input'));}
  else{assert.doesNotMatch(selectionKeyHTML(snapshot,true),/Center/);assert.ok(inspectorHTML(snapshot).includes('Not in the footprint'));}
  assert.deepEqual(trace.sourceFlags,layer==='roughness'?[index(native.row,native.col)]:[]);
  assert.ok(trace.routeCells.every(cell=>!snapshot.sources.some(source=>source.row===cell.row&&source.col===cell.col)));
  if(layer==='roughness'){
   const html=inspectorHTML(snapshot,new Set(['inputs']));assert.match(html,/<button[^>]*data-input-layer="heights"[^>]*data-row="120"[^>]*data-col="127"/);
   session.dispatch({type:'input',layerId:'heights',cell:native});const source=session.getSnapshot(),sourceTrace=tracePresentation(source,path,true);
   assert.equal(source.record.kind,'source');assert.equal(sourceTrace.centreRole,'source');assert.equal(sourceTrace.selectedResult,false);assert.equal(source.sources.length,1);assert.deepEqual(sourceTrace.sourceFlags,[index(native.row,native.col)]);
  }
 }
});

test('height flags and affected results independently represent raw quality and declared support in every trace mode',()=>{
 for(const raw of [false,true])for(const affected of [false,true]){
  const map=createSurfaceMap(ds,fields,'slope',{heights:raw,affected}),rawCells=flaggedHeights(map),results=flaggedResults(map);
  assert.equal(rawCells.some(c=>c.index===index(120,127)),raw);
  assert.equal(results.some(c=>c.index===index(120,127)),false,'excluded center does not become an affected Horn result');
  assert.equal(results.some(c=>c.index===index(121,128)),affected);
  assert.equal(rawCells.some(c=>c.index===index(121,128)),false,'affected result at121128 has unflagged raw height');
  for(const inspect of [false,true]){
   const visible=evidenceVisibility(map,inspect);assert.equal(visible.heightFlags,raw);assert.equal(visible.regions,affected);
   const legend=mapLegendHTML(map,inspect);assert.equal(legend.includes('Height flags · supplied'),raw);assert.equal(legend.includes('Affected results · input flags'),affected);
  }
  assert.equal(sampleSurfaceMap(map,{row:120,col:127}).suspicious,0);
 }
 const selected=at('slope',122,129);assert.equal(selected.quality.suspicious,0);assert.ok(selected.sourceCells.some(c=>c.row===121&&c.col===128&&c.quality.code===14));
 assert.equal(at('slope',121,128).quality.suspicious,1);
 const heightMap=createSurfaceMap(ds,fields,'terrain',{heights:true,affected:true});assert.equal(heightMap.flags,false);assert.equal(heightMap.heightFlags,true);
});

test('all four visibility combinations gate raw and derived insights throughout trace, inspector, path and comparison without changing data or approval',()=>{
 const canonical={...fields,...evaluateLimitRasters(ds,fields)},native={row:120,col:127},path=createProposedPath(ds,canonical,[native]);
 const model=createSupervisoryPlan(ds,canonical,{start:native,goal:native,limits:{slopeDeg:15,roughness_m:.15}});
 model.dispatch({type:'plan'});model.dispatch({type:'approve'});const approved=model.exportPlan(),originalPath=JSON.stringify(path);
 for(const raw of [false,true])for(const affected of [false,true]){
  const qualityOptions={heights:raw,affected};
  for(const layer of ['slope-criterion','roughness','assessment','terrain']){
   const layerId=layer==='assessment'?'combined':layer==='terrain'?'heights':layer,source=layerId==='heights';
   const session=createSession(ds,{selection:{layerId,cell:source?native:{row:native.row-2,col:native.col-2}}}),snapshot=session.getSnapshot(),before=JSON.stringify(snapshot.record),scope=pathEvidenceScope(layer);
   const map=createSurfaceMap(ds,canonical,layer,qualityOptions),html=inspectorHTML(snapshot,new Set(['inputs','sources']),qualityOptions);
   assert.equal(html.includes('Suspicious'),raw);assert.equal(html.includes('code 3'),raw);
   assert.equal(html.includes('Input flags'),affected&&!source);assert.equal(html.includes('<th>Quality</th>'),raw);
   if(!raw)assert.doesNotMatch(html,/cell-quality|raw-flagged|class="height-cell [^"]*flagged|Supplied quality/);
   const pathHTML=proposedPathHTML(path,null,{scope,layer,qualityOptions}),comparisonHTML=routeComparisonHTML(compareRoutes(path,path,scope),qualityOptions);
   assert.equal(pathHTML.includes('data-path-row="height-inputs"'),affected&&!source);
   assert.equal(comparisonHTML.includes('data-comparison-metric="suspiciousCells"'),affected&&!source);
   if(!affected){assert.doesNotMatch(pathHTML,/suspicious|Suspicious|quality-flagged|Quality not supplied/);assert.doesNotMatch(comparisonHTML,/inputs !|Not supplied/);}
   for(const inspect of [false,true]){
    const presentation=tracePresentation(snapshot,path,inspect,qualityOptions),visibility=evidenceVisibility(map,inspect),key=selectionKeyHTML(snapshot,inspect,qualityOptions),legend=mapLegendHTML(map,inspect);
    assert.equal(presentation.routeFlags,affected&&!inspect);assert.equal(visibility.suspiciousSources,raw&&inspect);
    assert.equal(presentation.sourceFlags.length,raw&&inspect&&layerId!=='slope-criterion'?1:0);
    assert.equal(key.includes('Suspicious height input'),raw&&inspect);assert.equal(legend.includes('Traced suspicious height'),raw&&inspect);
    assert.equal(visibility.sources,inspect);assert.equal(snapshot.sources.length,source?1:layerId==='slope-criterion'?8:25);
    if(inspect&&!source){if(layerId==='slope-criterion')assert.doesNotMatch(key,/Center/);else assert.match(key,/Center included/);}
   }
   assert.equal(JSON.stringify(snapshot.record),before);
  }
  const controls=planControlsHTML(model.getSnapshot(),{selectedCell:native,qualityOptions});
  assert.doesNotMatch(controls,/Selected route cell|Selected cell cost terms/);assert.match(controls,/Terrain density = 1 \+ slope \/ 90° \+ height spread \/ 1 m \+ 8 per exceeded active limit/);assert.doesNotMatch(controls,/Preference|Flag preference|Prefer fewer flagged inputs/);
  assert.deepEqual(model.exportPlan(),approved);assert.equal(JSON.stringify(path),originalPath);
 }
 const explicit=createSurfaceMap(ds,canonical,'quality',{heights:false,affected:false});
 assert.equal(explicit.flags,false);assert.equal(explicit.heightFlags,false);assert.match(mapLegendHTML(explicit,true),/Supplied quality/);assert.match(mapLegendHTML(explicit,true),/Suspicious/);assert.doesNotMatch(mapLegendHTML(explicit,true),/Traced suspicious height|Affected results/);
});

test('legacy quality links map to independent explicit layer settings without silently enabling flags',()=>{
 assert.deepEqual(qualityLayersFromParams(new URLSearchParams('flags=0')),{heights:false,affected:false});
 assert.deepEqual(qualityLayersFromParams(new URLSearchParams('flags=0&heightflags=1')),{heights:true,affected:false});
 assert.deepEqual(qualityLayersFromParams(new URLSearchParams('heightflags=0&affected=1')),{heights:false,affected:true});
 assert.deepEqual(qualityLayersFromParams(new URLSearchParams()),{heights:true,affected:true});
});
