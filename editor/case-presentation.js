const escapeHTML=value=>String(value).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export const terrainCaseId=id=>['earth','blatten','moon','connecting-ridge'].includes(id)?id:'moon';
export const isEarthCase=value=>['earth','blatten','atami'].includes(typeof value==='string'?value:value?.caseId);
export const hasSourceCounts=dataset=>Boolean(dataset.groundCounts||dataset.dsmSampleCounts);
export const sourceGapLabel=dataset=>dataset.dsmSampleCounts?'DSM gaps':'lidar gaps';

export function surveyLabel(dataset){
  if(dataset.comparisonLabel)return dataset.comparisonLabel;
  if(dataset.caseId==='earth')return '19 June imagery · ArcticDEM surface';
  if(dataset.caseId==='atami')return dataset.surface==='july3-dsm'?'3 July video surface':'5–6 July lidar ground';
  return dataset.surveyPhase==='post-event'?'Post-event surface':dataset.surveyPhase==='pre-event'?'Pre-event ground':'Selected heightmap';
}

export function atamiScenarioHTML(dataset,{changed=false,atRoadStart=false}={}){
  if(dataset.caseId!=='atami')return '';
  const source=dataset.source||{},description=[source.date||dataset.date,source.product||dataset.product].filter(Boolean).map(escapeHTML).join(' · ');
  const credit=source.url?`<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener">${description} ↗</a>`:description;
  const road=dataset.proposalStart;
  return `<p><b>Simulated road-to-debris inspection</b><br>Review an observation point above the downstream search area. Planning and review use the selected heightmap.</p><p class="scenario-source"><b>${escapeHTML(surveyLabel(dataset))}:</b> ${credit}</p>${road&&!atRoadStart?'<button data-demo-road>Return to road start</button> ':''}<button data-demo-branch="slope">Trace slope here</button> <button data-demo-branch="roughness">Trace height spread here</button>${dataset.gapCell?' <button data-demo-gap>Inspect gap</button>':''}${changed?'<p><button data-demo-restart>Restart example</button></p>':''}`;
}

// Step 5.2 (ground rule 4): limits are scenario settings, never requirements. With no limit set
// (the paper configuration), the text says so instead of describing default values.
export function scenarioLimitsText(dataset,limits=null){
  const unset=limits&&limits.slopeDeg==null&&limits.roughness_m==null;
  return !isEarthCase(dataset)?(unset
    ? 'No rover limits are supplied for this case, and none is set. A limit you enter is a scenario setting, not a rover requirement.'
    : 'Slope and height spread limits are scenario settings for this prototype, not rover requirements or validated rover specifications.') : dataset.caseId==='blatten'
    ? 'Rover slope and height spread limits are not supplied for this scenario. Enter values to test a vehicle scenario.'
    : dataset.caseId==='earth' ? 'No rover limits are supplied for this retrospective scenario. Enter values to test a vehicle scenario.'
    : 'The Atami field report gives no rover slope or height spread limits. Enter values to test a vehicle scenario.';
}

export function lunarScenarioHTML(dataset,{paper=false}={}){
 if(isEarthCase(dataset))return '';
 const numeric=Boolean(dataset.heightRMS);
 const route=paper?'The route shown is illustrative: its cells follow a fixed written rule, with no planner or cost model. It is not a planned, recommended or actual mission route.':'This is a proposed route for this prototype, not an actual mission route.';
 const limits=paper?'No limit is set. A limit you enter is a scenario setting, not a rover requirement.':'Limits are scenario settings, not rover requirements or validated rover specifications.';
 return `<details id="scenario-details"><summary>Scenario &amp; source evidence</summary><p>${route} Knowledge laundering can occur when source qualifications disappear through heights → slope / height spread → cost → route. Trace the exact native inputs before reviewing a result.</p><p>${numeric?`NASA supplies height RMS in meters and LOLA returns per cell (a count per 5 m cell). RMS describes input heights, not our derived slope, height spread, cost or route. A cell with no LOLA return can still have a supplied height. ${paper?'There is no quality mask here.':'There is no quality mask here, so no automatic flag priorities or RMS-based cost.'}`:'Nassau supplies categorical reconstruction codes on a native 4 m grid. Code 3 means suspicious; codes 10–14 mean successful correlation, without an accuracy guarantee. Unknown earlier processing history is separate from these codes.'} ${limits}</p><p><a href="${escapeHTML(dataset.source.url)}" target="_blank" rel="noopener">Producer &amp; source documentation ↗</a></p></details><button data-demo-branch="slope">Trace slope here</button> <button data-demo-branch="roughness">Trace height spread here</button>${numeric?'':' <button data-demo-flag>Inspect flagged route inputs</button>'}`;
}

export function blattenScenarioHTML(dataset){
  if(dataset.caseId!=='blatten')return '';
  const source=dataset.source||{},product=source.product||dataset.product,date=source.date||dataset.date;
  const label=dataset.surveyPhase==='pre-event'?'Pre-event baseline':dataset.surveyPhase==='post-event'?'Post-event terrain':'Selected heightmap';
  const description=[product,date].filter(Boolean).map(escapeHTML).join(' · ');
  const credit=source.url?`<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener">${description} ↗</a>`:description;
  return `<p><b>Simulated rover reconnaissance</b><br>Review a simulated route near the Tennmatten search area. <a href="https://www.policevalais.ch/communiques-pour-les-medias/blatten-reprise-des-recherches-concernant-la-personne-disparue/" target="_blank" rel="noopener">Valais Police delimited a search sector on 2 June 2025</a>; no clearance boundary is supplied.</p><p class="scenario-source"><b>${label}:</b> ${credit}${dataset.surveyPhase==='pre-event'?'<br>This baseline predates the collapse.':''}${source.temporalContext?`<br>${escapeHTML(source.temporalContext)}`:''}</p>`;
}

export function nuugaatsiaqScenarioHTML(dataset,{changed=false,atRoadStart=false}={}){
 if(dataset.caseId!=='earth')return '';
 const link=(url,label)=>`<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${label} ↗</a>`;
 return `<p><b>Retrospective rover inspection</b><br>Review a proposed route on the settlement peninsula.</p><details id="scenario-details"><summary>Scenario &amp; source context</summary><p>The 17 June 2017 landslide-generated tsunami struck Nuugaatsiaq, Greenland, prompting evacuation and searches under continuing danger. This retrospective scenario proposes a rover inspection; it is not a documented deployment or rescue route. Knowledge laundering can occur when supplied qualifications disappear through heights → slope / height spread → cost → route. Trace the flagged inputs, exclude cells and replan before approving this scenario.</p><p>19 June 2017 imagery; scenes processed in 2018, strip created in 2021 and packaged/published in 2022. This DEM is not established as available to responders in 2017. The DSM includes buildings. Cloud / water / edge bits and the separate matchtag are categorical evidence, not per-cell numeric uncertainty.</p><p>${link(dataset.scenario.responseURL,'Response report')} · ${link(dataset.scenario.contextURL,'Settlement maps')} · ${link(dataset.source.url,'ArcticDEM source')}</p></details>${!atRoadStart?'<button data-demo-road>Return to start</button> ':''}<button data-demo-branch="slope">Trace slope here</button> <button data-demo-branch="roughness">Trace height spread here</button> <button data-demo-flag>Inspect flagged route inputs</button>${changed?'<p><button data-demo-restart>Restart example</button></p>':''}`;
}
