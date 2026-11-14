import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetById} from '../src/fixtures/terrain.js';
import {evaluate,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {createSession} from '../editor/session.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {createSurfaceMap} from '../editor/surface-map.js';
import {flaggedResults,flaggedBoundary,surfaceHeight,evidenceVisibility,tracePresentation} from '../editor/evidence-geometry.js';

test('spatial flag regions match query support, not the selected center quality',()=>{
  const base=datasetById('reference');
  const ds={...base,grid:{east:1000,north:2000},res:4,quality:{codes:base.heights.map((_,i)=>i===9*base.W+5?3:14),flaggedCodes:[3]}};
  const evaluation=evaluate(ds);
  for(const node of ['slope','roughness']){
    const fields={[node]:evaluateRaster(ds,node)};
    const map=createSurfaceMap(ds,fields,node,true),markers=flaggedResults(map);
    const expected=[];
    for(let r=0;r<map.grid.H;r++)for(let c=0;c<map.grid.W;c++)if(query(evaluation,node,{row:r,col:c}).quality.suspicious>0)expected.push((r+2)*ds.W+c+2);
    assert.deepEqual(markers.map(m=>m.index),expected);
    for(const m of markers){assert.equal(m.east,1000+(m.col+.5)*4);assert.equal(m.north,2000-(m.row+.5)*4);assert.equal(m.height,ds.heights[m.index]);}
    assert.equal(markers.some(m=>m.index===9*ds.W+5),node==='roughness');
    assert.deepEqual(flaggedResults(createSurfaceMap(ds,fields,node,false)),[]);
  }
});

test('flag boundaries keep holes and do not join across row edges',()=>{
  const W=5,cells=[];
  for(let r=1;r<4;r++)for(let c=1;c<4;c++)if(r!==2||c!==2)cells.push({row:r,col:c,index:r*W+c});
  const boundary=flaggedBoundary(cells,W);
  assert.equal(boundary.length,16); // Twelve exterior edges, four around the hole.
  assert.ok(boundary.some(c=>c.row===1&&c.col===2&&c.side==='south'));
  assert.equal(flaggedBoundary([{row:0,col:4,index:4},{row:1,col:0,index:5}],W).length,8);
});

test('annotation heights follow native triangles without adding measured heights',()=>{
  const ds={W:2,H:2,heights:[0,0,0,10]},before=[...ds.heights];
  assert.equal(surfaceHeight(ds,.25,.25),0);
  assert.equal(surfaceHeight(ds,.75,.75),5); // Bilinear sampling would incorrectly place this at 5.625.
  assert.equal(surfaceHeight(ds,1,1),10);
  assert.deepEqual(ds.heights,before);
  ds.heights[3]=NaN;
  assert.equal(surfaceHeight(ds,0,0),0);
  assert.ok(Number.isNaN(surfaceHeight(ds,.75,.75)));
});


test('quality-region toggle remains effective while tracing without changing exact source evidence',()=>{
 const base=datasetById('reference'),ds={...base,quality:{codes:base.heights.map((_,i)=>i%3?14:3)}};
 const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)]));
 const fields={...values,...evaluateLimitRasters(ds,values)};
 const snapshot=createSession(ds,{selection:{layerId:'slope-criterion',cell:{row:5,col:3}}}).getSnapshot(),sourceIndices=snapshot.sources.map(c=>c.index);
 assert.equal(sourceIndices.length,8);
 for(const flags of [false,true]){
  const map=createSurfaceMap(ds,fields,'slope-criterion',flags),before=flaggedResults(map).map(c=>c.index);
  for(const inspect of [false,true]){
   const visibility=evidenceVisibility(map,inspect);
   assert.equal(visibility.regions,flags);assert.equal(visibility.sources,inspect);assert.equal(visibility.suspiciousSources,inspect&&flags);
   const legend=mapLegendHTML(map,inspect);
   assert.equal(legend.includes('Affected results · input flags'),flags);
   assert.equal(legend.includes('Traced suspicious height'),inspect&&flags);
   assert.deepEqual(flaggedResults(map).map(c=>c.index),before);
   assert.deepEqual(snapshot.sources.map(c=>c.index),sourceIndices);
  }
 }
 const heightMap=createSurfaceMap(ds,fields,'terrain',true);
 assert.match(mapLegendHTML(heightMap,true),/Height flags · supplied/);
 assert.doesNotMatch(mapLegendHTML(heightMap,true),/Affected results/);
 const qualityMap=createSurfaceMap(ds,fields,'quality',true);
 assert.equal(evidenceVisibility(qualityMap,true).regions,false);assert.match(mapLegendHTML(qualityMap,true),/Traced suspicious height/);
 const absentMap=createSurfaceMap(base,fields,'slope',true);
 assert.deepEqual(evidenceVisibility(absentMap,true),{regions:false,heightFlags:false,sources:true,suspiciousSources:false});
});

test('trace context excludes every queried source cell and marks an undeclared center as the result, not as excluded with unknown Earth quality',()=>{
 const ds={...datasetById('reference'),res:1},path={cells:Array.from({length:7},(_,index)=>({row:7,col:index+2,index}))};
 for(const [layer,count,role] of [['slope',8,'result'],['roughness',25,'input']]){
  const session=createSession(ds,{selection:{layerId:layer,cell:{row:5,col:3}}}),snapshot=session.getSnapshot(),sourceIndices=snapshot.sources.map(cell=>cell.index),before=JSON.stringify(snapshot.record);
  const overview=tracePresentation(snapshot,path,false);assert.deepEqual(overview.routeCells,path.cells);assert.equal(overview.routeContext,false);assert.equal(overview.routeFlags,true);assert.equal(overview.selectedResult,false);
  const trace=tracePresentation(snapshot,path,true),support=new Set(sourceIndices);
  assert.equal(snapshot.sources.length,count);assert.equal(trace.routeContext,true);assert.equal(trace.routeFlags,false);assert.equal(trace.selectedResult,true);assert.equal(trace.centreRole,role);assert.deepEqual(trace.sourceFlags,[]);
  assert.ok(trace.routeCells.length>0);assert.ok(trace.routeCells.every(cell=>!support.has(cell.row*ds.W+cell.col)));
  assert.ok(trace.routeCells.every(cell=>cell.row!==snapshot.heightCell.row||cell.col!==snapshot.heightCell.col));
  assert.equal(Boolean(trace.selectedInput),layer==='roughness');assert.equal(JSON.stringify(snapshot.record),before);assert.deepEqual(snapshot.sources.map(cell=>cell.index),sourceIndices);
  if(layer==='roughness'){
   assert.equal(trace.selectedInput.index,7*ds.W+5);session.dispatch({type:'input',layerId:'heights',cell:{row:7,col:5}});
   const source=session.getSnapshot(),sourceTrace=tracePresentation(source,path,true);assert.equal(sourceTrace.selectedResult,false);assert.equal(sourceTrace.centreRole,'source');assert.equal(source.sources.length,1);assert.deepEqual(sourceTrace.sourceFlags,[]);
  }
 }
});
