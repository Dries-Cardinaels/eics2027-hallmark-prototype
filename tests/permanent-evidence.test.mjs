import test from 'node:test';
import assert from 'node:assert/strict';
import {supervisorHarness} from '../tools/supervisor-harness.mjs';
test('value-first maps and inspector use the same branch support at every selected stage',()=>{
 const t=supervisorHarness(),e=t.elements;
 for(const dataset of ['copernicus-langtang','lroc-nassau02'])for(const node of ['heights','slope','roughness','slope-criterion','roughness-criterion','combined']){
  t.h.select({dataset,node,cell:{row:11,col:18}});
  const s=t.h.current().selection,active=node==='combined'?s.footprint:node, q=t.h.inspect(active);
  assert.equal(e.get('map-views').firstChild,e.get('primary-map-panel'));
  assert.equal((e.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,q.sourceCells.length);
  assert.match(e.get('selection-evidence').innerHTML,new RegExp(`data-support-total="${q.sourceCells.length}"`));
  const mapNode=node.endsWith('-criterion')?node.replace('-criterion',''):active;
  const ev=t.h.current().evaluation,idx=active==='heights'?(11+2)*ev.dataset.W+18+2:11*(ev.dataset.W-4)+18;
  const rec=ev.records[mapNode][idx];
  assert.equal(rec.sources.length,q.sourceCells.length);
  assert.match(e.get('selection-evidence').innerHTML,new RegExp(`${q.quality.suspicious}/${q.sourceCells.length} inputs`));
 }
});
test('evidence layer changes preserve source identity, values and evaluation',()=>{
 const t=supervisorHarness(),e=t.elements;
 t.h.select({dataset:'copernicus-langtang',node:'roughness',cell:{row:3,col:4}});
 const ev=t.h.current().evaluation, value=t.h.inspect().value, sources=JSON.stringify(t.h.inspect().sourceCells.map(c=>c.index));
 for(const layer of ['quality','fill-source','height-error','origins']){
  e.get('evidence-layer-controls').listeners.change({target:{name:'evidence-layer',checked:true,value:layer}});
  assert.equal(t.h.current().evaluation,ev);assert.equal(t.h.inspect().value,value);
  assert.equal(JSON.stringify(t.h.inspect().sourceCells.map(c=>c.index)),sources);
  assert.match(e.get('selection-evidence').innerHTML,new RegExp(`data-evidence-layer="${layer}"`));
  assert.equal((e.get('sources').innerHTML.match(/data-source="true"/g)||[]).length,25);
 }
 assert.match(e.get('source-legend').innerHTML,/Earlier history undocumented/);
});
