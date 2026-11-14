import {Raycaster,Vector2,Vector3,Plane} from 'three';

// Horizontal ground distance, measured by ray/plane intersections rather than
// an assumed world X direction or terrain-height samples. Units are metres.
export function groundScale(camera,width,height,{planeY=0,targetPixels=100}={}){
  if(!camera.isOrthographicCamera||!(width>0&&height>0)||!Number.isFinite(planeY))return null;
  const raycaster=new Raycaster(),plane=new Plane(new Vector3(0,1,0),-planeY);
  const hits=[];
  for(const x of [0,Math.min(targetPixels,width*.4)]){
    raycaster.setFromCamera(new Vector2(x/width*2-1,0),camera);
    if(Math.abs(raycaster.ray.direction.y)<1e-7)return null;
    const point=raycaster.ray.intersectPlane(plane,new Vector3());
    if(!point)return null;
    hits.push(point);
  }
  const sampledPixels=Math.min(targetPixels,width*.4);
  const distance=Math.hypot(hits[1].x-hits[0].x,hits[1].z-hits[0].z);
  if(!(distance>0&&Number.isFinite(distance)))return null;
  const power=10**Math.floor(Math.log10(distance)),normal=distance/power;
  const metres=(normal>=5?5:normal>=2?2:1)*power;
  return {metres,pixels:sampledPixels*metres/distance,metresPerPixel:distance/sampledPixels};
}
