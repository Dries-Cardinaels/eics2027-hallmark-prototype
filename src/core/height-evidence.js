// Supplier evidence belongs to native delivered height cells. It is never an
// uncertainty estimate for a derived result or an input to a terrain operation.
export const suppliedNumber = value => Number.isFinite(value) && value >= 0 ? value : null;

export function nativeHeightEvidence(dataset,index) {
  return {
    ...(dataset.heightRMS ? {heightRMS_m:suppliedNumber(dataset.heightRMS[index])} : {}),
    ...(dataset.lolaCounts ? {lolaSpots:suppliedNumber(dataset.lolaCounts[index]),lolaReturn:lolaReturnLabel(dataset.lolaCounts[index],dataset.lolaReturns)} : {}),
  };
}

export function summariseHeightRMS(cells,dataset) {
  if(!dataset.heightRMS)return null;
  let min=Infinity,max=-Infinity,known=0;
  for(const index of cells){const value=suppliedNumber(dataset.heightRMS[index]);if(value===null)continue;known++;min=Math.min(min,value);max=Math.max(max,value);}
  return {quantity:'Input height RMS',unit:'m',known,total:cells.length,min:known?min:null,max:known?max:null,scope:'Exact queried native height support; supplier values, not output uncertainty'};
}

// LOLA returns per native cell. The count stays a count; its wording is declared by
// the dataset (`dataset.lolaReturns`, written by data preparation), not here.
// Non-finite or negative counts are unknown and never counted as "no return".
export const lolaReturnState = count => {const value=suppliedNumber(count);return value===null?'unknown':value===0?'none':'present';};
export function lolaReturnLabel(count,vocabulary) {
  const state=lolaReturnState(count);
  return {state,count:suppliedNumber(count),label:vocabulary?.labels?.[state] ?? null};
}

export function summariseLolaReturns(cells,dataset) {
  if(!dataset.lolaCounts)return null;
  const n={present:0,none:0,unknown:0};
  for(const index of cells)n[lolaReturnState(dataset.lolaCounts[index])]++;
  const template=dataset.lolaReturns?.derived;
  return {quantity:dataset.lolaReturns?.layer ?? null,present:n.present,none:n.none,unknown:n.unknown,known:n.present+n.none,total:cells.length,
    text:template ? template.replace('{k}',n.present).replace('{n}',cells.length) : null,
    scope:'Exact queried native height support; supplier counts, not output uncertainty'};
}
