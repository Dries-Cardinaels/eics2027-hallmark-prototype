import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OPERATIONS,MARGIN,analysisGrid} from '../src/core/operations.js';
import {perturbationDiagnostic} from '../src/core/diagnostic.js';
import {loadTerrain} from '../editor/data.js';
import {evaluate,createPipeline,createDatasetPipeline} from '../src/core/pipeline.js';

import {SYNTHETIC,syntheticGrid,RIDGE_CROP,ridgeCrop,medianLimits,underDeclaredMean} from './support/diagnostic-fixtures.mjs';
const DELTA=SYNTHETIC.delta;

function checkAll(ds,delta){
 const limits=medianLimits(ds),rows=OPERATIONS.map(op=>perturbationDiagnostic(ds,op.id,{delta,limits}));
 if(process.env.DIAGNOSTIC_TABLE)console.log(ds.id,rows.map(r=>[r.operation,r.inputsPerturbed,r.outputsChecked,r.undeclared.count,r.declared.changed,r.declared.withoutChange].join(' | ')).join('\n'));
 for(const r of rows){
  assert.equal(r.undeclared.count,0,`${r.operation}: ${JSON.stringify(r.undeclared.examples.slice(0,3))}`);
  assert.equal(r.inputsPerturbed,ds.W*ds.H);
  assert.ok(r.declared.changed>0,`${r.operation}: no declared input changed the result, so the run detects nothing`);
 }
 return rows;
}

test('every declared operation reads only declared heights on a fixed-seed synthetic grid',()=>{
 const rows=checkAll(syntheticGrid(),DELTA);
 assert.deepEqual(rows.map(r=>r.operation),OPERATIONS.map(op=>op.id));
 const slope=rows.find(r=>r.operation==='slope');
 assert.deepEqual(slope.grid,{heights:{W:14,H:14},output:{W:10,H:10}});
 assert.equal(slope.outputsChecked,100);
 assert.equal(slope.declared.pairs,800); // 8 declared heights per slope cell
});

test('every declared operation reads only declared heights on a 16×16 Connecting Ridge crop',async()=>{
 checkAll(await ridgeCrop(),RIDGE_CROP.delta);
});

test('an operation that reads heights outside its declared footprint is reported',()=>{
 const ds=syntheticGrid(),report=perturbationDiagnostic(ds,underDeclaredMean,{delta:DELTA});
 // Independent expectation: every (height, output) pair inside the 5×5 window but outside the 3×3.
 const A=analysisGrid(ds);let expected=0;
 for(let o=0;o<A.W*A.H;o++){
  const r=Math.floor(o/A.W)+MARGIN,c=o%A.W+MARGIN;
  for(let i=0;i<ds.W*ds.H;i++){const d=Math.max(Math.abs(Math.floor(i/ds.W)-r),Math.abs(i%ds.W-c));if(d===2)expected++;}
 }
 assert.equal(expected,16*A.W*A.H);
 assert.ok(report.undeclared.count>0);
 assert.equal(report.undeclared.count,expected);
 assert.equal(report.undeclared.outputs,A.W*A.H);
 assert.equal(report.declared.withoutChange,0);
 assert.equal(report.undeclared.examples.length,20);
 const ex=report.undeclared.examples[0];
 assert.equal(Math.max(Math.abs(ex.input.row-ex.output.row-MARGIN),Math.abs(ex.input.col-ex.output.col-MARGIN)),2);
});

// Backs the Verification section: every declared source height of slope, height spread and their criteria
// changes the output (criteria compare the value as well as the outcome), and the two-criterion combined
// result that the lunar cases use (createDatasetPipeline) has no undeclared dependency.
test('slope, height spread and their criteria: every declared source height changes the output',async()=>{
 for(const [ds,delta] of [[syntheticGrid(),SYNTHETIC.delta],[await ridgeCrop(),RIDGE_CROP.delta]]){
  const limits=medianLimits(ds);
  for(const id of ['slope','roughness','slope-criterion','roughness-criterion'])
   assert.equal(perturbationDiagnostic(ds,id,{delta,limits}).declared.withoutChange,0,`${ds.id} ${id}`);
 }
});

test('the two-criterion combined result of the lunar pipeline has no undeclared dependency',async()=>{
 const ds=await ridgeCrop(),pipeline=createDatasetPipeline(ds);
 assert.deepEqual(pipeline.byId.combined.inputs,['slope-criterion','roughness-criterion']);
 const r=perturbationDiagnostic(ds,'combined',{pipeline,delta:RIDGE_CROP.delta,limits:medianLimits(ds)});
 assert.equal(r.undeclared.count,0);assert.equal(r.inputsPerturbed,ds.W*ds.H);
});
