// Nassau query records captured before step 3.3/3.4 (Ridge LOLA-return label).
// Cells: the audited Nassau cells used in tests/height-quality-layers.test.mjs
// (analysis 118,125 and 124,131) and the grid origin (0,0); nodes slope, roughness, combined.
import {readFile} from 'node:fs/promises';
import {loadTerrain} from '../editor/data.js';
import {evaluate,query} from '../src/core/index.js';
export const NASSAU_SNAPSHOT_CELLS=[{row:118,col:125},{row:124,col:131},{row:0,col:0}];
export const NASSAU_SNAPSHOT_NODES=['slope','roughness','combined'];
export async function nassauQueryStrings(){
 const original=globalThis.fetch;
 globalThis.fetch=async url=>new Response(await readFile(new URL(url)));
 try{
  const ev=evaluate(await loadTerrain('moon','ground'));
  return Object.fromEntries(NASSAU_SNAPSHOT_NODES.flatMap(node=>NASSAU_SNAPSHOT_CELLS.map(cell=>[`${node}@${cell.row},${cell.col}`,JSON.stringify(query(ev,node,cell))])));
 }finally{globalThis.fetch=original;}
}
