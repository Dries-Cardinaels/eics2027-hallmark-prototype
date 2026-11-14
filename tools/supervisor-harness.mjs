import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDOMSink} from './dom-sink.mjs';
export function supervisorHarness(hash='') {
 const html=readFileSync(new URL('../dist/hallmark-prototype.html',import.meta.url),'utf8');
 const dom=createDOMSink(html),window={},location={hash};
 vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],{window,document:dom.document,URL,URLSearchParams,location,history:{replaceState(a,b,h){location.hash=h;}}});
 return {...dom,html,h:window.hallmark,location};
}
