// Shared presentation roles; data and planning never depend on this selection.
export const palette={};
export const assessmentColours=[];
export const assessmentBorders=[];
// Source presets: https://davidmathlogic.com/colorblind/
export const paletteOptions=Object.freeze([
  {id:'5',label:'IBM',swatches:['#648fff','#785ef0','#dc267f','#fe6100','#ffb000']},
  {id:'6',label:'Okabe & Ito',swatches:['#000000','#e69f00','#56b4e9','#009e73','#f0e442','#0072b2','#d55e00','#cc79a7']},
]);

export let activePalette='5';
export const ramp=[];
export const costRamp=[];
export const supportRamp=[];
export const mixColour=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
// Evidence roles shared with the paper figures (.claude/rules/figure-style.md, section 3; authors' decision
// 9 Nov 2026, demo/research/interface-figure-storyboard.md): blue diagonal lines = LOLA return, gold x marks =
// no LOLA return, gray dots = supplier code 3 (suspicious). Same role() derivation as make_teaser.py.
const lum=hex=>[1,3,5].map(i=>{const c=parseInt(hex.slice(i,i+2),16)/255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4;}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
export const contrastRatio=(a,b='#ffffff')=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
const darkenTo=(hex,target)=>{let t=0;while(contrastRatio(mixColour(hex,'#000000',t))<target)t+=.02;return mixColour(hex,'#000000',t);};
const TINT=.65,HATCH_MIN=1.5;
function evidenceRole(base){
  const bg=mixColour(base,'#ffffff',TINT),light=mixColour(base,'#ffffff',TINT*.45);
  let t=0;while(contrastRatio(mixColour(light,'#000000',t),bg)<HATCH_MIN)t+=.02;
  return {bg,hatch:mixColour(light,'#000000',t),line:darkenTo(base,3),text:darkenTo(base,4.5)};
}
const RET=evidenceRole('#648fff'),NORET=evidenceRole('#ffb000');
export const evidenceRoles=Object.freeze({
  evReturnBg:RET.bg,evReturnHatch:RET.hatch,evReturnLine:RET.line,evReturnText:RET.text,
  evNoneBg:NORET.bg,evNoneHatch:NORET.hatch,evNoneLine:NORET.line,evNoneText:NORET.text,
  evStipple:darkenTo('#9a9a9a',3),evInk:'#2b2b2b',
});
const ibmRoles={
  within:mixColour('#648fff','#ffffff',.65),
  exceeded:mixColour('#fe6100','#ffffff',.72),
  neutral:mixColour('#ffb000','#ffffff',.92),ink:'#785ef0',
  suspicious:'#e9e9e9',
  input:mixColour('#785ef0','#ffffff',.75),
  withinBorder:mixColour('#648fff','#171a23',.40),
  exceededBorder:mixColour('#fe6100','#171a23',.42),
  suspiciousBorder:'#5c5c5c',
};
const okabeItoRoles={
  within:mixColour('#009e73','#ffffff',.70),
  exceeded:mixColour('#e69f00','#ffffff',.72),
  neutral:mixColour('#f0e442','#ffffff',.88),ink:'#000000',
  suspicious:mixColour('#cc79a7','#ffffff',.60),
  input:mixColour('#56b4e9','#ffffff',.62),
  withinBorder:mixColour('#009e73','#000000',.28),
  exceededBorder:mixColour('#d55e00','#000000',.25),
  inputBorder:mixColour('#0072b2','#000000',.18),
};
const paletteRoles={'5':ibmRoles,'6':okabeItoRoles};
function presentationRoles(roles){
  const {within,exceeded,neutral,ink,suspicious,input}=roles;
  const border=colour=>mixColour(colour,'#171a23',.58);
  return {
    within,exceeded,unavailable:neutral,suspicious,input,missing:neutral,
    withinBorder:roles.withinBorder||border(within),exceededBorder:roles.exceededBorder||border(exceeded),
    unavailableBorder:border(neutral),suspiciousBorder:roles.suspiciousBorder||border(suspicious),
    suspiciousHalo:neutral,inputBorder:roles.inputBorder||border(ink),missingBorder:border(neutral),
    routeContext:border(ink),previousRoute:border(ink),previousRouteFill:mixColour(neutral,ink,.25),
  };
}
export function setPalette(id){
  const option=paletteOptions.find(p=>p.id===id)||paletteOptions[0];
  activePalette=option.id;
  Object.assign(palette,presentationRoles(paletteRoles[option.id]),evidenceRoles);
  // Neutral value ramp (slope, height spread, height RMS): blue is kept for "LOLA return" only.
  ramp.splice(0,3,'#f6f6f6','#bdbdbd','#5c5c5c');
  costRamp.splice(0,3,palette.unavailable,mixColour(palette.unavailable,palette.routeContext,.45),palette.routeContext);
  supportRamp.splice(0,3,palette.unavailable,palette.suspicious,palette.suspiciousBorder);
  assessmentColours.splice(0,3,palette.within,palette.exceeded,palette.unavailable);
  assessmentBorders.splice(0,3,palette.withinBorder,palette.exceededBorder,palette.unavailableBorder);
  return option;
}
setPalette('5');

export function contrastColour(hex){
  const linear=[1,3,5].map(i=>{const c=parseInt(hex.slice(i,i+2),16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722>.179?'#000000':'#ffffff';
}
