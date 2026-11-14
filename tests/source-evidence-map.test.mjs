import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from '../tools/dom-sink.mjs';
import {regionBoundary} from '../src/ui/map-geometry.js';
function setup(hash='') {
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
 const dom=createDOMSink(html),window={},location={hash};
 vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location,history:{replaceState(a,b,h){location.hash=h;}}});
 return {...dom,h:window.hallmark,location};
}
test('map panes select results; exact supporting heights remain in the inspector',()=>{
 const t=setup('#ds=lroc-nassau02-illumination&node=heights&cell=11,18');
 for(const node of ['heights','slope','roughness','illumination','slope-criterion','roughness-criterion','illumination-criterion','combined']) {
  t.h.select({node});const q=t.h.inspect();
  for(const id of ['map-selection','branch-map-selection']){
   const output=t.elements.get(id).innerHTML;
   assert.equal((output.match(/data-selected="true"/g)||[]).length,1);
   assert.doesNotMatch(output,/data-selection-crosshair|data-sun-direction/);
  }
  assert.equal((t.elements.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,q.kind==='combination'?q.branches.slope.sourceCellCount:q.sourceCells.length);
 }
});
test('criterion result footprint matches exact source heights while evidence marks only the result',()=>{
 const t=setup('#ds=lroc-nassau02&node=slope&cell=17,35');
 for(const node of ['slope','roughness','roughness-criterion']) {
  t.h.select({node});const q=t.h.inspect(),ds=t.h.current().evaluation.dataset;
  const mask=Array(ds.W*ds.H).fill(false);q.sourceCells.forEach(c=>mask[c.index]=true);
  const expected=regionBoundary(mask,ds.W,360/ds.W);
  for(const id of ['map-selection','branch-map-selection']) {
   const html=t.elements.get(id).innerHTML;
   if(id==='map-selection') assert.ok(html.includes(`data-source-count="${q.sourceCells.length}" d="${expected}"`));
   else assert.doesNotMatch(html,/data-support-frame|<path/);
   assert.match(html,/data-selected="true"/);
   assert.doesNotMatch(html,/data-selection-crosshair/);
  }
 }
});
test('criterion and Combined footprints follow inspector inputs and never appear on evidence',()=>{
 const t=setup('#ds=lroc-nassau02&node=slope-criterion&cell=17,35');
 for(const [node,footprint,n] of [['slope','node',8],['roughness','node',25],['slope-criterion','node',8],['roughness-criterion','node',25],['combined','slope',8],['combined','roughness',25]]) {
  t.h.select({node,footprint});const e=t.elements;
  assert.match(e.get('map-selection').innerHTML,new RegExp(`data-source-count="${n}"`));
  assert.doesNotMatch(e.get('branch-map-selection').innerHTML,/data-support-frame|<path/);
  assert.equal((e.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,n);
  assert.match(e.get('map-legend').innerHTML,/source-height footprint/);
  assert.doesNotMatch(e.get('source-map-legend').innerHTML,/source-height footprint/);
 }
});
