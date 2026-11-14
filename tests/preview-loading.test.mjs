import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TERRAIN_PREVIEWS} from '../src/fixtures/terrain-previews.js';

function harness(baseURI) {
  const scripts=[], window={};
  const document={baseURI,head:{append(s){scripts.push(s);}},createElement(){return {remove(){this.removed=true;}};}};
  const context={window,document,URL};
  vm.runInNewContext(readFileSync(new URL('../src/ui/preview-loader.js',import.meta.url),'utf8').replace('export function','function'),context);
  return {...context,scripts,load:context.loadPreviewAssets};
}
function payload() {
  return {previews:[{id:'test',images:{1:'terrain.png'},sampled:{},comparisons:{1:'comparison.png'}}],shadows:{test:'shadow.png'}};
}

test('preview loading is demand-driven, shares concurrent requests and caches success',async()=>{
  for(const baseURI of ['file:///project/dist/page.html','https://example.test/demo/index.html']) {
    const h=harness(baseURI);
    assert.equal(h.scripts.length,0);
    const first=h.load('preview/manifest.js?v=one'),second=h.load('preview/manifest.js?v=one');
    assert.equal(first,second);assert.equal(h.scripts.length,1);
    h.window.__HALLMARK_PREVIEW_ASSETS__=payload();h.scripts[0].onload();
    const result=await first;
    assert.equal(result.previews[0].images[1],new URL('preview/terrain.png',baseURI).href);
    assert.equal(result.shadows.test,new URL('preview/shadow.png',baseURI).href);
    assert.equal(h.scripts[0].removed,true);
    assert.equal(await h.load('preview/manifest.js?v=one'),result);
    assert.equal(h.scripts.length,1);
  }
});

test('failed or missing preview index can be retried without a page reload',async()=>{
  const h=harness('file:///project/dist/page.html');
  const failed=h.load('preview/manifest.js');h.scripts[0].onerror();
  await assert.rejects(failed,/could not be loaded/);
  const malformed=h.load('preview/manifest.js');h.scripts[1].onload();
  await assert.rejects(malformed,/could not be loaded/);
  const retry=h.load('preview/manifest.js');
  h.window.__HALLMARK_PREVIEW_ASSETS__=payload();h.scripts[2].onload();
  assert.equal((await retry).previews[0].id,'test');
});

test('initial page excludes preview PNGs; lazy files preserve all original figures',()=>{
  const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/data:image\/png;base64|src\/fixtures\/terrain-previews\.js/);
  // Includes the shared native-count and height-evidence dependencies required by core queries.
  assert.ok(Buffer.byteLength(html)<690*1024,'main document must stay below 690 KiB including native source evidence and the LROC and two Copernicus DEM samples (heights + all four masks each)');
  const manifestURL=new URL('../dist/preview/manifest.js',import.meta.url);
  const source=readFileSync(manifestURL,'utf8');
  assert.ok(Buffer.byteLength(source)<15*1024,'index must stay small');
  const window={};vm.runInNewContext(source,{window});
  const assets=window.__HALLMARK_PREVIEW_ASSETS__;
  assert.equal(assets.previews.length,TERRAIN_PREVIEWS.length+4);
  for(const original of TERRAIN_PREVIEWS) {
    const record=assets.previews.find(p=>p.id===original.id);
    assert.equal(record.sourceHash,original.sourceHash);
    for(const key of ['images','sampled','comparisons']) for(const [scale,data] of Object.entries(original[key])) {
      assert.deepEqual(readFileSync(new URL(record[key][scale],manifestURL)),Buffer.from(data.split(',')[1],'base64'));
    }
  }
  for(const [id,path] of Object.entries(assets.shadows)) {
    assert.deepEqual(readFileSync(new URL(path,manifestURL)),readFileSync(new URL(`../figures/${id}-terrain.png`,import.meta.url)));
  }
});
