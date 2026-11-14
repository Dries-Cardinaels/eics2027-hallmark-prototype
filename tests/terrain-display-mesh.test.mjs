import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {annotationHeight,terrainDisplayMesh} from '../editor/missing-cell-display.js';
import {pickTerrainSurface} from '../editor/view3d.js';
import {surfaceHeight} from '../editor/evidence-geometry.js';

function atami() {
  const heights=readFileSync(new URL('../editor/data/atami-ground-1m-median.f32',import.meta.url));
  const counts=readFileSync(new URL('../editor/data/atami-ground-counts.u16',import.meta.url));
  const {W,H}=JSON.parse(readFileSync(new URL('../editor/data/cases.json',import.meta.url),'utf8')).atami;
  assert.equal(heights.byteLength,4*W*H);assert.equal(counts.byteLength,2*W*H);
  return {W,H,heights:Object.freeze(Array.from(new Float32Array(heights.buffer,heights.byteOffset,heights.byteLength/4))),groundCounts:new Uint16Array(counts.buffer,counts.byteOffset,counts.byteLength/2)};
}

function geometryOf(mesh) {
  const positions=[];
  for(let r=0;r<mesh.H;r++)for(let c=0;c<mesh.W;c++)positions.push(mesh.cols[c],mesh.heights[r*mesh.W+c],mesh.rows[r]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(mesh.indices);
  return geometry;
}

test('Atami display has a complete native footprint and a closed perimeter for all side walls',()=>{
  const ds=atami(),before=[...ds.heights],counts=[...ds.groundCounts],mesh=terrainDisplayMesh(ds);
  assert.deepEqual([mesh.W,mesh.H],[ds.W+2,ds.H+2]);
  assert.deepEqual([mesh.cols[0],mesh.cols.at(-1),mesh.rows[0],mesh.rows.at(-1)],[-.5,ds.W-.5,-.5,ds.H-.5]);
  assert.equal(mesh.indices.length/3,(ds.W+1)*(ds.H+1)*2);assert.equal(mesh.perimeter.length,2*(ds.W+ds.H+2));
  assert.ok(mesh.heights.every(Number.isFinite));
  const edges=new Map(),key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(let i=0;i<mesh.indices.length;i+=3){
    const triangle=mesh.indices.slice(i,i+3);
    for(let j=0;j<3;j++){const edge=key(triangle[j],triangle[(j+1)%3]);edges.set(edge,(edges.get(edge)||0)+1);}
  }
  const open=new Set([...edges].filter(([,count])=>count===1).map(([edge])=>edge));
  assert.equal(open.size,mesh.perimeter.length);assert.ok([...edges.values()].every(count=>count===1||count===2));
  for(let i=0;i<mesh.perimeter.length;i++)assert.ok(open.delete(key(mesh.perimeter[i],mesh.perimeter[(i+1)%mesh.perimeter.length])));
  assert.equal(open.size,0,'every open top edge is joined by a wall, including missing crop-edge bins');
  for(let r=0;r<ds.H;r++)for(let c=0;c<ds.W;c++)if(Number.isFinite(ds.heights[r*ds.W+c]))assert.equal(annotationHeight(ds,r,c),ds.heights[r*ds.W+c]);
  assert.deepEqual(ds.heights,before);assert.deepEqual([...ds.groundCounts],counts);
  assert.equal(terrainDisplayMesh(ds),mesh,'the drawing mesh is cached separately from source heights');
});

test('all display triangle interiors and the crop fringe agree exactly with annotation draping',()=>{
  const ds=atami(),mesh=terrainDisplayMesh(ds),weights=[.2,.3,.5];
  for(let i=0;i<mesh.indices.length;i+=3){
    let row=0,col=0,height=0;
    for(let j=0;j<3;j++){
      const index=mesh.indices[i+j],weight=weights[j];
      row+=mesh.rows[Math.floor(index/mesh.W)]*weight;col+=mesh.cols[index%mesh.W]*weight;height+=mesh.heights[index]*weight;
    }
    assert.ok(Math.abs(annotationHeight(ds,row,col)-height)<1e-9,`triangle ${i/3} has the same drawing height`);
  }
});

test('every absent Atami cell and the full crop fringe are picked on the actual top mesh',()=>{
  const ds=atami(),mesh=terrainDisplayMesh(ds),geometry=geometryOf(mesh),surface=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()),raycaster=new THREE.Raycaster();
  surface.updateMatrixWorld();
  const targets=[];
  const gaps=Array.from(ds.groundCounts.keys()).filter(i=>ds.groundCounts[i]===0);
  assert.ok(gaps.length>0);
  for(const i of gaps)targets.push([Math.floor(i/ds.W),i%ds.W]);
  for(const row of [-.49,ds.H-.51])for(let col=0;col<ds.W;col++)targets.push([row,col]);
  for(const col of [-.49,ds.W-.51])for(let row=0;row<ds.H;row++)targets.push([row,col]);
  for(const [row,col] of targets){
    const height=annotationHeight(ds,row,col),target=new THREE.Vector3(col,height,row);
    for(const offset of [new THREE.Vector3(0,80,0),new THREE.Vector3(.2,80,.1)]){
      const origin=target.clone().add(offset);raycaster.set(origin,target.clone().sub(origin).normalize());
      const hit=pickTerrainSurface(raycaster,surface);assert.ok(hit,`pick ${row},${col}`);
      assert.ok(hit.point.distanceTo(target)<2e-4,`pick ${row},${col} stays on the draped drawing surface`);
    }
  }
  geometry.dispose();surface.material.dispose();
});

test('wide gaps and missing boundaries are display-filled without modifying fixed observations',()=>{
  const W=17,H=17,heights=Array.from({length:W*H},(_,i)=>Math.floor(i/W)+i%W);
  for(let r=0;r<13;r++)for(let c=0;c<13;c++)heights[r*W+c]=NaN;
  const ds={W,H,heights:Object.freeze(heights),groundCounts:heights.map(h=>Number.isFinite(h)?1:0)},mesh=terrainDisplayMesh(ds);
  assert.ok(mesh.heights.every(Number.isFinite));assert.equal(mesh.indices.length/3,(W+1)*(H+1)*2);
  for(let r=0;r<H;r++)for(let c=0;c<W;c++){
    const h=annotationHeight(ds,r,c);
    if(Number.isFinite(heights[r*W+c]))assert.equal(h,heights[r*W+c]);
    else{
      const neighbours=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([rr,cc])=>rr>=0&&cc>=0&&rr<H&&cc<W);
      const mean=neighbours.reduce((sum,[rr,cc])=>sum+annotationHeight(ds,rr,cc),0)/neighbours.length;
      assert.ok(Math.abs(mean-h)<1e-6);
    }
  }
  assert.ok(Number.isNaN(ds.heights[0]));
});

test('other datasets retain their original hole topology and an unobserved crop invents no height',()=>{
  const ds={W:3,H:3,heights:[0,1,2,3,NaN,5,6,7,8]},mesh=terrainDisplayMesh(ds);
  assert.deepEqual(mesh.rows,[0,1,2]);assert.deepEqual(mesh.cols,[0,1,2]);assert.equal(mesh.indices.length/3,2);
  assert.ok(Number.isNaN(annotationHeight(ds,1,1)));assert.equal(annotationHeight(ds,.1,.1),surfaceHeight(ds,.1,.1));
  const absent={W:3,H:3,heights:Array(9).fill(NaN),groundCounts:Array(9).fill(0)},empty=terrainDisplayMesh(absent);
  assert.equal(empty.indices.length,0);assert.ok(empty.heights.every(Number.isNaN));assert.ok(Number.isNaN(annotationHeight(absent,1,1)));
});
