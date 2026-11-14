"""Fixed, ephemeris-lit Nassau surface. No interactive Sun position or vertical exaggeration."""
from pathlib import Path
import json,math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
root=Path(__file__).resolve().parents[1]
ds=json.loads((root/'fixtures/lroc/nassau02/sample.json').read_text())
period=json.loads((root/'fixtures/illumination/nassau-sun-period.json').read_text());sun=period['fixedSun']
z=np.array(ds['heights']).reshape(ds['H'],ds['W']);res=ds['res']
east=res*math.cos(math.radians(period['site']['latitudeDeg']))/math.cos(math.radians(ds['projection']['standard_parallel_deg']))
x=np.arange(ds['W'])*east;y=(ds['H']-1-np.arange(ds['H']))*res;X,Y=np.meshgrid(x,y)
a=math.radians(sun['azimuthDeg']);dx=math.sin(a)*res/east;dy=-math.cos(a)
shadow=np.zeros(z.shape,dtype=bool)
for r in range(ds['H']):
 for c in range(ds['W']):
  seen={(r,c)}
  for d in np.arange(.5,math.hypot(ds['W'],ds['H'])+1,.5):
   rr=math.floor(r+dy*d+.5);cc=math.floor(c+dx*d+.5)
   if not (0<=rr<ds['H'] and 0<=cc<ds['W']):break
   if (rr,cc) in seen:continue
   seen.add((rr,cc));angle=math.degrees(math.atan2(z[rr,cc]-z[r,c],math.hypot((rr-r)*res,(cc-c)*east)))
   if angle>=sun['elevationDeg']:shadow[r,c]=True
light=LightSource(azdeg=sun['azimuthDeg'],altdeg=sun['elevationDeg'])
intensity=light.hillshade(z,dx=east,dy=res)
intensity=np.where(shadow,.08,.16+.78*intensity)
colors=plt.get_cmap('gray')(intensity)
fig=plt.figure(figsize=(10,6.2));ax=fig.add_axes([.06,.17,.88,.68],projection='3d')
ax.plot_surface(X,Y,z,facecolors=colors,shade=False,linewidth=0,antialiased=True,rcount=50,ccount=50)
ax.set_zticks([round(float(z.mean()),1)]);ax.set_proj_type('ortho')
ax.set(xlabel='East (m)',ylabel='North (m)',zlabel='Elevation (m)');ax.set_box_aspect((np.ptp(x),np.ptp(y),np.ptp(z)));ax.view_init(elev=35,azim=-55)
fig.suptitle('Nassau · fixed Sun preview',x=.07,ha='left',fontsize=18,fontweight='bold')
fig.text(.07,.89,'2026-10-04 00:30 UTC · JPL Horizons · native 4 m DEM · vertical scale ×1',fontsize=11)
fig.text(.07,.08,f"Sun azimuth {sun['azimuthDeg']:.3f}° · elevation {sun['elevationDeg']:.3f}° · fixed viewpoint and lighting",fontsize=10)
fig.text(.07,.045,'Local cast-shadow model only; distant terrain excluded. Shading is not calibrated radiance.',fontsize=9)
fig.text(.07,.015,'NASA/GSFC/Arizona State University · NAC_DTM_NASSAU02 v1.9',fontsize=9)
fig.savefig(root/'figures/lroc-nassau02-illumination-fixed.png',dpi=160)
print('Fixed preview generated:',sun['utc'],'local shadow posts:',int(shadow.sum()))
