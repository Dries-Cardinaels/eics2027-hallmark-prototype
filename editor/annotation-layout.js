// Screen rectangles only; this helper never changes terrain positions or data.
export function rectanglesOverlap(a,b,padding=0){
 return a.left<b.left+b.width+padding&&a.left+a.width+padding>b.left&&a.top<b.top+b.height+padding&&a.top+a.height+padding>b.top;
}
export function placeAnnotation(anchor,size,viewport,obstacles=[],{gap=14,margin=8}={}){
 const {width,height}=size;
 if(width>viewport.width-2*margin||height>viewport.height-2*margin)return null;
 for(const distance of [gap,30,54,90,140,200]){
  const candidates=[
   [anchor.x+distance,anchor.y-height/2],[anchor.x-width/2,anchor.y+distance],
   [anchor.x-width-distance,anchor.y-height/2],[anchor.x-width/2,anchor.y-height-distance],
   [anchor.x+distance,anchor.y+distance],[anchor.x-width-distance,anchor.y+distance],
   [anchor.x+distance,anchor.y-height-distance],[anchor.x-width-distance,anchor.y-height-distance],
  ];
  for(const [x,y] of candidates){
   const rect={left:Math.max(margin,Math.min(viewport.width-width-margin,x)),top:Math.max(margin,Math.min(viewport.height-height-margin,y)),width,height};
   const collisions=obstacles.filter(o=>rectanglesOverlap(rect,o,3));
   if(!collisions.length)return {...rect,collisions:0};

  }
 }
 return null;
}

export function projectedSpriteRect(point,size,camera,viewport){
 if(point.z< -1||point.z>1)return null;
 const width=size.x/(camera.right-camera.left)*camera.zoom*viewport.width,height=size.y/(camera.top-camera.bottom)*camera.zoom*viewport.height;
 const rect={left:(point.x*.5+.5)*viewport.width-width/2,top:(-point.y*.5+.5)*viewport.height-height/2,width,height};
 return rect.left>viewport.width||rect.top>viewport.height||rect.left+width<0||rect.top+height<0?null:rect;
}
