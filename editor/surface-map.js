import {nativeSampleCounts} from '../src/core/sample-counts.js';
import {palette,assessmentColours,activePalette,mixColour,ramp,costRamp,supportRamp} from './palette.js';
import {qualityLabel} from '../src/core/index.js';
import {layerGrid} from './spatial.js';
import {qualityVisibility} from './quality-visibility.js';
import {lidarGapField} from './lidar-gaps.js';
import {isNumericEvidence,NUMERIC_EVIDENCE} from './source-evidence.js';
import {rmsReviewVisibility,rmsReviewField} from './rms-review.js';

export {ramp,costRamp,supportRamp};
export const limitColours = assessmentColours;
export const mapStage = (layer,mode) => ['slope','roughness'].includes(layer)&&mode==='limits' ? `${layer}-criterion` : layer;
export const mapNode = (layer,mode) => {
  const stage=mapStage(layer,mode);
  return stage==='assessment'?'combined':stage==='terrain'||stage==='quality'||isNumericEvidence(stage)?'heights':stage;
};
const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const qualityColour = (code,quality) => quality?.kind==='arcticdem-bitmask'?rgb(code===0?palette.input:code&4?palette.suspicious:code&2?palette.exceeded:palette.unavailable):rgb(code >= 10 && code <= 14 ? palette.input : ({0:palette.unavailable,1:mixColour(palette.input,palette.suspicious,.5),2:palette.exceeded,3:palette.suspicious,4:palette.within,15:mixColour(palette.exceeded,palette.unavailable,.5)}[code] || palette.routeContext));

// One pattern vocabulary drives both raster marks and legend categories.
const qualityPatterns={0:'missing',1:'dots',2:'horizontal',3:'diagonal',15:'vertical'};
const patternTests={
  plain:()=>false,
  missing:(x,y)=>(x+y)%8===0||(x-y+8)%8===0,
  dots:(x,y)=>x%6===0&&y%6===0,
  horizontal:(x,y)=>y%8===0,
  diagonal:(x,y)=>(x+y)%8===0,
  vertical:(x,y)=>x%8===0,
};
const qualityPattern=(code,quality)=>quality?.kind==='arcticdem-bitmask'?(code&4?'diagonal':code&2?'horizontal':code&1?'dots':'plain'):qualityPatterns[code]||'plain';

let cachedPalette,stops,costStops,supportStops,unavailableColour;
function refreshStops(){
  if(cachedPalette===activePalette)return;
  cachedPalette=activePalette;unavailableColour=rgb(palette.unavailable);stops=ramp.map(rgb);costStops=costRamp.map(rgb);supportStops=supportRamp.map(rgb);
}
export function valueColour(value, range, colours=null) {
  if(!colours){refreshStops();colours=stops;}
  if (!Number.isFinite(value) || !range) {refreshStops();return unavailableColour;}
  const t = range[1] === range[0] ? .5 : Math.max(0,Math.min(1,(value-range[0])/(range[1]-range[0])));
  const segment = t < .5 ? 0 : 1, weight = t * 2 - segment;
  return colours[segment].map((v,i) => Math.round(v+(colours[segment+1][i]-v)*weight));
}
export const costColour=(value,range)=>{refreshStops();return valueColour(value,range,costStops);};
export const costHexColour=(value,range)=>'#'+costColour(value,range).map(v=>v.toString(16).padStart(2,'0')).join('');
export const supportColour=(value,range)=>{refreshStops();return valueColour(value,range,supportStops);};

export function createSurfaceMap(dataset, fields, layer, showFlags, mode, pipeline=null) {
  layer=mapStage(layer,mode);
  if (!['assessment','terrain','slope','roughness','slope-criterion','roughness-criterion','quality','traversal-cost','height-support'].includes(layer)&&!isNumericEvidence(layer)) throw new Error('Unknown surface layer');
  if(isNumericEvidence(layer)&&!dataset[NUMERIC_EVIDENCE[layer].key])throw new Error('Numeric source evidence not supplied');
  if (layer === 'quality' && !dataset.quality) throw new Error('Quality flags not supplied');
  const node = mapNode(layer);
  const separate=showFlags&&typeof showFlags==='object';
  const affected=separate?showFlags.affected:showFlags,heightFlags=separate?showFlags.heights:node==='heights'&&showFlags;
  const field = fields[isNumericEvidence(layer)?layer:node], sourceGrid = layerGrid(dataset,{grid:'heights'});
  const grid = layerGrid(dataset,{grid:node === 'heights' ? 'heights' : 'analysis'});
  const review=rmsReviewVisibility(separate?showFlags:{},dataset),reviewThreshold=review.threshold;
  return {
    paletteId:activePalette,dataset,field,layer,node,sourceGrid,grid,qualityVisibility:qualityVisibility(showFlags),mode:node==='combined'||node.endsWith('-criterion')?'limits':'values',limits:node==='combined'||node.endsWith('-criterion'),
    gapEvidence:lidarGapField(dataset,node,pipeline),showLidarGaps:Boolean(nativeSampleCounts(dataset)&&separate&&showFlags.gaps),
    flags: Boolean(affected && dataset.quality && layer !== 'quality' && node!=='heights'),
    heightFlags:Boolean(heightFlags&&dataset.quality),
    rmsReviewVisibility:review,rmsReview:review.results?rmsReviewField(dataset,node,reviewThreshold,pipeline):null,rmsReviewSources:review.heights?rmsReviewField(dataset,'heights',reviewThreshold,pipeline):null,
    offset:{row:Math.round((sourceGrid.north-grid.north)/grid.res),col:Math.round((grid.east-sourceGrid.east)/grid.res)},
  };
}

export function sampleSurfaceMap(map, heightCell) {
  const row = heightCell.row-map.offset.row, col = heightCell.col-map.offset.col;
  if (row < 0 || col < 0 || row >= map.grid.H || col >= map.grid.W) return {value:NaN,suspicious:map.field.quality?0:null,total:map.field.quality?0:null,missingHeights:map.gapEvidence?null:undefined,outside:true};
  const index = row*map.grid.W+col;
  return {value:map.field.values[index],state:map.field.states?.[index],incomplete:Boolean(map.field.incomplete?.[index]),suspicious:map.field.quality?.suspicious[index] ?? null,total:map.field.quality?.total[index] ?? null,missingHeights:map.gapEvidence?.counts[index],outside:false};
}

// Nearest-cell texture: patterns change presentation only, never values or quality codes.
export function paintSurfaceMap(map, terrainPixels, scale = nativeSampleCounts(map.dataset) ? 12 : 4) {
  const {W,H} = map.sourceGrid, width = W*scale, height = H*scale;
  const pixels = new Uint8ClampedArray(width*height*4);
  const limits=limitColours.map(rgb),missingColour=rgb(palette.unavailable),missingInk=rgb(palette.unavailableBorder),flagInk=rgb(palette.suspiciousBorder),qualityInk=rgb(palette.routeContext);
  const exceededInk=rgb(mixColour(palette.exceeded,palette.exceededBorder,.26));
  const gapInk=rgb('#263443'),gapHalo=rgb('#ffffff');
  const qualityColours=map.layer==='quality'?new Map([...new Set(map.dataset.quality.codes)].map(code=>[code,qualityColour(code,map.dataset.quality)])):null;
  for (let row=0;row<H;row++) for(let col=0;col<W;col++) {
    const source = row*W+col, sample = sampleSurfaceMap(map,{row,col});
    const colour = map.limits ? (limits[sample.state] || missingColour) : map.layer === 'quality' ? qualityColours.get(map.dataset.quality.codes[source])
      : map.layer === 'terrain' ? ((map.showLidarGaps || !map.dataset.groundRGB) && nativeSampleCounts(map.dataset)?.[source] === 0 ? missingColour : terrainPixels.subarray(source*4,source*4+3))
      : map.layer==='traversal-cost'?costColour(sample.value,map.field.range):map.layer==='height-support'?supportColour(sample.value,map.field.range):valueColour(sample.value,map.field.range);
    const code=map.layer==='quality'?map.dataset.quality.codes[source]:null;
    const markQuality=patternTests[qualityPattern(code,map.dataset.quality)],qualityMarkInk=code===3?flagInk:qualityInk;
    const lidar=Boolean(nativeSampleCounts(map.dataset)), gap=map.showLidarGaps&&sample.missingHeights>0;
    for(let y=0;y<scale;y++) for(let x=0;x<scale;x++) {
      const xx=col*scale+x, yy=row*scale+y;
      const flagged = map.flags && sample.suspicious > 0 && (xx+yy)%8 < 1;
      const unresolved = sample.outside || (map.limits ? sample.incomplete : !Number.isFinite(sample.value));
      const missing = map.layer !== 'quality' && unresolved && (lidar
        ? map.layer!=='terrain' && (xx+yy)%scale===0
        : (xx+yy)%8===0 || (xx-yy+8)%8===0);
      const exceeded=map.limits&&sample.state===1&&yy%8===0;
      let pixel = markQuality(xx,yy) ? qualityMarkInk : flagged ? flagInk : missing ? missingInk : exceeded ? exceededInk : colour;
      // A result is marked only when its declared inputs include missing native heights.
      if(gap){
        const distance=Math.hypot(x+.5-scale/2,y+.5-scale/2)/scale;
        if(distance<=.21) pixel=distance<=.15 ? gapInk : gapHalo;
      }
      const i = (yy*width+xx)*4;
      pixels[i]=pixel[0];pixels[i+1]=pixel[1];pixels[i+2]=pixel[2];pixels[i+3]=255;
    }
  }
  return {width,height,pixels};
}

export function qualityCategories(dataset) {
  const entries = new Map();
  for(const code of [...new Set(dataset.quality.codes)].sort((a,b)=>a-b)) {
    const label = qualityLabel(code,dataset.quality);
    const exactLabel=dataset.quality.kind==='arcticdem-bitmask'?label:`${code>=10&&code<=14?'10–14':code} · ${label}`;
    if(!entries.has(exactLabel)) entries.set(exactLabel,{label:exactLabel,colour:qualityColour(code,dataset.quality),pattern:qualityPattern(code,dataset.quality)});
  }
  return [...entries.values()];
}

// Discrete displayed classes only: continuous value colours have no inferred contours.
export function surfaceCategory(map,heightCell){
  if(map.layer==='quality'){
    const code=map.dataset.quality.codes[heightCell.row*map.sourceGrid.W+heightCell.col];
    return `${qualityLabel(code,map.dataset.quality)}|${qualityColour(code,map.dataset.quality).join(',')}`;
  }
  if(!map.limits)return null;
  const sample=sampleSurfaceMap(map,heightCell);
  return sample.outside?'outside':`${sample.state??2}:${Number(sample.incomplete)}`;
}


export function qualityLayersFromParams(params){
  const legacy=params.get('flags')!=='0';
  return {heights:params.has('heightflags')?params.get('heightflags')!=='0':legacy,affected:params.has('affected')?params.get('affected')!=='0':legacy};
}
