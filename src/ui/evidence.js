import { qualityLabel } from '../core/quality.js';

export const USE_CASES = {
  'copernicus-langtang': { title: 'Earth · Search and rescue', place: 'Langtang, Nepal', task: 'Compare terrain around candidate areas for robot reconnaissance.', boundary: 'Regional terrain context at approximately 30 m spacing. This surface does not resolve local robot obstacles or establish current incident conditions.', cell: {row:3,col:4} },
  'lroc-nassau02': { title: 'Moon · Rover exploration', place: 'North of Nassau crater', task: 'Compare terrain around candidate rover passages and observation locations.', boundary: 'Published stereo terrain at 4 m spacing. Quality flags describe reconstruction; they do not establish traversability.', cell: {row:11,col:18} },
};

export function spacing(ds) {
  return { x:ds.source?.res_m_ew ?? ds.res, y:ds.source?.res_m_ns ?? ds.res };
}

export function evidenceLayers(ds) {
  return ds.mapLayers || [{id:'quality',type:'quality',label:'Stereo quality',note:'Published stereo matching flags; not calibrated uncertainty.'},{id:'origins',type:'origin',label:'Source history',note:'Earlier per-cell production history is not supplied.'}];
}

// Shared continuous encoding for map cells and individual source records.
export function warmRamp(t) {
  const a=[223,235,233], b=[176,42,42], c=Math.max(0,Math.min(1,t));
  return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*c)).join(',')})`;
}

export function inputEvidence(ds,index,layerId) {
  const layer=evidenceLayers(ds).find(l=>l.id===layerId) || evidenceLayers(ds)[0];
  if(layer.type==='continuous') {
    const value=ds.source?.[layer.valuesRef]?.[index];
    return {code:value ?? null,label:Number.isFinite(value)?`${value.toFixed(2)} m σ`:'No estimate supplied',value:Number.isFinite(value)?value:null,colour:Number.isFinite(value)?warmRamp((value-layer.min)/((layer.max-layer.min)||1)):'#eef1f2'};
  }
  if(layer.type==='quality') {
    const code=ds.quality?.codes[index],flagged=(ds.quality?.flaggedCodes || [3]).includes(code);
    const nominal=ds.quality?.nominalCodes?ds.quality.nominalCodes.includes(code):code>=10&&code<=14;
    return {code,label:qualityLabel(code,ds.quality),flagged,colour:flagged?'#8056a3':nominal?'#e4eaeb':'#b1a7bd'};
  }
  if(layer.type==='origin') {
    const code=ds.origins[index];
    return {code,label:({observed:'Recorded as observed',interpolated:'Declared interpolated',undocumented:'Earlier history undocumented',absent:'Height absent'})[code],colour:({observed:'#188890',interpolated:'#c88b1f',undocumented:'#c6cbd2',absent:'#ffffff'})[code]};
  }
  const code=ds.source?.[layer.codesRef]?.[index];
  const label=layer.id==='fill-source' ? ds.source?.flmDefinitions?.[code] : layer.categories?.[code]?.label || layer.base?.label;
  return {code,label:label || `Unmapped code ${code}`,colour:layer.categories?.[code]?.colour || layer.base?.colour || '#dfe4e6'};
}

// A single support population and interpretation for maps, inspection and comparison.
// Input-error summaries are never labelled as uncertainty in the derived quantity.
export function summariseEvidence(ds,indices,layerId) {
  const layer=evidenceLayers(ds).find(l=>l.id===layerId) || evidenceLayers(ds)[0];
  const unique=[...new Set(indices)], samples=unique.map(i=>({index:i,...inputEvidence(ds,i,layer.id)}));
  const entries=[];
  for(const sample of samples) {
    let entry=entries.find(e=>e.code===sample.code);
    if(!entry) {entry={code:sample.code,label:sample.label,colour:sample.colour,count:0};entries.push(entry);}
    entry.count++;
  }
  const total=unique.length;
  if(layer.type==='continuous') {
    const present=samples.filter(s=>s.value!==null), values=present.map(s=>s.value),max=values.length?Math.max(...values):null;
    return {id:layer.id,label:layer.label,type:layer.type,total,present:present.length,missing:total-present.length,max,entries,samples,
      summary:`${present.length}/${total} inputs have an estimate${max===null?'':` · max ${max.toFixed(2)} m σ`}`,
      note:'Maximum of supplied input height-error estimates. Missing estimates remain unknown. Uncertainty in the derived result has not been propagated.'};
  }
  const flagged=samples.filter(s=>s.flagged).length;
  const summary=layer.type==='quality'?`${flagged}/${total} inputs ${ds.quality?.kind==='copernicus-edm'?'edited':'flagged suspicious'}`:entries.map(e=>`${e.count} ${e.label}`).join(' · ');
  return {id:layer.id,label:layer.label,type:layer.type,total,entries,samples,flagged,summary,
    note:layer.type==='quality'?'Producer categories are retained below. These flags are not an error estimate.':layer.note};
}
