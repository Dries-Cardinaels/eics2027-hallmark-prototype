#!/usr/bin/env python3
"""Download PGDA78 sources and extract exact native samples. Requires numpy,rasterio.
Run: python reproduce.py --cache /tmp/lola78 [--select]
--select prints candidate windows; manifest fixes the retained window thereafter.
"""
import argparse, hashlib, json, pathlib, urllib.request
import numpy as np
import rasterio
from rasterio.windows import Window
HERE=pathlib.Path(__file__).resolve().parent
BASE='https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/'
NAMES={'height':'surf','heightRms':'toterr','counts':'ldec'}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
p=argparse.ArgumentParser();p.add_argument('--cache',type=pathlib.Path,default=pathlib.Path('/tmp/lola78'));p.add_argument('--select',action='store_true');a=p.parse_args();a.cache.mkdir(parents=True,exist_ok=True)
paths={}
for key,suffix in NAMES.items():
 path=a.cache/(suffix+'.tif'); paths[key]=path
 if not path.exists(): urllib.request.urlretrieve(BASE+f'Site01_final_adj_5mpp_{suffix}.tif',path)
with rasterio.open(paths['height']) as ds:
 z=ds.read(1); expected_transform=ds.transform; expected_crs=ds.crs
with rasterio.open(paths['heightRms']) as ds: u=ds.read(1)
if a.select:
 gy,gx=np.gradient(z,5);s=np.degrees(np.arctan(np.hypot(gx,gy))); candidates=[]
 for r in range(700,2400,100):
  for c in range(700,2400,100):
   zz=z[r:r+256,c:c+256];uu=u[r:r+256,c:c+256];ss=s[r:r+256,c:c+256]
   if np.isfinite(zz).all() and np.isfinite(uu).all():
    candidates.append((float(np.percentile(uu,95)-np.percentile(uu,5)),r,c,float(np.median(ss)),float(np.percentile(uu,5)),float(np.percentile(uu,95)),float(np.median(zz))))
 print(sorted(candidates,reverse=True)[:30]);raise SystemExit
manifest=json.loads((HERE/'manifest.json').read_text());win=Window(**manifest['window'])
sample={'caseId':'connecting-ridge','width':int(win.width),'height':int(win.height),'spacingM':5,'units':{'heights':'m','heightRms':'m','counts':'returns/pixel'}}
for key,path in paths.items():
 with rasterio.open(path) as ds:
  assert ds.width==3200 and ds.height==3200
  assert ds.transform==expected_transform and ds.crs==expected_crs
  assert ds.dtypes[0]=='float32'
  rec=manifest['layers'][key]
  if rec.get('sourceSha256'): assert sha(path)==rec['sourceSha256'], 'Source changed: inspect producer revision before overwriting fixture'
  values=ds.read(1,window=win); mask=ds.read_masks(1,window=win)
  native=values.astype('<f4'); output=HERE/(key+'.f32');native.tofile(output)
  # No interpolation, scaling, rounding or reprojection. All three source layers float32.
  sample['heights' if key=='height' else key]=[float(x) if np.isfinite(x) else None for x in values.ravel()]
  valid=(mask>0)&np.isfinite(values)
  rec=manifest['layers'][key];rec.update(sourceSha256=sha(path),sourceBytes=path.stat().st_size,cropSha256=sha(output),cropBytes=output.stat().st_size,sourceDtype=ds.dtypes[0],sourceNodata='NaN' if ds.nodata is not None and np.isnan(ds.nodata) else ds.nodata,validCount=int(valid.sum()),missingCount=int((~valid).sum()),min=float(values[valid].min()),max=float(values[valid].max()),quantiles={str(q):float(np.quantile(values[valid],q)) for q in [0.05,0.5,0.95]},sourceTransform=list(ds.transform)[:6],sourceCrsWkt=ds.crs.to_wkt())
  sample['transform']=list(ds.window_transform(win))[:6];manifest['cropTransform']=sample['transform']
  assert np.array_equal(native, values, equal_nan=True)
(HERE/'sample.json').write_text(json.dumps(sample,separators=(',',':'))+'\n');manifest['sampleSha256']=sha(HERE/'sample.json');(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({k:{x:v[x] for x in ['min','max','validCount','missingCount']} for k,v in manifest['layers'].items()},indent=2))
