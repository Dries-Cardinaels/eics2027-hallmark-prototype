// The shortcut follows the persistent planning branch, including roughness-only
// inputs in the combined union. It never invents an affected route location.
export function flaggedRouteInspection(path,branch='combined'){
 const layerId=branch==='heights'?'heights':branch.startsWith('slope')?'slope':branch.startsWith('roughness')?'roughness':'combined';
 const flagged=cell=>layerId==='heights'?cell.priority?.heightFlag===true:(layerId==='combined'?cell:cell[layerId])?.suspicious>0;
 const candidates=(path?.cells||[]).filter(flagged);
 const cell=candidates.find(c=>c.index>0&&c.index<path.cells.length-1)||candidates[0];
 return cell?{cell,layerId}:null;
}
