import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,query,declaredSourceIndices,DEFAULT_LIMITS} from '../src/core/index.js';
import {ILLUMINATION_PERIOD,illuminationGeometry,calculateIllumination} from '../src/core/illumination.js';
import {DATASETS} from '../src/fixtures/terrain.js';
function terrain(samples=[{hour:.5,weightHours:1,azimuthDeg:90,elevationDeg:10}]) {
 return {id:'test',W:9,H:9,res:1,heights:Array(81).fill(0),origins:Array(81).fill('observed'),quality:{kind:'published',codes:Array(81).fill(14)},illuminationPeriod:{id:'test',label:'Test period',durationHours:samples.reduce((a,s)=>a+s.weightHours,0),boundary:'crop only',samples}};
}
const cell=12,center=40; // analysis (2,2), height (4,4)
function result(ds){const g=illuminationGeometry(ds,cell);return calculateIllumination(ds,cell,g.sources.map(i=>Number.isFinite(ds.heights[i])?ds.heights[i]:null));}
test('flat terrain is sunlit; a known east ridge blocks east but not west',()=>{
 const ds=terrain([{hour:.5,weightHours:1,azimuthDeg:90,elevationDeg:10},{hour:1.5,weightHours:1,azimuthDeg:270,elevationDeg:10}]);
 assert.equal(result(ds).value,100);
 ds.heights[42]=1;
 const r=result(ds);assert.equal(r.value,50);
 assert.deepEqual(r.illumination.samples.map(s=>s.status),['shadowed','illuminated']);
 assert.deepEqual(r.illumination.samples[0].sources,[40,41,42,43,44]);
 assert.deepEqual(r.illumination.samples[1].sources,[40,39,38,37,36]);
 ds.heights[42]=2*Math.tan(10*Math.PI/180)+1e-10;
 assert.equal(result(ds).illumination.samples[0].status,'shadowed');
});
test('quality and interpolation stay separate per time sample, independent of calculated values',()=>{
 const ds=terrain([{hour:.5,weightHours:1,azimuthDeg:90,elevationDeg:10},{hour:1.5,weightHours:1,azimuthDeg:270,elevationDeg:10}]);
 ds.heights[42]=1;ds.quality.codes[42]=3;ds.origins[38]='interpolated';
 const r=result(ds),[east,west]=r.illumination.samples;
 assert.equal(east.suspicious,1);assert.equal(east.interpolated,0);
 assert.equal(west.suspicious,0);assert.equal(west.interpolated,1);
 assert.equal(r.illumination.suspiciousSamples,1);assert.equal(r.illumination.interpolatedSamples,1);
 ds.quality.codes.fill(14);ds.origins.fill('observed');
 assert.equal(result(ds).value,r.value);
});
test('missing ray inputs remain unknown and cannot be silently treated as clear sky',()=>{
 const ds=terrain([{hour:.5,weightHours:1,azimuthDeg:90,elevationDeg:10},{hour:1.5,weightHours:1,azimuthDeg:270,elevationDeg:10}]);
 ds.heights[42]=NaN;ds.origins[42]='absent';
 const r=result(ds);assert.equal(r.available,false);assert.equal(r.value,null);
 assert.equal(r.illumination.lowerPercent,50);assert.equal(r.illumination.upperPercent,100);
 const ev=evaluate(ds);assert.equal(ev.records['illumination-criterion'][cell].outcome,'unavailable');
 assert.equal(ev.records.combined[cell].category,'incomplete');
});
test('below-horizon Sun needs no terrain heights, and minimum criterion accepts equality',()=>{
 const ds=terrain([{hour:.5,weightHours:1,azimuthDeg:90,elevationDeg:-5}]);
 ds.heights.fill(NaN);ds.origins.fill('absent');
 const r=result(ds);assert.equal(r.value,0);assert.deepEqual(r.illumination.samples[0].sources,[]);
 const flat=terrain();
 assert.equal(evaluate(flat,{...DEFAULT_LIMITS,illuminationMinPercent:100}).records['illumination-criterion'][cell].outcome,'not-exceeded');
 flat.heights[42]=1;
 assert.equal(evaluate(flat).records['illumination-criterion'][cell].outcome,'exceeded');
});
test('period is weighted and sample dependencies deduplicate exactly into Combined',()=>{
 const ds=terrain([{hour:.5,weightHours:1,azimuthDeg:90,elevationDeg:10},{hour:2,weightHours:3,azimuthDeg:270,elevationDeg:10}]);ds.heights[42]=1;
 assert.equal(result(ds).value,75);
 const ev=evaluate(ds),q=query(ev,'combined',cell);
 assert.deepEqual(Object.keys(q.branches),['slope','roughness','illumination']);
 const union=new Set(['slope','roughness','illumination'].flatMap(n=>declaredSourceIndices(ev,n,cell)));
 assert.deepEqual(q.sourceCells.map(c=>c.index),[...union].sort((a,b)=>a-b));
 assert.equal(q.branches.illumination.illumination.samples.length,2);
 assert.equal(query(ev,'illumination-criterion',cell).illumination.illuminatedHours,3);
});
test('supplied Sun samples must cover the defined period',()=>{
 const ds=terrain();ds.illuminationPeriod.durationHours=2;
 assert.throws(()=>result(ds),/weights must cover/);
});
test('real fixtures retain per-time raw evidence with counts reproducible from original cells',()=>{
 for(const id of ['lroc-nassau02','lunar-low-sun']) {
  const ds={...DATASETS.find(d=>d.id===id),illuminationPeriod:ILLUMINATION_PERIOD},ev=evaluate(ds),rec=ev.records.illumination[11*(ds.W-4)+18];
  for(const sample of rec.illumination.samples) {
   assert.equal(sample.interpolated,ds.originDeclaration?.status==='not-supplied'?null:sample.sources.filter(i=>ds.origins[i]==='interpolated').length);
   assert.equal(sample.suspicious,ds.quality?sample.sources.filter(i=>ds.quality.codes[i]===3).length:null);
  }
  const union=[...new Set(rec.illumination.samples.flatMap(s=>s.sources))].sort((a,b)=>a-b);
  const walked=declaredSourceIndices(ev,'illumination',11*(ds.W-4)+18);
  assert.deepEqual(walked,union);
  assert.ok(walked.includes((11+2)*ds.W+18+2));
 }
});
test('a known blocker proves shadow without inventing missing heights beyond it',()=>{
 const ds=terrain();ds.heights[41]=2;ds.heights[43]=NaN;ds.origins[43]='absent';
 const r=result(ds);assert.equal(r.value,0);assert.equal(r.illumination.samples[0].status,'shadowed');
 assert.equal(r.illumination.samples[0].missing,1);
 ds.heights[40]=NaN;ds.origins[40]='absent';
 assert.equal(result(ds).available,false,'missing target height prevents the relative-angle test');
});
test('limit edits reuse illumination, while changed terrain or evidence invalidates it',()=>{
 const ds=terrain(),a=evaluate(ds),b=evaluate(ds,{...DEFAULT_LIMITS,illuminationMinPercent:80});
 assert.equal(a.records.illumination,b.records.illumination);
 ds.heights[42]=1;const c=evaluate(ds);
 assert.notEqual(c.records.illumination,b.records.illumination);
 assert.equal(c.records.illumination[cell].value,0);
 ds.quality.codes[42]=3;const d=evaluate(ds);
 assert.notEqual(c.records.illumination,d.records.illumination);
 assert.equal(d.records.illumination[cell].illumination.samples[0].suspicious,1);
 ds.illuminationPeriod.samples[0].azimuthDeg=270;const e=evaluate(ds);
 assert.equal(e.records.illumination[cell].value,100);
});
