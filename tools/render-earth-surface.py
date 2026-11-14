"""Pre-render the Copernicus delivered surface (Python + NumPy + Matplotlib), coloured by the
product's declared origin: grey = not edited, orange = edited in the delivered mask.
Writes figures/copernicus-langtang-surface-{1,3}x.png, which build-standalone bundles as the
Earth delivery's 3D preview. This is a delivered-surface view, not an independent reference scene."""
import os
os.environ.setdefault('MPLCONFIGDIR', '/tmp/hallmark-matplotlib')
import io
import json
import sys
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
CHECK = '--check' in sys.argv
site = next((a for a in sys.argv[1:] if not a.startswith('--')), 'langtang')
_file = 'earth-data.js' if site == 'langtang' else f'earth-{site}-data.js'
_export = 'EARTH_DATA' if site == 'langtang' else f'EARTH_{site.upper()}_DATA'
earth = json.loads((ROOT/f'src/fixtures/{_file}').read_text().split(f'export const {_export} = ', 1)[1].strip().removesuffix(';'))

n = earth['W']; res = earth['res']; extent = n*res
z = np.array([np.nan if h is None else h for h in earth['heights']], dtype=float).reshape(n, n)
edm = np.array(earth['quality']['codes']).reshape(n, n)
observed = edm == 1                     # EDM 1 = not edited; not a complete observation history
x, y = np.meshgrid((np.arange(n)+.5)*res-extent/2, extent/2-(np.arange(n)+.5)*res)

# Illustrative north-west light on true-scale normals (presentation only, like the lunar previews).
south, east = np.gradient(z, res)
norm = np.sqrt(east*east + south*south + 1)
el, az = np.radians(35), np.radians(315)
lambert = np.maximum(0, (-east*np.sin(az)*np.cos(el) + south*np.cos(az)*np.cos(el) + np.sin(el))/norm)
grey = .34 + .60*np.sqrt(.12 + .88*lambert)

OBSERVED_RGB = np.array([0.97, 0.985, 1.0])     # near-neutral
FILLED_RGB = np.array([0.93, 0.62, 0.26])       # orange: edited according to EDM
base = np.where(observed[..., None], OBSERVED_RGB, FILLED_RGB)
colours = np.concatenate([grey[..., None]*base, np.ones((n, n, 1))], axis=-1)

filled = int((~observed).sum())


def save(path, content):
    target = ROOT/path
    if CHECK:
        assert target.read_bytes() == content, f'{path} must reproduce exactly'
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)


for scale in [1, 3]:
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.labelcolor': '#36454d', 'text.color': '#24343c'})
    fig = plt.figure(figsize=(10, 6.2), facecolor='white')
    ax = fig.add_axes([.02, .06, .96, .84], projection='3d', computed_zorder=False)
    ax.set_proj_type('ortho')
    ax.view_init(elev=32, azim=-58)
    ax.plot_surface(x, y, z, facecolors=colours, rstride=1, cstride=1, shade=False, linewidth=0, antialiased=False, zorder=2)
    low, high = float(np.nanmin(z)), float(np.nanmax(z))
    pad = max((high-low)*.08, .1)
    ax.set_xlim(-extent/2, extent/2); ax.set_ylim(-extent/2, extent/2); ax.set_zlim(low-pad, high+pad)
    relief_ratio = (high-low+2*pad)*scale/extent
    zoom = 1.16 if relief_ratio < .5 else .96 if relief_ratio < 1 else .80
    ax.set_box_aspect((extent, extent, (high-low+2*pad)*scale), zoom=zoom)
    ticks = np.linspace(-extent/2, extent/2, 5)
    ax.set_xticks(ticks); ax.set_yticks(ticks[1:])
    ax.set_zticks(np.linspace(low, high, 3))
    ax.set_zticklabels([f'{t:.0f}' for t in np.linspace(low, high, 3)])
    ax.set_xlabel('East (m)', labelpad=10); ax.set_ylabel('North (m)', labelpad=10); ax.set_zlabel('Height (m)', labelpad=9)
    ax.tick_params(labelsize=9, pad=2, colors='#52626b')
    for axis in [ax.xaxis, ax.yaxis, ax.zaxis]:
        axis.pane.fill = False
        axis.pane.set_edgecolor('#e1e6e8')
        axis._axinfo['grid'].update(color='#e4e9eb', linewidth=.5)
        axis.line.set_color('#aeb9be')
    fig.text(.07, .955, earth['title'].replace('· 30 m', '· delivered surface'), fontsize=17, weight='semibold')
    fig.text(.07, .912, f'{extent:.0f} × {extent:.0f} m · {n} × {n} delivered heights at ~{res:g} m · illustrative north-west light', fontsize=10, color='#52626b')
    fig.text(.07, .04, f'Vertical scale ×{scale}' + (' · true proportions' if scale == 1 else ' · relief exaggerated for visibility'), fontsize=10, weight='semibold')
    fig.text(.07, .012, f'Grey: not edited · orange: edited (external infill, interpolation, smoothing or water edits) ({filled:,} of {n*n:,} cells). Delivered surface, not independent ground truth.', fontsize=9, color='#52626b')
    out = io.BytesIO(); fig.savefig(out, format='png', dpi=160, facecolor='white'); plt.close(fig)
    save(f'figures/copernicus-{site}-surface-{scale}x.png', out.getvalue())

print(('Verified' if CHECK else 'Rendered') + f' Copernicus delivered-surface previews (1x, 3x); {filled} of {n*n} cells edited.')
