import {createPipeline,summariseQuality} from '../src/core/index.js';
import {createPlanningGrid,traversalTerms,traversalDensity} from './planner.js';

export const COST_NODE='traversal-cost';
export const SUPPORT_NODE='height-support';
export function withTraversalCost(pipeline) {
  const base=pipeline.operations.filter(op=>![COST_NODE,SUPPORT_NODE].includes(op.id));
  const byId=Object.fromEntries(base.map(op=>[op.id,op]));
  function sourceUnion(id,cell,ds){
    if(id==='heights')return [cell];
    return [...new Set(Object.entries(byId[id].footprint(cell,ds)).flatMap(([input,cells])=>cells.flatMap(c=>sourceUnion(input,c,ds))))].sort((a,b)=>a-b);
  }
  const support={
    id:SUPPORT_NODE,title:'Flagged input fraction',kind:'support',grid:'analysis',inputs:['heights'],quantity:'suspicious height fraction',unit:'',acceptsUnavailable:true,
    method:'flag fraction over the combined declared height union',
    calculation:'Count supplied suspicious flags over the unique heights declared by the slope and height spread assessment. A missing quality delivery is unknown, not zero. No assessment outcome is used.',
    parameters:()=>({}),originRule:{text:'exact union of combined declared source heights, shared heights counted once'},
    footprint:(cell,ds)=>({heights:sourceUnion('combined',cell,ds)}),
    compute(values,ds,limits,records,context){
      const quality=ds.quality?summariseQuality(context.footprint.heights,ds.quality):null;
      return {available:Boolean(quality),value:quality?quality.suspicious/quality.total:null,...(!quality?{reason:'Quality not supplied; flag fraction unknown'}:{})};
    },
  };
  const inputs=['slope','roughness','slope-criterion','roughness-criterion'];
  const operation={
    id:COST_NODE,title:'Traversal cost',kind:'cost',grid:'analysis',inputs,
    quantity:'cell cost density',unit:'',acceptsUnavailable:true,
    method:'planner cell cost density',
    calculation:'1 + slope / 90° + height spread / 1 m + 8 per exceeded limit. Each route step costs horizontal spacing / 1 m × the mean of its endpoint densities. Dimensionless weighted distance, not a safety assessment.',
    parameters:()=>({}),
    originRule:{text:'union of declared heights used by the planner inputs; shared heights counted once'},
    footprint:cell=>Object.fromEntries(inputs.map(id=>[id,[cell]])),
    compute(values,ds,limits,records){
      const slope=records.slope[0],roughness=records.roughness[0];
      const checks=['slope-criterion','roughness-criterion'].map(id=>records[id][0]);
      const terms=traversalTerms({slope:slope.value??NaN,roughness:roughness.value??NaN,exceeded:checks.filter(c=>c.outcome==='exceeded').length});
      const available=[slope,roughness].every(r=>r.available&&Number.isFinite(r.value)&&r.value>=0)&&checks.every(r=>r.available&&r.outcome!=='unavailable');
      return {available,value:available?traversalDensity(terms):null,terms,...(!available?{reason:'Unavailable terrain or incomplete limit assessment; blocked for planning'}:{})};
    },
  };
  return createPipeline([...base,support,operation]);
}

export function heightSupportField(fields) {
  const quality=fields.combined.quality;
  return {node:SUPPORT_NODE,grid:fields.combined.grid,unit:'',range:quality?[0,1]:null,quality,values:Float64Array.from(fields.combined.values,(_,i)=>quality&&quality.total[i]>0?quality.suspicious[i]/quality.total[i]:NaN)};
}

export function traversalCostField(dataset,fields) {
  // Exclusions constrain route search, not the underlying cost of terrain.
  const planning=createPlanningGrid(dataset,fields),values=Float64Array.from(planning.costs,v=>Number.isFinite(v)?v:NaN);
  let min=Infinity,max=-Infinity;
  for(const value of values)if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
  return {node:COST_NODE,grid:fields.slope.grid,values,unit:'',range:min===Infinity?null:[min,max],quality:fields.combined.quality};
}
