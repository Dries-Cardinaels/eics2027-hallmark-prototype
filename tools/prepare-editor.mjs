import {prepareTerrainData} from './prepare-terrain-data.mjs';
import {fileURLToPath} from 'node:url';
const output=fileURLToPath(new URL('../editor/data/',import.meta.url));
await prepareTerrainData(output,{earthCase:'nuugaatsiaq'});
console.log('Prepared editor data.');
