import {routeRMSText} from './route-rms.js';
import {assessmentColours,assessmentBorders,palette} from './palette.js';
import {isNumericEvidence} from './source-evidence.js';
import {valueColour,costHexColour,supportColour} from './surface-map.js';

// Inspection display scope is separate from the persistent planning branch.
export function pathEvidenceScope(layer){
  if(layer==='slope'||layer==='slope-criterion')return 'slope';
  if(layer==='roughness'||layer==='roughness-criterion')return 'roughness';
  if(['terrain','quality','heights'].includes(layer)||isNumericEvidence(layer))return 'source';
  return 'combined';
}

export const pathEvidenceLabel=scope=>scope==='slope'?'Slope inputs':scope==='roughness'?'Height spread inputs':'Height inputs';
export const pathSupport=(cell,scope='combined')=>scope==='source'?null:scope==='slope'?cell.slope:scope==='roughness'?cell.roughness:cell;
export const pathFlaggedCells=(path,scope='combined')=>path?.cells.filter(cell=>pathSupport(cell,scope)?.suspicious>0)||[];

// Source maps retain assessment colours while omitting derived dependency markers.
export function pathAssessmentScope(layer){
  if(['slope','roughness','traversal-cost','height-support','terrain','quality','heights'].includes(layer)||isNumericEvidence(layer))return null;
  const scope=pathEvidenceScope(layer);return scope==='source'?'combined':scope;
}
export const pathAssessment=(cell,layer='assessment')=>pathAssessmentScope(layer)===null?null:pathSupport(cell,pathAssessmentScope(layer));
export const pathAssessmentLayer=layer=>{const scope=pathAssessmentScope(layer);return scope===null?layer:scope==='combined'?'assessment':scope+'-criterion';};
export const pathAssessmentLabel=(layer,lidar=false,distanceOnly=true)=>{const scope=pathAssessmentScope(layer);return scope===null?(isNumericEvidence(layer)?layer==='height-rms'?'maximum supplied input height RMS · no uncertainty cost':'supplied source evidence · no uncertainty cost': ['terrain','quality','heights'].includes(layer)?lidar?'native ground heights':distanceOnly?'supplied heights · distance only':'supplied heights':layer==='height-support'?'suspicious height fraction':layer==='traversal-cost'?'traversal cost density (per 1 m)':layer==='slope'?'slope (°)':'height spread (m)'):scope==='slope'?'slope limit':scope==='roughness'?'roughness limit':'both-limit assessment';};
export const pathDisplayRecord=(cell,layer='assessment')=>layer==='height-rms'?{...cell.inputHeightRMS,value:cell.inputHeightRMS?.max??null}:(['terrain','quality','heights'].includes(layer)||isNumericEvidence(layer))?cell.height:layer==='height-support'?cell.heightSupport:layer==='traversal-cost'?cell.cost:pathAssessment(cell,layer)||pathSupport(cell,pathEvidenceScope(layer));
export const pathDisplayColour=(record,layer,range)=>layer==='height-rms'?'#'+valueColour(record?.value,range).map(v=>v.toString(16).padStart(2,'0')).join(''):(['terrain','quality','heights'].includes(layer)||isNumericEvidence(layer))?record?.missingHeights>0?palette.unavailable:palette.input:layer==='traversal-cost'?costHexColour(record?.value,range):pathAssessmentScope(layer)===null?'#'+(layer==='height-support'?supportColour:valueColour)(record?.value,range).map(value=>value.toString(16).padStart(2,'0')).join(''):assessmentColours[record?.state??2];
export const pathDisplayBorder=(record,layer)=>pathAssessmentScope(layer)===null?record?.missingHeights>0?palette.unavailableBorder:palette.routeContext:assessmentBorders[record?.state??2];
export function pathAssessmentOutcome(cell,layer='assessment'){
  const result=pathAssessment(cell,layer);
  if(!result)return null;
  return result.incomplete?'Incomplete':result.state===1?'Exceeded':result.state===0?(pathAssessmentScope(layer)==='combined'?'Within limits':'Within limit'):'Unavailable';
}
export function pathDisplayText(cell,layer='assessment'){
  if(layer==='height-rms')return 'Max input RMS: '+routeRMSText(cell.inputHeightRMS);
  if(pathAssessmentScope(layer)!==null)return pathAssessmentOutcome(cell,layer);
  const value=pathDisplayRecord(cell,layer)?.value;
  return Number.isFinite(value)?`${value.toFixed(2)}${layer==='height-support'?' flagged fraction':layer==='traversal-cost'?' density':layer==='slope'?'°':' m'}`:'Unavailable';
}

// RMS route evidence keeps its continuous map colour during tracing.
export const routeFillOpacity=(layer,inspecting)=>layer==='height-rms'?1:inspecting?.30:1;
