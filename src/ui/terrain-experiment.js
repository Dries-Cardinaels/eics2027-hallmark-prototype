// UI prototype question: does one 3D workspace, a hybrid view, or paired maps best
// support terrain inspection? All three share evaluation and selection; ?variant= selects a view.
import {spacing, summariseEvidence, inputEvidence, warmRamp} from './evidence.js';

const VARIANTS=['terrain','hybrid','maps'];
const NAMES={terrain:'3D terrain workspace',hybrid:'3D + evidence map',maps:'Paired 2D maps'};
let libraryPromise;
function loadThree(url) {
  if(!libraryPromise) libraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=url;
    script.onload=()=>resolve({THREE:window.THREE,OrbitControls:window.HallmarkOrbitControls});
    script.onerror=()=>{libraryPromise=null;reject(new Error('The local 3D library could not be loaded.'));};
    document.head.append(script);
  });
  return libraryPromise;
}

export function createTerrainExperiment(onSelect) {
  const $=id=>document.getElementById(id), root=$('terrain-workspace');
  const params=new URL(document.baseURI).searchParams;
  let model,viewer,loading=false,paint=['relief','values','evidence'].includes(params.get('paint'))?params.get('paint'):'relief',scale=params.get('z')==='3'?3:1,mesh=params.get('mesh')==='1';
  $('terrain-paint').value=paint;$('terrain-scale').value=String(scale);$('terrain-mesh').checked=mesh;
  let variant=params.get('variant') || 'terrain';
  if(!VARIANTS.includes(variant))variant='terrain';
  function setVariant(next) {
    variant=next;document.body.dataset.terrainVariant=variant;
    $('terrain-workspace').hidden=variant==='maps';
    $('variant-label').textContent=NAMES[variant];
    $('variant-state').textContent=`${VARIANTS.indexOf(variant)+1} / 3`;
    const url=new URL(document.baseURI);url.searchParams.set('variant',variant);url.searchParams.set('paint',paint);url.searchParams.set('z',String(scale));url.searchParams.set('mesh',mesh?'1':'0');url.hash=location.hash;
    history.replaceState(null,'',url.href);
    if(model)update(model);
  }
  function cycle(delta){setVariant(VARIANTS[(VARIANTS.indexOf(variant)+delta+3)%3]);}
  $('variant-previous').addEventListener('click',()=>cycle(-1));
  $('variant-next').addEventListener('click',()=>cycle(1));
  $('variant-switcher').addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();cycle(e.key==='ArrowLeft'?-1:1);}
  });
  $('terrain-paint').addEventListener('change',e=>{paint=e.target.value;setVariant(variant);});
  $('terrain-scale').addEventListener('change',e=>{scale=Number(e.target.value);setVariant(variant);});
  $('terrain-mesh').addEventListener('change',e=>{mesh=e.target.checked;setVariant(variant);});
  $('terrain-reset').addEventListener('click',()=>viewer?.reset());
  $('terrain-top').addEventListener('click',()=>viewer?.top());
  async function ensureViewer(){
    if(viewer||loading||variant==='maps')return;
    loading=true;$('terrain-status').textContent='Loading interactive terrain…';
    try {
      const lib=await loadThree(new URL(root.dataset.library,document.baseURI).href);
      viewer=createViewer(lib,$('terrain-canvas-host'),onSelect,text=>{$('terrain-status').textContent=text;});
      loading=false;update(model);
    }catch(error){loading=false;$('terrain-status').textContent=`${error.message} Use the view switcher below to open the 2D maps.`;}
  }
  function update(next) {
    if(!next)return;model=next;document.body.dataset.terrainPaint=paint;
    const {evaluation:ev,activeQuery:q}=model,ds=ev.dataset,metric=spacing(ds);
    $('terrain-caption').textContent=`${ds.W} × ${ds.H} delivered height posts · ${metric.x.toFixed(2)} × ${metric.y.toFixed(2)} m spacing · triangles join posts; no additional terrain samples.`;
    $('terrain-scale-badge').textContent=`Vertical scale ×${scale}${scale===1?' · true proportions':' · exaggerated relief'}`;
    $('terrain-extent').textContent=`${((ds.W-1)*metric.x).toFixed(0)} m E–W × ${((ds.H-1)*metric.y).toFixed(0)} m N–S between outer posts · elevation ${Math.min(...ds.heights.filter(Number.isFinite)).toFixed(1)}–${Math.max(...ds.heights.filter(Number.isFinite)).toFixed(1)} m`;
    $('terrain-paint-value').textContent=q.title;
    $('terrain-paint-evidence').textContent=model.evidenceLabel;
    $('terrain-legend').innerHTML=paint==='relief'?'<span class="item"><i class="relief-ramp"></i>Lower → higher delivered elevation · neutral shape shading</span>':paint==='evidence'?model.evidenceLegend:model.valueLegend;
    $('terrain-layer-label').textContent=paint==='relief'?'Delivered elevation':paint==='evidence'?`${model.evidenceLabel} · supporting ${q.title.toLowerCase()}`:`${model.valueTitle} · ${model.node==='heights'?'delivered':'calculated'} values`;
    if(variant==='maps')return;
    ensureViewer();viewer?.update(model,{paint,scale,mesh});
  }
  setVariant(variant);
  return {update};
}

function createViewer({THREE:T,OrbitControls},host,onSelect,status) {
  const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.outputColorSpace=T.SRGBColorSpace;
  host.prepend(renderer.domElement);
  const canvas=renderer.domElement;canvas.tabIndex=0;
  canvas.setAttribute('aria-label','Interactive terrain. Drag to orbit, scroll to zoom, click an interior location to inspect. Arrow keys move the selected location.');
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.01,100000);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=false;controls.minZoom=.25;controls.maxZoom=14;controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.015;
  const hemi=new T.HemisphereLight(0xffffff,0x66756d,2.3);scene.add(hemi);
  const light=new T.DirectionalLight(0xffffff,2.2);light.position.set(-2,4,1);scene.add(light);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();
  let model,opts,terrain,wire,terrainGroup,selectedGroup,pinGroup,dsKey,paintKey,oldEv,texture,geometry,extent=1,viewSpan=1,base=0,peak=0,valueRange=[0,1],metric,down;
  const material=new T.MeshStandardMaterial({roughness:1,metalness:0,side:T.DoubleSide,flatShading:true});
  const labels={};
  for(const [name,text] of [['selected','B'],['pin','A'],['north','N'],['east','E']]){
    const label=document.createElement('span');label.className=`terrain-marker ${name}`;label.textContent=text;label.hidden=true;host.append(label);labels[name]=label;
  }
  let anchors={};
  function point(r,c,lift=0){const ds=model.evaluation.dataset;return new T.Vector3((c-(ds.W-1)/2)*metric.x,(ds.heights[r*ds.W+c]-base)*opts.scale+lift,(r-(ds.H-1)/2)*metric.y);}
  function cleanup(group){if(!group)return;scene.remove(group);group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material && o.material!==material)o.material.dispose();});}
  function reset(){
    camera.up.set(0,1,0);camera.zoom=1;viewSpan=extent+(peak-base)*opts.scale*.45;
    controls.target.set(0,(peak-base)*opts.scale*.5,0);
    camera.position.copy(controls.target).add(new T.Vector3(.85,.8,1).normalize().multiplyScalar(extent*4));
    controls.update();draw();
  }
  function top(){camera.up.set(0,0,-1);camera.zoom=1;viewSpan=extent*1.12;camera.position.set(0,extent*5,extent*.001);controls.target.set(0,0,0);controls.update();draw();}
  function buildTerrain(){
    cleanup(terrainGroup);terrainGroup=new T.Group();scene.add(terrainGroup);
    const ds=model.evaluation.dataset,vertices=[],uv=[];
    const add=(r,c)=>{const p=point(r,c);vertices.push(p.x,p.y,p.z);uv.push((c+.5)/ds.W,1-(r+.5)/ds.H);};
    for(let r=0;r<ds.H-1;r++)for(let c=0;c<ds.W-1;c++){
      // Keep missing posts as genuine holes: never bridge them with invented heights.
      for(const tri of [[[r,c],[r+1,c],[r,c+1]],[[r,c+1],[r+1,c],[r+1,c+1]]])if(tri.every(([rr,cc])=>Number.isFinite(ds.heights[rr*ds.W+cc])))tri.forEach(([rr,cc])=>add(rr,cc));
    }
    geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    terrain=new T.Mesh(geometry,material);terrainGroup.add(terrain);
    wire=new T.LineSegments(new T.WireframeGeometry(geometry),new T.LineBasicMaterial({color:0x2d4f51,opacity:.19,transparent:true,depthWrite:false}));wire.position.y=extent*.0003;terrainGroup.add(wire);
    const floor=new T.Mesh(new T.PlaneGeometry((ds.W-1)*metric.x,(ds.H-1)*metric.y),new T.MeshBasicMaterial({color:0xdbe3df,transparent:true,opacity:.3,side:T.DoubleSide}));floor.rotation.x=-Math.PI/2;floor.position.y=-extent*.025;terrainGroup.add(floor);
    const grid=new T.GridHelper(extent*1.15,10,0xc1d1cb,0xd9e3df);grid.position.y=-extent*.026;terrainGroup.add(grid);
    const corner=new T.Vector3(-(ds.W-1)*metric.x*.57,-extent*.02,(ds.H-1)*metric.y*.55);
    terrainGroup.add(new T.ArrowHelper(new T.Vector3(0,0,-1),corner,extent*.15,0x42615c,extent*.025,extent*.012));
    terrainGroup.add(new T.ArrowHelper(new T.Vector3(1,0,0),corner,extent*.15,0x42615c,extent*.025,extent*.012));
    anchors.north=corner.clone().add(new T.Vector3(0,0,-extent*.18));anchors.east=corner.clone().add(new T.Vector3(extent*.18,0,0));
  }
  function colourFor(r,c){
    const {evaluation:ev,node,layer,activeQuery:q}=model,ds=ev.dataset,index=r*ds.W+c;
    if(!Number.isFinite(ds.heights[index]))return '#edf0ec';
    if(opts.paint==='relief'){
      const t=(ds.heights[index]-base)/(peak-base||1),a=[155,181,173],b=[236,228,205];return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`;
    }
    const valueNode=opts.paint==='evidence'?q.node:node,op=ev.pipeline.byId[valueNode];
    const source=op.grid==='heights';
    if(!source && (r<2||c<2||r>=ds.H-2||c>=ds.W-2))return '#dce3df';
    const k=source?index:(r-2)*(ds.W-4)+c-2,rec=ev.records[valueNode][k];
    if(opts.paint==='evidence'){
      if(source)return inputEvidence(ds,index,layer).colour;
      const e=summariseEvidence(ds,rec.sources,layer);
      if(e.type==='quality')return e.flagged?`rgb(${[238,229,245].map((v,i)=>Math.round(v+([99,53,139][i]-v)*e.flagged/e.total)).join(',')})`:'#e4eaeb';
      if(e.type==='continuous'){
        if(e.max===null)return '#eef1f2';
        // Missing coverage is also hatched in the texture, rather than silently dropped.
        const l=ds.mapLayers.find(l=>l.id===layer);return warmRamp((e.max-l.min)/(l.max-l.min||1));
      }
      if(e.type==='origin')return inputEvidence({ ...ds,origins:{[index]:rec.origin.headline}},index,layer).colour;
      const l=ds.mapLayers.find(l=>l.id===layer),donors=rec.sources.map(i=>ds.source[l.codesRef][i]).filter(code=>l.categories[code]);
      if(!donors.length)return l.base.colour;
      const counts=new Map();for(const code of donors)counts.set(code,(counts.get(code)||0)+1);
      return l.categories[[...counts].sort((a,b)=>b[1]-a[1])[0][0]].colour;
    }
    if(op.kind==='combination')return Object.values(rec.outcomes).some(x=>x==='exceeded')?'#a84678':rec.available?'#e9edf0':'#fff';
    if(op.kind==='criterion')return rec.outcome==='exceeded'?(valueNode.startsWith('slope')?'#4967be':'#a84678'):rec.available?'#e9edf0':'#fff';
    if(!rec.available)return '#fff';
    const [lo,hi]=valueRange,t=(rec.value-lo)/(hi-lo||1);
    return `rgb(${[244,244,246].map((v,i)=>Math.round(v+([44,52,64][i]-v)*t)).join(',')})`;
  }
  function colourTerrain(){
    const records=model.evaluation.records[model.node],vals=records.filter(x=>x.available&&Number.isFinite(x.value)).map(x=>x.value);valueRange=[Math.min(...vals),Math.max(...vals)];
    const ds=model.evaluation.dataset,tile=8,map=document.createElement('canvas');map.width=ds.W*tile;map.height=ds.H*tile;const ctx=map.getContext('2d');
    for(let r=0;r<ds.H;r++)for(let c=0;c<ds.W;c++){
      ctx.fillStyle=colourFor(r,c);ctx.fillRect(c*tile,r*tile,tile,tile);
      if(opts.paint==='evidence'&&model.layer==='height-error'&&model.activeQuery.node!=='heights'&&r>=2&&c>=2&&r<ds.H-2&&c<ds.W-2){
        const rec=model.evaluation.records[model.activeQuery.node][(r-2)*(ds.W-4)+c-2],e=summariseEvidence(ds,rec.sources,model.layer);
        if(e.missing&&e.present){ctx.strokeStyle='#213b45';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(c*tile,(r+1)*tile);ctx.lineTo((c+1)*tile,r*tile);ctx.stroke();}
      }
    }
    texture?.dispose();texture=new T.CanvasTexture(map);texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.NearestFilter;texture.minFilter=T.NearestFilter;texture.generateMipmaps=false;
    material.map=texture;
    // Evidence and result colours are unlit so view direction never alters their encoding.
    material.emissive.set(opts.paint==='relief'?0x000000:0xffffff);material.emissiveMap=opts.paint==='relief'?null:texture;material.emissiveIntensity=opts.paint==='relief'?0:1;
    material.color.set(opts.paint==='relief'?0xffffff:0x000000);material.needsUpdate=true;
  }
  function markSelection(){
    cleanup(selectedGroup);cleanup(pinGroup);selectedGroup=new T.Group();scene.add(selectedGroup);
    const ds=model.evaluation.dataset,r=model.cell.row+2,c=model.cell.col+2,lift=extent*.004;
    for(const cell of model.activeQuery.sourceCells){if(!Number.isFinite(cell.height))continue;const dot=new T.Mesh(new T.SphereGeometry(extent*.0035,8,6),new T.MeshBasicMaterial({color:0x198c96}));dot.position.copy(point(cell.row,cell.col,lift));selectedGroup.add(dot);}
    function marker(rr,cc,colour){
      const group=new T.Group(),p=point(rr,cc,lift);
      if(!Number.isFinite(p.y))return null;
      const ring=new T.Mesh(new T.TorusGeometry(extent*.012,extent*.0028,8,32),new T.MeshBasicMaterial({color:colour,depthTest:false}));ring.rotation.x=Math.PI/2;ring.position.copy(p);ring.renderOrder=4;group.add(ring);scene.add(group);return {group,p};
    }
    const b=marker(r,c,0x174e54);if(b){selectedGroup.add(...b.group.children);scene.remove(b.group);anchors.selected=b.p.clone().add(new T.Vector3(0,extent*.035,0));}else delete anchors.selected;
    if(model.pin?.dataset===ds.id){const a=marker(model.pin.cell.row+2,model.pin.cell.col+2,0xb96029);pinGroup=a?.group;anchors.pin=a?.p.clone().add(new T.Vector3(0,extent*.035,0));}else delete anchors.pin;
  }
  function draw(){
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    const size=renderer.getSize(new T.Vector2());if(size.x!==w||size.y!==h){renderer.setSize(w,h);}
    const span=viewSpan*Math.max(1,1.5*h/w);camera.left=-span*w/h/2;camera.right=span*w/h/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();
    renderer.render(scene,camera);
    for(const [name,label] of Object.entries(labels)){
      const p=anchors[name]?.clone().project(camera);label.hidden=!p||p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;
      if(p){label.style.left=`${(p.x*.5+.5)*w}px`;label.style.top=`${(-p.y*.5+.5)*h}px`;}
    }
  }
  function update(next,options){
    model=next;opts=options;const ds=model.evaluation.dataset,newKey=`${ds.id}:${opts.scale}`;
    if(dsKey!==newKey){dsKey=newKey;metric=spacing(ds);extent=Math.max((ds.W-1)*metric.x,(ds.H-1)*metric.y);base=Math.min(...ds.heights.filter(Number.isFinite));peak=Math.max(...ds.heights.filter(Number.isFinite));buildTerrain();paintKey='';reset();}
    const nextPaint=`${model.node}:${model.activeQuery.node}:${model.layer}:${opts.paint}`;
    if(paintKey!==nextPaint||oldEv!==model.evaluation){colourTerrain();paintKey=nextPaint;oldEv=model.evaluation;}
    wire.visible=opts.mesh;markSelection();draw();
    status(`Height cell ${model.cell.row+2}, ${model.cell.col+2} selected · ${model.activeQuery.sourceCells.length} supporting posts highlighted${opts.scale===1?'':` · relief exaggerated ×${opts.scale}`}`);
  }
  canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,button:e.button};});
  canvas.addEventListener('pointerup',e=>{
    if(!down||down.button!==0||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
    const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObject(terrain)[0];if(!hit)return;
    const ds=model.evaluation.dataset,c=Math.round(hit.point.x/metric.x+(ds.W-1)/2),r=Math.round(hit.point.z/metric.y+(ds.H-1)/2);
    if(r<2||c<2||r>=ds.H-2||c>=ds.W-2){status('The outer posts provide neighbourhood context. Select an interior location.');return;}
    canvas.focus({preventScroll:true});onSelect({row:r-2,col:c-2});
  });
  canvas.addEventListener('keydown',e=>{const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];if(!d)return;e.preventDefault();const ds=model.evaluation.dataset;onSelect({row:Math.max(0,Math.min(ds.H-5,model.cell.row+d[0])),col:Math.max(0,Math.min(ds.W-5,model.cell.col+d[1]))});});
  controls.addEventListener('change',draw);new ResizeObserver(draw).observe(host);
  return {update,reset,top};
}
