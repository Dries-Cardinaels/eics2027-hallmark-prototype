import {withTraversalCost} from './traversal-cost.js';
import {createDatasetPipeline} from '../src/core/pipeline.js';
import {declaredSourceIndices} from '../src/core/query.js';
import {summariseHeightRMS} from '../src/core/height-evidence.js';
import {layerGrid,cellCenter,cellCoordinates} from './spatial.js';
import {numericEvidenceFields,evidenceNumber} from './source-evidence.js';
import {planningBranchLabel} from './planning-priority.js';

// Uses the same graph and declared footprints as query(), never a display neighbourhood.
export function routeRMSContext(dataset,branch){
  if(!dataset.heightRMS)return null;
  const pipeline=withTraversalCost(createDatasetPipeline(dataset)),op=pipeline.byId[branch];
  const sourceGrid=layerGrid(dataset,{grid:'heights'}),grid=layerGrid(dataset,op);
  return {range:numericEvidenceFields(dataset)['height-rms'].range,summary(cell){
    const ref=cellCoordinates(grid,cellCenter(sourceGrid,cell));
    if(ref.row<0||ref.col<0||ref.row>=grid.H||ref.col>=grid.W)return {branch,known:0,total:0,min:null,max:null,outside:true};
    return {...summariseHeightRMS(declaredSourceIndices({pipeline,dataset},branch,ref.row*grid.W+ref.col),dataset),branch};
  }};
}
export const routeRMSText=summary=>!summary?'Not supplied':`${summary.known?`${evidenceNumber(summary.min)}–${evidenceNumber(summary.max)} m`:'Unknown'} · ${summary.known}/${summary.total} known${summary.outside?' · outside result grid':''} · ${planningBranchLabel(summary.branch)} inputs`;
export function highestRouteRMS(path){
  // Prefer an interior cell on exact ties; retain route order for deterministic selection.
  return path?.cells.filter(c=>Number.isFinite(c.inputHeightRMS?.max)).sort((a,b)=>b.inputHeightRMS.max-a.inputHeightRMS.max||Number(a.index===0||a.index===path.cells.length-1)-Number(b.index===0||b.index===path.cells.length-1)||a.index-b.index)[0]??null;
}

// Snapshot sources are the exact transitive query support, so cells outside a footprint are never included.
export function largestRMSSources(sources){
  const known=sources.filter(cell=>Number.isFinite(cell.heightRMS_m)&&cell.heightRMS_m>=0);
  if(!known.length)return [];
  const max=Math.max(...known.map(cell=>cell.heightRMS_m));
  return known.filter(cell=>cell.heightRMS_m===max).sort((a,b)=>a.index-b.index);
}
