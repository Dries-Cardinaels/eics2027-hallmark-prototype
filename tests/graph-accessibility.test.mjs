import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from '../tools/dom-sink.mjs';
function setup(){
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
 const dom=createDOMSink(html),window={};
 vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location:{hash:''},history:{replaceState(){}}});
 const h=window.hallmark;h.select({dataset:'reference',node:'combined'});
 const node=id=>dom.elements.get('graph').querySelector(`[data-node="${id}"]`);
 const key=(id,value)=>{let prevented=false;node(id).listeners.keydown({key:value,preventDefault(){prevented=true;}});return prevented;};
 return {...dom,html,h,node,key};
}
test('one labelled style selector and one mutually exclusive graph selection',()=>{
 const t=setup();
 assert.doesNotMatch(t.html,/id="layer"|1 · Processing step|data-inspect=|id="map-instruction"/);
 assert.match(t.html,/<legend>Visualisation style<\/legend>/);
 assert.doesNotMatch(t.html,/id="result-view"|id="choose-graph-step"/);
 assert.ok(t.html.indexOf('class="panel graph-panel"') > t.html.indexOf('class="panel map-panel"'));
 assert.ok(t.html.indexOf('class="panel map-panel"') < t.html.indexOf('class="panel inspection-panel"'));
 assert.equal([...t.html.matchAll(/type="radio" name="map-view"/g)].length,3);
 assert.match(t.html,/role="radiogroup" aria-labelledby="graph-h" aria-describedby="graph-help"/);
 const nodes=t.elements.get('graph').querySelectorAll('.gnode');
 assert.equal(nodes.length,6);
 assert.equal(nodes.filter(n=>n.attributes.tabindex==='0').length,1);
 assert.equal(nodes.filter(n=>n.attributes['aria-checked']==='true').length,1);
 for(const n of nodes){assert.equal(n.attributes.role,'radio');assert.ok(n.attributes['aria-label'].length>10);}
 for(const mode of ['assessment','origins']){
  t.h.select({mode});assert.doesNotMatch(t.elements.get('map-legend').innerHTML,/class="explain"/);
 }
});
test('graph mouse selection preserves visualisation, location and evaluation',()=>{
 const t=setup();t.h.select({mode:'origins',footprint:'roughness'});
 const before=t.h.current();
 t.node('slope').listeners.click();
 const after=t.h.current();
 assert.equal(after.selection.node,'slope');assert.equal(after.selection.mode,'origins');
 assert.deepEqual(after.selection.cell,before.selection.cell);assert.equal(after.evaluation,before.evaluation);
 assert.equal(t.document.activeElement,t.node('slope'));
 assert.equal(t.node('slope').attributes['aria-checked'],'true');
 assert.equal(t.node('slope').attributes.tabindex,'0');
 assert.match(t.elements.get('graph-selection').textContent,/Selected: Slope/);
 assert.match(t.elements.get('map-h').textContent,/Slope/);
});
test('graph has keyboard entry, wrapped arrows, activation and stable focus after rendering',()=>{
 const t=setup(),ids=t.h.current().evaluation.pipeline.operations.map(o=>o.id);
 t.node(t.h.current().selection.node).focus();
 assert.equal(t.document.activeElement,t.node(t.h.current().selection.node));
 assert.equal(t.key(ids.at(-1),'ArrowRight'),true);
 assert.equal(t.h.current().selection.node,ids[0]);
 assert.equal(t.key(ids[0],'ArrowLeft'),true);assert.equal(t.h.current().selection.node,ids.at(-1));
 t.key(ids.at(-1),'Home');assert.equal(t.h.current().selection.node,ids[0]);
 t.key(ids[0],'ArrowDown');assert.equal(t.h.current().selection.node,ids[1]);
 t.key(ids[1],'ArrowUp');assert.equal(t.h.current().selection.node,ids[0]);
 t.key(ids[0],'End');assert.equal(t.h.current().selection.node,ids.at(-1));
 for(const activation of [' ','Enter'])assert.equal(t.key(ids.at(-1),activation),true);
 assert.equal(t.key(ids.at(-1),'Tab'),false,'Tab must leave the radio group normally');
 t.h.select({cell:{row:8,col:12}});
 assert.equal(t.document.activeElement,t.node(ids.at(-1)),'selection redraw must not drop graph keyboard focus');
 t.elements.get('mode-origins').focus();
 t.elements.get('mode-origins').listeners.change({target:{checked:true}});
 assert.equal(t.document.activeElement,t.elements.get('mode-origins'),'style change must not steal focus');
});

test('native style choices update the map without changing step, location or evaluation',()=>{
 const t=setup();
 for(const step of ['combined','slope','heights']) {
  t.h.select({node:step});
  const before=t.h.current();
  for(const mode of ['origins','assessment']) {
   t.elements.get(`mode-${mode}`).listeners.change({target:{checked:true}});
   const after=t.h.current();
   assert.equal(after.selection.mode,mode);
   assert.equal(after.selection.node,step);
   assert.deepEqual(after.selection.cell,before.selection.cell);
   assert.equal(after.evaluation,before.evaluation);
   assert.equal(t.elements.get('mode-origins').checked,mode==='origins');
   assert.equal(t.elements.get('mode-assessment').checked,mode==='assessment');
   assert.equal(t.elements.get('view-origins-label').textContent,'Input evidence');
   assert.equal(t.elements.get('view-values-label').textContent,'Values');
   assert.match(t.elements.get('map').attributes['aria-label'],new RegExp(t.elements.get('map-h').textContent));
  }
 }
});
