import test from 'node:test';
import assert from 'node:assert/strict';
import {regionBoundary} from '../src/ui/map-geometry.js';
const edges = path => path.match(/M[^M]+/g) || [];
test('exceeded region edges preserve isolated cells, join adjacent cells and do not wrap rows',()=>{
 assert.equal(regionBoundary([false,false],2,10),'');
 assert.equal(regionBoundary([true],1,10,2),'M20 20h10M30 20v10M20 30h10M20 20v10');
 const adjacent=edges(regionBoundary([true,true],2,10));
 assert.equal(adjacent.length,6);
 assert.ok(!adjacent.includes('M10 0v10'),'no internal edge between adjacent exceeded cells');
 assert.equal(edges(regionBoundary([false,true,true,false],2,10)).length,8,'diagonally touching cells remain separate');
});
test('a hole in an exceeded region keeps its inner boundary',()=>{
 const path=edges(regionBoundary([true,true,true,true,false,true,true,true,true],3,10));
 assert.equal(path.length,16);
 for(const edge of ['M10 10h10','M10 20h10','M10 10v10','M20 10v10']) assert.ok(path.includes(edge),edge);
});
