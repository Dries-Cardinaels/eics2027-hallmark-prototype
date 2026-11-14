// Mockup calculation model. A declared footprint drives on-demand inspection for every variant.
const square=(r,c,k,W)=>{const out=[];for(let dr=-k;dr<=k;dr++)for(let dc=-k;dc<=k;dc++)out.push((r+dr)*W+c+dc);return out;};
export const TITLES={source:'Heightmap',smooth:'Mean smoothing',slope:'Slope',roughness:'Roughness',criterion:'Slope criterion'};
export function buildBelief(ds,heights,quality,smoothed=false,limit=15){
 const {W,H,res}=ds,base=Float64Array.from(heights),values={source:base};
 const ops={source:{input:null,method:'Delivered height estimates',unit:'m',cells:(r,c)=>[r*W+c]}};
 function calc(name,radius,compute){const out=new Float64Array(W*H).fill(NaN);for(let r=radius;r<H-radius;r++)for(let c=radius;c<W-radius;c++)out[r*W+c]=compute(r,c);values[name]=out;}
 if(smoothed){ops.smooth={input:'source',method:'Mean of 3 × 3 input cells',unit:'m',cells:(r,c)=>square(r,c,1,W)};calc('smooth',1,(r,c)=>{let total=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)total+=base[(r+dr)*W+c+dc];return total/9;});}
 const input=smoothed?'smooth':'source',h=values[input],margin=smoothed?2:1;
 ops.slope={input,method:'Horn gradient · eight neighbours in a 3 × 3 window',unit:'°',cells:(r,c)=>square(r,c,1,W).filter(i=>i!==r*W+c)};
 calc('slope',margin,(r,c)=>{const k=r*W+c,a=h[k-W-1],b=h[k-W],cc=h[k-W+1],d=h[k-1],f=h[k+1],g=h[k+W-1],hh=h[k+W],i=h[k+W+1];return Math.atan(Math.hypot((cc+2*f+i-a-2*d-g)/(8*res),(g+2*hh+i-a-2*b-cc)/(8*res)))*180/Math.PI;});
 ops.roughness={input,method:'Height standard deviation · 5 × 5 window, including tilt',unit:'m',cells:(r,c)=>square(r,c,2,W)};
 calc('roughness',smoothed?3:2,(r,c)=>{let sum=0,sum2=0;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){const z=h[(r+dr)*W+c+dc];sum+=z;sum2+=z*z;}return Math.sqrt(Math.max(0,sum2/25-(sum/25)**2));});
 ops.criterion={input:'slope',method:`Compare slope ≤ ${limit}° · illustrative limit`,unit:'',cells:(r,c)=>[r*W+c]};
 values.criterion=Float64Array.from(values.slope,v=>Number.isFinite(v)?+(v<=limit):NaN);
 function support(node,r,c){const op=ops[node];if(!op.input)return [r*W+c];const set=new Set();for(const k of op.cells(r,c))for(const i of support(op.input,Math.floor(k/W),k%W))set.add(i);return [...set].sort((a,b)=>a-b);}
 function inspect(node,r,c){const indices=support(node,r,c),flagged=quality?indices.filter(i=>quality[i]===3).length:null;return {node,title:TITLES[node],value:values[node][r*W+c],unit:ops[node].unit,method:ops[node].method,indices,total:indices.length,flagged,unknownHistory:indices.length,row:r,col:c};}
 const flagged={};
 if(quality){for(const node of Object.keys(ops)){const out=new Uint8Array(W*H),radius=node==='source'?0:node==='smooth'?1:node==='roughness'?(smoothed?3:2):(smoothed?2:1),omitCentre=!smoothed&&(node==='slope'||node==='criterion');for(let r=radius;r<H-radius;r++)for(let c=radius;c<W-radius;c++){let n=0;for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++){if(omitCentre&&dr===0&&dc===0)continue;if(quality[(r+dr)*W+c+dc]===3)n++;}out[r*W+c]=n;}flagged[node]=out;}}
 const sourceCount={source:1,smooth:9,slope:smoothed?25:8,roughness:smoothed?49:25,criterion:smoothed?25:8};
 return {ds,heights:base,quality,values,ops,smoothed,limit,inspect,flagged,sourceCount};
}
