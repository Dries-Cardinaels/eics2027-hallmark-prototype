// Step 4.1: an operation defined outside src/core runs through the core pipeline unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OPERATIONS,MARGIN,analysisGrid,createPipeline,evaluate,query,perturbationDiagnostic} from '../src/core/index.js';
import {smoothedHeight} from '../examples/smoothing.js';
import {loadTerrain} from '../editor/data.js';

import {ridgeCrop as loadRidgeCrop} from './support/diagnostic-fixtures.mjs';
const ridgeCrop=()=>loadRidgeCrop();

// Independent expectation: the 3×3 height block centred on analysis cell (row, col), written
// from the grid definition (analysis cell (r, c) sits on height cell (r + MARGIN, c + MARGIN)).
function expectedSupport(ds,row,col){
 const out=[];
 for(let r=row+MARGIN-1;r<=row+MARGIN+1;r++)for(let c=col+MARGIN-1;c<=col+MARGIN+1;c++)out.push(r*ds.W+c);
 return out;
}

test('an external smoothing operation runs with the core operations and query returns its declared support',async t=>{
 const ds=await ridgeCrop(t),A=analysisGrid(ds);
 const pipeline=createPipeline([...OPERATIONS,smoothedHeight]);
 assert.deepEqual(pipeline.operations.map(op=>op.id).slice(-1),['smoothed-height']);
 assert.ok(pipeline.edges.some(e=>e.from==='heights'&&e.to==='smoothed-height'));
 const ev=evaluate(ds,{},pipeline);
 // Cells chosen by rule: the analysis-grid corner (edge-adjacent: its window touches height row 1
 // and column 1 of the crop), the opposite corner, and the center cell.
 const cells=[{row:0,col:0},{row:A.H-1,col:A.W-1},{row:Math.floor(A.H/2),col:Math.floor(A.W/2)}];
 for(const cell of cells){
  const q=query(ev,'smoothed-height',cell),expected=expectedSupport(ds,cell.row,cell.col);
  assert.deepEqual(q.sourceCells.map(s=>s.index),expected);
  assert.deepEqual(q.paths.map(p=>p.nodes),[['heights','smoothed-height']]);
  assert.equal(q.sourceCells.length,9);
  const mean=expected.reduce((s,i)=>s+ds.heights[i],0)/9;
  assert.ok(Math.abs(q.value-mean)<1e-9);
  // The record carries the same supplied evidence the core operations carry, with no extra code.
  assert.equal(q.inputHeightRMS.total,9);
  assert.equal(q.inputLolaReturns.total,9);
  assert.equal(q.inputLolaReturns.known+q.inputLolaReturns.unknown,9);
 }
 // Edge cell: its declared support reaches the crop's second row and column, never row/column 0.
 const corner=query(ev,'smoothed-height',{row:0,col:0});
 assert.equal(Math.min(...corner.sourceCells.map(s=>s.row)),1);
 assert.equal(Math.min(...corner.sourceCells.map(s=>s.col)),1);
});

test('the perturbation diagnostic finds no undeclared dependency in the external operation',async t=>{
 const ds=await ridgeCrop(t);
 const report=perturbationDiagnostic(ds,smoothedHeight,{delta:1});
 assert.equal(report.undeclared.count,0);
 assert.equal(report.inputsPerturbed,ds.W*ds.H);
 const A=analysisGrid(ds);
 assert.equal(report.outputsChecked,A.W*A.H);
 assert.equal(report.declared.pairs,9*A.W*A.H);
 // A mean gives every declared height equal non-zero weight, so every declared input changes it.
 assert.equal(report.declared.changed,9*A.W*A.H);
});
