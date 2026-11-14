// Trace only exposed grid edges: adjacent cells in the same region share no outline.
export function regionBoundary(mask, width, size, margin = 0) {
  let path = '';
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const row = Math.floor(k / width), col = k % width;
    const x = (col + margin) * size, y = (row + margin) * size;
    if (row === 0 || !mask[k - width]) path += `M${x} ${y}h${size}`;
    if (col === width - 1 || !mask[k + 1]) path += `M${x + size} ${y}v${size}`;
    if (k + width >= mask.length || !mask[k + width]) path += `M${x} ${y + size}h${size}`;
    if (col === 0 || !mask[k - 1]) path += `M${x} ${y}v${size}`;
  }
  return path;
}
