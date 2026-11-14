import test from 'node:test';
import assert from 'node:assert/strict';
import {supervisorHarness} from '../tools/supervisor-harness.mjs';
import {summariseEvidence, inputEvidence, warmRamp} from '../src/ui/evidence.js';
import {slope} from '../src/core/operations.js';

test('pinned locations survive selection, layer and limit changes, and restore from a link',()=>{
 const t=supervisorHarness('#ds=copernicus-langtang&node=roughness&cell=3,4&layer=height-error'),e=t.elements;
 const a=t.h.inspect(),ev=t.h.current().evaluation;
 e.get('pin-location').listeners.click();t.h.select({cell:{row:23,col:23}});
 let markup=e.get('comparison-content').innerHTML;
 assert.match(markup,/A · pinned \(5, 6\)/);assert.match(markup,/B · selected \(25, 25\)/);
 const ea=summariseEvidence(ev.dataset,a.sourceCells.map(c=>c.index),'height-error');
 assert.ok(markup.includes(ea.summary));assert.match(markup,/0\/25 inputs have an estimate/);
 assert.match(markup,/has not been propagated/);
 const values=[t.h.inspect('slope').value,t.h.inspect('roughness').value];
 e.get('rough-limit').value='1000';e.get('rough-limit').listeners.input();
 assert.deepEqual([t.h.inspect('slope').value,t.h.inspect('roughness').value],values);
 assert.match(e.get('comparison-content').innerHTML,/1000 m illustrative limit/);
 t.h.select({evidenceLayer:'quality',node:'slope'});
 assert.equal((e.get('comparison-content').innerHTML.match(/data-support-total="8"/g)||[]).length,2);
 assert.ok(e.get('comparison-content').innerHTML.includes(e.get('selection-evidence').innerHTML.match(/<p class="evidence-summary"[\s\S]*?<\/p>/)[0]));
 const restored=supervisorHarness(t.location.hash);
 assert.equal(restored.elements.get('comparison-content').innerHTML,e.get('comparison-content').innerHTML);
 e.get('swap-locations').listeners.click();
 assert.deepEqual(JSON.parse(JSON.stringify(t.h.current().selection.cell)),{row:3,col:4});
 assert.match(e.get('comparison-content').innerHTML,/A · pinned \(25, 25\)/);
 e.get('clear-comparison').listeners.click();assert.doesNotMatch(t.location.hash,/pin=/);
 e.get('pin-location').listeners.click();t.h.select({dataset:'lroc-nassau02'});
 assert.doesNotMatch(t.location.hash,/pin=/);assert.match(e.get('comparison-content').innerHTML,/Pin a location/);
});

test('input error summaries deduplicate support and retain missing estimates',()=>{
 const ds={source:{hem:[null,2,6]},mapLayers:[{id:'height-error',label:'Height error',type:'continuous',valuesRef:'hem',min:0,max:10}]};
 const e=summariseEvidence(ds,[0,1,2,2],'height-error');
 assert.equal(e.total,3);assert.equal(e.present,2);assert.equal(e.missing,1);assert.equal(e.max,6);
 assert.equal(inputEvidence(ds,2,'height-error').colour,warmRamp(.6));
 const missing=summariseEvidence(ds,[0],'height-error');
 assert.equal(missing.max,null);assert.equal(missing.present,0);assert.doesNotMatch(missing.summary,/max 0/);
});

test('Horn slope respects separate axis spacings on an analytic tilted plane',()=>{
 const dx=27.2,dy=30.9,gx=.2,gy=.4,heights=[];
 for(let r=-1;r<=1;r++)for(let c=-1;c<=1;c++)if(r||c)heights.push(100+c*dx*gx+r*dy*gy);
 const ds={res:29,source:{res_m_ew:dx,res_m_ns:dy}};
 assert.ok(Math.abs(slope.compute({heights},ds).value-Math.atan(Math.hypot(gx,gy))*180/Math.PI)<1e-10);
 assert.equal(slope.parameters(ds).eastWestSpacing_m,dx);
 assert.equal(slope.parameters(ds).northSouthSpacing_m,dy);
});
