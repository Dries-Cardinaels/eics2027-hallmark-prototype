// Offline native-window extraction. Provider bytes are never resampled or relabelled.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {fromFile} from 'geotiff';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'../demo/research/sources/nuugaatsiaq-20170619');
const fixture=join(root,'fixtures/earth/nuugaatsiaq');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function prepareNuugaatsiaqEditorData(directory){
 const m=JSON.parse(readFileSync(join(fixture,'manifest.json'),'utf8'));
 const files={};
 for(const [name,asset] of Object.entries(m.rasters)){
  const bytes=readFileSync(join(source,asset.source));
  if(digest(bytes)!==asset.sourceSha256)throw new Error('Nuugaatsiaq source checksum mismatch: '+name);
  const image=await (await fromFile(join(source,asset.source))).getImage();
  if(image.getWidth()!==1000||image.getHeight()!==1000||image.getResolution()[0]!==2||image.getResolution()[1]!==-2)throw new Error('Unexpected Nuugaatsiaq source grid');
  const a=await image.readRasters({window:m.window,interleave:true});
  const crop=Buffer.from(a.buffer,a.byteOffset,a.byteLength);
  if(digest(crop)!==asset.sha256)throw new Error('Nuugaatsiaq native crop checksum mismatch: '+name);
  writeFileSync(join(directory,asset.file),crop);files[name]=asset.file;
 }
 return {
  id:'earth',caseId:'earth',title:'Nuugaatsiaq, Greenland',context:'Earth · retrospective rover inspection',
  product:'ArcticDEM strip · stereo surface',surface:'ground',W:m.W,H:m.H,res:2,
  grid:m.grid,files:{ground:files.dem},range:m.range,date:'19 June 2017 imagery',
  qualityFile:files.mask,qualityKind:'arcticdem-bitmask',matchtagFile:files.matchtag,
  heightOrigin:'undocumented',origin:'Stereo-derived surface heights. The supplied matchtag separately identifies stereo-matched (1) and interpolated (0) cells; it does not identify donor heights or establish accuracy.',
  productionMethod:'SETSM stereo reconstruction; native 2 m strip samples',productionScope:'500 × 500 m native crop; DSM includes buildings and other surface objects, not guaranteed bare earth.',
  quality:'Supplied edge/water/cloud bitmask and separate stereo matchtag; categorical indicators, not numerical uncertainty.',
  history:'Image acquisition 19 June 2017; constituent scenes processed in 2018, strip created 7 November 2021, generated 9 June 2022 and published 19 October 2022. This product is not established as available during the 2017 response.',
  credit:'Polar Geospatial Center / ArcticDEM · Porter et al. (2022)',datum:'WGS84 ellipsoidal height, metres',
  sourceURL:m.sourceURL,sourceURLs:m.sourceURLs,
  metadata:{license:'CC BY 4.0',precision:'No per-cell numeric uncertainty supplied',scope:'Supplied categorical evidence; zero mask is not a guarantee of accuracy.',processing:'Scenes: January–February 2018 · strip: November 2021 · packaging/publication: 2022',timing:'19 June 2017, 18:25:50–18:26:36 UTC imagery. Present product availability does not establish 2017 operational availability.',qualityGuide:m.qualityGuide,nativeGrid:'250 × 250 cells at native 2 m posting; Hallmark crop applies no resampling, smoothing, filling or vertical offset; upstream SETSM smoothing remains part of the source product.',endpointStatus:m.endpointStatus,sourceNoData:'DEM −9999; all 62,500 crop heights finite. Mask value 1 is an edge bit; matchtag 0 is retained as interpolated evidence.'},
  focus:[m.proposalStart.row,m.proposalStart.col],proposalStart:m.proposalStart,proposalGoal:m.proposalGoal,flagCell:m.flagCell,
  scenario:{responseURL:m.responseURL,contextURL:m.contextURL},
 };
}
