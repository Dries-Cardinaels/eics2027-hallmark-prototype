import {withTraversalCost} from '../editor/traversal-cost.js';
import {createDatasetPipeline} from '../src/core/pipeline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetById} from '../src/fixtures/terrain.js';
import {evaluateLazy,query} from '../src/core/index.js';
import {routeRMSContext,highestRouteRMS} from '../editor/route-rms.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {pathDisplayRecord,pathDisplayColour} from '../editor/path-evidence.js';
import {valueColour} from '../editor/surface-map.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {createSurfaceMap} from '../editor/surface-map.js';
import {numericEvidenceFields} from '../editor/source-evidence.js';

const base=datasetById('reference');
const ds={...base,heightRMS:Float64Array.from(base.heights,(_,i)=>i/100)};
for(const branch of ['heights','slope','slope-criterion','roughness','roughness-criterion','combined','traversal-cost'])test('route RMS uses query declared support: '+branch,()=>{
 const node=branch;
 const context=routeRMSContext(ds,branch),ev=evaluateLazy(ds,undefined,withTraversalCost(createDatasetPipeline(ds))),cell={row:5,col:5};
 const expected=query(ev,node,branch==='heights'?cell:{row:3,col:3}).inputHeightRMS;
 assert.deepEqual(context.summary(cell),{...expected,branch});
});
test('slope excludes center; roughness includes it; partial, zero and unknown remain explicit',()=>{
 const values=new Float64Array(ds.heights.length).fill(0);values[5*ds.W+5]=99;values[4*ds.W+4]=NaN;
 const dataset={...ds,heightRMS:values};
 const slope=routeRMSContext(dataset,'slope').summary({row:5,col:5});
 assert.equal(slope.max,0);assert.equal(slope.known,7);assert.equal(slope.total,8);
 assert.equal(routeRMSContext(dataset,'roughness').summary({row:5,col:5}).max,99);
 values.fill(NaN);assert.equal(routeRMSContext(dataset,'slope').summary({row:5,col:5}).max,null);
});
test('route presentation shares native continuous range and ranks only known maxima',()=>{
 const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)]));
 const fields={...values,...evaluateLimitRasters(ds,values,{slopeDeg:15,roughness_m:.15}),...numericEvidenceFields(ds)};
 const configuration={active:true,branch:'slope'},path=createProposedPath(ds,fields,[{row:4,col:3},{row:4,col:6}],null,configuration);
 assert.deepEqual(path.heightRMSRange,fields['height-rms'].range);
 for(const cell of path.cells){const record=pathDisplayRecord(cell,'height-rms');assert.equal(record.value,cell.inputHeightRMS.max);assert.equal(pathDisplayColour(record,'height-rms',path.heightRMSRange),'#'+valueColour(record.value,path.heightRMSRange).map(v=>v.toString(16).padStart(2,'0')).join(''));}
 const html=proposedPathHTML(path,null,{planning:configuration,layer:'height-rms'});
 assert.match(html,/Max input RMS \(m\)/);assert.match(html,/known/);
 const legend=mapLegendHTML(createSurfaceMap(ds,fields,'height-rms',false),false,configuration);assert.match(legend,/Slope inputs/);assert.match(legend,/same scale/);
 assert.equal(highestRouteRMS({cells:[{index:0,inputHeightRMS:{max:4}},{index:1,inputHeightRMS:{max:4}},{index:2,inputHeightRMS:{max:null}}]}).index,1);
 assert.equal(highestRouteRMS({cells:[{index:0,inputHeightRMS:{max:null}}]}),null);
});

test('selected route RMS is primary, unknown has no metre suffix, and tracing retains RMS colours',async()=>{
 const {routeRMSHTML}=await import('../editor/inspector.js');
 const {routeFillOpacity}=await import('../editor/path-evidence.js');
 const known=routeRMSHTML({branch:'slope',known:8,total:8,min:.131,max:.985});
 assert.match(known,/Route max input height RMS · Slope/);
 assert.match(known,/<b>0.985 m<\/b>/);
 const unknown=routeRMSHTML({branch:'slope',known:0,total:8,min:null,max:null});
 assert.match(unknown,/<b>Unknown<\/b>/);assert.doesNotMatch(unknown,/Unknown m/);
 assert.equal(routeFillOpacity('height-rms',true),1);
 assert.equal(routeFillOpacity('slope',true),.3);
 assert.equal(routeFillOpacity('lola-spots',true),.3);
});

test('largest RMS source inspection uses exact query support and preserves route breadcrumb',async()=>{
 const {createSession}=await import('../editor/session.js');
 const {largestRMSSources}=await import('../editor/route-rms.js');
 const {inspectorHTML}=await import('../editor/inspector.js');
 const rms=new Float64Array(ds.heights.length).fill(NaN),center=5*ds.W+5,first=4*ds.W+4,second=4*ds.W+5;
 rms[center]=99;rms[first]=2;rms[second]=2;rms[6*ds.W+6]=0;
 const dataset={...ds,heightRMS:rms},session=createSession(dataset);
 let selected=session.dispatch({type:'path-select',pathId:'test',index:3,layerId:'slope',cell:{row:3,col:3}});
 assert.deepEqual(largestRMSSources(selected.sources).map(c=>c.index),[first,second]);
 const html=inspectorHTML(selected,new Set(['inputs']));
 assert.match(html,/data-largest-rms/);assert.match(html,/2 tied cells · first in grid order/);assert.match(html,/Largest RMS · tied/);
 assert.match(html,/Derived uncertainty<\/dt><dd>Not estimated/);
 assert.throws(()=>session.dispatch({type:'source',index:center}),/not a declared source/);
 const source=session.dispatch({type:'source',index:first});
 assert.equal(source.selection.layerId,'heights');assert.equal(source.heightHere.heightRMS_m,2);
 assert.equal(source.trail.length,2);assert.deepEqual(source.pathSelection,selected.pathSelection);
 const sourceHTML=inspectorHTML(source,new Set(),{},null,{routeCell:{inputHeightRMS:{max:2}}},'height-rms');
 assert.match(sourceHTML,/Supplied height RMS/);assert.doesNotMatch(sourceHTML,/Route max input height RMS/);
 assert.deepEqual(session.dispatch({type:'back'}).selection,selected.selection);
 selected=session.dispatch({type:'select',layerId:'roughness',cell:{row:3,col:3}});
 assert.equal(largestRMSSources(selected.sources)[0].index,center);
 assert.deepEqual(largestRMSSources([{index:0,heightRMS_m:null},{index:1,heightRMS_m:NaN}]),[]);
 assert.equal(largestRMSSources([{index:0,heightRMS_m:0}])[0].heightRMS_m,0);
});
