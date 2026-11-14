// Eligibility for the original LunarBlock nearest-seed/smoothing filler.
// Distance is the shortest four-neighbour path through covered posts to an original
// stereo match. Interpolated posts never become new evidence for expanding the limit.
export function planBoundedGaps({matched, inOverlap, W, H, res, maxDistance_m}) {
  if (!Number.isInteger(W) || !Number.isInteger(H) || W<1 || H<1 || matched.length!==W*H || inOverlap.length!==W*H || !(res>0) || !Number.isFinite(maxDistance_m) || maxDistance_m<0) throw new Error('Invalid bounded-fill geometry or distance');
  const distance_m=new Float64Array(W*H).fill(Infinity),queue=new Int32Array(W*H);
  let head=0,tail=0;
  for(let k=0;k<matched.length;k++) if(matched[k] && inOverlap[k]) {distance_m[k]=0;queue[tail++]=k;}
  while(head<tail) {
    const k=queue[head++],r=Math.floor(k/W),c=k%W;
    for(const next of [c>0?k-1:-1,c<W-1?k+1:-1,r>0?k-W:-1,r<H-1?k+W:-1]) {
      if(next>=0 && inOverlap[next] && distance_m[next]===Infinity) {distance_m[next]=distance_m[k]+res;queue[tail++]=next;}
    }
  }
  const fill=Uint8Array.from(matched,(m,k)=>!m && inOverlap[k] && distance_m[k]<=maxDistance_m ? 1 : 0);
  return {fill,distance_m};
}
