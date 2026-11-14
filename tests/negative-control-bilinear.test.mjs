// Step 4.2: a wrong declaration is caught. Half-cell bilinear interpolation reads four heights but
// declares only the nearest one; the perturbation diagnostic must report the three undeclared reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MARGIN,analysisGrid,perturbationDiagnostic} from '../src/core/index.js';
import {shiftedBilinearDeclaredNearest} from '../examples/shifted-bilinear.js';

import {BILINEAR,bilinearGrid} from './support/diagnostic-fixtures.mjs';
const DELTA=BILINEAR.delta;
const syntheticGrid=bilinearGrid;

test('half-cell bilinear declared as nearest cell is reported with exactly its undeclared reads',()=>{
 const ds=syntheticGrid(),A=analysisGrid(ds);
 const report=perturbationDiagnostic(ds,shiftedBilinearDeclaredNearest,{delta:DELTA});
 // Independent expectation: for each output, the heights at (r, c+1), (r+1, c), (r+1, c+1) are read
 // (weight 1/4 each, so a perturbation always changes the value) but not declared.
 let expected=0;
 for(let o=0;o<A.W*A.H;o++){
  const r=Math.floor(o/A.W)+MARGIN,c=o%A.W+MARGIN;
  for(const [dr,dc] of [[0,1],[1,0],[1,1]]) if(r+dr<ds.H&&c+dc<ds.W) expected++;
 }
 assert.equal(expected,3*A.W*A.H);
 assert.ok(report.undeclared.count>0);
 assert.equal(report.undeclared.count,expected);
 assert.equal(report.undeclared.outputs,A.W*A.H);
 // The one declared input always changes the value: declared support is not over-wide here.
 assert.equal(report.declared.pairs,A.W*A.H);
 assert.equal(report.declared.withoutChange,0);
 for(const ex of report.undeclared.examples){
  const dr=ex.input.row-ex.output.row-MARGIN,dc=ex.input.col-ex.output.col-MARGIN;
  assert.ok([[0,1],[1,0],[1,1]].some(([a,b])=>a===dr&&b===dc));
 }
});
