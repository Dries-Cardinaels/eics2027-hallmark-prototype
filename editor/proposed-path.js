import {routeRMSContext,routeRMSText} from './route-rms.js';
import {rmsReviewText} from './rms-review.js';
import {evidenceNumber} from './source-evidence.js';
import {nativeSampleCounts} from '../src/core/sample-counts.js';
import {contrastColour} from './palette.js';
import {createSurfaceMap,sampleSurfaceMap} from './surface-map.js';
import {pathSupport,pathEvidenceLabel,pathFlaggedCells,pathAssessmentScope,pathAssessmentLabel,pathDisplayText,pathDisplayColour,pathDisplayRecord} from './path-evidence.js';
import {createPlanningGrid,planningCell} from './planner.js';
import {matchesEnabled,planningBranchLabel} from './planning-priority.js';
import {qualityVisibility} from './quality-visibility.js';
import {lidarGapText} from './lidar-gaps.js';
import {displayMetres} from './display-units.js';

// Closed squares: a corner touch retains every neighbouring native cell.
export function crossedCells(vertices,W,H) {
  const result=[],seen=new Set();
  if(vertices.length===1){const {row,col}=vertices[0];if(Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&col>=0&&row<H&&col<W)return [{row,col}];}
  for(let s=0;s<vertices.length-1;s++){
    const a=vertices[s],b=vertices[s+1],hits=[];
    for(let row=Math.max(0,Math.ceil(Math.min(a.row,b.row)-.5));row<=Math.min(H-1,Math.floor(Math.max(a.row,b.row)+.5));row++)
      for(let col=Math.max(0,Math.ceil(Math.min(a.col,b.col)-.5));col<=Math.min(W-1,Math.floor(Math.max(a.col,b.col)+.5));col++){
        let enter=0,leave=1;
        for(const [v,d,lo,hi] of [[a.row,b.row-a.row,row-.5,row+.5],[a.col,b.col-a.col,col-.5,col+.5]]){
          if(d===0){if(v<lo||v>hi){leave=-1;break;}}
          else{const t1=(lo-v)/d,t2=(hi-v)/d;enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));}
        }
        if(enter<=leave+1e-12)hits.push({row,col,t:enter});
      }
    hits.sort((a,b)=>a.t-b.t||a.row-b.row||a.col-b.col);
    for(const {row,col} of hits){const key=row*W+col;if(!seen.has(key)){seen.add(key);result.push({row,col});}}
  }
  return result;
}

export function proposedVertices(dataset){
  const [row,col]=dataset.focus||[Math.floor(dataset.H/2),Math.floor(dataset.W/2)];
  return [[-8,-12],[-2,-4],[0,0],[6,10]].map(([r,c])=>({row:Math.max(2,Math.min(dataset.H-3,row+r)),col:Math.max(2,Math.min(dataset.W-3,col+c))}));
}

export function defaultPlanEndpoints(dataset){
  const vertices=proposedVertices(dataset);
  return {start:{...(dataset.proposalStart||vertices[0])},goal:{...(dataset.proposalGoal||vertices.at(-1))}};
}

export function createProposedPath(dataset,fields,vertices=proposedVertices(dataset),planning=null,configuration={}){
  const config={active:configuration.active===true,branch:configuration.branch||planning?.branch||'combined',matchSettings:configuration.matchSettings||planning?.matchSettings||{}};
  const rms=routeRMSContext(dataset,config.branch);
  const grid=configuration.grid||createPlanningGrid(dataset,fields,[],config);
  const maps=Object.fromEntries(['assessment','slope-criterion','roughness-criterion'].map(id=>[id,createSurfaceMap(dataset,fields,id,false)]));
  if(fields['traversal-cost'])maps.cost=createSurfaceMap(dataset,fields,'traversal-cost',false);
  if(fields['height-support'])maps.heightSupport=createSurfaceMap(dataset,fields,'height-support',false);
  const cells=crossedCells(vertices,dataset.W,dataset.H).map((cell,index)=>{
    const assessment=sampleSurfaceMap(maps.assessment,cell);
    const branch=id=>{const sample=sampleSurfaceMap(maps[id+'-criterion'],cell);return {value:Number.isFinite(sample.value)?sample.value:null,state:sample.state??2,incomplete:sample.outside||sample.incomplete,suspicious:sample.suspicious,total:sample.total,...(nativeSampleCounts(dataset)?{missingHeights:sample.missingHeights}:{})};};
    return {...cell,index,...(rms?{inputHeightRMS:rms.summary(cell)}:{}),height:{value:Number.isFinite(dataset.heights[cell.row*dataset.W+cell.col])?dataset.heights[cell.row*dataset.W+cell.col]:null,...(nativeSampleCounts(dataset)?{missingHeights:Number(!Number.isFinite(dataset.heights[cell.row*dataset.W+cell.col]))}:{})},priority:planningCell(grid,cell),state:assessment.state??2,incomplete:assessment.outside||assessment.incomplete,suspicious:assessment.suspicious,total:assessment.total,...(nativeSampleCounts(dataset)?{missingHeights:assessment.missingHeights}:{}),slope:branch('slope'),roughness:branch('roughness'),...(maps.cost?{cost:sampleSurfaceMap(maps.cost,cell)}:{}),...(maps.heightSupport?{heightSupport:sampleSurfaceMap(maps.heightSupport,cell)}:{})};
  });
  return {configuration:config,...(rms?{heightRMSRange:rms.range}:{}),heightKind:dataset.dsmSampleCounts?'surface':'ground',limits:{slope:fields['slope-criterion'].limit,roughness:fields['roughness-criterion'].limit},costRange:fields['traversal-cost']?.range,id:planning?.id||`${dataset.id||dataset.caseId}:proposed`,res:dataset.res,vertices,cells,...(planning?{planning}: {})};
}
const symbol=state=>state===1?'×':state===0?'●':'—';
const stateText=cell=>cell.state===1?'Exceeded':cell.state===0?'Within limits':'Unavailable';
function lidarGapRow(path,layer,enabled){
  if(!enabled||!path.cells.some(c=>c.height?.missingHeights!==undefined))return null;
  const source=['terrain','quality','heights'].includes(layer),record=c=>pathDisplayRecord(c,layer);
  return {
    id:'lidar-gaps',label:source?'Native height gaps':'Missing inputs (map)',
    value:c=>record(c)?.missingHeights>0?'●':'·',
    text:c=>record(c)?.missingHeights>0?lidarGapText(record(c).missingHeights,source,path.heightKind):record(c)?.missingHeights===null?'outside displayed result grid':'no missing native heights',
    className:c=>record(c)?.missingHeights>0?'lidar-gap-affected':'lidar-gap-clear',
  };
}
export function proposedPathSummary(path){
  if(!path)return 'No current route';
  return `${path.cells.length} cells · ${displayMetres(path.res)} × ${displayMetres(path.res)} m`;
}
export function proposedPathHTML(path,selection,{comparison=false,scope='combined',layer=null,qualityOptions={},showLidarGaps=false,planning=null,reviewContext=null,note=null}={}){
  if(!path)return note?`<p class="path-empty">No route: ${note}</p>`:'<p class="path-empty">Choose start and goal, then Plan. Unavailable terrain and excluded cells are blocked.</p>';
  if(planning)return priorityPathHTML(path,selection,{comparison,layer:layer||'assessment',showLidarGaps,planning,reviewContext,note});
  const count=key=>path.cells.filter(c=>c[key].state===1).length;
  const flagged=pathFlaggedCells(path,scope).length,hasQuality=path.cells.some(c=>pathSupport(c,scope)?.suspicious!=null),showSupport=scope!=='source'&&qualityVisibility(qualityOptions).affected,label=pathEvidenceLabel(scope);
  const selected=selection?.pathId===path.id?selection.index:-1,cell=path.cells[selected];
  const displayLayer=layer||(['slope','roughness'].includes(scope)?scope+'-criterion':scope);
  const showCost=displayLayer==='traversal-cost';
  const gapRow=lidarGapRow(path,displayLayer,showLidarGaps);
  const qualityText=c=>{const support=pathSupport(c,scope);return support?.suspicious==null?'Quality not supplied':`${label}: ${support.suspicious} of ${support.total} suspicious height inputs`;};
  return `<div class="path-tracks" data-support-scope="${scope}" data-support-visible="${showSupport}" data-assessment-scope="${pathAssessmentScope(displayLayer)??"values"}" data-cost-visible="${showCost}"><div class="path-labels">${showCost?'<span>Cost density<small>per 1 m</small></span>':''}<span>Slope limit${comparison?'':`<small>${count('slope')} exceeded</small>`}</span><span>Height spread limit${comparison?'':`<small>${count('roughness')} exceeded</small>`}</span>${showSupport?`<span>${label}${comparison?'':`<small>${hasQuality?flagged+' suspicious':'Not supplied'}</small>`}</span>`:''}${gapRow?`<span>${gapRow.label}</span>`:''}</div><div class="path-cells" aria-label="Proposed path native cells: slope, height spread${showSupport?' and '+label.toLowerCase():''}">${path.cells.map(c=>{const support=pathSupport(c,scope);return `<button data-path-cell="${c.index}" class="path-cell" aria-pressed="${c.index===selected}" aria-label="Path cell ${c.index+1}, ${c.row}, ${c.col}: ${showCost?'cost density '+pathDisplayText(c,displayLayer)+'; ':''}slope limit ${stateText(c.slope)}; height spread limit ${stateText(c.roughness)}${showSupport?'; '+qualityText(c):''}${c.incomplete?'; incomplete':''}${gapRow?'; '+gapRow.text(c):''}" title="${c.row}, ${c.col}${showSupport?': '+qualityText(c):''}">${showCost?`<span data-path-row="cost" class="cost-density" style="background:${pathDisplayColour(c.cost,displayLayer,path.costRange)};color:${contrastColour(pathDisplayColour(c.cost,displayLayer,path.costRange))}">${Number.isFinite(c.cost?.value)?Number(c.cost.value.toFixed(1)):'—'}</span>`:''}<span data-path-row="slope" class="track-state-${c.slope.state}">${symbol(c.slope.state)}</span><span data-path-row="roughness" class="track-state-${c.roughness.state}">${symbol(c.roughness.state)}</span>${showSupport?`<span data-path-row="height-inputs" class="${support?.suspicious==null?'quality-unknown':support.suspicious>0?'quality-flagged':'quality-unflagged'}">${support?.suspicious==null?'—':support.suspicious>0?'!':'·'}</span>`:''}${gapRow?`<span data-path-row="lidar-gaps" class="${gapRow.className(c)}">${gapRow.value(c)}</span>`:''}</button>`;}).join('')}</div></div><div class="path-key"><span>● Within</span><span>× Exceeded</span><span>— Unavailable</span>${gapRow?'<span><i class="ground-gap-key"></i>Missing native heights · shown map</span>':''}${showSupport?'<span>! Suspicious inputs</span><span>· No suspicious flags</span>':''}</div><div class="path-navigation"><button data-path-step="-1" ${selected<=0?'disabled':''} aria-label="Previous path cell">←</button><span class="path-selected">${cell?`#${selected+1} · ${cell.row}, ${cell.col} · ${pathDisplayText(cell,displayLayer)}`:'Select a column'}</span><button data-path-step="1" ${selected===path.cells.length-1?'disabled':''} aria-label="Next path cell">→</button></div><p class="path-role">Path colors: ${pathAssessmentLabel(displayLayer,path.cells[0]?.height?.missingHeights!==undefined && path.heightKind!=='surface')}${showSupport?`; ! = ${label.toLowerCase()}`:''}.</p>`;
}

function priorityValueRow(id){
  const label={heights:'Height (m)',slope:'Slope (°)',roughness:'Height spread (m)','slope-criterion':'Slope limit','roughness-criterion':'Height spread limit'}[id];
  const criterion=id.endsWith('-criterion'),valueId=criterion?id.replace('-criterion',''):id;
  const record=cell=>id==='heights'?cell.height:cell[valueId];
  return {
    id,label,
    value:cell=>criterion?symbol(record(cell).state):record(cell).value===null?'—':Number(record(cell).value.toFixed(1)),
    text:cell=>criterion?stateText(record(cell)):String(record(cell).value??'unavailable'),
    className:cell=>criterion?'track-state-'+record(cell).state:'branch-value',
  };
}

function priorityPathHTML(path,selection,{comparison,layer,showLidarGaps,planning,reviewContext,note=null}){
  const branch=planning.branch,selected=selection?.pathId===path.id?selection.index:-1,cell=path.cells[selected];
  const enabled=matchesEnabled(planning.matchSettings,branch),showCost=layer==='traversal-cost';
  const branches=['combined','traversal-cost'].includes(branch)?['slope-criterion','roughness-criterion']:[branch];
  const rows=[];
  if(showCost)rows.push({
    id:'cost',label:'Terrain density',className:()=> 'cost-density',
    value:c=>Number.isFinite(c.priority.terrainCost)?Number(c.priority.terrainCost.toFixed(1)):'—',
    text:c=>'terrain density '+(c.priority.terrainCost??'unavailable'),
  });
  rows.push(...branches.map(priorityValueRow));
  const hasRMS=path.cells.some(c=>c.inputHeightRMS);
  if(hasRMS)rows.push({id:'input-rms',label:'Max input RMS (m)',value:c=>Number.isFinite(c.inputHeightRMS?.max)?evidenceNumber(c.inputHeightRMS.max)+(c.inputHeightRMS.known<c.inputHeightRMS.total?'*':''):'?',text:c=>routeRMSText(c.inputHeightRMS),className:c=>c.inputHeightRMS?.known===c.inputHeightRMS?.total&&c.inputHeightRMS?.total>0?'input-rms':'input-rms rms-partial'});
  const review=reviewContext?new Map(path.cells.map(c=>[c.index,reviewContext.summary(c)])):null;
  const reviewCount=review?[...review.values()].filter(s=>s.triggered>0).length:0,unknownCount=review?[...review.values()].filter(s=>s.unknown>0).length:0;
  if(review)rows.push({id:'review',label:reviewContext.label||'Review',value:c=>review.get(c.index).triggered>0?'!'+(review.get(c.index).unknown?'?':''):review.get(c.index).unknown||!review.get(c.index).total?'?':'·',text:c=>rmsReviewText(review.get(c.index)),className:c=>review.get(c.index).triggered?'rms-review-trigger':review.get(c.index).unknown||!review.get(c.index).total?'rms-review-unknown':'rms-review-no-trigger'});
  const source=['terrain','quality','heights'].includes(layer),gapRow=lidarGapRow(path,layer,showLidarGaps),showGaps=Boolean(gapRow);
  if(gapRow)rows.push(gapRow);
  if(enabled)rows.push({
    id:'matches',label:'Matching cells',
    value:c=>c.priority.match===null?'—':c.priority.match?'!':'·',
    text:c=>c.priority.match===null?'match unknown':c.priority.match?'matches selected flags':'no match',
    className:c=>c.priority.match===null?'quality-unknown':c.priority.match?'quality-flagged':'quality-unflagged',
  });
  const n=path.cells.filter(c=>c.priority.match===true).length,known=path.cells.every(c=>c.priority.match!==null);
  const labels=rows.map(row=>`<span>${row.label}${row.id==='review'?`<small>${reviewCount} marked${unknownCount?` · ${unknownCount} unknown`:''}</small>`:row.id==='matches'&&!comparison?`<small>${known?n+' matches':'Not supplied'}</small>`:''}</span>`).join('');
  const cells=path.cells.map(c=>{
    const values=rows.map(row=>{
      const colour=row.id==='input-rms'?pathDisplayColour(pathDisplayRecord(c,'height-rms'),'height-rms',path.heightRMSRange):row.id==='cost'?pathDisplayColour(c.cost,layer,path.costRange):null;
      const style=colour?` style="background:${colour};color:${contrastColour(colour)}"`:'';
      return `<span data-path-row="${row.id}" class="${row.className(c)}"${style}>${row.value(c)}</span>`;
    }).join('');
    const description=rows.map(row=>row.label+' '+row.text(c)).join('; ');
    return `<button data-path-cell="${c.index}" class="path-cell" aria-pressed="${c.index===selected}" aria-label="Path cell ${c.index+1}, ${c.row}, ${c.col}: ${description}" title="${c.row}, ${c.col}: ${description}">${values}</button>`;
  }).join('');
  const matchText=cell?.priority.match===null?'match unknown':cell?.priority.match?'match':'no match';
  const density=cell?.priority.terrainCost===null?'unavailable':cell?.priority.terrainCost.toFixed(2);
  const selectedText=cell?`#${selected+1} · ${cell.row}, ${cell.col} · ${branch==='heights'?'ground step '+displayMetres(path.res)+' m':'terrain density '+density}${enabled?' · '+matchText:''}`:'Select a column';
  const key=(branches.some(id=>id.endsWith('-criterion'))?'<span>● Within</span><span>× Exceeded</span><span>— Unavailable</span>':'')+(showGaps?`<span><i class="ground-gap-key"></i>${source?'Missing native height':'Uses missing native heights'}</span>`:'')+(enabled?'<span>! Matching cell</span><span>· No match</span><span>— Unknown</span>':'')+(review?'<span>! Your RMS review rule</span><span>· No trigger</span><span>? RMS unknown</span>':'');
  return `<div class="path-tracks priority-tracks" style="--track-count:${rows.length}" data-planning-branch="${branch}"><div class="path-labels">${labels}</div><div class="path-cells" aria-label="Proposed route cells for the active planning branch">${cells}</div></div><div class="path-key">${key}</div><div class="path-navigation"><button data-path-step="-1" ${selected<=0?'disabled':''} aria-label="Previous path cell">←</button><span class="path-selected">${selectedText}</span><button data-path-step="1" ${selected===path.cells.length-1?'disabled':''} aria-label="Next path cell">→</button></div><p class="path-role">Path colors: ${pathAssessmentLabel(layer,path.cells[0]?.height?.missingHeights!==undefined && path.heightKind!=='surface',branch==='heights')}. ${note??'Planning branch stays fixed during inspection.'}</p>${hasRMS?`<p class="path-role">RMS row: maximum supplied height RMS over ${planningBranchLabel(path.configuration.branch)} inputs; continuous source evidence, no output uncertainty or cost. * = incomplete RMS coverage.</p>`:''}`;
}
