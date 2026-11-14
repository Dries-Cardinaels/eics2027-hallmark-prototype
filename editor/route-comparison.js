import {matchesEnabled,planningBranchLabel,hasMatchPriority} from './planning-priority.js';
import {pathSupport,pathEvidenceLabel,pathFlaggedCells} from './path-evidence.js';
import {qualityVisibility} from './quality-visibility.js';

// Both paths must be sampled from the same current canonical fields, never from old counts.
export function routeMetrics(path,scope='combined'){
  if(!path)return null;
  const known=path.cells.every(c=>c.priority?.match!==null),available=path.cells.every(c=>c.priority?.available);
  let terrainCost=0;for(let i=1;i<path.cells.length;i++)terrainCost+=path.res*(path.cells[i-1].priority.terrainCost+path.cells[i].priority.terrainCost)/2;
  return {matchingCells:known?path.cells.filter(c=>c.priority?.match===true).length:null,terrainCost:available?terrainCost:null,cells:path.cells.length,slopeExceeded:path.limits?.slope===null?null:path.cells.filter(c=>c.slope.state===1).length,roughnessExceeded:path.limits?.roughness===null?null:path.cells.filter(c=>c.roughness.state===1).length,suspiciousCells:path.cells.every(c=>pathSupport(c,scope)?.suspicious==null)?null:pathFlaggedCells(path,scope).length};
}

export function sameRouteGeometry(a,b){
  if(!a||!b||a.vertices.length!==b.vertices.length)return false;
  const key=c=>`${c.row},${c.col}`;
  if(a.vertices.length===1)return key(a.vertices[0])===key(b.vertices[0]);
  const edges=path=>path.vertices.slice(1).map((cell,i)=>[key(path.vertices[i]),key(cell)].sort().join(':')).sort();
  const left=edges(a),right=edges(b);return left.every((edge,i)=>edge===right[i]);
}

export function compareRoutes(previous,proposed,scope='combined',planning=null){
  if(!previous)return null;
  const coincident=sameRouteGeometry(previous,proposed);
  const unchanged=coincident&&previous.vertices.every((cell,i)=>cell.row===proposed.vertices[i].row&&cell.col===proposed.vertices[i].col);
  return {previous:routeMetrics(previous,scope),proposed:routeMetrics(proposed,scope),supportScope:scope,unchanged,coincident,...(planning?{planning:{branch:planning.branch,matchSettings:{...planning.matchSettings},objectiveOrder:[...(planning.objectiveOrder||planning.route?.objectiveOrder||['terrainCost'])]}}:{})};
}

export function routeComparisonHTML(comparison,qualityOptions={}){
  if(!comparison)return '';
  const {previous,proposed,unchanged,coincident,supportScope='combined'}=comparison;
  const count=(metrics,key)=>!metrics?'—':metrics[key]===null?(key==='terrainCost'?'Unavailable':key.endsWith('Exceeded')?'Limit unset':'Not supplied'):key==='terrainCost'?Number(metrics[key].toFixed(3)):metrics[key];
  const planning=comparison.planning;
  const rows=planning?[...(matchesEnabled(planning.matchSettings,planning.branch)?[['matchingCells',hasMatchPriority(planning)?'1 · Matching cells':'Matching cells']]:[]),['terrainCost',(hasMatchPriority(planning)?'2 · ':'')+(planning.branch==='heights'?'Ground distance (m)':'Terrain cost')],...(['combined','traversal-cost','slope-criterion'].includes(planning.branch)?[['slopeExceeded','Slope exceeded']]:[]),...(['combined','traversal-cost','roughness-criterion'].includes(planning.branch)?[['roughnessExceeded','Height spread exceeded']]:[])]:[['slopeExceeded','Slope exceeded'],['roughnessExceeded','Height spread exceeded'],...(supportScope==='source'||!qualityVisibility(qualityOptions).affected?[]:[['suspiciousCells',pathEvidenceLabel(supportScope)+' !']])];
  return `<div class="route-comparison" data-route-unchanged="${unchanged}"><div class="route-comparison-key"><span><i class="previous-route-key"></i>Previous</span><span><i class="proposed-route-key"></i>Proposed</span>${coincident?`<b>${unchanged?'Route unchanged':'Same path geometry'}</b>`:''}</div><table aria-label="Previous and proposed route comparison at current limits"><caption>${planning?'Current '+planningBranchLabel(planning.branch)+' · current switches · matches include endpoints':'Both at current limits · counts are route cells'}</caption><thead><tr><th></th><th scope="col">Previous<small>${previous.cells} cells</small></th><th scope="col">Proposed<small>${proposed?proposed.cells+' cells':'Not planned'}</small></th></tr></thead><tbody>${rows.map(([key,label])=>`<tr data-comparison-metric="${key}"><th scope="row">${label}</th><td>${count(previous,key)}</td><td>${count(proposed,key)}</td></tr>`).join('')}</tbody></table></div>`;
}
