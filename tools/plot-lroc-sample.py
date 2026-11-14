"""Render the staged LROC example and independently check every numerical result."""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from matplotlib.patches import Rectangle, Patch

root=Path(__file__).resolve().parents[1]
folder=root/'fixtures/lroc/nassau02'
ds=json.loads((folder/'sample.json').read_text())
a=json.loads((folder/'analysis.json').read_text())
z=np.array(ds['heights']).reshape(ds['H'],ds['W'])
q=np.array(ds['quality_codes']).reshape(z.shape)
shape=(a['grid']['H'],a['grid']['W'])
slope=np.array(a['values']['slope']).reshape(shape)
rough=np.array(a['values']['roughness']).reshape(shape)
# Independent vectorized calculation, with separate windows and population std.
w=np.lib.stride_tricks.sliding_window_view(z,(3,3))[1:-1,1:-1]
dx=((w[:,:,0,2]+2*w[:,:,1,2]+w[:,:,2,2])-(w[:,:,0,0]+2*w[:,:,1,0]+w[:,:,2,0]))/(8*ds['res'])
dy=((w[:,:,2,0]+2*w[:,:,2,1]+w[:,:,2,2])-(w[:,:,0,0]+2*w[:,:,0,1]+w[:,:,0,2]))/(8*ds['res'])
np.testing.assert_allclose(slope,np.degrees(np.arctan(np.hypot(dx,dy))),rtol=1e-11,atol=1e-11)
np.testing.assert_allclose(rough,np.lib.stride_tricks.sliding_window_view(z,(5,5)).std(axis=(-1,-2)),rtol=1e-11,atol=1e-11)
for name,n in [('slope',3),('roughness',5)]:
    counts=np.lib.stride_tricks.sliding_window_view(q==3,(n,n)).sum(axis=(-1,-2))
    if n==3:counts=counts[1:-1,1:-1] - (q[2:-2,2:-2]==3)
    np.testing.assert_array_equal(counts,np.array(a['suspicious_input_counts'][name]).reshape(shape))
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(2,2,figsize=(10,9))
fig.subplots_adjust(left=.08,right=.95,bottom=.11,top=.86,wspace=.30,hspace=.36)
fig.suptitle('Real LROC terrain: North of Nassau Crater',x=.08,ha='left',y=.98,fontsize=18,fontweight='bold')
fig.text(.08,.93,'NAC_DTM_NASSAU02 · 4 m native posts · 200 × 200 m crop',fontsize=11)
selected=a['selected']
sc,st=selected['suspicious_inputs']['slope']; rc,rt=selected['suspicious_inputs']['roughness']
fig.text(.08,.90,f"Selected cell: slope {selected['slope_deg']:.2f}° uses {sc}/{st} suspicious inputs; roughness {selected['roughness_m']:.3f} m uses {rc}/{rt}.",fontsize=11)
extent=(0,200,0,200)
for ax in axes.flat:
    ax.set(xlim=(0,200),ylim=(0,200),xlabel='East from crop edge (m)',ylabel='North from crop edge (m)')
    ax.set_aspect('equal')
    ax.set_xticks([0,100,200]);ax.set_yticks([0,100,200])
im=axes[0,0].imshow(z,extent=extent,origin='upper',cmap='terrain',interpolation='nearest')
axes[0,0].set_title('Delivered elevation',loc='left',fontweight='bold')
fig.colorbar(im,ax=axes[0,0],fraction=.045,pad=.03,label='Published elevation (m)')
axes[0,1].imshow(q==3,extent=extent,origin='upper',cmap=ListedColormap(['#dde6e7','#8056a3']),vmin=0,vmax=1,interpolation='nearest')
axes[0,1].set_title('Published stereo status',loc='left',fontweight='bold')
axes[0,1].legend(handles=[Patch(color='#dde6e7',label='Successful correlation (10–14)'),Patch(color='#8056a3',label='Suspicious (3)')],loc='lower left',fontsize=8,framealpha=.95)
for ax,data,title,unit in [(axes[1,0],slope,'Slope · 3 × 3 heights','Degrees'),(axes[1,1],rough,'Roughness · 5 × 5 heights','Height standard deviation (m)')]:
    padded=np.full(z.shape,np.nan);padded[2:-2,2:-2]=data
    im=ax.imshow(padded,extent=extent,origin='upper',cmap='viridis',interpolation='nearest')
    ax.set_title(title,loc='left',fontweight='bold')
    fig.colorbar(im,ax=ax,fraction=.045,pad=.03,label=unit)
r=a['selected']['height_cell_in_crop']['row']
c=a['selected']['height_cell_in_crop']['col']
x,y=(c+.5)*4,200-(r+.5)*4
for ax in axes.flat:
    ax.plot(x,y,'s',mec='white',mew=1.2,mfc='black',ms=5)
for n,style in [(3,'-'),(5,'--')]:
    axes[0,1].add_patch(Rectangle((x-n*2,y-n*2),n*4,n*4,fill=False,ec='#203239',lw=1.5,ls=style))
fig.text(.08,.05,'NASA/GSFC/Arizona State University · Quality codes preserved from CONF.IMG, not the stretched browse TIFF.',fontsize=9)
fig.text(.08,.025,'Illustrative status-diverse crop. No interpolation flags occur in this product; status does not quantify numerical error.',fontsize=9)
(root/'figures').mkdir(exist_ok=True)
fig.savefig(root/'figures/lroc-nassau02-sample.png',dpi=160)
plt.close(fig)
print(f'Independent calculations and support counts agree for all {slope.size} analysis cells. Figure saved.')
