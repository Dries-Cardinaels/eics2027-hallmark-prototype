// Exhaustive visible-stage audit. DOM sink verifies content, not browser layout.
import assert from 'node:assert/strict';
import {supervisorHarness} from './supervisor-harness.mjs';
const {h,elements:e,html}=supervisorHarness();
let states=0;
for(const dataset of ['copernicus-langtang','lroc-nassau02']) {
 h.select({dataset});
 const ds=h.current().evaluation.dataset;
 for(const op of h.current().evaluation.pipeline.operations) {
  for(const cell of [{row:0,col:0},{row:Math.floor((ds.H-4)/2),col:Math.floor((ds.W-4)/2)},{row:ds.H-5,col:ds.W-5}]) {
   h.select({node:op.id,cell});
   const selection=h.current().selection,q=h.inspect(op.id==='combined'?selection.footprint:op.id);
   for(const id of ['map','branch-map'])assert.equal(e.get(id).querySelectorAll('.cell').length,op.grid==='heights'?ds.W*ds.H:(ds.W-4)*(ds.H-4));
   assert.equal(e.get('map-selection').innerHTML.match(/data-height-r="\d+" data-height-c="\d+"/)[0],e.get('branch-map-selection').innerHTML.match(/data-height-r="\d+" data-height-c="\d+"/)[0]);
   assert.equal((e.get('results').innerHTML.match(/data-criterion=/g)||[]).length,2);
   assert.equal(e.get('graph').querySelectorAll('.gnode').filter(n=>n.attributes['aria-checked']==='true').length,1);
   for(const id of ['selection-summary','sources','selection-evidence'])assert.doesNotMatch(e.get(id).innerHTML,/undefined|NaN|Infinity/);
   assert.equal((e.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,q.sourceCells.length);
   e.get('pin-location').listeners.click();
   assert.equal((e.get('comparison-content').innerHTML.match(new RegExp(`data-support-total="${q.sourceCells.length}"`,'g'))||[]).length,2);
   e.get('show-details').listeners.click();assert.ok(e.get('inspect').innerHTML.includes(h.inspect().method));e.get('details-dialog').open=false;
   states++;
  }
  h.select({cell:{row:3,col:4}});e.get('branch-map').listeners.keydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(h.current().selection.cell.col,5);
 }
}
assert.match(html,/<details class="limit-editor"><summary>Edit limits/);
assert.doesNotMatch(e.get('dataset').innerHTML,/illumination|LunarBlock/);
console.log(`${states} use-case/stage/location states with matching maps, source support and comparisons; 12 shared keyboard selections passed. Browser layout checked separately.`);
