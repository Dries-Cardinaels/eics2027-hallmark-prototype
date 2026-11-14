"""Scientific surface previews (Python + NumPy + Matplotlib); no browser renderer."""
import os
os.environ.setdefault('MPLCONFIGDIR', '/tmp/hallmark-matplotlib')
import base64
import hashlib
import gzip
import io
import json
from pathlib import Path
import subprocess
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

ROOT = Path(__file__).resolve().parents[1]
CHECK = '--check' in sys.argv
audit = json.loads((ROOT/'fixtures/lunar-audit.json').read_text())
lunar = json.loads((ROOT/'src/fixtures/lunar-data.js').read_text().split('export const LUNAR_DATA = ',1)[1].strip().removesuffix(';'))
# Controlled synthetic fixtures only: datasets delivered with a published quality layer (LROC,
# Copernicus) are previewed from their own pre-rendered surfaces in build-standalone, not here.
legacy = json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {DATASETS} from './src/fixtures/terrain.js';console.log(JSON.stringify(DATASETS.filter(d=>!d.acquisition && !d.quality)));"], cwd=ROOT))

# These are the ORIGINAL Three.js vertex/index buffers, including transformed instances.
scene = json.loads(gzip.decompress((ROOT/'fixtures/lunar-scene.json.gz').read_bytes()))
normal_tex = np.frombuffer(gzip.decompress((ROOT/'fixtures/lunar-detail-normals.bin.gz').read_bytes()), dtype=np.uint8).reshape(scene['detail']['job']['N'],scene['detail']['job']['N'],4)
mesh_faces=[]
for mesh in [scene['ground']]+scene['meshes']:
    v=np.array(mesh['positions']).reshape(-1,3)
    # Same translation as the original heightmap export; no fitted alignment.
    v=np.stack([v[:,0],-v[:,2],v[:,1]+scene['sceneToLocalHeight_m']],axis=-1)
    mesh_faces.append(v[np.array(mesh['indices']).reshape(-1,3)])
scene_faces=np.concatenate(mesh_faces)
scene_range=[float(scene_faces[:,:,2].min()),float(scene_faces[:,:,2].max())]

def draw_scene(ax, elevation=35, azimuth=315):
    # Original geometry, with small-feature normal texture sampled at face centres.
    # Scientific lighting is illustrative; it does not claim to reproduce WebGL materials.
    normals=np.cross(scene_faces[:,1]-scene_faces[:,0],scene_faces[:,2]-scene_faces[:,0])
    normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
    ground_n=len(mesh_faces[0]); centres=mesh_faces[0].mean(axis=1)
    N=normal_tex.shape[0]; area=scene['options']['area']
    cols=np.clip(((centres[:,0]/area+.5)*N).astype(int),0,N-1)
    rows=np.clip(((centres[:,1]/area+.5)*N).astype(int),0,N-1)
    detail=normal_tex[rows,cols,:3].astype(float)/127.5-1
    # Rotate tangent-space normals into an orthonormal frame on the ground triangles.
    n=normals[:ground_n]
    tangent=np.stack([1-n[:,0]*n[:,0],-n[:,0]*n[:,1],-n[:,0]*n[:,2]],axis=-1)
    tangent/=np.maximum(np.linalg.norm(tangent,axis=1,keepdims=True),1e-12)
    bitangent=np.cross(n,tangent)
    normals[:ground_n]=tangent*detail[:,0,None]+bitangent*detail[:,1,None]+n*detail[:,2,None]
    normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
    el,az=np.radians(elevation),np.radians(azimuth)
    light=normals@np.array([np.sin(az)*np.cos(el),np.cos(az)*np.cos(el),np.sin(el)])
    shade=.38+.54*np.maximum(0,light)**.6
    colours=np.stack([shade*.97,shade*.985,shade,np.ones_like(shade)],axis=-1)
    ax.add_collection3d(Poly3DCollection(scene_faces,facecolors=colours,edgecolors='none',antialiaseds=False))

def save(path, content):
    target = ROOT/path
    if CHECK:
        assert target.read_bytes() == content, f'{path} must reproduce exactly'
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)

def surface_hash(heights):
    # JSON null and an absent numerical height have the same canonical NaN representation.
    return hashlib.sha256(np.asarray(heights,dtype='<f8').tobytes()).hexdigest()

def compare_surfaces(dataset, truth, scale, sampled=False):
    n=dataset['W'];res=dataset['res'];extent=n*res
    actual=np.array(truth,dtype=float).reshape(n,n)
    delivered=np.array(truth if sampled else dataset['heights'],dtype=float).reshape(n,n)
    finite=np.isfinite(delivered)
    is_lunar='acquisition' in dataset
    bounds=scene_range if is_lunar else [float(actual.min()),float(actual.max())]
    low=min(bounds[0],float(np.nanmin(delivered)))
    high=max(bounds[1],float(np.nanmax(delivered)))
    pad=max((high-low)*.08,.1)
    x,y=np.meshgrid((np.arange(n)+.5)*res-extent/2,extent/2-(np.arange(n)+.5)*res)
    fig=plt.figure(figsize=(14,7.2),facecolor='white')
    is_lunar='acquisition' in dataset
    name=f'LunarBlock · {dataset["acquisition"]["sunElevation_deg"]}° acquisition sun' if is_lunar else dataset['title']
    fig.text(.045,.95,name,fontsize=18,weight='semibold')
    fig.text(.045,.905,f'{extent:g} × {extent:g} m · '+(f'seed {scene["options"]["seed"]} · ' if is_lunar else '')+f'{n} × {n} heights at {res:g} m · shared viewpoint and scale',fontsize=11,color='#52626b')
    titles=['Terrain · spires excluded','Sampled heightmap' if sampled else 'Delivered heightmap'] if is_lunar else ['Defined surface (controlled test)','Delivered heightmap']
    for j,z in enumerate([actual,delivered]):
        ax=fig.add_axes([.015+j*.5,.16,.47,.65],projection='3d')
        ax.set_proj_type('ortho');ax.view_init(elev=32,azim=-58)
        # Omit whole faces that need any absent vertex. Never bridge missing heights.
        vertices=np.stack([x,y,z],axis=-1)
        faces=np.stack([vertices[:-1,:-1],vertices[:-1,1:],vertices[1:,1:],vertices[1:,:-1]],axis=2)
        valid=np.isfinite(faces).all(axis=(2,3))
        east=((z[:-1,1:]+z[1:,1:])-(z[:-1,:-1]+z[1:,:-1]))/(2*res)
        north=((z[:-1,:-1]+z[:-1,1:])-(z[1:,:-1]+z[1:,1:]))/(2*res)
        # Both panels use the same illustrative northwest light on true-scale normals.
        el=np.radians(35);az=np.radians(315)
        light=(-east*np.sin(az)*np.cos(el)-north*np.cos(az)*np.cos(el)+np.sin(el))/np.sqrt(east*east+north*north+1)
        shade=.38+.54*np.maximum(0,light[valid])**.6
        colours=np.stack([shade*.97,shade*.985,shade,np.ones_like(shade)],axis=-1)
        if is_lunar and j==0: draw_scene(ax)
        else: ax.add_collection3d(Poly3DCollection(faces[valid],facecolors=colours,edgecolors='none',antialiaseds=False))
        ax.set_xlim(-extent/2,extent/2);ax.set_ylim(-extent/2,extent/2);ax.set_zlim(low-pad,high+pad)
        ratio=(high-low+2*pad)*scale/extent
        ax.set_box_aspect((extent,extent,(high-low+2*pad)*scale),zoom=1.08 if ratio<.5 else .9 if ratio<1 else .74)
        ticks=np.linspace(-extent/2,extent/2,5)
        ax.set_xticks(ticks);ax.set_yticks(ticks[1:]);ax.set_zticks(np.linspace(low,high,3))
        ax.set_zticklabels([f'{t:.1f}' for t in np.linspace(low,high,3)])
        ax.set_xlabel('East (m)',labelpad=8);ax.set_ylabel('North (m)',labelpad=8);ax.set_zlabel('Height (m)',labelpad=7)
        ax.tick_params(labelsize=8,pad=1,colors='#52626b')
        for axis in [ax.xaxis,ax.yaxis,ax.zaxis]:
            axis.pane.fill=False;axis.pane.set_edgecolor('#e1e6e8')
            axis._axinfo['grid'].update(color='#e4e9eb',linewidth=.5);axis.line.set_color('#aeb9be')
        fig.text(.075+j*.5,.825,titles[j],fontsize=14,weight='semibold')
    mae=float(np.mean(np.abs(delivered[finite]-actual[finite])))
    counts={origin:dataset['origins'].count(origin) for origin in ['observed','interpolated','undocumented','absent']}
    fig.text(.045,.095,f'Vertical scale ×{scale}'+(' · true proportions' if scale==1 else ' · same exaggeration in both panels'),fontsize=11,weight='semibold')
    fig.text(.545,.095,'Original heightmap builder · Gaussian σ = 1.5 m' if sampled else f'MAE against sampled reference: {mae:.3f} m',fontsize=10)
    if is_lunar:
        fig.text(.045,.055,'Original ground mesh, rocks and pebbles; shared local height datum.',fontsize=10,color='#52626b')
        fig.text(.545,.055,'Before stereo observation and gap filling.' if sampled else f'{counts["observed"]:,} matched · {counts["interpolated"]:,} filled · {counts["absent"]:,} absent',fontsize=10,color='#52626b')
    else:
        fig.text(.045,.055,'Controlled fixture: origins are assigned; there is no simulated reconstruction.',fontsize=10,color='#52626b')
    fig.text(.045,.02,'Gaps on the right omit faces that require an absent height. Illumination here is illustrative, separate from acquisition sunlight.',fontsize=9,color='#52626b')
    out=io.BytesIO();fig.savefig(out,format='png',dpi=160,facecolor='white');plt.close(fig)
    return out.getvalue(),{'deliveredHash':surface_hash(dataset['heights']),'heightRange_m':[low,high],
        'missingHeights':int((~finite).sum()),'meanAbsoluteError_m':mae,'suppliedHeights':int(finite.sum())}

records = []
sources = [(d, audit['truth']) for d in lunar['datasets']] + [(d, legacy[0]['heights']) for d in legacy]
for dataset, heights in sources:
    n = dataset['W']; res = dataset['res']; extent = n*res
    z = np.array(heights).reshape(n,n)
    x, y = np.meshgrid((np.arange(n)+.5)*res-extent/2, extent/2-(np.arange(n)+.5)*res)
    # Illumination uses unexaggerated normals and acquisition shadow coverage. Vertical
    # exaggeration changes presentation geometry only, never sunlight or the reference heights.
    south, east = np.gradient(z, res)
    nx, ny, nz = -east, south, np.ones_like(z)
    norm = np.sqrt(nx*nx+ny*ny+nz*nz)
    is_lunar = 'terrain' in dataset
    elevation = dataset['terrain']['sunElevation_deg'] if is_lunar else 35
    azimuth = 270 if is_lunar else 315
    el, az = np.radians(elevation), np.radians(azimuth)
    lambert = np.maximum(0,(nx*np.sin(az)*np.cos(el)+ny*np.cos(az)*np.cos(el)+nz*np.sin(el))/norm)
    shadow = np.array(dataset['terrain']['shadowFraction']).reshape(n,n) if is_lunar else np.zeros_like(z)
    grey = .34 + .60*np.sqrt((.12+.88*lambert)*(1-.88*shadow))
    colours = np.stack([grey*.97,grey*.985,grey,np.ones_like(grey)],axis=-1)
    title = 'LunarBlock terrain · spires excluded' if is_lunar else 'Controlled example surface'
    lighting = f'Seed {scene["options"]["seed"]} · illustrative {elevation}° western light' if is_lunar else 'Illustrative lighting; no acquisition simulation'
    images = {}; comparisons = {}; sampled_images = {}
    for scale in [1,3]:
        plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.labelcolor':'#36454d','text.color':'#24343c'})
        fig = plt.figure(figsize=(10,6.2), facecolor='white')
        ax = fig.add_axes([.02,.06,.96,.84], projection='3d',computed_zorder=False)
        ax.set_proj_type('ortho')
        ax.view_init(elev=32, azim=-58)
        if is_lunar: draw_scene(ax,elevation,azimuth)
        else: ax.plot_surface(x,y,z,facecolors=colours,rstride=1,cstride=1,shade=False,linewidth=0,antialiased=False,zorder=2)
        low, high = scene_range if is_lunar else [float(z.min()),float(z.max())]
        pad = max((high-low)*.08,.1)
        ax.set_xlim(-extent/2,extent/2);ax.set_ylim(-extent/2,extent/2);ax.set_zlim(low-pad,high+pad)
        relief_ratio=(high-low+2*pad)*scale/extent
        zoom=1.16 if relief_ratio<.5 else .96 if relief_ratio<1 else .80
        ax.set_box_aspect((extent,extent,(high-low+2*pad)*scale),zoom=zoom)
        ticks = np.linspace(-extent/2,extent/2,5)
        # Omit the duplicated near-corner north tick to avoid colliding axis labels.
        ax.set_xticks(ticks);ax.set_yticks(ticks[1:])
        ax.set_zticks(np.linspace(low,high,3))
        ax.set_zticklabels([f'{t:.1f}' for t in np.linspace(low,high,3)])
        ax.set_xlabel('East (m)', labelpad=10);ax.set_ylabel('North (m)',labelpad=10);ax.set_zlabel('Height (m)',labelpad=9)
        ax.tick_params(labelsize=9,pad=2,colors='#52626b')
        for axis in [ax.xaxis,ax.yaxis,ax.zaxis]:
            axis.pane.fill=False
            axis.pane.set_edgecolor('#e1e6e8')
            axis._axinfo['grid'].update(color='#e4e9eb',linewidth=.5)
            axis.line.set_color('#aeb9be')
        fig.text(.07,.955,title,fontsize=17,weight='semibold')
        fig.text(.07,.912,f'{extent:g} × {extent:g} m · '+(f'{scene["geometry"]["groundVertices"]:,} ground vertices · ' if is_lunar else f'{n} × {n} reference heights · ')+lighting,fontsize=10,color='#52626b')
        fig.text(.07,.04,f'Vertical scale ×{scale}'+(' · true proportions' if scale==1 else ' · relief exaggerated for visibility'),fontsize=10,weight='semibold')
        fig.text(.07,.012,f'{scene["geometry"]["rockMeshes"]} rocks · {scene["geometry"]["pebbleMeshes"]} pebbles · original geometry and detail normals · neutral materials' if is_lunar else 'Closed-form test fixture; assigned origin labels are not simulated acquisition records.',fontsize=9,color='#52626b')
        out=io.BytesIO();fig.savefig(out,format='png',dpi=160,facecolor='white');plt.close(fig)
        content=out.getvalue()
        save(f'figures/{dataset["id"]}-3d-{scale}x.png',content)
        images[str(scale)]='data:image/png;base64,'+base64.b64encode(content).decode('ascii')
        comparison, comparison_metadata=compare_surfaces(dataset,heights,scale)
        save(f'figures/{dataset["id"]}-comparison-{scale}x.png',comparison)
        comparisons[str(scale)]='data:image/png;base64,'+base64.b64encode(comparison).decode('ascii')
        if is_lunar:
            sampled_png,_=compare_surfaces(dataset,heights,scale,sampled=True)
            save(f'figures/{dataset["id"]}-sampled-{scale}x.png',sampled_png)
            sampled_images[str(scale)]='data:image/png;base64,'+base64.b64encode(sampled_png).decode('ascii')
    records.append({'id':dataset['id'],'title':dataset['title'],'W':n,'H':n,'res':res,'extent_m':extent,
        'sourceHash':scene['sceneHash'] if is_lunar else surface_hash(heights),
        'sampledHash':surface_hash(heights),
        'heightRange_m':scene_range if is_lunar else [float(z.min()),float(z.max())], 'kind':'simulated-reference' if is_lunar else 'controlled-reference',
        'caption':f'{title}. {lighting}. Original generated mesh, rock instances and small-feature normal field; scientific rendering with neutral materials. Rover and decorative base omitted. View controls do not change the assessment.' if is_lunar else f'{title}. This is the older hand-labelled test fixture. Choose a LunarBlock delivery above to preview the simulated terrain.',
        'images':images,'sampled':sampled_images,'comparisons':comparisons,'comparison':comparison_metadata})
module = '// Generated by tools/generate-previews.py; reference surface figures, not assessment inputs.\nexport const TERRAIN_PREVIEWS = '+json.dumps(records,separators=(',',':'))+';\n'
save('src/fixtures/terrain-previews.js',module.encode())
print(('Verified' if CHECK else 'Generated')+f' {len(records)*4+len(lunar['datasets'])*2} scientific terrain figures and the embedded preview bundle.')
