import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from '../tools/dom-sink.mjs';

function setup() {
  const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
  const counts={};
  const dom=createDOMSink(html,{record:(k,v)=>{counts[k]=(counts[k]||0)+v;}});
  const window={};
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location:{hash:''},history:{replaceState(){}}});
  return {...dom,h:window.hallmark,counts,reset(){for(const k of Object.keys(counts))delete counts[k];}};
}

test('real cell clicks retain the map, evaluation and listeners, updating only its selection overlay',()=>{
  const t=setup(),layer=t.elements.get('map-content').firstChild,ev=t.h.current().evaluation;
  const cell=t.elements.get('map').querySelectorAll('.cell').find(c=>c.dataset.r==='8'&&c.dataset.c==='12');
  t.reset();t.clickCell(cell);
  assert.equal(t.h.current().selection.cell.row,8);assert.equal(t.h.current().selection.cell.col,12);
  assert.equal(t.elements.get('map-content').firstChild,layer);
  assert.equal(t.h.current().evaluation,ev);
  assert.equal(t.counts['map.writes']||0,0);assert.equal(t.counts['map-content.swaps']||0,0);
  assert.equal(t.counts['detached.writes']||0,0);assert.equal(t.counts['cell.listeners']||0,0);
  assert.equal(t.counts['inspect.writes']||0,0);
  assert.ok(t.counts['map-selection.bytes']<50000);
  assert.match(t.elements.get('map-selection').innerHTML,/data-height-r="10" data-height-c="14"/);
  assert.match(t.elements.get('sources').innerHTML,/data-selected-centre="true" data-height-r="10" data-height-c="14"/);
});

test('processing steps reuse retained SVG layers and invalidate them when values change',()=>{
  const t=setup(),ev=t.h.current().evaluation;
  const cached=new Map();
  for(const node of ['heights','slope','roughness','slope-criterion','roughness-criterion','combined']) for(const mode of ['assessment','origins']) {
    t.h.select({node,mode});cached.set(`${node}:${mode}`,t.elements.get('map-content').firstChild);
  }
  t.reset();
  for(const [key,layer] of cached) {
    const [node,mode]=key.split(':');t.h.select({node,mode});
    assert.equal(t.elements.get('map-content').firstChild,layer);
    assert.equal(t.h.current().evaluation,ev);
  }
  assert.equal(t.counts['detached.writes']||0,0);assert.equal(t.counts['cell.listeners']||0,0);
  t.h.select({node:'combined',mode:'assessment',limits:{slopeDeg:90,roughness_m:2}});
  assert.notEqual(t.elements.get('map-content').firstChild,cached.get('combined:assessment'));
  assert.notEqual(t.h.current().evaluation,ev);
  const refreshed=t.elements.get('map-content').firstChild;
  t.h.select({dataset:'reference',cell:{row:7,col:3}});
  assert.notEqual(t.elements.get('map-content').firstChild,refreshed);
  assert.match(t.elements.get('map-layer').textContent,/Assessment outcomes · markers identify supporting evidence/);
  assert.equal(t.elements.get('map').querySelectorAll('.cell').length,28*28);
});

test('Full record is built on demand and always describes the current selection when opened',()=>{
  const t=setup();
  assert.equal(t.elements.get('inspect').innerHTML,'');
  t.h.select({node:'slope',cell:{row:4,col:6}});
  assert.equal(t.elements.get('inspect').innerHTML,'');
  t.elements.get('show-details').listeners.click();
  assert.match(t.elements.get('inspect').innerHTML,/analysis cell row 4, col 6/);
  t.h.select({cell:{row:7,col:9}});
  assert.match(t.elements.get('inspect').innerHTML,/analysis cell row 7, col 9/);
  t.elements.get('details-dialog').open=false;t.reset();
  t.h.select({node:'roughness',cell:{row:10,col:12}});
  assert.equal(t.counts['inspect.writes']||0,0);
  t.elements.get('show-details').listeners.click();
  assert.match(t.elements.get('inspect').innerHTML,/Roughness · analysis cell row 10, col 12/);
});
