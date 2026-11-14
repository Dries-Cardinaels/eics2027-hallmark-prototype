import test from 'node:test';
import assert from 'node:assert/strict';
import {palette,paletteOptions,setPalette,assessmentColours,assessmentBorders,contrastColour} from '../editor/palette.js';
import {createSurfaceMap,paintSurfaceMap,costColour,costHexColour,valueColour,sampleSurfaceMap} from '../editor/surface-map.js';
import {pathDisplayColour,pathDisplayBorder} from '../editor/path-evidence.js';
import {evaluateRaster} from '../src/core/raster.js';
import {datasetById} from '../src/fixtures/terrain.js';

test('palette switches repaint shared maps, route roles and continuous ramps without changing evidence',()=>{
  const dataset=datasetById('reference');
  const fields={slope:evaluateRaster(dataset,'slope')};
  const baseline=structuredClone(fields.slope);
  const roleColours=assessmentColours,roleBorders=assessmentBorders;
  let originalPixels,originalCost,originalValue;
  try {
    for(const id of [...paletteOptions.map(option=>option.id),'5']){
      setPalette(id);
      assert.equal(assessmentColours,roleColours);assert.equal(assessmentBorders,roleBorders);
      assert.equal(pathDisplayColour({state:1},'assessment'),palette.exceeded);
      assert.equal(pathDisplayBorder({state:1},'assessment'),palette.exceededBorder);
      const map=createSurfaceMap(dataset,fields,'slope',false),pixels=paintSurfaceMap(map).pixels;
      assert.equal(map.paletteId,id);
      const cost=costColour(.25,[0,1]),value=valueColour(.25,[0,1]);
      if(!originalPixels){originalPixels=pixels;originalCost=cost;originalValue=value;}
      else if(id==='5'){assert.deepEqual(pixels,originalPixels);assert.deepEqual(cost,originalCost);assert.deepEqual(value,originalValue);}
      else {assert.notDeepEqual(pixels,originalPixels);assert.notDeepEqual(cost,originalCost);assert.deepEqual(value,originalValue);} // value ramp is neutral gray in every palette (authors, 9 Nov 2026): blue means LOLA return only
      assert.deepEqual(fields.slope,baseline);
      assert.equal(sampleSurfaceMap(map,{row:9,col:5}).value,baseline.values[7*map.grid.W+3]);
    }
    for(const legacy of [undefined,null,'unknown','original','1','2','3','4','7'])assert.equal(setPalette(legacy).id,'5');
    assert.deepEqual(paletteOptions.map(option=>option.id),['5','6']);
    assert.deepEqual(paletteOptions[0].swatches,['#648fff','#785ef0','#dc267f','#fe6100','#ffb000']);
    assert.deepEqual(paletteOptions[1].swatches,['#000000','#e69f00','#56b4e9','#009e73','#f0e442','#0072b2','#d55e00','#cc79a7']);
  } finally {setPalette('5');}
});

test('exceeded map cells carry horizontal texture while within cells remain plain',()=>{
  const dataset={W:2,H:2,res:1,heights:new Float64Array(4),grid:{east:0,north:0}};
  const field={values:new Float64Array(4),states:new Uint8Array([0,1,0,1]),grid:{W:2,H:2,res:1,east:0,north:0},incomplete:new Uint8Array(4)};
  // Both source and analysis grids cover the same synthetic native cells.
  const map={sourceGrid:{W:2,H:2},grid:{W:2,H:2},offset:{row:0,col:0},dataset,field,limits:true,layer:'assessment',flags:false};
  try{
    for(const {id} of paletteOptions){
      setPalette(id);const {width,pixels}=paintSurfaceMap(map,undefined,8);
      const at=(x,y)=>[...pixels.slice((y*width+x)*4,(y*width+x)*4+3)];
      assert.deepEqual(at(2,0),at(2,2));
      assert.notDeepEqual(at(10,0),at(10,2));
    }
  }finally{setPalette('5');}
});


test('cost table and strip foregrounds meet 4.5:1 contrast throughout both palette ramps',()=>{
  const luminance=hex=>{
    const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  };
  try{
    for(const {id} of paletteOptions){
      setPalette(id);
      for(let i=0;i<=200;i++){
        const colour=costHexColour(1+19*i/200,[1,20]),foreground=contrastColour(colour);
        const a=luminance(colour),b=luminance(foreground);
        assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5);
      }
    }
  }finally{setPalette('5');}
});
