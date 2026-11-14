import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocator,photoCrop} from '../editor/locator.js';

test('photo crop aligns the entire analysis extent to wider survey bounds',()=>{
  assert.deepEqual(photoCrop({west:100,east:300,north:500,south:100},{east:150,north:400,W:650,H:650,res:.1}),
    {left:.25,top:.25,width:.325,height:.1625});
  assert.equal(photoCrop({west:0,east:0,north:1,south:0},{}),null);
});

// Minimal DOM surface exercises controls and case switching without a renderer.
class Element extends EventTarget {
  constructor(tag){super();this.tagName=tag;this.children=[];this.style={};this.attributes={};this.hidden=false;this.draws=[];}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes[key]=value;}
  focus(){this.focused=true;}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatchEvent(new Event('close'));}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
  getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage:(...args)=>this.draws.push(args),beginPath(){},moveTo(){},lineTo(){},stroke(){},strokeRect(){}};}
}
function fire(element,type,properties={}){
  const event=new Event(type,{cancelable:true});Object.assign(event,properties);element.dispatchEvent(event);return event;
}

test('photo preview is separate from picking, restores focus, and switches to Moon relief',()=>{
  const previous=globalThis.document;
  globalThis.document={body:new Element('body'),createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
  try {
    const host=new Element('div'),picks=[],locator=createLocator(host,point=>picks.push(point));
    const [thumbnail,,canvas,open]=host.children,dialog=document.body.children[0];
    const [header,frame,description,attribution]=dialog.children;
    const [photo,crop,relief]=frame.children;
    const grid={east:150,north:400,W:2,H:2,res:1};
    const dataset={W:2,H:2,res:1,heights:[0,1,2,3],caseId:'earth',contextPhoto:{file:'atami-headscarp.jpg',bounds:{west:100,east:300,north:500,south:100},date:'3 July 2021',credit:'Survey team',sourceURL:'https://example.com/survey'}};
    locator.update({dataset,sourceGrid:grid,heightCell:{row:0,col:0},sources:[]},false);
    assert.equal(thumbnail.hidden,false);assert.equal(thumbnail.children[1].style.left,'25%');
    fire(canvas,'click',{clientX:75,clientY:75});assert.deepEqual(picks.pop(),{east:151.5,north:398.5});
    assert.equal(fire(canvas,'keydown',{key:'ArrowRight'}).defaultPrevented,true);assert.deepEqual(picks.pop(),{east:151.5,north:399.5});
    fire(thumbnail,'click');assert.equal(dialog.open,true);assert.equal(photo.hidden,false);assert.equal(relief.hidden,true);
    assert.equal(crop.style.width,'1%');assert.match(description.textContent,/analysis crop/);
    assert.equal(attribution.children[0].href,photo.src);assert.equal(attribution.children[2].textContent,'Survey team');
    fire(header.children[1],'click');assert.equal(dialog.open,false);assert.equal(thumbnail.focused,true);
    locator.update({dataset:{...dataset,caseId:'moon',contextPhoto:undefined},sourceGrid:grid,heightCell:{row:0,col:0},sources:[]},false);
    fire(open,'click');assert.equal(photo.hidden,true);assert.equal(crop.hidden,true);assert.equal(relief.hidden,false);
    assert.equal(relief.width,2);assert.equal(relief.height,2);assert.equal(relief.draws[0][0].width,2);
    assert.equal(thumbnail.hidden,true);assert.equal(attribution.children.length,0);assert.equal(header.children[0].textContent,'Terrain relief preview');
    dialog.close();assert.equal(open.focused,true);
  } finally {globalThis.document=previous;}
});
