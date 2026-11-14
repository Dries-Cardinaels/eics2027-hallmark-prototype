// Runs the real handlers with a DOM sink. Times JavaScript/string work and counts DOM
// replacement volume; it deliberately does not claim browser layout/paint timings.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from './dom-sink.mjs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
const stats={};
const add=(key,value=1)=>{stats[key]=(stats[key]||0)+value;};
const {elements,document,clickCell}=createDOMSink(html,{record:add});
const measure=(name,fn)=>function(...args){const t=performance.now();try{return fn(...args);}finally{add(`${name}.ms`,performance.now()-t);add(`${name}.calls`);}};
const context={window:{},URL,URLSearchParams,performance,measure,location:{hash:''},history:{replaceState(){}},
 document};
let script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
script=script.replace('const { evaluate, query,',"core.query=measure('query',core.query); core.evaluate=measure('evaluate',core.evaluate);\nconst { evaluate, query,");
script=script.replace(/\ninit\(\);/, '\n'+['renderMap','renderResults','renderSources','renderInspect','renderGraph'].map(name=>`${name}=measure('${name}',${name});`).join('\n')+'\ninit();');
vm.runInNewContext(script,context);
const h=context.window.hallmark;
function run(name,action){
 action(0);for(const k of Object.keys(stats))delete stats[k];
 const samples=[];
 for(let i=0;i<30;i++){const t=performance.now();action(i+1);samples.push(performance.now()-t);}
 samples.sort((a,b)=>a-b);
 const result={scenario:name,jsMedian_ms:+samples[15].toFixed(2),jsP95_ms:+samples[28].toFixed(2),perInteraction:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,+(v/30).toFixed(2)]))};
 console.log(JSON.stringify(result));return result;
}
for(const dataset of ['copernicus-langtang','lroc-nassau02']) {
h.select({dataset});
const nodeIds=h.current().evaluation.pipeline.operations.map(op=>op.id);
const selection=run(dataset+' cell selection',i=>{
 const g=elements.get('map').querySelectorAll('.cell').find(g=>+g.dataset.r===10+i%10&&+g.dataset.c===20+i%8);
 clickCell(g);
});
const steps=run('processing step (includes first visits)',i=>elements.get('graph').querySelector(`[data-node="${nodeIds[i%nodeIds.length]}"]`).listeners.click());
const warm=run('processing step (cached)',i=>elements.get('graph').querySelector(`[data-node="${nodeIds[i%nodeIds.length]}"]`).listeners.click());
assert.equal(h.current().evaluation.dataset.id,dataset);
if(process.argv.includes('--check')) {
 assert.equal(selection.perInteraction['map.writes']||0,0,'Selecting a cell must not replace the full map');
 assert.equal(selection.perInteraction['cell.listeners']||0,0,'Selecting a cell must not rebind thousands of handlers');
 assert.equal(steps.perInteraction['cell.listeners']||0,0,'Step changes must not rebind cell handlers');
 assert.equal(selection.perInteraction['evaluate.calls']||0,0,'Selection must reuse the existing evaluation');
 assert.equal(steps.perInteraction['evaluate.calls']||0,0,'Step changes must reuse the existing evaluation');
 assert.equal(warm.perInteraction['detached.writes']||0,0,'Cached steps must not rebuild SVG layers');
 assert.equal(selection.perInteraction['map-content.swaps']||0,0,'Cell selection must retain the active layer');
 assert.equal(selection.perInteraction['inspect.writes']||0,0,'Do not rebuild the closed Full record');
}

}
