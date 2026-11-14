// Declared input origins and how a set of declared source heights is summarised.
//
// The four states follow the Hallmark vocabulary. An origin describes how a delivered height was
// produced, as declared by the delivery record. It is not accuracy, uncertainty or safety.

export const ORIGIN = Object.freeze({
  OBSERVED: 'observed',
  INTERPOLATED: 'interpolated',
  UNDOCUMENTED: 'undocumented',
  ABSENT: 'absent',
});
export const ORIGINS = Object.freeze([ORIGIN.OBSERVED, ORIGIN.INTERPOLATED, ORIGIN.UNDOCUMENTED, ORIGIN.ABSENT]);

// Headline used by the origin display. Precedence only chooses which state is named first; the
// counts are always retained, so a set with interpolation and undocumented history reports both.
export const SUMMARY = Object.freeze({
  observed: { id: 'observed', text: 'Observed', long: 'all declared source heights are observed' },
  interpolated: { id: 'interpolated', text: 'Includes interpolation', long: 'at least one declared source height is interpolated' },
  undocumented: { id: 'undocumented', text: 'Includes undocumented history', long: 'at least one declared source height has no documented origin' },
  absent: { id: 'absent', text: 'Required height absent', long: 'at least one declared source height is absent' },
});

// cells: iterable of height indices; originOf(index) → one of ORIGINS.
export function summariseOrigins(cells, originOf) {
  const counts = { observed: 0, interpolated: 0, undocumented: 0, absent: 0 };
  let total = 0;
  for (const i of cells) { counts[originOf(i)]++; total++; }
  const headline = counts.absent ? 'absent' : counts.undocumented ? 'undocumented' : counts.interpolated ? 'interpolated' : 'observed';
  const parts = [];
  if (counts.interpolated) parts.push('interpolation');
  if (counts.undocumented) parts.push('undocumented history');
  if (counts.absent) parts.push('an absent height');
  const text = parts.length ? `Includes ${parts.join(' and ')}` : SUMMARY.observed.text;
  return { headline, text, counts, total };
}
