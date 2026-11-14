// Explicit demonstration schedule, not a lunar ephemeris. Midpoints of equal one-hour bins.
export const ILLUMINATION_PERIOD = Object.freeze({
  id:'illustrative-12h', label:'Illustrative 12 h · T+0 to T+12', durationHours:12,
  boundary:'Terrain inside the delivered crop only; outside terrain excluded',
  samples:Object.freeze(Array.from({length:12},(_,i)=>Object.freeze({hour:i+.5,weightHours:1,azimuthDeg:60+240*(i+.5)/12,elevationDeg:2+13*Math.sin(Math.PI*(i+.5)/12)}))),
});
export function illuminationPeriod(ds) {
  const p=ds.illuminationPeriod || ILLUMINATION_PERIOD;
  if(!Number.isFinite(p.durationHours)||p.durationHours<=0||!p.samples?.length) throw new Error('Invalid illumination period');
  let last=-Infinity,total=0;
  for(const s of p.samples) {
    if(![s.hour,s.weightHours,s.azimuthDeg,s.elevationDeg].every(Number.isFinite)||s.hour<=last||s.hour<0||s.hour>p.durationHours||s.weightHours<=0||s.elevationDeg < -90||s.elevationDeg>90) throw new Error('Invalid Sun sample');
    last=s.hour;total+=s.weightHours;
  }
  if(Math.abs(total-p.durationHours)>1e-9) throw new Error('Sun sample weights must cover the period');
  return p;
}
const cache=new WeakMap();
// Half-cell ray sampling with nearest grid posts, retaining every unique post visited.
// Azimuth is clockwise from grid north; rows increase southward. No height is invented.
export function illuminationGeometry(ds,cell) {
  const period=illuminationPeriod(ds),key=`${ds.W}:${ds.H}:${ds.res}:${JSON.stringify(period)}`;
  let entry=cache.get(ds);if(!entry||entry.key!==key){entry={key,cells:new Map()};cache.set(ds,entry);}
  if(entry.cells.has(cell))return entry.cells.get(cell);
  const row=Math.floor(cell/(ds.W-4))+2,col=cell%(ds.W-4)+2,centre=row*ds.W+col;
  const east=period.gridMetric?.eastSpacing_m||ds.res,north=period.gridMetric?.northSpacing_m||ds.res;
  const rays=period.samples.map(sample=>{
    const indices=[],distances=[],seen=new Set([centre]);
    if(sample.elevationDeg>0) {
      const angle=sample.azimuthDeg*Math.PI/180,dx=Math.sin(angle)*ds.res/east,dy=-Math.cos(angle)*ds.res/north;
      for(let distance=.5;distance<=Math.hypot(ds.W,ds.H)+1;distance+=.5){
        const r=Math.floor(row+dy*distance+.5),c=Math.floor(col+dx*distance+.5);
        if(r<0||c<0||r>=ds.H||c>=ds.W)break;
        const i=r*ds.W+c;if(seen.has(i))continue;seen.add(i);
        indices.push(i);distances.push(Math.hypot((r-row)*north,(c-col)*east));
      }
    }
    return {indices:sample.elevationDeg>0?[centre,...indices]:[],distances:[0,...distances]};
  });
  const sources=[...new Set(rays.flatMap(r=>r.indices))].sort((a,b)=>a-b);
  const result={period,rays,sources};entry.cells.set(cell,result);return result;
}
export function calculateIllumination(ds,cell,values) {
  const {period,rays,sources}=illuminationGeometry(ds,cell),byIndex=new Map(sources.map((i,k)=>[i,values[k]]));
  const samples=period.samples.map((sun,t)=>{
    const ray=rays[t],z0=byIndex.get(ray.indices[0]);
    let unknown=false,shadow=false,maxAngle=-90;
    if(sun.elevationDeg>0) {
      unknown=!Number.isFinite(z0);
      ray.indices.slice(1).forEach((i,k)=>{
        const z=byIndex.get(i);if(!Number.isFinite(z)){unknown=true;return;}
        if(Number.isFinite(z0))maxAngle=Math.max(maxAngle,Math.atan2(z-z0,ray.distances[k+1])*180/Math.PI);
      });
      shadow=maxAngle>=sun.elevationDeg;
    }
    // A known blocker proves shadow even with missing posts elsewhere; absence of a known blocker cannot prove sunlight across missing terrain.
    const status=sun.elevationDeg<=0?'shadowed':shadow?'shadowed':unknown?'unknown':'illuminated';
    const interpolated=ds.originDeclaration?.status==='not-supplied' ? null : ray.indices.filter(i=>ds.origins[i]==='interpolated').length;
    const suspicious=ds.quality ? ray.indices.filter(i=>ds.quality.codes[i]===3).length : null;
    return {...sun,status,sources:ray.indices,interpolated,suspicious,missing:ray.indices.filter(i=>!Number.isFinite(byIndex.get(i))).length,horizonDeg:unknown?null:maxAngle};
  });
  const illuminatedHours=samples.filter(s=>s.status==='illuminated').reduce((a,s)=>a+s.weightHours,0);
  const unknownHours=samples.filter(s=>s.status==='unknown').reduce((a,s)=>a+s.weightHours,0);
  return {available:unknownHours===0,value:unknownHours?null:100*illuminatedHours/period.durationHours,
    ...(unknownHours?{reason:'Missing heights leave one or more Sun samples unknown'}:{}),
    illumination:{period,samples,illuminatedHours,unknownHours,lowerPercent:100*illuminatedHours/period.durationHours,upperPercent:100*(illuminatedHours+unknownHours)/period.durationHours,
      suspiciousSamples:ds.quality?samples.filter(s=>s.suspicious>0).length:null,interpolatedSamples:ds.originDeclaration?.status==='not-supplied'?null:samples.filter(s=>s.interpolated>0).length}};
}

// On-demand explanation of an already evaluated sample. Use evaluated source records,
// not derived slope/roughness or an independently chosen terrain neighbourhood.
export function illuminationTrace(ev,cell,sampleIndex) {
  const k=typeof cell==='number'?cell:cell.row*(ev.dataset.W-4)+cell.col;
  const info=ev.records.illumination?.[k]?.illumination;
  if(!info || !Number.isInteger(sampleIndex) || sampleIndex<0 || sampleIndex>=info.samples.length) throw new Error('Unknown recorded Sun sample');
  const sample=info.samples[sampleIndex],geometry=illuminationGeometry(ev.dataset,k);
  const ray=geometry.rays[sampleIndex],centre=ray.indices[0],z0=ev.records.heights[centre]?.value;
  const points=ray.indices.map((index,i)=>{
    const height=ev.records.heights[index].value,distance=ray.distances[i];
    const relative=Number.isFinite(height)&&Number.isFinite(z0)?height-z0:null;
    const angle=i>0&&relative!==null?Math.atan2(relative,distance)*180/Math.PI:null;
    return {index,row:Math.floor(index/ev.dataset.W),col:index%ev.dataset.W,distance_m:distance,height_m:height,relativeHeight_m:relative,angleDeg:angle,
      blocksSun:angle!==null&&angle>=sample.elevationDeg,origin:ev.dataset.origins[index],qualityCode:ev.dataset.quality?.codes[index]??null};
  });
  return {sample,points,contributionHours:sample.status==='unknown'?null:sample.status==='illuminated'?sample.weightHours:0,
    reason:sample.elevationDeg<=0?'Sun below horizon':sample.status==='shadowed'?'Terrain-blocked':sample.status==='unknown'?'Unresolved: missing heights':'Illuminated',
    periodHours:info.period.durationHours,illuminatedHours:info.illuminatedHours,unknownHours:info.unknownHours};
}
