import {planningBranch,matchSettings as normaliseMatches,heightFlagAt,cellMatches,matchesEnabled,objectiveOrder} from './planning-priority.js';

// Four-neighbour A*: compact canonical rasters only, never per-cell provenance queries.
export const TRAVERSAL_COST = Object.freeze({baseline:1,slopeScale:90,roughnessScale:1,exceeded:8,distanceScale:1});

// Shared by the planner, cost raster and selected-result query. These are additive
// density terms; route cost integrates them over horizontal step distance.
export function traversalTerms({slope,roughness,exceeded}) {
  return {baseline:TRAVERSAL_COST.baseline,slope:slope/TRAVERSAL_COST.slopeScale,roughness:roughness/TRAVERSAL_COST.roughnessScale,exceeded:TRAVERSAL_COST.exceeded*exceeded};
}
export const traversalDensity=terms=>terms.baseline+terms.slope+terms.roughness+terms.exceeded;

export function createPlanningGrid(dataset,fields,exclusions=[],options={}) {
  if(!Array.isArray(exclusions))throw new Error('Planning exclusions must be an array of native cells');
  const branch=planningBranch(options.branch),matchSettings=normaliseMatches(options.matchSettings);
  const full=['combined','traversal-cost'].includes(branch),source=branch==='heights';
  const values=source?[]:full?['slope','roughness']:[branch.replace('-criterion','')];
  const checkIds=full?['slope-criterion','roughness-criterion']:branch.endsWith('-criterion')?[branch]:[];
  const checks=checkIds.map(id=>fields[id]);
  const field=source?{grid:{W:dataset.W,H:dataset.H,res:dataset.res},values:dataset.heights}:fields[values[0]];
  if(!field||full&&!fields.combined||values.some(id=>!fields[id])||checks.some(f=>!f?.states))throw new Error('Planning needs the active branch value and limit fields');
  const {W,H,res}=field.grid,count=W*H;
  if(!Number.isInteger(W)||!Number.isInteger(H)||W<1||H<1||!Number.isFinite(res)||res<=0||res!==dataset.res||[field,...values.map(id=>fields[id]),...checks].some(f=>f.values.length!==count||f.grid.W!==W||f.grid.H!==H||f.grid.res!==res))throw new Error('Planning fields must share the active native grid');
  const offset={row:(dataset.H-H)/2,col:(dataset.W-W)/2};
  if(!Number.isInteger(offset.row)||!Number.isInteger(offset.col))throw new Error('Invalid native analysis margin');
  const indexOf=cell=>cell&&Number.isInteger(cell.row)&&Number.isInteger(cell.col)&&cell.row>=offset.row&&cell.col>=offset.col&&cell.row<offset.row+H&&cell.col<offset.col+W?(cell.row-offset.row)*W+cell.col-offset.col:-1;
  const cellAt=index=>({row:Math.floor(index/W)+offset.row,col:index%W+offset.col});
  const blocked=new Uint8Array(count),costs=new Float64Array(count),matches=new Uint8Array(count);
  for(const cell of exclusions){const index=indexOf(cell);if(index>=0)blocked[index]=1;}
  const quality=source?null:fields[full?'combined':values[0]]?.quality;
  function evidence(index){return {heightFlag:heightFlagAt(dataset,cellAt(index)),affected:quality&&quality.total[index]>0?quality.suspicious[index]>0:null};}
  const matchAt=index=>cellMatches(evidence(index),matchSettings,branch);
  function terms(index){
    return traversalTerms({slope:values.includes('slope')?fields.slope.values[index]:0,roughness:values.includes('roughness')?fields.roughness.values[index]:0,exceeded:checks.reduce((n,f)=>n+Number(f.states[index]===1),0)});
  }
  let matchesKnown=!matchesEnabled(matchSettings,branch)||Boolean(dataset.quality);
  for(let i=0;i<count;i++){
    const match=matchAt(i);matches[i]=Number(match===true);
    if(blocked[i]||source&&!Number.isFinite(dataset.heights[i])||values.some(id=>!Number.isFinite(fields[id].values[i])||fields[id].values[i]<0||fields[id].incomplete?.[i])||checks.some(f=>f.states[i]>1||f.incomplete?.[i])||full&&fields.combined.incomplete?.[i]){costs[i]=Infinity;continue;}
    costs[i]=traversalDensity(terms(i));if(match===null)matchesKnown=false;
  }
  if(!matchesKnown)matches.fill(0);
  return {W,H,res,offset,count,indexOf,cellAt,costs,terms,matches,matchAt,evidence,matchesKnown,branch,matchSettings,objectiveOrder:objectiveOrder(matchSettings,branch,matchesKnown)};
}

export function planningCell(grid,cell){
  const index=grid.indexOf(cell);
  if(index<0)return {available:false,outside:true,match:null,terrainCost:null};
  return {available:Number.isFinite(grid.costs[index]),outside:false,groundStep_m:grid.res,...grid.evidence(index),match:grid.matchAt(index),terrainCost:Number.isFinite(grid.costs[index])?grid.costs[index]:null,terms:grid.terms(index)};
}

// Lexicographic ordering: matching-cell count, terrain f, terrain h, native index.
class MinHeap {
  entries=[];
  before(a,b){return a.matches<b.matches||a.matches===b.matches&&(a.f<b.f||a.f===b.f&&(a.h<b.h||a.h===b.h&&a.index<b.index));}
  push(entry){const a=this.entries;let i=a.length;a.push(entry);while(i){const p=(i-1)>>1;if(!this.before(entry,a[p]))break;a[i]=a[p];i=p;}a[i]=entry;}
  pop(){const a=this.entries,top=a[0],tail=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&this.before(a[c+1],a[c]))c++;if(!this.before(a[c],tail))break;a[i]=a[c];i=c;}a[i]=tail;}return top;}
}

export function planRoute(dataset,fields,{start,goal,exclusions=[],branch='combined',matchSettings={}}={}) {
  const grid=createPlanningGrid(dataset,fields,exclusions,{branch,matchSettings}),a=grid.indexOf(start),b=grid.indexOf(goal);
  const failure=error=>({ok:false,error,vertices:[],cost:null});
  const missingLimits=Object.entries({'slope-criterion':'slope','roughness-criterion':'roughness'}).filter(([id])=>
    (grid.branch===id||grid.branch==='combined'||grid.branch==='traversal-cost')&&fields[id]?.limit===null);
  if(missingLimits.length)return failure('Set the '+missingLimits.map(([,name])=>name).join(' and ')+' limit before planning with this branch.');
  if(a<0||b<0)return failure('Start and goal must be native cells inside the active planning grid.');
  if(!Number.isFinite(grid.costs[a])||!Number.isFinite(grid.costs[b]))return failure('Start or goal is excluded or has unavailable terrain results.');
  const distance=grid.res/TRAVERSAL_COST.distanceScale;
  const heuristic=index=>(Math.abs(Math.floor(index/grid.W)-Math.floor(b/grid.W))+Math.abs(index%grid.W-b%grid.W))*distance*TRAVERSAL_COST.baseline;
  const scores=new Float64Array(grid.count);scores.fill(Infinity);scores[a]=0;
  const matchScores=new Float64Array(grid.count);matchScores.fill(Infinity);matchScores[a]=grid.matches[a];
  const parents=new Int32Array(grid.count);parents.fill(-1);
  const closed=new Uint8Array(grid.count),open=new MinHeap();
  open.push({index:a,matches:matchScores[a],g:0,h:heuristic(a),f:heuristic(a)});
  let visited=0;
  while(open.entries.length){
    const current=open.pop(),i=current.index;
    if(closed[i]||current.g!==scores[i]||current.matches!==matchScores[i])continue;
    closed[i]=1;visited++;
    if(i===b){
      const indices=[];for(let n=b;n!==-1;n=parents[n])indices.push(n);indices.reverse();
      const breakdown={baseline:0,slope:0,roughness:0,exceeded:0};
      for(let n=1;n<indices.length;n++){
        const from=grid.terms(indices[n-1]),to=grid.terms(indices[n]);
        for(const key of Object.keys(breakdown))breakdown[key]+=distance*(from[key]+to[key])/2;
      }
      return {ok:true,vertices:indices.map(grid.cellAt),cellCosts:indices.map(i=>({...grid.terms(i),density:grid.costs[i]})),cost:scores[b],breakdown,distance_m:(indices.length-1)*grid.res,visited,branch:grid.branch,matchSettings:grid.matchSettings,objectiveOrder:grid.objectiveOrder,matchesKnown:grid.matchesKnown,objectives:{matchingCells:indices.every(i=>grid.matchAt(i)!==null)?indices.reduce((n,i)=>n+Number(grid.matchAt(i)===true),0):null,terrainCost:scores[b]}};
    }
    const row=Math.floor(i/grid.W),col=i%grid.W;
    for(const next of [row>0?i-grid.W:-1,col>0?i-1:-1,col+1<grid.W?i+1:-1,row+1<grid.H?i+grid.W:-1]){
      if(next<0||closed[next]||!Number.isFinite(grid.costs[next]))continue;
      const g=scores[i]+distance*(grid.costs[i]+grid.costs[next])/2;
      const matching=matchScores[i]+grid.matches[next];
      if(matching<matchScores[next]||matching===matchScores[next]&&g<scores[next]){matchScores[next]=matching;scores[next]=g;parents[next]=i;const h=heuristic(next);open.push({index:next,matches:matching,g,h,f:g+h});}
    }
  }
  return failure('No route connects these endpoints through available, non-excluded cells.');
}
