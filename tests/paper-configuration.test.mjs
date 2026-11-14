// Steps 5.2 and 6.1: the paper configuration (?paper=1; D2 package B, D5 none, ground rules 4 and 9).
// app.js needs a browser DOM, so these tests check the pieces it uses: the case and layer rules, the
// session it creates, the route rule, the removal list applied to index.html, and the HTML renderers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTerrain} from '../editor/data.js';
import {createSession} from '../editor/session.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {DEFAULT_LIMITS} from '../src/core/index.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {inspectorHTML,pipelineHTML} from '../editor/inspector.js';
import {terrainCaseId,lunarScenarioHTML,scenarioLimitsText} from '../editor/case-presentation.js';
import {TRAVERSAL_COST} from '../editor/planner.js';
import {isPaperConfiguration,paperCaseId,PAPER_LIMITS,PAPER_REMOVED_IDS,PAPER_REMOVED_LAYERS,paperMapLayer,paperPipeline,paperRoute,paperRouteEndpoints,paperExportPath,PAPER_ROUTE_RULE,PAPER_ROUTE_NOTE} from '../editor/paper-config.js';

const cache=new Map();
async function load(id){
 if(cache.has(id))return cache.get(id);
 const original=globalThis.fetch;globalThis.fetch=async url=>new Response(await readFile(new URL(url)));
 let ds;try{ds=await loadTerrain(id,'ground');}finally{globalThis.fetch=original;}
 const values=Object.fromEntries(['heights','slope','roughness','combined'].map(n=>[n,evaluateRaster(ds,n)]));
 const entry={ds,values};cache.set(id,entry);return entry;
}
const fieldsFor=(ds,values,limits)=>({...values,...evaluateLimitRasters(ds,values,limits)});
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
// A limit-like value: degrees, or a sub-metre height spread such as "0.15 m" (grid spacings like "5 m cell" are not limits).
const LIMIT_VALUE=/\d+(\.\d+)?\s*°|\b0\.\d+\s*m\b/;
const PLANNING_CONTROLS=/data-plan-|Set start|Set goal|>\s*(Plan|Replan|Approve|Approved ✓)\s*<|Exclude \d|Route objectives|data-status=|Previous route|plan-cost/;

// Remove one element (and its descendants) by id from static HTML, as app.js does in the DOM.
function removeById(html,id){
 const open=new RegExp(`<([a-z]+)\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
 assert.ok(open,`index.html has #${id}`);
 const tag=open[1],re=new RegExp(`<(/?)${tag}\\b[^>]*>`,'g');re.lastIndex=open.index;let depth=0,match;
 while((match=re.exec(html))){depth+=match[1]?-1:1;if(depth===0)return html.slice(0,open.index)+html.slice(re.lastIndex);}
 throw new Error(`#${id} is not closed`);
}
async function paperIndex(){
 let html=await readFile(new URL('../editor/index.html',import.meta.url),'utf8');
 for(const id of PAPER_REMOVED_IDS)html=removeById(html,id);
 for(const value of PAPER_REMOVED_LAYERS){const option=new RegExp(`<option value="${value}">[^<]*</option>`);assert.match(html,option);html=html.replace(option,'');}
 return html;
}

test('6.1 the paper flag is ?paper=1; the case falls back to Connecting Ridge only in the paper configuration',()=>{
 assert.equal(isPaperConfiguration(new URLSearchParams('paper=1')),true);
 for(const query of ['','paper=0','paper=true','case=moon'])assert.equal(isPaperConfiguration(new URLSearchParams(query)),false);
 assert.equal(paperCaseId(null),'connecting-ridge');
 assert.equal(paperCaseId('moon'),'moon');
 assert.equal(paperCaseId('connecting-ridge'),'connecting-ridge');
 // Normal default unchanged (step 6.2 is not decided).
 assert.equal(terrainCaseId(null),'moon');
 for(const layer of ['traversal-cost','height-support'])assert.equal(paperMapLayer(layer),'assessment');
 for(const layer of ['height-rms','slope','roughness','assessment'])assert.equal(paperMapLayer(layer),layer);
});

test('6.1 Earth cases are not selectable in the paper configuration',async()=>{
 for(const id of ['earth','blatten','atami','unknown'])assert.equal(paperCaseId(id),'connecting-ridge');
 const html=await paperIndex(),terrain=html.match(/<select id="terrain"[\s\S]*?<\/select>/)[0];
 assert.deepEqual([...terrain.matchAll(/<option value="([^"]+)"/g)].map(m=>m[1]),['moon','connecting-ridge']);
 assert.doesNotMatch(terrain,/Earth|Nuugaatsiaq|Blatten/);
});

test('6.1 planning controls and hidden features are absent from the paper document and its rendered parts',async()=>{
 const html=await paperIndex();
 for(const id of PAPER_REMOVED_IDS)assert.doesNotMatch(html,new RegExp(`id="${id}"`));
 for(const pattern of [/plan-controls|route-comparison|rms-review|lidar-gaps|palette/,/Traversal cost|Flagged input fraction/,/value="(traversal-cost|height-support)"/])assert.doesNotMatch(html,pattern);
 // Inspection features stay.
 for(const id of ['layer','height-flags','flags','focus','limit-controls','path-section','proposed-path','path-highest-rms','inspector','pipeline','locator','export'])assert.match(html,new RegExp(`id="${id}"`));
 // app.js applies the same list and keeps the paper route fixed.
 const app=await readFile(new URL('../editor/app.js',import.meta.url),'utf8');
 assert.match(app,/for\(const id of PAPER_REMOVED_IDS\)[^\n]*element\.remove\(\)/);
 assert.match(app,/for\(const value of PAPER_REMOVED_LAYERS\)[^\n]*\.remove\(\)/);
 assert.match(app,/if\(paper\|\|!plan\|\|loading\)return;/);
 assert.match(app,/if\(!paper\)\$\('plan-controls'\)\.innerHTML=planControlsHTML/);
 // Rendered parts on both lunar cases.
 for(const id of ['connecting-ridge','moon']){
  const {ds,values}=await load(id),fields=fieldsFor(ds,values,PAPER_LIMITS);
  const session=createSession(ds,{selection:{layerId:'slope',cell:{row:120,col:120}},limits:{...PAPER_LIMITS},pipeline:paperPipeline(ds)}),snap=session.getSnapshot();
  const {start,goal,route:transect}=paperRoute(ds,fields),plan=createSupervisoryPlan(ds,fields,{start,goal,limits:{...PAPER_LIMITS},branch:PAPER_ROUTE_RULE.branch,matchSettings:{},proposalRoute:transect});
  const planning=plan.getSnapshot(),path=createProposedPath(ds,fields,planning.route.vertices,planning.route,{branch:planning.branch,matchSettings:planning.matchSettings,active:true});
  const strip=proposedPathHTML(path,{pathId:path.id,index:3},{planning,note:PAPER_ROUTE_NOTE});
  const graph=pipelineHTML(snap),inspector=inspectorHTML(snap,new Set(['inputs']),{heights:true,affected:true},null,{...planning,cell:null},'slope'),scenario=lunarScenarioHTML(ds,{paper:true});
  for(const part of [strip,graph,inspector,scenario])assert.doesNotMatch(part,PLANNING_CONTROLS);
  assert.doesNotMatch(graph,/Traversal cost|Flagged input fraction|data-layer="(traversal-cost|height-support)"/);
  assert.doesNotMatch(inspector,/Planning:|Terrain density/);
  assert.match(strip,/data-path-cell="0"/);assert.match(strip,/aria-pressed="true"/);assert.match(strip,/data-path-step/);
  assert.ok(text(strip).includes(text(PAPER_ROUTE_NOTE)));
 }
});

test('6.1 / 5.2 the paper configuration opens on Ridge with no limit set and no limit presented as a requirement',async()=>{
 const {ds,values}=await load(paperCaseId(new URLSearchParams('paper=1').get('case')));
 assert.equal(ds.caseId,'connecting-ridge');
 const session=createSession(ds,{selection:{layerId:'combined',cell:{row:120,col:120}},limits:{...PAPER_LIMITS},pipeline:paperPipeline(ds)});
 const snap=session.getSnapshot();
 assert.deepEqual(snap.limits,{...snap.limits,slopeDeg:null,roughness_m:null});
 for(const id of ['slope-criterion','roughness-criterion']){const field=fieldsFor(ds,values,snap.limits)[id];assert.equal(field.limit,null);}
 assert.ok(!snap.pipeline.byId['traversal-cost']&&!snap.pipeline.byId['height-support']);
 const limitsText=scenarioLimitsText(ds,snap.limits),scenario=text(lunarScenarioHTML(ds,{paper:true}));
 for(const part of [limitsText,scenario]){assert.doesNotMatch(part,LIMIT_VALUE);assert.match(part,/scenario setting, not a rover requirement/);}
 for(const layerId of ['combined','slope-criterion','roughness-criterion']){
  const s=createSession(ds,{selection:{layerId,cell:{row:120,col:120}},limits:{...PAPER_LIMITS},pipeline:paperPipeline(ds)}).getSnapshot();
  assert.equal(s.record.value,null);
  assert.doesNotMatch(text(inspectorHTML(s,new Set(),{},null,null,layerId)),/≤\s*\d|\blimit (of|is) \d/i);
 }
 // The static sliders carry no default limit value.
 const index=await readFile(new URL('../editor/index.html',import.meta.url),'utf8');
 for(const id of ['range-slope','range-roughness'])assert.doesNotMatch(index.match(new RegExp(`<input id="${id}"[^>]*>`))[0],/\bvalue=/);
});

test('6.1 the illustrative route follows the written rule on both lunar cases',async()=>{
 assert.equal(PAPER_ROUTE_RULE.status,'Approved by the authors, 6 Nov 2026');
 assert.equal(PAPER_ROUTE_RULE.cost,undefined);
 const doc=await readFile(new URL('../docs/paper-route-rule.md',import.meta.url),'utf8');
 assert.match(doc,/Approved by the authors/);assert.ok(doc.includes(PAPER_ROUTE_RULE.id));
 const app=await readFile(new URL('../editor/app.js',import.meta.url),'utf8');
 assert.match(app,/if\(!paper\)plan\.dispatch\(\{type:'plan'\}\)/);
 for(const id of ['connecting-ridge','moon']){
  const {ds,values}=await load(id),fields=fieldsFor(ds,values,PAPER_LIMITS);
  // The rule, restated independently: every native column of the middle row that has a slope result.
  const margin=(ds.W-fields.slope.grid.W)/2,row=Math.floor(ds.H/2);
  const expected=Array.from({length:fields.slope.grid.W},(_,k)=>({row,col:margin+k}));
  assert.deepEqual(paperRouteEndpoints(ds,fields),{start:expected[0],goal:expected.at(-1)});
  const {route}=paperRoute(ds,fields);
  assert.equal(route.ok,true);assert.equal(route.branch,'slope');
  assert.deepEqual(route.vertices,expected);
  assert.equal(route.cost,undefined);assert.equal(route.cellCosts,undefined);
  // The plan the editor builds keeps exactly this route; no planner runs, and limits do not change it.
  const plan=createSupervisoryPlan(ds,fields,{start:expected[0],goal:expected.at(-1),limits:{...PAPER_LIMITS},branch:PAPER_ROUTE_RULE.branch,matchSettings:{},proposalRoute:route});
  assert.deepEqual(plan.getSnapshot().route.vertices,expected);
  const withLimits=fieldsFor(ds,values,{...DEFAULT_LIMITS,slopeDeg:5,roughness_m:0.1});
  assert.deepEqual(paperRoute(ds,withLimits).route.vertices,expected);
 }
});

test('6.1 the paper export of the illustrative route carries no cost',async()=>{
 const app=await readFile(new URL('../editor/app.js',import.meta.url),'utf8');
 assert.match(app,/goal:route\.goal\},proposedPath:proposedPath\?\{\.\.\.paperExportPath\(proposedPath\)/);
 for(const id of ['connecting-ridge','moon']){
  const {ds,values}=await load(id),fields=fieldsFor(ds,values,PAPER_LIMITS);
  const {start,goal,route:transect}=paperRoute(ds,fields),plan=createSupervisoryPlan(ds,fields,{start,goal,limits:{...PAPER_LIMITS},branch:PAPER_ROUTE_RULE.branch,matchSettings:{},proposalRoute:transect});
  const planning=plan.getSnapshot(),path=createProposedPath(ds,fields,planning.route.vertices,planning.route,{branch:planning.branch,matchSettings:planning.matchSettings,active:true});
  // The editor-side path does carry the planning grid's terrain cost; the export must not.
  assert.ok(path.cells.some(c=>Number.isFinite(c.priority?.terrainCost)));
  const exported=JSON.stringify(paperExportPath(path));
  assert.doesNotMatch(exported,/"(priority|terrainCost|cost|costRange|cellCosts|terms)"/);
  assert.equal(JSON.parse(exported).cells.length,252);
 }
 assert.doesNotMatch(lunarScenarioHTML((await load('connecting-ridge')).ds,{paper:true}),/cost follow/);
});

test('6.1 normal mode is unchanged apart from the 5.1 / 5.2 text',async()=>{
 const {ds}=await load('connecting-ridge');
 const snap=createSession(ds,{selection:{layerId:'slope',cell:{row:120,col:120}}}).getSnapshot();
 assert.equal(snap.limits.slopeDeg,DEFAULT_LIMITS.slopeDeg);assert.equal(snap.limits.roughness_m,DEFAULT_LIMITS.roughness_m);
 assert.ok(snap.pipeline.byId['traversal-cost']&&snap.pipeline.byId['height-support']);
 const index=await readFile(new URL('../editor/index.html',import.meta.url),'utf8');
 for(const id of PAPER_REMOVED_IDS)assert.match(index,new RegExp(`id="${id}"`));
 for(const value of ['earth','blatten','traversal-cost','height-support'])assert.match(index,new RegExp(`<option value="${value}"`));
 // 5.2: default limits read as scenario settings, not requirements.
 assert.match(scenarioLimitsText(ds,snap.limits),/scenario settings[^.]*not rover requirements/);
 assert.match(lunarScenarioHTML(ds),/not an actual mission route/);
 assert.match(lunarScenarioHTML(ds),/Limits are scenario settings, not rover requirements/);
 assert.doesNotMatch(lunarScenarioHTML(ds),LIMIT_VALUE);
});
