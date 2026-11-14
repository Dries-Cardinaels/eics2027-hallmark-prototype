// Acceptance checks for the prototype core and fixtures. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, query, graphPaths, declaredSourceIndices, createPipeline, DEFAULT_LIMITS, MARGIN } from '../src/core/index.js';
import { DATASETS, BOOKMARKS, datasetById, surface, RES, W, H, NORTH_EDGE, INTERPOLATED, ABSENT_CELL } from '../src/fixtures/terrain.js';

const ref = evaluate(datasetById('reference'));
const bookmark = (id) => BOOKMARKS.find(b => b.id === id);
const at = (ev, id) => query(ev, 'combined', bookmark(id).cell);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const key = (c) => `${c.row},${c.col}`;

// Independent window: height-grid positions of the (2k+1)² window around an analysis cell.
const window = (cell, k) => { const out = []; for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) out.push({ row: cell.row + MARGIN + dr, col: cell.col + MARGIN + dc }); return out; };

test('observed slope branch and interpolated roughness branch remain distinguishable', () => {
  const q = at(ref, 'focus');
  assert.equal(query(ref, 'heights', q.centreHeightCell).origin.declared, 'observed', 'the focus cell itself is observed');
  assert.deepEqual(q.branches.slope.origin.counts, { observed: 8, interpolated: 0, undocumented: 0, absent: 0 });
  assert.equal(q.branches.slope.origin.headline, 'observed');
  assert.equal(q.branches.roughness.origin.headline, 'interpolated');
  assert.equal(q.branches.roughness.origin.counts.interpolated, 1);
  assert.equal(q.branches.slope.outcome, 'not-exceeded');
  assert.equal(q.branches.roughness.outcome, 'exceeded');
  assert.equal(q.category, 'unmet');
});

test('combined origin summary reports interpolation without relabelling both branches', () => {
  const q = at(ref, 'focus');
  assert.equal(q.origin.headline, 'interpolated');
  assert.equal(q.origin.text, 'Includes interpolation through the height spread branch');
  assert.equal(query(ref, 'slope', q.cell).origin.headline, 'observed', 'slope node keeps its own summary');
  assert.equal(query(ref, 'slope-criterion', q.cell).origin.headline, 'observed');
  const both = at(ref, 'slope-branch');
  assert.equal(both.origin.text, 'Includes interpolation through the slope and height spread branches');
});

test('all four complete assessment combinations are represented and correct', () => {
  ref.records.combined.forEach((rec,k)=>{
    const outcomes=['slope','roughness'].map(n=>ref.records[n+'-criterion'][k].outcome);
    assert.equal(rec.category,outcomes.includes('unavailable')?'incomplete':outcomes.includes('exceeded')?'unmet':'neither');
  });
});

test('unavailable branches produce an explicitly incomplete assessment that keeps the available branch', () => {
  const ev = evaluate(datasetById('missing')), q = at(ev, 'absent');
  assert.equal(q.category, 'incomplete');
  assert.equal(q.outcomes.slope,'not-exceeded'); assert.equal(q.outcomes.roughness,'unavailable');
  assert.equal(q.branches.slope.value, at(ref, 'focus').branches.slope.value, 'slope value retained unchanged');
  assert.equal(q.branches.roughness.value, null);
  assert.deepEqual(q.boundaries.missing, [{ row: ABSENT_CELL[0], col: ABSENT_CELL[1], branches: ['roughness'] }]);
  // Exactly the cells whose windows contain the absent height are affected, each branch separately.
  ev.records.combined.forEach((rec, k) => {
    const cell = { row: Math.floor(k / (W - 2 * MARGIN)), col: k % (W - 2 * MARGIN) }, has = (n) => window(cell, n).filter((_, i) => n !== 1 || i !== 4).some(p => p.row === ABSENT_CELL[0] && p.col === ABSENT_CELL[1]);
    assert.equal(rec.category === 'incomplete', Object.values(rec.outcomes).includes('unavailable'));
    assert.equal(rec.outcomes.slope === 'unavailable', has(1));
    assert.equal(rec.outcomes.roughness === 'unavailable', has(2));
  });
});

test('changing limits changes criterion outcomes, not terrain values or origins', () => {
  const q0 = at(ref, 'focus');
  const ev = evaluate(datasetById('reference'), { slopeDeg: 2, roughness_m: 0.5 });
  for (const node of ['heights', 'slope', 'roughness']) {
    ref.records[node].forEach((rec, k) => {
      assert.equal(ev.records[node][k].value, rec.value);
      // Records hold values only; source heights and origins come from the query's walk back.
      for (const field of ['sources', 'origin', 'quality']) assert.equal(field in ev.records[node][k], false);
    });
  }
  const q1 = at(ev, 'focus');
  assert.equal(q1.outcomes.slope,'exceeded'); assert.equal(q1.outcomes.roughness,'not-exceeded');
  assert.equal(q1.category, 'unmet');
  assert.deepEqual(q1.branches.slope.origin, q0.branches.slope.origin);
  assert.deepEqual(q1.branches.roughness.origin, q0.branches.roughness.origin);
  assert.deepEqual(q1.origin, q0.origin);
});

test('a value equal to its limit does not exceed it', () => {
  const v = at(ref, 'focus').branches.roughness.value;
  assert.equal(at(evaluate(datasetById('reference'), { ...DEFAULT_LIMITS, roughness_m: v }), 'focus').branches.roughness.outcome, 'not-exceeded');
  assert.equal(at(evaluate(datasetById('reference'), { ...DEFAULT_LIMITS, roughness_m: v - 1e-12 }), 'focus').branches.roughness.outcome, 'exceeded');
});

test('graph paths and source cells match the declared footprints', () => {
  const pipeline = ref.pipeline, q = at(ref, 'focus');
  assert.deepEqual(graphPaths(pipeline, 'combined'), [
    ['heights', 'slope', 'slope-criterion', 'combined'],
    ['heights', 'roughness', 'roughness-criterion', 'combined'],
  ]);
  assert.deepEqual(q.paths.map(p => p.nodes), graphPaths(pipeline, 'combined'));
  const slopeSteps = q.paths.find(p => p.branch === 'slope').steps, roughSteps = q.paths.find(p => p.branch === 'roughness').steps;
  assert.deepEqual(slopeSteps[0].cells.map(key).sort(), window(q.cell, 1).filter((_, i) => i !== 4).map(key).sort());
  assert.deepEqual(roughSteps[0].cells.map(key).sort(), window(q.cell, 2).map(key).sort());
  assert.deepEqual(query(ref, 'slope', q.cell).immediateInputs[0].cells.map(key).sort(), window(q.cell, 1).filter((_, i) => i !== 4).map(key).sort());
  assert.deepEqual(query(ref, 'slope', q.cell).paths.map(p => p.nodes), [['heights', 'slope']]);
  // Every result's walk back reaches exactly its declared windows.
  ref.records.combined.forEach((_, k) => {
    const cell = { row: Math.floor(k / (W - 2 * MARGIN)), col: k % (W - 2 * MARGIN) }, walk = node => declaredSourceIndices(ref, node, k);
    assert.deepEqual(walk('combined'),[...new Set(['slope','roughness'].flatMap(walk))].sort((a,b)=>a-b));
    assert.deepEqual(walk('slope'), window(cell, 1).filter((_, i) => i !== 4).map(p => p.row * W + p.col).sort((a, b) => a - b));
  });
});

test('shared source cells are deduplicated without losing either path', () => {
  const q = at(ref, 'focus');
  const supports=Object.fromEntries(['slope','roughness'].map(n=>[n,new Set(query(ref,n,q.cell).sourceCells.map(c=>c.index))]));
  const union=new Set(Object.values(supports).flatMap(set=>[...set]));
  assert.equal(q.sourceCells.length,union.size);
  for(const c of q.sourceCells) assert.deepEqual(c.branches,Object.keys(supports).filter(n=>supports[n].has(c.index)));
  assert.equal(q.sharedSourceCellCount,q.sourceCells.filter(c=>c.branches.length>1).length);
  assert.equal(q.paths.length,2);assert.equal(q.origin.total,union.size);
});

test('numerical results match independently worked examples', () => {
  // (a) A plane z = 0.2·x on a 5 × 5 grid at 0.25 m: slope = atan(0.2), roughness = 0.2 · 0.25 · √2.
  const plane = { id: 'plane', W: 5, H: 5, res: 0.25, heights: [], origins: Array(25).fill('observed') };
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) plane.heights.push(0.2 * c * 0.25);
  const ev = evaluate(plane);
  close(ev.records.slope[0].value, 11.309932474020215);
  close(ev.records.roughness[0].value, 0.07071067811865477);
  // (b) The focus cell, from the closed-form surface with Horn's weights written out here.
  const q = at(ref, 'focus'), { row, col } = q.centreHeightCell;
  const z = (dr, dc) => +surface((col + dc + 0.5) * RES, NORTH_EDGE - (row + dr + 0.5) * RES).toFixed(4);
  const dzdx = ((z(-1, 1) + 2 * z(0, 1) + z(1, 1)) - (z(-1, -1) + 2 * z(0, -1) + z(1, -1))) / (8 * RES);
  const dzdy = ((z(1, -1) + 2 * z(1, 0) + z(1, 1)) - (z(-1, -1) + 2 * z(-1, 0) + z(-1, 1))) / (8 * RES);
  close(q.branches.slope.value, Math.atan(Math.sqrt(dzdx ** 2 + dzdy ** 2)) * 180 / Math.PI);
  const zs = []; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) zs.push(z(dr, dc));
  const mean = zs.reduce((a, b) => a + b) / 25;
  close(q.branches.roughness.value, Math.sqrt(zs.reduce((a, b) => a + (b - mean) ** 2, 0) / 25));
  // The demonstration needs a clear margin either side of the default limits.
  assert.ok(q.branches.slope.value < 10 && q.branches.roughness.value > 0.16);
});

test('bookmarks demonstrate what their notes claim', () => {
  const interp = new Set(INTERPOLATED.map(([r, c]) => `${r},${c}`));
  const f = at(ref, 'focus').cell;
  assert.ok(window(f, 1).every(p => !interp.has(key(p))), 'focus 3×3 excludes interpolation');
  assert.ok(window(f, 2).some(p => interp.has(key(p))), 'focus 5×5 includes interpolation');
  assert.ok(window(bookmark('slope-branch').cell, 1).some(p => interp.has(key(p))));
  const u = at(evaluate(datasetById('undocumented')), 'undocumented');
  assert.ok(u.boundaries.undocumented.length > 0);
  assert.ok(u.branches.slope.origin.counts.undocumented > 0 && u.branches.roughness.origin.counts.undocumented > 0);
  assert.match(u.origin.text, /undocumented history through the slope and height spread branches/);
});

test('evaluation is deterministic and query records are plain data', () => {
  for (const ds of DATASETS) {
    assert.ok(ds.synthetic || (ds.source && ds.quality));
    const a = evaluate(ds), b = evaluate(datasetById(ds.id));
    assert.deepEqual(a.records, b.records);
  }
  const q = at(ref, 'focus');
  assert.deepEqual(JSON.parse(JSON.stringify(q)), q);
});


test('larger terrain has coherent interpolated interiors and distinct boundary support', () => {
  const ds = datasetById('reference');
  assert.equal(ds.W, 32); assert.equal(ds.H, 32);
  assert.equal(ds.W * ds.res, 8); assert.equal(ds.H * ds.res, 8);
  const n = ds.origins.filter(o => o === 'interpolated').length;
  assert.ok(n > ds.origins.length * .25 && n < ds.origins.length * .35);
  assert.equal(new Set(INTERPOLATED.map(([r,c]) => `${r},${c}`)).size, n);
  for (const id of ['interpolated-interior','southern-patch']) {
    const q = at(ref,id);
    assert.equal(q.branches.slope.origin.counts.interpolated,8);
    assert.equal(q.branches.roughness.origin.counts.interpolated,25);
    assert.ok(q.sourceCells.length>=25);
  }
  const edge = at(ref,'wide-regions');
  assert.equal(edge.branches.slope.origin.counts.interpolated,0);
  assert.equal(edge.branches.roughness.origin.counts.interpolated,4);
  const strip = at(ref,'narrow-strip');
  assert.ok(strip.branches.slope.origin.counts.interpolated > 0);
  assert.ok(strip.branches.slope.origin.counts.observed > 0);
  assert.ok(strip.branches.roughness.origin.counts.interpolated > strip.branches.slope.origin.counts.interpolated);
});
