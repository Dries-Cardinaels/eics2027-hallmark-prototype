// Builds dist/hallmark-prototype.html: the same modules inlined into one file that opens from disk
// (file://) without a server. Preview assets live beside it and load on demand. Each module becomes a function scope returning its exports.
// Run: node tools/build-standalone.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TERRAIN_PREVIEWS } from '../src/fixtures/terrain-previews.js';
import { LUNAR_DATA } from '../src/fixtures/lunar-data.js';
import { EARTH_DATA } from '../src/fixtures/earth-data.js';
import { EARTH_DIEPENBEEK_DATA } from '../src/fixtures/earth-diepenbeek-data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['src/core/origins.js', 'src/core/quality.js', 'src/core/illumination.js', 'src/core/sample-counts.js', 'src/core/height-evidence.js', 'src/core/operations.js', 'src/core/pipeline.js', 'src/core/query.js', 'src/core/index.js', 'src/fixtures/lunar-data.js', 'src/fixtures/lroc-data.js', 'src/fixtures/earth-data.js', 'src/fixtures/earth-diepenbeek-data.js', 'src/fixtures/lunar-sun-data.js', 'src/fixtures/terrain.js', 'src/ui/preview-loader.js', 'src/ui/overview.js', 'src/ui/map-geometry.js', 'src/ui/sun-profile.js', 'src/ui/evidence.js', 'src/ui/terrain-experiment.js', 'src/ui/app.js'];
const id = (path) => 'M_' + path.replace(/[^a-z0-9]/gi, '_');
const target = (from, spec) => relative(root, resolve(dirname(join(root, from)), spec));

// Emit a tiny lazy index and separate PNGs; neither is in the initial HTML.
const assetDir = join(root,'dist/preview');
mkdirSync(assetDir,{recursive:true});
const asset = (name,bytes) => {
  const digest=createHash('sha256').update(bytes).digest('hex').slice(0,12);
  const filename=`${name}-${digest}.png`;
  writeFileSync(join(assetDir,filename),bytes);
  return filename;
};
const previews=structuredClone(TERRAIN_PREVIEWS);
for(const p of previews) for(const key of ['images','sampled','comparisons']) {
  p[key]=Object.fromEntries(Object.entries(p[key]).map(([scale,data])=>
    [scale,asset(`${p.id}-${key}-${scale}x`,Buffer.from(data.split(',')[1],'base64'))]));
}
previews.push({id:'lroc-nassau02',title:'LROC · Nassau · published DEM',kind:'published-dem',extent_m:200,images:Object.fromEntries([1,3].map(scale=>[scale,asset(`lroc-nassau02-${scale}x`,readFileSync(join(root,`figures/lroc-nassau02-surface-${scale}x.png`)))])),sampled:{},comparisons:{}});
previews.push({id:'lroc-nassau02-illumination',title:'LROC · Nassau illumination · fixed Sun',kind:'published-dem',fixedSun:true,extent_m:200,images:{'1':asset('nassau-illumination-fixed',readFileSync(join(root,'figures/lroc-nassau02-illumination-fixed.png')))},sampled:{},comparisons:{}});
for(const D of [EARTH_DATA,EARTH_DIEPENBEEK_DATA]){const site=D.id.replace('copernicus-','');previews.push({id:D.id,title:`${D.title.replace(' · 30 m','')} · delivered DEM`,kind:'published-dem',extent_m:Math.round(D.W*D.res),images:Object.fromEntries([1,3].map(scale=>[scale,asset(`copernicus-${site}-${scale}x`,readFileSync(join(root,`figures/copernicus-${site}-surface-${scale}x.png`)))])),sampled:{},comparisons:{}});}
const shadows=Object.fromEntries(LUNAR_DATA.datasets.map(d=>[d.id,asset(`${d.id}-shadow`,readFileSync(join(root,`figures/${d.id}-terrain.png`)))]));
// Reference satellite basemaps (context only): lazy JPEG assets keyed by delivery id.
const basemaps={};
for(const D of [EARTH_DATA,EARTH_DIEPENBEEK_DATA]){const site=D.id.replace('copernicus-','');const p=join(root,`fixtures/earth/${site}/basemap.jpg`);if(existsSync(p)){const bytes=readFileSync(p);const digest=createHash('sha256').update(bytes).digest('hex').slice(0,12);const fn=`basemap-${site}-${digest}.jpg`;writeFileSync(join(assetDir,fn),bytes);basemaps[D.id]=fn;}}
const previewScript=`window.__HALLMARK_PREVIEW_ASSETS__ = ${JSON.stringify({previews,shadows,basemaps})};\n`;
writeFileSync(join(assetDir,'manifest.js'),previewScript);
const previewVersion=createHash('sha256').update(previewScript).digest('hex').slice(0,12);

// Local, demand-loaded Three.js + controls also work when the HTML opens from disk.
const terrainDir=join(root,'dist/terrain');mkdirSync(terrainDir,{recursive:true});
let orbit=readFileSync(join(root,'node_modules/three/examples/jsm/controls/OrbitControls.js'),'utf8');
orbit=orbit.replace(/import \{([\s\S]*?)\} from 'three';/, 'const {$1} = window.THREE;').replace('export { OrbitControls };','window.HallmarkOrbitControls = OrbitControls;');
writeFileSync(join(terrainDir,'three-controls.js'),readFileSync(join(root,'node_modules/three/build/three.min.js'),'utf8')+'\n;(()=>{\n'+orbit+'\n})();\n');
writeFileSync(join(terrainDir,'THREE-LICENSE.txt'),readFileSync(join(root,'node_modules/three/LICENSE')));

const modules = ORDER.map(path => {
  let src = readFileSync(join(root, path), 'utf8');
  const exported = [];
  src = src.replace(/^import \* as (\w+) from '([^']+)';$/gm, (_, name, spec) => `const ${name} = ${id(target(path, spec))};`);
  src = src.replace(/^import \{([^}]+)\} from '([^']+)';$/gm, (_, names, spec) => `const {${names}} = ${id(target(path, spec))};`);
  src = src.replace(/^export \{([^}]+)\} from '([^']+)';$/gm, (_, names, spec) => {
    exported.push(...names.split(',').map(n => n.trim()));
    return `const {${names}} = ${id(target(path, spec))};`;
  });
  src = src.replace(/^export (const|function|class|let) (\w+)/gm, (_, kind, name) => { exported.push(name); return `${kind} ${name}`; });
  if (/^\s*(import|export)\b/m.test(src)) throw new Error(`Unhandled import/export in ${path}`);
  return `// ---- ${path}\nconst ${id(path)} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();`;
});

let html = readFileSync(join(root, 'index.html'), 'utf8');
html=html.replace('data-library="dist/terrain/three-controls.js"','data-library="terrain/three-controls.js"');
html = html.replace('data-assets="dist/preview/manifest.js"', `data-assets="preview/manifest.js?v=${previewVersion}"`);
const css = readFileSync(join(root, 'src/ui/style.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="src/ui/style.css">', () => `<style>\n${css}</style>`);
html = html.replace('<script type="module" src="src/ui/app.js"></script>', () => `<script>\n"use strict";\n${modules.join('\n\n')}\n</script>`);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/hallmark-prototype.html'), html);
console.log(`dist/hallmark-prototype.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB); lazy preview index ${(Buffer.byteLength(previewScript)/1024).toFixed(1)} KiB + on-demand PNGs`);
