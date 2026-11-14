import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTerrain} from '../editor/data.js';
import {createSession} from '../editor/session.js';
import {cellCoordinates,layerGrid} from '../editor/spatial.js';
import {evaluateRaster} from '../src/core/raster.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {createPlanningGrid} from '../editor/planner.js';
import {createEarlierSurveyProposal} from '../editor/proposal-route.js';
import {createSupervisoryPlan} from '../editor/supervisory-plan.js';
import {createProposedPath} from '../editor/proposed-path.js';
import {routeMetrics} from '../editor/route-comparison.js';
import {createSurfaceMap,sampleSurfaceMap} from '../editor/surface-map.js';

const limits = {slopeDeg:15, roughness_m:.15};
function fieldsFor(dataset) {
  const values = Object.fromEntries(['slope','roughness','combined'].map(id => [id,evaluateRaster(dataset,id)]));
  return {...values, ...evaluateLimitRasters(dataset,values,limits)};
}
function routeCounts(path) {
  return Object.fromEntries(['slope','roughness'].map(branch => [branch,{
    within:path.cells.filter(c => c[branch].state === 0).length,
    exceeded:path.cells.filter(c => c[branch].state === 1).length,
    unavailable:path.cells.filter(c => c[branch].state === 2).length,
  }]));
}

test('the Atami road approach traces the missing height at cell #26 and replans on the later survey', async t => {
  // Read the same catalog and binaries as the editor, including the return counts.
  t.mock.method(globalThis, 'fetch', async url => new Response(await readFile(new URL(url))));
  const dataset = await loadTerrain('atami', 'ground');
  const gap = dataset.gapCell;
  assert.deepEqual(dataset.proposalStart, {row:15,col:42});
  assert.deepEqual(gap, {row:40,col:42});
  assert.deepEqual(dataset.proposalGoal, {row:85,col:87});
  const analysis = layerGrid(dataset, {grid:'analysis'});
  const point = {east:52142.5, north:-97261.5};
  assert.deepEqual(cellCoordinates(layerGrid(dataset, {grid:'heights'}), point), gap);
  const metadata = JSON.parse(await readFile(new URL('../fixtures/earth/atami-20210706-ground-crop.json',import.meta.url)));
  for (const [name,cell] of Object.entries({gap,start:dataset.proposalStart,goal:dataset.proposalGoal})) {
    assert.deepEqual(cellCoordinates(layerGrid(dataset, {grid:'heights'}), metadata.inspectionCellCentres[name]), cell);
  }
  const cell = cellCoordinates(analysis, point);
  const session = createSession(dataset, {limits});
  const proposal = createEarlierSurveyProposal(dataset);
  const gapIndex = proposal.vertices.findIndex(c => c.row === gap.row && c.col === gap.col);
  assert.equal(proposal.vertices.length, 116);
  assert.equal(gapIndex, 25);
  assert.ok(Math.abs(dataset.proposalHeights[gap.row*dataset.W+gap.col] - 381.60321045) < .00001);
  const fields = fieldsFor(dataset);
  const plan = createSupervisoryPlan(dataset, fields, {
    start:proposal.start, goal:proposal.goal, branch:'slope', limits, proposalRoute:proposal,
  });
  const initial = plan.getSnapshot();
  assert.equal(initial.status, 'Needs replan');
  assert.throws(() => plan.dispatch({type:'approve'}));
  const select = layerId => session.dispatch({type:'path-select', pathId:initial.route.id, index:gapIndex, layerId, cell});
  const slope = select('slope');
  assert.equal(slope.heightHere.groundCount, 0);
  assert.equal(slope.heightHere.height, null);
  assert.equal(slope.heightHere.used, false);
  assert.equal(slope.record.available, true);
  assert.equal(slope.pathSelection.index, 25);
  assert.equal(slope.sources.length, 8);
  assert.ok(Math.abs(slope.record.value - 38.7704533012) < .000001);
  assert.deepEqual(slope.sources.map(s => s.groundCount), [13,5,12,5,19,3,1,13]);
  assert.deepEqual(slope.inputs[0].cells.map(s => s.groundCount), slope.sources.map(s => s.groundCount));
  const roughness = select('roughness');
  assert.deepEqual(roughness.point, slope.point);
  assert.equal(roughness.sources.length, 25);
  assert.equal(roughness.sources.filter(s => s.height !== null).length, 24);
  assert.equal(roughness.heightHere.used, true);
  assert.equal(roughness.record.value, null);
  assert.equal(roughness.record.available, false);
  assert.ok(roughness.record.boundaries.missing.some(c => c.row === gap.row && c.col === gap.col));
  const missingHeight = session.dispatch({type:'input', layerId:'heights', cell:gap});
  assert.equal(missingHeight.record.sourceCells[0].groundCount, 0);
  assert.equal(missingHeight.record.available, false);
  assert.equal(session.dispatch({type:'back'}).selection.layerId, 'roughness');
  const assessment = select('combined');
  assert.equal(assessment.record.category, 'incomplete');
  assert.deepEqual(assessment.record.outcomes, {slope:'exceeded',roughness:'unavailable'});
  assert.equal(assessment.record.branches.slope.value, slope.record.value);
  assert.equal(assessment.record.branches.roughness.value, null);
  assert.deepEqual(assessment.record.boundaries.missing, [{...gap,branches:['roughness']}]);

  // Intersect declared footprints with this particular missing height; other
  // gaps elsewhere on the route must not inflate these dependency counts.
  const gapIntersections = layerId => proposal.vertices.flatMap((vertex,index) => {
    const result = session.dispatch({type:'select',layerId,cell:{row:vertex.row-2,col:vertex.col-2}});
    return result.sources.some(s => s.row === gap.row && s.col === gap.col) ? [index+1] : [];
  });
  assert.deepEqual(gapIntersections('slope'), [25,27]);
  assert.deepEqual(gapIntersections('roughness'), [24,25,26,27,28]);
  const slopeGrid = createPlanningGrid(dataset, fields, [], {branch:'slope'});
  const roughGrid = createPlanningGrid(dataset, fields, [], {branch:'roughness'});
  assert.ok(Number.isFinite(slopeGrid.costs[slopeGrid.indexOf(gap)]));
  assert.equal(roughGrid.costs[roughGrid.indexOf(gap)], Infinity);
  // A valid Horn result at the center does not give a four-neighbour path into it.
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    assert.equal(slopeGrid.costs[slopeGrid.indexOf({row:gap.row+dr,col:gap.col+dc})], Infinity);
  }
  const revised = plan.dispatch({type:'plan'});
  assert.equal(revised.previous.route.id,initial.route.id);
  assert.equal(revised.status,'Needs review');
  assert.equal(revised.route.vertices.length, 116);
  assert.notDeepEqual(revised.route.vertices, initial.route.vertices);
  assert.ok(revised.route.vertices.every(c => c.row !== gap.row || c.col !== gap.col));
  const initialPath = createProposedPath(dataset,fields,initial.route.vertices,null,{branch:'slope'});
  const revisedPath = createProposedPath(dataset,fields,revised.route.vertices,null,{branch:'slope'});
  assert.equal(routeMetrics(initialPath).terrainCost, null);
  assert.ok(Number.isFinite(routeMetrics(revisedPath).terrainCost));
  assert.deepEqual(routeCounts(initialPath), {
    slope:{within:39,exceeded:75,unavailable:2},
    roughness:{within:0,exceeded:108,unavailable:8},
  });
  assert.deepEqual(routeCounts(revisedPath), {
    slope:{within:48,exceeded:68,unavailable:0},
    roughness:{within:4,exceeded:88,unavailable:24},
  });
  // Compare the proposal with its own independent survey too. Later lidar
  // support counts do not become attributes of the earlier DSM.
  const earlier = {
    id:dataset.id+':proposal',W:dataset.W,H:dataset.H,res:dataset.res,
    heights:Array.from(dataset.proposalHeights),
    origins:dataset.proposalHeights.map(h => Number.isFinite(h) ? 'undocumented' : 'absent'),
  };
  const earlierPath = createProposedPath(earlier,fieldsFor(earlier),proposal.vertices,null,{branch:'slope'});
  assert.deepEqual(routeCounts(earlierPath), {
    slope:{within:50,exceeded:66,unavailable:0},
    roughness:{within:7,exceeded:108,unavailable:1},
  });
  assert.equal(plan.dispatch({type:'approve'}).approval.routeId,revised.route.id);
});

test('the incident-day route starts with eight slope inputs and two unmapped roughness inputs on the same DSM', async t=>{
  t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(new URL(url))));
  const dataset=await loadTerrain('atami','july3-dsm');
  const fields=fieldsFor(dataset);
  const plan=createSupervisoryPlan(dataset,fields,{start:dataset.proposalStart,goal:dataset.proposalGoal,branch:'slope',limits});
  const planned=plan.dispatch({type:'plan'});
  assert.equal(planned.route.vertices.length,116);
  assert.deepEqual(planned.route.vertices[0],{row:15,col:42});
  const cell=cellCoordinates(layerGrid(dataset,{grid:'analysis'}),{east:52142.5,north:-97236.5});
  const session=createSession(dataset);
  const select=layerId=>session.dispatch({type:'path-select',pathId:planned.route.id,index:0,layerId,cell});
  const slope=select('slope');
  assert.ok(Math.abs(slope.record.value-41.41828)<0.0001);
  assert.ok(Math.abs(slope.heightHere.height-399.27890)<0.0001);
  assert.ok(slope.sources.length===8 && slope.sources.every(s=>s.dsmSampleCount>0 && !('groundCount' in s)));
  const rough=select('roughness');
  assert.equal(rough.record.available,false);
  assert.equal(rough.sources.length,25);
  assert.deepEqual(rough.sources.filter(s=>s.height===null).map(s=>[s.row,s.col,s.dsmSampleCount]),[[13,43,0],[13,44,0]]);
  for(const [layer,expected] of [['slope',0],['roughness',2]]){
    const map=createSurfaceMap(dataset,fields,layer,{gaps:true});
    assert.ok(map.showLidarGaps);
    assert.equal(sampleSurfaceMap(map,planned.route.vertices[0]).missingHeights,expected);
  }
  const gap=session.dispatch({type:'input',layerId:'heights',cell:{row:13,col:43}});
  assert.equal(gap.heightHere.height,null);
  assert.equal(gap.heightHere.dsmSampleCount,0);
  assert.equal(dataset.groundCounts,undefined);
  assert.ok(gap.comparisonHeight);
  const grid=createPlanningGrid(dataset,fields,[],{branch:'roughness'});
  assert.equal(grid.costs[grid.indexOf(planned.route.vertices[0])],Infinity);
});
