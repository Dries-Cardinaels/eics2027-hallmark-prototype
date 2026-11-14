// Prints slope, roughness and combined category for every analysis cell of a dataset.
import { evaluate, query } from '../src/core/index.js';
import { datasetById } from '../src/fixtures/terrain.js';
const ev = evaluate(datasetById(process.argv[2] || 'reference'));
const A = ev.dataset.W - 4, R = ev.records, sym = { neither: '·', slope: 'S', roughness: 'R', both: 'B', incomplete: '?' };
for (let r = 0; r < A; r++) {
  let line = '';
  for (let c = 0; c < A; c++) { const k = r * A + c; line += `${sym[R.combined[k].category]}${(R.slope[k].value ?? NaN).toFixed(0).padStart(3)}/${(R.roughness[k].value ?? NaN).toFixed(2).slice(1)} `; }
  console.log(String(r).padStart(2), line);
}
const cells = process.argv.slice(3).map(s => s.split(',').map(Number));
for (const [row, col] of cells) { const q = query(ev, 'combined', { row, col }); console.log(row, col, q.category, JSON.stringify(q.branches), q.origin.text); }
