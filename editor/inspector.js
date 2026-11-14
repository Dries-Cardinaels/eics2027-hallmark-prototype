import {routeRMSText,largestRMSSources} from './route-rms.js';
import {rmsReviewVisibility,rmsReviewState,summariseRMSReview,rmsReviewText} from './rms-review.js';
import {costHexColour} from './surface-map.js';
import {contrastColour} from './palette.js';
import {qualityLabel,lolaReturnState} from '../src/core/index.js';
import {qualityVisibility} from './quality-visibility.js';
import {planningBranchLabel,matchesEnabled,hasMatchPriority} from './planning-priority.js';
import {TRAVERSAL_COST} from './planner.js';
import {displayMetres} from './display-units.js';
import {hasSourceCounts,sourceGapLabel,surveyLabel} from './case-presentation.js';
import {NUMERIC_EVIDENCE,evidenceNumber} from './source-evidence.js';

export const layerNames = {
  heights: 'Heights', slope: 'Slope', roughness: 'Height spread',
  'slope-criterion': 'Slope limit', 'roughness-criterion': 'Height spread limit', combined: 'Combined result', 'traversal-cost':'Traversal cost', 'height-support':'Flagged input fraction',
};

export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const qualityCodeText=(code,dataset)=>qualityLabel(code,dataset.quality)+(dataset.matchtags?' · mask ':' · code ')+code;
const numericCellText=(cell,key,unit)=>{const value=cell?.[key];return Number.isFinite(value)?`<span title="Raw supplier value: ${value} ${unit}">${key==='height'?value.toFixed(2):evidenceNumber(value)} ${unit==='returns'&&value===1?'return':unit}</span>`:'Unknown';};
const lolaReturnText=cell=>{const r=cell?.lolaReturn;if(!r?.label)return 'Unknown';return escapeHTML(r.label)+(r.state==='present'?` <span title="Raw supplier count: ${r.count}">· count ${r.count}</span>`:'');};
const lolaLayerName=dataset=>escapeHTML(dataset.lolaReturns?.layer||'LOLA returns per cell');
function lolaSummaryHTML(summary,dataset){
 if(!summary?.text)return '';
 const unknown=summary.unknown?`<small class="lola-return-unknown">${summary.unknown} of ${summary.total} source heights: ${escapeHTML(dataset.lolaReturns?.labels?.unknown||'Unknown')}</small>`:'';
 return `<div class="fact lola-return-summary"><dt>Input LOLA returns</dt><dd><span class="lola-return-text">${escapeHTML(summary.text)}</span>${unknown}<small>${summary.known} / ${summary.total} known</small></dd></div>`;
}
const reviewClass=(value,threshold)=>threshold===null?'':`rms-review-${rmsReviewState(value,threshold)}`;
const reviewRMSNumber=(value,threshold)=>Number(evidenceNumber(value))<=threshold&&value>threshold?String(value):evidenceNumber(value);
const reviewLabel=(value,threshold)=>threshold===null?'':rmsReviewState(value,threshold)==='trigger'?`Review: RMS ${reviewRMSNumber(value,threshold)} m > your ${threshold} m threshold`:rmsReviewState(value,threshold)==='unknown'?'RMS unknown':'No review trigger';
export function rmsReviewHTML(snapshot,threshold,routeSummary=null){
 if(!snapshot.dataset.heightRMS||threshold===null)return '';
 const summary=summariseRMSReview(snapshot.sources,threshold),triggering=snapshot.sources.filter(cell=>rmsReviewState(cell.heightRMS_m,threshold)==='trigger');
 const source=snapshot.record.kind==='source';
 const routeDetails=routeSummary?.scopes?routeSummary.scopes.filter(scope=>scope.node==='heights'?(scope.triggered>0||scope.unknown>0):scope.node!==snapshot.selection.layerId).map(scope=>`${scope.label}: ${rmsReviewText(scope)}`).join('; '):routeSummary&&(routeSummary.total!==summary.total||routeSummary.triggered!==summary.triggered||routeSummary.unknown!==summary.unknown)?rmsReviewText(routeSummary):'';

 return `<section class="rms-review-summary ${summary.triggered?'rms-review-trigger':''}" aria-label="Operator RMS review"><strong>Your RMS review rule</strong><p title="${source?`Raw supplier RMS ${snapshot.heightHere?.heightRMS_m} m; operator threshold ${threshold} m`:'Exact declared native height support'}">${source?reviewLabel(snapshot.heightHere?.heightRMS_m,threshold):rmsReviewText(summary)}.</p>${routeDetails&&!source?`<small>Route review: ${routeDetails}.</small>`:''}${triggering.length&&!source?`<details class="rms-review-sources"><summary>${triggering.length} triggering source cell${triggering.length===1?'':'s'}</summary>${triggering.map(cell=>`<button data-review-source="${cell.index}" title="Raw supplier RMS ${cell.heightRMS_m} m > ${threshold} m" aria-label="Inspect review-triggering height cell ${cell.row}, ${cell.col}, RMS ${cell.heightRMS_m} metres">${cell.row}, ${cell.col} · ${reviewRMSNumber(cell.heightRMS_m,threshold)} m ↗</button>`).join('')}</details>`:''}<small>Operator threshold · strict RMS &gt; ${threshold} m · display only${summary.unknown?` · ${summary.unknown} unknown RMS; no trigger inferred`:''}.</small></section>`;
}
function heightEvidenceHTML(snapshot,layer,routeSelected=false){
 const {dataset,record,heightHere:here}=snapshot;if(!dataset.heightRMS)return '';
 const info=NUMERIC_EVIDENCE[layer],summary=record.kind==='source'?null:record.inputHeightRMS;
 const largest=largestRMSSources(snapshot.sources);
 const inspectLargest=summary&&largest.length?`<button data-largest-rms aria-label="Inspect the supporting height cell with the largest supplied height RMS">Inspect largest RMS ↗</button><small>${largest.length>1?`${largest.length} tied cells · first in grid order`:`Cell ${largest[0].row}, ${largest[0].col}`} · ${evidenceNumber(largest[0].heightRMS_m)} m</small>`:'';
 const primary=info&&!routeSelected?`<div class="source-evidence-primary"><strong>${info.title}</strong><b>${numericCellText(here,info.cellKey,info.unit)}</b><small>Map cell ${here?.cell.row ?? '—'}, ${here?.cell.col ?? '—'} · native ${dataset.res} m source grid</small></div>`:'';
 return `${primary}<section class="height-evidence" aria-label="Supplier height evidence"><dl class="facts"><div class="fact"><dt>Height here</dt><dd>${numericCellText(here,'height','m')}</dd></div><div class="fact"><dt>Height RMS here</dt><dd>${numericCellText(here,'heightRMS_m','m')}</dd></div><div class="fact lola-return-cell"><dt>${lolaLayerName(dataset)}</dt><dd>${lolaReturnText(here)}</dd></div>${record.kind==='source'?'':lolaSummaryHTML(record.inputLolaReturns,dataset)}${summary?`<div class="fact"><dt>Input height RMS</dt><dd title="Raw supplier range: ${summary.min}–${summary.max} m">${summary.known?`${evidenceNumber(summary.min)}–${evidenceNumber(summary.max)} m`:'Unknown'}<small>${summary.known} / ${summary.total} known</small></dd></div>`:''}</dl>${inspectLargest}<p>Height RMS is the supplier’s value for input heights, in meters. It is not a slope or height spread value.</p></section>`;
}
function categoricalKeyHTML(dataset){
 if(!dataset.quality||dataset.quality.kind==='arcticdem-bitmask')return '';
 return `<details class="source-code-key"><summary>Supplied cell code key</summary><dl>${[0,1,2,3,4,'10–14',15].map(code=>`<div><dt>${code}</dt><dd>${code==='10–14'?'Successful correlation':qualityLabel(code,dataset.quality)}${code===3?' (edge, corner, did not correlate, etc.)':code===4?' (e.g. from neighboring pixels)':''}</dd></div>`).join('')}</dl><p>Codes 10–14 do not guarantee accuracy and are not confidence percentages. Earlier history unknown does not change a supplied quality code.</p>${dataset.qualityReadmeURL?`<a href="${escapeHTML(dataset.qualityReadmeURL)}" target="_blank" rel="noopener">Source README &amp; code definitions ↗</a>`:''}</details>`;
}

// Inherited evidence of a derived result from supplier quality codes (D7): "suspicious in k of n
// source heights" for Nassau's codes; the ArcticDEM bitmask keeps its own term.
const inheritedFlagText=(q,dataset)=>`${dataset?.quality?.kind==='arcticdem-bitmask'?'flagged by the supplier mask':'suspicious'} in ${q.suspicious} of ${q.total} source heights · ${q.known??q.total} / ${q.total} known`;

export function resultText(record) {
  if (record.outside) return 'Outside layer';
  if (record.kind==='criterion'&&record.limit===null) return 'Limit unset';
  if (!record.available) return 'Unavailable';
  if (record.kind === 'support') return `${record.quality.suspicious} / ${record.quality.total} suspicious`;
  if (record.kind === 'cost') return record.value.toFixed(3);
  if (record.kind === 'combination') return Object.values(record.outcomes).includes('unavailable') ? 'Incomplete' : Object.values(record.outcomes).includes('exceeded') ? 'Limits exceeded' : 'Within limits';
  if (record.kind === 'criterion') return record.outcome === 'exceeded' ? 'Exceeded' : 'Within limit';
  return `${record.value.toFixed(2)}${record.unit === '°' ? '°' : ' m'}`;
}

function originRows(record) {
  const names = {observed:'Observed', interpolated:'Interpolated', undocumented:'History unknown', absent:'Missing'};
  return Object.entries(record.origin?.counts || {}).filter(([,count]) => count > 0).map(([origin,count]) =>
    `<div class="fact"><dt>${names[origin]}</dt><dd>${count} / ${record.sourceCells.length}</dd></div>`).join('');
}

function methodHTML(record, disclosure) {
  const labels = {cellSize_m:'Spacing',window:'Window',eastWestSpacing_m:'East–west spacing',northSouthSpacing_m:'North–south spacing',estimator:'Estimator',limit:'Limit'};
  const parameters = Object.entries(record.parameters || {}).filter(([key]) => key !== 'limit').map(([key,value]) =>
    `<div class="fact"><dt>${labels[key] || escapeHTML(key)}</dt><dd>${escapeHTML(key.endsWith('_m')&&typeof value==='number'?displayMetres(value):value)}${key.endsWith('_m') ? ' m' : ''}</dd></div>`).join('');
  return `<details id="method" class="method-detail" ${disclosure.has('method')?'open':''}><summary>${escapeHTML(record.method)}</summary><p>${escapeHTML(record.calculation || record.reason)}</p><dl class="facts">${parameters}</dl></details>`;
}

export function comparisonText(value,limit,unit,outcome) {
  if(limit===null)return `${value.toFixed(2)}${unit==='°'?'°':' m'} · limit unset`;
  let shown=value.toFixed(2);
  for(let precision=3;Number(shown)===limit&&value!==limit&&precision<=6;precision++)shown=value.toFixed(precision);
  if(Number(shown)===limit&&value!==limit)shown=String(value);
  const suffix=unit==='°'?'°':' m';
  return `${shown}${suffix} ${outcome==='exceeded'?'>':'≤'} ${limit}${suffix}`;
}

function branchCards(snapshot,visibility) {
  return `<div class="branch-cards">${snapshot.inputs.map(input=>{
    const branch=Object.values(snapshot.record.branches).find(b=>b.criterionNode===input.layerId),cell=input.cells[0].cell;
    const name=layerNames[input.layerId],outcome=branch.limit===null?'Limit unset':branch.outcome==='unavailable'?'Unavailable':branch.outcome==='exceeded'?'Exceeded':'Within limit';
    return `<button class="branch-card ${branch.outcome}" data-input-layer="${input.layerId}" data-row="${cell.row}" data-col="${cell.col}" aria-label="${name}: ${outcome.toLowerCase()}"><span class="branch-name">${name}<span aria-hidden="true">↗</span></span><strong class="branch-outcome">${outcome}</strong>${branch.value===null?'':`<span class="branch-comparison" title="${branch.value} ${branch.unit}">${comparisonText(branch.value,branch.limit,branch.unit,branch.outcome)}</span>`}${visibility.affected&&branch.quality?`<span class="branch-quality"><i class="status-dot ${branch.quality.suspicious?'flagged':''}"></i>${inheritedFlagText(branch.quality,snapshot.dataset)}</span>`:''}</button>`;
  }).join('')}</div>`;
}

function sourceCount(snapshot,cell) {
  if(!cell)return undefined;
  if(snapshot.dataset.dsmSampleCounts)return cell.dsmSampleCount ?? snapshot.dataset.dsmSampleCounts[(cell.cell?.row ?? cell.row)*snapshot.dataset.W+(cell.cell?.col ?? cell.col)];
  return cell.groundCount ?? snapshot.dataset.groundCounts?.[(cell.cell?.row ?? cell.row)*snapshot.dataset.W+(cell.cell?.col ?? cell.col)];
}
const sourceCountText=(snapshot,count,short=false)=>`${count} ${snapshot.dataset.dsmSampleCounts?`${short?'':'DSM source '}sample${count===1?'':'s'}`:`${short?'':'ground '}return${count===1?'':'s'}`}`;
const isEarthSurvey=dataset=>['earth','blatten','atami'].includes(dataset.caseId);
const missingHeightText=dataset=>dataset.dsmSampleCounts?'Missing DSM height':'Missing ground height';

function inputRows(snapshot,visibility,reviewThreshold=null) {
  const largest=new Set(largestRMSSources(snapshot.sources).map(cell=>cell.index));
  const tied=largest.size>1;
  if(snapshot.record.kind==='combination')return branchCards(snapshot,visibility);
  return snapshot.inputs.map(input=>{
    if(input.layerId==='heights'){
      const rows=input.cells.map(c=>c.cell.row),cols=input.cells.map(c=>c.cell.col),r0=Math.min(...rows),c0=Math.min(...cols),W=Math.max(...cols)-c0+1,H=Math.max(...rows)-r0+1;
      const byCell=new Map(input.cells.map(c=>[`${c.cell.row},${c.cell.col}`,c]));
      if(W<=5&&H<=5){
        const buttons=[];
        for(let r=r0;r<r0+H;r++)for(let c=c0;c<c0+W;c++){
          const child=byCell.get(`${r},${c}`);
          if(!child){
            const here=snapshot.heightHere;
            buttons.push('<span class="unused-cell" aria-label="Not in the footprint">·</span>');continue;
          }
          const {cell,value,available,sourceIndex,qualityCode,stereoMatch}=child,count=sourceCount(snapshot,child);
          const quality=!visibility.heights||qualityCode===undefined?'':qualityCodeText(qualityCode,snapshot.dataset)+(stereoMatch?' · '+stereoMatch.label+' · matchtag '+stereoMatch.code:'');
          const flagged=visibility.heights&&snapshot.dataset.quality&&(snapshot.dataset.quality.flaggedCodes||[3]).includes(qualityCode);
          const review=reviewClass(child.heightRMS_m,reviewThreshold),reviewText=reviewLabel(child.heightRMS_m,reviewThreshold);
          const lola=snapshot.dataset.lolaCounts?lolaReturnState(snapshot.dataset.lolaCounts[sourceIndex]):null;
          buttons.push(`<button class="height-cell ${!available?'missing':''} ${flagged?'flagged':''} ${lola==='present'?'lola-return':lola==='none'?'no-lola-return':''} ${review}" data-hover-source="${sourceIndex}" data-input-layer="heights" data-row="${cell.row}" data-col="${cell.col}" title="${cell.row}, ${cell.col}${available?' · '+value+' m':' · missing height'}${count!==undefined?' · '+sourceCountText(snapshot,count):''}${quality?' · '+escapeHTML(quality):''}" aria-label="Height ${cell.row}, ${cell.col}: ${available?value.toFixed(3)+' m':'missing'}${count!==undefined?', '+sourceCountText(snapshot,count):''}${quality?', '+escapeHTML(quality):''}${reviewText?'; '+reviewText:''}">${available?value.toFixed(2):'×'}${count!==undefined?`<small>${sourceCountText(snapshot,count,true)}</small>`:''}${quality?`<small class="cell-code">${escapeHTML(quality)}</small>`:''}${snapshot.dataset.heightRMS?`<small title="Supplier height RMS">RMS ${numericCellText(child,'heightRMS_m','m')}</small><small>${lolaReturnText(child)}</small>${largest.has(sourceIndex)?`<small>Largest RMS${tied?' · tied':''}</small>`:''}${reviewThreshold!==null&&rmsReviewState(child.heightRMS_m,reviewThreshold)!=='no-trigger'?`<small class="cell-review-label">${rmsReviewState(child.heightRMS_m,reviewThreshold)==='trigger'?'Review':'RMS ?'}</small>`:''}`:''}</button>`);
        }
        return `${hasSourceCounts(snapshot.dataset)?`<p class="ground-input-coverage">${input.cells.filter(c=>c.available).length} / ${input.cells.length} required heights present</p>`:''}<div class="height-grid" style="--columns:${W}">${buttons.join('')}</div>`;
      }
    }
    return `<section class="input-group"><h3>${layerNames[input.layerId]||escapeHTML(input.title)}</h3>${input.cells.map(({cell,heightCell,value,unit,outcome,available})=>{
      const text=!available?'Unavailable':outcome?(outcome==='exceeded'?'Exceeded':'Within limit'):`${value.toFixed(2)}${unit==='°'?'°':' m'}`;
      return `<button class="input-row" data-input-layer="${input.layerId}" data-row="${cell.row}" data-col="${cell.col}"><span class="cell-address">${heightCell.row}, ${heightCell.col}</span><span>${text}</span><span aria-hidden="true">↗</span></button>`;
    }).join('')}</section>`;
  }).join('');
}

function resultHTML(snapshot){
  const r=snapshot.record;
  if(r.kind==='criterion'&&r.limit===null&&!r.outside)return '<div class="result unavailable">Limit unset</div>';
  if(hasSourceCounts(snapshot.dataset)&&!r.available&&!r.outside){
    return `<div class="result unavailable">${r.kind==='source'?missingHeightText(snapshot.dataset):'Incomplete'}</div>`;
  }
  if(r.kind==='support')return `<div class="result support-result ${r.available?'':'unavailable'}">${r.available?resultText(r):'Not supplied'}</div><div class="cost-meta">Combined height union · ${r.available?r.value.toFixed(3)+' flagged fraction':'quality unknown'}</div>`;
  if(r.kind==='cost')return `<div class="result cost-result ${r.available?'':'unavailable'}">${resultText(r)}</div><div class="cost-meta">Terrain density · per 1 m</div>`;
  const state=r.outside||!r.available||r.category==='incomplete'?'unavailable':r.outcome==='exceeded'||Object.values(r.outcomes||{}).includes('exceeded')?'exceeded':'within';
  if(r.kind==='criterion'&&r.available){
    const unit=snapshot.inputs[0].cells[0].unit;
    return `<div class="result criterion-result ${state}">${resultText(r)}</div><div class="comparison" title="${r.value} ${unit}">${comparisonText(r.value,r.limit,unit,r.outcome)}</div>`;
  }
  return `<div class="result ${r.kind==='combination'?'assessment-result '+state:!r.available?'unavailable':''}">${resultText(r)}</div>`;
}

function costContributionsHTML(snapshot,costRange){
  const t=snapshot.record.terms;if(!t)return '';
  const number=value=>Number.isFinite(value)?Number(value.toFixed(3)).toString():'—';
  const colour=costHexColour(snapshot.record.value,costRange),foreground=contrastColour(colour);
  const row=(label,value,detail,node)=>{
    const cell=snapshot.inputs.find(i=>i.layerId===node)?.cells[0].cell;
    const tag=cell?'button':'div',link=cell?` data-input-layer="${node}" data-row="${cell.row}" data-col="${cell.col}"`:'';
    return `<${tag} class="cost-contribution"${link}><span>${label}<small>${detail}</small></span><strong>${number(value)}${cell?' <span aria-hidden="true">↗</span>':''}</strong></${tag}>`;
  };
  const input=id=>snapshot.inputs.find(i=>i.layerId===id)?.cells[0];
  const penalty=id=>{const c=input(id);return row(id==='slope-criterion'?'Slope limit penalty':'Height spread limit penalty',c?.available?c.outcome==='exceeded'?TRAVERSAL_COST.exceeded:0:NaN,`${TRAVERSAL_COST.exceeded} if exceeded · inspect threshold`,id);};
  return `<div class="cost-contributions${Number.isFinite(snapshot.record.value)?'':' cost-unavailable'}" aria-label="Cell cost contributions" style="background-color:${colour};color:${foreground}">${row('Baseline',t.baseline,'Constant · no height inputs')}<div class="cost-group-label">Scaled values</div>${row('Slope',t.slope,`Slope / ${TRAVERSAL_COST.slopeScale}°`,'slope')}${row('Height spread',t.roughness,`Height spread / ${TRAVERSAL_COST.roughnessScale} m`,'roughness')}<div class="cost-group-label">Exceedance penalties</div>${penalty('slope-criterion')}${penalty('roughness-criterion')}</div>`;
}

export function selectionKeyHTML(snapshot,inspect=false,qualityOptions={},mapLayer=null){
  const visibility=qualityVisibility(qualityOptions);
  const source=snapshot.selection.layerId==='heights',res=displayMetres(snapshot.dataset.res);
  const dimensions=`${res} × ${res} m`;
  const name=layerNames[snapshot.selection.layerId]||snapshot.record.title,cell=snapshot.heightCell;
  const path=!source&&snapshot.pathSelection?` · Path #${snapshot.pathSelection.index+1}`:'';
  const missing=hasSourceCounts(snapshot.dataset)?snapshot.sources.filter(cell=>cell.height===null).length:0;
  const gaps=missing&&(inspect||qualityOptions.gaps)?`<span><i class="ground-gap-key"></i>${source?'Missing native height · '+sourceCountText(snapshot,sourceCount(snapshot,snapshot.heightHere||snapshot.heightCell)):missing+' missing declared height input'+(missing===1?'':'s')}</span>`:'';
  const mapInfo=NUMERIC_EVIDENCE[mapLayer];
  return `${mapInfo?`<span>Map: ${mapInfo.label} · ${numericCellText(snapshot.heightHere,mapInfo.cellKey,mapInfo.unit)}</span>`:''}<span><i class="selected-key"></i>${escapeHTML(name)} · ${cell?`${cell.row}, ${cell.col}`:'—'} · ${dimensions}${path}</span>${inspect&&!source?`<span><i class="input-key"></i>Trace: ${snapshot.sources.length} height cells · same grid</span><small>Neighboring inputs, not subdivisions.</small>`:''}${inspect&&!source&&snapshot.heightHere?.used?'<span><i class="input-key included-key"></i>Center included · height input</span>':''}${gaps}${inspect&&visibility.heights&&snapshot.dataset.quality?`<span>◇! ${snapshot.dataset.matchtags?'Flagged':'Suspicious'} height input</span>`:''}`;
}

function heightHereHTML(snapshot,visibility){
  const here=snapshot.heightHere;if(!here||snapshot.selection.layerId==='heights')return '';
  const quality=here.quality?`${qualityLabel(here.quality.code,snapshot.dataset.quality)} · ${snapshot.dataset.matchtags?'mask':'code'} ${here.quality.code}${here.stereoMatch?' · '+here.stereoMatch.label+' · matchtag '+here.stereoMatch.code:''}`:'Quality not supplied';
  const count=sourceCount(snapshot,here);
  const support=count===undefined?'':`<span class="ground-support ${count===0?'no-ground':''}">${here.height===null?missingHeightText(snapshot.dataset):here.height.toFixed(3)+' m'} · ${sourceCountText(snapshot,count)}</span>`;
  const role=here.used?'Center included · height input':'Not in the footprint';
  const inputs=snapshot.record.quality?inheritedFlagText(snapshot.record.quality,snapshot.dataset):'Not supplied';
  return `<div class="height-here"><button data-height-here aria-label="Inspect supplied height at ${here.cell.row}, ${here.cell.col}">Height here ↗</button>${support}${visibility.heights?`<span>${escapeHTML(quality)}</span>`:''}<small>${role}</small>${here.height===null?'<small>No analysis height is supplied for this cell.</small>':''}${visibility.affected?`<div class="height-dependency"><span>Input flags</span><strong>${inputs}</strong></div>`:''}</div>`;
}

function planningCellHTML(planning){
  const c=planning.cell,enabled=matchesEnabled(planning.matchSettings,planning.branch),prioritised=hasMatchPriority(planning);
  if(!c)return '';
  return `<div class="planning-cell"><small>Planning: ${planningBranchLabel(planning.branch)}</small>${enabled?`<span>${prioritised?'Priority 1 · m':'M'}atching cell <b>${c.outside?'Outside planning grid':c.match===null?'Unknown':c.match?'Yes':'No'}</b></span>`:''}<span>${prioritised?'Priority 2 · ':''}${planning.branch==='heights'?'Ground step':'Terrain density'} <b>${c.terrainCost===null?'Unavailable':planning.branch==='heights'?displayMetres(c.groundStep_m)+' m':c.terrainCost.toFixed(3)}</b></span></div>`;
}

export function heightComparisonHTML(snapshot,disclosure=new Set()){
  const {dataset,comparisonHeight:comparison}=snapshot;
  if(!comparison)return '';
  const {cell,height}=comparison;
  const currentLabel=surveyLabel(dataset);
  const row=(label,date,value,current,outside=false)=>`<div class="fact"><dt>${escapeHTML(label)}</dt><dd><strong>${outside?'Outside crop':Number.isFinite(value)?value.toFixed(2)+' m':'Missing height'}</strong><small>${escapeHTML(date||'Date not supplied')}${current?' · Current survey':''}</small></dd></div>`;
  return `<details id="height-comparison" class="height-comparison" ${disclosure.has('height-comparison')?'open':''}><summary>Height comparison</summary><dl class="facts">${row(currentLabel,dataset.source?.date||dataset.date,snapshot.heightHere?.height,true)}${row(comparison.label,comparison.date,height,false,!cell)}</dl><p>Survey cells at the same projected point. These are different surface models with separate alignment; this comparison does not estimate deposit thickness.</p></details>`;
}

export function routeRMSHTML(summary){
  if(!summary)return '';
  return `<section class="height-evidence route-rms-summary source-evidence-primary"><strong>Route max input height RMS · ${planningBranchLabel(summary.branch)}</strong><b>${evidenceNumber(summary.max)}${Number.isFinite(summary.max)?' m':''}</b><small title="Raw supplier range: ${summary.min}–${summary.max} m">${routeRMSText(summary)}</small><small>Exact planning-branch height inputs. Supplier evidence, not route uncertainty.</small></section>`;
}

export function inspectorHTML(snapshot, disclosure = new Set(['inputs']),qualityOptions={},costRange=null,planning=null,mapLayer=null) {
  const {record, selection, dataset} = snapshot;
  const visibility=qualityVisibility(hasSourceCounts(dataset)||dataset.heightRMS ? {heights:false,affected:false} : qualityOptions);
  const name = layerNames[selection.layerId] || record.title;
  const source = dataset.source || {};
  const reviewVisibility=rmsReviewVisibility(qualityOptions,dataset);
  const reviewThreshold=reviewVisibility.heights?reviewVisibility.threshold:null;
  const summaryThreshold=(record.kind==='source'?reviewVisibility.heights:reviewVisibility.results)?reviewVisibility.threshold:null;
  const largest=new Set(largestRMSSources(snapshot.sources).map(cell=>cell.index));
  const metadata = Object.entries({Product:source.product, [dataset.heightRMS?'Product / retrieval':dataset.caseId==='blatten'?'Date / edition':'Acquired']:source.date, Datum:source.datum, Grid:source.crs, Precision:source.precision, 'LOLA RMS':source.lola, ...(['earth','blatten','atami'].includes(dataset.caseId)?{'Height production':dataset.production?.method,'Survey controls':source.surveyControl,'Survey-level positional residual':source.positionalResidual,'Orthophoto credit':dataset.groundRGB?(dataset.caseId==='blatten'?'Source: FOEN, swisstopo':source.credit):null}:{}), Scope:source.scope||dataset.production?.scope,...(dataset.heightRMS?{'Reference frame':source.referenceFrame,'Native grid':source.nativeGrid,'Supplier RMS model':source.heightRMSDefinition}:{}), ...(dataset.dsmSampleCounts?{'DSM source samples':source.dsmSampleSupport||'Valid 10 cm DSM pixel centres in each 1 m square; counts describe source raster coverage.','Source spacing':source.sourceResolution,'Aggregation':source.gridding,'Survey timing':source.timing}:{}), ...(dataset.matchtags?{'Production dates':source.processing,'Acquisition & availability':source.timing,'Native crop':source.nativeGrid,'Route placement':source.endpointStatus,'Matchtag interpretation':'1 = stereo matched; 0 = interpolated. Independent of the edge/water/cloud mask; neither is calibrated uncertainty.','Processing history':dataset.history}:{}), 'Grid registration':source.crsStatus, License:source.sourceLicense||source.license}).filter(([,value]) => value).map(([key,value])=>`<div class="fact"><dt>${key}</dt><dd>${escapeHTML(value)}</dd></div>`).join('');
  return `<div class="inspector-title"><h1>${name}</h1><span class="cell-address">${snapshot.heightCell?.row ?? '—'}, ${snapshot.heightCell?.col ?? '—'}</span></div>
    ${resultHTML(snapshot)}
    ${isEarthSurvey(dataset)?`<div class="ground-survey-label">${escapeHTML([source.date||dataset.date,source.product||dataset.product].filter(Boolean).join(' · '))}</div>`:''}
    ${selection.layerId==='heights'?'':routeRMSHTML(planning?.routeCell?.inputHeightRMS)}
    ${rmsReviewHTML(snapshot,summaryThreshold,planning?.routeReview)}
    ${heightEvidenceHTML(snapshot,mapLayer,selection.layerId!=='heights'&&Boolean(planning?.routeCell?.inputHeightRMS))}
    ${dataset.id?.startsWith('lroc-nassau02')&&(visibility.heights||visibility.affected)?'<p class="height-evidence">Categorical supplied codes · code 3 flags heights; affected results use a binary input-flag selection.</p>':''}
    ${record.kind==='source'&&sourceCount(snapshot,snapshot.heightHere||snapshot.heightCell)!==undefined?`<div class="ground-source-support">${sourceCountText(snapshot,sourceCount(snapshot,snapshot.heightHere||snapshot.heightCell))}${snapshot.heightHere?.height===null?' · missing analysis height':' · median height in this 1 m square'}</div>`:''}
    ${planning?planningCellHTML(planning):''}
    ${record.kind==='cost'?costContributionsHTML(snapshot,costRange):''}
    ${heightHereHTML(snapshot,visibility)}
    ${heightComparisonHTML(snapshot,disclosure)}
    ${record.kind==='combination'?branchCards(snapshot,visibility):''}
    ${snapshot.inputs.length && !['combination','cost'].includes(record.kind) ? `<details id="inputs" ${disclosure.has('inputs')?'open':''}><summary>${snapshot.inputs[0].layerId==='heights'?'Height inputs':'Inputs'} <span>${snapshot.inputs.reduce((n,input)=>n+input.cells.length,0)}${snapshot.inputs[0].layerId==='heights'?' · '+displayMetres(dataset.res)+' m cells':''}</span></summary><div class="input-list">${inputRows(snapshot,visibility,reviewThreshold)}</div></details>` : ''}
    <dl class="facts"><div class="fact method"><dt>Method</dt><dd>${methodHTML(record, disclosure)}</dd></div>
      ${record.reason ? `<div class="fact"><dt>Status</dt><dd>${escapeHTML(record.reason)}</dd></div>` : ''}
      ${originRows(record)}
      ${record.kind==='source'?(visibility.heights?`<div class="fact"><dt>Supplied quality</dt><dd>${snapshot.heightHere?.quality?escapeHTML(qualityLabel(snapshot.heightHere.quality.code,dataset.quality))+' · '+(dataset.matchtags?'mask ':'code ')+snapshot.heightHere.quality.code:'Not supplied'}</dd></div>`:''):!snapshot.heightHere&&visibility.affected?(record.quality?`<div class="fact"><dt>Input flags</dt><dd>${inheritedFlagText(record.quality,dataset)}</dd></div>`:'<div class="fact"><dt>Input flags</dt><dd>Not supplied</dd></div>'):''}
      ${record.kind==='source'&&visibility.heights&&snapshot.heightHere?.stereoMatch?`<div class="fact"><dt>Stereo matchtag</dt><dd>${snapshot.heightHere.stereoMatch.label} · matchtag ${snapshot.heightHere.stereoMatch.code}</dd></div>`:''}
      ${!dataset.heightRMS&&record.kind==='source'?`<div class="fact"><dt>${dataset.id?.startsWith('lroc-nassau02')?'Source uncertainty':'Uncertainty'}</dt><dd>Not supplied</dd></div>`:''}
      ${record.kind!=='source'?`<div class="fact"><dt title="Uncertainty in this calculated result; not obtained from the supplied height RMS.">${dataset.heightRMS||dataset.id?.startsWith('lroc-nassau02')?'Derived uncertainty':'Uncertainty'}</dt><dd>Not estimated</dd></div>`:''}
    </dl>

    <details id="sources" ${disclosure.has('sources')?'open':''}><summary>Source cells <span>${snapshot.sources.length}</span></summary><table class="source-table"><thead><tr><th>Cell</th><th>Height</th>${hasSourceCounts(dataset)?`<th>${dataset.dsmSampleCounts?'DSM samples':'Returns'}</th>`:''}<th>${visibility.heights&&dataset.quality ? dataset.matchtags?'Mask':'Quality' : 'Origin'}</th>${visibility.heights&&dataset.matchtags?'<th>Matchtag</th>':''}${dataset.heightRMS?`<th>Height RMS (m)</th><th>${lolaLayerName(dataset)}</th>`:''}</tr></thead><tbody>${snapshot.sources.map(cell=>`<tr data-source-index="${cell.index}" class="${cell.height===null?'missing':''} ${reviewClass(cell.heightRMS_m,reviewThreshold)}"><td class="cell-address">${cell.row}, ${cell.col}</td><td>${cell.height===null?'Missing':cell.height.toFixed(hasSourceCounts(dataset)?4:3)+' m'}</td>${hasSourceCounts(dataset)?`<td>${sourceCount(snapshot,cell) ?? '—'}</td>`:''}<td>${escapeHTML(visibility.heights&&cell.quality ? qualityCodeText(cell.quality.code,dataset) : cell.origin)}</td>${visibility.heights&&cell.stereoMatch?`<td>${cell.stereoMatch.label} · ${cell.stereoMatch.code}</td>`:''}${dataset.heightRMS?`<td>${numericCellText(cell,'heightRMS_m','m')}${reviewThreshold===null?'':`<small>${reviewLabel(cell.heightRMS_m,reviewThreshold)}</small>`}${largest.has(cell.index)?`<small>Largest RMS${largest.size>1?' · tied':''}</small>`:''}</td><td>${lolaReturnText(cell)}</td>`:''}</tr>`).join('')}</tbody></table></details>
    <details id="source" ${disclosure.has('source')?'open':''}><summary>Source</summary><dl class="facts">${metadata}<div class="fact"><dt>Cell history</dt><dd>${escapeHTML(dataset.originDeclaration?.explanation || 'Not supplied')}</dd></div><div class="fact"><dt>Display</dt><dd>Cutaway base and materials are illustrative.${hasSourceCounts(dataset)?` Show ${sourceGapLabel(dataset)} marks missing native heights in Heights, and results that use missing declared height inputs on derived maps. The overlay is display only. Missing source heights remain absent from every calculation.`:''}${dataset.matchtags?' Height colors are illustrative elevation shading, not satellite imagery. The DSM includes buildings and other surface objects. Height flags and Affected results prioritize the supplier bitmask only; the separate matchtag remains available for inspection.':''}${dataset.groundRGB?' Colors come from the survey orthophoto; they do not add height measurements.':''}</dd></div></dl>${visibility.heights?categoricalKeyHTML(dataset):''}${dataset.groundCounts?'<p>Responders monitored the landslide source for further collapse and used drones to inspect the channel above search crews. Hallmark chose the rover approach and goal.</p><a class="source-link" href="https://nrifd.fdma.go.jp/publication/houkoku/121-160/files/shoho_131s.pdf#page=21" target="_blank" rel="noopener">Responders’ English abstract ↗</a> ':''}${dataset.heightRMS?`<p><a href="${escapeHTML(source.heightSource)}" target="_blank" rel="noopener">Native LDEM ↗</a> · <a href="${escapeHTML(source.heightRMSSource)}" target="_blank" rel="noopener">Height RMS ↗</a> · <a href="${escapeHTML(source.lolaSpotsSource)}" target="_blank" rel="noopener">LOLA returns per cell ↗</a> · <a href="${escapeHTML(dataset.qualityReadmeURL)}" target="_blank" rel="noopener">Supplier README ↗</a></p>`:''}${source.url ? `<a class="source-link" href="${escapeHTML(source.url)}" target="_blank" rel="noopener">${escapeHTML(source.credit || 'Producer')} ↗</a>` : ''}</details>`;
}

// The output view remains stable while a shared input is inspected.
export function pipelineHTML(snapshot, output = ['traversal-cost','height-support'].includes(snapshot.selection.layerId) ? 'traversal-cost' : 'combined') {
  const positions={heights:[32,58],slope:[112,20],roughness:[112,88],'slope-criterion':[212,20],'roughness-criterion':[212,88],combined:[325,35],'traversal-cost':[325,85]};
  const widths={heights:60,slope:70,roughness:70,'slope-criterion':92,'roughness-criterion':92,combined:96,'traversal-cost':96};
  const height=108, header=output==='traversal-cost'?18:0;
  const ids=['heights','slope','roughness','slope-criterion','roughness-criterion','combined','traversal-cost'];
  const active=new Set(snapshot.record.paths.flatMap(path=>path.nodes)), allowed=new Set(ids), targetY=positions[output][1];
  const edges=snapshot.pipeline.edges.filter(({from,to})=>allowed.has(from)&&allowed.has(to)&&(to!=='combined'&&to!=='traversal-cost'||to===output));
  const lines=edges.map(({from,to})=>{
    const [x,y]=positions[from], [tx,ty]=positions[to], start=x+widths[from]/2, end=tx-widths[to]/2;
    let d;
    if(from==='heights') d=`M${start} ${y} H70 V${ty} H${end}`;
    else if(to===output && (from==='slope'||from==='roughness')) d=`M${start} ${y} H156 V${y-18} H267 V${targetY} H${end}`;
    else if(to===output) d=`M${start} ${y} H267 V${targetY} H${end}`;
    else d=`M${start} ${y} H${end}`;
    return `<path d="${d}" class="${active.has(from)&&active.has(to)?'active':''}"><title>${layerNames[from]} → ${layerNames[to]}</title></path>`;
  }).join('');
  const nodes=ids.map(id=>{
    const op=snapshot.pipeline.byId[id];if(!op)return '';
    const [x,y]=positions[id],name=layerNames[id]||escapeHTML(op.title),symbol=op.kind==='criterion'?'≤':op.kind==='combination'?'∧':op.kind==='cost'?'Σ':op.kind==='support'?'!':op.unit;
    return `<button class="pipeline-node ${op.kind} ${header&&['slope','roughness'].includes(id)?'cost-value':''} ${header&&op.kind==='criterion'?'cost-penalty':''} ${snapshot.selection.layerId===id?'selected':''} ${active.has(id)?'on-path':''} ${id===output?'output-active':''}" data-layer="${id}" aria-label="${name}" aria-pressed="${snapshot.selection.layerId===id}" style="left:${(x-widths[id]/2)/375*100}%;top:${y-16+header}px;width:${widths[id]/375*100}%"><span class="node-symbol" aria-hidden="true">${symbol}</span><span>${name}</span></button>`;
  }).join('');
  const evidence=snapshot.dataset.quality && snapshot.pipeline.byId['height-support']?`<div class="pipeline-evidence"><span>Evidence</span><button data-layer="height-support" aria-pressed="${snapshot.selection.layerId==='height-support'}" title="Inspect supplied suspicious flags over the combined height union">Flagged input fraction <span aria-hidden="true">↗</span></button><small>Inspect source flags</small></div>`:'';
  return `<div class="pipeline-canvas" style="height:${height+header}px">${header?`<div class="pipeline-role values">Scaled values</div><div class="pipeline-role penalties">Penalty if exceeded: +${TRAVERSAL_COST.exceeded}</div>`:''}<svg preserveAspectRatio="none" viewBox="0 0 375 ${height}" style="height:${height}px;top:${header}px" aria-hidden="true">${lines}</svg>${nodes}</div>${evidence}`;
}
