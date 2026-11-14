import {evaluateRaster} from '../src/core/raster.js';

self.onmessage = ({data:dataset}) => {
  try {
    const fields = Object.fromEntries(['heights','slope','roughness','combined'].map(id => [id,evaluateRaster(dataset,id)]));
    const buffers = Object.values(fields).flatMap(field => [field.values.buffer,...(field.quality ? [field.quality.suspicious.buffer,field.quality.total.buffer] : [])]);
    self.postMessage({fields},buffers);
  } catch (error) {
    self.postMessage({error:error.message});
  }
};
