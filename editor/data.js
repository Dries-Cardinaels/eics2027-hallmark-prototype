const catalogURL = new URL('./data/cases.json', import.meta.url);
let catalog;
const loaded = new Map();

async function terrainEntry(caseId) {
  if (!catalog) {
    const response = await fetch(catalogURL);
    if (!response.ok) throw new Error('Terrain catalog could not be loaded');
    catalog = await response.json();
  }
  const entry = catalog[caseId];
  if (!entry) throw new Error('Unknown terrain');
  return entry;
}

export async function availableSurfaces(caseId) {
  const entry = await terrainEntry(caseId);
  return Object.keys(entry.files).map(id => ({
    id, label:entry.surveys?.[id]?.label ?? entry.surveys?.[id]?.date ?? entry.date,
  }));
}

const heightFiles = new Map();
async function readHeights(file,width,height) {
  if(!heightFiles.has(file)){
    heightFiles.set(file,(async()=>{
      const response=await fetch(new URL(file,catalogURL));
      if(!response.ok)throw new Error('Heightmap could not be loaded');
      const samples=new Float32Array(await response.arrayBuffer());
      return Object.freeze(Array.from(samples));
    })().catch(error=>{heightFiles.delete(file);throw error;}));
  }
  const heights=await heightFiles.get(file);
  if(heights.length!==width*height)throw new Error('Heightmap dimensions do not match the survey grid');
  return heights;
}

export async function loadTerrain(caseId, surface) {
  const entry=await terrainEntry(caseId);
  if (!Object.hasOwn(entry.files,surface)) throw new Error('Unknown heightmap');
  const key = `${caseId}:${surface}`;
  if (!loaded.has(key)) {
    loaded.set(key, (async () => {
      const info={...entry,...entry.surveys?.[surface]};
      const heights=await readHeights(entry.files[surface],info.W,info.H);
      let comparisonSurface;
      const other=info.comparisonSurfaceId??(entry.surveys&&Object.keys(entry.files).length===2?Object.keys(entry.files).find(id=>id!==surface):null);
      if(other&&other!==surface&&Object.hasOwn(entry.files,other)){
        const survey={...entry,...entry.surveys?.[other]};
        comparisonSurface={
          surface:other,label:survey.comparisonLabel??(survey.surveyPhase==='pre-event'?'Pre-event ground':survey.surveyPhase==='post-event'?'Post-event surface':survey.product??'Companion surface'),
          date:survey.date,product:survey.product,sourceURL:survey.sourceURLs?.[other]??survey.sourceURL,grid:{...survey.grid,W:survey.W,H:survey.H,res:survey.res},
          heights:await readHeights(entry.files[other],survey.W,survey.H),
        };
      }
      let groundCounts;
      if (info.groundCountsFile) {
        const response = await fetch(new URL(info.groundCountsFile, catalogURL));
        if (!response.ok) throw new Error('Ground-count map could not be loaded');
        groundCounts = new Uint16Array(await response.arrayBuffer());
        if (groundCounts.length !== heights.length) throw new Error('Ground-count map dimensions do not match the heightmap');
      }
      let dsmSampleCounts;
      if (info.dsmSampleCountsFile) {
        const response = await fetch(new URL(info.dsmSampleCountsFile, catalogURL));
        if (!response.ok) throw new Error('DSM sample-count map could not be loaded');
        dsmSampleCounts = new Uint16Array(await response.arrayBuffer());
        if (dsmSampleCounts.length !== heights.length) throw new Error('DSM sample-count map dimensions do not match the heightmap');
      }
      let proposalHeights;
      let groundRGB;
      if (info.groundRGBFile) {
        const response = await fetch(new URL(info.groundRGBFile, catalogURL));
        if (!response.ok) throw new Error('Ground color map could not be loaded');
        groundRGB = new Uint8Array(await response.arrayBuffer());
        if (groundRGB.length !== 3*heights.length) throw new Error('Ground color map dimensions do not match the heightmap');
      }
      if (info.proposalHeightsFile) {
        const response = await fetch(new URL(info.proposalHeightsFile, catalogURL));
        if (!response.ok) throw new Error('Proposal heightmap could not be loaded');
        proposalHeights = Object.freeze(Array.from(new Float32Array(await response.arrayBuffer())));
        if (proposalHeights.length !== heights.length) throw new Error('Proposal heightmap dimensions do not match the ground grid');
      }
      let matchtags;
      if(info.matchtagFile){
        const response=await fetch(new URL(info.matchtagFile,catalogURL));
        if(!response.ok)throw new Error('Stereo matchtag could not be loaded');
        matchtags=Object.freeze(Array.from(new Uint8Array(await response.arrayBuffer())));
        if(matchtags.length!==heights.length||matchtags.some(code=>code!==0&&code!==1))throw new Error('Invalid stereo matchtag grid');
      }
      let quality;
      const numericEvidence={};
      for(const [key,file] of [['heightRMS',info.heightRMSFile],['lolaCounts',info.lolaCountsFile]]){
        if(!file)continue;
        const response=await fetch(new URL(file,catalogURL));
        if(!response.ok)throw new Error('Supplier height evidence could not be loaded');
        const values=Object.freeze(Array.from(new Float32Array(await response.arrayBuffer())));
        if(values.length!==heights.length)throw new Error('Supplier height evidence dimensions do not match the native grid');
        numericEvidence[key]=values;
      }
      if (info.qualityFile) {
        const response = await fetch(new URL(info.qualityFile, catalogURL));
        if (!response.ok) throw new Error('Quality map could not be loaded');
        quality = {
          kind: info.qualityKind || 'lroc-stereo-status',
          codes: Object.freeze(Array.from(new Uint8Array(await response.arrayBuffer()))),
          flaggedCodes: [3],
        };
      }
      if(quality){
        if(quality.codes.length!==heights.length)throw new Error('Quality dimensions do not match the heightmap');
        if(info.qualityKind==='arcticdem-bitmask'){
          quality.flaggedCodes=[1,2,3,4,5,6,7];quality.nominalCodes=[0];
          quality.definitions=Object.fromEntries(Array.from({length:8},(_,code)=>[code,code?[code&1?'Edge':null,code&2?'Water':null,code&4?'Cloud':null].filter(Boolean).join(' + '):'No supplied mask flag']));
          quality.terms={flaggedLower:'by the supplier mask',nominal:'Unflagged height',production:'SETSM stereo reconstruction',cellHistory:info.origin};
        }
      }
      const origins = Object.freeze(heights.map(h => Number.isFinite(h) ? (info.heightOrigin || 'undocumented') : 'absent'));
      return {
        ...info, id: key, caseId, surface, heights, origins, quality,
        ...numericEvidence,
        ...(matchtags ? {matchtags} : {}),
        ...(comparisonSurface ? {comparisonSurface} : {}),
        ...(groundCounts ? {groundCounts} : {}),
        ...(dsmSampleCounts ? {dsmSampleCounts} : {}),
        ...(groundRGB ? {groundRGB} : {}),
        ...(proposalHeights ? {proposalHeights} : {}),
        originDeclaration: {status: groundCounts ? 'declared' : 'not-supplied', explanation: info.origin},
        production: {
          method: info.productionMethod || 'LROC stereo reconstruction',
          scope: info.productionScope || 'delivery', cellHistory: info.origin,
        },
        source: {
          product: info.product,
          url: info.sourceURLs?.[surface] || info.sourceURL,
          credit: info.credit, date: info.date, datum: info.datum,
          crs: info.grid?.crs || 'Local crop coordinates',
          history: info.history,
          ...info.metadata,
        },
      };
    })().catch(error => {loaded.delete(key); throw error;}));
  }
  return loaded.get(key);
}
