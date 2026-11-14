// Classic-script metadata loading also works from file://, without fetch/module CORS.
// No request is made until called. Share in-flight work and cache successful loads.
let request = null;
export function loadPreviewAssets(url) {
  if (request) return request;
  request = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(url, document.baseURI).href;
    script.async = true;
    const fail = () => { script.remove(); reject(new Error('Preview assets could not be loaded.')); };
    script.onerror = fail;
    script.onload = () => {
      const payload = window.__HALLMARK_PREVIEW_ASSETS__;
      delete window.__HALLMARK_PREVIEW_ASSETS__;
      if (!payload || !Array.isArray(payload.previews) || !payload.shadows) { fail(); return; }
      const imageURL = path => new URL(path, script.src).href;
      for (const preview of payload.previews) for (const key of ['images','sampled','comparisons']) {
        preview[key] = Object.fromEntries(Object.entries(preview[key]).map(([scale,path])=>[scale,imageURL(path)]));
      }
      payload.shadows = Object.fromEntries(Object.entries(payload.shadows).map(([id,path])=>[id,imageURL(path)]));
      if (payload.basemaps) payload.basemaps = Object.fromEntries(Object.entries(payload.basemaps).map(([id,path])=>[id,imageURL(path)]));
      script.remove();
      resolve(payload);
    };
    document.head.append(script);
  }).catch(error => { request = null; throw error; });
  return request;
}
