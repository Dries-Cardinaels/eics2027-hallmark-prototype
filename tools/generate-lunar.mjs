// Rebuild the committed fixture using the actual local LunarBlock modules. Node >=22.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { terrainImage } from './terrain-image.mjs';
import { fullLunarScene } from './full-lunar-scene.mjs';
import { planBoundedGaps } from './bounded-gap-fill.mjs';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv.find(a => a.startsWith('--source='))?.slice(9) || resolve(root, '../../../tmp/lunar-block'));
const load = name => import(pathToFileURL(resolve(source, 'src', name)));
const { observe } = await load('observe.js');
const { produce, fillGaps, FILL_PASSES } = await load('produce.js');
const ST = await load('stereo.js');
const { REASON_TEXT, MATCH } = ST;
const full = await fullLunarScene(source,{spires:false});
full.api.obs.width = 0.8;
const maxFillDistance_m = 4;
const hmSettings = {res:full.api.opts.dtm,smooth:full.api.hm.smooth,sigmaFactor:full.api.hm.sigmaFactor,rocks:full.api.hm.rocks,deliver:'conf'};
const ideal = await full.api.buildHeightmap({...hmSettings,deliver:'ideal'});
const truth = ideal.data, {W:n,res} = ideal, {seed} = full.api.opts, site = full.api.siteInfo();
const settings = {seed,n,res,scene:{...full.api.opts},sceneSelection:full.scene.selection,heightmap:hmSettings,
  oversampling:ideal.m,smoothingSigma_m:ideal.sigma,
  sunAzimuth_deg:full.api.obs.sunAz,stripWidthFraction:full.api.obs.width,camera:full.api.obs.camera,
  fillPasses:FILL_PASSES,fillPolicy:{maxDistance_m:maxFillDistance_m,distance:'four-neighbour path through covered posts to an original stereo match',outsideCoverage:'left absent'},stereoSearchHalf_m:MATCH.searchHalf,referenceElevation_m:site.datum,
  localDatum_m:site.datum,sceneToLocalHeight_m:ideal.offset-site.datum};
const local = v => Number.isFinite(v) ? v-site.datum : null;
const sourceHashes = Object.fromEntries(['main.js','world.js','fields.js','dtm.js','dtm-worker.js','detail-worker.js','observe.js','stereo.js','produce.js','produce-worker.js'].map(f=>
  [f, createHash('sha256').update(readFileSync(resolve(source,'src',f))).digest('hex')]));
const datasets = [], audits = [], images = [];
for (const sunElevDeg of [5,25]) {
  full.api.obs.sunEl=sunElevDeg;
  const built=await full.api.buildHeightmap(hmSettings);
  const masks = observe({ heights: truth, n, res, strips:built.delivery.strips,
    sunElevDeg, sunAzDeg: settings.sunAzimuth_deg, hRef: settings.referenceElevation_m, seed, camera:ST.CAMERA[settings.camera] });
  const original = produce({ truth, W:n, H:n, res, masks, option:'conf' });
  assert.deepEqual(built.data,original.data,'original scene builder and independent producer replay must agree');
  assert.deepEqual(built.truth.matched,masks.matched);
  assert.deepEqual(built.truth.data,truth,'changing sunlight must not regenerate terrain');
  // Keep the original worker/matcher, but explicitly bound the exported delivery's
  // fill eligibility. Run filling again from original matches, not unbounded fills.
  const {fill,distance_m} = planBoundedGaps({matched:masks.matched,inOverlap:masks.inOverlap,W:n,H:n,res,maxDistance_m:maxFillDistance_m});
  const bounded = Float32Array.from(masks.height, (v,k)=>masks.matched[k] ? v : NaN);
  fillGaps(bounded,n,n,fill);
  const withoutTruth = produce({ truth:new Float32Array(n*n).fill(999), W:n,H:n,res,masks,option:'conf' });
  assert.deepEqual(withoutTruth.data,original.data, 'truth must only grade, never produce heights');
  const delivered = {data:bounded,conf:Uint8Array.from(original.conf,(c,k)=>Number.isFinite(bounded[k])?c:0)};
  const origins = Array.from(delivered.data,(v,k)=>!Number.isFinite(v) ? 'absent' : masks.matched[k] ? 'observed' : 'interpolated');
  const counts = Object.fromEntries(['observed','interpolated','absent'].map(o=>[o,origins.filter(v=>v===o).length]));
  for(let k=0;k<n*n;k++) {
    if (!masks.matched[k]) assert.equal(Number.isFinite(delivered.data[k]),Boolean(fill[k]));
    if (origins[k]==='interpolated') assert.ok(masks.inOverlap[k] && !masks.matched[k] && distance_m[k]<=maxFillDistance_m);
    if (masks.matched[k]) assert.equal(delivered.data[k],masks.height[k]);
  }
  const shadowFilled=origins.filter((o,k)=>o==='interpolated'&&masks.reason[k]===1).length;
  const absentByReason={outsideCoverage:0,beyondFillLimit:0};
  origins.forEach((o,k)=>{if(o==='absent')absentByReason[masks.inOverlap[k]?'beyondFillLimit':'outsideCoverage']++;});
  const id = sunElevDeg===5 ? 'lunar-low-sun' : 'lunar-high-sun';
  const visual = terrainImage(ST,truth,settings,sunElevDeg);
  // Ask the acquisition pipeline for its fine shadow field without rerunning matches.
  const acquisitionSurface = ST.observeImages({heights:truth,n,res,covers:[],pairs:[],keepImages:true,
    sunElevDeg,sunAzDeg:settings.sunAzimuth_deg,hRef:settings.referenceElevation_m,seed});
  assert.deepEqual(visual.shadow,acquisitionSurface.shadowFine,'display and acquisition must use identical cast shadows');
  images.push([`figures/${id}-terrain.png`,visual.bytes]);
  const {image:previewImage, ...terrainMetadata}=visual.record;
  datasets.push({ id, title:`LunarBlock · ${sunElevDeg}° sun`, synthetic:true, W:n,H:n,res,
    description:`LunarBlock simulation · ${n*res} × ${n*res} m · seed ${seed} · ${sunElevDeg}° sun · ${counts.interpolated} gap-filled (${shadowFilled} shadow-related) · ${counts.absent} absent.`,
    heights:Array.from(delivered.data,local),origins,terrain:terrainMetadata,
    acquisition:{ reasons:Array.from(masks.reason), reasonText:REASON_TEXT, matchedHeights:Array.from(masks.height,(v,k)=>masks.matched[k]?local(v):null),
      inOverlap:Array.from(masks.inOverlap), fillDistance_m:Array.from(distance_m,d=>Number.isFinite(d)?d:null), fillPolicy:settings.fillPolicy, absentByReason, confidence:Array.from(delivered.conf), sunElevation_deg:sunElevDeg,
      fillMethod:`Fill posts within ${maxFillDistance_m} m of an original stereo match (four-neighbour distance); nearest-match seeding + ${FILL_PASSES} smoothing passes; other posts remain absent`,counts,shadowFilled },
  });
  const meanAbsoluteError_m=Object.fromEntries(['observed','interpolated'].map(origin=>{
    const errors=origins.flatMap((o,k)=>o===origin?[Math.abs(delivered.data[k]-truth[k])]:[]);
    return [origin,errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null];
  }));
  audits.push({id,observationCounts:masks.count,absentByReason,meanAbsoluteError_m});
  console.log(`${id}: ${JSON.stringify({counts,shadowFilled,absentByReason})}`);
}
// Pick reproducible, valid interior examples from actual provenance, not painted regions.
const low=datasets[0], candidates=[];
for(let r=2;r<n-2;r++) for(let c=2;c<n-2;c++) {
  const keys=[]; for(let dr=-2;dr<=2;dr++) for(let dc=-2;dc<=2;dc++) keys.push((r+dr)*n+c+dc);
  if(keys.some(k=>low.origins[k]==='absent'))continue;
  const inner=keys.filter(k=>Math.abs(Math.floor(k/n)-r)<=1&&Math.abs(k%n-c)<=1);
  const shadows=keys.filter(k=>low.acquisition.reasons[k]===1).length;
  candidates.push({r,c,shadows,roughOnly:inner.every(k=>low.origins[k]==='observed')&&shadows>0,
    shadowCentre:low.acquisition.reasons[r*n+c]===1,observedCentre:low.origins[r*n+c]==='observed'});
}
const focus=candidates.filter(c=>c.shadowCentre && c.shadows<25 && datasets[1].origins[c.r*n+c.c]==='observed').sort((a,b)=>b.shadows-a.shadows)[0];
const boundary=candidates.filter(c=>c.roughOnly).sort((a,b)=>b.shadows-a.shadows)[0];
assert.ok(focus&&boundary,'scene must demonstrate shadow filling and different branch footprints');
const bookmarks=[
  {id:'lunar-shadow',title:'LunarBlock · shadow gap filled',dataset:low.id,cell:{row:focus.r-2,col:focus.c-2},node:'combined',mode:'assessment',note:'The centre height was too dark to match and was filled from recovered heights.'},
  {id:'lunar-sun-comparison',title:'LunarBlock · same location, higher sun',dataset:datasets[1].id,cell:{row:focus.r-2,col:focus.c-2},node:'combined',mode:'assessment',note:'The same terrain and location with a 25° sun; observation and filling are rerun.'},
  {id:'lunar-shadow-boundary',title:'LunarBlock · shadow through roughness only',dataset:low.id,cell:{row:boundary.r-2,col:boundary.c-2},node:'combined',mode:'origins',note:'All nine slope inputs are matched; roughness additionally reads heights filled after shadow-related matching failures.'},
];
assert.equal(full.jobs.length,1,'both deliveries reuse the same original heightmap job');
const jsonArrays = (_,v) => ArrayBuffer.isView(v) ? Array.from(v) : v;
const workerJob=JSON.stringify(full.jobs[0],jsonArrays);
const metadata={generator:'tools/generate-lunar.mjs',settings,sourceHashes,fillPolicySourceHash:createHash('sha256').update(readFileSync(resolve(root,'tools/bounded-gap-fill.mjs'))).digest('hex'),
  scene:{hash:full.scene.sceneHash,geometry:full.scene.geometry,threeVersion:full.scene.threeVersion,
    options:full.scene.options,selection:full.scene.selection,detail:full.scene.detail,geometryFile:'fixtures/lunar-scene.json.gz',
    heightmapJobHash:createHash('sha256').update(workerJob).digest('hex')},
  provenance:'Original main.js generate() executes with Three.js; spire meshes are removed before the original buildHeightmap() samples the scene; original dtm-worker samples the reference and produce-worker runs stereo acquisition. The export reapplies original filling from stereo matches with an explicit 4 m eligibility limit. Origins follow actual bounded match/fill records.',
  scope:'Generated terrain mesh, ordinary boulders, pebbles and detail normal field; spires explicitly excluded before heightmap generation. Rover, decorative base, UI and original material styling are omitted from the scientific preview. This is simulated terrain, not measured lunar data.',
  coordinates:'Exported scene positions are east, height, south in metres. Add sceneToLocalHeight_m to scene height; subtract localDatum_m from ideal and delivered heights. Plot north = -south. No independent rescaling or vertical fitting.'};
const bundle={metadata,datasets,bookmarks};
const files = [
  ...images,
  ['fixtures/lunar-scene.json.gz',gzipSync(Buffer.from(JSON.stringify({...full.scene,sceneToLocalHeight_m:settings.sceneToLocalHeight_m})))],
  ['fixtures/lunar-detail-normals.bin.gz',gzipSync(full.detailNormals)],
  ['fixtures/lunar-heightmap-job.json.gz',gzipSync(Buffer.from(workerJob))],
  ['src/fixtures/lunar-data.js', `// Generated by tools/generate-lunar.mjs; do not hand-edit. Nonfinite heights are serialized as null.\nexport const LUNAR_DATA = ${JSON.stringify(bundle)};\n`],
  ['fixtures/lunar-audit.json',JSON.stringify({metadata,truth:Array.from(truth,local),deliveries:audits},null,2)+'\n'],
];
for(const [path,content] of files) {
  const target=resolve(root,path);
  if(process.argv.includes('--check')) assert.deepEqual(readFileSync(target),Buffer.from(content),`${path} must reproduce exactly`);
  else {mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);}
}
console.log(JSON.stringify({checked:process.argv.includes('--check'),deliveries:datasets.map(d=>({id:d.id,...d.acquisition.counts,shadowFilled:d.acquisition.shadowFilled})),bookmarks},null,2));
