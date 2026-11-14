import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLazy,query} from '../src/core/index.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {planRoute,createPlanningGrid} from '../editor/planner.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {planControlsHTML} from '../editor/plan-controls.js';
import {inspectorHTML} from '../editor/inspector.js';
import {compareRoutes,routeMetrics,routeComparisonHTML,sameRouteGeometry} from '../editor/route-comparison.js';
import {createProposedPath,crossedCells,proposedPathHTML} from '../editor/proposed-path.js';
import {createSession} from '../editor/session.js';
import {layerGrid,cellCenter,cellCoordinates} from '../editor/spatial.js';

const limits={slopeDeg:15,roughness_m:.15};
function fixture(W=5,H=5,res=1,quality=true){
  const dataset={id:'planning-fixture',W:W+4,H:H+4,res,heights:Array((W+4)*(H+4)).fill(0),...(quality?{quality:{codes:Array((W+4)*(H+4)).fill(14)}}:{})};
  const grid={W,H,res},values=()=>new Float64Array(W*H),flags=()=>quality?{suspicious:new Uint32Array(W*H),total:new Uint32Array(W*H).fill(25)}:null;
  const fields=Object.fromEntries(['slope','roughness','combined'].map(node=>[node,{node,grid,values:values(),quality:flags()}]));
  return {dataset,values:fields,fields:{...fields,...evaluateLimitRasters(dataset,fields,limits)}};
}
const cell=(row,col)=>({row:row+2,col:col+2});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(a),Math.abs(b)),`${a} ≠ ${b}`);

// Independent O(n²) Dijkstra reference. It calculates edge weights from the stated
// formula directly rather than reading A*'s density array, heap or heuristic.
function shortestReference(ds,fields,start,goal,exclusions=[]){
  const {W,H}=fields.slope.grid,N=W*H,dist=Array(N).fill(Infinity),done=new Set(),excluded=new Set(exclusions.map(c=>(c.row-2)*W+c.col-2));
  const startIndex=(start.row-2)*W+start.col-2,goalIndex=(goal.row-2)*W+goal.col-2;
  const density=i=>{
    const s=fields.slope.values[i],r=fields.roughness.values[i];
    if(excluded.has(i)||!Number.isFinite(s)||!Number.isFinite(r))return Infinity;
    return 1+s/90+r+8*(Number(s>limits.slopeDeg)+Number(r>limits.roughness_m));
  };
  if(!Number.isFinite(density(startIndex))||!Number.isFinite(density(goalIndex)))return Infinity;
  dist[startIndex]=0;
  while(done.size<N){
    let current=-1;for(let i=0;i<N;i++)if(!done.has(i)&&(current<0||dist[i]<dist[current]))current=i;
    if(!Number.isFinite(dist[current]))return Infinity;
    if(current===goalIndex)return dist[current];
    done.add(current);
    for(let next=0;next<N;next++)if(!done.has(next)&&Math.abs(Math.floor(current/W)-Math.floor(next/W))+Math.abs(current%W-next%W)===1){
      const candidate=dist[current]+ds.res*(density(current)+density(next))/2;
      if(candidate<dist[next])dist[next]=candidate;
    }
  }
  return Infinity;
}

test('A* matches an independent shortest-path reference across varied costs, flags, missing cells and native spacing',()=>{
  let seed=187;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  for(let n=0;n<30;n++){
    const {dataset,values}=fixture(6,5,n%2?4:1,n%3!==0);
    for(let i=0;i<30;i++){
      values.slope.values[i]=random()*40;values.roughness.values[i]=random()*.4;
      if(random()<.15&&i!==0&&i!==29)values.roughness.values[i]=NaN;
      if(values.combined.quality)values.combined.quality.suspicious[i]=Math.floor(random()*26);
    }
    const fields={...values,...evaluateLimitRasters(dataset,values,limits)},start=cell(0,0),goal=cell(4,5),exclusions=[cell(2,3)];
    const expected=shortestReference(dataset,fields,start,goal,exclusions),actual=planRoute(dataset,fields,{start,goal,exclusions});
    assert.equal(actual.ok,Number.isFinite(expected));
    if(actual.ok){near(actual.cost,expected);near(actual.cost,Object.values(actual.breakdown).reduce((a,b)=>a+b,0));assert.deepEqual(actual,planRoute(dataset,fields,{start,goal,exclusions}));}
  }
});

test('exceeded penalties cause a predictable detour but do not block the only exceeded route',()=>{
  const {dataset,values}=fixture(5,3);values.roughness.values[7]=.2;
  const fields={...values,...evaluateLimitRasters(dataset,values,limits)},options={start:cell(1,0),goal:cell(1,4)};
  const route=planRoute(dataset,fields,options);
  assert.equal(route.vertices.length,7);assert.ok(!route.vertices.some(c=>c.row===3&&c.col===4));near(route.cost,6);
  const only=planRoute(dataset,fields,{...options,exclusions:Array.from({length:5},(_,col)=>[cell(0,col),cell(2,col)]).flat()});
  assert.equal(only.ok,true);assert.equal(only.vertices.length,5);near(only.breakdown.exceeded,8);near(only.cost,12.2);
});

test('flag evidence changes independently of route cost; excluding an inspected cell changes the proposal and approval',()=>{
  const {dataset,values}=fixture(5,3),options={start:cell(1,0),goal:cell(1,4),limits};
  const fields={...values,...evaluateLimitRasters(dataset,values,limits)},before=planRoute(dataset,fields,options);
  const clear=createProposedPath(dataset,fields,before.vertices);
  values.combined.quality.suspicious[7]=25;
  const after=planRoute(dataset,fields,options),flagged=createProposedPath(dataset,fields,after.vertices);
  assert.deepEqual(after,before);assert.equal(after.vertices.length,5);assert.equal(after.cost,4);
  assert.equal(routeMetrics(clear).suspiciousCells,0);assert.equal(routeMetrics(flagged).suspiciousCells,1);
  assert.deepEqual(Object.keys(after.breakdown),['baseline','slope','roughness','exceeded']);
  const model=createSupervisoryPlan(dataset,fields,options);model.dispatch({type:'plan'});const approved=model.dispatch({type:'approve'});
  const excluded=model.dispatch({type:'exclude',cell:cell(1,2)});
  assert.equal(excluded.approval,null);assert.equal(excluded.route,null);assert.deepEqual(excluded.previous.approval,approved.approval);
  const revised=model.dispatch({type:'plan'});assert.equal(revised.route.vertices.length,7);assert.equal(revised.route.cost,6);
  assert.ok(!revised.route.vertices.some(c=>c.row===3&&c.col===4));assert.equal(revised.approval,null);
  assert.equal(revised.previous.route.id,approved.route.id);assert.ok(revised.revision>approved.revision);
  assert.doesNotMatch(JSON.stringify(model.exportPlan()),/policy|qualityWeight|qualityFraction/);
});

test('zero limits, unavailable branches, exclusions and invalid endpoints remain explicit',()=>{
  const {dataset,values}=fixture(3,3),zero={slopeDeg:0,roughness_m:0},fields={...values,...evaluateLimitRasters(dataset,values,zero)};
  const options={start:cell(0,0),goal:cell(2,2)};
  assert.equal(planRoute(dataset,fields,options).ok,true);near(planRoute(dataset,fields,options).cost,4);
  for(const endpoint of [null,{row:0,col:0},{row:2.5,col:2},{row:99,col:2}])assert.equal(planRoute(dataset,fields,{...options,start:endpoint}).ok,false);
  assert.equal(planRoute(dataset,fields,{...options,exclusions:[options.start]}).ok,false);
  assert.match(planRoute(dataset,fields,{...options,exclusions:[cell(1,0),cell(1,1),cell(1,2)]}).error,/No route/);
  values.roughness.values[0]=NaN;values.slope.values[0]=20;
  const missing={...values,...evaluateLimitRasters(dataset,values,zero)};
  assert.equal(missing.combined.states[0],1);assert.equal(missing.combined.incomplete[0],1);
  assert.equal(planRoute(dataset,missing,options).ok,false);
  const single=planRoute(dataset,fields,{start:cell(2,2),goal:cell(2,2)});assert.equal(single.ok,true);assert.equal(single.cost,0);assert.deepEqual(crossedCells(single.vertices,dataset.W,dataset.H),[cell(2,2)]);
});

test('native route coordinates, exact crossed-cell coverage and spacing stay consistent',()=>{
  for(const res of [1,4]){
    const {dataset,fields}=fixture(5,4,res),route=planRoute(dataset,fields,{start:cell(0,0),goal:cell(3,4)}),path=createProposedPath(dataset,fields,route.vertices,route);
    assert.deepEqual(path.cells.map(({row,col})=>({row,col})),route.vertices);
    assert.equal(path.cells.length,8);near(route.distance_m,7*res);near(route.cost,7*res);
    assert.equal((proposedPathHTML(path,null).match(/data-path-cell=/g)||[]).length,route.vertices.length);
    for(const c of route.vertices){const point=cellCenter(layerGrid(dataset,{grid:'heights'}),c);assert.deepEqual(cellCoordinates(layerGrid(dataset,{grid:'analysis'}),point),{row:c.row-2,col:c.col-2});}
    for(let i=1;i<route.vertices.length;i++)assert.equal(Math.abs(route.vertices[i].row-route.vertices[i-1].row)+Math.abs(route.vertices[i].col-route.vertices[i-1].col),1);
  }
});

test('planned cell values, support union, selected-cell costs and inspector query agree',()=>{
  const base=datasetById('reference'),dataset={...base,quality:{codes:base.heights.map((_,i)=>i%3?14:3)}};
  const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(dataset,id)])),fields={...values,...evaluateLimitRasters(dataset,values,limits)};
  const start={row:2,col:2},goal={row:dataset.H-3,col:dataset.W-3},model=createSupervisoryPlan(dataset,fields,{start,goal,limits});
  const state=model.dispatch({type:'plan'}),path=createProposedPath(dataset,fields,state.route.vertices,state.route),evaluation=evaluateLazy(dataset,limits),session=createSession(dataset,{limits});
  assert.deepEqual(path.cells.map(({row,col})=>({row,col})),state.route.vertices);
  for(const c of path.cells){
    const analysis={row:c.row-2,col:c.col-2},q=query(evaluation,'combined',analysis),cost=state.route.cellCosts[c.index];
    const flags=new Set(q.sourceCells.filter(s=>s.quality?.code===3).map(s=>s.index));
    assert.equal(c.suspicious,flags.size);assert.equal(c.total,new Set(q.sourceCells.map(s=>s.index)).size);
    assert.deepEqual(Object.keys(cost),['baseline','slope','roughness','exceeded','density']);
    session.dispatch({type:'path-select',pathId:path.id,index:c.index,layerId:'traversal-cost',cell:analysis});
    assert.equal(session.getSnapshot().record.quality.suspicious,c.suspicious);assert.equal(session.getSnapshot().record.quality.total,c.total);
    assert.equal(session.getSnapshot().record.value,cost.density);
    assert.match(inspectorHTML(session.getSnapshot()),new RegExp(`Input flags</span><strong>suspicious in ${c.suspicious} of ${c.total} source heights`));
    assert.doesNotMatch(planControlsHTML(state,{selectedCell:c}),/Selected route cell|Selected cell cost terms/);
  }
});

test('approval and exported route belong to an exact revision; every planning input invalidates them',()=>{
  const {dataset,fields,values}=fixture(5,5),options={start:cell(0,0),goal:cell(4,4),limits};
  const changes=[{type:'endpoint',role:'start',cell:cell(0,1)},{type:'endpoint',role:'goal',cell:cell(4,3)},{type:'exclude',cell:cell(2,2)},{type:'limits',limits:{slopeDeg:0,roughness_m:0},fields:{...values,...evaluateLimitRasters(dataset,values,{slopeDeg:0,roughness_m:0})}}];
  for(const change of changes){
    const model=createSupervisoryPlan(dataset,fields,options);assert.throws(()=>model.dispatch({type:'approve'}));
    model.dispatch({type:'plan'});const approved=model.dispatch({type:'approve'}),exported=model.exportPlan().current;
    assert.equal(exported.status,'Approved');assert.equal(exported.approval.revision,exported.revision);assert.equal(exported.approval.routeId,exported.route.id);assert.deepEqual(exported.start,options.start);assert.deepEqual(exported.limits,limits);
    const draft=model.dispatch(change);assert.ok(draft.revision>approved.revision);assert.equal(draft.status,'Draft');assert.equal(draft.route,null);assert.equal(draft.approval,null);assert.equal(model.exportPlan().current.approval,null);
    assert.match(planControlsHTML(draft),/data-plan-action="approve" disabled/);
    const reviewed=model.dispatch({type:'plan'});assert.equal(reviewed.status,'Needs review');assert.equal(reviewed.approval,null);
  }
  const model=createSupervisoryPlan(dataset,fields,options);model.dispatch({type:'exclude',cell:cell(2,2)});model.dispatch({type:'plan'});model.dispatch({type:'approve'});
  assert.equal(model.dispatch({type:'clear-exclusions'}).approval,null);
  model.dispatch({type:'plan'});model.dispatch({type:'approve'});model.dispatch({type:'endpoint',role:'goal',cell:cell(0,0)});model.dispatch({type:'exclude',cell:cell(0,0)});
  const failed=model.dispatch({type:'plan'});assert.equal(failed.status,'Draft');assert.equal(failed.route,null);assert.equal(failed.approval,null);assert.match(failed.error,/excluded/);
  assert.equal(createSupervisoryPlan({...dataset,id:'other-data'},fields,options).getSnapshot().approval,null);
});

test('full Earth-size native analysis grid can be planned without allocating provenance records',()=>{
  const {dataset,fields}=fixture(508,508,1,false),route=planRoute(dataset,fields,{start:cell(0,0),goal:cell(507,507)});
  assert.equal(route.ok,true);assert.equal(route.vertices.length,1015);assert.equal(route.cost,1014);assert.ok(route.visited<=508*508);
});

test('one previous successful plan survives repeated draft edits and failed replans with original parameters and approval',()=>{
  const {dataset,fields,values}=fixture(5,5),options={start:cell(0,0),goal:cell(4,4),limits},model=createSupervisoryPlan(dataset,fields,options);
  assert.equal(model.getSnapshot().previous,null);
  model.dispatch({type:'plan'});const first=model.dispatch({type:'approve'});
  model.dispatch({type:'endpoint',role:'goal',cell:cell(4,3)});
  const changedLimits={slopeDeg:0,roughness_m:0};
  model.dispatch({type:'limits',limits:changedLimits,fields:{...values,...evaluateLimitRasters(dataset,values,changedLimits)}});
  model.dispatch({type:'exclude',cell:options.start});
  const failed=model.dispatch({type:'plan'});
  assert.equal(failed.route,null);assert.equal(failed.approval,null);assert.equal(failed.status,'Draft');assert.match(failed.error,/excluded/);
  assert.equal(failed.previous.route.id,first.route.id);assert.equal(failed.previous.revision,first.revision);assert.equal(failed.previous.historical,true);
  assert.deepEqual(failed.previous.start,first.start);assert.deepEqual(failed.previous.goal,first.goal);assert.deepEqual(failed.previous.limits,limits);assert.equal(failed.previous.policy,undefined);assert.deepEqual(failed.previous.exclusions,[]);assert.deepEqual(failed.previous.approval,first.approval);
  assert.match(planControlsHTML(failed),/data-plan-action="approve" disabled/);
  const draftExport=model.exportPlan();assert.equal(draftExport.current.route,null);assert.equal(draftExport.current.approval,null);assert.deepEqual(draftExport.previous.approval,first.approval);
  model.dispatch({type:'clear-exclusions'});
  const second=model.dispatch({type:'plan'});assert.equal(second.previous.route.id,first.route.id);assert.equal(second.status,'Needs review');assert.equal(second.approval,null);
  const thirdDraft=model.dispatch({type:'endpoint',role:'goal',cell:cell(3,3)});assert.equal(thirdDraft.previous.route.id,second.route.id);assert.equal(thirdDraft.previous.approval,null);assert.deepEqual(thirdDraft.previous.limits,changedLimits);
  const third=model.dispatch({type:'plan'});assert.equal(third.previous.route.id,second.route.id);assert.equal(third.route.id===second.route.id,false);
  assert.equal(third.previous.previous,undefined);
});

test('direct Replan captures the current plan, while snapshots, exports and new datasets isolate history and approval',()=>{
  const {dataset,fields}=fixture(5,5),options={start:cell(0,0),goal:cell(4,4),limits},model=createSupervisoryPlan(dataset,fields,options);
  model.dispatch({type:'plan'});const approved=model.dispatch({type:'approve'}),replanned=model.dispatch({type:'plan'});
  assert.equal(replanned.previous.route.id,approved.route.id);assert.deepEqual(replanned.previous.approval,approved.approval);assert.equal(replanned.approval,null);assert.equal(replanned.status,'Needs review');
  const oldId=replanned.previous.route.id;
  replanned.previous.route.vertices[0].row=900;replanned.previous.start.row=900;replanned.previous.limits.slopeDeg=90;replanned.previous.approval.routeId='mutated';replanned.route.vertices[0].col=900;
  const exported=model.exportPlan();assert.equal(exported.previous.route.id,oldId);assert.deepEqual(exported.previous.route.vertices[0],options.start);assert.deepEqual(exported.current.route.vertices[0],options.start);assert.equal(exported.previous.limits.slopeDeg,limits.slopeDeg);assert.equal(exported.previous.approval.routeId,oldId);
  exported.previous.route.vertices.pop();exported.current.route.vertices.pop();exported.previous.approval.routeId='mutated again';
  assert.equal(model.getSnapshot().previous.route.vertices.length,9);assert.equal(model.getSnapshot().route.vertices.length,9);assert.equal(model.exportPlan().previous.approval.routeId,oldId);
  model.dispatch({type:'approve'});const again=model.dispatch({type:'plan'});assert.equal(again.previous.route.id,replanned.route.id);assert.equal(again.previous.approval.routeId,replanned.route.id);assert.equal(again.approval,null);
  for(const id of ['different-dataset','same-terrain:other-surface']){
    const reset=createSupervisoryPlan({...dataset,id},fields,options);assert.equal(reset.getSnapshot().previous,null);assert.equal(reset.getSnapshot().approval,null);assert.equal(reset.dispatch({type:'plan'}).previous,null);
  }
});

test('previous and proposed metrics are independently queried at the same current limits, preserving original exported limits',()=>{
  const base=datasetById('reference'),dataset={...base,quality:{codes:base.heights.map((_,i)=>i%4?14:3)}};
  const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(dataset,id)])),oldLimits={slopeDeg:90,roughness_m:100},oldFields={...values,...evaluateLimitRasters(dataset,values,oldLimits)};
  const model=createSupervisoryPlan(dataset,oldFields,{start:{row:2,col:2},goal:{row:dataset.H-3,col:dataset.W-3},limits:oldLimits});
  const old=model.dispatch({type:'plan'});assert.equal(routeMetrics(createProposedPath(dataset,oldFields,old.route.vertices)).slopeExceeded,0);
  const currentLimits={slopeDeg:0,roughness_m:0},currentFields={...values,...evaluateLimitRasters(dataset,values,currentLimits)};
  model.dispatch({type:'limits',limits:currentLimits,fields:currentFields});model.dispatch({type:'endpoint',role:'goal',cell:{row:dataset.H-4,col:dataset.W-3}});
  const state=model.dispatch({type:'plan'}),previous=createProposedPath(dataset,currentFields,state.previous.route.vertices),proposed=createProposedPath(dataset,currentFields,state.route.vertices),comparison=compareRoutes(previous,proposed),evaluation=evaluateLazy(dataset,currentLimits);
  for(const [path,metrics] of [[previous,comparison.previous],[proposed,comparison.proposed]]){
    const queries=path.cells.map(c=>query(evaluation,'combined',{row:c.row-2,col:c.col-2}));
    assert.equal(metrics.cells,queries.length);
    assert.equal(metrics.slopeExceeded,queries.filter(q=>q.branches.slope.outcome==='exceeded').length);
    assert.equal(metrics.roughnessExceeded,queries.filter(q=>q.branches.roughness.outcome==='exceeded').length);
    assert.equal(metrics.suspiciousCells,queries.filter(q=>q.quality.suspicious>0).length);
    assert.ok(metrics.suspiciousCells<=metrics.cells);
  }
  assert.ok(comparison.previous.slopeExceeded>0);assert.notEqual(comparison.previous.cells,comparison.proposed.cells);
  assert.deepEqual(model.exportPlan().previous.limits,oldLimits);assert.deepEqual(model.exportPlan().current.limits,currentLimits);
  const html=routeComparisonHTML(comparison);assert.match(html,/Both at current limits/);assert.match(html,new RegExp(`${comparison.previous.cells} cells`));assert.match(html,new RegExp(`${comparison.proposed.cells} cells`));assert.equal((html.match(/data-comparison-metric=/g)||[]).length,3);
  const strip=proposedPathHTML(proposed,null,{comparison:true});assert.equal((strip.match(/data-path-cell=/g)||[]).length,proposed.cells.length);assert.doesNotMatch(strip,/<small>\d+ exceeded/);
});

test('comparison is explicit for identical routes, reversed endpoints, absent quality and a failed new plan',()=>{
  const {dataset,fields}=fixture(5,3,4,false),route=planRoute(dataset,fields,{start:cell(1,0),goal:cell(1,4)}),path=createProposedPath(dataset,fields,route.vertices);
  assert.equal(compareRoutes(null,path),null);assert.equal(routeComparisonHTML(null),'');
  const same=compareRoutes(path,path);assert.equal(same.unchanged,true);assert.equal(same.coincident,true);assert.equal(same.previous.suspiciousCells,null);assert.equal(same.proposed.suspiciousCells,null);
  assert.match(routeComparisonHTML(same),/Route unchanged/);assert.equal((routeComparisonHTML(same).match(/Not supplied/g)||[]).length,2);
  const reversed=createProposedPath(dataset,fields,[...route.vertices].reverse()),reverse=compareRoutes(path,reversed);
  assert.equal(sameRouteGeometry(path,reversed),true);assert.equal(reverse.unchanged,false);assert.match(routeComparisonHTML(reverse),/Same path geometry/);assert.doesNotMatch(routeComparisonHTML(reverse),/Route unchanged/);
  const draft=compareRoutes(path,null);assert.equal(draft.proposed,null);assert.equal(draft.unchanged,false);assert.match(routeComparisonHTML(draft),/Not planned/);assert.equal((routeComparisonHTML(draft).match(/<td>—<\/td>/g)||[]).length,3);
  assert.equal((proposedPathHTML(null,null,{comparison:true}).match(/data-path-cell=/g)||[]).length,0);
});
