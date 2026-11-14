export const PLANNING_BRANCHES=Object.freeze(['heights','slope','roughness','slope-criterion','roughness-criterion','combined','traversal-cost']);
export const planningBranchLabel=branch=>({heights:'Heights',slope:'Slope',roughness:'Height spread','slope-criterion':'Slope limit','roughness-criterion':'Height spread limit',combined:'Combined result','traversal-cost':'Traversal cost'}[branch]||branch);
export function planningBranch(branch='combined'){
  if(!PLANNING_BRANCHES.includes(branch))throw new Error('Unknown planning branch');
  return branch;
}
// API defaults retain terrain-only planning; the editor explicitly supplies its two switches.
export const matchSettings=settings=>({heights:settings?.heights===true,affected:settings?.affected===true});
export function effectiveMatches(settings,branch='combined'){
  const selected=matchSettings(settings);
  return {...selected,affected:branch!=='heights'&&selected.affected};
}
export const matchesEnabled=(settings,branch='combined')=>Object.values(effectiveMatches(settings,branch)).some(Boolean);
export function heightFlagAt(dataset,cell){
  if(!dataset.quality||!cell||!Number.isInteger(cell.row)||!Number.isInteger(cell.col)||cell.row<0||cell.col<0||cell.row>=dataset.H||cell.col>=dataset.W)return null;
  return (dataset.quality.flaggedCodes||[3]).includes(dataset.quality.codes[cell.row*dataset.W+cell.col]);
}
// A native route cell is counted once, even when both selected sources match.
// Unknown selected evidence is retained as unknown, never manufactured as a supplied zero.
export function cellMatches(evidence,settings,branch='combined'){
  const selected=effectiveMatches(settings,branch),values=[];
  if(selected.heights)values.push(evidence.heightFlag);
  if(selected.affected)values.push(evidence.affected);
  return values.some(v=>v===true)?true:values.some(v=>v==null)?null:false;
}
export function matchDescription(settings,branch='combined'){
  const selected=effectiveMatches(settings,branch),support=branch.startsWith('slope')?'slope inputs':branch.startsWith('roughness')?'height spread inputs':'combined inputs';
  return [selected.heights?'own height flag':null,selected.affected?'affected '+support:null].filter(Boolean).join(' or ');
}
export const objectiveOrder=(settings,branch='combined',known=true)=>matchesEnabled(settings,branch)&&known?['matchingCells','terrainCost']:['terrainCost'];

export function hasMatchPriority(configuration){
  const order=configuration.objectiveOrder||configuration.route?.objectiveOrder;
  return order?order.includes('matchingCells'):matchesEnabled(configuration.matchSettings,configuration.branch)&&configuration.matchesKnown!==false;
}
export function activeTerrainTerms(branch='combined'){
  return ['baseline',...(['slope','slope-criterion','combined','traversal-cost'].includes(branch)?['slope']:[]),...(['roughness','roughness-criterion','combined','traversal-cost'].includes(branch)?['roughness']:[]),...(['slope-criterion','roughness-criterion','combined','traversal-cost'].includes(branch)?['exceeded']:[])];
}

export const activeLimitKeys=branch=>['combined','traversal-cost'].includes(branch)?['slopeDeg','roughness_m']:branch==='slope-criterion'?['slopeDeg']:branch==='roughness-criterion'?['roughness_m']:[];
