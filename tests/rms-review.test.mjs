import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {datasetById} from '../src/fixtures/terrain.js';
import {evaluateLazy,query,createDatasetPipeline} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {withTraversalCost,traversalCostField} from '../editor/traversal-cost.js';
import {parseRMSReview,rmsReviewFromParams,writeRMSReviewParam,rmsReviewState,summariseRMSReview,rmsReviewField,rmsReviewContext,rmsReviewMarkers,rmsReviewVisibility,rmsReviewTogglesFromParams,writeRMSReviewToggleParams,rmsRouteReviewContext,rmsReviewText} from '../editor/rms-review.js';
import {createSurfaceMap} from '../editor/surface-map.js';
import {numericEvidenceFields} from '../editor/source-evidence.js';
import {createSession} from '../editor/session.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {inspectorHTML} from '../editor/inspector.js';
import {tracePresentation} from '../editor/evidence-geometry.js';
import {mapLegendHTML} from '../editor/map-legend.js';

const base=datasetById('reference'),center={row:5,col:5},at=(r,c)=>r*base.W+c;
function delivery(){
 const heightRMS=new Float64Array(base.heights.length).fill(0);
 heightRMS[at(5,5)]=99;heightRMS[at(4,4)]=2;heightRMS[at(4,5)]=1;heightRMS[at(4,6)]=NaN;heightRMS[at(6,4)]=-1;
 return {...base,heightRMS,lolaCounts:new Uint16Array(base.heights.length).fill(2)};
}
function fieldsFor(ds){
 const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)]));
 const fields={...values,...evaluateLimitRasters(ds,values),...numericEvidenceFields(ds)};
 fields['traversal-cost']=traversalCostField(ds,fields);return fields;
}

test('optional operator threshold preserves zero/unset and rejects invalid values',()=>{
 for(const invalid of [null,undefined,'',' ',NaN,Infinity,-1,'-1','bad','Infinity',false,{}])assert.equal(parseRMSReview(invalid),null);
 assert.equal(parseRMSReview('0'),0);assert.equal(parseRMSReview('0.125'),.125);
 const params=new URLSearchParams();assert.equal(rmsReviewFromParams(params),null);
 writeRMSReviewParam(params,0);assert.equal(params.get('rmsreview'),'0');assert.equal(rmsReviewFromParams(params),0);
 writeRMSReviewParam(params,null);assert.equal(params.has('rmsreview'),false);
 assert.equal(rmsReviewState(1,1),'no-trigger');assert.equal(rmsReviewState(1.0000001,1),'trigger');
 assert.equal(rmsReviewState(0,0),'no-trigger');assert.equal(rmsReviewState(.000001,0),'trigger');
 for(const unknown of [null,NaN,-1,Infinity,undefined])assert.equal(rmsReviewState(unknown,0),'unknown');
 assert.equal(rmsReviewState(99,null),'unset');
});

for(const node of ['heights','slope','slope-criterion','roughness','roughness-criterion','combined','traversal-cost'])test('review counts match exact query support: '+node,()=>{
 const ds=delivery(),pipeline=withTraversalCost(createDatasetPipeline(ds)),ev=evaluateLazy(ds,undefined,pipeline);
 const context=rmsReviewContext(ds,node,1,pipeline),cell=node==='heights'?center:{row:3,col:3};
 const expected=summariseRMSReview(query(ev,node,cell).sourceCells,1);
 assert.deepEqual(context.summary(center),expected);
 assert.equal(rmsReviewField(ds,node,1,pipeline),context.field,'unchanged threshold reuses cached field');
 assert.equal(rmsReviewField(ds,node,null,pipeline),null);
 assert.equal(rmsReviewContext({...base},node,1,pipeline),null,'no supplied RMS has no review field');
});

test('displayed branch follows exact footprint; source marks and center exclusion remain distinct on every map',()=>{
 const ds=delivery(),fields=fieldsFor(ds),pipeline=withTraversalCost(createDatasetPipeline(ds)),source=at(5,5);
 const slope=rmsReviewContext(ds,'slope',1,pipeline).summary(center),rough=rmsReviewContext(ds,'roughness',1,pipeline).summary(center);
 assert.deepEqual(slope,{threshold:1,triggered:1,unknown:2,known:6,total:8});
 assert.equal(rough.triggered,2);assert.equal(rough.total,25);assert.equal(rough.unknown,2);
 const centreOnly={...ds,heightRMS:new Float64Array(ds.heights.length).fill(0)};centreOnly.heightRMS[source]=99;
 const centreFields=fieldsFor(centreOnly);
 for(const layer of ['terrain','height-rms','lola-spots','slope','slope-criterion','roughness','roughness-criterion','assessment','traversal-cost']){
  const map=createSurfaceMap(centreOnly,centreFields,layer,{rmsReview:1},undefined,pipeline);
  assert.deepEqual(rmsReviewMarkers(map,true).map(c=>c.index),[source]);
  const affected=rmsReviewMarkers(map).some(c=>c.index===source);
  assert.equal(affected,['roughness','roughness-criterion','assessment','traversal-cost'].includes(layer),layer);
  const legend=mapLegendHTML(map,true);assert.match(legend,/Your RMS review/);assert.match(legend,/Operator rule/);
  const off=createSurfaceMap(centreOnly,centreFields,layer,{rmsReview:null},undefined,pipeline);
  assert.deepEqual(rmsReviewMarkers(off),[]);assert.deepEqual(rmsReviewMarkers(off,true),[]);
 }
 assert.equal(rmsReviewContext(ds,'slope',1,pipeline).summary({row:0,col:0}).outside,true);
});

test('route Review row uses persistent planning support on evidence, cost and other branch maps; tracing retains sources',()=>{
 const ds=delivery(),fields=fieldsFor(ds),planning={active:true,branch:'slope',matchSettings:{}},path=createProposedPath(ds,fields,[center],null,planning);
 const context=rmsReviewContext(ds,'slope',1),session=createSession(ds,{selection:{layerId:'slope',cell:{row:3,col:3}}});
 const snapshot=session.getSnapshot(),before=JSON.stringify(snapshot.record);
 for(const layer of ['height-rms','terrain','lola-spots','assessment','roughness','traversal-cost']){
  const html=proposedPathHTML(path,null,{planning,layer,reviewContext:context});
  assert.match(html,/data-path-row="review"/);assert.match(html,/1 marked/);assert.match(html,/1 of 8 supporting heights exceed your 1 m review threshold; 2 RMS unknown/);
  const trace=tracePresentation(snapshot,path,true,{rmsReview:1});
  assert.equal(trace.centreRole,'result');assert.equal(trace.selectedInput,null);assert.equal(trace.routeContext,true);
  assert.deepEqual(snapshot.sources.map(c=>c.index),snapshot.record.sourceCells.map(c=>c.index));
 }
 assert.equal(JSON.stringify(snapshot.record),before);
 assert.doesNotMatch(proposedPathHTML(path,null,{planning,layer:'height-rms'}),/data-path-row="review"/);
 const html=inspectorHTML(snapshot,new Set(['inputs','sources']),{rmsReview:1});
 assert.match(html,/1 of 8 supporting heights exceed your 1 m review threshold; 2 RMS unknown/);
 assert.match(html,/data-review-source=/);assert.match(html,/rms-review-trigger/);assert.match(html,/RMS unknown/);
 assert.match(html,/Derived uncertainty<\/dt><dd>Not estimated/);
 assert.equal(snapshot.sources.some(c=>c.index===at(5,5)),false);
 const triggering=snapshot.sources.find(c=>rmsReviewState(c.heightRMS_m,1)==='trigger');
 const next=session.dispatch({type:'source',index:triggering.index});assert.equal(next.trail.length,2);assert.equal(next.selection.layerId,'heights');
 assert.match(inspectorHTML(next,new Set(),{rmsReview:1}),/Review: RMS 2 m &gt;|Review: RMS 2 m >/);
});

test('review display preserves approved route, terrain costs, revision and supplier metadata',()=>{
 const ds=delivery(),fields=fieldsFor(ds),pipeline=withTraversalCost(createDatasetPipeline(ds));
 const plan=createSupervisoryPlan(ds,fields,{start:{row:4,col:3},goal:{row:4,col:6},branch:'slope',limits:{slopeDeg:15,roughness_m:.15},matchSettings:{heights:false,affected:false}});
 plan.dispatch({type:'plan'});plan.dispatch({type:'approve'});
 const before=plan.exportPlan(),costs=Array.from(fields['traversal-cost'].values),rms=Array.from(ds.heightRMS);
 const route=before.current.route,path=createProposedPath(ds,fields,route.vertices,route,{active:true,branch:'slope'});
 for(const threshold of [null,0,1,2,100,null])for(const rmsHeights of [false,true])for(const rmsResults of [false,true])for(const layer of ['terrain','height-rms','slope','roughness','assessment','traversal-cost']){
  const map=createSurfaceMap(ds,fields,layer,{rmsReview:threshold,rmsHeights,rmsResults},undefined,pipeline);rmsReviewMarkers(map);rmsReviewMarkers(map,true);
  proposedPathHTML(path,null,{planning:before.current,layer,reviewContext:rmsRouteReviewContext(ds,'slope',{rmsReview:threshold,rmsHeights,rmsResults},pipeline)});
 }
 assert.deepEqual(plan.exportPlan(),before);assert.equal(before.current.status,'Approved');
 assert.deepEqual(Array.from(fields['traversal-cost'].values),costs);assert.deepEqual(Array.from(ds.heightRMS),rms);assert.equal(ds.quality,undefined);
 const app=readFileSync(new URL('../editor/app.js',import.meta.url),'utf8');
 const handler=app.slice(app.indexOf("$('rms-review-threshold').addEventListener"),app.indexOf("$('pipeline').addEventListener"));
 assert.doesNotMatch(handler,/changePlan|plan\.dispatch|syncPath|update\(/);assert.match(handler,/aria-invalid/);assert.match(handler,/if\(!valid\)return/);
});

// Operator scopes share the same semantics on maps, traces, inspections and routes.
test('RMS display preferences default on and persist independently without a threshold',()=>{
 const params=new URLSearchParams();assert.deepEqual(rmsReviewTogglesFromParams(params),{rmsHeights:true,rmsResults:true});
 for(const rmsHeights of [false,true])for(const rmsResults of [false,true]){
  writeRMSReviewToggleParams(params,{rmsHeights,rmsResults});
  assert.deepEqual(rmsReviewTogglesFromParams(params),{rmsHeights,rmsResults});
  assert.equal(params.has('rmsreview'),false);
 }
 assert.deepEqual(rmsReviewVisibility({rmsReview:null,rmsHeights:true,rmsResults:true}),{threshold:null,heights:false,results:false});
 assert.deepEqual(rmsReviewVisibility({rmsReview:0,rmsHeights:false,rmsResults:true}),{threshold:0,heights:false,results:true});
});
for(const rmsHeights of [false,true])for(const rmsResults of [false,true])test(`independent RMS scopes heights=${rmsHeights} results=${rmsResults}`,()=>{
 const ds=delivery(),fields=fieldsFor(ds),options={rmsReview:1,rmsHeights,rmsResults},source=at(5,5);
 const session=createSession(ds,{selection:{layerId:'slope',cell:{row:3,col:3}}}),snapshot=session.getSnapshot(),before=JSON.stringify(snapshot.record);
 for(const layer of ['terrain','height-rms','slope','roughness','assessment','traversal-cost']){
  const map=createSurfaceMap(ds,fields,layer,options);
  assert.equal(rmsReviewMarkers(map,true).some(c=>c.index===source),rmsHeights);
  assert.equal(Boolean(map.rmsReview),rmsResults);
  assert.equal(Boolean(map.rmsReviewSources),rmsHeights);
  assert.equal(map.field,fields[layer==='terrain'?'heights':layer==='assessment'?'combined':layer]);
  const legend=mapLegendHTML(map,true);
  assert.equal(legend.includes('source RMS &gt;'),rmsHeights);
  assert.equal(legend.includes('affected results · shown branch inputs'),rmsResults&&map.node!=='heights');
 }
 const html=inspectorHTML(snapshot,new Set(['inputs','sources']),options);
 assert.equal(html.includes('aria-label="Operator RMS review"'),rmsResults);
 assert.equal(html.includes('class="cell-review-label"'),rmsHeights);
 assert.equal(/class="height-cell [^"]*rms-review-trigger/.test(html),rmsHeights);
 assert.equal(html.includes('data-review-source='),rmsResults);
 assert.match(html,/Height RMS \(m\)/);assert.match(html,/Largest RMS/);
 const native=session.dispatch({type:'source',index:at(4,4)});
 assert.equal(inspectorHTML(native,new Set(),options).includes('aria-label="Operator RMS review"'),rmsHeights);
 const context=rmsRouteReviewContext(ds,'slope',options);
 assert.equal(Boolean(context),rmsHeights||rmsResults);
 if(context){
  const summary=context.summary(center),text=rmsReviewText(summary);
  assert.equal(text.includes('Own height:'),rmsHeights);assert.equal(text.includes('Planning inputs:'),rmsResults);
  if(rmsResults)assert.match(text,/1 of 8 supporting heights/);
  assert.equal(summary.ownTriggered,rmsHeights);assert.equal(summary.resultsTriggered,rmsResults);
 }
 const planning={active:true,branch:'slope',matchSettings:{}},path=createProposedPath(ds,fields,[center],null,planning);
 const strip=proposedPathHTML(path,null,{planning,reviewContext:context});
 assert.equal(strip.includes('data-path-row="review"'),rmsHeights||rmsResults);
 assert.match(strip,/data-path-row="input-rms"/);
 assert.equal(JSON.stringify(snapshot.record),before);
 // A centre-only trigger marks own heights but never invents a slope input.
 ds.heightRMS.fill(0);ds.heightRMS[source]=99;
 const centreContext=rmsRouteReviewContext({...ds},'slope',options);
 if(centreContext){assert.equal(centreContext.summary(center).triggered>0,rmsHeights);assert.equal(centreContext.summary(center).resultsTriggered,false);}
 assert.equal(rmsRouteReviewContext(ds,'slope',{...options,rmsReview:null}),null);
 assert.equal(rmsRouteReviewContext(base,'slope',options),null);
});

test('inspector distinguishes own route height from exact selected slope support',()=>{
 const ds=delivery(),session=createSession(ds,{selection:{layerId:'slope',cell:{row:3,col:3}}}),snapshot=session.getSnapshot();
 const options={rmsReview:1,rmsHeights:true,rmsResults:true};
 const routeReview=rmsRouteReviewContext(ds,'slope',options).summary(center);
 const html=inspectorHTML(snapshot,new Set(),options,null,{routeReview});
 assert.match(html,/1 of 8 supporting heights/);assert.doesNotMatch(html,/of 9 supporting heights/);
 assert.match(html,/Route review: Own height:/);assert.doesNotMatch(html,/Route planning inputs: Own height/);
 assert.equal((html.match(/1 of 8 supporting heights/g)||[]).length,1);
});
