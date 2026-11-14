import {highestRouteRMS,largestRMSSources} from './route-rms.js';
import {rmsReviewFromParams,parseRMSReview,writeRMSReviewParam,rmsRouteReviewContext,rmsReviewTogglesFromParams,writeRMSReviewToggleParams} from './rms-review.js';
import {palette,paletteOptions,setPalette,activePalette} from './palette.js';
import {createProposedPath,defaultPlanEndpoints,proposedPathHTML,proposedPathSummary} from './proposed-path.js';
import {createPlanningGrid,planningCell} from './planner.js';
import {planningBranchLabel} from './planning-priority.js';
import {createSupervisoryPlan} from './supervisory-plan.js';
import {planControlsHTML} from './plan-controls.js';
import {compareRoutes,routeComparisonHTML} from './route-comparison.js';
import {pathEvidenceScope,pathAssessmentLayer} from './path-evidence.js';
import {loadTerrain,availableSurfaces} from './data.js';
import {loadFields} from './fields.js';
import {createSurfaceMap,sampleSurfaceMap,mapNode,qualityLayersFromParams} from './surface-map.js';
import {evaluateLimitRasters} from '../src/core/limit-rasters.js';
import {mapLegendHTML} from './map-legend.js';
import {createSession} from './session.js';
import {traversalCostField,heightSupportField} from './traversal-cost.js';
import {layerGrid, cellCenter, cellCoordinates} from './spatial.js';
import {createTerrainView} from './view3d.js';
import {createLocator} from './locator.js';
import {inspectorHTML, pipelineHTML, layerNames, resultText,selectionKeyHTML} from './inspector.js';
import {initialViewState,earthRestartView,preferredSurface} from './view-state.js';
import {terrainCaseId,isEarthCase,scenarioLimitsText,blattenScenarioHTML,nuugaatsiaqScenarioHTML,lunarScenarioHTML,hasSourceCounts,sourceGapLabel} from './case-presentation.js';
import {displayMetres} from './display-units.js';
import {isNumericEvidence,NUMERIC_EVIDENCE} from './source-evidence.js';
import {flaggedRouteInspection} from './flagged-route-inspection.js';
import {isPaperConfiguration,paperCaseId,PAPER_LIMITS,PAPER_REMOVED_IDS,PAPER_REMOVED_LAYERS,paperMapLayer,paperPipeline,paperRoute,paperRouteEndpoints,paperExportPath,PAPER_ROUTE_RULE,PAPER_ROUTE_NOTE} from './paper-config.js';

const params = new URL(location.href).searchParams;
// Paper configuration (?paper=1, step 6.1): hidden features are removed from the document but kept
// detached, so shared code keeps running unchanged and nothing is deleted from the editor.
const paper=isPaperConfiguration(params),detached=[];
const $ = id => document.getElementById(id) ?? findDetached(id);
function findDetached(id){for(const element of detached){if(element.id===id)return element;const inner=element.querySelector(`[id="${id}"]`);if(inner)return inner;}return null;}
if(paper){
  for(const id of PAPER_REMOVED_IDS){const element=document.getElementById(id);if(element){detached.push(element);element.remove();}}
  for(const value of PAPER_REMOVED_LAYERS)document.querySelector(`#layer option[value="${value}"]`)?.remove();
  document.documentElement.dataset.configuration='paper';
  document.querySelector('.brand')?.setAttribute('href','./?paper=1');
  const heading=document.querySelector('#path-section .path-heading');if(heading?.firstChild)heading.firstChild.textContent='Illustrative route ';
  $('path-section').setAttribute('aria-label','Illustrative route');
}
function applyPalette(id){
  const option=setPalette(id);
  document.documentElement.dataset.palette=option.id;
  for(const [key,value] of Object.entries(palette))document.documentElement.style.setProperty('--colour-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);
  const noReturnX=`<svg xmlns='http://www.w3.org/2000/svg' width='9' height='9'><path d='M2,2L7,7M7,2L2,7' stroke='${palette.evNoneHatch}' stroke-width='1.5' stroke-linecap='round'/></svg>`;
  document.documentElement.style.setProperty('--ev-none-pattern',`url("data:image/svg+xml,${encodeURIComponent(noReturnX)}")`);
  document.documentElement.style.setProperty('--within',palette.withinBorder);
  document.documentElement.style.setProperty('--exceeded',palette.exceededBorder);
  for(const input of $('palette').querySelectorAll('input'))input.checked=input.value===option.id;
}
$('palette').innerHTML=paletteOptions.map(p=>`<label><input type="radio" name="palette" value="${p.id}"><span>${p.label}</span></label>`).join('');
applyPalette(paper?null:params.get('palette'));
$('palette').addEventListener('change',event=>{applyPalette(event.target.value);if(session)render();});
let caseId = paper ? paperCaseId(params.get('case')) : terrainCaseId(params.get('case'));
let surface = params.get('surface');
let surfaces=[];
let proposedPath,previousPath,comparison,displayedPathDataset,plan,planningGrid,picking=null,costDetailsOpen=false,terrainBranch=null;
let session, snapshot, fields, valueFields, request = 0, loading = false;
const initialView=initialViewState(params,caseId);
let mapLayer=paper?paperMapLayer(initialView.layer):initialView.layer,showLidarGaps=paper?false:initialView.showLidarGaps;
let pipelineOutput = ['traversal-cost','height-support'].includes(mapLayer) ? 'traversal-cost' : 'combined';
if(!['assessment','terrain','slope','roughness','slope-criterion','roughness-criterion','quality','traversal-cost','height-support'].includes(mapLayer)&&!isNumericEvidence(mapLayer))mapLayer='assessment';
let previousEvidenceMap=isNumericEvidence(mapLayer)?'slope':'assessment',lastNumericEvidence='height-rms';
const qualityLayers=qualityLayersFromParams(params);
let rmsReviewThreshold=paper?null:rmsReviewFromParams(params);
const rmsReviewToggles=rmsReviewTogglesFromParams(params);
const initialBranch=initialView.branch;
terrainBranch=initialBranch;
const mappedNode = () => mapNode(mapLayer);
const initialLimits = paper ? {...PAPER_LIMITS} : {};
const limitsByCase = new Map([[caseId,initialLimits]]);
for(const [param,key,max] of [['slope','slopeDeg',90],['rough','roughness_m',Infinity]]){
  const value=Number(params.get(param));if(params.get(param)?.trim()&&Number.isFinite(value)&&value>=0&&value<=max)initialLimits[key]=value;
}
const disclosure = new Set();
let scenarioDetailsOpen=false;
let inspecting=false;
const view = createTerrainView($('terrain-view'), {
  onPick: point => pickTerrain(point),
  onPathPick: index => selectPath(index),
  onSourcePick: index => {
    if(!snapshot||loading)return;
    if(snapshot.sources.some(source=>source.index===index))update({type:'source',index});
    else if(snapshot.heightCell?.row*snapshot.sourceGrid.W+snapshot.heightCell?.col===index)update({type:'layer',layerId:'heights'});
  },
  onMove: delta => update({type:'move', ...delta}),
});

const locator=createLocator($('locator'),point=>{pickTerrain(point);if(inspecting)view.focus();});

function pickTerrain(point){
  if(!session||loading)return;
  if(picking){const role=picking;picking=null;changePlan({type:'endpoint',role,cell:cellCoordinates(snapshot.sourceGrid,point)});}
  else update({type:'pick',point,layerId:mappedNode()});
}

function syncPath(){
  const planning=plan.getSnapshot(),route=planning.route,previous=planning.previous?.route;
  planningGrid=createPlanningGrid(snapshot.dataset,fields,[],planning);
  const configuration={branch:planning.branch,matchSettings:planning.matchSettings,grid:planningGrid,active:true};
  proposedPath=route?createProposedPath(snapshot.dataset,fields,route.vertices,route,configuration):null;
  previousPath=previous?createProposedPath(snapshot.dataset,fields,previous.vertices,previous,configuration):null;
}

function changePlan(action){
  if(paper||!plan||loading)return; // the paper route is fixed: no planning actions
  try{
    const before=plan.getSnapshot().revision,next=plan.dispatch(action);
    if(next.revision!==before){
      inspecting=false;disclosure.delete('inputs');
      session.dispatch({type:'pick',point:snapshot.point,layerId:mappedNode()});
    }
    syncPath();render();
  }catch(error){$('error').textContent=error.message;}
}

function render() {
  snapshot = session.getSnapshot();
  const supportScope=pathEvidenceScope(mapLayer);
  const planning={...plan.getSnapshot(),objectiveOrder:planningGrid.objectiveOrder,matchesKnown:planningGrid.matchesKnown};
  const evidenceOptions={...qualityLayers,...rmsReviewToggles,rmsReview:rmsReviewThreshold};
  const routeReview=rmsRouteReviewContext(snapshot.dataset,planning.branch,evidenceOptions,snapshot.pipeline);
  $('rms-review-controls').hidden=!snapshot.dataset.heightRMS;
  for(const [key,id,label] of [['rmsHeights','rms-review-heights','height cells'],['rmsResults','rms-review-results','affected results']]){
    const button=$(id);button.hidden=!snapshot.dataset.heightRMS;
    button.disabled=loading||rmsReviewThreshold===null;
    button.setAttribute('aria-pressed',String(rmsReviewToggles[key]));
    button.title=rmsReviewThreshold===null?'Set an RMS review threshold in the sidebar to mark '+label:`Your operator RMS > ${rmsReviewThreshold} m review: ${key==='rmsHeights'?'native height cells, including traced sources and own route heights':'results using triggering heights, including planning inputs on the route'}. Display only; not supplied flags.`;
  }

  $('rms-review-threshold').disabled=loading;
  if(document.activeElement!==$('rms-review-threshold'))$('rms-review-threshold').value=rmsReviewThreshold??'';
  $('rms-review-clear').disabled=loading||rmsReviewThreshold===null;
  $('rms-review-status').textContent=rmsReviewThreshold===null?'Unset':`RMS > ${rmsReviewThreshold} m`;
  comparison=paper?null:compareRoutes(previousPath,proposedPath,supportScope,planning);
  $('layer').value = mapLayer;
  const {slopeDeg,roughness_m}=snapshot.limits;
  const earthLimits=isEarthCase(snapshot.dataset);
  const comparisons=[slopeDeg===null?null:`Slope ≤ ${slopeDeg}°`,roughness_m===null?null:`Height spread ≤ ${roughness_m} m`].filter(Boolean);
  $('limits-title').textContent='Scenario limits';
  $('limit-source').hidden=false;
  $('limit-source').textContent=scenarioLimitsText(snapshot.dataset,snapshot.limits);
  $('limits-summary').textContent=comparisons.length?comparisons.join(' · ')+' · scenario setting':'Not set';
  $('path-summary').textContent=proposedPathSummary(proposedPath);
  $('path-highest-rms').hidden=!snapshot.dataset.heightRMS;
  $('path-highest-rms').disabled=loading||!highestRouteRMS(proposedPath);
  const cell=snapshot.heightCell;
  const canExclude=planningGrid.indexOf(cell)>=0&&!planning.exclusions.some(c=>c.row===cell.row&&c.col===cell.col);
  const demo=snapshot.dataset.caseId==='earth'&&snapshot.dataset.proposalStart;
  $('demo-task').hidden=false;
  if(demo){
    const restart=earthRestartView(snapshot.dataset.surface),road=snapshot.dataset.proposalStart;
    const atRoadStart=cell?.row===road.row&&cell?.col===road.col;
    const changed=planning.revision>1||mapLayer!==restart.layer||showLidarGaps!==restart.showLidarGaps||inspecting||!atRoadStart;
    $('demo-task').innerHTML=nuugaatsiaqScenarioHTML(snapshot.dataset,{changed,atRoadStart});
  }else $('demo-task').innerHTML=isEarthCase(snapshot.dataset)?blattenScenarioHTML(snapshot.dataset):lunarScenarioHTML(snapshot.dataset,{paper});
  const scenarioDetails=$('demo-task').querySelector('#scenario-details');if(scenarioDetails)scenarioDetails.open=scenarioDetailsOpen;
  if(!paper)$('plan-controls').innerHTML=planControlsHTML(planning,{picking,selectedCell:cell,canExclude,costDetailsOpen,matchesKnown:planningGrid.matchesKnown});
  for(const control of $('plan-controls').querySelectorAll('button,select'))if(loading)control.disabled=true;
  $('path-focus').disabled=loading||!proposedPath&&!previousPath;
  $('path-focus').title=paper?'Focus illustrative route':previousPath?'Focus previous and proposed routes':'Focus proposed path';
  $('terrain-view').classList.toggle('picking-endpoint',Boolean(picking));
  $('path-section').classList.toggle('tracing',inspecting);
  for(const [key,id] of [['slopeDeg','slope'],['roughness_m','roughness']]){
    const number=$(`limit-${id}`),range=$(`range-${id}`),value=snapshot.limits[key];
    if(document.activeElement!==number)number.value=value??'';
    number.placeholder='Unset';
    range.hidden=value===null;
    if(id==='roughness')range.max=Math.ceil(Math.max(1,value,valueFields.roughness.range?.[1]||1)*20)/20;
    if(value!==null)range.value=value;
  }
  $('layer').querySelector('[value="quality"]').disabled = !snapshot.dataset.quality;
  $('layer').querySelector('[value="quality"]').textContent=snapshot.dataset.matchtags?'Supplier mask':'Quality codes';
  for(const [id,info] of Object.entries(NUMERIC_EVIDENCE)){const option=$('layer').querySelector(`[value="${id}"]`);option.hidden=option.disabled=!snapshot.dataset[info.key];}
  $('numeric-evidence').hidden=!snapshot.dataset.heightRMS;
  $('numeric-evidence').disabled=loading;
  $('numeric-evidence').setAttribute('aria-pressed',String(isNumericEvidence(mapLayer)));
  $('numeric-evidence').textContent=isNumericEvidence(mapLayer)?'Hide evidence map':`Show ${NUMERIC_EVIDENCE[lastNumericEvidence].label} map`;
  $('numeric-evidence').title='Show or hide a supplier evidence map; preserve the selected result, its inputs and the planning branch.';
  $('layer').querySelector('[value="terrain"]').textContent=isEarthCase(snapshot.dataset)?'Heights':'Terrain';
  $('lidar-gaps').hidden=!hasSourceCounts(snapshot.dataset);
  $('lidar-gaps').textContent=`Show ${sourceGapLabel(snapshot.dataset)}`;
  $('lidar-gaps').title=`Show missing native ${snapshot.dataset.dsmSampleCounts?'DSM':'ground'} heights; derived maps mark results that use missing declared height inputs. Display only.`;
  $('lidar-gaps').disabled=loading;
  $('lidar-gaps').setAttribute('aria-pressed',String(showLidarGaps));
  const supportOption=$('layer').querySelector('[value="height-support"]');if(supportOption)supportOption.disabled = !snapshot.dataset.quality;
  const hasQuality=Boolean(snapshot.dataset.quality),derived=mappedNode()!=='heights';
  for(const [id,key,label] of [['height-flags','heights','Height flags'],['flags','affected','Affected results']]){
    const inapplicable=key==='affected'&&planning.branch==='heights'&&!derived;
    $(id).hidden=!hasQuality;$(id).disabled=loading||inapplicable;
    const active=qualityLayers[key]&&!inapplicable;
    $(id).setAttribute('aria-pressed',String(active));
    $(id).setAttribute('aria-label',`${label} ${active?'on':'off'}${inapplicable?' · applies to derived branches':key==='affected'&&!derived?' · overlay applies to derived maps':''}`);
  }
  if(paper){
    $('height-flags').title='Show the supplier’s suspicious height cells. Display only.';
    $('flags').title='Show results whose source heights include suspicious heights. Display only.';
  }else{
  $('height-flags').title=snapshot.dataset.matchtags?'Prioritize avoiding a route cell’s own supplied cloud / water / edge mask flag; inspect matchtag separately':'Prioritize avoiding native route cells with their own supplied height flag';
  $('flags').title=`Prioritize avoiding results affected by flagged inputs of the planning branch (${planningBranchLabel(planning.branch)}). ${derived?'Overlay follows the displayed branch.':'Overlay applies to derived maps; this planning switch stays active.'}`;
  }
  $('terrain').value = caseId;
  $('heightmap').hidden = surfaces.length<2;
  $('heightmap').value = surface;
  const pathScroll=displayedPathDataset===snapshot.dataset?($('proposed-path').querySelector('.path-cells')?.scrollLeft||0):0;
  displayedPathDataset=snapshot.dataset;
  $('route-comparison').innerHTML=routeComparisonHTML(comparison,qualityLayers);
  $('proposed-path').innerHTML=proposedPathHTML(proposedPath,snapshot.pathSelection,{comparison:Boolean(comparison),scope:supportScope,layer:mapLayer,qualityOptions:evidenceOptions,showLidarGaps,planning,reviewContext:routeReview,note:paper?PAPER_ROUTE_NOTE:null});
  const strip=$('proposed-path').querySelector('.path-cells');if(strip)strip.scrollLeft=pathScroll;
  revealPathSelection();
  $('inspector').innerHTML = inspectorHTML(snapshot, disclosure,evidenceOptions,fields['traversal-cost']?.range,{...planning,cell:paper?null:planningCell(planningGrid,snapshot.heightCell),routeReview:snapshot.pathSelection?.pathId===proposedPath?.id&&proposedPath?.cells[snapshot.pathSelection.index]?routeReview?.summary(proposedPath.cells[snapshot.pathSelection.index]):null,routeCell:snapshot.pathSelection?.pathId===proposedPath?.id?proposedPath?.cells[snapshot.pathSelection.index]:null},mapLayer);
  $('pipeline').innerHTML = pipelineHTML(snapshot,pipelineOutput);
  $('trail').innerHTML = snapshot.trail.length > 1 ? snapshot.trail.map((entry,index)=>
    index === snapshot.trail.length-1 ? `<span>${layerNames[entry.layerId]}</span>` : `<button data-back="${index}">${layerNames[entry.layerId]}</button><span class="separator">/</span>`).join('') : '';
  $('grid-status').textContent = snapshot.dataset.dsmSampleCounts
    ? `${displayMetres(snapshot.dataset.res)} × ${displayMetres(snapshot.dataset.res)} m working cells · 10 cm source pixels`
    : `${displayMetres(snapshot.dataset.res)} × ${displayMetres(snapshot.dataset.res)} m native cells · zoom adds no data`;
  $('focus').setAttribute('aria-pressed',String(inspecting));$('fit').setAttribute('aria-pressed',String(!inspecting));
  $('selection-key').innerHTML=selectionKeyHTML(snapshot,inspecting,{...evidenceOptions,gaps:showLidarGaps},mapLayer);
  $('selection-key').hidden=false;
  $('error').textContent = '';
  const map = createSurfaceMap(snapshot.dataset,fields,mapLayer,{...evidenceOptions,gaps:showLidarGaps},undefined,snapshot.pipeline);
  $('map-legend').innerHTML = mapLegendHTML(map,inspecting,planning);
  const selectedAssessment=snapshot.heightCell?sampleSurfaceMap(createSurfaceMap(snapshot.dataset,fields,pathAssessmentLayer(mapLayer),false),snapshot.heightCell):null;
  view.update(snapshot,map,{inspect:inspecting,selectedAssessment,path:proposedPath,previousPath,unchanged:comparison?.unchanged,coincident:comparison?.coincident,plan:planning,picking:Boolean(picking),reviewContext:routeReview});
  locator.update(snapshot,inspecting);
  const url = new URL(location.href);
  url.searchParams.set('case',snapshot.dataset.caseId);url.searchParams.set('surface',snapshot.dataset.surface);url.searchParams.set('map',mapLayer);
  if(!paper)url.searchParams.set('palette',activePalette);url.searchParams.set('branch',planning.branch);
  url.searchParams.set('gaps',showLidarGaps?'1':'0');
  writeRMSReviewParam(url.searchParams,rmsReviewThreshold);
  writeRMSReviewToggleParams(url.searchParams,rmsReviewToggles);
  url.searchParams.delete('flags');url.searchParams.set('heightflags',qualityLayers.heights?'1':'0');url.searchParams.set('affected',qualityLayers.affected?'1':'0');
  url.searchParams.delete('mode');
  for(const [key,value] of [['slope',slopeDeg],['rough',roughness_m]]){
    if(value===null)url.searchParams.delete(key);else url.searchParams.set(key,value);
  }
  limitsByCase.set(snapshot.dataset.caseId,{...snapshot.limits});
  history.replaceState(null,'',url);
}

function revealPathSelection(){
  const strip=$('proposed-path').querySelector('.path-cells'),button=strip?.querySelector('[aria-pressed="true"]');
  if(!button||!strip.clientWidth)return;
  const left=button.offsetLeft;if(left<strip.scrollLeft)strip.scrollLeft=left;else if(left+button.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=left+button.offsetWidth-strip.clientWidth;
  const panel=$('path-section');
  if(panel.scrollHeight>panel.clientHeight){
    const bounds=panel.getBoundingClientRect(),target=strip.getBoundingClientRect(),heading=panel.querySelector('.path-heading').offsetHeight;
    if(target.bottom>bounds.bottom)panel.scrollTop+=target.bottom-bounds.bottom;
    if(target.top<bounds.top+heading)panel.scrollTop-=bounds.top+heading-target.top;
  }
}

function update(action) {
  if (!session || loading) return;
  const pipelineFocused = document.activeElement.closest('#pipeline');
  const pathFocused=document.activeElement.closest('[data-path-cell],[data-path-step]');
  try {
    session.dispatch(action);
    if(action.type==='input'||action.type==='back'||action.type==='path-select'||action.type==='select'){
      const target=session.getSnapshot().selection.layerId;
      if(target==='combined'||target==='traversal-cost')pipelineOutput=target;
      else if(target==='height-support')pipelineOutput='traversal-cost';
      if(target==='combined')mapLayer='assessment';
      else if(target!=='heights'&&!isNumericEvidence(mapLayer))mapLayer=target;
    }
    if(action.type==='limits'){
      snapshot=session.getSnapshot();refreshLimits();
      if(!paper){
        const before=plan.getSnapshot().revision,next=plan.dispatch({type:'limits',limits:snapshot.limits,fields});
        if(next.revision!==before){inspecting=false;disclosure.delete('inputs');session.dispatch({type:'pick',point:snapshot.point,layerId:mappedNode()});}
      }
      syncPath();
    }
    render();
    if(['pick','layer','input','back','select','path-select','source'].includes(action.type))$('inspector').scrollTop=0;
    if (action.type === 'input' || action.type === 'back' || action.type === 'source') {
      const title = $('inspector').querySelector('h1');
      title.tabIndex = -1; title.focus({preventScroll:true});
    } else if(pathFocused){
      const target=$('proposed-path').querySelector(`[data-path-cell="${snapshot.pathSelection?.index}"]`);
      target?.focus({preventScroll:true});
    } else if (pipelineFocused) {
      $('pipeline').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    }
  } catch (error) {$('error').textContent = error.message;}
}

function refreshLimits(){
  fields={...valueFields,...evaluateLimitRasters(snapshot.dataset,valueFields,snapshot.limits,snapshot.pipeline)};
  refreshCosts();
}
function refreshCosts(){
  fields={...fields,'traversal-cost':traversalCostField(snapshot.dataset,fields),'height-support':heightSupportField(fields)};
}

async function openTerrain() {
  const token = ++request;
  const previousSurfaces=surfaces;
  let loadError=null;
  loading = true;
  picking=null;
  if(limitFrame)cancelAnimationFrame(limitFrame);
  limitFrame=null;pendingLimits={};
  $('error').textContent = 'Loading…';
  $('terrain').disabled = $('heightmap').disabled = true;
  for(const id of ['focus','fit','top','path-focus','path-highest-rms'])$(id).disabled=true;
  $('layer').disabled = $('flags').disabled = $('height-flags').disabled = $('lidar-gaps').disabled = true;
  for(const input of $('limit-controls').querySelectorAll('input'))input.disabled=true;
  $('terrain').value = caseId;$('heightmap').hidden = true;
  try {
    const available=await availableSurfaces(caseId);
    if(token!==request)return;
    surfaces=available;
    surface=preferredSurface(caseId,available,surface);
    $('heightmap').replaceChildren(...available.map(option=>{const element=document.createElement('option');element.value=option.id;element.textContent=option.label;return element;}));
    $('heightmap').value=surface;
    $('heightmap').hidden=available.length<2;
    const dataset = await loadTerrain(caseId, surface);
    const nextFields = await loadFields(dataset);
    if (token !== request) return;
    if(mapLayer === 'quality' && !dataset.quality)mapLayer = 'terrain';
    if(isNumericEvidence(mapLayer)&&!dataset[NUMERIC_EVIDENCE[mapLayer].key])mapLayer='terrain';
    if(mapLayer === 'height-support' && !dataset.quality)mapLayer = 'slope';
    const selected = isNumericEvidence(mapLayer)?'slope':mappedNode();
    inspecting=false;disclosure.delete('inputs');
    const sourceGrid = layerGrid(dataset,{grid:'heights'});
    const cell = dataset.caseId==='earth'&&dataset.proposalStart ? dataset.proposalStart : {row:dataset.focus[0],col:dataset.focus[1]};
    const point = cellCenter(sourceGrid,cell);
    const operation = {grid:selected==='heights'?'heights':'analysis'};
    session = createSession(dataset,{
      selection:{layerId:selected,cell:cellCoordinates(layerGrid(dataset,operation),point)},
      limits:limitsByCase.get(dataset.caseId)??(paper?{...PAPER_LIMITS}:undefined),
      ...(paper?{pipeline:paperPipeline(dataset)}:{}),
    });
    valueFields = nextFields;
    snapshot = session.getSnapshot();refreshLimits();
    // Paper configuration: one fixed transect from PAPER_ROUTE_RULE (paper-config.js); no planner runs.
    const {start,goal}=paper?paperRouteEndpoints(dataset,fields):defaultPlanEndpoints(dataset);
    plan=paper?createSupervisoryPlan(dataset,fields,{start,goal,limits:{...PAPER_LIMITS},branch:PAPER_ROUTE_RULE.branch,matchSettings:{},proposalRoute:paperRoute(dataset,fields).route})
      :createSupervisoryPlan(dataset,fields,{start,goal,limits:snapshot.limits,branch:terrainBranch||initialViewState(new URLSearchParams(),dataset.caseId).branch,matchSettings:dataset.quality?qualityLayers:{}});
    terrainBranch=null;
    if(!paper)plan.dispatch({type:'plan'});
    syncPath();
    if(proposedPath && isEarthCase(dataset)){
      const index=dataset.caseId==='earth' ? 0 : Math.floor(proposedPath.cells.length/2);
      const routePoint=cellCenter(sourceGrid,proposedPath.cells[index]);
      session.dispatch({type:'path-select',pathId:proposedPath.id,index,layerId:selected,cell:cellCoordinates(layerGrid(dataset,operation),routePoint)});
    }
  } catch (error) {
    if (token === request) {
      loadError=error.message;
      if (snapshot) {
        caseId = snapshot.dataset.caseId; surface = snapshot.dataset.surface;
        $('terrain').value = caseId;
        $('heightmap').value = surface;
        surfaces=previousSurfaces;
        $('heightmap').replaceChildren(...surfaces.map(option=>{const element=document.createElement('option');element.value=option.id;element.textContent=option.label;return element;}));
        $('heightmap').value=surface;
        $('heightmap').hidden=surfaces.length<2;
      }
      $('error').textContent = error.message;
    }
  } finally {
    if (token === request) {
      loading = false;
      for(const id of ['focus','fit','top'])$(id).disabled=false;
      $('terrain').disabled = $('heightmap').disabled = $('layer').disabled = $('height-flags').disabled = false;
      $('flags').disabled=false;
      for(const input of $('limit-controls').querySelectorAll('input'))input.disabled=false;
      if(session){render();if(!loadError){$('inspector').scrollTop=0;if(snapshot.dataset.gapCell)view.fit();}}
      if(loadError)$('error').textContent=loadError;
    }
  }
}

function selectPath(index,layerId=mappedNode()){
  if(!proposedPath||loading)return;
  const cell=proposedPath.cells[index];if(!cell)return;
  const point=cellCenter(snapshot.sourceGrid,cell);
  update({type:'path-select',pathId:proposedPath.id,index,layerId,cell:cellCoordinates(layerGrid(snapshot.dataset,snapshot.pipeline.byId[layerId]),point)});
}
$('demo-task').addEventListener('toggle',event=>{if(event.target.id==='scenario-details')scenarioDetailsOpen=event.target.open;},true);
$('demo-task').addEventListener('click',event=>{
  if(!snapshot||loading)return;
  if(event.target.closest('[data-demo-restart]')){
    const restart=earthRestartView(snapshot.dataset.surface);terrainBranch=restart.branch;mapLayer=restart.layer;showLidarGaps=restart.showLidarGaps;pipelineOutput='combined';openTerrain();return;
  }
  const branch=event.target.closest('[data-demo-branch]')?.dataset.demoBranch;
  const flagged=event.target.closest('[data-demo-flag]');
  if(flagged){
    const target=flaggedRouteInspection(proposedPath,plan.getSnapshot().branch);
    if(!target){$('error').textContent='No flagged inputs on the proposed route for this planning branch.';return;}
    const {cell,layerId}=target;
    const point=cellCenter(snapshot.sourceGrid,cell),index=proposedPath?.cells.findIndex(c=>c.row===cell.row&&c.col===cell.col)??-1;
    const queryCell=cellCoordinates(layerGrid(snapshot.dataset,snapshot.pipeline.byId[layerId]),point);
    update(index>=0?{type:'path-select',pathId:proposedPath.id,index,layerId,cell:queryCell}:{type:'select',layerId,cell:queryCell});
    inspectInputs();return;
  }
  const gap=event.target.closest('[data-demo-gap]');
  const road=event.target.closest('[data-demo-road]');
  if(!branch&&!gap&&!road)return;
  const cell=gap?snapshot.dataset.gapCell:road?snapshot.dataset.proposalStart:snapshot.heightCell;
  if(!cell)return;
  const layerId=branch||mappedNode(),point=cellCenter(snapshot.sourceGrid,cell);
  const target=cellCoordinates(layerGrid(snapshot.dataset,snapshot.pipeline.byId[layerId]),point);
  const index=proposedPath?.cells.findIndex(c=>c.row===cell.row&&c.col===cell.col)??-1;
  update(index>=0?{type:'path-select',pathId:proposedPath.id,index,layerId,cell:target}:{type:'select',layerId,cell:target});
  if(road){inspecting=false;disclosure.delete('inputs');render();view.fit();}else inspectInputs();
});
$('path-section').addEventListener('click',event=>{
  if(event.target.closest('[data-path-highest-rms]')){
    if(loading)return;const cell=highestRouteRMS(proposedPath);if(!cell)return;
    const evidenceLayer=mapLayer;selectPath(cell.index,proposedPath.configuration.branch);
    mapLayer=evidenceLayer;disclosure.add('sources');inspectInputs();return;
  }
  if(event.target.closest('[data-path-focus]')){if(loading)return;inspecting=false;disclosure.delete('inputs');render();view.focusPath();return;}
  const pick=event.target.closest('[data-path-cell]'),step=event.target.closest('[data-path-step]');
  if(pick)selectPath(Number(pick.dataset.pathCell));
  else if(step)selectPath(Math.max(0,(snapshot.pathSelection?.index??-1)+Number(step.dataset.pathStep)));
});
$('plan-controls').addEventListener('click',event=>{
  if(loading)return;
  const endpoint=event.target.closest('[data-plan-pick]');
  if(endpoint){picking=picking===endpoint.dataset.planPick?null:endpoint.dataset.planPick;render();return;}
  const action=event.target.closest('[data-plan-action]')?.dataset.planAction;
  if(action==='cancel'){picking=null;render();}
  else if(action==='exclude')changePlan({type:'exclude',cell:snapshot.heightCell});
  else if(action){picking=null;changePlan({type:action});}
});
$('plan-controls').addEventListener('toggle',event=>{if(event.target.id==='plan-cost')costDetailsOpen=event.target.open;},true);
$('proposed-path').addEventListener('keydown',event=>{
  if(!event.target.closest('[data-path-cell]'))return;
  const current=Number(event.target.closest('[data-path-cell]').dataset.pathCell);
  const next=event.key==='Home'?0:event.key==='End'?proposedPath.cells.length-1:event.key==='ArrowLeft'?current-1:event.key==='ArrowRight'?current+1:null;
  if(next!==null){event.preventDefault();selectPath(Math.max(0,Math.min(proposedPath.cells.length-1,next)));}
});
function resetTerrainView(){
  const next=initialViewState(new URLSearchParams(surface?{surface}:{}),caseId);
  terrainBranch=next.branch;mapLayer=paper?paperMapLayer(next.layer):next.layer;showLidarGaps=paper?false:next.showLidarGaps;
  pipelineOutput='combined';costDetailsOpen=false;disclosure.clear();
}
$('terrain').addEventListener('change',event=>{caseId=paper?paperCaseId(event.target.value):terrainCaseId(event.target.value);surface=null;resetTerrainView();openTerrain();});
$('heightmap').addEventListener('change',event=>{surface=event.target.value;resetTerrainView();openTerrain();});
function showNumericEvidence(layer){
  if(!isNumericEvidence(mapLayer))previousEvidenceMap=mapLayer;
  lastNumericEvidence=layer;mapLayer=layer;render();$('inspector').scrollTop=0;
}
$('layer').addEventListener('change',event=>{
  const next=event.target.value;if(isNumericEvidence(next)){showNumericEvidence(next);return;}
  mapLayer=next;if(mapLayer==='assessment')pipelineOutput='combined';else if(['traversal-cost','height-support'].includes(mapLayer))pipelineOutput='traversal-cost';
  if(mapLayer!=='height-support')changePlan({type:'branch',branch:mappedNode()});update({type:'layer',layerId:mappedNode()});
});
$('numeric-evidence').addEventListener('click',()=>{
  if(!session||loading)return;
  if(isNumericEvidence(mapLayer)){mapLayer=previousEvidenceMap;render();}else showNumericEvidence(lastNumericEvidence);
});
for(const [id,key] of [['height-flags','heights'],['flags','affected']])$(id).addEventListener('click',()=>{if(session&&!loading){qualityLayers[key]=!qualityLayers[key];if(paper)render();else changePlan({type:'match-settings',matchSettings:qualityLayers});}});
$('lidar-gaps').addEventListener('click',()=>{if(session&&!loading){showLidarGaps=!showLidarGaps;render();}});
for(const [key,id] of [['rmsHeights','rms-review-heights'],['rmsResults','rms-review-results']])$(id).addEventListener('click',()=>{
  if(loading||rmsReviewThreshold===null)return;
  rmsReviewToggles[key]=!rmsReviewToggles[key];render();
});
$('rms-review-threshold').addEventListener('input',event=>{
  if(!session||loading)return;
  const input=event.target,cleared=input.value===''&&!input.validity.badInput;
  const valid=cleared||(input.validity.valid&&Number.isFinite(input.valueAsNumber)&&input.valueAsNumber>=0);
  input.setAttribute('aria-invalid',String(!valid));$('rms-review-error').hidden=valid;
  if(!valid)return;
  rmsReviewThreshold=cleared?null:parseRMSReview(input.value);
  render();
});
$('rms-review-clear').addEventListener('click',()=>{
  if(!session||loading)return;
  rmsReviewThreshold=null;$('rms-review-threshold').value='';$('rms-review-threshold').setAttribute('aria-invalid','false');$('rms-review-error').hidden=true;
  render();$('rms-review-threshold').focus();
});
$('pipeline').addEventListener('click',event=>{
  const node=event.target.closest('[data-layer]');
  if(!node || loading)return;
  const id=node.dataset.layer;
  if(id==='combined'||id==='traversal-cost')pipelineOutput=id;
  if(id==='combined')mapLayer='assessment';
  else if(id==='heights')mapLayer=mapLayer==='quality'?'quality':'terrain';
  else mapLayer=id;
  if(id!=='height-support')changePlan({type:'branch',branch:id});
  update({type:'layer',layerId:id});
});
$('trail').addEventListener('click',event=>{const button=event.target.closest('[data-back]');if(button)update({type:'back',index:Number(button.dataset.back)});});
$('inspector').addEventListener('click',event=>{
  const reviewSource=event.target.closest('[data-review-source]');
  if(reviewSource){const source=snapshot.sources.find(cell=>cell.index===Number(reviewSource.dataset.reviewSource));if(source){mapLayer='height-rms';update({type:'source',index:source.index});inspectInputs();}return;}
  if(event.target.closest('[data-largest-rms]')){const source=largestRMSSources(snapshot.sources)[0];if(source){mapLayer='height-rms';update({type:'source',index:source.index});inspectInputs();}return;}
  if(event.target.closest('[data-height-here]')){mapLayer=snapshot.dataset.quality?'quality':'terrain';update({type:'layer',layerId:'heights'});return;}
  const input = event.target.closest('[data-input-layer]');
  if(input)update({type:'input',layerId:input.dataset.inputLayer,cell:{row:Number(input.dataset.row),col:Number(input.dataset.col)}});
});
let pendingLimits={},limitFrame;
$('limit-controls').addEventListener('input',event=>{
  const input=event.target,key=input.dataset.limit;if(!key||loading)return;
  const cleared=(paper||isEarthCase(snapshot.dataset))&&input.type==='number'&&input.value===''&&!input.validity.badInput;
  const value=cleared?null:input.valueAsNumber;
  const valid=cleared||(Number.isFinite(value)&&value>=0&&(key!=='slopeDeg'||value<=90));
  input.setAttribute('aria-invalid',String(!valid));if(!valid)return;
  pendingLimits[key]=value;
  if(!limitFrame)limitFrame=requestAnimationFrame(()=>{const limits=pendingLimits;pendingLimits={};limitFrame=null;update({type:'limits',limits});});
});
$('limit-controls').addEventListener('change',event=>{
  if(event.target.getAttribute('aria-invalid')==='true'){const key=event.target.dataset.limit;event.target.value=snapshot.limits[key];event.target.setAttribute('aria-invalid','false');}
});
const previewSource = event => {const cell=event.target.closest('[data-hover-source],[data-source-index]');view.previewSource(cell?Number(cell.dataset.hoverSource ?? cell.dataset.sourceIndex):null);};
$('inspector').addEventListener('pointerover',previewSource);
$('inspector').addEventListener('focusin',previewSource);
$('inspector').addEventListener('pointerleave',()=>view.previewSource(null));
$('inspector').addEventListener('focusout',()=>view.previewSource(null));
$('inspector').addEventListener('toggle',event=>{
  if(event.target.tagName!=='DETAILS')return;
  if(event.target.open)disclosure.add(event.target.id);else disclosure.delete(event.target.id);
  if(event.target.id==='inputs'&&event.target.open&&!inspecting)inspectInputs();
},true);
function inspectInputs(){if(!snapshot||loading)return;inspecting=true;disclosure.add('inputs');render();view.focus();}
function overview(){if(!snapshot||loading)return;inspecting=false;disclosure.delete('inputs');render();view.fit();}
$('focus').addEventListener('click',inspectInputs);
$('fit').addEventListener('click',overview);
$('top').addEventListener('click',()=>{if(snapshot)view.top();});
$('export').addEventListener('click',()=>{
  if(!snapshot)return;
  if(paper){
    const route=plan.getSnapshot();
    const data={configuration:'paper',view:{layer:mapLayer,mode:mapLayer==='assessment'||mapLayer.endsWith('-criterion')?'limits':'values',qualityLayers:{...qualityLayers}},illustrativeRoute:{rule:PAPER_ROUTE_RULE,start:route.start,goal:route.goal},proposedPath:proposedPath?{...paperExportPath(proposedPath),selection:snapshot.pathSelection}:null,limits:{...snapshot.limits},heightHere:snapshot.heightHere,selection:snapshot.selection,grid:snapshot.selectedGrid,sourceGrid:snapshot.sourceGrid,query:snapshot.record};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='hallmark-query.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    return;
  }
  const data={view:{layer:mapLayer,mode:mapLayer==='assessment'||mapLayer.endsWith('-criterion')?'limits':'values',qualityLayers:{...qualityLayers},rmsReviewThreshold_m:rmsReviewThreshold,rmsReviewLayers:{heights:rmsReviewToggles.rmsHeights,results:rmsReviewToggles.rmsResults},showLidarGaps,palette:activePalette},supervisoryPlan:plan.exportPlan(),routeComparison:comparison?{...comparison,limits:{...snapshot.limits}}:null,proposedPath:proposedPath?{...proposedPath,selection:snapshot.pathSelection}:null,heightHere:snapshot.heightHere,...(snapshot.comparisonHeight?{comparisonHeight:snapshot.comparisonHeight}:{}),selection:snapshot.selection,grid:snapshot.selectedGrid,sourceGrid:snapshot.sourceGrid,query:snapshot.record};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='hallmark-query.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&picking){picking=null;render();return;}
  if(!snapshot||event.target.matches('input,select,textarea')||event.metaKey||event.ctrlKey||event.altKey)return;
  if(event.key.toLowerCase()==='f'){event.preventDefault();event.shiftKey?overview():inspectInputs();}
  if(event.key.toLowerCase()==='t'){event.preventDefault();view.top();}
});
await openTerrain();
