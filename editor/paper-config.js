// Paper configuration (plan step 6.1; D2 package B, D5 none, ground rules 4 and 9).
// Open the editor with `?paper=1`. Nothing is deleted: hidden features keep their code and tests,
// and the editor without the flag is unchanged. The paper configuration
// - offers the two lunar cases only and opens on Connecting Ridge when `case` is absent;
// - starts with every limit unset (limits are scenario settings, never requirements);
// - removes planner controls, route objectives, route comparison, RMS review, the flagged input
//   fraction and traversal-cost layers, the palette picker and source gaps from the document;
// - keeps Height flags / Affected results as display only (no planning coupling);
// - shows one illustrative route as inspectable context, chosen by PAPER_ROUTE_RULE below.
import {createPlanningGrid} from './planner.js';
import {createDatasetPipeline} from '../src/core/index.js';

export const PAPER_FLAG='paper';
export const isPaperConfiguration=params=>params?.get(PAPER_FLAG)==='1';

export const PAPER_CASES=Object.freeze(['connecting-ridge','moon']);
export const PAPER_DEFAULT_CASE='connecting-ridge';
// Earth or unknown case ids fall back to Connecting Ridge; Earth cases are not reachable.
export const paperCaseId=id=>PAPER_CASES.includes(id)?id:PAPER_DEFAULT_CASE;

// Ground rule 4: no limit is set when the paper configuration opens.
export const PAPER_LIMITS=Object.freeze({slopeDeg:null,roughness_m:null});

// Elements removed from the document (ids in editor/index.html).
export const PAPER_REMOVED_IDS=Object.freeze([
  'palette-picker',        // palette picker (D2 row 25)
  'plan-controls',         // start / goal / plan / replan / approve / exclude and route objectives (rows 11–13)
  'route-comparison',      // previous vs proposed route (row 14)
  'rms-review-controls',   // operator RMS review threshold (row 16)
  'rms-review-heights','rms-review-results',
  'lidar-gaps',            // source gaps (row 21)
  'earth-cases',           // Earth cases in the case selector (D5)
]);
// Map layers removed from the layer menu: traversal cost (row 15) and flagged input fraction (row 10).
export const PAPER_REMOVED_LAYERS=Object.freeze(['traversal-cost','height-support']);
export const paperMapLayer=layer=>PAPER_REMOVED_LAYERS.includes(layer)?'assessment':layer;

// The paper pipeline is the dataset pipeline without the traversal-cost and flagged-input-fraction
// nodes, so neither appears in the processing graph.
export const paperPipeline=dataset=>createDatasetPipeline(dataset);

// Written selection rule for the one illustrative route (ground rule 9). Also stated in
// demo/research/paper-route-rule.md. Approved by the authors on 6 Nov 2026.
//   The route is a straight transect along the middle native row of the crop, row = floor(H / 2),
//   from the first to the last native column that has a slope result (the first and last analysis
//   column). No planner and no cost model are involved, and no cell is chosen by looking at its
//   values, flags, RMS or LOLA returns.
export const PAPER_ROUTE_RULE=Object.freeze({
  id:'middle-row-transect',
  status:'Approved by the authors, 6 Nov 2026',
  text:'Straight transect along the middle native row of the crop (floor(H / 2)), from the first to the last native column with a slope result. No planner, cost model, limits or flags are used.',
  branch:'slope',
});

export function paperRouteEndpoints(dataset,fields){
  const grid=createPlanningGrid(dataset,fields,[],{branch:PAPER_ROUTE_RULE.branch,matchSettings:{}});
  const row=Math.floor(dataset.H/2);
  return {start:{row,col:grid.offset.col},goal:{row,col:grid.offset.col+grid.W-1}};
}

// The transect's cells, in order. Shaped like a planner result so the existing route strip can
// display it. The route itself carries no cost. The route strip reuses the editor's planning grid,
// which computes a terrain cost per cell internally; the paper configuration neither shows it
// (the cost row needs the removed traversal-cost layer) nor exports it (paperExportPath).
export function paperRoute(dataset,fields){
  const {start,goal}=paperRouteEndpoints(dataset,fields),vertices=[];
  for(let col=start.col;col<=goal.col;col++)vertices.push({row:start.row,col});
  return {start,goal,route:{ok:true,vertices,branch:PAPER_ROUTE_RULE.branch,matchSettings:{},distance_m:(vertices.length-1)*dataset.res,rule:PAPER_ROUTE_RULE.id}};
}

export const PAPER_ROUTE_NOTE='Illustrative route: a straight transect along the middle row, first to last analysis column, fixed by a written rule. Not a planned, recommended or mission route.';

// Export form of the illustrative route (ground rule 4: no cost model in the paper). Removes the
// planning grid's per-cell priority (terrain cost and flag match), any sampled cost and the cost range.
const COST_KEYS=new Set(['priority','cost','costRange']);
export function paperExportPath(path){
  if(!path)return null;
  const strip=object=>Object.fromEntries(Object.entries(object).filter(([key])=>!COST_KEYS.has(key)));
  return {...strip(path),cells:path.cells.map(strip)};
}
