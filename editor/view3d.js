import {raisedRMSReviewMarkers,raisedRMSReviewText} from './rms-review-markers.js';
import {routeRMSText} from './route-rms.js';
import {rmsReviewMarkers,rmsReviewState,rmsReviewText} from './rms-review.js';
import {nativeSampleCounts} from '../src/core/sample-counts.js';
import {annotationHeight,terrainDisplayMesh,displayGroundRGB} from './missing-cell-display.js';
import {matchesEnabled} from './planning-priority.js';
import {placeAnnotation,projectedSpriteRect} from './annotation-layout.js';
import {palette,mixColour} from './palette.js';
import {groundScale} from './ground-scale.js';
import * as THREE from 'three';
import {OrbitControls} from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import {LineSegments2} from '../node_modules/three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from '../node_modules/three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from '../node_modules/three/examples/jsm/lines/LineMaterial.js';
import {cellAt, cellCenter,nativeCellFootprint,NATIVE_CELL_HALF} from './spatial.js';
import {paintSurfaceMap,sampleSurfaceMap} from './surface-map.js';
import {flaggedResults,flaggedBoundary,categoricalBoundaries,evidenceVisibility,flaggedHeights,tracePresentation,lidarGapCells} from './evidence-geometry.js';
import {qualityLabel,lolaReturnState} from '../src/core/index.js';
import {pathEvidenceScope,pathFlaggedCells,pathAssessmentScope,pathDisplayRecord,pathDisplayColour,pathDisplayBorder,pathAssessmentOutcome,routeFillOpacity} from './path-evidence.js';
import {lidarGapText} from './lidar-gaps.js';
import {qualityVisibility} from './quality-visibility.js';
import {NUMERIC_EVIDENCE,isNumericEvidence,evidenceNumber} from './source-evidence.js';

// Three.js can reject both adjacent triangles when an oblique ray hits their
// shared vertex exactly. Retry a micrometre to one side in scene coordinates.
export function pickTerrainSurface(raycaster,surface) {
  const hit=raycaster.intersectObject(surface)[0];
  if(hit)return hit;
  const origin=raycaster.ray.origin, x=origin.x;
  origin.x=x+1e-6;
  try{return raycaster.intersectObject(surface)[0];}
  finally{origin.x=x;}
}

export function createTerrainView(host, {onPick, onMove, onPathPick, onSourcePick}) {
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Terrain');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10000);
  const controls = new OrbitControls(camera, canvas);
  controls.maxPolarAngle = Math.PI * .47;
  controls.minPolarAngle = 0;
  controls.minZoom = .3;
  controls.maxZoom = 16;
  scene.add(new THREE.HemisphereLight(0xe9f3ff, 0x6b7564, 2.1));
  const light = new THREE.DirectionalLight(0xfff2dd, 3.8);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -.0001;
  scene.add(light, light.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.ShadowMaterial({opacity: .14}));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const raycaster = new THREE.Raycaster();
  const scale=document.createElement('div');scale.className='ground-scale';scale.hidden=true;scale.innerHTML='<span></span><i></i>';scale.setAttribute('aria-label','3D view ground-distance scale');host.append(scale);
  const hoverLabel=document.createElement('span');hoverLabel.className='hover-readout';hoverLabel.hidden=true;host.append(hoverLabel);
  const endpointLabels=Object.fromEntries(['start','goal'].map(role=>{const element=document.createElement('span');element.className=`plan-marker plan-marker-${role}`;element.hidden=true;host.append(element);return [role,element];}));
  let hoverMark,hoverCell,hoverFrame,hoverAnchor;
  let snapshot, dataset, grid, terrain, surface, texture, highlights;
  let routeMarks,routeLine,routeCells=[],currentPath;
  let presentation,selectedAssessment,rmsRaisedMarks;
  let rmsRaisedCells=new Map();
  let previousRouteMarks,currentPreviousPath;
  let planMarks,currentPlan,endpointPicking=false;
  let currentMap, paintedMap, dataTexture, terrainPixels, flagMarks, heightFlagMarks, categoryMarks, reviewMarks, routeReviewContext, inspecting=false;
  const sourceMarks=new Map();
  let minimum = 0, maximum = 1, depth = 20, extent = 1, span = 1, pointerStart;
  let origin = {east: 0, north: 0};

  function remove(group) {
    if (!group) return;
    scene.remove(group);
    group.traverse(object => {
      object.geometry?.dispose();
      object.material?.map?.dispose();
      object.material?.dispose();
    });
  }

  function position(point, height) {
    return new THREE.Vector3(point.east - origin.east, Number.isFinite(height) ? height - minimum + depth : depth * .5, origin.north - point.north);
  }

  function at(row, col) {
    return position(cellCenter(grid, {row, col}), annotationHeight(dataset,row,col));
  }

  function build() {
    remove(terrain);
    texture?.dispose();
    dataTexture?.dispose(); dataTexture = null; paintedMap = null;
    terrain = new THREE.Group();
    scene.add(terrain);
    minimum = Infinity; maximum = -Infinity;
    for (const height of dataset.heights) if (Number.isFinite(height)) {
      minimum = Math.min(minimum, height); maximum = Math.max(maximum, height);
    }
    if (!Number.isFinite(minimum)) {minimum = 0; maximum = 1;}
    host.closest('.viewport').dataset.case = dataset.caseId;
    depth = dataset.caseId === 'moon' ? 16 : 18;
    extent = Math.max(grid.W, grid.H) * grid.res;
    origin = {east: grid.east + grid.W * grid.res / 2, north: grid.north - grid.H * grid.res / 2};
    const mesh = terrainDisplayMesh(dataset);
    const positions = new Float32Array(mesh.W * mesh.H * 3);
    const uv = new Float32Array(mesh.W * mesh.H * 2);
    for (let row = 0; row < mesh.H; row++) for (let col = 0; col < mesh.W; col++) {
      const index = row * mesh.W + col, rr = mesh.rows[row], cc = mesh.cols[col];
      const point = position(cellCenter(grid,{row:rr,col:cc}),mesh.heights[index]);
      positions.set([point.x, point.y, point.z], index * 3);
      uv.set([(cc + .5) / grid.W, 1 - (rr + .5) / grid.H], index * 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(mesh.indices);
    geometry.computeVertexNormals();
    const image = document.createElement('canvas');
    image.width = grid.W; image.height = grid.H;
    const context = image.getContext('2d'), pixels = context.createImageData(grid.W, grid.H);
    const colour = new THREE.Color(), earth = dataset.caseId !== 'moon';
    const low = new THREE.Color(earth ? '#65715b' : '#777e89');
    const high = new THREE.Color(earth ? '#b1ae8b' : '#b5b8bd');
    const displayRGB=displayGroundRGB(dataset);
    for (let index = 0; index < dataset.heights.length; index++) {
      if (dataset.groundRGB) {
        const rgb=displayRGB.subarray(3*index,3*index+3);
        pixels.data.set(rgb,4*index);
        pixels.data[4*index+3]=255;
        continue;
      }
      const t = (dataset.heights[index] - minimum) / (maximum - minimum || 1);
      const random = Math.sin(index * 127.1) * 43758.5453;
      colour.copy(low).lerp(high, Number.isFinite(t) ? t * .4 : 0);
      colour.multiplyScalar(.87 + (random - Math.floor(random)) * .22).convertLinearToSRGB();
      pixels.data.set([colour.r * 255, colour.g * 255, colour.b * 255, 255], index * 4);
    }
    context.putImageData(pixels, 0, 0);
    terrainPixels = pixels.data;
    texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({map: texture, roughness: 1}));
    surface.castShadow = surface.receiveShadow = true;
    terrain.add(surface);
    canvas.dataset.missingGroundIndices=nativeSampleCounts(dataset)?Array.from(dataset.heights,(height,index)=>Number.isFinite(height)?null:index).filter(index=>index!==null).join(','):'';
    canvas.dataset.surfaceTriangleCount=String(mesh.indices.length/3);
    const walls = [];
    for (let i = 0; i < mesh.perimeter.length; i++) {
      const aIndex=mesh.perimeter[i],bIndex=mesh.perimeter[(i+1)%mesh.perimeter.length];
      if (![mesh.heights[aIndex],mesh.heights[bIndex]].every(Number.isFinite)) continue;
      const a = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,aIndex), b = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,bIndex), aa = a.clone().setY(0), bb = b.clone().setY(0);
      for (const p of [a, b, aa, b, bb, aa]) walls.push(p.x, p.y, p.z);
    }
    canvas.dataset.surfaceWallCount=String(walls.length/18);
    const side = new THREE.BufferGeometry();
    side.setAttribute('position', new THREE.Float32BufferAttribute(walls, 3));
    side.computeVertexNormals();
    const sides = new THREE.Mesh(side, new THREE.MeshStandardMaterial({color: earth ? '#6b6450' : '#676b64', roughness: 1, side: THREE.DoubleSide}));
    sides.castShadow = sides.receiveShadow = true;
    terrain.add(sides);
    const base = new THREE.Mesh(new THREE.BoxGeometry((mesh.cols.at(-1)-mesh.cols[0]) * grid.res, extent * .012, (mesh.rows.at(-1)-mesh.rows[0]) * grid.res), new THREE.MeshStandardMaterial({color: '#444d42', roughness: 1}));
    base.position.y = -extent * .006;
    base.castShadow = base.receiveShadow = true;
    terrain.add(base);
    floor.position.y = -extent * .013;
    light.position.set(-extent, extent * 1.6, extent * .65);
    light.target.position.set(0, depth, 0);
    const shadow = light.shadow.camera;
    shadow.left = shadow.bottom = -extent;
    shadow.right = shadow.top = extent;
    shadow.near = 1; shadow.far = extent * 5;
    shadow.updateProjectionMatrix();
    light.shadow.normalBias = grid.res * .17;
    fit();
  }


  function colourSurface(map) {
    if(paintedMap?.paletteId === map.paletteId && paintedMap?.field === map.field && paintedMap.layer === map.layer && paintedMap.flags === map.flags && paintedMap.heightFlags===map.heightFlags && paintedMap.mode===map.mode&&paintedMap.showLidarGaps===map.showLidarGaps&&paintedMap.gapEvidence===map.gapEvidence&&paintedMap.rmsReview===map.rmsReview&&paintedMap.rmsReviewSources===map.rmsReviewSources)return;
    dataTexture?.dispose(); dataTexture = null;
    let imageTexture = texture;
    if(map.layer !== 'terrain' || map.flags || nativeSampleCounts(dataset)) {
      const {width,height,pixels} = paintSurfaceMap({...map,flags:false},terrainPixels);
      const image = document.createElement('canvas'); image.width=width;image.height=height;
      image.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
      dataTexture = new THREE.CanvasTexture(image);
      dataTexture.colorSpace = THREE.SRGBColorSpace;
      dataTexture.magFilter = THREE.NearestFilter;
      dataTexture.minFilter = nativeSampleCounts(dataset) ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
      dataTexture.generateMipmaps = Boolean(nativeSampleCounts(dataset));
      imageTexture = dataTexture;
    }
    surface.material.dispose();
    surface.material = map.layer === 'terrain' || map.limits
      ? new THREE.MeshStandardMaterial({map:imageTexture,roughness:1})
      : new THREE.MeshBasicMaterial({map:imageTexture,toneMapped:false});
    surface.receiveShadow = map.layer === 'terrain' || map.limits;
    buildFlags(map);
    buildHeightFlags(map);
    buildRMSReview(map);
    buildCategories(map);
    paintedMap = map;
    canvas.dataset.mapLayer = map.layer;
    canvas.dataset.lidarGapsOverlay=String(map.showLidarGaps);
    canvas.dataset.lidarGapIndices=lidarGapCells(map).map(c=>c.index).join(',');
  }

  function line(points,colour,order=5) {
    const shape=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:colour,depthTest:true,transparent:true,opacity:.95,toneMapped:false}));
    shape.renderOrder=order;
    return shape;
  }

  function surfacePoints(segments,offset=.065){
    const points=[];
    for(const [ar,ac,br,bc] of segments)for(let i=0;i<4;i++){
      const pair=[i/4,(i+1)/4].map(t=>{const row=ar+(br-ar)*t,col=ac+(bc-ac)*t,height=annotationHeight(dataset,row,col);if(!Number.isFinite(height))return null;const p=position(cellCenter(grid,{row,col}),height);p.y+=grid.res*offset;return p;});
      if(pair.every(Boolean))points.push(...pair);
    }
    return points;
  }

  function surfaceEdges(segments,colour,opacity=.95,offset=.065){
    const edges=line(surfacePoints(segments,offset),colour,4);edges.material.depthWrite=false;edges.material.opacity=opacity;return edges;
  }

  // Textures of the figure palette, drawn on the cell surface so evidence never relies on color alone.
  function evidenceTexture(cell,kind){
    const segments=[],seg=(u1,v1,u2,v2)=>segments.push([cell.row+u1,cell.col+v1,cell.row+u2,cell.col+v2]);
    if(kind==='lines')for(const k of [-.66,-.33,0,.33,.66])seg(Math.max(-.46,-.46+k),Math.max(-.46,-.46+k)-k,Math.min(.46,.46+k),Math.min(.46,.46+k)-k);
    else if(kind==='xs'){const d=.075;for(const u of [-.28,0,.28])for(const v of [-.28,0,.28]){seg(u-d,v-d,u+d,v+d);seg(u-d,v+d,u+d,v-d);}}
    else if(kind==='dots'){const d=.025;for(const u of [-.3,-.1,.1,.3])for(const v of [-.3,-.1,.1,.3])seg(u-d,v,u+d,v);}
    if(!segments.length)return new THREE.Group();
    const colour=kind==='lines'?palette.evReturnHatch:kind==='xs'?palette.evNoneHatch:palette.evStipple;
    const texture=surfaceEdges(segments,colour,1,.095);texture.renderOrder=6.5;return texture;
  }

  function cellHatch(cell,colour){
    const segments=[[-.5,-.25,.25,.5],[-.5,-.5,.5,.5],[-.25,-.5,.5,.25]].map(([ar,ac,br,bc])=>[cell.row+ar,cell.col+ac,cell.row+br,cell.col+bc]);
    const hatch=surfaceEdges(segments,colour,.9,.095);hatch.renderOrder=6.5;return hatch;
  }

  function screenStroke(points,parts){
    const group=new THREE.Group(),positions=points.flatMap(p=>[p.x,p.y,p.z]);
    if(!positions.length)return group;
    for(const [colour,width,order] of parts){
      const geometry=new LineSegmentsGeometry().setPositions(positions);
      const material=new LineMaterial({color:colour,linewidth:width,worldUnits:false,transparent:true,opacity:1,depthTest:true,depthWrite:false,toneMapped:false,alphaToCoverage:true});
      material.resolution.set(host.clientWidth,host.clientHeight);
      const contour=new LineSegments2(geometry,material);contour.renderOrder=order;group.add(contour);
    }
    return group;
  }

  function affectedContour(segments){
    return screenStroke(surfacePoints(segments,.085),[[palette.suspiciousHalo,4,4.5],[palette.suspiciousBorder,2,4.6]]);
  }

  function buildCategories(map){
    remove(categoryMarks);categoryMarks=new THREE.Group();scene.add(categoryMarks);
    const segments=categoricalBoundaries(map);
    // Native one-pixel edges retain stable screen width through zoom/resize.
    if(segments.length)categoryMarks.add(surfaceEdges(segments,'#344653'));
    canvas.dataset.categoryBoundaryCount=String(segments.length);
  }

  function regionFill(markers,opacity){
    const positions=[],indices=[];
    for(const marker of markers){
      const offset=positions.length/3,valid=[];
      for(let r=0;r<3;r++)for(let c=0;c<3;c++){
        const row=marker.row+(r-1)*.5,col=marker.col+(c-1)*.5,height=annotationHeight(dataset,row,col);
        valid.push(Number.isFinite(height));const p=position(cellCenter(grid,{row,col}),height);p.y+=grid.res*.035;positions.push(p.x,p.y,p.z);
      }
      for(let r=0;r<2;r++)for(let c=0;c<2;c++){const i=r*3+c;for(const tri of [[i,i+3,i+1],[i+1,i+3,i+4]])if(tri.every(i=>valid[i]))indices.push(...tri.map(i=>offset+i));}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
    const fill=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:palette.suspicious,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));fill.renderOrder=3;return fill;
  }

  function buildFlags(map) {
    remove(flagMarks); flagMarks=new THREE.Group(); scene.add(flagMarks);
    const markers=flaggedResults(map),edges=flaggedBoundary(markers,grid.W),segments=[];
    const sides={north:[[-.5,-.5],[.5,-.5]],east:[[.5,-.5],[.5,.5]],south:[[.5,.5],[-.5,.5]],west:[[-.5,.5],[-.5,-.5]]};
    flagMarks.add(regionFill(markers,.18));
    for(const edge of edges){
      const [a,b]=sides[edge.side];segments.push([edge.row+a[1],edge.col+a[0],edge.row+b[1],edge.col+b[0]]);
    }
    flagMarks.add(affectedContour(segments));
    canvas.dataset.flagIndices=markers.map(c=>c.index).join(',');
  }

  function buildHeightFlags(map){
    remove(heightFlagMarks);heightFlagMarks=new THREE.Group();scene.add(heightFlagMarks);
    const markers=flaggedHeights(map),segments=[];
    heightFlagMarks.add(regionFill(markers,.20));
    for(const c of markers)for(const [ar,ac,br,bc] of [[-.5,-.25,.25,.5],[-.5,-.5,.5,.5],[-.25,-.5,.5,.25]])segments.push([c.row+ar,c.col+ac,c.row+br,c.col+bc]);
    heightFlagMarks.add(surfaceEdges(segments,palette.suspiciousBorder,.7));
    const boundary=flaggedBoundary(markers,grid.W).map(e=>{
      const side={north:[-.5,-.5,-.5,.5],east:[-.5,.5,.5,.5],south:[.5,.5,.5,-.5],west:[.5,-.5,-.5,-.5]}[e.side];
      return [e.row+side[0],e.col+side[1],e.row+side[2],e.col+side[3]];
    });
    heightFlagMarks.add(surfaceEdges(boundary,palette.suspiciousBorder,1));

    canvas.dataset.rawFlagIndices=markers.map(c=>c.index).join(',');
  }

  function reviewBoundary(markers,offset=.12){
    const segments=flaggedBoundary(markers,grid.W).map(e=>{
      const side={north:[-.5,-.5,-.5,.5],east:[-.5,.5,.5,.5],south:[.5,.5,.5,-.5],west:[.5,-.5,-.5,-.5]}[e.side];
      return [e.row+side[0],e.col+side[1],e.row+side[2],e.col+side[3]];
    });
    return screenStroke(surfacePoints(segments,offset),[[palette.suspiciousHalo,4,6.1],[palette.suspiciousBorder,2,6.2]]);
  }

  function buildRMSReview(map){
    remove(reviewMarks);reviewMarks=new THREE.Group();scene.add(reviewMarks);
    const sources=rmsReviewMarkers(map,true),affected=rmsReviewMarkers(map),segments=[];
    reviewMarks.add(regionFill(affected,.16),regionFill(sources,.20));
    for(const cell of sources)for(const [ar,ac,br,bc] of [[-.5,-.25,.25,.5],[-.5,-.5,.5,.5],[-.25,-.5,.5,.25]])segments.push([cell.row+ar,cell.col+ac,cell.row+br,cell.col+bc]);
    const hatches=surfaceEdges(segments,palette.suspiciousBorder,.85,.12);hatches.renderOrder=6;reviewMarks.add(hatches,reviewBoundary(sources,.12),reviewBoundary(affected,.13));
    canvas.dataset.rmsReviewThreshold=(map.rmsReview||map.rmsReviewSources)?String((map.rmsReview||map.rmsReviewSources).threshold):'';
    canvas.dataset.rmsReviewSourceIndices=sources.map(c=>c.index).join(',');
    canvas.dataset.rmsReviewAffectedIndices=affected.map(c=>c.index).join(',');
  }

  function reviewCellMark(cell,source=false){
    const group=new THREE.Group(),fill=patch(cell.row,cell.col,palette.suspicious,.24,.13);fill.renderOrder=6;
    const indexed={...cell,index:cell.row*grid.W+cell.col};group.add(fill,reviewBoundary([indexed],.145));
    if(source)group.add(cellHatch(cell,palette.suspiciousBorder));
    return group;
  }

  function patch(row,col,colour,opacity,offset=.025) {
    const points=[],indices=[],valid=[];
    for(let r=0;r<3;r++)for(let c=0;c<3;c++){
      const rr=row+(r-1)*NATIVE_CELL_HALF,cc=col+(c-1)*NATIVE_CELL_HALF;
      const height=annotationHeight(dataset,rr,cc);valid.push(Number.isFinite(height));
      const p=position(cellCenter(grid,{row:rr,col:cc}),height);p.y+=grid.res*offset;points.push(p.x,p.y,p.z);
    }
    for(let r=0;r<2;r++)for(let c=0;c<2;c++){const i=r*3+c;for(const triangle of [[i,i+3,i+1],[i+1,i+3,i+4]])if(triangle.every(i=>valid[i]))indices.push(...triangle);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:colour,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));mesh.renderOrder=4;return mesh;
  }

  function lidarGapMark(cell) {
    const group = new THREE.Group();
    // Opaque route/result patches can cover the map texture. Repeat its small
    // missing-height dot on those patches, sampled from the very same surface.
    for (const [radius,colour,offset] of [[.21,'#ffffff',.125],[.15,'#263443',.13]]) {
      const points=[],indices=[],segments=16;
      for(let i=0;i<=segments;i++) {
        const angle=(i-1)/segments*Math.PI*2,row=cell.row+(i?Math.sin(angle)*radius:0),col=cell.col+(i?Math.cos(angle)*radius:0);
        const height=annotationHeight(dataset,row,col),p=position(cellCenter(grid,{row,col}),height);p.y+=grid.res*offset;points.push(p.x,p.y,p.z);
      }
      for(let i=0;i<segments;i++)indices.push(0,(i+1)%segments+1,i+1);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(indices);
      const mark=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:colour,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));mark.renderOrder=8;group.add(mark);
    }
    return group;
  }

  // Narrow surface-conforming mesh bands retain actual width in WebGL.
  function cellBorder(row,col,colour,band=.045,offset=.05){
    const corners=nativeCellFootprint({row,col});
    return borderBands(corners.map((a,i)=>{const b=corners[(i+1)%4];return [a.row,a.col,b.row,b.col];}),colour,band,offset);
  }

  function borderBands(segments,colour,band,offset=.05){
    const points=[],indices=[];
    for(const [ar,ac,br,bc] of segments){
      const dr=br-ar,dc=bc-ac,len=Math.hypot(dr,dc),nr=-dc/len*band/2,nc=dr/len*band/2;
      for(let i=0;i<8;i++){
        const vertexOffset=points.length/3,valid=[];
        for(const [t,side] of [[i/8,-1],[(i+1)/8,-1],[i/8,1],[(i+1)/8,1]]){
          const r=ar+dr*t+nr*side,c=ac+dc*t+nc*side,height=annotationHeight(dataset,r,c);
          valid.push(Number.isFinite(height));const p=position(cellCenter(grid,{row:r,col:c}),height);p.y+=grid.res*offset;points.push(p.x,p.y,p.z);
        }
        for(const triangle of [[0,1,2],[1,3,2]])if(triangle.every(i=>valid[i]))indices.push(...triangle.map(i=>vertexOffset+i));
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:colour,side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false,toneMapped:false}));mesh.renderOrder=6;return mesh;
  }

  function sourceFlag(source,rmsReview=null) {
    const group=new THREE.Group(),base=position(source,source.height),tip=base.clone();tip.y+=grid.res*1.1;
    group.add(line([base,tip],palette.suspiciousBorder,8));
    const image=document.createElement('canvas');image.width=image.height=64;
    const ctx=image.getContext('2d');ctx.beginPath();ctx.moveTo(32,3);ctx.lineTo(61,32);ctx.lineTo(32,61);ctx.lineTo(3,32);ctx.closePath();
    ctx.fillStyle=palette.suspicious;ctx.fill();ctx.lineWidth=6;ctx.strokeStyle=palette.suspiciousBorder;ctx.stroke();
    ctx.fillStyle=palette.suspiciousBorder;ctx.font='bold 43px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',32,35);
    const texture=new THREE.CanvasTexture(image);texture.colorSpace=THREE.SRGBColorSpace;
    const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,toneMapped:false}));
    if(rmsReview)marker.userData.rmsReview=rmsReview;else marker.userData.qualityFlag=true;marker.position.copy(tip);marker.scale.setScalar(grid.res*.65);marker.renderOrder=10;group.add(marker);
    return group;
  }

  const isPathCell=cell=>!inspecting&&currentPath?.cells.some(c=>c.row===cell.row&&c.col===cell.col);

  function markPath(path){
    remove(routeMarks);remove(routeLine);routeMarks=new THREE.Group();scene.add(routeMarks);routeCells=[];currentPath=path;
    canvas.dataset.pathCells='';
    canvas.dataset.pathLidarGapIndices='';
    canvas.dataset.pathRMSReviewIndices='';canvas.dataset.pathRMSUnknownIndices='';
    const scope=pathEvidenceScope(currentMap.layer),priorityPath=path?.configuration.active;
    const flagged=new Set((priorityPath?path.cells.filter(c=>c.priority.match===true):pathFlaggedCells(path,scope)).map(cell=>cell.index));
    const showRouteFlags=priorityPath?!inspecting&&matchesEnabled(path.configuration.matchSettings,path.configuration.branch):presentation.routeFlags;
    canvas.dataset.pathFlagScope=priorityPath?'planning:'+path.configuration.branch:scope;canvas.dataset.pathFlagIndices=showRouteFlags?[...flagged].join(','):'';
    canvas.dataset.routePresentation=inspecting?'context':'assessment';
    canvas.dataset.routeContextCells=presentation.routeCells.map(cell=>cell.row+','+cell.col).join(';');
    const assessmentScope=pathAssessmentScope(currentMap.layer);
    canvas.dataset.pathColourScope=assessmentScope||currentMap.layer+' values';canvas.dataset.pathRenderMode=assessmentScope===null?'values':'limits';
    canvas.dataset.pathStates=assessmentScope===null?'':path?.cells.map(cell=>pathDisplayRecord(cell,currentMap.layer).state).join(',')||'';
    if(!path)return;
    // Crossed native cells, not a rover footprint or swept vehicle width.
    for(const cell of presentation.routeCells){
      const record=pathDisplayRecord(cell,currentMap.layer),colour=pathDisplayColour(record,currentMap.layer,currentMap.field.range);
      // Only a small drawing offset separates this opaque surface patch from map hatching.
      const opacity=routeFillOpacity(currentMap.layer,inspecting);
      const fill=patch(cell.row,cell.col,colour,opacity,inspecting?.03:.075);fill.material.transparent=opacity<1;fill.material.depthWrite=opacity===1;fill.userData.pathIndex=cell.index;
      const border=cellBorder(cell.row,cell.col,inspecting?palette.routeContext:pathDisplayBorder(record,currentMap.layer),inspecting?.045:.05,inspecting?.045:.09);border.renderOrder=4;border.material.opacity=.95;
      routeMarks.add(fill,border);routeCells.push(fill);
      // Opaque route patches need their own marks; the terrain texture is underneath.
      if(currentMap.layer==='height-rms'&&(record?.known<record?.total||!record?.total))routeMarks.add(cellHatch(cell,palette.unavailableBorder));
      if(!inspecting&&assessmentScope!==null&&(record?.state===1||record?.state===2||record?.incomplete)){
        const missing=record?.state===2||record?.incomplete;
        const segments=(missing?[[-.45,-.45,.45,.45],[-.45,.45,.45,-.45]]:[[-.23,-.45,-.23,.45],[.23,-.45,.23,.45]])
          .map(([ar,ac,br,bc])=>[cell.row+ar,cell.col+ac,cell.row+br,cell.col+bc]);
        const marks=surfaceEdges(segments,missing?palette.unavailableBorder:mixColour(palette.exceeded,palette.exceededBorder,.26),.75,.105);marks.renderOrder=5;routeMarks.add(marks);
      }

      if(showRouteFlags&&flagged.has(cell.index)){
        const source={...cell,...cellCenter(grid,cell),height:dataset.heights[cell.row*grid.W+cell.col]};
        if(Number.isFinite(source.height))routeMarks.add(sourceFlag(source));
      }
      if(currentMap.showLidarGaps&&sampleSurfaceMap(currentMap,cell).missingHeights>0)routeMarks.add(lidarGapMark(cell));
      const routeReview=routeReviewContext?.summary(cell);
      if(routeReview?.triggered>0)routeMarks.add(reviewCellMark(cell,routeReview.ownTriggered));
    }
    // Keep the route legible in Trace without painting over source footprints.
    routeLine=inspecting?screenStroke(pathPoints(path,.045),[[palette.suspiciousHalo,4.5,5.1],[palette.routeContext,2.5,5.2]]):line(pathPoints(path,.095),'#ffffff',7);
    if(!inspecting)routeLine.material.depthWrite=false;
    scene.add(routeLine);
    canvas.dataset.cellFootprintMetres=String(grid.res);
    canvas.dataset.pathCells=path.cells.map(c=>c.row+','+c.col).join(';');
    canvas.dataset.pathLidarGapIndices=currentMap.showLidarGaps?presentation.routeCells.filter(cell=>sampleSurfaceMap(currentMap,cell).missingHeights>0).map(cell=>cell.index).join(','):'';
    canvas.dataset.pathRMSReviewIndices=routeReviewContext?path.cells.filter(cell=>routeReviewContext.summary(cell).triggered>0).map(cell=>cell.index).join(','):'';
    canvas.dataset.pathRMSUnknownIndices=routeReviewContext?path.cells.filter(cell=>routeReviewContext.summary(cell).unknown>0).map(cell=>cell.index).join(','):'';
  }

  function pathPoints(path,offset=.09){
    const points=[];
    for(let i=0;i<path.vertices.length-1;i++){
      const a=path.vertices[i],b=path.vertices[i+1],steps=Math.ceil(Math.hypot(b.row-a.row,b.col-a.col)*4);
      for(let j=0;j<steps;j++){
        const pair=[j/steps,(j+1)/steps].map(t=>{const row=a.row+(b.row-a.row)*t,col=a.col+(b.col-a.col)*t,h=annotationHeight(dataset,row,col);if(!Number.isFinite(h))return null;const p=position(cellCenter(grid,{row,col}),h);p.y+=grid.res*offset;return p;});
        if(pair.every(Boolean))points.push(...pair);
      }
    }
    return points;
  }

  function markPreviousPath(path,unchanged,coincident){
    currentPreviousPath=path;remove(previousRouteMarks);previousRouteMarks=new THREE.Group();scene.add(previousRouteMarks);
    canvas.dataset.previousRouteCells=path?.cells.map(c=>c.row+','+c.col).join(';')||'';
    canvas.dataset.routeUnchanged=String(Boolean(unchanged));
    if(!path||coincident)return;
    const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pathPoints(path,.07)),new THREE.LineDashedMaterial({color:palette.previousRoute,dashSize:grid.res*.8,gapSize:grid.res*.5,transparent:true,opacity:.85,depthTest:true,depthWrite:false,toneMapped:false}));
    line.computeLineDistances();line.renderOrder=4;previousRouteMarks.add(line);
    const proposed=new Set(currentPath?.cells.map(c=>c.row*grid.W+c.col)||[]);
    // Context only: no historical route cell enters picking or supplies flag sprites.
    if(!inspecting){
      const unique=path.cells.filter(cell=>!proposed.has(cell.row*grid.W+cell.col)).map(cell=>({...cell,index:cell.row*grid.W+cell.col}));
      for(const cell of unique)previousRouteMarks.add(patch(cell.row,cell.col,palette.previousRouteFill,.14));
      const segments=flaggedBoundary(unique,grid.W).map(edge=>{
        const side={north:[-.5,-.5,-.5,.5],east:[-.5,.5,.5,.5],south:[.5,.5,.5,-.5],west:[.5,-.5,-.5,-.5]}[edge.side];
        return [edge.row+side[0],edge.col+side[1],edge.row+side[2],edge.col+side[3]];
      });
      const boundary=surfaceEdges(segments,palette.previousRoute,.8);boundary.material.dispose();
      boundary.material=new THREE.LineDashedMaterial({color:palette.previousRoute,dashSize:grid.res*.28,gapSize:grid.res*.18,transparent:true,opacity:.8,depthTest:true,depthWrite:false,toneMapped:false});
      boundary.computeLineDistances();previousRouteMarks.add(boundary);
    }
  }

  function markPlan(plan){
    currentPlan=plan;remove(planMarks);planMarks=new THREE.Group();scene.add(planMarks);
    for(const cell of plan?.exclusions||[]){
      const excluded=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(footprint(cell.row,cell.col)),new THREE.LineDashedMaterial({color:palette.exceededBorder,dashSize:grid.res*.18,gapSize:grid.res*.12,depthTest:true,depthWrite:false,toneMapped:false}));
      excluded.computeLineDistances();excluded.renderOrder=6;planMarks.add(excluded,patch(cell.row,cell.col,palette.exceeded,.18));
    }
    canvas.dataset.planStatus=plan?.status||'';canvas.dataset.planRevision=String(plan?.revision??'');
    canvas.dataset.planExclusions=(plan?.exclusions||[]).map(c=>c.row+','+c.col).join(';');
    canvas.dataset.endpointPicking=String(endpointPicking);
  }

  // Conform each footprint to the existing mesh, including its triangle diagonal.
  function footprint(row,col,offset=.035) {
    const points=[];
    const vertices=nativeCellFootprint({row:0,col:0}).map(c=>[c.col,c.row]);
    for(let edge=0;edge<4;edge++)for(let i=0;i<4;i++){
      for(const t of [i/4,(i+1)/4]){
        const a=vertices[edge],b=vertices[(edge+1)%4],r=row+a[1]+(b[1]-a[1])*t,c=col+a[0]+(b[0]-a[0])*t;
        const height=annotationHeight(dataset,r,c);
        const point=position(cellCenter(grid,{row:r,col:c}),height);
        point.y+=grid.res*offset;points.push(point);
      }
    }
    return points;
  }

  function mark() {
    clearHover();
    sourceMarks.clear(); remove(highlights); highlights=new THREE.Group();scene.add(highlights);
    const rendered=[],raised=[],visibility=evidenceVisibility(currentMap,inspecting);
    canvas.dataset.previewSource='';
    if(visibility.sources)for(const source of snapshot.sources){
      const missing=source.height===null;
      const flagged=qualityVisibility(currentMap.qualityVisibility).heights&&source.quality&&(dataset.quality.flaggedCodes||[3]).includes(source.quality.code);
      // Figure palette (palette.js evidenceRoles): LOLA return = blue + diagonal lines, no LOLA return = gold + x marks,
      // supplier code 3 = gray dots on white; other supplied codes white with an ink border.
      const lola=dataset.lolaCounts?lolaReturnState(dataset.lolaCounts[source.index]):null;
      const coded=Boolean(dataset.quality&&source.quality);
      const colour=missing?palette.missing:flagged?palette.suspicious:lola==='present'?palette.evReturnBg:lola==='none'?palette.evNoneBg:coded?'#ffffff':palette.input;
      const borderColour=missing?palette.missingBorder:lola==='present'?palette.evReturnLine:lola==='none'?palette.evNoneLine:coded||flagged?palette.evInk:palette.inputBorder;
      const center=presentation.selectedInput?.index===source.index;
      const shape=cellBorder(source.row,source.col,borderColour,center?.12:.07,center?.10:.05);
      highlights.add(shape);
      const evidenceFill=!missing&&(flagged||lola==='present'||lola==='none'||coded);
      const opacity=missing&&nativeSampleCounts(dataset)?0:evidenceFill?.9:flagged?.42:.33;
      const fill=patch(source.row,source.col,colour,opacity);fill.renderOrder=5;highlights.add(fill);
      sourceMarks.set(source.index,{shape,fill,colour,borderColour,missing:missing&&Boolean(nativeSampleCounts(dataset)),opacity});
      if(!missing)highlights.add(evidenceTexture(source,flagged?'dots':lola==='present'?'lines':lola==='none'?'xs':null));
      if(missing&&nativeSampleCounts(dataset))highlights.add(lidarGapMark(source));
      if(presentation.sourceFlags.includes(source.index)){highlights.add(sourceFlag(source));raised.push(source.index);}
      if(currentMap.rmsReviewSources&&rmsReviewState(source.heightRMS_m,currentMap.rmsReviewSources.threshold)==='trigger')highlights.add(cellHatch(source,palette.suspiciousBorder));
      rendered.push(source.index);
    }
    if(flagMarks)flagMarks.visible=visibility.regions;
    if(heightFlagMarks)heightFlagMarks.visible=visibility.heightFlags;
    canvas.dataset.heightFlagsOverlay=String(visibility.heightFlags);
    canvas.dataset.qualityOverlay=String(visibility.regions);
    if(routeMarks)routeMarks.visible=true;
    canvas.dataset.sourceIndices=rendered.join(',');
    canvas.dataset.raisedSourceIndices=raised.join(',');
    canvas.dataset.declaredSourceIndices=snapshot.sources.map(c=>c.index).join(',');
    canvas.dataset.tracedRMSReviewSourceIndices=inspecting&&currentMap.rmsReviewSources?snapshot.sources.filter(c=>rmsReviewState(c.heightRMS_m,currentMap.rmsReviewSources.threshold)==='trigger').map(c=>c.index).join(','):'';
    canvas.dataset.missingSourceIndices=inspecting&&nativeSampleCounts(dataset)?snapshot.sources.filter(c=>c.height===null).map(c=>c.index).join(','):'';
    canvas.dataset.inspecting=String(inspecting);
    canvas.dataset.traceCentreRole=presentation.centreRole;
    canvas.dataset.selectedAssessmentState=presentation.selectedResult&&pathAssessmentScope(currentMap.layer)!==null?String(selectedAssessment?.state??2):'';
    canvas.dataset.selectedRenderMode=presentation.selectedResult?(pathAssessmentScope(currentMap.layer)===null?'values':'limits'):'';
    canvas.dataset.selectedColour=presentation.selectedResult?pathDisplayColour(selectedAssessment,currentMap.layer,currentMap.field.range):'';
    const sample=snapshot.heightCell?sampleSurfaceMap(currentMap,snapshot.heightCell):null;
    canvas.dataset.mapValue=currentMap.node==='combined'?'not-applicable':sample&&Number.isFinite(sample.value)?String(sample.value):'unavailable';
    canvas.dataset.flaggedInputs=!qualityVisibility(currentMap.qualityVisibility).affected?'hidden':sample?.suspicious==null?'not-supplied':String(sample.suspicious);
    canvas.dataset.mapOutcome=sample?.state===0?'within':sample?.state===1?'exceeded':sample?.state===2?'unavailable':'none';
    canvas.dataset.mapIncomplete=String(Boolean(sample?.incomplete));
    const cell=snapshot.heightCell;
    if(cell){
      const onPath=isPathCell(cell);
      const pathSelection=snapshot.pathSelection;
      const selectedPathCell=pathSelection?.pathId===currentPath?.id?currentPath?.cells[pathSelection.index]:null;
      const activePathCell=selectedPathCell?.row===cell.row&&selectedPathCell?.col===cell.col;
      const centreInput=inspecting&&presentation.selectedInput;
      if(presentation.selectedResult){
        const resultFill=patch(cell.row,cell.col,pathDisplayColour(selectedAssessment,currentMap.layer,currentMap.field.range),1,.075);resultFill.material.transparent=false;resultFill.material.depthWrite=true;resultFill.renderOrder=5;highlights.add(resultFill);
        if(centreInput){const flagged=qualityVisibility(currentMap.qualityVisibility).heights&&centreInput.quality&&(dataset.quality.flaggedCodes||[3]).includes(centreInput.quality.code);highlights.add(cellHatch(cell,flagged?palette.suspiciousBorder:palette.inputBorder));}
      }
      const borderOffset=(presentation.selectedResult||onPath||centreInput)?.105:.05;
      if(activePathCell){
        highlights.add(screenStroke(footprint(cell.row,cell.col,borderOffset),[['#172531',5,7],['#ffffff',2.5,8]]));
      }else{
        const backing=cellBorder(cell.row,cell.col,'#344653',centreInput?.055:.075,borderOffset);backing.renderOrder=7;
        const border=cellBorder(cell.row,cell.col,'#ffffff',centreInput?.03:.035,borderOffset);border.renderOrder=8;
        highlights.add(backing,border);
        const selectedFill=patch(cell.row,cell.col,'#ffffff',nativeSampleCounts(dataset)&&!Number.isFinite(dataset.heights[cell.row*grid.W+cell.col])&&!presentation.selectedResult?0:presentation.selectedResult?.06:.15,(presentation.selectedResult||onPath)?.08:.025);selectedFill.renderOrder=6;highlights.add(selectedFill);
      }
      if(presentation.selectedResult&&currentMap.showLidarGaps&&sample?.missingHeights>0)highlights.add(lidarGapMark(cell));
      const reviewIndex=(cell.row-currentMap.offset.row)*currentMap.grid.W+cell.col-currentMap.offset.col;
      const reviewTriggered=activePathCell&&routeReviewContext?routeReviewContext.summary(cell).triggered>0:!sample?.outside&&currentMap.rmsReview?.triggered[reviewIndex]>0;
      if(presentation.selectedResult&&reviewTriggered)highlights.add(reviewCellMark(cell,Boolean(activePathCell&&routeReviewContext?.summary(cell).ownTriggered)));
      canvas.dataset.selectedRMSReview=String(Boolean(reviewTriggered));

    }
    remove(rmsRaisedMarks);rmsRaisedMarks=new THREE.Group();scene.add(rmsRaisedMarks);
    const rmsMarkers=raisedRMSReviewMarkers(currentMap,snapshot,currentPath,inspecting,routeReviewContext);
    rmsRaisedCells=new Map(rmsMarkers.map(marker=>[marker.index,marker]));
    for(const marker of rmsMarkers)rmsRaisedMarks.add(sourceFlag(marker,marker));
    canvas.dataset.raisedRMSReviewIndices=rmsMarkers.map(marker=>marker.index).join(',');
    canvas.dataset.raisedRMSReviewRoles=JSON.stringify(rmsMarkers.map(({index,roles,routeIndices})=>({index,roles:roles.map(r=>r.role),routeIndices})));
  }

  function flagRectangles(width,height){
    const rectangles=[];
    scene.traverseVisible(object=>{
      if(!object.isSprite||(!object.userData.qualityFlag&&!object.userData.rmsReview))return;
      const point=object.getWorldPosition(new THREE.Vector3()).project(camera);
      const size=object.getWorldScale(new THREE.Vector3());
      const rect=projectedSpriteRect(point,size,camera,{width,height});
      if(rect)rectangles.push(rect);
    });
    return rectangles;
  }

  function controlRectangles(){
    const box=host.getBoundingClientRect(),rectangles=[];
    for(const element of host.closest('.viewport').querySelectorAll('.view-toolbar>div,.trail,.selection-key,.map-dock,.locator,.view-status>span,.ground-scale')){
      if(element.hidden||!element.getClientRects().length)continue;
      const r=element.getBoundingClientRect();if(r.width&&r.height)rectangles.push({left:r.left-box.left,top:r.top-box.top,width:r.width,height:r.height});
    }
    return rectangles;
  }

  function supportRectangle(width,height){
    if(!inspecting||!snapshot.sources.length)return null;
    const points=[];
    for(const cell of snapshot.sources)for(const dr of [-.5,0,.5])for(const dc of [-.5,0,.5]){
      const row=cell.row+dr,col=cell.col+dc,h=annotationHeight(dataset,row,col);
      if(!Number.isFinite(h))continue;
      const p=position(cellCenter(grid,{row,col}),h).project(camera);
      if(p.z>=-1&&p.z<=1)points.push({x:(p.x*.5+.5)*width,y:(-p.y*.5+.5)*height});
    }
    if(!points.length)return null;
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs)-6,top=Math.min(...ys)-6;
    return {left,top,width:Math.max(...xs)-left+6,height:Math.max(...ys)-top+6};
  }

  function positionLabel(element,anchor,width,height,obstacles){
    element.hidden=false;
    const rect=placeAnnotation(anchor,{width:element.offsetWidth,height:element.offsetHeight},{width,height},obstacles);
    element.hidden=!rect;
    if(rect){element.style.left=`${rect.left}px`;element.style.top=`${rect.top}px`;}
    return rect;
  }

  function draw() {
    const width = host.clientWidth, height = host.clientHeight;
    if (!width || !height) return;
    const size = renderer.getSize(new THREE.Vector2());
    if (size.x !== width || size.y !== height) renderer.setSize(width, height);
    const visible = span * Math.max(1, 1.25 * height / width);
    camera.left = -visible * width / height / 2; camera.right = -camera.left;
    camera.top = visible / 2; camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    // Resolution is in CSS pixels, keeping the affected contour stable through zoom and resize.
    for(const group of [flagMarks,routeLine,highlights])group?.traverse(object=>{if(object.material?.isLineMaterial)object.material.resolution.set(width,height);});
    renderer.render(scene, camera);
    if (snapshot) {
      const measurement=groundScale(camera,width,height,{planeY:controls.target.y,targetPixels:100});
      scale.hidden=!measurement;
      if(measurement){scale.querySelector('span').textContent=`${Number(measurement.metres.toPrecision(6))} m · ground distance`;scale.querySelector('i').style.width=`${measurement.pixels}px`;scale.dataset.metres=measurement.metres;scale.dataset.pixels=measurement.pixels;}
      const endpoints=[];
      for(const [role,element] of Object.entries(endpointLabels)){
        const cell=currentPlan?.[role],same=currentPlan?.start?.row===currentPlan?.goal?.row&&currentPlan?.start?.col===currentPlan?.goal?.col;
        element.hidden=!cell||inspecting||role==='goal'&&same;
        if(element.hidden)continue;
        const p=at(cell.row,cell.col).project(camera);
        const px=(p.x*.5+.5)*width,py=(-p.y*.5+.5)*height;
        element.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;
        element.textContent=same?'S/G':role==='start'?'S':'G';element.title=`${role==='start'?'Start':'Goal'} · ${cell.row}, ${cell.col}`;
        element.style.left=`${px}px`;element.style.top=`${py}px`;
        if(!element.hidden)endpoints.push({left:px-12,top:py-28,width:24,height:28});
      }
      const flags=flagRectangles(width,height),support=supportRectangle(width,height),obstacles=[...flags,...endpoints,...controlRectangles(),...(support?[support]:[])];
      const hovered=hoverAnchor&&hoverCell!==null?positionLabel(hoverLabel,hoverAnchor,width,height,obstacles):null;
      if(!hovered)hoverLabel.hidden=true;
      canvas.dataset.flagRects=JSON.stringify(flags);canvas.dataset.supportRect=support?JSON.stringify(support):'';canvas.dataset.hoverLabelRect=hovered?JSON.stringify(hovered):'';canvas.dataset.labelCollisions=String(hovered?.collisions||0);




    }
  }

  function fit() {
    camera.up.set(0, 1, 0); camera.zoom = 1; span = extent * (nativeSampleCounts(dataset) ? 1.25 : 1.03);
    controls.target.copy(new THREE.Box3().setFromObject(terrain).getCenter(new THREE.Vector3()));
    camera.position.copy(controls.target).add(new THREE.Vector3(.85, .82, 1.05).normalize().multiplyScalar(extent * 3));
    controls.update(); draw();
  }

  function focus() {
    const heights = snapshot.sources.map(c => c.height).filter(Number.isFinite);
    const cell = snapshot.heightCell;
    const marker = cell ? annotationHeight(dataset,cell.row,cell.col) : NaN;
    const y = heights.length ? (Math.min(...heights) + Math.max(...heights)) / 2 : Number.isFinite(marker) ? marker : minimum;
    const target = position(snapshot.point, y), delta = target.clone().sub(controls.target);
    controls.target.copy(target); camera.position.add(delta); camera.zoom = 1;
    span = Math.max(grid.res * 14, heights.length ? (Math.max(...heights) - Math.min(...heights)) * 1.5 : 0);
    controls.update(); draw();
  }

  function focusPath(){
    const cells=[...(currentPath?.cells||[]),...(currentPreviousPath?.cells||[])];
    if(!cells.length)return;
    const rows=cells.map(c=>c.row),cols=cells.map(c=>c.col);
    const row=(Math.min(...rows)+Math.max(...rows))/2,col=(Math.min(...cols)+Math.max(...cols))/2;
    const heights=cells.map(c=>dataset.heights[c.row*grid.W+c.col]).filter(Number.isFinite);
    const y=heights.length?(Math.min(...heights)+Math.max(...heights))/2:minimum;
    const target=position(cellCenter(grid,{row,col}),y),delta=target.clone().sub(controls.target);
    controls.target.copy(target);camera.position.add(delta);camera.zoom=1;
    span=Math.max((Math.max(...rows)-Math.min(...rows)+8)*grid.res,(Math.max(...cols)-Math.min(...cols)+8)*grid.res,heights.length?(Math.max(...heights)-Math.min(...heights))*1.6:0);
    controls.update();draw();
  }

  function top() {
    camera.up.set(0, 1, 0);
    camera.position.copy(controls.target).add(new THREE.Vector3(0, extent * 4, extent * .000001));
    controls.update(); draw();
  }

  function clearHover(){
    remove(hoverMark);hoverMark=null;hoverCell=null;hoverAnchor=null;hoverLabel.hidden=true;
  }

  canvas.addEventListener('pointermove',event=>{
    if(event.buttons||!surface){clearHover();return;}
    if(hoverFrame)cancelAnimationFrame(hoverFrame);
    const {clientX,clientY}=event;
    hoverFrame=requestAnimationFrame(()=>{
      hoverFrame=null;
      const rect=canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),camera);
      const rmsHit=rmsRaisedMarks&&raycaster.intersectObject(rmsRaisedMarks,true).find(hit=>hit.object.userData.rmsReview);
      if(rmsHit){
        const marker=rmsHit.object.userData.rmsReview;clearHover();
        hoverCell=marker.index;hoverLabel.textContent=`${marker.row}, ${marker.col} · ${raisedRMSReviewText(marker)}`;
        hoverAnchor={x:clientX-rect.left,y:clientY-rect.top};draw();return;
      }
      const terrainHit=pickTerrainSurface(raycaster,surface),pathHit=!inspecting&&raycaster.intersectObjects(routeCells)[0];
      const frontPath=pathHit&&(!terrainHit||pathHit.distance<=terrainHit.distance+grid.res*.01)?pathHit:null;
      const hit=frontPath||terrainHit;
      if(!hit){clearHover();draw();return;}
      const cell=frontPath?currentPath.cells[frontPath.object.userData.pathIndex]:cellAt(grid,{east:hit.point.x+origin.east,north:origin.north-hit.point.z});
      if(!cell){clearHover();draw();return;}
      const key=cell.row*grid.W+cell.col;
      if(hoverCell!==key){
        clearHover();hoverCell=key;hoverMark=line(footprint(cell.row,cell.col,isPathCell(cell)?.10:.035),'#ffffff',6);scene.add(hoverMark);
        const sample=sampleSurfaceMap(currentMap,cell);
        const value=currentMap.layer==='quality'?`${qualityLabel(dataset.quality.codes[key],dataset.quality)} · code ${dataset.quality.codes[key]}`:isNumericEvidence(currentMap.layer)?`${NUMERIC_EVIDENCE[currentMap.layer].title}: ${evidenceNumber(sample.value)}${Number.isFinite(sample.value)?' '+currentMap.field.unit:''}`:sample.outside?'No result':currentMap.limits?((['Within limit','Exceeded','Unavailable'][sample.state]||'Unavailable')+(sample.incomplete?' · incomplete':'')):Number.isFinite(sample.value)?`${sample.value.toFixed(2)}${currentMap.layer==='height-support'?' flagged fraction':currentMap.layer==='traversal-cost'?' density':currentMap.field.unit==='°'?'°':' m'}`:'Unavailable';
        const outcome=frontPath&&pathEvidenceScope(currentMap.layer)!=='source'?pathAssessmentOutcome(cell,currentMap.layer):null;
        const count=nativeSampleCounts(dataset)?.[key],missing=count===0;
        const countLabel=dataset.dsmSampleCounts?'valid DSM pixels':'ground returns';
        const gapEvidence=currentMap.showLidarGaps&&sample.missingHeights>0?' · '+lidarGapText(sample.missingHeights,currentMap.node==='heights',dataset.dsmSampleCounts?'surface':'ground'):'';
        hoverLabel.textContent=`${cell.row}, ${cell.col}${frontPath&&currentMap.layer==='height-rms'?' · Route max input RMS: '+evidenceNumber(cell.inputHeightRMS?.max)+' m · '+routeRMSText(cell.inputHeightRMS):''} · ${outcome?(currentMap.limits?outcome:value+' · '+outcome):value}${count===undefined?'':` · ${count} ${countLabel}${missing?' · display fill':''}`}${gapEvidence}${rmsRaisedCells.has(key)?' · '+raisedRMSReviewText(rmsRaisedCells.get(key)):frontPath&&routeReviewContext?' · '+rmsReviewText(routeReviewContext.summary(cell)):''}`;
      }
      hoverAnchor={x:clientX-rect.left,y:clientY-rect.top};draw();
    });
  });
  canvas.addEventListener('pointerleave',()=>{if(hoverFrame)cancelAnimationFrame(hoverFrame);hoverFrame=null;clearHover();draw();});

  canvas.addEventListener('pointerdown', event => {if(hoverFrame)cancelAnimationFrame(hoverFrame);hoverFrame=null;clearHover();pointerStart = [event.clientX, event.clientY, event.button];});
  canvas.addEventListener('pointerup', event => {
    if (!pointerStart || pointerStart[2] !== 0 || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
    const rmsHit=rmsRaisedMarks&&raycaster.intersectObject(rmsRaisedMarks,true).find(hit=>hit.object.userData.rmsReview);
    if(rmsHit){
      const marker=rmsHit.object.userData.rmsReview;canvas.focus({preventScroll:true});
      if(endpointPicking)onPick(cellCenter(grid,marker));
      else if(marker.roles.some(({role})=>role==='traced-height'))onSourcePick?.(marker.index);
      else if(marker.routeIndices.length)onPathPick?.(marker.routeIndices[0]);
      else if(marker.roles.some(({role})=>['selected-height','selected-own-height','undeclared-own-height'].includes(role)))onSourcePick?.(marker.index);
      else onPick(cellCenter(grid,marker));
      return;
    }
    const terrainHit=pickTerrainSurface(raycaster,surface);
    const pathHit=!inspecting&&raycaster.intersectObjects(routeCells)[0];
    if(pathHit&&(!terrainHit||pathHit.distance<=terrainHit.distance+grid.res*.01)){
      canvas.focus({preventScroll:true});
      const index=pathHit.object.userData.pathIndex;
      if(endpointPicking)onPick(cellCenter(grid,currentPath.cells[index]));else onPathPick?.(index);
      return;
    }
    const hit = terrainHit || raycaster.intersectObject(floor)[0];
    if (!hit) return;
    const point = {east: hit.point.x + origin.east, north: origin.north - hit.point.z};
    const picked=cellAt(grid,point);
    if(picked){
      canvas.focus({preventScroll:true});
      const routeCell=!endpointPicking&&!inspecting&&currentPath?.cells.find(c=>c.row===picked.row&&c.col===picked.col);
      if(routeCell)onPathPick?.(routeCell.index);else onPick(point);
    }
  });
  canvas.addEventListener('keydown', event => {
    const move = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]}[event.key];
    if (move) {event.preventDefault(); onMove({row: move[0], col: move[1]});}
  });
  controls.addEventListener('change', draw);
  new ResizeObserver(draw).observe(host);
  return {
    previewSource(index){
      canvas.dataset.previewSource=index==null?'':String(index);
      for(const [i,marks] of sourceMarks){
        marks.shape.material.color.set(i===index?'#ffffff':marks.borderColour);
        if(marks.fill){marks.fill.material.color.set(i===index?'#ffffff':marks.colour);marks.fill.material.opacity=marks.missing?0:i===index ? .5 : marks.opacity;}
      }
      draw();
    },
    update(next,map,{inspect=false,selectedAssessment:assessment,path,previousPath,unchanged=false,coincident=false,plan,picking=false,reviewContext=null}={}) {
      snapshot = next; currentMap = map; inspecting=inspect;endpointPicking=picking;routeReviewContext=reviewContext;
      selectedAssessment=path&&map.layer==='height-rms'&&next.pathSelection?.pathId===path?.id&&path.cells[next.pathSelection.index]?.row===next.heightCell?.row&&path.cells[next.pathSelection.index]?.col===next.heightCell?.col?pathDisplayRecord(path.cells[next.pathSelection.index],map.layer):assessment;presentation=tracePresentation(snapshot,path,inspect,map.qualityVisibility);
      if (dataset !== next.dataset) {dataset = next.dataset; grid = next.sourceGrid; build();}
      colourSurface(map);
      markPath(path);markPreviousPath(previousPath,unchanged,coincident);mark();markPlan(plan);draw();
    },
    fit, focus, top, focusPath,
  };
}
