import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from '../tools/dom-sink.mjs';
function setup() {
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
 const dom=createDOMSink(html),window={};
 vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location:{hash:''},history:{replaceState(){}}});
 return {...dom,h:window.hallmark};
}
test('a result inherits interpolation while its centre height remains observed',()=>{
 const t=setup();
 t.h.select({dataset:'lunar-low-sun',node:'roughness',mode:'origins',cell:{row:12,col:35}});
 const q=t.h.inspect();
 assert.equal(q.origin.counts.observed,25);
 assert.equal(q.origin.counts.interpolated,0);
 assert.equal(q.sourceCells.find(c=>c.row===14&&c.col===37).height.toFixed(3),'2.073');
 const neighbour=t.elements.get('branch-map').querySelectorAll('.cell').find(c=>c.dataset.r==='14'&&c.dataset.c==='33');
 assert.match(neighbour.markup,/fill="url\(#B-interpolated\)"/);
 assert.match(neighbour.markup,/Uses interpolated heights/);
 const closeup=t.elements.get('sources').innerHTML;
 assert.equal((closeup.match(/data-origin="observed"/g)||[]).length,25);
 assert.doesNotMatch(closeup,/data-origin="interpolated"/);
 const outside=t.h.inspect('roughness',{row:14,col:33}).sourceCells.filter(c=>c.origin==='interpolated');
 assert.ok(outside.length>0&&outside.every(c=>c.row===18));
 assert.match(t.elements.get('map-layer').textContent,/result \+ evidence/);
 assert.match(t.elements.get('source-encoding').textContent,/Input evidence · production/);
 // In the actual height layer, the corresponding cell and close-up agree.
 t.h.select({node:'heights'});
 const height=t.elements.get('branch-map').querySelectorAll('.cell').find(c=>c.dataset.r==='14'&&c.dataset.c==='33');
 assert.match(height.markup,/fill="url\(#B-observed\)"/);
});
test('bounded shadow-fill summary is short and full details retain method and shared inputs',()=>{
 const t=setup();
 t.h.select({dataset:'lunar-low-sun',node:'combined'});
 const example=t.h.bookmarks.find(b=>b.id==='lunar-shadow');
 t.h.select({cell:example.cell});
 const q=t.h.inspect(),filled=q.sourceCells.filter(c=>c.origin==='interpolated');
 assert.ok(filled.length>0&&filled.length<q.sourceCells.length);
 const summary=t.elements.get('selection-summary').innerHTML;
 assert.match(summary,/Production history/);
 assert.doesNotMatch(summary,/result-explanation/);
 assert.match(summary,/gap-filled|Required height missing/i);
 assert.doesNotMatch(summary,/centre height|shared by both|class="method-line"/);
 t.elements.get('show-details').listeners.click();
 const detail=t.elements.get('inspect').innerHTML;
 assert.ok(detail.includes(t.h.inspect().method));
 assert.ok(detail.includes(`${q.sharedSourceCellCount} shared between branches`));
});

test('each map follows its step while all close-up cells retain individual origins',()=>{
 const t=setup(),seen=new Set();
 for(const b of t.h.bookmarks) {
  t.h.select({dataset:b.dataset,cell:b.cell,mode:'origins'});
  for(const node of ['heights','slope','roughness','slope-criterion','roughness-criterion']) {
   t.h.select({node});
   for(const footprint of ['node','slope','roughness']) {
    t.elements.get('footprint-'+footprint).listeners.change({target:{checked:true}});
    const ds=t.h.current().evaluation.dataset;
    const map=new Map(t.elements.get('branch-map').querySelectorAll('.cell').map(c=>[`${+c.dataset.r+2},${+c.dataset.c+2}`,c.markup]));
    const groups=[...t.elements.get('sources').innerHTML.matchAll(/<g data-r="(\d+)" data-c="(\d+)"[^>]*>([\s\S]*?)<\/g>/g)];
    assert.ok(groups.length>=9);
    for(const [,r,c,markup] of groups) {
     const origin=ds.origins[+r*ds.W+(+c)];seen.add(origin);
     if(!ds.quality && !markup.includes('centre not used by Horn slope')) assert.equal(markup.match(/data-origin="([^"]+)"/)[1],origin);
     if(node==='heights')assert.ok(map.get(`${r},${c}`).includes(ds.quality?(ds.quality.kind==='copernicus-edm'?'Edit code':'Quality code'):origin==='absent'?'fill="#fff"':`fill="url(#B-${origin})"`));
    }
    assert.equal(t.elements.get('view-origins-label').textContent,'Input evidence');

   }
  }
 }
 assert.deepEqual([...seen].sort(),['absent','interpolated','observed','undocumented']);
});

test('unfilled covered heights explain the filling limit separately from missing coverage',()=>{
 const t=setup();
 t.h.select({dataset:'lunar-low-sun',node:'heights'});
 const ds=t.h.current().evaluation.dataset,grid=t.h.analysisGrid(ds);
 for(const covered of [true,false]) {
  const k=ds.origins.findIndex((o,k)=>o==='absent' && Boolean(ds.acquisition.inOverlap[k])===covered && Math.floor(k/ds.W)>=2 && Math.floor(k/ds.W)<ds.H-2 && k%ds.W>=2 && k%ds.W<ds.W-2);
  assert.ok(k>=0);
  t.h.select({cell:{row:Math.floor(k/ds.W)-2,col:k%ds.W-2}});
  const summary=t.elements.get('selection-summary').innerHTML;
  assert.match(summary,/Height missing/);
  if(covered) assert.doesNotMatch(summary,/No stereo coverage/);
  t.elements.get('show-details').listeners.click();
  assert.match(t.elements.get('inspect').innerHTML,covered ? /beyond filling limit/ : /outside coverage/);
 }
});

test('branch evidence remains distinct through each criterion and height source',()=>{
 const t=setup();t.h.select({dataset:'reference',cell:{row:7,col:3}});
 for(const [node,origin] of [['slope','observed'],['slope-criterion','observed'],['roughness','interpolated'],['roughness-criterion','interpolated'],['heights','observed']]) {
  t.h.select({node});
  const cell=t.elements.get('branch-map').querySelectorAll('.cell').find(c=>c.dataset.r==='7'&&c.dataset.c==='3');
  assert.ok(cell.markup.includes(`url(#B-${origin})`));
  assert.equal(t.h.inspect().origin.headline||t.h.inspect().origin.declared,origin);
  assert.match(t.elements.get('source-map-legend').innerHTML,/Gap-filled/);
 }
});
