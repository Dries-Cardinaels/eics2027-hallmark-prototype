// Shared configurations for the perturbation-diagnostic tests and for demo/research/verification-numbers.mjs,
// so that the numbers reported in the paper come from exactly the configurations the tests check.
import {readFile} from 'node:fs/promises';
import {OPERATIONS,MARGIN,analysisGrid,evaluate,createPipeline} from '../../src/core/index.js';
import {loadTerrain} from '../../editor/data.js';

// Fixed-seed synthetic grid: 14×14 heights at 1 m spacing, a tilted plane plus seeded noise.
export const SYNTHETIC={seed:20261105,size:14,delta:0.5};
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function syntheticGrid(){
 const rand=mulberry32(SYNTHETIC.seed),S=SYNTHETIC.size,N=S*S;
 const heights=Array.from({length:N},(_,i)=>100+0.3*(i%S)+0.2*Math.floor(i/S)+2*rand());
 return {id:'synthetic',W:S,H:S,res:1,heights,origins:Array(N).fill('undocumented')};
}

// Connecting Ridge cropped to 16×16 heights from native (120, 120), with supplied RMS and LOLA counts.
export const RIDGE_CROP={row:120,col:120,size:16,delta:1};
export async function ridgeCrop(){
 const original=globalThis.fetch;globalThis.fetch=async url=>new Response(await readFile(new URL(url)));
 let ds;try{ds=await loadTerrain('connecting-ridge','ground');}finally{globalThis.fetch=original;}
 const idx=[],{row,col,size}=RIDGE_CROP;
 for(let r=0;r<size;r++)for(let c=0;c<size;c++)idx.push((row+r)*ds.W+col+c);
 return {id:'ridge-crop',W:size,H:size,res:ds.res,source:ds.source,lolaReturns:ds.lolaReturns,
  heights:idx.map(i=>ds.heights[i]),origins:idx.map(i=>ds.origins[i]),
  heightRMS:idx.map(i=>ds.heightRMS[i]),lolaCounts:idx.map(i=>ds.lolaCounts[i])};
}

// Limits are test settings, not thresholds: each is the median of that value on the grid, so that
// criterion and combined outcomes lie near a boundary and a perturbation can flip them.
export function medianLimits(ds){
 const {records}=evaluate(ds,{},createPipeline(OPERATIONS));
 const median=id=>{const v=records[id].filter(r=>r.available).map(r=>r.value).sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
 return {slopeDeg:median('slope'),roughness_m:median('roughness'),illuminationMinPercent:median('illumination')};
}

// Negative control: a 5×5 mean that declares only its 3×3 window and reads the rest from the dataset.
const windowCells=(cell,ds,k)=>{
 const A=analysisGrid(ds),r=Math.floor(cell/A.W)+MARGIN,c=cell%A.W+MARGIN,out=[];
 for(let dr=-k;dr<=k;dr++)for(let dc=-k;dc<=k;dc++)out.push((r+dr)*ds.W+c+dc);
 return out;
};
export const underDeclaredMean={
 id:'mean-5x5-declared-3x3',title:'5×5 mean declared as 3×3',kind:'value',grid:'analysis',inputs:['heights'],
 quantity:'mean height',unit:'m',parameters:()=>({window:'5×5 read, 3×3 declared'}),
 footprint:(cell,ds)=>({heights:windowCells(cell,ds,1)}),
 compute:(inputs,ds,limits,records,{cell})=>{const z=windowCells(cell,ds,2).map(i=>ds.heights[i]);return {value:z.reduce((a,b)=>a+b,0)/z.length};},
};

// Negative control 4.2: fixed-seed 12×12 grid at 2 m spacing for the half-cell bilinear operation.
export const BILINEAR={seed:20261106,size:12,delta:0.5};
export function bilinearGrid(){
 let s=BILINEAR.seed;const rand=()=>((s=(s*1664525+1013904223)>>>0)/2**32);
 const N=BILINEAR.size**2;
 return {id:'synthetic-4.2',W:BILINEAR.size,H:BILINEAR.size,res:2,heights:Array.from({length:N},()=>10+rand()*3),origins:Array(N).fill('undocumented')};
}
