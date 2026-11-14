import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetById} from '../src/fixtures/terrain.js';
import {surfaceHeight} from '../editor/evidence-geometry.js';
import {annotationHeight,displayGroundRGB} from '../editor/missing-cell-display.js';
import {createSession} from '../editor/session.js';
import {inspectorHTML} from '../editor/inspector.js';

function missingGroundDataset(){
  const base=datasetById('reference'),heights=[...base.heights];
  const index=8*base.W+8;heights[index]=NaN;
  return {...base,res:1,caseId:'earth',source:{date:'5–6 July 2021',product:'drone lidar ground returns'},heights,origins:heights.map(h=>Number.isFinite(h)?'observed':'absent'),groundCounts:heights.map(h=>Number.isFinite(h)?9:0)};
}

test('missing-bin display positioning never supplies a ground height or changes Moon positioning',()=>{
  const ds=missingGroundDataset(),index=8*ds.W+8;
  assert.ok(Number.isNaN(surfaceHeight(ds,8,8)));
  assert.ok(Number.isFinite(annotationHeight(ds,8,8)));
  assert.ok(Number.isNaN(ds.heights[index]));assert.equal(ds.groundCounts[index],0);
  const {groundCounts,...withoutCounts}=ds;
  assert.ok(Number.isNaN(annotationHeight(withoutCounts,8,8)));
  assert.equal(annotationHeight(ds,5,5),surfaceHeight(ds,5,5));
});

test('display RGB fills only absent ground bins and is cached per dataset',()=>{
  const ds=missingGroundDataset(),index=8*ds.W+8;
  ds.groundRGB=new Uint8Array(ds.W*ds.H*3);
  for(let i=0;i<ds.W*ds.H;i++) ds.groundRGB.set([100,120,140],i*3);
  ds.groundRGB.set([1,2,3],index*3);
  const display=displayGroundRGB(ds);
  assert.equal(displayGroundRGB(ds),display);
  assert.deepEqual([...display.subarray(3*index,3*index+3)],[100,120,140]);
  assert.deepEqual([...display.subarray(3*(index-1),3*(index-1)+3)],[100,120,140]);
  assert.deepEqual([...ds.groundRGB.subarray(3*index,3*index+3)],[1,2,3]);
});

test('slope excludes an empty center while roughness shows all queried cells with their actual counts',()=>{
  const ds=missingGroundDataset();
  for(const layerId of ['slope','roughness']){
    const snapshot=createSession(ds,{selection:{layerId,cell:{row:6,col:6}}}).getSnapshot();
    const html=inspectorHTML(snapshot,new Set(['inputs','sources']),{heights:false,affected:false});
    assert.match(html,/5–6 July 2021 · drone lidar ground returns/);
    assert.match(html,/Missing ground height · 0 ground returns/);
    assert.match(html,/No analysis height is supplied for this cell./);
    assert.equal((html.match(/data-hover-source=/g)||[]).length,snapshot.sources.length);
    for(const source of snapshot.sources)assert.match(html,new RegExp(`data-source-index="${source.index}"[\\s\\S]*?<td>${ds.groundCounts[source.index]}</td>`));
    if(layerId==='slope'){
      assert.equal(snapshot.record.available,true);assert.equal(snapshot.sources.length,8);assert.match(html,/Not in the footprint/);
    }else{
      assert.equal(snapshot.record.available,false);assert.equal(snapshot.sources.length,25);assert.match(html,/class="result unavailable">Incomplete/);assert.match(html,/Center included/);
    }
  }
  const source=createSession(ds,{selection:{layerId:'heights',cell:{row:8,col:8}}}).getSnapshot();
  assert.match(inspectorHTML(source),/0 ground returns · missing analysis height/);
});
