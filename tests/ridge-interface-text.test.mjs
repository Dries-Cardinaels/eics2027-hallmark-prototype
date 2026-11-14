// Step 3.5: Connecting Ridge interface text for the LOLA-return label (D7; ground rules 1, 3, 5).
// Renders the inspector the way the editor does and checks the label wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadTerrain} from '../editor/data.js';
import {createSession} from '../editor/session.js';
import {inspectorHTML,selectionKeyHTML} from '../editor/inspector.js';
import {NUMERIC_EVIDENCE} from '../editor/source-evidence.js';
import {lunarScenarioHTML} from '../editor/case-presentation.js';

const BANNED=/observed|interpolated|confidence|uncertainty/i;
// The supplier's README sentence, quoted once in the Ridge source note (exempt, decided 5 Nov, 3.2).
const SUPPLIER_QUOTE='with interpolation filling empty pix';
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
const element=(html,cls)=>{const m=html.match(new RegExp(`<div class="fact ${cls}">[\\s\\S]*?</dd></div>`));assert.ok(m,`${cls} rendered`);return m[0];};

let ridge;
async function loadRidge(){
 if(ridge)return ridge;
 const original=globalThis.fetch;globalThis.fetch=async url=>new Response(await readFile(new URL(url)));
 try{ridge=await loadTerrain('connecting-ridge','ground');}finally{globalThis.fetch=original;}
 return ridge;
}
const render=(ds,layerId,cell={row:0,col:13})=>{const snap=createSession(ds,{selection:{layerId,cell}}).getSnapshot();return {snap,html:inspectorHTML(snap,new Set(['sources','source']),{},null,null,null)};};

for(const [layerId,n] of [['slope',8],['roughness',25]]){
 test(`3.5 Ridge ${layerId} selection shows LOLA return in k of ${n}, input RMS coverage and "Not estimated"`,async()=>{
  const ds=await loadRidge(),{snap,html}=render(ds,layerId),summary=snap.record.inputLolaReturns;
  assert.equal(summary.total,n);
  const label=element(html,'lola-return-summary'),cellLabel=element(html,'lola-return-cell');
  // The k-of-n text comes from the query record, which counts from the raw array (lola-return-label.test.mjs).
  assert.match(text(label),new RegExp(`^Input LOLA returns LOLA return in ${summary.present} of ${n} source heights ${summary.known} / ${n} known`));
  assert.doesNotMatch(text(label),/Horn center|excluded/);
  assert.match(text(cellLabel),/^LOLA returns per cell (no LOLA return|LOLA return in cell · count \d+)$/);
  const rms=snap.record.inputHeightRMS;assert.match(text(html),new RegExp(`Input height RMS [0-9.]+–[0-9.]+ m ${rms.known} / ${rms.total} known`));
  assert.match(text(html),/Derived uncertainty Not estimated/);
  // Ban check, strict, on the label elements and the whole supplier height evidence section (attributes included).
  const section=html.match(/<section class="height-evidence"[\s\S]*?<\/section>/)[0];
  for(const part of [label,cellLabel,section])assert.doesNotMatch(part,BANNED);
  // Source-cell table: LOLA column header and per-cell labels.
  assert.match(html,/<th>LOLA returns per cell<\/th>/);assert.doesNotMatch(html,/LOLA spots/);assert.doesNotMatch(text(html),/\bspots?\b/);
  for(const cell of snap.sources)assert.ok(html.includes(cell.lolaReturn.label),`source cell ${cell.row}, ${cell.col} labelled`);
  // Whole visible inspector text: only the existing "Derived uncertainty" field label and the quoted supplier note may carry these words.
  assert.ok(text(html).includes(SUPPLIER_QUOTE),'supplier README sentence quoted');
  assert.match(html,/quoted as the supplier(&#39;|')s statement/);
  const rest=text(html.replace(/<dt title="[^"]*">Derived uncertainty<\/dt>/,'')).replace(SUPPLIER_QUOTE,'');
  assert.doesNotMatch(rest,BANNED);
 });
}

test('3.5 a Ridge cell without a valid count reads "LOLA count not supplied" and is counted as unknown',async()=>{
 const base=await loadRidge(),cell={row:0,col:13},lolaCounts=[...base.lolaCounts];
 const {snap:before}=render(base,'slope',cell),target=before.sources[0].index;lolaCounts[target]=NaN;
 const {snap,html}=render({...base,lolaCounts},'slope',cell);
 assert.equal(snap.record.inputLolaReturns.unknown,1);
 assert.match(html,/LOLA count not supplied/);
 assert.match(text(element(html,'lola-return-summary')),/1 of 8 source heights: LOLA count not supplied 7 \/ 8 known/);
 assert.doesNotMatch(element(html,'lola-return-summary'),BANNED);
});

test('3.5 Ridge layer name, map key and scenario text use "LOLA returns per cell"',async()=>{
 const ds=await loadRidge(),info=NUMERIC_EVIDENCE['lola-spots'];
 assert.equal(info.label,'LOLA returns per cell');assert.equal(info.title,'Supplied LOLA returns per cell');
 for(const value of [info.label,info.title,info.meaning])assert.doesNotMatch(value,BANNED);
 const snap=createSession(ds,{selection:{layerId:'heights',cell:{row:0,col:13}}}).getSnapshot();
 assert.match(text(selectionKeyHTML(snap,true,{},'lola-spots')),/Map: LOLA returns per cell · \d+ returns?/);
 const scenario=lunarScenarioHTML(ds);assert.match(scenario,/LOLA returns per cell/);assert.doesNotMatch(scenario,/LOLA spots|interpolated|uncertainty/i);
 const index=await readFile(new URL('../editor/index.html',import.meta.url),'utf8');assert.match(index,/<option value="lola-spots">LOLA returns per cell<\/option>/);assert.doesNotMatch(index,/LOLA spots|measurement spots/);
});
