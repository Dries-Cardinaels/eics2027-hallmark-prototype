// Execute LunarBlock's original scene assembly and heightmap builder, without a renderer.
// Acorn selects complete declarations verbatim: terrain algorithms are not reimplemented here.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { parse } from 'acorn';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const hash = b => createHash('sha256').update(b).digest('hex');
const handlers = new Map();
export async function fullLunarScene(source, {spires = true} = {}) {
  const main = readFileSync(resolve(source,'src/main.js'),'utf8');
  const ast = parse(main,{ecmaVersion:'latest',sourceType:'module'});
  const functions = new Set(['bucketCraters','craterField','viewH','surfaceH','rockFieldH','fitRelief','shapeSurface',
    'boulderGeo','spireGeo','addRock','genHills','genCraters','freeSpot','genRocks','genSmall','placeSmallBoulders','genPebbles',
    'generate','siteInfo','rockTriangles','buildHeightmap']);
  const variables = new Set(['S','L','OPT_DEFAULTS','opts','MPU','scene','sun','craters','hills','phases','hillUndulation','relief',
    'bumps','hillField','SMALL','world','small','bandCraters','CG','CG_PAD','CG_STEP','craterGrid','SEG','surfGeo',
    'rockMats','rockGroup','rocks','pebbleSets','_up','obs','HILL_DENSITY','CRATER_MUL','ROCK_MUL','genStats','stream','cellRng',
    'HILL_OCTAVES','craterMin','CRATER_NAMES','CRATER_FACTS','boulderInst','SOURCE_BUDGET','hm','terrainVersion','heightmapCache',
    'idealCache','dtm','hmGrid','hmOversample','hmBaseKey','smallSpec','DETAIL_N']);
  const declarations=[], found=new Set();
  for(const node of ast.body) {
    if(node.type==='FunctionDeclaration' && functions.has(node.id.name)) {
      declarations.push(main.slice(node.start,node.end));found.add(node.id.name);
    }
    if(node.type==='VariableDeclaration') for(const d of node.declarations) if(d.id.type==='Identifier'&&variables.has(d.id.name)) {
      declarations.push(`${node.kind} ${main.slice(d.start,d.end)};`);found.add(d.id.name);
    }
  }
  for(const name of [...functions,...variables]) if(!found.has(name)) throw new Error(`LunarBlock declaration changed/missing: ${name}`);
  const modules = {};
  for(const file of ['world','fields','dtm','observe','produce']) modules[file]=await import(pathToFileURL(resolve(source,`src/${file}.js`)));
  const worker = async (file,job) => {
    const messages=[];
    globalThis.self={postMessage:m=>messages.push(m)};
    if(!handlers.has(file)) {
      await import(pathToFileURL(resolve(source,`src/${file}.js`)));
      handlers.set(file,globalThis.self.onmessage);
    }
    handlers.get(file)({data:job});
    const done=messages.findLast(m=>m.done || m.data || m.normals);
    if(!done) throw new Error(`No result from ${file}`);
    return done;
  };
  const jobs=[];
  const skipped = ['buildSkirt','paintSurface','bakeDetail','buildGrids','paintContours','placeRover','regrid',
    'paintObservation','syncObsInfo','syncGenUI','syncPlanUI','writeHash'];
  const context = { THREE,ConvexGeometry,...modules.world,...modules.fields,DTM:modules.dtm,OBS:modules.observe,PRODUCE:modules.produce,
    performance,console,Map,Float32Array,Float64Array,Uint8Array,
    runHeightmapWorker:async job=>{jobs.push(structuredClone(job));return worker('dtm-worker',job);},
    runProduceWorker:job=>worker('produce-worker',job),heightmapMeta:()=>({}),
    recon:{key:''},viewMode:'detailed',dm:{modal:{hidden:true}},overlayActive:()=>false,planSource:'terrain',
    ...Object.fromEntries(skipped.map(name=>[name,()=>{}])) };
  const exposed = `globalThis.exported = {generate,buildHeightmap,rockTriangles,surfaceH,viewH,rockFieldH,
    opts,obs,hm,siteInfo,scene,surfGeo,small,SMALL,relief,pebbleSets,boulderInst,
    removeSpires() {
      const removed = rocks.filter(r=>r.mesh.userData.tall);
      for(const r of removed) { rockGroup.remove(r.mesh); r.mesh.geometry.dispose(); }
      rocks = rocks.filter(r=>!r.mesh.userData.tall);
      return removed.length;
    },
    get rocks(){return rocks},get hills(){return hills},get craters(){return craters},get phases(){return phases},
    get hillUndulation(){return hillUndulation},get mpu(){return MPU},smallSpec,
    get detailJob(){return {N:DETAIL_N,area:opts.area,seed:opts.seed,craterMul:CRATER_MUL[opts.craters],rockMul:ROCK_MUL[opts.rocks],craters:[SMALL.craterMin,small.meshLo],boulders:[SMALL.boulderMin,small.boulderHi]}}};`;
  vm.runInNewContext(declarations.join('\n')+'\n'+exposed,context,{filename:'lunarblock-original-declarations.js'});
  const api=context.exported;
  api.generate();
  // Explicit scene selection BEFORE any heightmap is sampled. Removing only tall
  // meshes after generation preserves every ordinary rock, pebble and terrain vertex,
  // including placement decisions made by the original seeded generator.
  const selection = {spires, removedSpires:spires ? 0 : api.removeSpires()};
  const packedGeometry = (geo,matrix=new THREE.Matrix4()) => {
    const pos=geo.attributes.position, vertices=[], v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++) {v.fromBufferAttribute(pos,i).applyMatrix4(matrix);vertices.push(v.x*api.mpu,v.y*api.mpu,v.z*api.mpu);}
    return {positions:vertices,indices:geo.index ? Array.from(geo.index.array) : Array.from({length:pos.count},(_,i)=>i)};
  };
  const rockMeshes=api.rocks.map(r=>{r.mesh.updateMatrixWorld(true);return {kind:r.mesh.userData.tall?'spire':'boulder',...packedGeometry(r.mesh.geometry,r.mesh.matrixWorld)};});
  const instances = (im,kind) => {
    const out=[],m=new THREE.Matrix4();im.updateMatrixWorld(true);
    for(let i=0;i<im.count;i++) {im.getMatrixAt(i,m);if(Math.abs(m.determinant())<1e-12)continue;out.push({kind,...packedGeometry(im.geometry,m.premultiply(im.matrixWorld))});}
    return out;
  };
  const meshes=[...rockMeshes,...api.pebbleSets.flatMap(im=>instances(im,'pebble')),...instances(api.boulderInst,'small-boulder')];
  const ground=packedGeometry(api.surfGeo);
  const triangles=api.rockTriangles();
  const signature={selection,options:{...api.opts},relief:{...api.relief},phases:Array.from(api.phases),hills:api.hills,craters:api.craters,
    small:{...api.SMALL,...api.small},ground,meshes};
  const sceneHash=hash(JSON.stringify(signature));
  const detail=await worker('detail-worker',api.detailJob);
  return {api,jobs,worker,scene:{...signature,sceneHash,sourceMainHash:hash(main),threeVersion:THREE.REVISION,
    geometry:{groundVertices:ground.positions.length/3,groundTriangles:ground.indices.length/3,rockMeshes:rockMeshes.length,
      pebbleMeshes:meshes.filter(m=>m.kind==='pebble').length,smallBoulderMeshes:api.boulderInst.count,
      dtmRockTriangles:triangles.tris.length/9},
    sourceFunctions:[...functions],nonTerrainHooks:skipped,detail:{job:api.detailJob,craters:detail.craters,boulders:detail.boulders,normalsHash:hash(detail.normals)}},
    detailNormals:detail.normals,rockTriangles:triangles};
}
