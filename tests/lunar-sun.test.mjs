import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NASSAU_SUN_PERIOD as p} from '../src/fixtures/lunar-sun-data.js';
import {datasetById} from '../src/fixtures/terrain.js';
import {evaluate,query} from '../src/core/index.js';
test('archived Horizons samples retain exact UTC times, angles, location and source hash',()=>{
 const bytes=readFileSync(new URL('../fixtures/illumination/nassau-sun-horizons.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),p.source.sha256);
 const text=JSON.parse(bytes).result;
 assert.match(text,/Target body name: Sun \(10\).*DE441/);
 assert.match(text,/Center body name: Moon \(301\)/);assert.match(text,/MEAN_ME \(high precision\)/);
 const rows=text.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n');
 assert.equal(rows.length,24);assert.equal(p.samples.length,24);
 rows.forEach((row,i)=>{
  const f=row.split(',');assert.equal(p.samples[i].azimuthDeg,Number(f[3]));assert.equal(p.samples[i].elevationDeg,Number(f[4]));
  assert.equal(Date.parse(p.samples[i].utc),Date.parse(p.startUtc)+(i+.5)*3600000);
 });
 assert.equal(p.samples.reduce((n,s)=>n+s.weightHours,0),(Date.parse(p.endUtc)-Date.parse(p.startUtc))/3600000);
 assert.equal(p.fixedSun.utc,'2026-10-04T00:30:00Z');assert.equal(p.fixedSun.azimuthDeg,89.889841);assert.equal(p.fixedSun.elevationDeg,3.144765);
 const sample=JSON.parse(readFileSync(new URL('../fixtures/lroc/nassau02/sample.json',import.meta.url)));
 const x=sample.projection.top_left_outer_corner_m[0]+(sample.crop.col_start_zero_based+25)*sample.res;
 const y=sample.projection.top_left_outer_corner_m[1]-(sample.crop.row_start_zero_based+25)*sample.res;
 assert.ok(Math.abs(p.site.latitudeDeg-y/sample.projection.radius_m*180/Math.PI)<1e-10);
 assert.ok(Math.abs(p.site.longitudeEastDeg-(180+x/(sample.projection.radius_m*Math.cos(-22*Math.PI/180))*180/Math.PI))<1e-10);
 assert.ok(p.gridMetric.eastSpacing_m>3.9 && p.gridMetric.eastSpacing_m<4.1);
});
test('separate illumination example preserves original elevations and raw quality without adding a branch to Nassau',()=>{
 const original=datasetById('lroc-nassau02'),sun=datasetById('lroc-nassau02-illumination');
 assert.equal(original.illuminationPeriod,undefined);assert.deepEqual(sun.heights,original.heights);assert.deepEqual(sun.quality,original.quality);
 const before=evaluate(original),withSun=evaluate(sun),after=evaluate(original);
 assert.equal(before.records.illumination,undefined);assert.deepEqual(before.records,after.records);
 for(const node of ['heights','slope','roughness','slope-criterion','roughness-criterion']) assert.deepEqual(before.records[node],withSun.records[node]);
 const q=query(withSun,'illumination',{row:11,col:18});
 for(const t of q.illumination.samples){assert.equal(t.suspicious,t.sources.filter(i=>sun.quality.codes[i]===3).length);assert.equal(t.interpolated,null);}
 assert.deepEqual(Object.keys(query(before,'combined',0).branches),['slope','roughness']);
 assert.deepEqual(Object.keys(query(withSun,'combined',0).branches),['slope','roughness','illumination']);
});
