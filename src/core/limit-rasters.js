import {createDatasetPipeline,DEFAULT_LIMITS} from './pipeline.js';

export const LIMIT_STATE = Object.freeze({within:0,exceeded:1,unavailable:2});

function stateOf(record) {
  const outcomes = record.outcomes ? Object.values(record.outcomes) : [record.available ? record.outcome : 'unavailable'];
  const incomplete = outcomes.includes('unavailable');
  return {state:outcomes.includes('exceeded') ? LIMIT_STATE.exceeded : incomplete ? LIMIT_STATE.unavailable : LIMIT_STATE.within,incomplete};
}

// Classify cached native values with the declared criterion and combination operations.
// Source support is independent of limits and comes from the engine's compact support raster.
export function evaluateLimitRasters(dataset,fields,limits=DEFAULT_LIMITS,pipeline=createDatasetPipeline(dataset)) {
  limits={...DEFAULT_LIMITS,...limits};
  const combination=pipeline.byId.combined;
  const criteria=combination.inputs.map(id=>({op:pipeline.byId[id],field:fields[pipeline.byId[id].inputs[0]]}));
  if(criteria.some(c=>!c.field))throw new Error('A criterion value raster is missing');
  if(!fields.combined)throw new Error('The combined support raster is missing');
  if(criteria.some(c=>limits[c.op.limitKey]!==null&&!Number.isFinite(limits[c.op.limitKey])))throw new Error('Criterion limits must be finite');
  const count=criteria[0].field.values.length;
  const grid=criteria[0].field.grid;
  if([...criteria.map(c=>c.field),fields.combined].some(f=>f.values.length!==count||f.grid.W!==grid.W||f.grid.H!==grid.H||f.grid.res!==grid.res))throw new Error('Criterion grids must align');
  const result={};
  for(const {op,field} of criteria)result[op.id]={...field,node:op.id,limit:limits[op.limitKey],states:new Uint8Array(count),incomplete:new Uint8Array(count),stats:{within:0,exceeded:0,unavailable:0,incomplete:0,total:count}};
  result.combined={...fields.combined,unsetLimits:criteria.filter(({op})=>limits[op.limitKey]===null).map(({op})=>op.inputs[0]),node:'combined',states:new Uint8Array(count),incomplete:new Uint8Array(count),stats:{within:0,exceeded:0,unavailable:0,incomplete:0,total:count}};
  function retain(id,cell,record){
    const {state,incomplete}=stateOf(record),field=result[id];
    field.states[cell]=state;field.incomplete[cell]=Number(incomplete);
    field.stats[['within','exceeded','unavailable'][state]]++;
    if(incomplete)field.stats.incomplete++;
  }
  for(let cell=0;cell<count;cell++){
    const records={};
    for(const {op,field} of criteria){
      const value=field.values[cell];
      const record=Number.isFinite(value)
        ? {available:true,...op.compute({[op.inputs[0]]:[value]},dataset,limits)}
        : {available:false,value:null,outcome:'unavailable'};
      records[op.id]=[record];retain(op.id,cell,record);
    }
    retain('combined',cell,{available:true,...combination.compute({},dataset,limits,records)});
  }
  return result;
}
