import {rmsReviewState,summariseRMSReview,rmsReviewText} from './rms-review.js';
import {cellCenter} from './spatial.js';
import {evidenceNumber} from './source-evidence.js';

// Raised markers are limited to route, selected and exact traced evidence.
// Native identity is independent of route order; all applicable roles survive merging.
export function raisedRMSReviewMarkers(map,snapshot,path,inspect=false,routeContext=null){
  const markers=new Map(),{dataset,sourceGrid}=map;
  const add=(cell,role,summary,routeIndex=null)=>{
    if(!summary?.triggered)return;
    const index=cell.row*sourceGrid.W+cell.col,height=dataset.heights[index];
    if(!Number.isFinite(height))return;
    let marker=markers.get(index);
    if(!marker){marker={index,row:cell.row,col:cell.col,...cellCenter(sourceGrid,cell),height,heightRMS:dataset.heightRMS[index],roles:[],routeIndices:[]};markers.set(index,marker);}
    marker.roles.push({role,summary});
    if(routeIndex!==null&&!marker.routeIndices.includes(routeIndex))marker.routeIndices.push(routeIndex);
  };
  for(const cell of path?.cells||[]){
    const summary=routeContext?.summary(cell);
    for(const scope of summary?.scopes||[])add(cell,scope.label==='Own height'?'route-own-height':'route-planning-inputs',scope,cell.index);
  }
  const own=cell=>({threshold:map.rmsReviewSources.threshold,triggered:Number(rmsReviewState(dataset.heightRMS[cell.row*sourceGrid.W+cell.col],map.rmsReviewSources.threshold)==='trigger'),total:1,unknown:0,known:1,rms:dataset.heightRMS[cell.row*sourceGrid.W+cell.col]});
  if(inspect&&map.rmsReviewSources)for(const source of snapshot.sources)add(source,'traced-height',own(source));
  const selected=snapshot.heightCell;
  if(selected){
    if(map.rmsReviewSources)add(selected,snapshot.record.kind==='source'?'selected-height':snapshot.heightHere&&!snapshot.heightHere.used?'undeclared-own-height':'selected-own-height',own(selected));
    if(snapshot.record.kind!=='source'&&map.rmsReview)add(selected,'selected-result-inputs',summariseRMSReview(snapshot.sources,map.rmsReview.threshold));
  }
  return [...markers.values()];
}

export function raisedRMSReviewText(marker){
  const scopes=new Map();
  for(const {role,summary} of marker.roles){
    const label=role==='route-planning-inputs'?'Planning inputs':role==='selected-result-inputs'?'Selected result inputs':'Own height';
    const detail=label==='Own height'?`Own height: RMS ${evidenceNumber(marker.heightRMS)} m exceeds your ${summary.threshold} m review threshold${role==='undeclared-own-height'?' (not in the footprint of the selected result)':''}`:`${label}: ${rmsReviewText(summary)}`;
    scopes.set(label,detail);
  }
  return 'Your RMS review rule triggered · '+[...scopes.values()].join('; ');
}
