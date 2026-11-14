// Normalizes evidence visibility. The editor also explicitly passes these switches to planning.
export function qualityVisibility(settings={}){
  if(typeof settings==='boolean')return {heights:settings,affected:settings};
  return {heights:settings?.heights!==false,affected:settings?.affected!==false};
}
