import test from 'node:test';
import assert from 'node:assert/strict';
import {cellCenter,layerGrid,nativeCellFootprint} from '../editor/spatial.js';
import {createSession} from '../editor/session.js';
import {selectionKeyHTML,layerNames} from '../editor/inspector.js';
import {datasetById} from '../src/fixtures/terrain.js';

for(const res of [1,4])test(`source and result footprints occupy the same ${res}m native square`,()=>{
 const ds={...datasetById('reference'),res,grid:{east:123,north:456}};
 const source=layerGrid(ds,{grid:'heights'}),derived=layerGrid(ds,{grid:'analysis'});
 const footprint=(grid,cell)=>nativeCellFootprint(cell).map(c=>cellCenter(grid,c));
 const sourceCorners=footprint(source,{row:7,col:5}),resultCorners=footprint(derived,{row:5,col:3});
 assert.deepEqual(resultCorners,sourceCorners);
 for(const corners of [sourceCorners,resultCorners]){
  assert.equal(Math.max(...corners.map(c=>c.east))-Math.min(...corners.map(c=>c.east)),res);
  assert.equal(Math.max(...corners.map(c=>c.north))-Math.min(...corners.map(c=>c.north)),res);
 }
 for(const [layerId,count] of [['slope',8],['roughness',25],['combined',25]]){
  const snapshot=createSession(ds,{selection:{layerId,cell:{row:5,col:3}}}).getSnapshot();
  assert.equal(snapshot.sources.length,count);
  const text=selectionKeyHTML(snapshot,true);
  assert.match(text,new RegExp(`${layerNames[layerId]} · 7, 5 · ${res} × ${res} m`));
  assert.match(text,new RegExp(`Trace: ${count} height cells · same grid`));assert.match(text,/not subdivisions/);
  if(layerId==='slope')assert.doesNotMatch(text,/Center/);else assert.match(text,/Center included · height input/);
  if(layerId!=='slope')assert.match(text,/class="input-key included-key"/);
  for(const input of snapshot.sources){const corners=footprint(source,input);assert.equal(corners[1].east-corners[0].east,res);}
 }
 const height=createSession(ds,{selection:{layerId:'heights',cell:{row:7,col:5}}}).getSnapshot();
 assert.match(selectionKeyHTML(height,true),/Heights · 7, 5/);
 assert.doesNotMatch(selectionKeyHTML(height,true),/Center included/);
 const pathSession=createSession(ds);pathSession.dispatch({type:'path-select',pathId:'route',index:7,cell:{row:5,col:3}});
 assert.match(selectionKeyHTML(pathSession.getSnapshot()),/Combined result · 7, 5.*Path #8/);
 assert.doesNotMatch(selectionKeyHTML({...height,pathSelection:{pathId:'route',index:7}}),/Path #/);assert.doesNotMatch(selectionKeyHTML(height,true),/Trace:/);
});
