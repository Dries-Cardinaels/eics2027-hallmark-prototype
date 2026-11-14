import {cellCenter} from './spatial.js';
import {sampleSurfaceMap,surfaceCategory} from './surface-map.js';
import {qualityVisibility} from './quality-visibility.js';

// One marker per mapped result whose declared support contains a flagged height.
// The display lift is deliberately absent here: these are ground locations.
export function flaggedResults(map) {
  if (!map.flags) return [];
  const results = [];
  for (let row=0;row<map.grid.H;row++) for (let col=0;col<map.grid.W;col++) {
    const cell = {row:row+map.offset.row,col:col+map.offset.col};
    const sample = sampleSurfaceMap(map,cell);
    if (!(sample.suspicious>0)) continue;
    const index=cell.row*map.sourceGrid.W+cell.col;
    const height=map.dataset.heights[index];
    if (!Number.isFinite(height)) continue;
    results.push({index,...cell,...cellCenter(map.sourceGrid,cell),height});
  }
  return results;
}

export function lidarGapCells(map){
  if(!map.showLidarGaps)return [];
  const cells=[];
  for(let row=0;row<map.grid.H;row++)for(let col=0;col<map.grid.W;col++){
    const cell={row:row+map.offset.row,col:col+map.offset.col};
    const sample=sampleSurfaceMap(map,cell);
    if(sample.missingHeights>0)cells.push({...cell,index:cell.row*map.sourceGrid.W+cell.col,missingHeights:sample.missingHeights});
  }
  return cells;
}

// Draw only the outside edges of the same marked region cells.
export function flaggedBoundary(markers,W) {
  const cells=new Set(markers.map(c=>c.index));
  const edges=[];
  for(const cell of markers)for(const [dr,dc,side] of [[-1,0,'north'],[0,1,'east'],[1,0,'south'],[0,-1,'west']]){
    const col=cell.col+dc;
    if(col<0||col>=W||!cells.has((cell.row+dr)*W+col))edges.push({...cell,side});
  }
  return edges;
}

// Piecewise-linear display sampling follows the two native mesh triangles exactly.
// It positions annotations; it is never a source for terrain calculations.
export function surfaceHeight(dataset,row,col) {
  const r=Math.max(0,Math.min(dataset.H-1,row)),c=Math.max(0,Math.min(dataset.W-1,col));
  const r0=Math.min(dataset.H-2,Math.floor(r)),c0=Math.min(dataset.W-2,Math.floor(c));
  const y=r-r0,x=c-c0,h=(dr,dc)=>dataset.heights[(r0+dr)*dataset.W+c0+dc];
  const points=x+y<=1?[[h(0,0),1-x-y],[h(0,1),x],[h(1,0),y]]:[[h(1,1),x+y-1],[h(0,1),1-y],[h(1,0),1-x]];
  const used=points.filter(([,weight])=>weight>0);
  return used.every(([height])=>Number.isFinite(height))?used.reduce((sum,[height,weight])=>sum+height*weight,0):NaN;
}

// Each shared category edge exactly once, in starting-height cell coordinates.
// Adjacent cells in the same class contribute no edge. The chunk perimeter is
// not a comparison, and continuous values never create synthetic contours.
export function categoricalBoundaries(map){
  if(!map.limits&&map.layer!=='quality')return [];
  const {W,H}=map.sourceGrid,categories=new Array(W*H),segments=[];
  for(let row=0;row<H;row++)for(let col=0;col<W;col++)categories[row*W+col]=surfaceCategory(map,{row,col});
  for(let row=0;row<H;row++)for(let col=0;col<W;col++){
    const i=row*W+col,key=categories[i];
    if(col+1<W&&key!==categories[i+1])segments.push([row-.5,col+.5,row+.5,col+.5]);
    if(row+1<H&&key!==categories[i+W])segments.push([row+.5,col-.5,row+.5,col+.5]);
  }
  return segments;
}

// Tracing adds exact source evidence without suppressing requested map context.
export function evidenceVisibility(map,inspect=false){
  const quality=qualityVisibility(map.qualityVisibility);
  return {regions:Boolean(map.flags&&map.dataset.quality&&map.layer!=='quality'),heightFlags:Boolean(map.heightFlags&&map.dataset.quality),sources:Boolean(inspect),suspiciousSources:Boolean(inspect&&map.dataset.quality&&quality.heights)};
}

// A contextual route never contributes source cells or paints over queried height footprints.
export function tracePresentation(snapshot,path,inspect=false,settings={}){
  const quality=qualityVisibility(settings);
  const key=cell=>cell.row*snapshot.dataset.W+cell.col,sources=new Map(snapshot.sources.map(cell=>[cell.index,cell]));
  const selected=snapshot.heightCell,selectedInput=selected?sources.get(key(selected))||null:null;
  const selectedResult=inspect&&snapshot.record.kind!=='source';
  const routeCells=(path?.cells||[]).filter(cell=>!inspect||!sources.has(key(cell))&&!(selectedResult&&selected&&key(cell)===key(selected)));
  const sourceFlags=inspect&&quality.heights?snapshot.sources.filter(cell=>Number.isFinite(cell.height)&&cell.quality&&(snapshot.dataset.quality.flaggedCodes||[3]).includes(cell.quality.code)).map(cell=>cell.index):[];
  return {routeCells,routeContext:inspect,routeFlags:!inspect&&quality.affected,sourceFlags,selectedResult,selectedInput,centreRole:snapshot.record.kind==='source'?'source':selectedInput?'input':'result'};
}


export function flaggedHeights(map){
  if(!map.heightFlags||!map.dataset.quality)return [];
  const {dataset,sourceGrid}=map,result=[];
  for(let index=0;index<dataset.heights.length;index++)if((dataset.quality.flaggedCodes||[3]).includes(dataset.quality.codes[index])&&Number.isFinite(dataset.heights[index])){
    const row=Math.floor(index/dataset.W),col=index%dataset.W;
    result.push({index,row,col,...cellCenter(sourceGrid,{row,col}),height:dataset.heights[index]});
  }
  return result;
}
