// Constructed 3 × 3 worked example of the manuscript (decided 6 Nov 2026: Ridge vocabulary; 1.5: "exceeds").
// A 3 × 3 neighbourhood at 2 m spacing (heights in m, north row first; changed from 0 m / 1 m on 9 Nov 2026):
//   −9 −7 −4
//   −5 −8 −7
//   −7 −7 −6
// Every height has a LOLA return except the eastern neighbour of the center (−7 m). The core needs a two-cell
// margin, so the neighbourhood sits in the middle of a 5 × 5 grid; the outer ring (−8 m, LOLA return) is not
// part of the example and is not read by slope.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluate,query} from '../src/core/index.js';

const cases=JSON.parse(await readFile(new URL('../editor/data/cases.json',import.meta.url),'utf8'));
const W=5,H=5,EAST=2*W+3;
const NEIGHBOURHOOD=[[-9,-7,-4],[-5,-8,-7],[-7,-7,-6]];
function example(){
 const heights=Array(W*H).fill(-8),lolaCounts=Array(W*H).fill(1);
 NEIGHBOURHOOD.forEach((row,r)=>row.forEach((h,c)=>{heights[(r+1)*W+c+1]=h;}));
 lolaCounts[EAST]=0;
 return {id:'worked-3x3',W,H,res:2,heights,origins:Array(W*H).fill('undocumented'),lolaCounts,lolaReturns:cases['connecting-ridge'].lolaReturns};
}

test('3×3 worked example: slope, declared inputs and inherited LOLA evidence',()=>{
 const ev=evaluate(example(),{slopeDeg:15,roughness_m:null});
 const q=query(ev,'slope',{row:0,col:0});
 // Horn: east column (−4 + 2·(−7) − 6 = −24 m) minus west column (−9 + 2·(−5) − 7 = −26 m) = 2 m,
 // dz/dx = 2 m / (8 · 2 m) = 1/8; north row (−27 m) equals south row (−27 m), dz/dy = 0; slope = atan(1/8).
 assert.ok(Math.abs(q.value-Math.atan(1/8)*180/Math.PI)<1e-12);
 assert.equal(q.value.toFixed(1),'7.1');
 assert.equal(example().heights[EAST],-7);
 // Eight declared inputs, center excluded; the eastern neighbour is one of them.
 assert.equal(q.sourceCells.length,8);
 assert.ok(!q.sourceCells.some(c=>c.row===2&&c.col===2));
 assert.ok(q.sourceCells.some(c=>c.row===2&&c.col===3&&c.lolaSpots===0&&c.lolaReturn.label==='no LOLA return'));
 assert.deepEqual({present:q.inputLolaReturns.present,none:q.inputLolaReturns.none,known:q.inputLolaReturns.known,total:q.inputLolaReturns.total},{present:7,none:1,known:8,total:8});
 assert.equal(q.inputLolaReturns.text,'LOLA return in 7 of 8 source heights');
 // The center itself has a LOLA return: the cell's own evidence is not the result's evidence.
 assert.equal(example().lolaCounts[2*W+2],1);
});

test('3×3 worked example: the combined result lists 25 source heights, eight shared by both branches',()=>{
 const ev=evaluate(example(),{slopeDeg:15,roughness_m:0.15});
 const q=query(ev,'combined',{row:0,col:0});
 assert.equal(q.sourceCells.length,25);
 assert.equal(q.sharedSourceCellCount,8);
 assert.equal(q.inputLolaReturns.text,'LOLA return in 24 of 25 source heights');
});

test('3×3 worked example: the criterion "exceeds 15°" keeps the slope inputs',()=>{
 const ev=evaluate(example(),{slopeDeg:15,roughness_m:null});
 const c=query(ev,'slope-criterion',{row:0,col:0});
 assert.equal(c.outcome,'not-exceeded');assert.equal(c.limit,15);
 assert.equal(c.sourceCells.length,8);
 assert.equal(c.inputLolaReturns.text,'LOLA return in 7 of 8 source heights');
 // Equality stays within the limit (step 1.5: the text says "exceeds").
 const at=evaluate(example(),{slopeDeg:Math.atan(1/8)*180/Math.PI,roughness_m:null});
 assert.equal(query(at,'slope-criterion',{row:0,col:0}).outcome,'not-exceeded');
});
