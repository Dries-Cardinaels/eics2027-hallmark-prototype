import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {overview} from '../src/ui/overview.js';
import {createDOMSink} from '../tools/dom-sink.mjs';
function setup(hash='') {
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
 const dom=createDOMSink(html),window={},location={hash};
 vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location,history:{replaceState(_a,_b,h){location.hash=h;}}});
 return {...dom,h:window.hallmark,location};
}
test('overview rule retains known failures independently of availability and supports further criteria',()=>{
 for(const slope of ['not-exceeded','exceeded','unavailable']) for(const roughness of ['not-exceeded','exceeded','unavailable']) for(const sunlight of ['not-exceeded','exceeded','unavailable']) {
  const outcomes={slope,roughness,sunlight},d=overview(outcomes);
  assert.equal(d.incomplete,Object.values(outcomes).includes('unavailable'));
  assert.deepEqual(d.unmet,Object.keys(outcomes).filter(k=>outcomes[k]==='exceeded'));
  assert.equal(d.title==='All criteria met',Object.values(outcomes).every(o=>o==='not-exceeded'));
 }
 assert.equal(overview({}).incomplete,true);
 assert.equal(overview({slope:'exceeded',roughness:'unavailable'}).title,'1 criterion unmet · incomplete');
});
test('Combined keeps result and evidence maps visible across datasets',()=>{
 const t=setup();
 assert.equal(t.h.current().selection.compare,true);
 assert.equal(t.elements.get('secondary-map-panel').hidden,!t.h.current().selection.compare);
 for(const ds of t.h.datasets) for(const mode of ['assessment','origins']) {
  t.h.select({dataset:ds.id,node:'combined',mode});
  const records=t.h.current().evaluation.records.combined;
  const cells=t.elements.get('map').querySelectorAll('.cell');
  cells.forEach((cell,i)=>{
   const rec=records[i],outcomes=Object.values(rec.outcomes);
   const expected=outcomes.includes('exceeded')?'var(--a-unmet)':outcomes.includes('unavailable')?'#fff':'var(--a-neither)';
   assert.equal(cell.markup.match(/fill="([^"]+)"/)[1],expected,`${ds.id}/${mode}/${i}`);
  });
  if(mode==='assessment') assert.equal((t.elements.get('map-content').innerHTML.match(/data-incomplete="true"/g)||[]).length,records.filter(r=>Object.values(r.outcomes).includes('unavailable')).length);
  assert.equal(t.elements.get('map-content').innerHTML.includes('data-exceeded-boundary'),records.some(rec=>Object.values(rec.outcomes).includes('exceeded')));
  assert.equal((t.elements.get('results').innerHTML.match(/class="criterion-row/g)||[]).length,ds.illuminationPeriod?3:2);
 }
});
test('known failure plus unavailable branch remains unmet and hatched, with mixed origins in the list',()=>{
 const t=setup(),ds=t.h.datasets.find(d=>d.id==='reference');
 Object.assign(ds,{W:5,H:5,res:2,heights:Array(25).fill(0),origins:Array(25).fill('observed')});
 ds.heights[0]=NaN;ds.origins[0]='absent'; // Only roughness uses this height.
 ds.heights[13]=10;ds.origins[13]='interpolated';
 ds.origins[12]='undocumented';
 t.h.select({dataset:'reference',node:'combined',cell:{row:0,col:0},limits:{slopeDeg:15,roughness_m:.15}});
 assert.equal(t.h.inspect().branches.slope.outcome,'exceeded');
 assert.equal(t.h.inspect().branches.roughness.outcome,'unavailable');
 assert.match(t.elements.get('map').querySelectorAll('.cell')[0].markup,/fill="var\(--a-unmet\)"/);
 assert.match(t.elements.get('map-content').innerHTML,/data-incomplete="true"/);
 assert.match(t.elements.get('selection-summary').innerHTML,/1 criterion unmet · incomplete/);
 const list=t.elements.get('results').innerHTML;
 assert.match(list,/1 gap-filled/);assert.match(list,/1 production history undocumented/);assert.match(list,/1 height missing/);
 assert.match(list,/Exceeded/);assert.match(list,/Unavailable/);
});
test('Permanent maps and inspector share selection and reuse evaluation',()=>{
 const t=setup('#ds=reference&node=combined&mode=assessment&cell=7,3&slope=15&rough=0.15&fp=node');
 const ev=t.h.current().evaluation,overviewLayer=t.elements.get('map-content').firstChild;
 assert.equal(t.h.current().selection.compare,true);
 assert.equal(t.elements.get('secondary-map-panel').hidden,!t.h.current().selection.compare);
 t.elements.get('branch-map').listeners.keydown({key:'ArrowRight',preventDefault(){}});
 t.elements.get('mode-origins').listeners.change({target:{checked:true}});
 assert.equal(t.h.current().selection.cell.col,4);
 assert.equal(t.h.current().selection.compare,true);
 assert.equal(t.h.current().selection.mode,'origins');
 assert.equal(t.h.current().selection.cell.col,4);
 assert.equal(t.elements.get('secondary-map-panel').hidden,!t.h.current().selection.compare);
 t.h.select({mode:'assessment'});
 assert.equal(t.elements.get('map-content').firstChild,overviewLayer);
 assert.equal(t.h.current().evaluation,ev);
 t.elements.get('results').listeners.click({target:{closest(){return {dataset:{criterion:'roughness'}};}}});
 assert.equal(t.h.current().selection.node,'combined');
 assert.equal(t.h.current().selection.footprint,'roughness');
 assert.match(t.elements.get('results').innerHTML, /class="criterion-method">Height standard deviation · 5×5. All 25 heights/);
 assert.equal(t.document.activeElement.dataset.criterion,'roughness');
 assert.equal(t.elements.get('back-overview').hidden,true);
 assert.equal(t.h.current().selection.node,'combined');
 assert.equal(t.h.current().selection.compare,true);
 assert.equal(t.h.current().selection.cell.col,4);
 const restored=setup(t.location.hash);
 assert.equal(restored.h.current().selection.compare,true);
 assert.equal(restored.h.current().selection.cell.col,4);
});

test('compact inspector links criterion cards to evidence without leaving the overview',()=>{
 const t=setup('#ds=lroc-nassau02&node=combined&mode=quality&cell=11,18');
 const before=t.h.current().evaluation;
 for(const branch of ['slope','roughness']) {
  t.elements.get('results').listeners.click({target:{closest(){return {dataset:{criterion:branch}};}}});
  assert.equal(t.h.current().selection.node,'combined');
  assert.equal(t.h.current().evaluation,before);
  assert.equal(t.document.activeElement.dataset.criterion,branch);
  assert.match(t.elements.get('results').innerHTML,new RegExp(`data-criterion="${branch}" aria-pressed="true"`));
  assert.match(t.elements.get('src-h').textContent,new RegExp(branch));
  assert.equal((t.elements.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,branch==='slope'?8:25);
 }
 assert.doesNotMatch(t.elements.get('sources').innerHTML,/>P<|>Q14</);
 assert.doesNotMatch(t.elements.get('results').innerHTML,/LROC stereo DEM/);
 assert.equal(t.elements.get('source-composition').hidden,true);
 t.elements.get('show-details').listeners.click();
 assert.match(t.elements.get('inspect').innerHTML,/Raw quality code/);
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
 assert.match(html,/<details class="limit-editor"><summary>Edit limits<\/summary>/);
});
