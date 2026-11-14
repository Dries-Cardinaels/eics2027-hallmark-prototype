// Minimal DOM sink for handler correctness and workload tests; no layout or painting.
export function createDOMSink(html, {baseURI='file:///prototype/dist/hallmark-prototype.html',record=()=>{}}={}) {
  const elements=new Map(), scripts=[];
  let document;
  function element(id='detached',tag='g') {
    let markup='',children=null;
    const out={id,tag,attributes:{},listeners:{},dataset:{},open:false,value:'',textContent:'',
      get innerHTML(){return children ? children.map(c=>c.outerHTML).join('') : markup;},
      set innerHTML(value){children=null;markup=value;record(`${id}.writes`,1);record(`${id}.bytes`,Buffer.byteLength(value));},
      get firstChild(){return children?.[0] ?? null;},
      get outerHTML(){return `<${tag}${id==='detached'?'':` id="${id}"`}>${this.innerHTML}</${tag}>`;},
      replaceChildren(...nodes){children=nodes;record(`${id}.swaps`,1);},
      setAttribute(k,v){this.attributes[k]=v;},
      addEventListener(k,v){this.listeners[k]=v;record(`${id}.listeners`,1);},
      showModal(){this.open=true;},remove(){this.removed=true;},focus(){document.activeElement=this;},
      querySelector(selector){const criterion=selector.match(/^\[data-criterion="([^"]+)"\]$/);if(criterion){const match=[...this.innerHTML.matchAll(/<button[^>]*data-criterion="([^"]+)"[^>]*>/g)].find(m=>m[1]===criterion[1]);return match?{dataset:{criterion:match[1]},focus(){document.activeElement=this;}}:null;}const node=selector.match(/^\[data-node="([^"]+)"\]$/);return node?this.querySelectorAll('.gnode').find(g=>g.dataset.node===node[1]):this.querySelectorAll(selector)[0]||{focus(){}};},
      querySelectorAll(selector){
        if(selector==='.gnode') {
          if(this.graphParsed!==this.innerHTML) {
            this.graphParsed=this.innerHTML;
            this.nodes=[...this.innerHTML.matchAll(/<g class="gnode[^"]*" data-node="([^"]+)"([^>]*)>([\s\S]*?)<\/g>/g)].map(m=>({
              dataset:{node:m[1]},attributes:Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])),listeners:{},
              getAttribute(k){return this.attributes[k];},closest(s){return s==='.gnode'?this:null;},focus(){document.activeElement=this;},addEventListener(k,v){this.listeners[k]=v;}
            }));
          }
          return this.nodes;
        }
        if(selector!=='.cell')return [];
        const content=this.innerHTML;
        if(this.parsed!==content){
          this.parsed=content;
          this.cells=[...content.matchAll(/<(g|rect) class="cell[^\"]*" data-r="(-?\d+)" data-c="(-?\d+)" data-ok="(true|false)"([^>]*)>([\s\S]*?)<\/\1>/g)].map(m=>({dataset:{r:m[2],c:m[3],ok:m[4]},markup:m[1]==='rect'?`<rect${m[5]}>${m[6]}</rect>`:m[6],listeners:{},closest(selector){return selector==='.cell'?this:null;},addEventListener(k,v){record('cell.listeners',1);this.listeners[k]=v;}}));
        }
        return this.cells;
      }
    };
    return out;
  }
  for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],element(match[1]));
  for(const id of ['map','branch-map']) if(elements.has(id+'-content'))elements.get(id).replaceChildren(elements.get(id+'-content'),elements.get(id+'-selection'));
  elements.get('show-terrain-preview').dataset.assets=html.match(/id="show-terrain-preview" data-assets="([^\"]+)"/)[1];
  document={activeElement:null,baseURI,head:{append(script){scripts.push(script);}},createElement:()=>element(),createElementNS:(_ns,tag)=>element('detached',tag),
    getElementById(id){if(!elements.has(id))throw new Error(`missing DOM element ${id}`);return elements.get(id);},querySelectorAll(){return [];}};
  const clickCell=cell=>{
    if(!cell)throw new Error('Missing cell');
    // The baseline uses per-cell handlers; the optimized map delegates to its root.
    if(cell.listeners.click)cell.listeners.click();else elements.get('map').listeners.click({target:cell});
  };
  return {elements,scripts,document,clickCell};
}
