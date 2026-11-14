import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from '../tools/dom-sink.mjs';
function setup(hash='') {
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8'),counts={};
 const dom=createDOMSink(html,{record:(k,v)=>counts[k]=(counts[k]||0)+v}),window={},location={hash};
 vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location,history:{replaceState(_a,_b,h){location.hash=h;}}});
 const cell=(id,r,c)=>dom.elements.get(id).querySelectorAll('.cell').find(x=>+x.dataset.r===r&&+x.dataset.c===c);
 return {...dom,h:window.hallmark,counts,location,cell,reset(){for(const k of Object.keys(counts))delete counts[k];}};
}
const fill=cell=>cell.markup.match(/fill="([^"]+)"/)[1];
// Permanent value/evidence panes supersede the old two-branch Compare mode.
test('both panes retain layers and share selection while tracing any branch',()=>{
 const t=setup('#ds=lroc-nassau02&node=combined&cell=11,18');
 const left=t.elements.get('map-content').firstChild,right=t.elements.get('branch-map-content').firstChild,ev=t.h.current().evaluation;
 for(const branch of ['slope','roughness']) {
  t.elements.get('results').listeners.click({target:{closest(){return {dataset:{criterion:branch}};}}});
  assert.equal(t.h.current().selection.node,'combined');
  assert.equal(t.h.current().evaluation,ev);
  assert.equal(t.elements.get('map-selection').innerHTML.match(/data-height-r=\"\d+\" data-height-c=\"\d+\"/)[0],t.elements.get('branch-map-selection').innerHTML.match(/data-height-r=\"\d+\" data-height-c=\"\d+\"/)[0]);
  assert.equal((t.elements.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,t.h.inspect(branch).sourceCells.length);
 }
 const activeRight=t.elements.get('branch-map-content').firstChild;
 t.reset();t.elements.get('branch-map').listeners.keydown({key:'ArrowRight',preventDefault(){}});
 assert.equal(t.elements.get('map-content').firstChild,left);assert.equal(t.elements.get('branch-map-content').firstChild,activeRight);
 assert.equal(t.counts['cell.listeners']||0,0);
 const restored=setup(t.location.hash);assert.equal(restored.h.current().selection.cell.col,19);assert.equal(restored.h.current().selection.footprint,'roughness');
});
