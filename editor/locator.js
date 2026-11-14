import {nativeSampleCounts} from '../src/core/sample-counts.js';
import {palette} from './palette.js';
import {cellCenter} from './spatial.js';
import {annotationHeight} from './missing-cell-display.js';
import {displayMetres} from './display-units.js';

// Photo bounds and the analysis grid share projected ground coordinates.
export function photoCrop(bounds, grid) {
  const width=bounds.east-bounds.west,height=bounds.north-bounds.south;
  if(!(width>0&&height>0))return null;
  return {left:(grid.east-bounds.west)/width,top:(bounds.north-grid.north)/height,
    width:grid.W*grid.res/width,height:grid.H*grid.res/height};
}

export function createLocator(host,onPick) {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=160;
  canvas.tabIndex=0;
  canvas.title='Click to locate; arrow keys move one cell';
  canvas.setAttribute('aria-label','Terrain extent and selected cell');
  const heading=document.createElement('div'); heading.className='locator-heading';
  const thumbnail=document.createElement('button');thumbnail.type='button';thumbnail.className='locator-photo';
  thumbnail.setAttribute('aria-label','Enlarge survey photograph and analysis crop');
  thumbnail.hidden=true;
  const thumbImage=document.createElement('img');thumbImage.alt='Wider aerial survey photograph';
  const thumbCrop=document.createElement('span');thumbCrop.className='locator-photo-crop';
  thumbnail.append(thumbImage,thumbCrop);
  const open=document.createElement('button');open.type='button';open.className='locator-enlarge';open.textContent='Enlarge preview';
  open.disabled=true;
  open.setAttribute('aria-haspopup','dialog');thumbnail.setAttribute('aria-haspopup','dialog');
  host.append(thumbnail,heading,canvas,open);
  const dialog=document.createElement('dialog');dialog.className='locator-dialog';
  dialog.setAttribute('aria-labelledby','locator-preview-title');
  const header=document.createElement('div');header.className='locator-dialog-header';
  const title=document.createElement('h2');title.id='locator-preview-title';
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.autofocus=true;
  header.append(title,close);
  const frame=document.createElement('div');frame.className='locator-preview-frame';
  const photo=document.createElement('img');photo.alt='Aerial survey photograph with the terrain crop outlined';
  const crop=document.createElement('span');crop.className='locator-photo-crop';
  const relief=document.createElement('canvas');relief.width=relief.height=800;relief.setAttribute('role','img');relief.setAttribute('aria-label','Enlarged terrain relief preview');
  frame.append(photo,crop,relief);
  const description=document.createElement('p');description.className='locator-preview-description';
  const attribution=document.createElement('p');attribution.className='locator-preview-attribution';
  dialog.append(header,frame,description,attribution);document.body.append(dialog);
  let returnFocus;
  function showPreview(event){if(!snapshot)return;returnFocus=event.currentTarget;renderPreview();dialog.showModal();}
  open.addEventListener('click',showPreview);thumbnail.addEventListener('click',showPreview);
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>returnFocus?.focus());
  // Keep viewport shortcuts (including Escape while picking) out of the modal.
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  function applyCrop(element,box){
    element.hidden=!box;
    if(box)Object.assign(element.style,{left:`${box.left*100}%`,top:`${box.top*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`});
  }
  function renderPreview(){
    const context=dataset.contextPhoto;
    photo.hidden=!context;relief.hidden=!!context;
    title.textContent=context?(context.title||`${dataset.title||'Terrain'} · survey context`):'Terrain relief preview';
    attribution.replaceChildren();
    if(context){
      const url=new URL(`./data/${context.file}`,import.meta.url).href;
      photo.src=url;
      applyCrop(crop,photoCrop(context.bounds,grid));applyCrop(thumbCrop,photoCrop(context.bounds,grid));
      const width=Math.round(context.bounds.east-context.bounds.west), height=Math.round(context.bounds.north-context.bounds.south);
      description.textContent=`${width} × ${height} m photograph · outlined: ${displayMetres(grid.W*grid.res)} × ${displayMetres(grid.H*grid.res)} m analysis crop (approximate)`;
      const original=document.createElement('a');original.href=url;original.target='_blank';original.rel='noopener';original.textContent=context.fullViewLabel||'Original-size photograph';
      const source=document.createElement('a');source.href=context.sourceURL;source.target='_blank';source.rel='noopener';source.textContent=context.credit;
      attribution.append(original,document.createTextNode(` · ${context.date} · `),source);
    }else{
      crop.hidden=true;
      relief.width=backdrop.width;relief.height=backdrop.height;
      relief.getContext('2d').drawImage(backdrop,0,0);
      description.textContent=`${displayMetres(grid.W*grid.res)} × ${displayMetres(grid.H*grid.res)} m terrain relief. Pick a cell or use the arrow keys in the small locator.`;
    }
  }
  const ctx=canvas.getContext('2d');
  let dataset,grid,snapshot,backdrop;
  function update(next,inspect) {
    snapshot=next; grid=next.sourceGrid;open.disabled=false;
    if(dataset!==next.dataset){
      dataset=next.dataset;
      const image=document.createElement('canvas');image.width=dataset.W;image.height=dataset.H;
      const ic=image.getContext('2d'),data=ic.createImageData(dataset.W,dataset.H);
      let lo=Infinity,hi=-Infinity;
      for(const h of dataset.heights)if(Number.isFinite(h)){lo=Math.min(lo,h);hi=Math.max(hi,h);}
      const display=nativeSampleCounts(dataset)
        ? dataset.heights.map((h,i)=>Number.isFinite(h)?h:annotationHeight(dataset,Math.floor(i/dataset.W),i%dataset.W))
        : dataset.heights;
      for(let i=0;i<dataset.heights.length;i++){
        const h=display[i],row=Math.floor(i/dataset.W),col=i%dataset.W;
        const left=display[row*dataset.W+Math.max(0,col-1)],right=display[row*dataset.W+Math.min(dataset.W-1,col+1)];
        const north=display[Math.max(0,row-1)*dataset.W+col],south=display[Math.min(dataset.H-1,row+1)*dataset.W+col];
        const dx=(right-left)/(2*dataset.res),dz=(south-north)/(2*dataset.res);
        // Missing neighbours give no shading normal; retain the measured cell's tone.
        const illumination=Number.isFinite(dx)&&Number.isFinite(dz)?(.7+dx*.5+dz*.5)/Math.hypot(dx,1,dz):.7;
        const shade=Number.isFinite(h)?Math.max(.12,Math.min(1,.32+.3*(h-lo)/(hi-lo||1)+.45*illumination)):.12;
        const base=dataset.caseId==='moon'?[173,184,198]:[178,178,178];
        data.data.set([...base.map(v=>Math.round(v*shade)),255],i*4);
      }
      ic.putImageData(data,0,0);backdrop=image;
      const metres=dataset.W*dataset.res;
      heading.innerHTML=`<span>${metres>=1000?(metres/1000).toFixed(2)+' km':displayMetres(metres)+' m'}</span><span>N ↑</span>`;
      const context=dataset.contextPhoto;
      thumbnail.hidden=!context;
      if(context){
        thumbImage.src=new URL(`./data/${context.thumbnail||context.file}`,import.meta.url).href;
        applyCrop(thumbCrop,photoCrop(context.bounds,grid));
      }
    }
    ctx.drawImage(backdrop,0,0,160,160);
    const p=next.heightCell;
    if(p){
      const x=(p.col+.5)/grid.W*160,y=(p.row+.5)/grid.H*160;
      if(inspect&&next.sources.length){
        const rows=next.sources.map(c=>c.row),cols=next.sources.map(c=>c.col);
        ctx.strokeStyle=palette.inputBorder;ctx.lineWidth=1;
        ctx.strokeRect(Math.min(...cols)/grid.W*160,Math.min(...rows)/grid.H*160,(Math.max(...cols)-Math.min(...cols)+1)/grid.W*160,(Math.max(...rows)-Math.min(...rows)+1)/grid.H*160);
      }
      ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x-3,y);ctx.moveTo(x+3,y);ctx.lineTo(x+7,y);ctx.moveTo(x,y-7);ctx.lineTo(x,y-3);ctx.moveTo(x,y+3);ctx.lineTo(x,y+7);ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
    }
    if(dialog.open)renderPreview();
  }
  canvas.addEventListener('click',event=>{
    if(!snapshot)return;
    const rect=canvas.getBoundingClientRect();
    const col=Math.min(grid.W-1,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*grid.W)));
    const row=Math.min(grid.H-1,Math.max(0,Math.floor((event.clientY-rect.top)/rect.height*grid.H)));
    onPick(cellCenter(grid,{row,col}));
  });
  canvas.addEventListener('keydown',event=>{
    const step={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[event.key];
    if(!step||!snapshot?.heightCell)return;
    event.preventDefault();const p=snapshot.heightCell;
    onPick(cellCenter(grid,{row:Math.max(0,Math.min(grid.H-1,p.row+step[0])),col:Math.max(0,Math.min(grid.W-1,p.col+step[1]))}));
  });
  return {update};
}
