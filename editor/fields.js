const cache = new WeakMap();
import {numericEvidenceFields} from './source-evidence.js';

export function loadFields(dataset) {
  if (!cache.has(dataset)) {
    const promise = new Promise((resolve,reject) => {
      const worker = new Worker(new URL('./field-worker.js',import.meta.url),{type:'module'});
      worker.onmessage = ({data}) => {
        worker.terminate();
        data.error ? reject(new Error(data.error)) : resolve({...data.fields,...numericEvidenceFields(dataset)});
      };
      worker.onerror = () => {worker.terminate(); reject(new Error('Terrain fields could not be calculated'));};
      worker.postMessage(dataset);
    }).catch(error => {cache.delete(dataset); throw error;});
    cache.set(dataset,promise);
  }
  return cache.get(dataset);
}
