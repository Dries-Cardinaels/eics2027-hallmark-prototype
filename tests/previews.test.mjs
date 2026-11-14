import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { TERRAIN_PREVIEWS } from '../src/fixtures/terrain-previews.js';
import { datasetById } from '../src/fixtures/terrain.js';

test('3D previews use the starting surface rather than recovered or filled heights', () => {
  const audit=JSON.parse(readFileSync(new URL('../fixtures/lunar-audit.json',import.meta.url)));
  const scene=JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/lunar-scene.json.gz',import.meta.url))));
  const meshHeights=[scene.ground,...scene.meshes].flatMap(m=>m.positions.filter((_,i)=>i%3===1).map(h=>h+scene.sceneToLocalHeight_m));
  for(const p of TERRAIN_PREVIEWS) {
    const heights=p.kind==='simulated-reference' ? audit.truth : datasetById('reference').heights;
    const bytes=Buffer.alloc(heights.length*8);
    heights.forEach((h,i)=>bytes.writeDoubleLE(h,i*8));
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(p.sampledHash,hash);
    assert.equal(p.sourceHash,p.kind==='simulated-reference'?scene.sceneHash:hash);
    const bounds=p.kind==='simulated-reference'?meshHeights:heights;
    assert.deepEqual(p.heightRange_m,[Math.min(...bounds),Math.max(...bounds)]);
    assert.equal(p.extent_m,p.W*p.res);
    for(const scale of ['1','3']) {
      const image=Buffer.from(p.images[scale].split(',')[1],'base64');
      assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
      assert.equal(image.readUInt32BE(16),1600);assert.equal(image.readUInt32BE(20),992);
      assert.deepEqual(image,readFileSync(new URL(`../figures/${p.id}-3d-${scale}x.png`,import.meta.url)));
    }
    assert.notEqual(p.images['1'],p.images['3']);
    if(p.kind==='simulated-reference') for(const scale of ['1','3']) {
      const image=Buffer.from(p.sampled[scale].split(',')[1],'base64');
      assert.equal(image.readUInt32BE(16),2240);assert.equal(image.readUInt32BE(20),1152);
      assert.deepEqual(image,readFileSync(new URL(`../figures/${p.id}-sampled-${scale}x.png`,import.meta.url)));
      assert.notEqual(p.sampled[scale],p.comparisons[scale]);
    }
  }
  assert.equal(TERRAIN_PREVIEWS[0].sourceHash,TERRAIN_PREVIEWS[1].sourceHash,'sun comparison keeps the same terrain');
  assert.notEqual(TERRAIN_PREVIEWS[0].images['3'],TERRAIN_PREVIEWS[1].images['3'],'sun conditions change the illustration');
});

test('comparison figures pair the actual reference with the correct delivered heights', () => {
  for(const p of TERRAIN_PREVIEWS) {
    const ds=datasetById(p.id), bytes=Buffer.alloc(ds.heights.length*8);
    ds.heights.forEach((h,i)=>bytes.writeDoubleLE(h,i*8));
    assert.equal(p.comparison.deliveredHash,createHash('sha256').update(bytes).digest('hex'));
    const finite=ds.heights.filter(Number.isFinite);
    assert.equal(p.comparison.missingHeights,ds.heights.length-finite.length);
    assert.equal(p.comparison.suppliedHeights,finite.length);
    assert.deepEqual(p.comparison.heightRange_m,[Math.min(p.heightRange_m[0],...finite),Math.max(p.heightRange_m[1],...finite)]);
    if(ds.acquisition) {
      assert.notEqual(p.sourceHash,p.comparison.deliveredHash,'recovered values must not be replaced with truth');
      assert.ok(p.comparison.meanAbsoluteError_m>0);
    } else assert.equal(p.comparison.meanAbsoluteError_m,0);
    for(const scale of ['1','3']) {
      const image=Buffer.from(p.comparisons[scale].split(',')[1],'base64');
      assert.equal(image.readUInt32BE(16),2240);assert.equal(image.readUInt32BE(20),1152);
      assert.deepEqual(image,readFileSync(new URL(`../figures/${p.id}-comparison-${scale}x.png`,import.meta.url)));
    }
  }
  assert.equal(TERRAIN_PREVIEWS.find(p=>p.id==='missing').comparison.missingHeights,1);
});
