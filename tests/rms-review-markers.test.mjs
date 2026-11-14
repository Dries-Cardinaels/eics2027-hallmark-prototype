import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetById} from '../src/fixtures/terrain.js';
import {createSession} from '../editor/session.js';
import {rmsReviewField,rmsRouteReviewContext} from '../editor/rms-review.js';
import {raisedRMSReviewMarkers,raisedRMSReviewText} from '../editor/rms-review-markers.js';

const base=datasetById('reference'),cell={row:5,col:5},index=cell.row*base.W+cell.col;
function setup(heights,results,centreOnly=false){
  const dataset={...base,heightRMS:new Float64Array(base.heights.length).fill(0)};
  dataset.heightRMS[index]=99;
  if(!centreOnly)dataset.heightRMS[index-base.W-1]=2;
  const snapshot=createSession(dataset,{selection:{layerId:'slope',cell:{row:3,col:3}}}).getSnapshot();
  const options={rmsReview:1,rmsHeights:heights,rmsResults:results};
  const map={dataset,sourceGrid:snapshot.sourceGrid,rmsReviewSources:heights?rmsReviewField(dataset,'heights',1):null,rmsReview:results?rmsReviewField(dataset,'slope',1):null};
  const path={cells:[{...cell,index:7},{row:4,col:4,index:8}]};
  return {map,snapshot,path,context:rmsRouteReviewContext(dataset,'slope',options)};
}
for(const heights of [false,true])for(const results of [false,true])test(`raised review merges native identity and retains route in Trace: ${heights}/${results}`,()=>{
  const {map,snapshot,path,context}=setup(heights,results);
  for(const inspect of [false,true]){
    const markers=raisedRMSReviewMarkers(map,snapshot,path,inspect,context),center=markers.find(c=>c.index===index);
    assert.equal(Boolean(center),heights||results);
    assert.equal(new Set(markers.map(c=>c.index)).size,markers.length);
    if(center){
      assert.deepEqual(center.routeIndices,[7]);assert.notEqual(center.index,7);
      assert.equal(center.roles.some(r=>r.role==='route-own-height'),heights);
      assert.equal(center.roles.some(r=>r.role==='route-planning-inputs'),results);
      assert.equal(center.roles.some(r=>r.role==='selected-result-inputs'),results);
      assert.match(raisedRMSReviewText(center),/Your RMS review rule triggered/);
      if(heights){assert.match(raisedRMSReviewText(center),/Own height: RMS 99 m exceeds your 1 m/);assert.doesNotMatch(raisedRMSReviewText(center),/undefined/);}
    }
    const source=markers.find(c=>c.index===index-base.W-1);
    if(inspect&&heights)assert.equal(source.roles.some(r=>r.role==='traced-height'),true);
  }
});
test('undeclared slope center marks own height without inventing selected or planning input triggers',()=>{
  const {map,snapshot,path,context}=setup(true,true,true);
  const markers=raisedRMSReviewMarkers(map,snapshot,path,true,context),center=markers.find(c=>c.index===index);
  assert.equal(center.roles.some(r=>r.role==='selected-result-inputs'||r.role==='route-planning-inputs'),false);
  assert.equal(center.roles.some(r=>r.role==='undeclared-own-height'),true);
  assert.match(raisedRMSReviewText(center),/not in the footprint of the selected result/);
  assert.equal(raisedRMSReviewMarkers({...map,rmsReviewSources:null},snapshot,null,true).length,0);
});
test('selected native source alone gets own-height marker; equality and unknown remain unmarked',()=>{
  const {map,snapshot}=setup(true,false);
  const source={...snapshot,heightCell:cell,record:{kind:'source'},sources:[]};
  assert.deepEqual(raisedRMSReviewMarkers(map,source,null).map(c=>c.index),[index]);
  assert.equal(raisedRMSReviewMarkers(map,snapshot,null).length,1,'context is not scanned for raised marks');
  for(const value of [1,NaN,-1,null]){
    map.dataset.heightRMS[index]=value;
    assert.equal(raisedRMSReviewMarkers(map,source,null).length,0);
  }
});

test('route-only own-height tooltip reports supplied RMS',()=>{
  const {map,snapshot,path,context}=setup(true,false);
  const routeOnly={...snapshot,heightCell:null};
  const marker=raisedRMSReviewMarkers(map,routeOnly,path,false,context).find(c=>c.index===index);
  assert.match(raisedRMSReviewText(marker),/Own height: RMS 99 m exceeds your 1 m/);
});
