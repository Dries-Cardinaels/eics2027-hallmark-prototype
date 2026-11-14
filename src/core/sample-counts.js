// Both surveys record a sample count per working cell. The count's meaning
// stays survey-specific: lidar returns and valid DSM pixels are different inputs.
export const nativeSampleCounts = dataset => dataset.groundCounts ?? dataset.dsmSampleCounts;
