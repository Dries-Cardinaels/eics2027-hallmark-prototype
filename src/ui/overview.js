// Explicit all-criteria rule. Availability is independent of known failures.
// Accept any number of criterion outcomes; never average unrelated measurements.
export function overview(outcomes) {
  const entries = Object.entries(outcomes);
  const unmet = entries.filter(([,outcome]) => outcome === 'exceeded').map(([name]) => name);
  const unknown = entries.filter(([,outcome]) => outcome !== 'exceeded' && outcome !== 'not-exceeded').map(([name]) => name);
  const incomplete = unknown.length > 0 || entries.length === 0;
  const failure = `${unmet.length} ${unmet.length === 1 ? 'criterion' : 'criteria'} unmet`;
  const title = unmet.length ? failure + (incomplete ? ' · incomplete' : '')
    : incomplete ? 'Assessment incomplete' : 'All criteria met';
  return {unmet, unknown, incomplete, title};
}
