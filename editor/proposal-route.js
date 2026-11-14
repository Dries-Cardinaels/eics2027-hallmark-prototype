import {evaluateRaster} from '../src/core/raster.js';
import {planRoute} from './planner.js';

// Reconstruct the proposal from its own survey only. Later ground-return counts,
// origins and quality must never be attached to the earlier DSM's cells.
export function createEarlierSurveyProposal(dataset) {
  if(!['earth','atami'].includes(dataset.caseId)||!dataset.proposalHeights||!dataset.gapCell)return null;
  const heights=Array.from(dataset.proposalHeights);
  const earlier={id:dataset.id+':proposal',W:dataset.W,H:dataset.H,res:dataset.res,heights,
    origins:heights.map(value=>Number.isFinite(value)?'undocumented':'absent')};
  const fields={slope:evaluateRaster(earlier,'slope')};
  const start=dataset.proposalStart,goal=dataset.proposalGoal;
  if(!start||!goal)throw new Error('Earlier-survey demonstration endpoints are missing.');
  const result=planRoute(earlier,fields,{start,goal,branch:'slope'});
  if(!result.ok)throw new Error('Earlier-survey illustrative route could not be planned: '+result.error);
  if(!result.vertices.some(c=>c.row===dataset.gapCell.row&&c.col===dataset.gapCell.col))throw new Error('Earlier-survey proposal does not cross the inspection gap.');
  return {...result,proposal:{...dataset.proposalSource},start:{...start},goal:{...goal}};
}
