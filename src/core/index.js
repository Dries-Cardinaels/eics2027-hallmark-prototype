// Public JavaScript interface of the prototype core. See docs/api.md.
export { ORIGIN, ORIGINS, SUMMARY, summariseOrigins } from './origins.js';
export { OPERATIONS, MARGIN, analysisGrid } from './operations.js';
export { DEFAULT_LIMITS, createPipeline, createDatasetPipeline, evaluate, evaluateLazy } from './pipeline.js';
export { query, qualityAt, declaredSourceIndices, graphPaths, combinedOriginText, CATEGORY_TEXT, OUTCOME_TEXT, DECLARED_NOTE, SOURCE_BOUNDARY } from './query.js';

export { qualityLabel, summariseQuality } from './quality.js';
export {nativeHeightEvidence,summariseHeightRMS,suppliedNumber} from './height-evidence.js';
export {lolaReturnState,lolaReturnLabel,summariseLolaReturns} from './height-evidence.js';
export {perturbationDiagnostic,declaredSourceSets} from './diagnostic.js';

export { illuminationTrace } from './illumination.js';
