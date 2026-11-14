import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,illuminationTrace} from '../src/core/index.js';
import {sunProfile} from '../src/ui/sun-profile.js';
function example(){return {id:'profile-test',W:9,H:9,res:10,heights:Array(81).fill(100),origins:Array(81).fill('observed'),quality:{codes:Array(81).fill(14)},illuminationPeriod:{durationHours:3,samples:[{hour:.5,weightHours:1,azimuthDeg:90,elevationDeg:10},{hour:1.5,weightHours:1,azimuthDeg:270,elevationDeg:10},{hour:2.5,weightHours:1,azimuthDeg:90,elevationDeg:-5}]}};}
test('terrain profile explains the exact evaluated ray, with separate production and quality evidence',()=>{
 const ds=example();ds.heights[42]=110;ds.origins[42]='interpolated';ds.quality.codes[41]=3;
 const ev=evaluate(ds),east=illuminationTrace(ev,12,0),west=illuminationTrace(ev,{row:2,col:2},1),night=illuminationTrace(ev,12,2);
 assert.deepEqual(east.points.map(p=>p.index),[40,41,42,43,44]);
 assert.deepEqual(east.points.map(p=>p.distance_m),[0,10,20,30,40]);
 assert.equal(east.points[2].relativeHeight_m,10);assert.equal(east.points[2].angleDeg,Math.atan(.5)*180/Math.PI);
 assert.equal(east.points[2].blocksSun,true);assert.equal(east.reason,'Terrain-blocked');assert.equal(east.contributionHours,0);
 assert.equal(east.sample.suspicious,1);assert.equal(east.sample.interpolated,1);
 assert.equal(east.points[1].qualityCode,3);assert.equal(east.points[1].origin,'observed');
 assert.equal(west.reason,'Illuminated');assert.equal(west.contributionHours,1);
 assert.equal(night.reason,'Sun below horizon');assert.equal(night.points.length,0);assert.equal(night.contributionHours,0);
 assert.equal(east.illuminatedHours,1);assert.equal(east.periodHours,3);
 assert.match(sunProfile(east),/data-profile-index="42" data-blocks-sun="true"/);
 assert.match(sunProfile(night),/No terrain heights tested/);
 assert.throws(()=>illuminationTrace(ev,12,3),/Unknown recorded Sun sample/);
 // The inspector reads evaluated source values, not a newly mutated array or derived value.
 ds.heights[42]=900;assert.equal(illuminationTrace(ev,12,0).points[2].height_m,110);
});
test('missing terrain is a visible profile gap and yields unresolved contribution without inventing a height',()=>{
 const ds=example();ds.heights[42]=NaN;ds.origins[42]='absent';
 const t=illuminationTrace(evaluate(ds),12,0);
 assert.equal(t.reason,'Unresolved: missing heights');assert.equal(t.contributionHours,null);
 assert.equal(t.points[2].relativeHeight_m,null);assert.equal(t.points[2].angleDeg,null);
 assert.match(sunProfile(t),/data-missing-post="true"/);
 assert.doesNotMatch(sunProfile(t),/data-profile-index="42"|NaN|Infinity/);
});
