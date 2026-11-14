// LROC code 0 ("NoData / outside boundary") means the supplier gives no quality for that height.
// Hallmark counts it as unknown, never as "not suspicious" (found in the 9.7 review, fixed 6 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import {summariseQuality} from '../src/core/index.js';
import {inspectorHTML} from '../editor/inspector.js';

const lroc=codes=>({kind:'lroc-stereo-status',codes,flaggedCodes:[3]});

test('LROC code 0 is unknown: three no-data heights and one suspicious height',()=>{
 const q=summariseQuality([0,1,2,3],lroc([0,0,0,3]));
 assert.deepEqual({total:q.total,known:q.known,unknown:q.unknown,suspicious:q.suspicious},{total:4,known:1,unknown:3,suspicious:1});
 assert.equal(q.text,'1 of 4 inputs flagged suspicious; 3 unknown');
});

test('only no-data heights: no flagged input among the known ones, and the unknowns are named',()=>{
 const q=summariseQuality([0,1],lroc([0,13]));
 assert.equal(q.headline,'unknown');
 assert.equal(q.text,'No flagged input among 1 known; 1 unknown');
});

test('without code 0 nothing changes: known equals total',()=>{
 const q=summariseQuality([0,1,2],lroc([13,14,3]));
 assert.deepEqual({total:q.total,known:q.known,unknown:q.unknown,suspicious:q.suspicious},{total:3,known:3,unknown:0,suspicious:1});
 assert.equal(q.text,'1 of 3 inputs flagged suspicious');
});

test('a product with its own code table keeps 0 as a known value (ArcticDEM: 0 = no mask flag)',()=>{
 const mask={kind:'arcticdem-bitmask',codes:[0,4],flaggedCodes:[1,2,3,4,5,6,7],nominalCodes:[0],definitions:{0:'No supplied mask flag',4:'Cloud'}};
 const q=summariseQuality([0,1],mask);
 assert.equal(q.unknown,0);assert.equal(q.known,2);assert.equal(q.suspicious,1);
});

test('a dataset can declare its own unknown codes',()=>{
 const q=summariseQuality([0,1],{...lroc([7,3]),unknownCodes:[7]});
 assert.equal(q.unknown,1);assert.equal(q.suspicious,1);
});
