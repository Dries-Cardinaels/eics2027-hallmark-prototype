// Preserve the archived mockup entry point and asset names.
import {copyFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {prepareTerrainData} from './prepare-terrain-data.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'mockups/terrain-pipeline/assets');mkdirSync(out,{recursive:true});
await prepareTerrainData(out);
for(const [src,dst] of [['node_modules/three/build/three.module.js','three.module.js'],['node_modules/three/examples/jsm/controls/OrbitControls.js','OrbitControls.js'],['node_modules/three/LICENSE','THREE-LICENSE.txt']])copyFileSync(join(root,src),join(out,dst));
console.log('Prepared terrain mockup assets.');
