import {readFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Displayed definition of the height RMS layer, from the two sources only (fix of 6 Nov 2026; the
// fixture manifest's own interpretation string is kept unchanged in the read-only fixture):
// PGDA 78 README: "*_toterr.tif : Total Z uncertainty in meters (formally, the RMS error)";
// Barker et al. (2021), Sect. 4: uncertainties "expressed as RMS total height error over all 100 clones for each pixel".
// Worded without "uncertainty" so the Ridge evidence text keeps the step 3.5 word ban.
const HEIGHT_RMS_DEFINITION='Supplier total height RMS error in metres (PGDA README, toterr layer): the RMS total height error over 100 simulated clones of the LDEM (Barker et al. 2021, Sect. 4). Not propagated to our slope, height spread or illumination; not a probability.';
const fixture=fileURLToPath(new URL('../fixtures/lola/connecting-ridge/',import.meta.url));
export function prepareLolaEditorData(out){
 const manifest=JSON.parse(readFileSync(join(fixture,'manifest.json')));
 const files={};
 for(const [key,layer] of Object.entries(manifest.layers)){
  const bytes=readFileSync(join(fixture,layer.file));
  if(createHash('sha256').update(bytes).digest('hex')!==layer.cropSha256)throw new Error('LOLA retained crop hash mismatch: '+key);
  if(bytes.length!==manifest.window.width*manifest.window.height*4)throw new Error('LOLA retained crop dimensions do not match');
  files[key]='connecting-ridge-'+layer.file;copyFileSync(join(fixture,layer.file),join(out,files[key]));
 }
 return {id:'connecting-ridge',title:'Connecting Ridge',context:'Moon · rover exploration',product:'NASA PGDA 78 · Site01 adjusted 5 m LDEM',
  W:manifest.window.width,H:manifest.window.height,res:manifest.postingM,
  grid:{east:manifest.cropTransform[2],north:manifest.cropTransform[5],crs:'MOON_ME / JPL DE421 · lunar south polar stereographic, lon 0°'},
  files:{ground:files.height},heightRMSFile:files.heightRms,lolaCountsFile:files.counts,
  // Vocabulary for the per-cell LOLA count (D7). Count 0 and count >= 1 are named by what the supplier records; the raw count is kept.
  lolaReturns:{layer:'LOLA returns per cell',labels:{none:'no LOLA return',present:'LOLA return in cell',unknown:'LOLA count not supplied'},derived:'LOLA return in {k} of {n} source heights'},
  range:[manifest.layers.height.min,manifest.layers.height.max],date:'Retrieved 5 November 2026; acquisition date not specified',credit:'NASA / GSFC Planetary Geodynamics Data Archive',
  datum:manifest.verticalReference,origin:'Supplier README (PGDA78-README.txt:7), quoted as the supplier\'s statement: surface height Z "with interpolation filling empty pix". Exact donors and earlier per-cell history are not supplied. LOLA returns per cell is a separate supplier count, not an origin or quality mask.',
  productionMethod:'LOLA orbital adjustment and surface interpolation',productionScope:'Delivered native 5 m LDEM',
  history:'Native window only: no reprojection, resampling or scaling. Supplier total Z RMS retained independently of height values; not propagated to derived results or used for planning.',
  sourceURL:manifest.productUrl,qualityReadmeURL:'../fixtures/lola/connecting-ridge/PGDA78-README.txt',
  metadata:{scope:'Supplier height RMS and LOLA returns per cell only; nothing is estimated for derived results',nativeGrid:'Pixel-registered 5 m centres; 256 × 256 native window at source row 1500, col 1300',referenceFrame:manifest.referenceFrame,heightRMSDefinition:HEIGHT_RMS_DEFINITION,heightSource:manifest.layers.height.url,heightRMSSource:manifest.layers.heightRms.url,lolaSpotsSource:manifest.layers.counts.url},
  focus:[128,128],proposalStart:{row:128,col:32},proposalGoal:{row:128,col:224},
 };
}
