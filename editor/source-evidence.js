import {suppliedNumber} from '../src/core/height-evidence.js';

export const NUMERIC_EVIDENCE=Object.freeze({
  'height-rms':{key:'heightRMS',cellKey:'heightRMS_m',label:'Height RMS (m)',title:'Supplied height RMS',unit:'m',meaning:'Continuous supplied height RMS · derived uncertainty not estimated.'},
  'lola-spots':{key:'lolaCounts',cellKey:'lolaSpots',label:'LOLA returns per cell',title:'Supplied LOLA returns per cell',unit:'returns',meaning:'Supplied count of LOLA returns in this 5 m cell. Count 0 reads “no LOLA return”; it does not mean NoData. Exact donors are not supplied.'},
});
export const isNumericEvidence=layer=>Object.hasOwn(NUMERIC_EVIDENCE,layer);
export function numericEvidenceFields(dataset){
  return Object.fromEntries(Object.entries(NUMERIC_EVIDENCE).filter(([,info])=>dataset[info.key]).map(([id,info])=>{
    const values=Float32Array.from(dataset[info.key],v=>suppliedNumber(v)??NaN);
    let min=Infinity,max=-Infinity;for(const value of values)if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
    return [id,{values,unit:info.unit,range:min===Infinity?null:[min,max]}];
  }));
}
export const evidenceNumber=value=>Number.isFinite(value)?(Number.isInteger(value)?String(value):value.toPrecision(3)):'Unknown';
