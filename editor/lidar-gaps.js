import {nativeSampleCounts} from '../src/core/sample-counts.js';
import {createDatasetPipeline} from '../src/core/index.js';
import {withTraversalCost} from './traversal-cost.js';
import {layerGrid} from './spatial.js';

const datasets=new WeakMap();

// Display evidence follows the declared source union, including inputs a
// calculation may not read. It never supplies a height or enters route costs.
export function lidarGapField(dataset,node,pipeline=null){
  if(!nativeSampleCounts(dataset))return null;
  let cached=datasets.get(dataset);
  if(!cached){cached={pipeline:withTraversalCost(createDatasetPipeline(dataset)),pipelines:new WeakMap()};datasets.set(dataset,cached);}
  pipeline ||= cached.pipeline;
  let evidence=cached.pipelines.get(pipeline);
  if(!evidence){evidence={sources:new Map(),fields:new Map()};cached.pipelines.set(pipeline,evidence);}
  if(evidence.fields.has(node))return evidence.fields.get(node);
  function missingSources(id,index){
    let cells=evidence.sources.get(id);
    if(!cells){cells=new Map();evidence.sources.set(id,cells);}
    if(cells.has(index))return cells.get(index);
    const operation=pipeline.byId[id];
    const sources=operation.kind==='source'
      ? (!Number.isFinite(dataset.heights[index])?[index]:[])
      : [...new Set(Object.entries(operation.footprint(index,dataset)).flatMap(([input,indices])=>indices.flatMap(cell=>missingSources(input,cell))))];
    cells.set(index,sources);return sources;
  }
  const grid=layerGrid(dataset,pipeline.byId[node]);
  const field={grid,counts:Uint32Array.from({length:grid.W*grid.H},(_,index)=>missingSources(node,index).length)};
  evidence.fields.set(node,field);return field;
}

export const lidarGapsFromParams=params=>params.get('gaps')==='1';
export const lidarGapText=(count,source=false,kind='ground')=>source?`Missing native ${kind} height`:`${count} missing native ${kind} height${count===1?'':'s'} used`;
