import test from 'node:test';
import assert from 'node:assert/strict';
import {OrthographicCamera,PerspectiveCamera,Vector3} from 'three';
import {groundScale} from '../editor/ground-scale.js';

const cameraAt=(x,y,z,zoom=1)=>{
 const camera=new OrthographicCamera(-100,100,75,-75,.1,10000);
 camera.position.set(x,y,z);camera.lookAt(0,0,0);camera.zoom=zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();return camera;
};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('ground ruler measures metres consistently under azimuth orbit, tilt, zoom and viewport changes',()=>{
 for(const [x,y,z] of [[0,100,100],[100,100,0],[-120,40,45],[.001,100,0]]){
  const camera=cameraAt(x,y,z),scale=groundScale(camera,800,600);
  near(scale.metresPerPixel,.25);near(scale.metres/scale.pixels,.25);
  const raised=groundScale(camera,800,600,{planeY:25});near(raised.metresPerPixel,scale.metresPerPixel);
  camera.zoom=4;camera.updateProjectionMatrix();near(groundScale(camera,800,600).metresPerPixel,.0625);
  near(groundScale(camera,400,600).metresPerPixel,.125);
 }
});

test('a rolled camera uses ground-plane distance rather than assuming world X or screen pixels',()=>{
 const camera=cameraAt(0,100,100);camera.rotateZ(Math.PI/4);camera.updateMatrixWorld();
 const scale=groundScale(camera,800,600);
 // Screen-right now mixes horizontal and tilted screen-up: X/Z distance grows.
 near(scale.metresPerPixel,.25*Math.sqrt(1.5));
});

test('ground ruler hides for undefined ground intersections or unsupported projection',()=>{
 const horizontal=cameraAt(0,0,100);assert.equal(groundScale(horizontal,800,600),null);
 assert.equal(groundScale(cameraAt(0,100,100),0,600),null);
 assert.equal(groundScale(cameraAt(0,100,100),800,600,{planeY:NaN}),null);
 assert.equal(groundScale(new PerspectiveCamera(),800,600),null);
 const away=cameraAt(0,100,100);away.lookAt(new Vector3(0,200,200));away.updateMatrixWorld();assert.equal(groundScale(away,800,600),null);
});
