import test from 'node:test';
import assert from 'node:assert/strict';
import {planBoundedGaps} from '../tools/bounded-gap-fill.mjs';
test('fill radius includes its boundary but cannot expand through newly filled posts',()=>{
 const p=planBoundedGaps({matched:[1,0,0,0,0,0,1],inOverlap:Array(7).fill(1),W:7,H:1,res:2,maxDistance_m:4});
 assert.deepEqual([...p.distance_m],[0,2,4,6,4,2,0]);
 assert.deepEqual([...p.fill],[0,1,1,0,1,1,0]);
});
test('outside coverage is not filled or traversed to borrow evidence',()=>{
 const p=planBoundedGaps({matched:[1,0,0,0,0],inOverlap:[1,1,0,1,1],W:5,H:1,res:2,maxDistance_m:20});
 assert.deepEqual([...p.fill],[0,1,0,0,0]);
 assert.equal(p.distance_m[3],Infinity);
});
test('a covered component without a stereo match remains absent',()=>{
 const p=planBoundedGaps({matched:Array(9).fill(0),inOverlap:Array(9).fill(1),W:3,H:3,res:2,maxDistance_m:4});
 assert.ok([...p.fill].every(v=>v===0));
});
