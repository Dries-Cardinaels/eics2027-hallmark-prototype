import {planRoute} from './planner.js';
import {planningBranch,matchSettings as normaliseMatches,activeLimitKeys,effectiveMatches} from './planning-priority.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const sameCell=(a,b)=>a?.row===b?.row&&a?.col===b?.col;
// Approval belongs to one exact revision. Keep one historical successful plan for comparison.
export function createSupervisoryPlan(dataset,fields,{start=null,goal=null,limits,branch='combined',matchSettings={},proposalRoute=null}={}) {
  let state={datasetId:dataset.id||dataset.caseId,revision:0,status:'Draft',start:start?{...start}:null,goal:goal?{...goal}:null,exclusions:[],limits:{...limits},branch:planningBranch(branch),matchSettings:normaliseMatches(matchSettings),route:null,approval:null,error:null,previous:null};
  if(proposalRoute?.ok){
    state.route={...copy(proposalRoute),id:`${state.datasetId}:proposal:0`};
    state.status='Needs replan';
  }
  function invalidate(){
    if(state.route){const {previous,...current}=state;state.previous={...copy(current),historical:true};}
    state={...state,revision:state.revision+1,status:'Draft',route:null,approval:null,error:null};
  }
  function calculate(){
    const result=planRoute(dataset,fields,state);
    if(result.ok){state.route={...result,id:`${state.datasetId}:plan:${state.revision}`};state.status='Needs review';}
    else state.error=result.error;
  }
  function dispatch(action){
    if(action.type==='endpoint'){
      if(!['start','goal'].includes(action.role))throw new Error('Unknown endpoint role');
      if(!sameCell(state[action.role],action.cell)){invalidate();state[action.role]={...action.cell};}
    }else if(action.type==='exclude'){
      if(!state.exclusions.some(c=>sameCell(c,action.cell))){invalidate();state.exclusions=[...state.exclusions,{...action.cell}].sort((a,b)=>a.row-b.row||a.col-b.col);}
    }else if(action.type==='clear-exclusions'){
      if(state.exclusions.length){invalidate();state.exclusions=[];}
    }else if(action.type==='branch'||action.type==='match-settings'){
      const branch=action.type==='branch'?planningBranch(action.branch):state.branch;
      const matchSettings=action.type==='match-settings'?normaliseMatches(action.matchSettings):state.matchSettings;
      const before=effectiveMatches(state.matchSettings,state.branch),after=effectiveMatches(matchSettings,branch);
      if(branch!==state.branch||after.heights!==before.heights||after.affected!==before.affected){
        const replan=Boolean(state.route);invalidate();state.branch=branch;state.matchSettings={...matchSettings};
        if(replan)calculate();
      }else state.matchSettings={...matchSettings};
    }else if(action.type==='limits'){
      fields=action.fields;
      if(state.limits.slopeDeg!==action.limits.slopeDeg||state.limits.roughness_m!==action.limits.roughness_m){
        if(activeLimitKeys(state.branch).some(key=>state.limits[key]!==action.limits[key]))invalidate();
        state.limits={...action.limits};
      }
    }else if(action.type==='plan'){
      invalidate();
      calculate();
    }else if(action.type==='approve'){
      if(!state.route||state.status!=='Needs review')throw new Error('Plan a current route before approving it');
      state.status='Approved';state.approval={revision:state.revision,routeId:state.route.id,scope:'Local review only; no execution',approvedAt:new Date().toISOString()};
    }else throw new Error('Unknown planning action');
    return getSnapshot();
  }
  function getSnapshot(){return copy(state);}
  function exportPlan(){
    const {previous,...current}=getSnapshot();
    current.approval=current.approval?.revision===current.revision&&current.approval?.routeId===current.route?.id?current.approval:null;
    return {current,previous};
  }
  return {dispatch,getSnapshot,exportPlan};
}
