import {mapStage,mapNode} from './surface-map.js';
import {PLANNING_BRANCHES} from './planning-priority.js';
import {lidarGapsFromParams} from './lidar-gaps.js';
import {isEarthCase} from './case-presentation.js';
import {isNumericEvidence} from './source-evidence.js';

export function initialViewState(params,caseId){
  const explicit=params.has('map')||params.has('mode');
  let layer=explicit?mapStage(params.get('map'),params.get('mode')):isEarthCase(caseId)?'terrain':caseId==='connecting-ridge'?'height-rms':'assessment';
  if(!['assessment','terrain','slope','roughness','slope-criterion','roughness-criterion','quality','traversal-cost','height-support'].includes(layer)&&!isNumericEvidence(layer))layer='assessment';
  const branch=PLANNING_BRANCHES.includes(params.get('branch'))?params.get('branch')
    : isEarthCase(caseId)||caseId==='connecting-ridge'?'slope':layer==='height-support'||isNumericEvidence(layer)?'combined':mapNode(layer);
  const showLidarGaps=params.has('gaps')?lidarGapsFromParams(params):caseId==='atami'&&params.get('surface')!=='ground';
  return {layer,branch,showLidarGaps};
}

export const earthRestartView=(surface='ground')=>({layer:'terrain',branch:'slope',showLidarGaps:surface!=='ground'});

export function preferredSurface(caseId,surfaces,requested){
  if(surfaces.some(option=>option.id===requested))return requested;
  if(caseId==='blatten'&&surfaces.some(option=>option.id==='post-event'))return 'post-event';
  if(caseId==='atami'&&surfaces.some(option=>option.id==='july3-dsm'))return 'july3-dsm';
  return surfaces.find(option=>option.id==='ground')?.id||surfaces[0]?.id;
}
