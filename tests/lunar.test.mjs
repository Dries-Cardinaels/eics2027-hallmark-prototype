import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync, gunzipSync } from 'node:zlib';
import { LUNAR_DATASETS, LUNAR_METADATA, BOOKMARKS } from '../src/fixtures/terrain.js';
import { createHash } from 'node:crypto';
import { evaluate, query } from '../src/core/index.js';

test('terrain images are valid aligned rasters with geometric shadow coverage', () => {
  for(const ds of LUNAR_DATASETS) {
    const terrain=ds.terrain, image=readFileSync(new URL(`../figures/${ds.id}-terrain.png`,import.meta.url));
    assert.equal(terrain.image,undefined,'preview images must not enter the initial dataset bundle');
    assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(image.readUInt32BE(16),ds.W*4);assert.equal(image.readUInt32BE(20),ds.H*4);
    assert.equal(terrain.emission_deg,0,'top-down view keeps cells aligned');
    assert.equal(terrain.sunElevation_deg,ds.acquisition.sunElevation_deg);
    assert.equal(terrain.sunAzimuth_deg,LUNAR_METADATA.settings.sunAzimuth_deg);
    const idat=[];
    for(let p=8;p<image.length;) {
      const length=image.readUInt32BE(p),type=image.toString('ascii',p+4,p+8);
      if(type==='IDAT')idat.push(image.subarray(p+8,p+8+length));
      p+=length+12;
    }
    const pixels=inflateSync(Buffer.concat(idat));
    assert.equal(pixels.length,(terrain.width+1)*terrain.height);
    const samples=[...pixels].filter((_,i)=>i%(terrain.width+1)!==0);
    assert.ok(Math.max(...samples)-Math.min(...samples)>80,'image must contain visible illumination contrast');
    assert.equal(terrain.shadowFraction.length,ds.W*ds.H);
    assert.ok(terrain.shadowFraction.every(f=>f>=0&&f<=1));
    assert.ok(terrain.shadowFraction.some(f=>f>0&&f<1),'shadow boundaries cross height cells');
    assert.ok(terrain.shadowFraction.some((f,k)=>(f>0)!==(ds.acquisition.reasons[k]===1)), 'geometric shadows and matching failures must remain distinct');
    assert.deepEqual(image,readFileSync(new URL(`../figures/${ds.id}-terrain.png`,import.meta.url)));
  }
});

test('LunarBlock delivery origins follow actual matching and filling records', () => {
  for (const ds of LUNAR_DATASETS) {
    assert.equal(ds.W,50); assert.equal(ds.H,50); assert.equal(ds.res,2);
    const a=ds.acquisition, counts={observed:0,interpolated:0,absent:0};
    let shadow=0;
    ds.heights.forEach((h,k)=>{
      const origin=ds.origins[k],reason=a.reasons[k]; counts[origin]++;
      if(reason===0) {
        assert.equal(origin,'observed'); assert.equal(h,a.matchedHeights[k]);
        assert.ok(a.confidence[k]>=10 && a.confidence[k]<=14);
      } else if(a.inOverlap[k] && a.fillDistance_m[k] !== null && a.fillDistance_m[k] <= a.fillPolicy.maxDistance_m) {
        assert.equal(origin,'interpolated'); assert.ok(Number.isFinite(h));
        assert.equal(a.matchedHeights[k],null,'no recovered height existed before filling');
      } else { assert.equal(origin,'absent'); assert.ok(Number.isNaN(h)); assert.equal(a.confidence[k],0); }
      if(reason===1 && origin==='interpolated') {shadow++;assert.equal(a.confidence[k],1);}
    });
    assert.deepEqual(counts,a.counts); assert.equal(shadow,a.shadowFilled);
    assert.ok(shadow>0 && counts.absent>0 && counts.observed>0);
    assert.equal(a.absentByReason.outsideCoverage,ds.origins.filter((o,k)=>o==='absent'&&!a.inOverlap[k]).length);
    assert.equal(a.absentByReason.beyondFillLimit,ds.origins.filter((o,k)=>o==='absent'&&a.inOverlap[k]).length);
    assert.ok(a.absentByReason.beyondFillLimit>0);
    for(let c=2;c<ds.W-2;c++) assert.ok(ds.origins.some((o,k)=>k%ds.W===c&&o!=='absent'),`interior column ${c} must not be an absent strip`);
  }
});

test('filled shadow heights are estimates, not relabelled ground truth', () => {
  const audit=JSON.parse(readFileSync(new URL('../fixtures/lunar-audit.json',import.meta.url)));
  assert.deepEqual(audit.metadata,LUNAR_METADATA);
  for(const ds of LUNAR_DATASETS) {
    const shadow=ds.heights.flatMap((h,k)=>ds.acquisition.reasons[k]===1 && ds.origins[k]==='interpolated' ? [Math.abs(h-audit.truth[k])] : []);
    assert.ok(shadow.filter(error=>error>.01).length>shadow.length*.8);
    // Bounded filling can still produce poor estimates. Verify reported errors;
    // reference truth must never repair the delivered heights.
    const errors=audit.deliveries.find(d=>d.id===ds.id).meanAbsoluteError_m;
    for(const origin of ['observed','interpolated']) {
      const measured=ds.heights.flatMap((h,k)=>ds.origins[k]===origin ? [Math.abs(h-audit.truth[k])] : []);
      const mae=measured.reduce((a,b)=>a+b,0)/measured.length;
      assert.ok(Math.abs(mae-errors[origin])<1e-8);
    }
  }
});

test('same terrain location changes from shadow fill to stereo match with higher sun', () => {
  const b=BOOKMARKS.find(b=>b.id==='lunar-shadow'), center={row:b.cell.row+2,col:b.cell.col+2};
  const low=query(evaluate(LUNAR_DATASETS[0]),'heights',center);
  const high=query(evaluate(LUNAR_DATASETS[1]),'heights',center);
  assert.equal(low.origin.declared,'interpolated');assert.equal(low.sourceCells[0].acquisition.reasonCode,1);
  assert.equal(high.origin.declared,'observed');assert.equal(high.sourceCells[0].acquisition.reasonCode,0);
  assert.match(low.boundaries.source,/individual interpolation donors are not expanded/);
  assert.deepEqual(JSON.parse(JSON.stringify(low)),low);
});

test('shadow filling can enter only through the larger roughness footprint', () => {
  const b=BOOKMARKS.find(b=>b.id==='lunar-shadow-boundary');
  const q=query(evaluate(LUNAR_DATASETS[0]),'combined',b.cell);
  assert.equal(q.branches.slope.origin.headline,'observed');
  assert.equal(q.branches.roughness.origin.headline,'interpolated');
  assert.ok(q.sourceCells.some(c=>c.acquisition.reasonCode===1 && c.branches.length===1 && c.branches[0]==='roughness'));
});


test('original full-scene geometry and heightmap job share seed, settings and rock triangles', () => {
  const scene=JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/lunar-scene.json.gz',import.meta.url))));
  const jobBytes=gunzipSync(readFileSync(new URL('../fixtures/lunar-heightmap-job.json.gz',import.meta.url)));
  const job=JSON.parse(jobBytes), m=LUNAR_METADATA;
  const signature=Object.fromEntries(['selection','options','relief','phases','hills','craters','small','ground','meshes'].map(k=>[k,scene[k]]));
  assert.equal(createHash('sha256').update(JSON.stringify(signature)).digest('hex'),m.scene.hash);
  assert.equal(scene.sceneHash,m.scene.hash);
  assert.equal(createHash('sha256').update(jobBytes).digest('hex'),m.scene.heightmapJobHash);
  assert.deepEqual(scene.options,m.settings.scene);
  assert.deepEqual(scene.selection,{spires:false,removedSpires:1});
  assert.deepEqual(scene.selection,m.settings.sceneSelection);
  assert.ok(scene.meshes.every(mesh=>mesh.kind!=='spire'),'spires are excluded from both scene and worker input');
  assert.equal(scene.options.seed,2217320);
  assert.equal(scene.options.area,100);
  assert.equal(job.small.seed,scene.options.seed);
  assert.equal(job.res,scene.options.dtm);
  assert.equal(job.W*job.res,scene.options.area);
  assert.equal(job.hillScale,scene.relief.hillScale);
  assert.equal(job.sceneOffset,scene.relief.offset);
  assert.deepEqual(job.phases,scene.phases);
  assert.equal(job.sigma,m.settings.smoothingSigma_m);
  assert.equal(scene.sourceMainHash,m.sourceHashes['main.js']);
  assert.equal(scene.threeVersion,'160');
  assert.deepEqual(scene.geometry,{groundVertices:68121,groundTriangles:135200,rockMeshes:73,pebbleMeshes:240,smallBoulderMeshes:0,dtmRockTriangles:5250});
  const tris=[];
  for(const mesh of scene.meshes.filter(m=>m.kind!=='small-boulder')) {
    for(const i of mesh.indices)tris.push(...mesh.positions.slice(i*3,i*3+3));
  }
  assert.deepEqual(Array.from(Float32Array.from(tris)),job.tris,'heightmap rasterizes these exact scene rocks and pebbles');
  scene.craters.forEach((c,k)=>assert.deepEqual(job.craters.slice(k*8,k*8+8),[c.x*job.mpu,c.z*job.mpu,c.r*job.mpu,c.depth*job.mpu,c.rim,c.p,c.w,c.reach2]));
  const normals=gunzipSync(readFileSync(new URL('../fixtures/lunar-detail-normals.bin.gz',import.meta.url)));
  assert.equal(normals.length,scene.detail.job.N**2*4);
  assert.equal(createHash('sha256').update(normals).digest('hex'),scene.detail.normalsHash);
  assert.equal(m.settings.stereoSearchHalf_m,120,'preserve original matcher search range');
  assert.equal(m.settings.stripWidthFraction,.8,'widen the two stereo footprints');
  assert.equal(m.settings.fillPolicy.maxDistance_m,4);
  assert.equal(m.scene.hash,'2d1693f0641dc9e2214ceb07f01d050cf0f16859f19b30d0c95e07dbd8e6d2d5','coverage changes must preserve the terrain');
});
