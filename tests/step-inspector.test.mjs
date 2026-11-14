import test from 'node:test';
import assert from 'node:assert/strict';
import {supervisorHarness} from '../tools/supervisor-harness.mjs';
test('combined assessment remains while selecting a branch updates evidence and support together',()=>{
 const t=supervisorHarness('#ds=lroc-nassau02&node=combined&cell=11,18'),e=t.elements,ev=t.h.current().evaluation,values=e.get('map-content').firstChild;
 for(const [branch,count,flagged] of [['roughness',25,8],['slope',8,0]]){
  e.get('results').listeners.click({target:{closest(){return {dataset:{criterion:branch}};}}});
  assert.equal(t.h.current().selection.node,'combined');assert.equal(t.h.current().evaluation,ev);assert.equal(e.get('map-content').firstChild,values);
  assert.equal((e.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,count);
  assert.match(e.get('selection-evidence').innerHTML,new RegExp(`${flagged}/${count} inputs flagged suspicious`));
  assert.match(e.get('map-secondary-title').textContent,new RegExp(branch,'i'));
 }
});
test('value cards change the inspected quantity and preserve raw numerical results',()=>{
 const t=supervisorHarness('#ds=lroc-nassau02&node=slope&cell=11,18'),e=t.elements;
 assert.match(e.get('results').innerHTML,/3.8°/);assert.match(e.get('results').innerHTML,/0.341 m/);
 e.get('results').listeners.click({target:{closest(){return {dataset:{criterion:'roughness'}};}}});
 assert.equal(t.h.current().selection.node,'roughness');assert.match(e.get('selection-summary').innerHTML,/0.341 m/);
 assert.match(e.get('source-legend').innerHTML,/Suspicious/);
 assert.match(e.get('selection-evidence').innerHTML,/Successful correlation \(code 14\)/);
 assert.doesNotMatch(e.get('selection-evidence').innerHTML,/were interpolated/);
});
test('source neighbourhood excludes the slope center and includes it for roughness',()=>{
 const t=supervisorHarness('#ds=lroc-nassau02&node=slope&cell=11,18'),e=t.elements;
 for(const [node,count] of [['slope',8],['roughness',25]]){
  t.h.select({node});const svg=e.get('sources').innerHTML, center=svg.match(/<g data-r="13" data-c="20"[^>]*>[\s\S]*?<\/g>/)[0];
  assert.equal((svg.match(/data-source="true"/g)||[]).length,count);
  if(node==='slope')assert.doesNotMatch(center,/data-source="true"/);else assert.match(center,/data-source="true"/);
 }
});
test('partial and unavailable input errors stay explicit in the selected evidence',()=>{
 const t=supervisorHarness('#ds=copernicus-langtang&node=roughness&cell=3,4&layer=height-error'),e=t.elements;
 let q=t.h.inspect(),ds=t.h.current().evaluation.dataset,available=q.sourceCells.filter(c=>ds.source.hem[c.index]!==null).length;
 assert.ok(available>0&&available<25);assert.match(e.get('selection-evidence').innerHTML,new RegExp(`${available}/25 inputs have an estimate`));
 assert.match(e.get('selection-evidence').innerHTML,/has not been propagated/);
 assert.match(e.get('source-legend').innerHTML,/No estimate supplied/);
 t.h.select({cell:{row:23,col:23},node:'slope'});
 assert.match(e.get('selection-evidence').innerHTML,/0\/8 inputs have an estimate/);
 assert.doesNotMatch(e.get('selection-evidence').innerHTML,/max 0/);
});
