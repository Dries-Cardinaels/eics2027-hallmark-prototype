// A published categorical per-cell quality layer, kept independent of height origin and uncertainty.
// The default vocabulary is the LROC stereo status; a dataset may instead declare its own byte-code
// legend (`definitions`) and which codes count as flagged/nominal, so other products are labelled
// from their own documentation rather than relabelled into LROC's codes.
const LROC_LABELS = {0:'NoData / outside boundary',1:'Shadowed',2:'Saturated',3:'Suspicious',4:'Interpolated / extrapolated',15:'Manually edited'};
const LROC_FLAGGED = new Set([3]);
// LROC code 0 is "NoData / outside boundary": the supplier gives no quality for that height, so it is
// unknown, never "not suspicious". Other products declare their own `unknownCodes` (default: none).
const LROC_UNKNOWN = new Set([0]);
const inRange = (c) => c >= 10 && c <= 14; // LROC successful-correlation band

export function qualityLabel(code, quality) {
  if (quality?.definitions && quality.definitions[code] != null) return quality.definitions[code];
  if (inRange(code)) return 'Successful correlation';
  return LROC_LABELS[code] ?? 'Unmapped quality code';
}

const flaggedSetOf = (q) => q.flaggedCodes ? new Set(q.flaggedCodes) : LROC_FLAGGED;
const isNominal = (q, code) => q.nominalCodes ? q.nominalCodes.includes(code) : inRange(code);
const usesLrocTable = (q) => !q.definitions && (!q.kind || q.kind.startsWith('lroc'));
const unknownSetOf = (q) => q.unknownCodes ? new Set(q.unknownCodes) : usesLrocTable(q) ? LROC_UNKNOWN : new Set();

export function summariseQuality(cells, quality) {
  const counts = {}, flagged = flaggedSetOf(quality), unknownCodes = unknownSetOf(quality);
  let total = 0, suspicious = 0, correlated = 0, unknown = 0;
  for (const i of cells) {
    const code = quality.codes[i]; counts[code] = (counts[code] || 0) + 1; total++;
    if (unknownCodes.has(code)) { unknown++; continue; }
    if (flagged.has(code)) suspicious++;
    if (isNominal(quality, code)) correlated++;
  }
  // Field names stay `suspicious`/`correlated` for the shared presentation path; they carry the
  // declared flagged/nominal counts for whichever product supplied the layer. `total` counts every
  // declared height; `known` excludes heights whose code means the supplier gave no quality.
  const known = total - unknown, unknownText = unknown ? `; ${unknown} unknown` : '';
  return {kind:quality.kind,counts,total,known,unknown,suspicious,correlated,
    headline:suspicious?'suspicious':unknown?'unknown':correlated===total?'correlated':'other',
    text:(suspicious?`${suspicious} of ${total} inputs flagged ${quality.terms?.flaggedLower ?? 'suspicious'}`:unknown?`No flagged input among ${known} known`:correlated===total?`${quality.terms?.nominal ?? 'Successful correlation'}s only`:'Other quality flags present')+unknownText};
}
