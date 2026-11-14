// Build the live editor's Atami layers from small, checked-in source crops.
// No network access is used by normal editor preparation.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fixture=join(root,'fixtures/earth');
// The full 125 m source footprint retains the original 65 m crop.
const N=125, SIZE=N*N, EAST=52100, NORTH=-97222;
// Keep the road-approach inspection locations fixed in the source coordinate
// system when changing crop bounds. Coordinates identify native cell centres.
// These are retrospective demonstration endpoints, not a responder route.
const inspectionLocations={
  gap:{east:52142.5,north:-97261.5},
  start:{east:52142.5,north:-97236.5},
  goal:{east:52187.5,north:-97306.5},
};
function sourceCell({east,north}) {
  return {row:NORTH-Math.floor(north),col:Math.floor(east)-EAST};
}

function checkedAsset(directory,metadata) {
  const bytes=readFileSync(join(directory,metadata.asset));
  if(createHash('sha256').update(bytes).digest('hex')!==metadata.assetSha256) throw new Error(`Atami fixture checksum mismatch: ${metadata.asset}`);
  return bytes;
}

function readLasPoints(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.toString('ascii',0,4)!=='LASF') throw new Error('Atami point crop is not a LAS file');
  const pointOffset=view.getUint32(96,true), format=view.getUint8(104)&0x3f;
  const recordLength=view.getUint16(105,true), pointCount=view.getUint32(107,true);
  if(format!==2 || recordLength<26 || bytes.length<pointOffset+pointCount*recordLength) throw new Error('Unexpected Atami LAS point format');
  const scale=[0,1,2].map(i=>view.getFloat64(131+i*8,true));
  const offset=[0,1,2].map(i=>view.getFloat64(155+i*8,true));
  const bins=Array.from({length:SIZE},()=>[]), counts=new Uint16Array(SIZE);
  const colourSums=new Uint32Array(3*SIZE);
  for(let i=0;i<pointCount;i++) {
    const p=pointOffset+i*recordLength;
    const x=view.getInt32(p,true)*scale[0]+offset[0];
    const y=view.getInt32(p+4,true)*scale[1]+offset[1];
    const z=view.getInt32(p+8,true)*scale[2]+offset[2];
    // The crop uses 1 m squares with west/south edges included and east/north
    // edges excluded, matching the documented point-count convention.
    const col=Math.floor(x)-EAST, row=NORTH-Math.floor(y);
    if(row<0||row>=N||col<0||col>=N) continue;
    const index=row*N+col;
    if(counts[index]===0xffff) throw new Error(`Ground count exceeds Uint16 at ${row},${col}`);
    counts[index]++;
    bins[index].push(z);
    // LAS point format 2 stores 16-bit R/G/B at offsets 20, 22 and 24.
    for(let channel=0;channel<3;channel++) colourSums[3*index+channel]+=view.getUint16(p+20+2*channel,true);
  }
  const heights=new Float32Array(SIZE); heights.fill(NaN);
  for(let i=0;i<SIZE;i++) if(bins[i].length) {
    bins[i].sort((a,b)=>a-b);
    const m=bins[i].length>>1;
    heights[i]=bins[i].length%2?bins[i][m]:(bins[i][m-1]+bins[i][m])/2;
  }
  const colours=Uint8Array.from(colourSums,(sum,i)=>{
    const count=counts[Math.floor(i/3)];
    return count ? Math.round(sum/count/257) : 0;
  });
  return {heights,counts,colours};
}

function readDsmCrop(raw,meta) {
  const expected=meta.width*meta.height*4;
  if(raw.length!==expected) throw new Error('Atami DSM source crop has unexpected size');
  const source=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
  const bins=Array.from({length:SIZE},()=>[]),counts=new Uint16Array(SIZE);
  const {sourceOrigin,sourceResolution,colStart,rowStart,width,height,nodata}=meta;
  for(let r=0;r<height;r++) for(let c=0;c<width;c++) {
    const x=sourceOrigin[0]+(colStart+c+.5)*sourceResolution[0];
    const y=sourceOrigin[1]+(rowStart+r+.5)*sourceResolution[1];
    const col=Math.floor(x)-EAST, row=NORTH-Math.floor(y);
    if(row<0||row>=N||col<0||col>=N) continue;
    const value=source[r*width+c];
    if(Number.isFinite(value)&&value!==nodata) {
      const index=row*N+col;
      if(counts[index]===0xffff) throw new Error(`DSM sample count exceeds Uint16 at ${row},${col}`);
      bins[index].push(value);
      counts[index]++;
    }
  }
  const medians=new Float32Array(SIZE); medians.fill(NaN);
  for(let i=0;i<SIZE;i++) if(bins[i].length) {
    bins[i].sort((a,b)=>a-b);
    const m=bins[i].length>>1;
    medians[i]=bins[i].length%2?bins[i][m]:(bins[i][m-1]+bins[i][m])/2;
  }
  return {heights:medians,counts};
}

function bytesOf(array) { return Buffer.from(array.buffer,array.byteOffset,array.byteLength); }
function writeArray(out,name,array) { writeFileSync(join(out,name),bytesOf(array)); }

export function prepareAtamiEditorData(directory) {
  const out=resolve(directory);
  const groundMeta=JSON.parse(readFileSync(join(fixture,'atami-20210706-ground-crop.json'),'utf8'));
  const dsmMeta=JSON.parse(readFileSync(join(fixture,'atami-20210703-dsm-crop.json'),'utf8'));
  const {heights,counts,colours}=readLasPoints(checkedAsset(fixture,groundMeta));
  const {heights:proposalHeights,counts:dsmSampleCounts}=readDsmCrop(checkedAsset(fixture,dsmMeta),dsmMeta);
  const imagery=join(fixture,'atami-imagery');
  const rgbMeta=JSON.parse(readFileSync(join(imagery,'atami-july03-orthophoto-1m-rgb.json'),'utf8'));
  const dsmColours=checkedAsset(imagery,rgbMeta);
  if(dsmColours.length!==3*SIZE) throw new Error('Atami orthophoto RGB dimensions do not match the survey grid');
  writeArray(out,'atami-ground-1m-median.f32',heights);
  writeArray(out,'atami-ground-counts.u16',counts);
  writeArray(out,'atami-ground-rgb.u8',colours);
  writeArray(out,'atami-july03-dsm-1m-pixel-center-median.f32',proposalHeights);
  writeArray(out,'atami-july03-dsm-sample-counts.u16',dsmSampleCounts);
  writeFileSync(join(out,rgbMeta.asset),dsmColours);

  const valid=Array.from(heights).filter(Number.isFinite).sort((a,b)=>a-b);
  const dsmValid=Array.from(proposalHeights).filter(Number.isFinite).sort((a,b)=>a-b);
  const dsmURL='https://www.geospatial.jp/ckan/dataset/450bb3a3-7685-4758-a224-e2cd899f61a8/resource/44764141-9119-4551-8762-3f447088a85a/download/izusanls10cmdemtrim.tif';
  const contextPhoto={
    file:'../../fixtures/earth/atami-imagery/atami-headscarp.jpg',
    thumbnail:'../../fixtures/earth/atami-imagery/atami-headscarp-preview.jpg',
    bounds:rgbMeta.sourceBounds,
    date:'3 July 2021',credit:'Shizuoka Point Cloud Support Team / CrisisMappers Japan',
    sourceURL:dsmMeta.source,
  };
  const ground={
    product:'Windy Network ground-filtered drone LiDAR',label:'5–6 July · Ground lidar',
    grid:{east:EAST,north:NORTH+1,crs:'LAS CRS omitted; Japanese Plane Rectangular CS VIII (EPSG:6676) assumed for alignment to the DSM'},
    surface:'ground',comparisonSurfaceId:'july3-dsm',comparisonLabel:'5–6 July lidar ground',
    heightOrigin:'observed',
    groundRGBFile:'atami-ground-rgb.u8',
    groundCountsFile:'atami-ground-counts.u16',proposalHeightsFile:'atami-july03-dsm-1m-pixel-center-median.f32',
    gapCell:sourceCell(inspectionLocations.gap),range:[valid[0],valid[valid.length-1]],
    date:'5–6 July 2021',
    productionMethod:'Hallmark median gridding of the released July 5–6 ground-filtered LAS points',
    productionScope:'Retrospective 1 m crop derived for the prototype',
    credit:'Windy Network · Shizuoka Prefecture open data',
    datum:'Metres; vertical datum not specified in the LAS archive',
    origin:'Hallmark records the median and number of ground lidar returns in each 1 m square. Zero returns leave a missing height. Per-cell height uncertainty was not supplied.',
    quality:'Ground-return support counts computed from the released ground-filtered point cloud; no per-cell accuracy supplied.',
    history:'Hallmark retrospectively bins the released July 5–6 ground-filtered LAS points into 1 m squares and uses each occupied cell’s median height. Empty bins remain missing (NaN); no elevations are filled. Counts are the number of source points in each square, not an accuracy estimate.',
    sourceURL:'https://opendata.pref.shizuoka.jp/dataset/8698.html',
    sourceURLs:{ground:'https://gsic-opendata.s3.ap-northeast-1.amazonaws.com/local-gov/shizuoka/point-cloud/2021/20210703-atami-dronealb/20210703ATAMI/Izusan_UAV-LiDAR_20210706_Ground.zip'},
    metadata:{
      colour:'Mean of the supplied RGB channels of the ground points in each 1 m cell. Cells with zero returns have no measured colour.',
      pointSupport:'Per-cell counts are computed from the released ground-filtered points. They describe this later survey’s local support only.',
      gridding:'Hallmark median of source ground-point elevations per 1 m square; west/south edges included, east/north edges excluded.',
      crsStatus:'The LAS header contains no CRS record. EPSG:6676 is an explicit co-registration assumption based on coordinate overlap with the georeferenced DSM, not a verified LAS CRS.',
      sourceLicense:'CC BY 4.0 / ODbL as stated by the Shizuoka Prefecture publisher.',
      missingValues:'Cells with no ground points are NaN; no interpolation or gap filling.',
    },
    proposalSource:{
      product:'3 July 2021 drone-derived digital surface model (DSM)',date:'3 July 2021',
      url:'https://www.geospatial.jp/ckan/dataset/atami20210703izusan0000shizuokapref01',
      downloadUrl:dsmURL,
      credit:'Shizuoka Point Cloud Support Team · distributed by CrisisMappers Japan',
      method:'Median of finite 0.10 m DSM pixel-centre samples whose centres fall inside each 1 m square; NoData pixels are excluded and empty cells remain NaN.',
      surface:'DSM includes vegetation and objects; it is a separate earlier survey and is not the July 5–6 ground model.',
      sourceLicense:'CC BY 4.0 / ODbL as stated by the publisher.',
      sourceSha256:'d7141217427fa15a66d3682d20637d1cb6504ae24cc01557123ad1aab981e804',
      crs:'EPSG:6676, JGD2011 / Japan Plane Rectangular CS VIII, as declared in the DSM GeoTIFF.',
      registration:'The LAS header omits CRS. Shared local coordinates are assumed for alignment based on the documented overlap; LAS CRS is not verified.',
      history:'Independent reconstruction from 3 July footage; DSM resource registered 5 July. Same-day availability to responders is unverified. This legacy proposal layer is retained as separate-survey context and does not fill missing ground-lidar cells.',
    },
    focus:Object.values(sourceCell(inspectionLocations.gap)),
    proposalStart:sourceCell(inspectionLocations.start),proposalGoal:sourceCell(inspectionLocations.goal),
  };
  const july3={
    surface:'july3-dsm',comparisonSurfaceId:'ground',comparisonLabel:'3 July video surface',
    product:'Drone-video-derived digital surface model (DSM)',label:'3 July · Video surface',date:'3 July 2021',
    grid:{east:EAST,north:NORTH+1,crs:'EPSG:6676 · JGD2011 / Japan Plane Rectangular CS VIII (declared by source DSM)'},
    range:[dsmValid[0],dsmValid[dsmValid.length-1]],focus:Object.values(sourceCell(inspectionLocations.start)),
    proposalStart:sourceCell(inspectionLocations.start),proposalGoal:sourceCell(inspectionLocations.goal),
    heightOrigin:'undocumented',
    dsmSampleCountsFile:'atami-july03-dsm-sample-counts.u16',groundRGBFile:rgbMeta.asset,
    productionMethod:'Hallmark median aggregation of valid 10 cm source DSM pixel-centre samples into 1 m squares',
    productionScope:'Retrospective 125 × 125 m crop of the independent 3 July DSM',
    credit:'Shizuoka Point Cloud Support Team · distributed by CrisisMappers Japan',
    datum:'Metres; vertical datum not specified in the cited DSM source metadata',
    origin:'Hallmark retains the median of valid source DSM pixel-centre elevations in each 1 m square. The source reconstruction ancestry and per-cell uncertainty are not supplied. Valid source-pixel counts describe aggregation inputs, not lidar returns or accuracy.',
    quality:'No source per-cell quality mask or accuracy estimate supplied. DSM sample counts only count valid aggregation inputs.',
    history:'Independent reconstruction from footage captured 3 July 2021; DSM resource registered 5 July. Same-day availability to responders is unverified. Hallmark aggregates the retained source DSM samples without filling, smoothing or importing lidar heights. This DSM includes surface objects and vegetation; it is not a ground model. Native gaps remain NaN.',
    sourceURL:dsmMeta.source,sourceURLs:{'july3-dsm':dsmURL},
    metadata:{
      colour:'3 July orthophoto JPEG pixel containing each 1 m cell centre. These independent display colours do not add height measurements or identify land cover; no lidar RGB is used.',
      dsmSampleSupport:'Counts of finite, non-NoData 10 cm source DSM pixel centres in each 1 m square. They do not measure source image support, accuracy or per-cell uncertainty.',
      gridding:'Median of finite, non-NoData source DSM pixel-centre samples in each 1 m square; west/south edges included, east/north edges excluded. Source NoData is -32767.',
      sourceResolution:'0.10 m source DSM pixel spacing; 1 m output aggregation grid.',
      sourceOrigin:`Source pixel-corner origin E ${dsmMeta.sourceOrigin[0]}, N ${dsmMeta.sourceOrigin[1]}; signed pixel spacing ${dsmMeta.sourceResolution.join(', ')} m; retained window starts at source column ${dsmMeta.colStart}, row ${dsmMeta.rowStart}.`,
      crsStatus:'The source DSM declares EPSG:6676. The companion LAS omits CRS; same-location comparison assumes its shared local coordinates align with the DSM and does not verify that alignment.',
      sourceLicense:dsmMeta.sourceLicense,
      missingValues:'No valid source DSM samples means NaN and zero sample count; no interpolation or gap filling.',
      sourceSha256:dsmMeta.sourceSha256,
      timing:'Drone footage captured 3 July 2021; DSM resource registered 5 July. Same-day availability to responders unverified.',
    },
  };
  return {
    id:'earth',caseId:'earth',title:'Izuyama, Atami, Japan',context:'Earth · rescue robotics',
    W:N,H:N,res:1,contextPhoto,
    files:{'july3-dsm':'atami-july03-dsm-1m-pixel-center-median.f32',ground:'atami-ground-1m-median.f32'},
    surveys:{ground,'july3-dsm':july3},
  };
}
