"""Render only the published LROC DEM surface; there is no independent truth scene."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
root=Path(__file__).resolve().parents[1]
ds=json.loads((root/'fixtures/lroc/nassau02/sample.json').read_text())
z=np.array(ds['heights']).reshape(ds['H'],ds['W'])
x=(np.arange(ds['W'])+.5)*ds['res'];y=(ds['H']-np.arange(ds['H'])-.5)*ds['res'];X,Y=np.meshgrid(x,y)
colors=LightSource(azdeg=315,altdeg=45).shade(z,cmap=plt.get_cmap('Greys_r'),dx=ds['res'],dy=ds['res'],vert_exag=1,blend_mode='soft')
for scale in [1,3]:
 fig=plt.figure(figsize=(10,6.2));ax=fig.add_axes([.06,.12,.88,.74],projection='3d')
 ax.plot_surface(X,Y,z,facecolors=colors,shade=False,linewidth=0,antialiased=True,rcount=50,ccount=50)
 ax.set(xlim=(0,200),ylim=(0,200),xlabel='East (m)',ylabel='North (m)',zlabel='Elevation (m)')
 ax.set_box_aspect((200,200,np.ptp(z)*scale));ax.view_init(elev=35,azim=-55)
 fig.suptitle('LROC · North of Nassau Crater',x=.07,ha='left',fontsize=18,fontweight='bold')
 fig.text(.07,.89,f'Published DEM surface · native 4 m posts · vertical scale ×{scale}',fontsize=11)
 fig.text(.07,.055,'NASA/GSFC/Arizona State University · NAC_DTM_NASSAU02 v1.9',fontsize=9)
 fig.text(.07,.025,'Illustrative lighting. This is the delivered elevation model, not an independent reference scene.',fontsize=9)
 fig.savefig(root/f'figures/lroc-nassau02-surface-{scale}x.png',dpi=160)
 plt.close(fig)
print('Rendered two on-demand previews from the published DEM.')
