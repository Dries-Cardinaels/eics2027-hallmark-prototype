import test from 'node:test';
import assert from 'node:assert/strict';
import {planRoute,createPlanningGrid,planningCell} from '../editor/planner.js';
import {PLANNING_BRANCHES,cellMatches,heightFlagAt,matchesEnabled} from '../editor/planning-priority.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {createSession} from '../editor/session.js';
import {createProposedPath,proposedPathHTML} from '../editor/proposed-path.js';
import {compareRoutes,routeComparisonHTML} from '../editor/route-comparison.js';
import {planControlsHTML} from '../editor/plan-controls.js';
import {inspectorHTML} from '../editor/inspector.js';
import {mapLegendHTML} from '../editor/map-legend.js';
import {createSurfaceMap} from '../editor/surface-map.js';
import {traversalCostField} from '../editor/traversal-cost.js';
import {pathDisplayColour,pathAssessmentScope} from '../editor/path-evidence.js';
import {palette} from '../editor/palette.js';

const limits={slopeDeg:15,roughness_m:.15};
const native=(row,col)=>({row:row+2,col:col+2});
const modes=[{heights:false,affected:false},{heights:true,affected:false},{heights:false,affected:true},{heights:true,affected:true}];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,a,b),`${a} != ${b}`);
function fixture(W=5,H=3,res=1,known=true){
  const dataset={id:'priority-fixture',W:W+4,H:H+4,res,heights:Array((W+4)*(H+4)).fill(0),...(known?{quality:{codes:Array((W+4)*(H+4)).fill(14)}}:{})};
  const grid={W,H,res};
  const values=Object.fromEntries(['slope','roughness','combined'].map(node=>[node,{node,grid,values:new Float64Array(W*H),quality:known?{suspicious:new Uint32Array(W*H),total:new Uint32Array(W*H).fill(25)}:null}]));
  const fields={...values,...evaluateLimitRasters(dataset,values,limits)};
  return {dataset,values,fields};
}

// Independent lexicographic O(n²) Dijkstra: no production grid, terms or match helpers.
function reference(ds,fields,{start,goal,branch,matchSettings,exclusions=[]}){
  const source=branch==='heights',full=['combined','traversal-cost'].includes(branch);
  const W=source?ds.W:fields.slope.grid.W,H=source?ds.H:fields.slope.grid.H,N=W*H;
  const rowOffset=(ds.H-H)/2,colOffset=(ds.W-W)/2;
  const index=c=>c&&(c.row>=rowOffset&&c.col>=colOffset&&c.row<rowOffset+H&&c.col<colOffset+W)?(c.row-rowOffset)*W+c.col-colOffset:-1;
  const a=index(start),b=index(goal),excluded=new Set(exclusions.map(index));
  const density=i=>{
    if(excluded.has(i))return Infinity;
    if(source)return Number.isFinite(ds.heights[i])?1:Infinity;
    let total=1;
    for(const value of ['slope','roughness'])if(full||branch.startsWith(value)){
      const f=fields[value].values[i];if(!Number.isFinite(f)||f<0)return Infinity;
      total+=f/(value==='slope'?90:1);
      if(full||branch===value+'-criterion'){
        const check=fields[value+'-criterion'];if(check.states[i]>1||check.incomplete?.[i])return Infinity;
        if(check.states[i]===1)total+=8;
      }
    }
    if(full&&fields.combined.incomplete?.[i])return Infinity;
    return total;
  };
  const match=i=>{
    if(!ds.quality)return 0;
    const row=Math.floor(i/W)+rowOffset,col=i%W+colOffset;
    const raw=(ds.quality.flaggedCodes||[3]).includes(ds.quality.codes[row*ds.W+col]);
    const support=source?false:fields[full?'combined':branch.replace('-criterion','')].quality.suspicious[i]>0;
    return Number(matchSettings.heights&&raw||!source&&matchSettings.affected&&support);
  };
  if(a<0||b<0||!Number.isFinite(density(a))||!Number.isFinite(density(b)))return null;
  const distances=Array.from({length:N},()=>[Infinity,Infinity]),done=new Set();distances[a]=[match(a),0];
  const less=(x,y)=>x[0]<y[0]||x[0]===y[0]&&x[1]<y[1];
  while(done.size<N){
    let current=-1;for(let i=0;i<N;i++)if(!done.has(i)&&(current<0||less(distances[i],distances[current])))current=i;
    if(!Number.isFinite(distances[current][1]))return null;
    if(current===b)return distances[current];
    done.add(current);
    for(let next=0;next<N;next++)if(!done.has(next)&&Math.abs(Math.floor(current/W)-Math.floor(next/W))+Math.abs(current%W-next%W)===1&&Number.isFinite(density(next))){
      const candidate=[distances[current][0]+match(next),distances[current][1]+ds.res*(density(current)+density(next))/2];
      if(less(candidate,distances[next]))distances[next]=candidate;
    }
  }
  return null;
}

test('lexicographic A* agrees with independent Dijkstra across all branches, flag modes, missing cells, exclusions and spacing',()=>{
  let seed=601;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  for(let run=0;run<12;run++){
    const {dataset:ds,values}=fixture(5,4,run%2?4:1,run%4!==0);
    if(ds.quality)for(let i=0;i<ds.heights.length;i++)ds.quality.codes[i]=random()<.18?3:14;
    for(let i=0;i<20;i++)for(const id of ['slope','roughness']){
      values[id].values[i]=random()*(id==='slope'?45:.5);
      if(i!==0&&i!==19&&random()<.08)values[id].values[i]=NaN;
      if(values[id].quality)values[id].quality.suspicious[i]=Number(random()<.28);
    }
    if(values.combined.quality)for(let i=0;i<20;i++)values.combined.quality.suspicious[i]=Number(values.slope.quality.suspicious[i]>0||values.roughness.quality.suspicious[i]>0);
    const fields={...values,...evaluateLimitRasters(ds,values,limits)};
    for(const branch of PLANNING_BRANCHES)for(const matchSettings of modes){
      const options={branch,matchSettings,start:branch==='heights'?{row:0,col:0}:native(0,0),goal:branch==='heights'?{row:ds.H-1,col:ds.W-1}:native(3,4),exclusions:[native(2,2)]};
      const expected=reference(ds,fields,options),actual=planRoute(ds,fields,options);
      assert.equal(actual.ok,Boolean(expected));
      if(!expected)continue;
      near(actual.cost,expected[1]);
      const enabled=matchSettings.heights||branch!=='heights'&&matchSettings.affected;
      assert.equal(actual.objectives.matchingCells,!ds.quality&&enabled?null:expected[0]);
      assert.deepEqual(actual,planRoute(ds,fields,options));
      assert.deepEqual(actual.objectiveOrder,enabled&&ds.quality?['matchingCells','terrainCost']:['terrainCost']);
      for(let i=1;i<actual.vertices.length;i++)assert.equal(Math.abs(actual.vertices[i].row-actual.vertices[i-1].row)+Math.abs(actual.vertices[i].col-actual.vertices[i-1].col),1);
    }
  }
});

test('avoidance is lexicographic, handles unavoidable matches, counts endpoints and unions matching sources once',()=>{
  const {dataset,values,fields}=fixture(),start=native(1,0),goal=native(1,4),flag=native(1,2);
  dataset.quality.codes[flag.row*dataset.W+flag.col]=3;values.combined.quality.suspicious[7]=25;
  for(let col=0;col<5;col++){values.roughness.values[col]=1e6;values.roughness.values[10+col]=1e6;}
  const current={...fields,...evaluateLimitRasters(dataset,values,limits)};
  const terrain=planRoute(dataset,current,{start,goal});assert.equal(terrain.vertices.length,5);
  for(const matchSettings of modes.slice(1)){
    const preferred=planRoute(dataset,current,{start,goal,matchSettings});assert.equal(preferred.objectives.matchingCells,0);assert.ok(preferred.cost>1e6);assert.equal(preferred.vertices.length,7);
    const forced=planRoute(dataset,current,{start,goal,matchSettings,exclusions:Array.from({length:5},(_,col)=>[native(0,col),native(2,col)]).flat()});
    assert.equal(forced.objectives.matchingCells,1);assert.equal(forced.vertices.length,5);
  }
  const matchSettings=modes[3];
  const single=planRoute(dataset,current,{start:flag,goal:flag,matchSettings});assert.equal(single.cost,0);assert.equal(single.objectives.matchingCells,1);
  const from=planRoute(dataset,current,{start:flag,goal,matchSettings});assert.equal(from.objectives.matchingCells,1);
  const to=planRoute(dataset,current,{start,goal:flag,matchSettings});assert.equal(to.objectives.matchingCells,1);
  assert.equal(cellMatches({heightFlag:true,affected:true},matchSettings),true);
});

test('terrain resolves equal match counts and deterministic row-major ties without row wrapping',()=>{
  const {dataset,values,fields}=fixture(3,3),start=native(0,0),goal=native(2,2),matchSettings=modes[3];
  const route=planRoute(dataset,fields,{start,goal,matchSettings});
  assert.deepEqual(route.vertices,[native(0,0),native(0,1),native(0,2),native(1,2),native(2,2)]);
  values.roughness.values[1]=.1;
  const lower=planRoute(dataset,{...values,...evaluateLimitRasters(dataset,values,limits)},{start,goal,matchSettings});
  assert.ok(!lower.vertices.some(c=>c.row===2&&c.col===3));near(lower.cost,4);
  assert.equal(planRoute(dataset,fields,{start:native(0,2),goal:native(1,0),matchSettings}).vertices.length,4);
});

test('branch availability and terms exclude downstream values, checks and margins',()=>{
  const {dataset,values}=fixture(3,3);values.slope.values.fill(20);values.roughness.values.fill(.3);
  const fields={...values,...evaluateLimitRasters(dataset,values,limits)},point=native(1,1);
  const expected={heights:[1,0],slope:[1+20/90,0],'slope-criterion':[1+20/90+8,8],roughness:[1.3,0],'roughness-criterion':[9.3,8],combined:[1+20/90+.3+16,16],'traversal-cost':[1+20/90+.3+16,16]};
  for(const [branch,[density,penalty]] of Object.entries(expected)){
    const grid=createPlanningGrid(dataset,fields,[],{branch}),i=grid.indexOf(point);near(grid.costs[i],density);assert.equal(grid.terms(i).exceeded,penalty);
  }
  values.roughness.values.fill(NaN);const missing={...values,...evaluateLimitRasters(dataset,values,limits)};
  assert.equal(planRoute(dataset,missing,{start:native(0,0),goal:native(2,2),branch:'slope'}).ok,true);
  assert.equal(planRoute(dataset,missing,{start:native(0,0),goal:native(2,2),branch:'combined'}).ok,false);
  assert.equal(planRoute(dataset,{}, {start:{row:0,col:0},goal:{row:dataset.H-1,col:dataset.W-1},branch:'heights'}).ok,true);
  assert.equal(planRoute(dataset,missing,{start:{row:0,col:0},goal:native(2,2),branch:'slope'}).ok,false);
  dataset.heights[0]=NaN;assert.equal(planRoute(dataset,{}, {start:{row:0,col:0},goal:{row:1,col:1},branch:'heights'}).ok,false);
});

test('affected matching follows exact branch support: Horn excludes a suspicious center; roughness includes it',()=>{
  const base=datasetById('reference'),point={row:9,col:5},ds={...base,quality:{codes:base.heights.map((_,i)=>i===point.row*base.W+point.col?3:14)}};
  const values=Object.fromEntries(['heights','slope','roughness','combined'].map(id=>[id,evaluateRaster(ds,id)])),fields={...values,...evaluateLimitRasters(ds,values,limits)};
  for(const branch of PLANNING_BRANCHES)for(const matchSettings of modes){
    const route=planRoute(ds,fields,{start:point,goal:point,branch,matchSettings});
    const expected=matchSettings.heights||matchSettings.affected&&['roughness','roughness-criterion','combined','traversal-cost'].includes(branch);
    assert.equal(route.objectives.matchingCells,Number(expected));
    const grid=createPlanningGrid(ds,fields,[],{branch,matchSettings}),cell=planningCell(grid,point);assert.equal(cell.match,expected);
    assert.equal(heightFlagAt(ds,point),true);
  }
});

test('unknown selected quality uses terrain-only ordering, while unknown blocked cells do not disable a known objective',()=>{
  const {dataset,fields}=fixture(3,3,1,false),options={start:native(0,0),goal:native(2,2)};
  const terrain=planRoute(dataset,fields,options),unknown=planRoute(dataset,fields,{...options,matchSettings:modes[3]});
  assert.deepEqual(unknown.vertices,terrain.vertices);assert.equal(unknown.cost,terrain.cost);assert.equal(unknown.objectives.matchingCells,null);assert.deepEqual(unknown.objectiveOrder,['terrainCost']);
  const known=fixture(3,3);known.values.combined.quality.total[4]=0;
  const blocked=planRoute(known.dataset,known.fields,{...options,matchSettings:modes[3],exclusions:[native(1,1)]});
  assert.deepEqual(blocked.objectiveOrder,['matchingCells','terrainCost']);assert.equal(blocked.matchesKnown,true);
  const incomplete=planRoute(known.dataset,known.fields,{...options,matchSettings:modes[3]});assert.deepEqual(incomplete.objectiveOrder,['terrainCost']);
});

test('switches and explicit branches replan one revision, preserve history/settings, invalidate approval and keep inspection separate',()=>{
  const {dataset,fields}=fixture(),options={start:native(1,0),goal:native(1,4),limits},model=createSupervisoryPlan(dataset,fields,options);
  model.dispatch({type:'plan'});const first=model.dispatch({type:'approve'});
  const changed=model.dispatch({type:'match-settings',matchSettings:modes[3]});
  assert.equal(changed.revision,first.revision+1);assert.equal(changed.status,'Needs review');assert.equal(changed.approval,null);assert.equal(changed.previous.route.id,first.route.id);
  assert.deepEqual(changed.previous.matchSettings,modes[0]);assert.deepEqual(changed.matchSettings,modes[3]);assert.deepEqual(changed.previous.approval,first.approval);
  const session=createSession({...dataset,origins:dataset.heights.map(()=> 'observed')},{selection:{layerId:'slope',cell:{row:1,col:1}}});
  session.dispatch({type:'input',layerId:'heights',cell:native(0,0)});assert.deepEqual(model.getSnapshot(),changed);
  const same=model.dispatch({type:'branch',branch:'combined'});assert.deepEqual(same,changed);
  const source=model.dispatch({type:'branch',branch:'heights'});assert.equal(source.branch,'heights');assert.equal(source.revision,changed.revision+1);assert.equal(source.approval,null);
  assert.deepEqual(source.previous.matchSettings,modes[3]);assert.equal(source.previous.branch,'combined');
  const exported=model.exportPlan();assert.equal(exported.current.route.branch,'heights');assert.deepEqual(exported.current.route.objectiveOrder,['matchingCells','terrainCost']);assert.equal(exported.previous.branch,'combined');
  model.dispatch({type:'exclude',cell:options.start});const draft=model.dispatch({type:'match-settings',matchSettings:modes[0]});assert.equal(draft.route,null);assert.equal(draft.approval,null);
});

test('current-branch comparison, selected match, strip and cost legend share objective semantics, including unknown fallback',()=>{
  const {dataset,fields}=fixture(),start=native(1,0),goal=native(1,4),matchSettings=modes[3];
  fields['traversal-cost']=traversalCostField(dataset,fields);
  const oldRoute=planRoute(dataset,fields,{start,goal,branch:'heights'}),route=planRoute(dataset,fields,{start,goal,branch:'slope',matchSettings});
  const configuration={branch:'slope',matchSettings,active:true},grid=createPlanningGrid(dataset,fields,[],configuration);
  const previous=createProposedPath(dataset,fields,oldRoute.vertices,oldRoute,{...configuration,grid}),proposed=createProposedPath(dataset,fields,route.vertices,route,{...configuration,grid});
  const comparison=compareRoutes(previous,proposed,'roughness',{...configuration,objectiveOrder:grid.objectiveOrder});
  assert.equal(comparison.previous.terrainCost,comparison.proposed.terrainCost);assert.equal(comparison.previous.matchingCells,0);
  const html=routeComparisonHTML(comparison);assert.match(html,/Current Slope · current switches/);assert.match(html,/1 · Matching cells/);assert.match(html,/2 · Terrain cost/);assert.doesNotMatch(html,/Slope exceeded|Roughness exceeded/);
  const strip=proposedPathHTML(proposed,null,{layer:'slope',planning:configuration});assert.match(strip,/data-path-row="slope"/);assert.doesNotMatch(strip,/data-path-row="roughness|Slope limit|Roughness limit/);
  const sourceStrip=proposedPathHTML(proposed,null,{layer:'terrain',planning:{branch:'heights',matchSettings:modes[0]}});assert.match(sourceStrip,/Height \(m\)/);assert.doesNotMatch(sourceStrip,/limit|Matching cells/);
  assert.equal(pathAssessmentScope('terrain'),null);assert.equal(pathDisplayColour(proposed.cells[0].height,'terrain'),palette.input);
  const edge=createProposedPath(dataset,fields,[{row:0,col:0},{row:0,col:1}],null,configuration);assert.equal(compareRoutes(edge,proposed,'combined',configuration).previous.terrainCost,null);
  const controls=planControlsHTML({...configuration,branch:'heights',start,goal,status:'Draft',exclusions:[],route:null});assert.match(controls,/Planning: Heights/);assert.doesNotMatch(controls,/slope \/|roughness \/|Exceeded <b>/);
  const unknown={...configuration,objectiveOrder:['terrainCost'],matchesKnown:false};
  const ds={...dataset};delete ds.quality;
  const legend=mapLegendHTML(createSurfaceMap(ds,fields,'traversal-cost',false),false,unknown);assert.match(legend,/terrain cost only/);assert.doesNotMatch(legend,/Fewest matching cells first/);
  const snap=createSession({...dataset,origins:dataset.heights.map(()=> 'observed')},{selection:{layerId:'slope',cell:{row:1,col:1}}}).getSnapshot();
  const card=inspectorHTML(snap,new Set(),modes[3],null,{...unknown,cell:{match:null,terrainCost:1,outside:false}});assert.match(card,/Matching cell/);assert.match(card,/Unknown/);assert.doesNotMatch(card,/Priority 1|Priority 2/);
});


test('inactive limits and Heights affected preference preserve the route and approval; active changes invalidate them',()=>{
  for(const branch of PLANNING_BRANCHES)for(const key of ['slopeDeg','roughness_m']){
    const {dataset,fields,values}=fixture(),options={start:native(1,0),goal:native(1,4),limits,branch};
    const model=createSupervisoryPlan(dataset,fields,options);model.dispatch({type:'plan'});const approved=model.dispatch({type:'approve'});
    const nextLimits={...limits,[key]:0},nextFields={...values,...evaluateLimitRasters(dataset,values,nextLimits)};
    const edited=model.dispatch({type:'limits',limits:nextLimits,fields:nextFields});
    const active=['combined','traversal-cost'].includes(branch)||branch==='slope-criterion'&&key==='slopeDeg'||branch==='roughness-criterion'&&key==='roughness_m';
    if(active){assert.equal(edited.route,null);assert.equal(edited.approval,null);assert.ok(edited.revision>approved.revision);}
    else{assert.deepEqual(edited.route,approved.route);assert.deepEqual(edited.approval,approved.approval);assert.equal(edited.revision,approved.revision);assert.equal(edited.status,'Approved');}
    assert.deepEqual(edited.limits,nextLimits);
  }
  for(const heights of [false,true]){
    const {dataset,fields}=fixture();
    const model=createSupervisoryPlan(dataset,fields,{start:native(1,0),goal:native(1,4),limits,branch:'heights',matchSettings:{heights,affected:false}});
    model.dispatch({type:'plan'});const approved=model.dispatch({type:'approve'});
    const remembered=model.dispatch({type:'match-settings',matchSettings:{heights,affected:true}});
    assert.deepEqual(remembered.route,approved.route);assert.deepEqual(remembered.approval,approved.approval);
    assert.equal(remembered.revision,approved.revision);assert.equal(remembered.status,'Approved');assert.deepEqual(remembered.previous,approved.previous);
    assert.deepEqual(model.exportPlan().current.matchSettings,{heights,affected:true});
    const derived=model.dispatch({type:'branch',branch:'slope'});
    assert.deepEqual(derived.matchSettings,{heights,affected:true});assert.equal(derived.approval,null);assert.equal(derived.status,'Needs review');
    assert.equal(derived.revision,approved.revision+1);assert.equal(derived.previous.route.id,approved.route.id);
    assert.deepEqual(derived.previous.approval,approved.approval);
  }
});
