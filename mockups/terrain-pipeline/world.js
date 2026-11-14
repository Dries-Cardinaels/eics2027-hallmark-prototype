import * as T from 'three';
import {OrbitControls} from './assets/OrbitControls.js';
// Surface vertices are native height estimates. Walls and the flat display base are illustrative.
export function createWorld(host,onPick){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setClearColor('#e9eee9');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;host.prepend(renderer.domElement);
 const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Terrain chunk. Drag to orbit, scroll to zoom. Click to inspect a location; arrow keys move between cells.');
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10000),controls=new OrbitControls(camera,canvas);controls.enableDamping=false;controls.maxPolarAngle=Math.PI*.46;controls.minPolarAngle=.12;controls.minZoom=.5;controls.maxZoom=12;
 scene.add(new T.HemisphereLight(0xe9f3ff,0x6b7564,2.1));const sun=new T.DirectionalLight(0xfff2dd,3.8);sun.position.set(-300,600,200);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.12;sun.shadow.bias=-.0001;scene.add(sun);
 let chunk,top,wire,supportGroup,model,state,dsid,base,depth,span=1,extent=1,texture,oldPaintKey,oldModel,down;
 const markers={};for(const [id,text] of [['selected','01'],['north','N'],['east','E']]){const el=document.createElement('span');el.className=`world-label ${id}`;el.textContent=text;host.append(el);markers[id]=el;}
 let anchors={};const mat=new T.MeshStandardMaterial({roughness:1,metalness:0,side:T.FrontSide}),ray=new T.Raycaster();
 const floor=new T.Mesh(new T.PlaneGeometry(6000,6000),new T.ShadowMaterial({opacity:.15}));floor.rotation.x=-Math.PI/2;floor.position.y=-.15;floor.receiveShadow=true;scene.add(floor);
 function dispose(group){if(!group)return;scene.remove(group);group.traverse(o=>{o.geometry?.dispose();if(o.material&&o.material!==mat)o.material.dispose();});}
 function pos(r,c,lift=0){const ds=model.ds;return new T.Vector3((c-(ds.W-1)/2)*ds.res,model.heights[r*ds.W+c]-base+depth+lift,(r-(ds.H-1)/2)*ds.res);}
 function fit(){camera.up.set(0,1,0);camera.zoom=1;span=extent*1.02;const box=new T.Box3().setFromObject(chunk);const center=box.getCenter(new T.Vector3());controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(.85,.82,1.05).normalize().multiplyScalar(extent*3));controls.update();draw();}
 function topView(){camera.up.set(0,0,-1);camera.zoom=1;span=extent*1.15;controls.target.set(0,depth+(maxHeight()-base)*.5,0);camera.position.set(0,extent*4,extent*.001);controls.update();draw();}
 function maxHeight(){let n=-Infinity;for(const z of model.heights)if(z>n)n=z;return n;}
 function buildChunk(){
  dispose(chunk);chunk=new T.Group();scene.add(chunk);const ds=model.ds,{W,H,res}=ds;base=Infinity;for(const h of model.heights)if(h<base)base=h;depth=ds.id==='earth'?38:23;extent=Math.max(W-1,H-1)*res;
  const positions=new Float32Array(W*H*3),uv=new Float32Array(W*H*2),indices=[];
  for(let r=0;r<H;r++)for(let c=0;c<W;c++){const k=r*W+c,p=pos(r,c);positions.set([p.x,p.y,p.z],k*3);uv.set([(c+.5)/W,1-(r+.5)/H],k*2);if(r<H-1&&c<W-1)indices.push(k,k+W,k+1,k+1,k+W,k+W+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();top=new T.Mesh(g,mat);top.castShadow=true;top.receiveShadow=true;chunk.add(top);
  wire=new T.LineSegments(new T.WireframeGeometry(g),new T.LineBasicMaterial({color:0x204a43,transparent:true,opacity:.13,depthWrite:false}));wire.position.y=extent*.0003;chunk.add(wire);
  const perimeter=[];for(let c=0;c<W;c++)perimeter.push([0,c]);for(let r=1;r<H;r++)perimeter.push([r,W-1]);for(let c=W-2;c>=0;c--)perimeter.push([H-1,c]);for(let r=H-2;r>0;r--)perimeter.push([r,0]);
  const verts=[],colours=[],a=new T.Color(ds.id==='earth'?'#877058':'#74746d'),b=new T.Color(ds.id==='earth'?'#3c4338':'#383b37');
  const add=(p,level)=>{verts.push(p.x,p.y,p.z);const t=Math.min(1,Math.max(0,level/(depth+peak-base)));const colour=b.clone().lerp(a,t);colours.push(colour.r,colour.g,colour.b);};
  const peak=maxHeight();
  for(let i=0;i<perimeter.length;i++){const [r,c]=perimeter[i],[r2,c2]=perimeter[(i+1)%perimeter.length],p=pos(r,c),q=pos(r2,c2),pb=p.clone().setY(0),qb=q.clone().setY(0);for(const v of [p,q,pb,q,qb,pb])add(v,v.y);}
  const sides=new T.BufferGeometry();sides.setAttribute('position',new T.Float32BufferAttribute(verts,3));sides.setAttribute('color',new T.Float32BufferAttribute(colours,3));sides.computeVertexNormals();const sideMesh=new T.Mesh(sides,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide}));sideMesh.castShadow=true;sideMesh.receiveShadow=true;chunk.add(sideMesh);
  const bottom=new T.Mesh(new T.BoxGeometry((W-1)*res,extent*.012,(H-1)*res),new T.MeshStandardMaterial({color:ds.id==='earth'?0x414c40:0x404540,roughness:.85}));bottom.position.y=-extent*.006;bottom.castShadow=true;bottom.receiveShadow=true;chunk.add(bottom);floor.position.y=-extent*.013;
  sun.position.set(-extent,extent*1.6,extent*.65);sun.target.position.set(0,depth,0);scene.add(sun.target);const sc=sun.shadow.camera;sc.left=sc.bottom=-extent;sc.right=sc.top=extent;sc.near=1;sc.far=extent*5;sc.updateProjectionMatrix();sun.shadow.normalBias=ds.res*.17;
  anchors.north=new T.Vector3(-extent*.57,0,-extent*.4);anchors.east=new T.Vector3(extent*.55,0,extent*.44);oldPaintKey='';fit();
 }
 function paint(){
  const ds=model.ds,{W,H}=ds,map=document.createElement('canvas');map.width=W;map.height=H;const ctx=map.getContext('2d'),image=ctx.createImageData(W,H),view=state.paint,values=model.values[state.node],count=model.sourceCount[state.node];
  let lo=Infinity,hi=-Infinity;for(const z of values)if(Number.isFinite(z)){lo=Math.min(lo,z);hi=Math.max(hi,z);}
  const peak=maxHeight(),ca=new T.Color(),earth=ds.id==='earth';
  function random(r,c){const x=Math.sin(r*127.1+c*311.7)*43758.5453;return x-Math.floor(x);}
  for(let r=0;r<H;r++)for(let c=0;c<W;c++){
   const k=r*W+c,z=model.heights[k],noise=random(r,c),grad=model.values.slope[k]||0;
   if(view==='terrain'){
    if(earth){const t=(z-base)/(peak-base);ca.set('#697d4b').lerp(new T.Color('#b3ac7d'),t*.48);ca.lerp(new T.Color('#a59b85'),Math.min(.65,Math.max(0,grad-18)/45));ca.multiplyScalar(.85+noise*.22);}
    else{ca.set('#8c8d85');ca.lerp(new T.Color('#aaa99c'),(z-base)/(peak-base)*.35);let curvature=0;if(r>0&&c>0&&r<H-1&&c<W-1)curvature=(model.heights[k-W]+model.heights[k+W]+model.heights[k-1]+model.heights[k+1])/4-z;ca.multiplyScalar((.88+noise*.2)*(1-Math.min(.3,Math.max(0,curvature)*.35)));}
   }else if(view==='evidence'){
    if(!model.quality)ca.set('#c2cac6');else{const n=model.flagged[state.node][k];ca.set('#dfe6e2').lerp(new T.Color('#87639d'),n/count);}
   }else{if(!Number.isFinite(values[k]))ca.set('#cdd5cf');else if(state.node==='criterion')ca.set(values[k]?'#c7d6c1':'#ba8b66');else ca.set('#dce7d7').lerp(new T.Color('#334f46'),(values[k]-lo)/(hi-lo||1));}
   ca.convertLinearToSRGB();image.data.set([ca.r*255,ca.g*255,ca.b*255,255],k*4);
  }
  ctx.putImageData(image,0,0);texture?.dispose();texture=new T.CanvasTexture(map);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.NearestFilter;texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;mat.map=texture;mat.toneMapped=view==='terrain';
  mat.color.set(view==='terrain'?0xffffff:0x000000);mat.emissive.set(view==='terrain'?0x000000:0xffffff);mat.emissiveMap=view==='terrain'?null:texture;mat.emissiveIntensity=view==='terrain'?0:1;mat.needsUpdate=true;
 }
 function mark(){
  dispose(supportGroup);supportGroup=new T.Group();scene.add(supportGroup);const {row:r,col:c}=state,ds=model.ds,q=model.inspect(state.node,r,c),lift=extent*.002;
  const p=pos(r,c,lift);anchors.selected=p.clone().add(new T.Vector3(0,extent*.045,0));
  const ring=new T.Mesh(new T.TorusGeometry(Math.max(ds.res*.7,extent*.002),Math.max(ds.res*.09,extent*.00045),6,28),new T.MeshBasicMaterial({color:0xe3b96c,depthTest:false}));ring.rotation.x=Math.PI/2;ring.position.copy(p);ring.renderOrder=5;supportGroup.add(ring);
  if(state.showSupport){const pts=[],colors=[];for(const k of q.indices){const rr=Math.floor(k/ds.W),cc=k%ds.W,p=pos(rr,cc,lift),colour=new T.Color(model.quality?.[k]===3?0xa17cae:0x2f776a);pts.push(p.x,p.y,p.z);colors.push(colour.r,colour.g,colour.b);}const pg=new T.BufferGeometry();pg.setAttribute('position',new T.Float32BufferAttribute(pts,3));pg.setAttribute('color',new T.Float32BufferAttribute(colors,3));supportGroup.add(new T.Points(pg,new T.PointsMaterial({size:5,vertexColors:true})));
   const rows=q.indices.map(i=>Math.floor(i/ds.W)),cols=q.indices.map(i=>i%ds.W),r0=Math.min(...rows),r1=Math.max(...rows),c0=Math.min(...cols),c1=Math.max(...cols),points=[];
   for(let cc=c0;cc<=c1;cc++)points.push(pos(r0,cc,lift));for(let rr=r0+1;rr<=r1;rr++)points.push(pos(rr,c1,lift));for(let cc=c1-1;cc>=c0;cc--)points.push(pos(r1,cc,lift));for(let rr=r1-1;rr>=r0;rr--)points.push(pos(rr,c0,lift));if(points.length>1){const line=new T.LineLoop(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xf5e7bc}));supportGroup.add(line);}
  }
 }
 function draw(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;const size=renderer.getSize(new T.Vector2());if(size.x!==w||size.y!==h)renderer.setSize(w,h);const s=span*Math.max(1,1.28*h/w);camera.left=-s*w/h/2;camera.right=s*w/h/2;camera.top=s/2;camera.bottom=-s/2;camera.updateProjectionMatrix();renderer.render(scene,camera);for(const [id,label]of Object.entries(markers)){const p=anchors[id]?.clone().project(camera);label.hidden=!p||p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1;if(p){label.style.left=`${(p.x*.5+.5)*w}px`;label.style.top=`${(-p.y*.5+.5)*h}px`;}}}
 function update(next,nextState){model=next;state=nextState;const key=model.ds.id+':'+state.surface;if(dsid!==key){dsid=key;buildChunk();}const pk=`${state.paint}:${state.node}`;if(pk!==oldPaintKey||oldModel!==model){paint();oldPaintKey=pk;oldModel=model;}wire.visible=state.mesh;mark();draw();}
 canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY,e.button];});canvas.addEventListener('pointerup',e=>{if(!down||down[2]!==0||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const box=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-box.left)/box.width*2-1,1-(e.clientY-box.top)/box.height*2),camera);const hit=ray.intersectObject(top)[0];if(!hit)return;const ds=model.ds,r=Math.round(hit.point.z/ds.res+(ds.H-1)/2),c=Math.round(hit.point.x/ds.res+(ds.W-1)/2);if(r>=3&&c>=3&&r<ds.H-3&&c<ds.W-3){canvas.focus({preventScroll:true});onPick(r,c);}});
 canvas.addEventListener('keydown',e=>{const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(!d)return;e.preventDefault();const ds=model.ds;onPick(Math.max(3,Math.min(ds.H-4,state.row+d[0])),Math.max(3,Math.min(ds.W-4,state.col+d[1])));});
 controls.addEventListener('change',draw);new ResizeObserver(draw).observe(host);
 function focus(){const target=pos(state.row,state.col),delta=target.clone().sub(controls.target);controls.target.copy(target);camera.position.add(delta);camera.zoom=1;span=Math.max(model.ds.res*16,extent*.04);controls.update();draw();}
 return {update,fit,top:topView,focus,draw};
}
