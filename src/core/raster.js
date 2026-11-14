import {createDatasetPipeline,DEFAULT_LIMITS,recordFor,validateDataset} from './pipeline.js';
import {analysisGrid} from './operations.js';
import {qualityAt} from './query.js';

// Compact overview over the same operation records used by inspection.
// Each temporary record uses the inspection evaluator; only scalar arrays are retained.
export function evaluateRaster(dataset, nodeId, pipeline = createDatasetPipeline(dataset)) {
  validateDataset(dataset);
  const op = pipeline.byId[nodeId];
  if (!op) throw new Error('Unknown raster operation');
  const sourceGrid = op.kind === 'source';
  const grid = sourceGrid ? {W:dataset.W,H:dataset.H,res:dataset.res} : analysisGrid(dataset);
  const count = grid.W * grid.H, values = new Float64Array(count);
  const quality = dataset.quality ? {suspicious:new Uint32Array(count),total:new Uint32Array(count)} : null;
  let min = Infinity, max = -Infinity;
  const readRecord = (id,index) => recordFor(dataset,pipeline.byId[id],index,readRecord,DEFAULT_LIMITS);
  for (let cell = 0; cell < count; cell++) {
    const record = readRecord(nodeId,cell);
    const value = record.available ? record.value : NaN;
    values[cell] = value;
    if (Number.isFinite(value)) {min = Math.min(min,value); max = Math.max(max,value);}
    if (quality) {const q = qualityAt({pipeline,dataset},nodeId,cell); quality.suspicious[cell] = q.suspicious; quality.total[cell] = q.total;}
  }
  return {node:nodeId,grid,unit:op.unit,method:op.method,values,quality,range:min === Infinity ? null : [min,max]};
}

