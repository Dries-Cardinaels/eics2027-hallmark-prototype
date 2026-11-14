"""Data figure, not a screenshot of the interface. Requires numpy and matplotlib."""
import os
os.environ.setdefault("MPLCONFIGDIR", "/tmp/hallmark-matplotlib")
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch, Rectangle

root = Path(__file__).resolve().parents[1]
data = json.loads((root/'src/fixtures/lunar-data.js').read_text().split('export const LUNAR_DATA = ',1)[1].strip().removesuffix(';'))
datasets = data['datasets']
values = np.array([d['heights'] for d in datasets], dtype=float)
lo, hi = np.nanmin(values), np.nanmax(values)
palette = ['#188890','#c88b1f','#f1d898','#e3e6e8']
focus=data['bookmarks'][0]['cell']
fig, axes = plt.subplots(2,3,figsize=(12,8),layout='constrained')
fig.suptitle('LunarBlock: recovered heights and actual gap filling',fontsize=18,fontweight='bold')
cmap = plt.get_cmap('cividis').copy()
cmap.set_bad('#e3e6e8')
for r,d in enumerate(datasets):
    a=d['acquisition']; n=d['W']
    before=np.array(a['matchedHeights'],dtype=float).reshape(n,n)
    after=np.array(d['heights'],dtype=float).reshape(n,n)
    origins=np.array([0 if o=='observed' else 3 if o=='absent' else 1 if a['reasons'][k]==1 else 2 for k,o in enumerate(d['origins'])]).reshape(n,n)
    for c,arr in enumerate([before,after,origins]):
        ax=axes[r,c]
        if c<2: image=ax.imshow(arr,cmap=cmap,vmin=lo,vmax=hi,interpolation='nearest')
        else: ax.imshow(arr,cmap=ListedColormap(palette),vmin=-.5,vmax=3.5,interpolation='nearest')
        ax.add_patch(Rectangle((focus['col']+1.5,focus['row']+1.5),1,1,fill=False,edgecolor='black',linewidth=1.5))
        ax.set_xticks(np.linspace(0,n-1,5,dtype=int)); ax.set_yticks(np.linspace(0,n-1,5,dtype=int))
        ax.set_xlabel('Height column')
        if c==0: ax.set_ylabel(f"{a['sunElevation_deg']}° sun\nHeight row",fontweight='bold')
        if r==0: ax.set_title(['Recovered by stereo','Delivered after filling','Origins and filling reasons'][c],fontsize=12)
        ax.tick_params(labelsize=9)
    axes[r,2].set_xlabel(f"{a['counts']['interpolated']} filled · {a['shadowFilled']} shadow-related",fontsize=10)
fig.colorbar(image,ax=axes[:,:2],orientation='horizontal',shrink=.7,aspect=40,label='Height relative to the shared local datum (m)')
axes[1,2].legend(handles=[Patch(facecolor=color,label=label) for color,label in zip(palette,['Observed: stereo match','Interpolated: too dark to match','Interpolated: other matching failure','Absent: outside coverage'])],loc='upper center',bbox_to_anchor=(.5,-.20),frameon=False,fontsize=9)
out=root/'figures/lunar-deliveries.png'
out.parent.mkdir(exist_ok=True)
fig.savefig(out,dpi=180)
print(out)
