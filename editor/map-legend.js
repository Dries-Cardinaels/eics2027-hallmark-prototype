import {planningBranchLabel} from './planning-priority.js';
import {nativeSampleCounts} from '../src/core/sample-counts.js';
import {matchesEnabled,hasMatchPriority} from './planning-priority.js';
import {evidenceVisibility} from './evidence-geometry.js';
import {ramp,costRamp,supportRamp,qualityCategories,limitColours} from './surface-map.js';
import {escapeHTML} from './inspector.js';
import {NUMERIC_EVIDENCE,isNumericEvidence,evidenceNumber} from './source-evidence.js';

export function mapLegendHTML(map,inspect=false,planning=null) {
  const visibility=evidenceVisibility(map,inspect);
  const gapKey=map.showLidarGaps?`<span class="legend-key"><i class="ground-gap-key"></i>${map.node==='heights'?(map.dataset.dsmSampleCounts?'Missing surface height · 0 DSM samples':'Missing native height · 0 ground returns'):'Uses missing native heights'}</span>`:'';
  const tracedGaps=inspect&&nativeSampleCounts(map.dataset)?'<span class="legend-key"><i class="missing-input-key"></i>Missing traced height · display fill only</span>':'';
  const review=(map.rmsReviewSources||map.rmsReview)?`${map.rmsReviewSources?`<span class="legend-key"><i class="raw-height-flag"></i>Your RMS review: source RMS &gt; ${map.rmsReviewSources.threshold} m</span>`:''}${map.rmsReview&&map.node!=='heights'?`<span class="legend-key"><i class="flag-boundary"></i>Your RMS review: affected results · shown branch inputs &gt; ${map.rmsReview.threshold} m</span>`:''}<span class="legend-key"><i class="raised-flag"></i>! Your RMS review · route / selected / traced cells</span><span>Operator rule · display only · unknown RMS stays unknown</span>`:'';
  const flags=gapKey+tracedGaps+review+(visibility.sources?'<span class="legend-key"><i class="input-key"></i>Queried heights</span>'+(map.dataset.lolaCounts?`<span class="legend-key"><i class="ev-return-key"></i>${map.dataset.lolaReturns?.labels?.present??'LOLA return'}</span><span class="legend-key"><i class="ev-none-key"></i>${map.dataset.lolaReturns?.labels?.none??'no LOLA return'}</span>`:''):'')+(visibility.heightFlags?'<span class="legend-key"><i class="raw-height-flag"></i>Height flags · supplied</span>':'')+(visibility.regions?'<span class="legend-key"><i class="flag-boundary"></i>Affected results · input flags</span>':'')+(visibility.suspiciousSources?`<span class="legend-key"><i class="raised-flag"></i>! Traced ${map.dataset.matchtags?'flagged':'suspicious'} height · producer flag</span>`:'');
  if(isNumericEvidence(map.layer)){
    const info=NUMERIC_EVIDENCE[map.layer],range=map.field.range;
    return `<b>${info.title} · ${info.unit}</b>${range?`<span class="legend-scale"><span>${evidenceNumber(range[0])}</span><i style="background:linear-gradient(90deg,${ramp.join(',')})"></i><span>${evidenceNumber(range[1])}</span></span>`:'<span>No known values</span>'}${map.layer==='height-rms'&&planning?`<span>Route: max input height RMS (${planningBranchLabel(planning.branch)} inputs) · same scale</span><span>Background: own native-cell RMS</span>`:''}${flags}<span class="legend-key"><i class="no-result"></i>Unknown evidence</span><span class="numeric-evidence-meaning">${info.meaning}</span>`;
  }
  if(map.limits){
    const stats=map.field.stats;
    const metric=map.node==='slope-criterion'?'Slope':'Height spread';
    const title=map.node==='combined'?'Combined result':map.field.limit===null?`${metric} limit unset`:`${metric} ≤ ${map.field.limit}${map.field.unit==='°'?'°':' m'}`;
    const unset=map.node==='combined'?map.field.unsetLimits:map.field.limit===null?[metric.toLowerCase()]:[];
    if(unset?.length&&stats.incomplete===stats.total&&stats.exceeded===0){
      return `<div class="legend-heading"><b>${title}</b><span>Set ${unset.join(' and ')} to assess these cells</span></div>${flags}`;
    }
    return `<div class="legend-heading"><b>${title}</b><span>${stats.within.toLocaleString()} / ${stats.total.toLocaleString()} within limits</span></div><div class="legend-items"><span class="legend-key"><i class="within-key" style="background-color:${limitColours[0]}"></i>Within limits</span><span class="legend-key"><i class="exceeded-key" style="background-color:${limitColours[1]}"></i>Exceeded</span><span class="legend-key"><i class="no-result"></i>Incomplete / no result</span>${flags}</div>`;
  }
  if(map.layer === 'quality') return `${flags}<b>${map.dataset.matchtags?'Supplier mask · exact bits':'Supplied quality · categorical codes'}</b>${qualityCategories(map.dataset).map(({label,colour,pattern})=>`<span class="legend-key"><i class="quality-pattern-${pattern}" style="background-color:rgb(${colour.join(',')})"></i>${escapeHTML(label)}</span>`).join('')}`;
  if(map.layer === 'terrain' && map.dataset.groundRGB) {
    if(!map.dataset.groundCounts)return '<b>Heights · survey orthophoto</b>'+flags+(map.dataset.caseId==='blatten'?'<span>Source: FOEN, swisstopo</span>':'');
    const fill=map.showLidarGaps?'':'<span>Gap colors interpolated</span>';
    return '<b>Heights · ground lidar survey colors</b>'+fill+flags;
  }
  if(map.layer === 'terrain'&&map.dataset.matchtags)return '<b>Heights · ArcticDEM surface</b>'+flags+'<span>Illustrative elevation shading</span>';
  if(map.layer === 'terrain') return map.dataset.groundCounts ? '<b>Heights · ground lidar survey colors</b>'+flags+'<span class="legend-key"><i class="no-result"></i>Missing ground height</span>' : flags;
  if(map.layer==='height-support')return `<b>Flagged input fraction</b>${map.field.range?`<span class="legend-scale"><span>0</span><i style="background:linear-gradient(90deg,${supportRamp.join(',')})"></i><span>1</span></span>`:'<span>Quality not supplied</span>'}${flags}`;
  if(map.layer==='traversal-cost')return `<b>Terrain cost density · per 1 m</b>${planning?`<span>${hasMatchPriority(planning)?'Fewest matching cells first · colors show terrain tie cost':matchesEnabled(planning.matchSettings,planning.branch)?'Quality not supplied · terrain cost only':'Minimize terrain cost'}</span>`:''}${map.field.range?`<span class="legend-scale"><span>${map.field.range[0].toFixed(2)}</span><i style="background:linear-gradient(90deg,${costRamp.join(',')})"></i><span>${map.field.range[1].toFixed(2)}</span></span>`:'<span>No values</span>'}${flags}<span class="legend-key"><i class="no-result"></i>Unavailable</span>`;
  const unit = map.field.unit, range = map.field.range;
  const format = value => `${Number(value.toPrecision(3))}${unit==='°'?'°':' m'}`;
  return `<b>${map.layer==='slope'?'Slope':'Height spread'}</b>${range ? `<span class="legend-scale"><span>${format(range[0])}</span><i style="background:linear-gradient(90deg,${ramp.join(',')})"></i><span>${format(range[1])}</span></span>` : '<span>No values</span>'}${flags}<span class="legend-key"><i class="no-result"></i>No result</span>`;
}
