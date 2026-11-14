import {createDatasetPipeline} from '../src/core/pipeline.js';
import {declaredSourceIndices} from '../src/core/query.js';
import {suppliedNumber} from '../src/core/height-evidence.js';
import {withTraversalCost} from './traversal-cost.js';
import {layerGrid,cellCenter,cellCoordinates} from './spatial.js';

// Operator display rule only. Never attached to supplier quality or planning inputs.
export function parseRMSReview(value){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const threshold=Number(value);
  return Number.isFinite(threshold)&&threshold>=0?threshold:null;
}
export const rmsReviewFromParams=params=>parseRMSReview(params.get('rmsreview'));
export function writeRMSReviewParam(params,threshold){
  threshold=parseRMSReview(threshold);
  if(threshold===null)params.delete('rmsreview');else params.set('rmsreview',String(threshold));
}
// Independent operator display preferences; threshold unset disables both scopes.
export function rmsReviewVisibility(options={},dataset=null){
  const threshold=parseRMSReview(options.rmsReview);
  const active=threshold!==null&&(!dataset||Boolean(dataset.heightRMS));
  return {threshold,heights:active&&options.rmsHeights!==false,results:active&&options.rmsResults!==false};
}
export const rmsReviewTogglesFromParams=params=>({rmsHeights:params.get('rmsheights')!=='off',rmsResults:params.get('rmsresults')!=='off'});
export function writeRMSReviewToggleParams(params,options){
  for(const [key,param] of [['rmsHeights','rmsheights'],['rmsResults','rmsresults']]){
    if(options[key]===false)params.set(param,'off');else params.delete(param);
  }
}
export function rmsRouteReviewContext(dataset,node,options,pipeline=null){
  const visibility=rmsReviewVisibility(options,dataset);
  const own=visibility.heights?rmsReviewContext(dataset,'heights',visibility.threshold,pipeline):null;
  const inputs=visibility.results?rmsReviewContext(dataset,node,visibility.threshold,pipeline):null;
  if(!own&&!inputs)return null;
  return {label:own&&inputs?'Review · height + inputs':own?'Review · own height':'Review · planning inputs',summary(cell){
    const scopes=[...(own?[{label:'Own height',node:'heights',...own.summary(cell)}]:[]),...(inputs?[{label:'Planning inputs',node,...inputs.summary(cell)}]:[])];
    return {threshold:visibility.threshold,scopes,ownTriggered:scopes.some(s=>s.label==='Own height'&&s.triggered>0),resultsTriggered:scopes.some(s=>s.label==='Planning inputs'&&s.triggered>0),...Object.fromEntries(['triggered','unknown','known','total'].map(key=>[key,scopes.reduce((sum,s)=>sum+s[key],0)]))};
  }};
}
export function rmsReviewState(value,threshold){
  if(!Number.isFinite(threshold)||threshold<0)return 'unset';
  const supplied=suppliedNumber(value);
  return supplied===null?'unknown':supplied>threshold?'trigger':'no-trigger';
}
export function summariseRMSReview(sources,threshold){
  threshold=parseRMSReview(threshold);if(threshold===null)return null;
  let triggered=0,unknown=0;
  for(const cell of sources){const state=rmsReviewState(cell.heightRMS_m,threshold);triggered+=state==='trigger';unknown+=state==='unknown';}
  return {threshold,triggered,unknown,total:sources.length,known:sources.length-unknown};
}

const datasets=new WeakMap();
function evidenceCache(dataset,pipeline){
  let cached=datasets.get(dataset);
  if(!cached){cached={pipeline:withTraversalCost(createDatasetPipeline(dataset)),pipelines:new WeakMap()};datasets.set(dataset,cached);}
  pipeline ||= cached.pipeline;
  let evidence=cached.pipelines.get(pipeline);
  if(!evidence){evidence={pipeline,support:new Map(),fields:new Map()};cached.pipelines.set(pipeline,evidence);}
  return evidence;
}

// Compact source indices are resolved from declared footprints once per branch.
// Threshold edits only scan these arrays: no full provenance queries or terrain evaluation.
function supportField(dataset,node,cache){
  if(cache.support.has(node))return cache.support.get(node);
  const grid=layerGrid(dataset,cache.pipeline.byId[node]),size=grid.W*grid.H;
  const offsets=new Uint32Array(size+1),indices=[];
  for(let index=0;index<size;index++){
    const cells=node==='heights'?[index]:declaredSourceIndices({pipeline:cache.pipeline,dataset},node,index);
    for(const source of cells)indices.push(source);
    offsets[index+1]=indices.length;
  }
  const support={grid,offsets,indices:Uint32Array.from(indices)};
  cache.support.set(node,support);return support;
}

export function rmsReviewField(dataset,node,threshold,pipeline=null){
  threshold=parseRMSReview(threshold);
  if(!dataset.heightRMS||threshold===null)return null;
  const cache=evidenceCache(dataset,pipeline),previous=cache.fields.get(node);
  if(previous?.threshold===threshold)return previous;
  const support=supportField(dataset,node,cache),size=support.offsets.length-1;
  const triggered=new Uint32Array(size),unknown=new Uint32Array(size),total=new Uint32Array(size);
  for(let index=0;index<size;index++){
    const start=support.offsets[index],end=support.offsets[index+1];total[index]=end-start;
    for(let at=start;at<end;at++){
      const state=rmsReviewState(dataset.heightRMS[support.indices[at]],threshold);
      triggered[index]+=state==='trigger';unknown[index]+=state==='unknown';
    }
  }
  const field={grid:support.grid,threshold,triggered,unknown,total};
  // Retain only the latest threshold per branch; support arrays remain reusable.
  cache.fields.set(node,field);return field;
}

export function rmsReviewContext(dataset,node,threshold,pipeline=null){
  threshold=parseRMSReview(threshold);
  const field=rmsReviewField(dataset,node,threshold,pipeline);if(!field)return null;
  const sourceGrid=layerGrid(dataset,{grid:'heights'});
  return {field,summary(cell){
    const ref=cellCoordinates(field.grid,cellCenter(sourceGrid,cell));
    if(ref.row<0||ref.col<0||ref.row>=field.grid.H||ref.col>=field.grid.W)return {threshold,triggered:0,unknown:0,known:0,total:0,outside:true};
    const index=ref.row*field.grid.W+ref.col,total=field.total[index],unknown=field.unknown[index];
    return {threshold,triggered:field.triggered[index],unknown,known:total-unknown,total};
  }};
}

export const rmsReviewText=summary=>!summary?'Review threshold unset':summary.scopes?summary.scopes.map(scope=>scope.label+': '+rmsReviewText(scope)).join('; '):`${summary.triggered} of ${summary.total} supporting heights exceed your ${summary.threshold} m review threshold${summary.unknown?`; ${summary.unknown} RMS unknown`:''}${summary.outside?'; outside result grid':''}`;

export function rmsReviewMarkers(map,source=false){
  const field=source?map.rmsReviewSources:map.rmsReview;
  if(!field||(!source&&map.node==='heights'))return [];
  const offset=source?{row:0,col:0}:map.offset,result=[];
  for(let row=0;row<field.grid.H;row++)for(let col=0;col<field.grid.W;col++){
    if(!field.triggered[row*field.grid.W+col])continue;
    const cell={row:row+offset.row,col:col+offset.col},index=cell.row*map.sourceGrid.W+cell.col;
    const height=map.dataset.heights[index];if(!Number.isFinite(height))continue;
    result.push({index,...cell,...cellCenter(map.sourceGrid,cell),height});
  }
  return result;
}
