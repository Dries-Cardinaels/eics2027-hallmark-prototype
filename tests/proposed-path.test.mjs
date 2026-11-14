import {palette} from '../editor/palette.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLazy,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {crossedCells,createProposedPath,proposedPathHTML,proposedPathSummary} from '../editor/proposed-path.js';
import {createSession} from '../editor/session.js';
import {cellCenter,layerGrid} from '../editor/spatial.js';
import {mapNode,mapStage,createSurfaceMap,sampleSurfaceMap,valueColour} from '../editor/surface-map.js';
import {pathEvidenceScope,pathFlaggedCells,pathAssessmentScope,pathAssessment,pathAssessmentOutcome,pathAssessmentLayer,pathDisplayRecord,pathDisplayColour,pathDisplayText} from '../editor/path-evidence.js';
import {compareRoutes,routeComparisonHTML} from '../editor/route-comparison.js';

const fieldsFor=ds=>Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)]));
const state=q=>{const outcomes=q.outcomes?Object.values(q.outcomes):[q.available?q.outcome:'unavailable'];return outcomes.includes('exceeded')?1:outcomes.includes('unavailable')?2:0;};

test('closed-cell path traversal retains all corner touches and every long-segment cell',()=>{
 assert.deepEqual(crossedCells([{row:1,col:1},{row:2,col:2}],5,5),[{row:1,col:1},{row:1,col:2},{row:2,col:1},{row:2,col:2}]);
 assert.deepEqual(crossedCells([{row:2,col:0},{row:2,col:99}],100,5),Array.from({length:100},(_,col)=>({row:2,col})));
 assert.deepEqual(crossedCells([{row:1.5,col:0},{row:1.5,col:3}],4,4).map(c=>`${c.row},${c.col}`).sort(),['1,0','1,1','1,2','1,3','2,0','2,1','2,2','2,3']);
 const cells=crossedCells([{row:0,col:0},{row:3,col:3},{row:0,col:0}],4,4);assert.equal(cells.length,new Set(cells.map(c=>c.row*4+c.col)).size);
});

for(const id of ['reference','missing'])test(`path uses exact native-cell queries for both criteria and combined support: ${id}`,()=>{
 const base=datasetById(id),ds={...base,focus:[5,5],quality:{codes:base.heights.map((_,i)=>i%3?14:3)}};
 const values=fieldsFor(ds),vertices=[{row:2,col:2},{row:ds.H-3,col:ds.W-3}];
 for(const limits of [{slopeDeg:0,roughness_m:0},{slopeDeg:90,roughness_m:100}]){
  const fields={...values,...evaluateLimitRasters(ds,values,limits)},path=createProposedPath(ds,fields,vertices),ev=evaluateLazy(ds,limits);
  for(const cell of path.cells){
   const ref={row:cell.row-2,col:cell.col-2},combined=query(ev,'combined',ref);
   assert.equal(cell.state,state(combined));assert.equal(cell.incomplete,Object.values(combined.outcomes).includes('unavailable'));
   assert.equal(cell.suspicious,combined.quality.suspicious);assert.equal(cell.total,combined.sourceCells.length);
   for(const branch of ['slope','roughness']){
    const q=query(ev,branch+'-criterion',ref);assert.equal(cell[branch].state,state(q));
    assert.equal(cell[branch].value,q.available?q.value:null);assert.equal(cell[branch].suspicious,q.quality.suspicious);assert.equal(cell[branch].total,q.sourceCells.length);
   }
  }
  if(id==='missing')assert.ok(path.cells.some(c=>c.incomplete));
 }
});

test('path selection retains identity through upstream evidence and limits, then clears on free map picks',()=>{
 const ds=datasetById('reference'),session=createSession(ds),cell={row:2,col:2};
 session.dispatch({type:'path-select',pathId:'example',index:7,cell});
 session.dispatch({type:'input',layerId:'slope-criterion',cell});
 session.dispatch({type:'input',layerId:'slope',cell});
 assert.deepEqual(session.getSnapshot().pathSelection,{pathId:'example',index:7});
 session.dispatch({type:'limits',limits:{slopeDeg:0}});assert.equal(session.getSnapshot().pathSelection.index,7);
 session.dispatch({type:'back',index:0});assert.equal(session.getSnapshot().selection.layerId,'combined');assert.equal(session.getSnapshot().pathSelection.index,7);
 session.dispatch({type:'pick',layerId:'slope',point:cellCenter(layerGrid(ds,{grid:'heights'}),{row:5,col:5})});assert.equal(session.getSnapshot().pathSelection,null);
});

test('path support and native coverage are independent of overview flags, map and limits; absent quality stays explicit',()=>{
 const ds={...datasetById('reference'),focus:[5,5]},values=fieldsFor(ds);
 const aFields={...values,...evaluateLimitRasters(ds,values,{slopeDeg:0,roughness_m:0})};
 const spaced={...ds,res:4},spacedValues=fieldsFor(spaced);
 const bFields={...spacedValues,...evaluateLimitRasters(spaced,spacedValues,{slopeDeg:90,roughness_m:100})};
 const a=createProposedPath(ds,aFields),b=createProposedPath(spaced,bFields);
 createSurfaceMap(ds,aFields,'slope',false);
 assert.deepEqual(a.cells.map(({row,col,suspicious,total})=>({row,col,suspicious,total})),b.cells.map(({row,col,suspicious,total})=>({row,col,suspicious,total})));
 assert.ok(a.cells.every(c=>c.suspicious===null));assert.match(proposedPathHTML(a,null),/Quality not supplied/);
 for(const layer of ['slope','slope-criterion','roughness','roughness-criterion','assessment']){
  const scope=pathEvidenceScope(layer);assert.deepEqual(pathFlaggedCells(a,scope),[]);assert.match(proposedPathHTML(a,null,{scope}),/Quality not supplied/);
  const comparison=compareRoutes(a,a,scope);assert.equal(comparison.previous.suspiciousCells,null);assert.equal(comparison.proposed.suspiciousCells,null);assert.match(routeComparisonHTML(comparison),/Not supplied/);
  assert.doesNotMatch(proposedPathHTML(a,null,{scope,qualityOptions:{heights:false,affected:false}}),/Not supplied|Quality not supplied|data-path-row="height-inputs"/);
  assert.doesNotMatch(routeComparisonHTML(comparison,{heights:false,affected:false}),/Not supplied|data-comparison-metric="suspiciousCells"/);
 }
 assert.notDeepEqual(a.cells.map(c=>c.state),b.cells.map(c=>c.state));
 assert.equal(mapStage('roughness','limits'),'roughness-criterion');assert.equal(mapNode('slope','limits'),'slope-criterion');
});


test('path summary reports native dimensions once and tracks criterion outcomes separately from suspicious support',()=>{
 const cell=(index,slope,roughness,suspicious)=>({index,row:128,col:128+index,state:slope===1||roughness===1?1:0,incomplete:false,suspicious,total:25,slope:{state:slope},roughness:{state:roughness}});
 const path={id:'current',res:4,cells:[cell(0,0,1,13),cell(1,0,0,0)]};
 assert.equal(proposedPathSummary(path),'2 cells · 4 × 4 m');
 assert.equal(proposedPathSummary({...path,res:1}),'2 cells · 1 × 1 m');
 const html=proposedPathHTML(path,{pathId:'current',index:0});
 assert.equal((html.match(/data-path-cell=/g)||[]).length,2);
 for(const row of ['slope','roughness','height-inputs'])assert.equal((html.match(new RegExp('data-path-row="'+row+'"','g'))||[]).length,2);
 assert.match(html,/data-path-row="slope" class="track-state-0">●/);
 assert.match(html,/data-path-row="roughness" class="track-state-1">×/);
 assert.match(html,/13 of 25 suspicious height inputs/);
 assert.match(html,/quality-flagged">!/);assert.match(html,/quality-unflagged">·/);
 assert.match(html,/No suspicious flags/);assert.doesNotMatch(html,/S ●|R ×|safe|unsafe/i);
 assert.equal((html.match(/#1/g)||[]).length,1);
 const unknown={...path,cells:path.cells.map(c=>({...c,suspicious:null,total:null}))};
 assert.match(proposedPathHTML(unknown,null),/Not supplied/);assert.match(proposedPathHTML(unknown,null),/quality-unknown">—/);
});

test('value-stage route and selection colours ignore limits while criterion outcomes change with neutral source views',()=>{
 const ds=datasetById('reference'),values=fieldsFor(ds),i=values.slope.values.findIndex((s,index)=>s>0&&Number.isFinite(s)&&values.roughness.values[index]>0&&values.roughness.values[index]<100);
 assert.ok(i>=0);
 const analysis={row:Math.floor(i/values.slope.grid.W),col:i%values.slope.grid.W},native={row:analysis.row+2,col:analysis.col+2};
 for(const [limits,expected] of [[{slopeDeg:90,roughness_m:0},{slope:0,roughness:1,combined:1}],[{slopeDeg:0,roughness_m:100},{slope:1,roughness:0,combined:1}],[{slopeDeg:90,roughness_m:100},{slope:0,roughness:0,combined:0}]]){
  const fields={...values,...evaluateLimitRasters(ds,values,limits)},path=createProposedPath(ds,fields,[native]),cell=path.cells[0],evaluation=evaluateLazy(ds,limits),selection={pathId:path.id,index:0};
  for(const layer of ['slope-criterion','roughness-criterion','assessment']){
   const scope=pathAssessmentScope(layer),q=query(evaluation,scope==='combined'?'combined':scope+'-criterion',analysis),result=pathAssessment(cell,layer);
   assert.equal(result.state,state(q));assert.equal(result.state,expected[scope]);assert.equal(result,scope==='combined'?cell:cell[scope]);
   const outcome=expected[scope]?'Exceeded':scope==='combined'?'Within limits':'Within limit';assert.equal(pathAssessmentOutcome(cell,layer),outcome);
   const html=proposedPathHTML(path,selection,{scope:pathEvidenceScope(layer),layer}),selected=html.match(/class="path-selected">([^<]+)/)[1];
   assert.ok(selected.endsWith(outcome));assert.match(html,new RegExp(`data-assessment-scope="${scope}"`));
   assert.match(html,new RegExp(`Path colors: ${scope==='combined'?'both-limit assessment':scope+' limit'}`));
   if(scope!=='combined')assert.doesNotMatch(html,/Path colors: both-limit assessment/);
  }
  for(const layer of ['slope','roughness']){
   assert.equal(pathAssessmentScope(layer),null);assert.equal(pathAssessment(cell,layer),null);assert.equal(pathAssessmentOutcome(cell,layer),null);assert.equal(pathAssessmentLayer(layer),layer);
   const record=pathDisplayRecord(cell,layer),q=query(evaluation,layer,analysis),range=values[layer].range;
   assert.equal(record.value,q.value);
   const expectedColour='#'+valueColour(values[layer].values[i],range).map(value=>value.toString(16).padStart(2,'0')).join('');
   assert.equal(pathDisplayColour(record,layer,range),expectedColour);
   const selectedSample=sampleSurfaceMap(createSurfaceMap(ds,fields,pathAssessmentLayer(layer),false),native);
   assert.equal(selectedSample.state,undefined);assert.equal(pathDisplayColour(selectedSample,layer,range),expectedColour);
   const html=proposedPathHTML(path,selection,{scope:pathEvidenceScope(layer),layer}),selected=html.match(/class="path-selected">([^<]+)/)[1],caption=html.match(/class="path-role">([^<]+)/)[1];
   assert.ok(selected.endsWith(pathDisplayText(cell,layer)));assert.doesNotMatch(selected,/Within|Exceeded|Incomplete/);assert.doesNotMatch(caption,/limit|assessment/);
   assert.match(html,/Slope limit/);assert.match(html,/Height spread limit/);assert.match(html,/data-assessment-scope="values"/);
  }
  for(const layer of ['terrain','quality','heights']){
   assert.equal(pathAssessmentScope(layer),null);assert.equal(pathAssessment(cell,layer),null);
   assert.equal(pathDisplayColour(pathDisplayRecord(cell,layer),layer),palette.input);
   const html=proposedPathHTML(path,selection,{scope:pathEvidenceScope(layer),layer});assert.match(html,/Path colors: supplied heights · distance only/);assert.doesNotMatch(html,/data-path-row="height-inputs"/);
  }
 }
});
