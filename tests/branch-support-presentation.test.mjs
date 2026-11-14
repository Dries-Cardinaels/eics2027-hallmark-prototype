import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from '../tools/dom-sink.mjs';
function setup() {
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
 const dom=createDOMSink(html),window={};
 vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location:{hash:''},history:{replaceState(){}}});
 return {...dom,h:window.hallmark,html};
}
function retainedOrigin(t,node,origin) {
 const cell=t.h.current().selection.cell;
 const q=t.h.inspect(node,node==='heights'?{row:cell.row+2,col:cell.col+2}:cell);
 assert.equal(node==='heights'?q.origin.declared:q.origin.headline,origin);
 assert.doesNotMatch(t.elements.get('graph').innerHTML,/data-node-origin|node-origin-mark|node-origin-label/);
 assert.doesNotMatch(t.html,/Badges show declared support/);
}
function count(t,branch,n,total) {
 assert.ok(t.elements.get('results').innerHTML.includes(`data-branch="${branch}" data-interpolated="${n}" data-total="${total}"`));
}
test('roughness-only interpolation is visible separately and survives its criterion and combination',()=>{
 const t=setup(),b=t.h.bookmarks.find(b=>b.id==='focus');
 t.h.select({dataset:b.dataset,node:'combined',cell:b.cell,mode:'origins'});
 count(t,'slope',0,8); count(t,'roughness',1,25);
 retainedOrigin(t,'heights','observed');retainedOrigin(t,'slope','observed');retainedOrigin(t,'slope-criterion','observed');
 retainedOrigin(t,'roughness','interpolated');retainedOrigin(t,'roughness-criterion','interpolated');retainedOrigin(t,'combined','interpolated');
 t.h.select({limits:{slopeDeg:90,roughness_m:2,illuminationMinPercent:0}});
 assert.equal(t.h.inspect().category,'neither');
 count(t,'roughness',1,25);retainedOrigin(t,'roughness-criterion','interpolated');retainedOrigin(t,'combined','interpolated');
 assert.match(t.elements.get('results').innerHTML,/Height standard deviation · 5×5/);
 assert.match(t.html,/provenance, not numerical error/);
});
test('paper eastern-neighbour example displays 7.1 degrees with interpolation retained below the limit',()=>{
 const t=setup(),ds=t.h.datasets.find(ds=>ds.id==='reference');
 Object.assign(ds,{W:5,H:5,res:2,heights:Array(25).fill(0),origins:Array(25).fill('observed')});
 ds.heights[13]=1;ds.origins[13]='interpolated';
 t.h.select({dataset:ds.id,node:'slope-criterion',cell:{row:0,col:0},limits:{slopeDeg:15,roughness_m:.15}});
 const q=t.h.inspect('combined',{row:0,col:0});
 assert.ok(Math.abs(q.branches.slope.value-Math.atan(1/8)*180/Math.PI)<1e-10);
 assert.equal(q.branches.slope.outcome,'not-exceeded');
 count(t,'slope',1,8);count(t,'roughness',1,25);
 assert.match(t.elements.get('results').innerHTML,/7\.1°/);
 assert.match(t.elements.get('results').innerHTML,/1 of 8 gradient neighbours interpolated/);
 retainedOrigin(t,'slope-criterion','interpolated');
 assert.match(t.elements.get('graph').querySelector('[data-node="slope-criterion"]').attributes['aria-label'],/declared support: Includes interpolation/);
});
test('interpolated centre is excluded from slope support',()=>{
 const t=setup(),ds=t.h.datasets.find(ds=>ds.id==='reference');
 Object.assign(ds,{W:5,H:5,res:2,heights:Array(25).fill(0),origins:Array(25).fill('observed')});
 ds.heights[12]=1;ds.origins[12]='interpolated';
 t.h.select({dataset:ds.id,node:'combined',cell:{row:0,col:0}});
 const before=t.h.inspect();
 count(t,'slope',0,8);count(t,'roughness',1,25);
 retainedOrigin(t,'slope','observed');
 assert.match(t.elements.get('results').innerHTML,/The interpolated centre is excluded from slope inputs/);
 assert.equal(before.branches.slope.value,0);
 ds.heights[12]=10;t.h.select({dataset:ds.id});
 assert.equal(t.h.inspect().branches.slope.value,0);
 assert.ok(t.h.inspect().branches.roughness.value>before.branches.roughness.value);
});
test('absent and undocumented support are not presented as wholly observed support',()=>{
 const t=setup();
 for(const id of ['missing','undocumented']) {
  const b=t.h.bookmarks.find(b=>b.dataset===id);
  t.h.select({dataset:id,node:'combined',cell:b.cell});
  const q=t.h.inspect();
  for(const [name,br] of Object.entries(q.branches)) {
   count(t,name,br.origin.counts.interpolated,br.sourceCellCount);
   retainedOrigin(t,name,br.origin.headline);
  }
  if(id==='missing')assert.match(t.elements.get('results').innerHTML,/required height is absent; no numerical result/);
  else assert.match(t.elements.get('results').innerHTML,/undocumented/);
 }
});
