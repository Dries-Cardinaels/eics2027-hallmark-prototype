import test from 'node:test';
import assert from 'node:assert/strict';
import {OrthographicCamera,Vector3} from 'three';
import {placeAnnotation,rectanglesOverlap,projectedSpriteRect} from '../editor/annotation-layout.js';

const viewport={width:600,height:400},size={width:170,height:25},anchor={x:300,y:200};
test('measured labels avoid projected flags and control rectangles with deterministic nearby placement',()=>{
 const obstacles=[{left:310,top:160,width:45,height:80},{left:0,top:0,width:600,height:45},{left:0,top:300,width:400,height:100}];
 const placed=placeAnnotation(anchor,size,viewport,obstacles);
 assert.equal(placed.collisions,0);for(const obstacle of obstacles)assert.equal(rectanglesOverlap(placed,obstacle,3),false);
 assert.deepEqual(placeAnnotation(anchor,size,viewport,obstacles),placed);
 assert.ok(Math.hypot(placed.left-anchor.x,placed.top-anchor.y)<250);
});
test('edge anchors remain inside viewport, hover can hide when crowded and labels hide instead of overlapping when crowded',()=>{
 const placed=placeAnnotation({x:599,y:399},size,viewport);
 assert.ok(placed.left>=8&&placed.top>=8&&placed.left+placed.width<=592&&placed.top+placed.height<=392);
 const crowded=[{left:0,top:0,...viewport}];
 assert.equal(placeAnnotation(anchor,size,viewport,crowded),null);
 assert.equal(placeAnnotation(anchor,size,viewport,crowded),null);
 assert.equal(placeAnnotation(anchor,{width:800,height:30},viewport),null);
});
test('sprite obstacle dimensions follow orthographic projection, zoom and viewport size including partial edge visibility',()=>{
 const camera=new OrthographicCamera(-100,100,50,-50,.1,1000);camera.position.set(80,100,80);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const point=new Vector3(0,0,0).project(camera),spriteSize={x:4,y:4};
 const rect=projectedSpriteRect(point,spriteSize,camera,{width:800,height:400});
 assert.equal(rect.width,16);assert.equal(rect.height,16);
 camera.zoom=2;camera.updateProjectionMatrix();
 assert.equal(projectedSpriteRect(point,spriteSize,camera,{width:800,height:400}).width,32);
 assert.equal(projectedSpriteRect(point,spriteSize,camera,{width:400,height:200}).width,16);
 assert.ok(projectedSpriteRect({x:1.02,y:0,z:0},spriteSize,camera,{width:800,height:400}));
 assert.equal(projectedSpriteRect({x:2,y:0,z:0},spriteSize,camera,{width:800,height:400}),null);
 assert.equal(projectedSpriteRect({x:0,y:0,z:1.1},spriteSize,camera,{width:800,height:400}),null);
});


test('trace hover remains outside the supporting-cell footprint and controls',()=>{
 const support={left:180,top:110,width:240,height:180},control={left:0,top:0,width:600,height:45};
 const flags=[{left:170,top:90,width:25,height:25},{left:390,top:85,width:25,height:25}];
 const placed=placeAnnotation(anchor,size,viewport,[support,control,...flags]);
 assert.ok(placed);for(const obstacle of [support,control,...flags])assert.equal(rectanglesOverlap(placed,obstacle,3),false);
});
