// Offline assembly of the Swiss ground baseline and dated reconstruction.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
const fixture=resolve(dirname(fileURLToPath(import.meta.url)),'../fixtures/earth/blatten');

export function prepareBlattenEditorData(directory) {
 const m=JSON.parse(readFileSync(join(fixture,'manifest.json'),'utf8'));
 const data=readFileSync(join(fixture,'blatten-2024-ground-2m.f32'));
 if(data.length!==m.raster.width*m.raster.height*4 || createHash('sha256').update(data).digest('hex')!==m.raster.sha256) throw new Error('Blatten fixture size or checksum mismatch');
 for(const check of m.checks) if(data.readFloatLE(check.index*4)!==check.height || check.index!==check.row*m.raster.width+check.col) throw new Error('Blatten native cell verification failed');
 writeFileSync(join(directory,'blatten-ground.f32'),data);
 const result={
  id:'blatten',caseId:'blatten',title:'Tennmatten, Blatten, Switzerland',context:'Earth · retrospective terrain inspection',
  product:'swissALTI3D · pre-collapse ground baseline',surface:'ground',surveyPhase:'pre-event',heightOrigin:'undocumented',
  W:m.raster.width,H:m.raster.height,res:m.raster.resolution,
  grid:{east:m.raster.bounds.west,north:m.raster.bounds.north,crs:'EPSG:2056 · CH1903+ / LV95'},
  files:{ground:'blatten-ground.f32'},range:[m.raster.min,m.raster.max],
  date:'2024 product edition · survey date unverified',credit:m.credit,datum:'LN02 height (EPSG:5728), metres',
  productionMethod:'Exact native 2 m samples cropped from two standard swissALTI3D tiles',
  productionScope:'400 × 400 m pre-collapse baseline; no post-event deposit heights',
  origin:'Native production grid samples; underlying survey dependencies and per-cell uncertainty are not supplied in this fixture.',
  quality:'No per-cell quality or survey support mask supplied. All 40,000 crop cells have finite source elevations.',
  history:'The 2024 archive edition precedes the 28 May 2025 collapse. Hallmark concatenates adjoining native grid windows without resampling, smoothing, interpolation or gap filling. The year is the product edition, not a verified survey date.',
  sourceURL:m.productURL,sourceURLs:{northTile:m.sources[0].url,southTile:m.sources[1].url},
  metadata:{sourceLicense:m.rights,edition:m.edition,surveyDate:'Not verified',eventRelation:m.eventRelation,sourceNoData:m.raster.sourceNoData,missingValues:'No NoData cells in this crop; missing source cells would remain missing.',nativeGrid:'200 × 200 native 2 m samples, row-major north to south, west to east.',cropSha256:m.raster.sha256,endpointStatus:m.endpointStatus},
  focus:m.focus,proposalStart:m.proposalStart,proposalGoal:m.proposalGoal,
 };
 const eventFixture=resolve(fixture,'../blatten-event');
 if(existsSync(join(eventFixture,'manifest.json'))) {
  const event=JSON.parse(readFileSync(join(eventFixture,'manifest.json'),'utf8'));
  if(!event.files?.['post-event']) throw new Error('Blatten event manifest omits post-event height file');
  for(const file of [event.files['post-event'],event.groundRGBFile].filter(Boolean)) {
   if(typeof file!=='string'||file.includes('/')||file.includes('\\')) throw new Error('Blatten event file must be a local filename');
   const bytes=readFileSync(join(eventFixture,file));
   const isRGB=file===event.groundRGBFile;
   const hash=createHash('sha256').update(bytes).digest('hex');
   if(bytes.length!==event.W*event.H*(isRGB?3:4)||hash!==(isRGB?event.assets.rgbSha256:event.assets.heightSha256))throw new Error('Blatten event fixture checksum or size mismatch: '+file);
   writeFileSync(join(directory,file),bytes);
  }
  result.files['post-event']=event.files['post-event'];
  result.surveys={'post-event':event};

 }
 return result;
}
