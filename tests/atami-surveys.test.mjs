import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareAtamiEditorData} from '../tools/prepare-atami-editor-data.mjs';
import {availableSurfaces,loadTerrain} from '../editor/data.js';
import {createSession} from '../editor/session.js';

const fixtures=new URL('../fixtures/earth/',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const array=(directory,file,Type)=>{
  const bytes=readFileSync(join(directory,file));
  return new Type(bytes.buffer,bytes.byteOffset,bytes.byteLength/Type.BYTES_PER_ELEMENT);
};

test('offline Atami preparation preserves the sources and original lidar products while counting every valid DSM sample',()=>{
  const out=mkdtempSync(join(tmpdir(),'hallmark-atami-'));
  const sourceFiles=['atami-20210706-ground-crop.las','atami-20210703-dsm-crop-10cm.f32','atami-imagery/atami-headscarp.jpg'];
  const before=sourceFiles.map(file=>digest(readFileSync(new URL(file,fixtures))));
  try {
    const catalog=prepareAtamiEditorData(out);
    const hashes={
      'atami-ground-1m-median.f32':'b40e15f77d1f4429e31ba3988c1155fd933a5f8ad42deadacdebeecd87030462',
      'atami-ground-counts.u16':'e5146d8fb2a559afd2bb415cebfe4bc04c96c6d4580d02617e0d1492b07726be',
      'atami-ground-rgb.u8':'63ed3df06a64152fbbd4e395f50caa83848dd028283342386cc77276f11f9e71',
      'atami-july03-dsm-1m-pixel-center-median.f32':'2cb9adddcef59261f3669966e2354537ab7b5e0a02f5e9bdfb5c1f1674478f78',
      'atami-july03-dsm-sample-counts.u16':'9cbfdc3a81d9ca9c57d736d8642f404e1883af091f117f2870db1db1e7449a29',
      'atami-july03-orthophoto-1m-rgb.u8':'968ef34bfc7462e9bf69fb46da24165dd986db6e3a90784dbf3d1784d68c7789',
    };
    const verify=()=>{
      for(const [file,hash] of Object.entries(hashes)) assert.equal(digest(readFileSync(join(out,file))),hash,file);
    };
    verify();
    assert.deepEqual(prepareAtamiEditorData(out),catalog);
    verify();
    assert.deepEqual(sourceFiles.map(file=>digest(readFileSync(new URL(file,fixtures)))),before);

    const dsm=catalog.surveys['july3-dsm'];
    const heights=array(out,catalog.files['july3-dsm'],Float32Array);
    const counts=array(out,dsm.dsmSampleCountsFile,Uint16Array);
    const groundCounts=array(out,catalog.surveys.ground.groundCountsFile,Uint16Array);
    const raw=readFileSync(new URL('atami-20210703-dsm-crop-10cm.f32',fixtures));
    const source=new Float32Array(raw.buffer,raw.byteOffset,raw.length/4);
    const sourceValid=source.reduce((sum,value)=>sum+Number(Number.isFinite(value)&&value!==-32767),0);
    assert.equal(sourceValid,870850);
    assert.equal(counts.reduce((sum,count)=>sum+count,0),sourceValid);
    assert.equal(counts.filter(count=>count>0).length,8891);
    assert.equal(heights.filter(Number.isFinite).length,8891);
    assert.equal(groundCounts.reduce((sum,count)=>sum+count,0),230413);
    assert.ok(counts.every((count,index)=>(count>0)===Number.isFinite(heights[index])));
    for(const [row,col] of [[13,43],[13,44]]) {
      assert.equal(counts[row*125+col],0);
      assert.ok(Number.isNaN(heights[row*125+col]));
      assert.ok(groundCounts[row*125+col]>0,'a later lidar measurement must not fill an earlier DSM gap');
    }
    assert.equal(counts[15*125+42],100);
    assert.equal(heights[15*125+42],399.2789001464844);
    assert.equal(counts[40*125+42],100);
    assert.equal(heights[40*125+42],381.60321044921875);
  } finally {
    rmSync(out,{recursive:true,force:true});
  }
});

test('Atami loads each dated survey with its own evidence and compares native heights at the same projected point',async t=>{
  t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(url)));
  assert.deepEqual(await availableSurfaces('atami'),[
    {id:'july3-dsm',label:'3 July · Video surface'},
    {id:'ground',label:'5–6 July · Ground lidar'},
  ]);
  const dsm=await loadTerrain('atami','july3-dsm'),ground=await loadTerrain('atami','ground');
  assert.deepEqual(dsm.focus,[15,42]);
  assert.deepEqual(dsm.proposalStart,{row:15,col:42});
  assert.deepEqual(dsm.proposalGoal,{row:85,col:87});
  assert.equal(dsm.date,'3 July 2021');
  assert.doesNotMatch(dsm.product,/July|2021/);
  assert.doesNotMatch(ground.product,/July|2021/);
  assert.equal(dsm.comparisonLabel,'3 July video surface');
  assert.equal(ground.comparisonLabel,'5–6 July lidar ground');
  assert.ok(dsm.dsmSampleCounts instanceof Uint16Array);
  assert.equal(dsm.dsmSampleCounts.length,dsm.heights.length);
  assert.equal(dsm.dsmSampleCounts.reduce((sum,count)=>sum+count,0),870850);
  assert.equal(dsm.groundCounts,undefined);
  assert.equal(dsm.groundCountsFile,undefined);
  assert.equal(dsm.proposalHeights,undefined);
  assert.equal(dsm.proposalSource,undefined);
  assert.equal(dsm.quality,undefined);
  assert.equal(dsm.qualityFile,undefined);
  assert.equal(ground.dsmSampleCounts,undefined);
  assert.ok(dsm.origins.every((origin,index)=>origin===(Number.isFinite(dsm.heights[index])?'undocumented':'absent')));
  assert.ok(ground.origins.every((origin,index)=>origin===(Number.isFinite(ground.heights[index])?'observed':'absent')));
  assert.notEqual(dsm.heights,ground.heights);
  assert.notDeepEqual(dsm.groundRGB,ground.groundRGB);
  const rgbMeta=JSON.parse(await readFile(new URL('atami-imagery/atami-july03-orthophoto-1m-rgb.json',fixtures)));
  assert.equal(digest(dsm.groundRGB),rgbMeta.assetSha256);
  assert.match(dsm.source.url,/izusanls10cmdemtrim\.tif$/);
  assert.doesNotMatch(JSON.stringify(dsm.sourceURLs),/Ground\.zip|Windy/);
  assert.match(dsm.source.crs,/EPSG:6676/);
  assert.match(dsm.source.dsmSampleSupport,/not measure source image support, accuracy or per-cell uncertainty/);
  assert.equal(dsm.source.timing,'Drone footage captured 3 July 2021; DSM resource registered 5 July. Same-day availability to responders unverified.');
  assert.equal(dsm.comparisonSurface.heights,ground.heights);
  assert.equal(ground.comparisonSurface.heights,dsm.heights);
  assert.equal(dsm.comparisonSurface.label,ground.comparisonLabel);
  assert.equal(ground.comparisonSurface.label,dsm.comparisonLabel);
  assert.equal(dsm.comparisonSurface.date,'5–6 July 2021');
  assert.equal(ground.comparisonSurface.date,'3 July 2021');
  assert.ok(Object.isFrozen(dsm.heights)&&Object.isFrozen(ground.heights));
  const selection={layerId:'heights',cell:{row:13,col:43}};
  const earlier=createSession(dsm,{selection}).getSnapshot();
  assert.equal(earlier.heightHere.height,null);
  assert.equal(earlier.comparisonHeight.height,400.6090087890625);
  assert.deepEqual(earlier.comparisonHeight.cell,selection.cell);
  const later=createSession(ground,{selection}).getSnapshot();
  assert.equal(later.heightHere.height,400.6090087890625);
  assert.equal(later.comparisonHeight.height,null);
  assert.deepEqual(later.comparisonHeight.point,earlier.point);
});
