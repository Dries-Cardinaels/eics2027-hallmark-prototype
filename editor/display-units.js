// Presentation only: native affine spacing remains unchanged in every calculation.
export const displayMetres=value=>Number.isFinite(value)?Number(value.toPrecision(4)).toLocaleString('en',{maximumFractionDigits:8}):'—';
