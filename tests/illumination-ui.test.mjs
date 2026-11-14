import test from 'node:test';
import assert from 'node:assert/strict';
import {supervisorHarness} from '../tools/supervisor-harness.mjs';
test('supervisory entry points expose only Earth and lunar terrain without illumination',()=>{
 const t=supervisorHarness(),e=t.elements;
 assert.equal((e.get('dataset').innerHTML.match(/<option/g)||[]).length,2);
 assert.match(e.get('dataset').innerHTML,/Earth · Search and rescue/);
 assert.match(e.get('dataset').innerHTML,/Moon · Rover exploration/);
 for(const dataset of ['copernicus-langtang','lroc-nassau02']){
  e.get('dataset').listeners.change({target:{value:dataset}});
  assert.equal(t.h.current().selection.node,'slope');
  assert.equal(t.h.current().evaluation.pipeline.operations.length,6);
  assert.equal(e.get('illumination-panel').hidden,true);
  assert.equal(e.get('illumination-limit-control').hidden,true);
  for(const id of ['graph','results','quantity-controls'])assert.doesNotMatch(e.get(id).innerHTML,/data-(node|criterion|view-node)="illumination/);
 }
});
test('old illumination links cannot restore the excluded workflow',()=>{
 const t=supervisorHarness('#ds=lroc-nassau02-illumination&node=illumination&fp=illumination&at=6');
 assert.equal(t.h.current().evaluation.dataset.id,'copernicus-langtang');
 assert.equal(t.h.current().selection.node,'slope');
 assert.equal(t.elements.get('illumination-panel').hidden,true);
 assert.doesNotMatch(t.location.hash,/illumination/);
});
