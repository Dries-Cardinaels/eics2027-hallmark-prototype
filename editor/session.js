import {evaluateLazy, query, createDatasetPipeline, DEFAULT_LIMITS} from '../src/core/index.js';
import {layerGrid, cellCenter, cellAt, cellCoordinates, projectSources} from './spatial.js';
import {withTraversalCost,COST_NODE} from './traversal-cost.js';
import {isEarthCase} from './case-presentation.js';
import {nativeHeightEvidence} from '../src/core/height-evidence.js';

export function createSession(dataset, options = {}) {
  const basePipeline = options.pipeline || createDatasetPipeline(dataset);
  const pipeline = options.pipeline || withTraversalCost(basePipeline);
  let limits = {...DEFAULT_LIMITS, ...(isEarthCase(dataset) ? {slopeDeg:null,roughness_m:null} : {}), ...options.limits};
  let evaluation = evaluateLazy(dataset, limits, pipeline);
  let selection = options.selection ? {layerId: options.selection.layerId, cell: {...options.selection.cell}} : {layerId: 'slope', cell: {row: 0, col: 0}};
  let trail = [];
  let pathSelection = null;
  let snapshot;

  function grid(id) {
    const operation = pipeline.byId[id];
    if (!operation) throw new Error(`Unknown layer: ${id}`);
    return layerGrid(dataset, operation);
  }

  function validate(target) {
    const g = grid(target.layerId), {row, col} = target.cell;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= g.H || col >= g.W) throw new Error('Cell outside the selected layer');
  }

  function inspect(target) {
    let record = query(evaluation, target.layerId, target.cell);
    if(target.layerId===COST_NODE&&!record.outside){
      const cost=evaluation.records[COST_NODE][record.cell.index];
      record={...record,terms:cost.terms};
    }
    if (record.outside) {
      const op = pipeline.byId[target.layerId];
      record = {...record, title: op.title, kind: op.kind, unit: op.unit, available: false, value: null, method: op.method, reason: 'Outside layer grid', sourceCells: [], immediateInputs: [], paths: []};
    }
    const sourceGrid = grid('heights');
    const inputs = record.immediateInputs.map(input => ({
      layerId: input.node,
      title: pipeline.byId[input.node].title,
      cells: input.cells.map(cell => {
        const child = query(evaluation, input.node, cell);
        return {cell, heightCell: child.centreHeightCell || cell, value: child.value, unit: child.unit, outcome: child.outcome, available: child.available,
          ...(input.node==='heights'?{sourceIndex:child.sourceCells[0].index,qualityCode:child.sourceCells[0].quality?.code,...(child.sourceCells[0].stereoMatch?{stereoMatch:child.sourceCells[0].stereoMatch}:{})}:{}),
          ...(input.node === 'heights' && dataset.dsmSampleCounts ? {dsmSampleCount:child.sourceCells[0].dsmSampleCount} : {}),
          ...(input.node === 'heights' && dataset.groundCounts ? {groundCount:child.sourceCells[0].groundCount} : {}),
          ...(input.node === 'heights' ? nativeHeightEvidence(dataset,child.sourceCells[0].index) : {}),
        };
      }),
    }));
    const point = cellCenter(grid(target.layerId), target.cell);
    const heightCell=cellAt(sourceGrid,point),heightRecord=heightCell?query(evaluation,'heights',heightCell):null;
    const centreSource=heightRecord?.sourceCells[0],used=Boolean(centreSource&&record.sourceCells.some(c=>c.index===centreSource.index));
    const heightHere=centreSource?{cell:{...heightCell},index:centreSource.index,height:centreSource.height,quality:centreSource.quality,...(centreSource.stereoMatch?{stereoMatch:centreSource.stereoMatch}:{}),
      ...nativeHeightEvidence(dataset,centreSource.index),
      ...(dataset.dsmSampleCounts ? {dsmSampleCount:centreSource.dsmSampleCount} : {}),
      ...(dataset.groundCounts ? {groundCount:centreSource.groundCount} : {}),
      // `used` comes from the query's declared inputs only. Cells outside the footprint, including the selected
      // cell itself, are not marked specially (authors, 11 Nov 2026): the interface knows only what is declared.
      used}:null;

    let comparisonHeight;
    const other=dataset.comparisonSurface;
    if(other){
      const cell=cellAt(other.grid,point);
      const value=cell?other.heights[cell.row*other.grid.W+cell.col]:null;
      comparisonHeight={label:other.label,date:other.date,product:other.product,sourceURL:other.sourceURL,point,cell,height:Number.isFinite(value)?value:null};
    }
    return {
      comparisonHeight,record,
      selection: {layerId: target.layerId, cell: {...target.cell}},
      point,
      heightCell,heightHere,
      sources: projectSources(record.sourceCells, sourceGrid),
      inputs,
    };
  }

  function refresh() {
    const inspection = inspect(selection);
    snapshot = {
      dataset, pipeline, limits: {...limits}, pathSelection,
      ...inspection,
      trail: [...trail.map(s => ({...s, cell: {...s.cell}})), inspection.selection],
      sourceGrid: grid('heights'),
      selectedGrid: grid(selection.layerId),
    };
    return snapshot;
  }

  function dispatch(action) {
    if (action.type === 'path-select') {
      const next={layerId:action.layerId||'combined',cell:{...action.cell}};validate(next);
      selection=next;trail=[];pathSelection={pathId:action.pathId,index:action.index};
    } else if (action.type === 'select') {
      const next = {layerId: action.layerId || selection.layerId, cell: {...action.cell}};
      validate(next);
      selection = next;
      trail = [];
    } else if (action.type === 'pick') {
      if (!cellAt(grid('heights'), action.point)) return snapshot;
      const layerId = action.layerId || selection.layerId;
      const cell = cellCoordinates(grid(layerId), action.point);
      selection = {layerId,cell};
      trail = [];
    } else if (action.type === 'layer') {
      const point = cellCenter(grid(selection.layerId), selection.cell);
      const cell = cellCoordinates(grid(action.layerId), point);
      selection = {layerId: action.layerId, cell};
      trail = [];
    } else if (action.type === 'move') {
      const g = grid(selection.layerId);
      const point = cellCenter(g, selection.cell);
      point.east += action.col * g.res;
      point.north -= action.row * g.res;
      if (!cellAt(grid('heights'), point)) return snapshot;
      selection = {...selection, cell: cellCoordinates(g, point)};
      trail = [];
    } else if (action.type === 'input') {
      const input = snapshot.inputs.find(input => input.layerId === action.layerId);
      const match = input?.cells.find(input => input.cell.row === action.cell.row && input.cell.col === action.cell.col);
      if (!match) throw new Error('Cell is not an immediate input of the selected result');
      trail.push(selection);
      selection = {layerId: action.layerId, cell: {...action.cell}};
    } else if (action.type === 'source') {
      const source = snapshot.sources.find(cell => cell.index === action.index);
      if (!source) throw new Error('Cell is not a declared source of the selected result');
      trail.push(selection);
      selection = {layerId:'heights',cell:{row:source.row,col:source.col}};
    } else if (action.type === 'back') {
      const index = action.index ?? trail.length - 1;
      if (index < 0 || index >= trail.length) return snapshot;
      selection = trail[index];
      trail = trail.slice(0, index);
    } else if (action.type === 'limits') {
      const next = {...limits, ...action.limits};
      if ((next.slopeDeg !== null && (!Number.isFinite(next.slopeDeg) || next.slopeDeg < 0 || next.slopeDeg > 90)) || (next.roughness_m !== null && (!Number.isFinite(next.roughness_m) || next.roughness_m < 0))) throw new Error('Invalid criterion limit');
      const nextEvaluation = evaluateLazy(dataset, next, pipeline);
      limits = next;
      evaluation = nextEvaluation;
    } else {
      throw new Error(`Unknown inspection action: ${action.type}`);
    }
    if(['select','pick','move','layer'].includes(action.type))pathSelection=null;
    return refresh();
  }

  refresh();
  return {dispatch, getSnapshot: () => snapshot};
}
