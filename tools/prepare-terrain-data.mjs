// One source-data preparation path for the editor and archived mockups.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {fromFile} from 'geotiff';
import {prepareAtamiEditorData} from './prepare-atami-editor-data.mjs';
import {prepareNuugaatsiaqEditorData} from './prepare-nuugaatsiaq-editor-data.mjs';
import {prepareBlattenEditorData} from './prepare-blatten-editor-data.mjs';
import {prepareLolaEditorData} from './prepare-lola-editor-data.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function prepareTerrainData(directory,{earthCase='voeren'}={}) {
 const out=resolve(directory);mkdirSync(out,{recursive:true});
const earth=join(root,'fixtures/earth/voeren-candidate'),moon=join(root,'fixtures/lroc/nassau02-belief-candidate');
const nasa=JSON.parse(readFileSync(join(moon,'context.json')));
if(earthCase==='voeren') {
 for(const [key,file] of [['ground','dhmvii_dtm_1m_veurserveld_512m.tif'],['surface','dhmvii_dsm_1m_veurserveld_512m.tif']]){
  const im=await (await fromFile(join(earth,file))).getImage(),a=await im.readRasters({interleave:true});
  writeFileSync(join(out,`voeren-${key}.f32`),Buffer.from(a.buffer,a.byteOffset,a.byteLength));
 }
}
writeFileSync(join(out,'nassau.f32'),Buffer.from(new Float32Array(nasa.heights).buffer));
writeFileSync(join(out,'nassau-quality.u8'),Buffer.from(nasa.quality_codes));
const cases={};
if(earthCase==='voeren') {
 const manifest=JSON.parse(readFileSync(join(earth,'manifest.json')));
 cases.earth={id:'earth',title:'Veurserveld, Voeren',context:'Earth · search & rescue',product:'DHMV II',grid:{east:manifest.raster.affine_a_b_c_d_e_f[2],north:manifest.raster.affine_a_b_c_d_e_f[5],crs:manifest.raster.horizontal_crs},W:512,H:512,res:1,files:{ground:'voeren-ground.f32',surface:'voeren-surface.f32'},range:[134.49,223.71],date:'26 & 31 March 2014',credit:'Bron: Digitaal Vlaanderen · DHMV II',datum:'TAW',origin:'Per-cell production history not supplied',quality:'No per-cell quality mask supplied',history:'Ground classification and interpolation are part of producing the DTM. Source flight records describe acquisition, not exact raster-cell dependencies.',sourceURL:manifest.producer_sources.product,sourceURLs:{ground:manifest.producer_sources.product,surface:manifest.producer_sources.campaign_and_classification},metadata:{flightRecords:38,pointSupport:'All-return and last-return densities are tile-level metadata. Ground support has not been reconstructed.'},focus:[259,256]};
} else if (earthCase === 'nuugaatsiaq' || earthCase === 'atami') {
 cases.earth=earthCase==='nuugaatsiaq'?await prepareNuugaatsiaqEditorData(out):prepareAtamiEditorData(out);
 cases.atami={...prepareAtamiEditorData(out),id:'atami',caseId:'atami'};
 cases.blatten=prepareBlattenEditorData(out);
} else {
 throw new Error('Unknown Earth case: '+earthCase);
}
cases.moon={id:'moon',title:'North of Nassau crater',context:'Moon · rover exploration',product:'NAC_DTM_NASSAU02 v1.9',W:nasa.W,H:nasa.H,res:4,files:{ground:'nassau.f32'},qualityFile:'nassau-quality.u8',qualityReadmeURL:'../fixtures/lroc/nassau02-belief-candidate/NAC_DTM_NASSAU02_README.TXT',range:[Math.min(...nasa.heights),Math.max(...nasa.heights)],date:'1 August 2022',credit:'NASA / GSFC / Arizona State University',datum:'Relative to lunar radius 1,737,400 m',origin:'Earlier per-cell history not supplied',quality:'LROC reconstruction quality codes',history:'Code 3: suspicious (edge, corner, did not correlate, etc.). Codes 10–14: successful correlation. These categories are not calibrated error probabilities or accuracy guarantees.',sourceURL:'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_NASSAU02',metadata:{precision:'3.62 m reported product precision',lola:'2.46 m LOLA RMS difference',scope:'Product diagnostics; not per-cell uncertainty'},focus:nasa.focus,compare:nasa.compare,crop:nasa.crop};
cases['connecting-ridge']=prepareLolaEditorData(out);
writeFileSync(join(out,'cases.json'),JSON.stringify(cases,null,2));
}
