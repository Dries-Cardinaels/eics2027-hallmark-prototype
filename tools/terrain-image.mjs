// Aligned, top-down visualization of the surface used for stereo acquisition.
// Kept separate from delivered heights: this image never enters the assessment.
import { deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type),data]), header=Buffer.alloc(4), crc=Buffer.alloc(4);
  header.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([header,body,crc]);
}
function png(pixels, size) {
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=0;
  const rows=Buffer.alloc((size+1)*size);
  for(let r=0;r<size;r++) for(let c=0;c<size;c++) rows[r*(size+1)+1+c]=pixels[r*size+c]<0 ? 225 : pixels[r*size+c];
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}

export function terrainImage(ST, truth, settings, sunElevation) {
  const {n,res,seed,sunAzimuth_deg:az}=settings;
  // These are the same surface preparation steps used by observeImages. The active
  // acquisition uses due-west illumination, which casts at the fine image resolution.
  if(az!==270) throw new Error('This visualization currently requires the due-west acquisition preset');
  const PX=ST.pxPerPost(n), F=n*PX, p=res/PX;
  const hf=ST.upsample(truth,n,PX), albedo=new Float32Array(F*F);
  for(let r=0;r<F;r++) for(let c=0;c<F;c++) {
    const k=r*F+c,x=(c+.5)*p,z=(r+.5)*p;
    hf[k]+=ST.roughnessAt(seed,x,z);albedo[k]=ST.albedoAt(seed,x,z);
  }
  const shadow=ST.castShadow(hf,F,p,sunElevation,az);
  const pixels=ST.renderImage({hf,F,p,shadow,albedo,emissionDeg:0,sunElevDeg:sunElevation,sunAzDeg:az,
    hRef:settings.referenceElevation_m,seed,blurPx:ST.CAMERA.sharp.blur,noiseDn:ST.CAMERA.sharp.noise});
  const fraction=new Array(n*n).fill(0);
  for(let r=0;r<F;r++) for(let c=0;c<F;c++) fraction[Math.floor(r/PX)*n+Math.floor(c/PX)]+=shadow[r*F+c]/(PX*PX);
  const bytes=png(pixels,F);
  return {bytes,shadow,record:{image:`data:image/png;base64,${bytes.toString('base64')}`,width:F,height:F,
    sunElevation_deg:sunElevation,sunAzimuth_deg:az,emission_deg:0,shadowFraction:fraction,
    description:'Simulated top-down terrain image from the acquisition surface; not a delivered heightmap or an original stereo photograph.'}};
}
