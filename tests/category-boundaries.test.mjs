import test from 'node:test';
import assert from 'node:assert/strict';
import {categoricalBoundaries} from '../editor/evidence-geometry.js';
import {surfaceCategory} from '../editor/surface-map.js';

function mapFor(states,W=2,H=2,incomplete=states.map(()=>0)){
 return {limits:true,layer:'assessment',flags:false,sourceGrid:{W,H},grid:{W,H},offset:{row:0,col:0},field:{values:new Float64Array(W*H),states:Uint8Array.from(states),incomplete:Uint8Array.from(incomplete)}};
}

test('category boundaries retain only differing shared edges, once each, without a uniform full grid',()=>{
 assert.deepEqual(categoricalBoundaries(mapFor([0,0,0,0])),[]);
 const map=mapFor([0,1,0,1]);
 assert.deepEqual(categoricalBoundaries(map),[[-.5,.5,.5,.5],[.5,.5,1.5,.5]]);
 assert.equal(categoricalBoundaries(mapFor([0,1,1,0])).length,4);
 assert.deepEqual([...map.field.states],[0,1,0,1]);
});

test('incomplete and unavailable transitions remain explicit independently of quality highlighting',()=>{
 const map=mapFor([1,1,2,2],2,2,[0,1,1,1]);
 const edges=categoricalBoundaries(map);assert.equal(edges.length,3);
 assert.equal(surfaceCategory(map,{row:0,col:0}),'1:0');assert.equal(surfaceCategory(map,{row:0,col:1}),'1:1');
 assert.deepEqual(categoricalBoundaries({...map,flags:true}),edges);
 map.field.states[0]=1;map.field.incomplete[0]=1;
 assert.equal(categoricalBoundaries(map).length,2,'changing the displayed categories rebuilds their boundaries');
});

test('analysis margins are compared at the exact starting-height cell edges',()=>{
 const map=mapFor([0,0,0,0]);map.sourceGrid={W:6,H:6};map.offset={row:2,col:2};
 const edges=categoricalBoundaries(map);assert.equal(edges.length,8);
 assert.ok(edges.some(e=>JSON.stringify(e)===JSON.stringify([1.5,1.5,2.5,1.5])),'left edge lies between native columns1 and2');
 assert.ok(edges.every(e=>e.every(v=>v>=1.5&&v<=3.5)),'no grid is drawn across the uniform outside margin');
});

test('quality boundaries follow displayed category/colour groups, not successful-correlation subcodes',()=>{
 const map={limits:false,layer:'quality',flags:false,sourceGrid:{W:2,H:2},dataset:{quality:{codes:[10,14,3,3]}}};
 assert.deepEqual(categoricalBoundaries(map),[[.5,-.5,.5,.5],[.5,.5,.5,1.5]]);
 assert.deepEqual(categoricalBoundaries({...map,flags:true}),categoricalBoundaries(map));
});

test('continuous terrain, slope and roughness maps never gain inferred contour boundaries',()=>{
 for(const layer of ['terrain','slope','roughness']){
  const map={...mapFor([0,1,2,0]),limits:false,layer};
  assert.equal(surfaceCategory(map,{row:0,col:0}),null);assert.deepEqual(categoricalBoundaries(map),[]);
 }
});
