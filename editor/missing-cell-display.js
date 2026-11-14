import {nativeSampleCounts} from '../src/core/sample-counts.js';
import {surfaceHeight} from './evidence-geometry.js';

// A separate drawing surface keeps empty lidar bins visible and pickable. None
// of these heights enter the dataset, its provenance, or any terrain analysis.
const guides = new WeakMap(), meshes = new WeakMap(), groundColours = new WeakMap();

// Draw across gaps by averaging the four adjacent native cells. Observed
// values stay fixed throughout, including at the edges of wide gaps.
function fillDisplayGaps(values, width, height, tolerance) {
  const missing = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) sum += values[i];
    else missing.push(i);
  }
  const count = values.length - missing.length;
  if (!count || !missing.length) return;
  for (const i of missing) values[i] = sum / count;
  for (let iteration = 0; iteration < 4096; iteration++) {
    let change = 0;
    for (const i of missing) {
      const col = i % width;
      let total = 0, neighbours = 0;
      if (i >= width) {total += values[i-width]; neighbours++;}
      if (i < (height-1)*width) {total += values[i+width]; neighbours++;}
      if (col > 0) {total += values[i-1]; neighbours++;}
      if (col+1 < width) {total += values[i+1]; neighbours++;}
      const next = total / neighbours;
      change = Math.max(change, Math.abs(next-values[i]));
      values[i] = next;
    }
    if (change < tolerance) break;
  }
}

export function displayGroundRGB(dataset) {
  const {groundRGB, groundCounts, W, H} = dataset;
  if (!groundRGB || !groundCounts) return groundRGB;
  if (groundColours.has(dataset)) return groundColours.get(dataset);
  const colours = Uint8Array.from(groundRGB);
  for (let channel = 0; channel < 3; channel++) {
    const values = Float64Array.from(groundCounts, (count,i) => count ? groundRGB[3*i+channel] : NaN);
    fillDisplayGaps(values,W,H,1e-5);
    for (let i = 0; i < values.length; i++) {
      if (!groundCounts[i] && Number.isFinite(values[i])) colours[3*i+channel] = Math.round(values[i]);
    }
  }
  groundColours.set(dataset,colours);
  return colours;
}

function drawingSurface(dataset) {
  if (!nativeSampleCounts(dataset)) return dataset;
  if (guides.has(dataset)) return guides.get(dataset);
  const heights = Float64Array.from(dataset.heights);
  fillDisplayGaps(heights,dataset.W,dataset.H,1e-7);
  const surface = {W:dataset.W,H:dataset.H,heights};
  guides.set(dataset,surface);
  return surface;
}

export function annotationHeight(dataset,row,col) {
  // The mesh and every annotation use these same piecewise-linear triangles.
  return surfaceHeight(drawingSurface(dataset),row,col);
}

export function terrainDisplayMesh(dataset) {
  if (meshes.has(dataset)) return meshes.get(dataset);
  const padded = Boolean(nativeSampleCounts(dataset)), surface = drawingSurface(dataset);
  const rows = Array.from({length:dataset.H},(_,i)=>i), cols = Array.from({length:dataset.W},(_,i)=>i);
  // Lidar bins occupy full native squares: include the half-cell crop fringe.
  // Clamp its height to the outer observed/interpolated posts, just as sampling
  // does, so footprints, picking, top faces and the side walls meet exactly.
  if (padded) {rows.unshift(-.5); rows.push(dataset.H-.5); cols.unshift(-.5); cols.push(dataset.W-.5);}
  const W = cols.length, H = rows.length, heights = [], indices = [], perimeter = [];
  for (const row of rows) for (const col of cols) heights.push(surfaceHeight(surface,row,col));
  for (let row=0;row<H-1;row++) for (let col=0;col<W-1;col++) {
    const i = row*W+col;
    for (const triangle of [[i,i+W,i+1],[i+1,i+W,i+W+1]]) {
      if (triangle.every(index=>Number.isFinite(heights[index]))) indices.push(...triangle);
    }
  }
  for (let col=0;col<W;col++) perimeter.push(col);
  for (let row=1;row<H;row++) perimeter.push(row*W+W-1);
  for (let col=W-2;col>=0;col--) perimeter.push((H-1)*W+col);
  for (let row=H-2;row>0;row--) perimeter.push(row*W);
  const mesh = {W,H,rows,cols,heights,indices,perimeter};
  meshes.set(dataset,mesh);
  return mesh;
}
