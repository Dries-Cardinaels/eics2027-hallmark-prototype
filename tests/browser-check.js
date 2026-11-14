// Paste into the browser console (or run through a page automation tool) with the prototype open.
// Checks that the source-map highlights and graph paths shown match the query records, for every
// bookmark and every graph node. Returns a list of failures (empty when everything matches).
(() => {
  const h = window.hallmark, failures = [];
  const nodes = h.createPipeline().operations.map(o => o.id);
  for (const b of h.bookmarks) for (const node of nodes) {
    h.select({ dataset: b.dataset, cell: b.cell, node, footprint: 'node', limits: { ...h.DEFAULT_LIMITS } });
    const q = h.inspect();
    const shown = [...document.querySelectorAll('#sources [data-source]')].map(g => `${g.dataset.r},${g.dataset.c}`).sort();
    const expected = q.sourceCells.map(c => `${c.row},${c.col}`).sort();
    if (shown.join(' ') !== expected.join(' ')) failures.push(`${b.id}/${node}: source map ${shown.length} vs query ${expected.length}`);
    const onPath = [...document.querySelectorAll('#graph .gnode.onpath')].map(g => g.dataset.node).sort();
    const pathNodes = [...new Set(q.paths.flatMap(p => p.nodes))].sort();
    if (onPath.join() !== pathNodes.join()) failures.push(`${b.id}/${node}: graph ${onPath} vs query ${pathNodes}`);
    const sel = document.querySelector('#graph .gnode.selected')?.dataset.node;
    if (sel !== node) failures.push(`${b.id}/${node}: selected graph node ${sel}`);
  }
  return { checked: h.bookmarks.length * nodes.length, failures };
})();
