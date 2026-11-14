// SVG explanation of the same tested posts and sight-line comparison as the core.
// Lines only join adjacent known posts; missing inputs never acquire a fabricated height.
export function sunProfile(trace) {
  const {sample,points,reason}=trace;
  const heading='<text x="48" y="18" font-size="13" font-weight="600">Terrain toward the Sun</text>';
  if(!points.length)return heading+`<text x="48" y="90" font-size="15">${reason}</text><text x="48" y="117" font-size="12">Sun elevation ${sample.elevationDeg.toFixed(2)}°</text><text x="48" y="144" font-size="12">No terrain heights tested.</text>`;
  const maxD=Math.max(1,...points.map(p=>p.distance_m));
  const tan=Math.tan(sample.elevationDeg*Math.PI/180),sunEnd=tan*maxD;
  const heights=points.map(p=>p.relativeHeight_m).filter(Number.isFinite);
  const lo=Math.min(0,...heights),hi=Math.max(.1,sunEnd,...heights),pad=Math.max(.2,(hi-lo)*.12);
  const x=d=>48+d/maxD*340,y=z=>180-(z-lo+pad)/(hi-lo+2*pad)*135;
  let svg=heading+`<text x="48" y="35" font-size="10">Height relative to selected cell (m)</text><path d="M48 42V180H388" fill="none" stroke="#6c7b80"/>`;
  for(const z of [lo,(lo+hi)/2,hi])svg+=`<path d="M45 ${y(z)}H388" stroke="#dce3e5"/><text x="41" y="${y(z)+3}" font-size="10" text-anchor="end">${z.toFixed(1)}</text>`;
  for(const d of [0,maxD/2,maxD])svg+=`<text x="${x(d)}" y="195" font-size="10" text-anchor="middle">${d.toFixed(0)}</text>`;
  svg+='<text x="220" y="211" font-size="10" text-anchor="middle">Distance from selected cell (m) → Sun</text>';
  svg+=`<path data-sun-line="true" d="M48 ${y(0)}L388 ${y(sunEnd)}" stroke="#997013" stroke-width="2" stroke-dasharray="6 3" fill="none"/>`;
  points.forEach((p,i)=>{
    const prev=points[i-1];
    if(p.relativeHeight_m===null){svg+=`<text data-missing-post="true" x="${x(p.distance_m)}" y="174" font-size="13" text-anchor="middle">?</text>`;return;}
    if(prev&&prev.relativeHeight_m!==null)svg+=`<path d="M${x(prev.distance_m)} ${y(prev.relativeHeight_m)}L${x(p.distance_m)} ${y(p.relativeHeight_m)}" fill="none" stroke="#263d45" stroke-width="1.4"/>`;
    const color=p.qualityCode===3?'#8056a3':p.origin==='interpolated'?'#b77d17':'#455c65';
    svg+=`<circle data-profile-index="${p.index}" data-blocks-sun="${p.blocksSun}" cx="${x(p.distance_m)}" cy="${y(p.relativeHeight_m)}" r="${p.blocksSun?4:2.7}" fill="${color}" stroke="${p.blocksSun?'#111':'#fff'}" stroke-width="${p.blocksSun?1.5:.7}"><title>Height (${p.row}, ${p.col}): ${p.height_m.toFixed(3)} m; distance ${p.distance_m.toFixed(1)} m${p.angleDeg===null?'':'; angle '+p.angleDeg.toFixed(2)+'°'}${p.blocksSun?'; blocks Sun':''}${p.qualityCode===3?'; suspicious quality':''}${p.origin==='interpolated'?'; declared interpolated':''}</title></circle>`;
  });
  svg+='<path d="M48 231h18" stroke="#263d45" stroke-width="2"/><text x="70" y="234" font-size="10">Terrain</text><path d="M135 231h18" stroke="#997013" stroke-width="2" stroke-dasharray="5 2"/><text x="157" y="234" font-size="10">Sun line</text><circle cx="230" cy="231" r="4" fill="#fff" stroke="#111"/><text x="239" y="234" font-size="10">Blocking post</text>';
  return svg;
}

export function sunArrow(sample,cx,cy,size,metric) {
  const angle=sample.azimuthDeg*Math.PI/180;
  let dx=Math.sin(angle)/(metric?.eastSpacing_m||1),dy=-Math.cos(angle)/(metric?.northSpacing_m||1);
  const norm=Math.hypot(dx,dy);dx/=norm;dy/=norm;
  const roomX=dx>0?(size-3-cx)/dx:dx<0?(3-cx)/dx:Infinity;
  const roomY=dy>0?(size-3-cy)/dy:dy<0?(3-cy)/dy:Infinity;
  const len=Math.max(0,Math.min(size*.14,roomX,roomY)),ex=cx+len*dx,ey=cy+len*dy;
  return `<g data-sun-direction="${sample.azimuthDeg}" pointer-events="none"><title>Toward Sun: azimuth ${sample.azimuthDeg.toFixed(2)}°, elevation ${sample.elevationDeg.toFixed(2)}°</title><path d="M${cx} ${cy}L${ex} ${ey}M${ex-6*dx+3*dy} ${ey-6*dy-3*dx}L${ex} ${ey}L${ex-6*dx-3*dy} ${ey-6*dy+3*dx}" fill="none" stroke="#997013" stroke-width="2.2"/></g>`;
}
