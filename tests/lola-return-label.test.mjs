// Steps 3.3 and 3.4: the Connecting Ridge LOLA-return label (D7, option C in
// demo/research/ridge-label-design.md). Every expected number is computed here from
// the retained counts.f32; nothing is copied from the plan or the design note.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareLolaEditorData} from '../tools/prepare-lola-editor-data.mjs';
import {loadTerrain} from '../editor/data.js';
import {evaluateLazy,query,MARGIN,lolaReturnLabel,summariseLolaReturns} from '../src/core/index.js';
import {nassauQueryStrings} from './nassau-query-snapshot.mjs';

const fixture=new URL('../fixtures/lola/connecting-ridge/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',fixture)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const floats=b=>new Float32Array(b.buffer,b.byteOffset,b.length/4);

let ridge;
async function loadRidge(){
 if(ridge)return ridge;
 const original=globalThis.fetch;globalThis.fetch=async url=>new Response(await readFile(new URL(url)));
 try{ridge=await loadTerrain('connecting-ridge','ground');}finally{globalThis.fetch=original;}
 return ridge;
}

test('3.3 data prep declares the LOLA-return vocabulary; label totals equal the raw counts array',()=>{
 const out=mkdtempSync(join(tmpdir(),'hallmark-lola-label-'));
 try{
  const entry=prepareLolaEditorData(out),bytes=readFileSync(join(out,entry.lolaCountsFile));
  assert.equal(hash(bytes),manifest.layers.counts.cropSha256,'raw counts copied unchanged');
  assert.deepEqual(entry.lolaReturns.labels,{none:'no LOLA return',present:'LOLA return in cell',unknown:'LOLA count not supplied'});
  assert.equal(entry.lolaReturns.layer,'LOLA returns per cell');
  const counts=floats(bytes);assert.equal(counts.length,entry.W*entry.H);
  let zero=0,positive=0,unknown=0;for(const v of counts){if(!Number.isFinite(v)||v<0)unknown++;else if(v===0)zero++;else positive++;}
  const totals={};for(const v of counts){const {label,count}=lolaReturnLabel(v,entry.lolaReturns);totals[label]=(totals[label]??0)+1;if(label!=='LOLA count not supplied')assert.equal(count,v,'raw count kept');}
  assert.equal(totals['no LOLA return'],zero);assert.equal(totals['LOLA return in cell'],positive);assert.equal(totals['LOLA count not supplied']??0,unknown);
  assert.equal(zero+positive+unknown,entry.W*entry.H);assert.equal(totals['no LOLA return']+totals['LOLA return in cell']+(totals['LOLA count not supplied']??0),entry.W*entry.H);
  assert.ok(zero>0&&positive>0);
 }finally{rmSync(out,{recursive:true,force:true});}
});

// Rules from ridge-label-design.md ("Test plan for 3.3 and 3.4"), scanning analysis cells in row-major order.
function chooseCells(ds){
 const AW=ds.W-2*MARGIN,AH=ds.H-2*MARGIN,c=ds.lolaCounts,at=(r,col)=>c[r*ds.W+col];
 const horn=(r,col)=>[-1,0,1].flatMap(dr=>[-1,0,1].filter(dc=>dr||dc).map(dc=>(r+dr)*ds.W+col+dc));
 let rule1=null,rule2=null;
 for(let r=0;r<AH&&!(rule1&&rule2);r++)for(let col=0;col<AW;col++){
  const hr=r+MARGIN,hc=col+MARGIN,k=horn(hr,hc).filter(i=>c[i]>=1).length;
  if(!rule1&&k>=1&&k<=7)rule1={row:r,col};
  if(!rule2&&at(hr,hc)>=1&&k===0)rule2={row:r,col};
  if(rule1&&rule2)break;
 }
 return {rule1,rule2};
}
const window=(ds,cell,radius,withCentre)=>{const out=[];for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++)if(withCentre||dr||dc)out.push((cell.row+MARGIN+dr)*ds.W+cell.col+MARGIN+dc);return out;};
const present=(ds,cells)=>cells.filter(i=>ds.lolaCounts[i]>=1).length;

test('3.4 query reports LOLA return in k of 8 (slope, Horn center excluded) and k of 25 (height spread)',async()=>{
 const ds=await loadRidge(),ev=evaluateLazy(ds),{rule1,rule2}=chooseCells(ds);
 assert.deepEqual(rule1,{row:0,col:13});assert.deepEqual(rule2,{row:0,col:14});
 const expected={};
 for(const cell of [rule1,rule2]){
  const slopeCells=window(ds,cell,1,false),roughCells=window(ds,cell,2,true),center=(cell.row+MARGIN)*ds.W+cell.col+MARGIN;
  const slope=query(ev,'slope',cell),rough=query(ev,'roughness',cell);
  assert.deepEqual(slope.sourceCells.map(c=>c.index),[...slopeCells].sort((a,b)=>a-b));assert.deepEqual(rough.sourceCells.map(c=>c.index),[...roughCells].sort((a,b)=>a-b));
  assert.equal(slope.sourceCells.some(c=>c.index===center),false,'Horn center is not a declared slope input');
  assert.equal(rough.sourceCells.some(c=>c.index===center),true,'center is a declared height-spread input');
  const ks=present(ds,slopeCells),kr=present(ds,roughCells);expected[`${cell.row},${cell.col}`]={slope:ks,roughness:kr};
  assert.equal(slope.inputLolaReturns.total,8);assert.equal(slope.inputLolaReturns.present,ks);assert.equal(slope.inputLolaReturns.none,8-ks);assert.equal(slope.inputLolaReturns.unknown,0);
  assert.equal(rough.inputLolaReturns.total,25);assert.equal(rough.inputLolaReturns.present,kr);assert.equal(rough.inputLolaReturns.none,25-kr);
  assert.equal(slope.inputLolaReturns.text,`LOLA return in ${ks} of 8 source heights`);assert.equal(rough.inputLolaReturns.text,`LOLA return in ${kr} of 25 source heights`);
  assert.equal(slope.inputLolaReturns.quantity,'LOLA returns per cell');
  for(const c of rough.sourceCells){assert.equal(c.lolaSpots,ds.lolaCounts[c.index]);assert.equal(c.lolaReturn.label,ds.lolaCounts[c.index]>=1?'LOLA return in cell':'no LOLA return');}
 }
 // Measured values the design note reported for these rules; the comparison above is from the raw array.
 assert.deepEqual(expected,{'0,13':{slope:1,roughness:1},'0,14':{slope:0,roughness:1}});
 assert.ok(ds.lolaCounts[(rule2.row+MARGIN)*ds.W+rule2.col+MARGIN]>=1,'rule 2 center has a return');
});

test('3.4 a NaN count is reported as unknown, separately from no LOLA return',async()=>{
 const base=await loadRidge(),cell={row:0,col:13},slopeCells=window(base,cell,1,false);
 const target=slopeCells.find(i=>base.lolaCounts[i]===0),lolaCounts=[...base.lolaCounts];lolaCounts[target]=NaN;
 const ds={...base,lolaCounts},slope=query(evaluateLazy(ds),'slope',cell),before=summariseLolaReturns(slopeCells,base);
 assert.equal(slope.inputLolaReturns.unknown,1);assert.equal(slope.inputLolaReturns.none,before.none-1);assert.equal(slope.inputLolaReturns.present,before.present);
 assert.equal(slope.inputLolaReturns.known,7);assert.equal(slope.inputLolaReturns.total,8);
 const source=slope.sourceCells.find(c=>c.index===target);assert.equal(source.lolaSpots,null);assert.deepEqual(source.lolaReturn,{state:'unknown',count:null,label:'LOLA count not supplied'});
 assert.deepEqual(lolaReturnLabel(-1,base.lolaReturns).state,'unknown');assert.equal(lolaReturnLabel(0,base.lolaReturns).label,'no LOLA return');
});

test('3.6 Nassau query records are byte-identical to the snapshot taken before the LOLA-return change',async()=>{
 const before=JSON.parse(readFileSync(new URL('./nassau-query-snapshot.json',import.meta.url),'utf8')),after=await nassauQueryStrings();
 assert.deepEqual(Object.keys(after),Object.keys(before));
 for(const key of Object.keys(before))assert.equal(after[key],before[key],key);
});
