import {MARGIN} from '../src/core/index.js';

export function layerGrid(dataset, operation) {
  const source = operation.grid === 'heights';
  const margin = source ? 0 : MARGIN;
  const origin = dataset.grid || {
    east: -dataset.W * dataset.res / 2,
    north: dataset.H * dataset.res / 2,
  };
  return {
    W: dataset.W - margin * 2,
    H: dataset.H - margin * 2,
    res: dataset.res,
    east: origin.east + margin * dataset.res,
    north: origin.north - margin * dataset.res,
    crs: origin.crs || 'local metres',
  };
}

export function cellCenter(grid, cell) {
  return {
    east: grid.east + (cell.col + .5) * grid.res,
    north: grid.north - (cell.row + .5) * grid.res,
  };
}

export function cellAt(grid, point) {
  const {row, col} = cellCoordinates(grid, point);
  return row < 0 || col < 0 || row >= grid.H || col >= grid.W ? null : {row, col};
}

// No inference of neighbouring cells: one mark per source returned by the query.
export function projectSources(sourceCells, grid) {
  return sourceCells.map(cell => ({...cell, ...cellCenter(grid, cell)}));
}

export function cellCoordinates(grid, point) {
  return {row: Math.floor((grid.north - point.north) / grid.res), col: Math.floor((point.east - grid.east) / grid.res)};
}

// Every scene cell footprint uses the same native square, centred on its post.
export const NATIVE_CELL_HALF=.5;
export function nativeCellFootprint({row,col}){
  return [[-1,-1],[-1,1],[1,1],[1,-1]].map(([r,c])=>({row:row+r*NATIVE_CELL_HALF,col:col+c*NATIVE_CELL_HALF}));
}
