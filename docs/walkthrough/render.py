from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json,textwrap
ROOT=Path(__file__).parent; D=json.loads((ROOT/'data.json').read_text()); (ROOT/'frames').mkdir(exist_ok=True)
BG='#f1f5f4'; INK='#20363d'; MUT='#5f737b'; PUR='#8056a3'; TEAL='#336981'; AMBER='#bd821c'; LINE='#cedbdd'
FONT='/System/Library/Fonts/Helvetica.ttc'
def font(n): return ImageFont.truetype(FONT,n)
def txt(x,y,t,n=26,c=INK): draw.text((x,y),t,font=font(n),fill=c)
def wrap(x,y,t,width,n=26,c=INK):
 words=t.split(); lines=[]; line=''
 for w in words:
  trial=(line+' '+w).strip()
  if draw.textlength(trial,font=font(n))>width and line: lines.append(line);line=w
  else:line=trial
 if line:lines.append(line)
 for l in lines:txt(x,y,l,n,c);y+=n+9
 return y

def box(x,y,w,h,fill='white',outline=LINE):draw.rounded_rectangle((x,y,x+w,y+h),radius=16,fill=fill,outline=outline,width=2)
def badge(x,y,t,c=TEAL):
 w=draw.textlength(t,font=font(22))+28;draw.rounded_rectangle((x,y,x+w,y+36),radius=7,fill=c);txt(x+14,y+4,t,22,'white')
def graph(active):
 names=['Heights','Slope','Slope criterion','Roughness','Roughness criterion','Combined']
 positions={'Heights':(70,184),'Slope':(355,154),'Slope criterion':(655,154),'Roughness':(355,214),'Roughness criterion':(655,214),'Combined':(990,184)}
 for a,b in [('Heights','Slope'),('Heights','Roughness'),('Slope','Slope criterion'),('Roughness','Roughness criterion'),('Slope criterion','Combined'),('Roughness criterion','Combined')]:
  x,y=positions[a];xx,yy=positions[b];draw.line((x+240,y+23,xx-12,yy+23),fill=LINE,width=3);draw.polygon([(xx-12,yy+23),(xx-23,yy+17),(xx-23,yy+29)],fill=MUT)
 for name,(x,y) in positions.items():
  on=name==active;draw.rounded_rectangle((x,y,x+240,y+46),radius=8,fill=INK if on else 'white',outline=TEAL if on else LINE,width=2);txt(x+12,y+9,name,22,'white' if on else INK)
 txt(1300,170,'One location · separate branches',24);txt(1300,207,'Select a step to inspect its support',22,MUT)

def map_panel(x,node,evidence,select=True,footprint=False):
 y=355;s=9;side=450
 txt(x,y-48,'Evidence · flagged input count' if evidence else 'Result · criterion outcomes',24)
 records=D['records'][node]
 for r in range(50):
  for c in range(50):
   fill='#edf0f1'
   if 2<=r<48 and 2<=c<48:
    rec=records[(r-2)*46+c-2]
    if evidence:
     n=rec['suspicious'];cap=8 if node=='slope-criterion' else 25;t=n/cap
     fill='#e4eaeb' if n==0 else tuple(round(a+(b-a)*t) for a,b in zip((238,229,245),(99,53,139)))
    else:
     outcomes=rec.get('outcomes');ex='exceeded' in outcomes.values() if outcomes else rec['outcome']=='exceeded'
     missing='unavailable' in outcomes.values() if outcomes else rec['outcome']=='unavailable'
     fill='#ae4d86' if ex else '#fff' if missing else '#e4eaeb'
   draw.rectangle((x+c*s,y+r*s,x+(c+1)*s-1,y+(r+1)*s-1),fill=fill)
 for k in [0,8,16,24,32,40,49]:txt(x+k*s-4,y-24,str(k),16,MUT)
 draw.rectangle((x+18,y+18,x+432,y+432),outline=MUT,width=1)
 if footprint:
  src={(v['row'],v['col']) for v in D['queries'][node]['sourceCells']}
  for r,c in src:
   for dr,dc in [(-1,0),(1,0),(0,-1),(0,1)]:
    if (r+dr,c+dc) in src:continue
    xa,ya=x+c*s,y+r*s
    seg=(xa,ya,xa+s,ya) if dr==-1 else (xa,ya+s,xa+s,ya+s) if dr==1 else (xa,ya,xa,ya+s) if dc==-1 else (xa+s,ya,xa+s,ya+s)
    draw.line(seg,fill=TEAL,width=3)
 if select:
  cx=x+37*s;cy=y+19*s;draw.rectangle((cx-2,cy-2,cx+s+2,cy+s+2),outline='white',width=3);draw.rectangle((cx,cy,cx+s,cy+s),outline=INK,width=2)
 txt(x,830,'Count of suspicious supporting heights' if evidence else 'Pale: met   Magenta: unmet',20,MUT)
 txt(x,860,'Not a confidence or error score' if evidence else 'Blue: source-height footprint' if footprint else 'Illustrative limits; not a safety verdict',20,MUT)
 if evidence and select:
  q=D['queries'][node];badge(x,901,f"Selected evidence count: {q['quality']['suspicious']}",PUR)

def grid(q,x=1260,y=470):
 src={v['index']:v for v in q['sourceCells']};s=89
 allsrc=D['queries']['roughness-criterion']['sourceCells']
 for v in allsrc:
  r,c=v['row'],v['col'];xx=x+(c-35)*s;yy=y+(r-17)*s;used=v['index'] in src;flag=used and v['quality']['code']==3
  fill='#f0e6f7' if flag else 'white' if used else '#edf0f1'
  draw.rounded_rectangle((xx,yy,xx+s-4,yy+s-4),radius=6,fill=fill,outline=PUR if flag else LINE,width=3 if flag else 1)
  txt(xx+5,yy+27,f"{v['height']:.3f}",17,INK if used else MUT)
  if flag:txt(xx+6,yy+60,'Suspicious',15,PUR)
  elif not used:txt(xx+14,yy+60,'Not used',15,MUT)
  if r==19 and c==37:draw.rounded_rectangle((xx+1,yy+1,xx+s-5,yy+s-5),radius=6,outline=INK,width=3)
 for k in range(5):txt(x+k*s+35,y-28,str(k+35),18,MUT);txt(x-30,y+k*s+32,str(k+17),18,MUT)

def scene_base(i,title,sub,active):
 global im,draw
 im=Image.new('RGB',(1920,1080),BG);draw=ImageDraw.Draw(im)
 txt(44,26,'HALLMARK',25,TEAL);txt(240,26,'Supervisor walkthrough',25,MUT);txt(1680,26,f'{i:02d} / 10',24,MUT)
 txt(44,72,title,40);txt(44,124,sub,23,MUT)
 graph(active);draw.line((40,270,1880,270),fill=LINE,width=2)

def bottom(action):
 draw.rectangle((0,976,1920,1080),fill=INK);wrap(44,990,action,1820,26,'white')
 txt(44,1051,'Explanatory storyboard · evaluated prototype data · not a live screen recording',18,'#c9d9dd')

scenes=[
('Read the assessment and its evidence together','LROC Nassau02 · native 4 m posts · demonstration limits: slope 4.5°, roughness 0.5 m','Combined','Start with the configured assessment; keep supporting evidence visible. A met criterion alone is not an approval to proceed.'),
('Select one location in either map','Shared selection: height-grid row 19, column 37','Combined','Select a candidate location. Both maps and the inspector refer to the same result location.'),
('Inspect the roughness criterion','Use the processing graph to select Roughness criterion','Roughness criterion','The criterion is met: 0.315 m ≤ 0.5 m. Its supporting evidence remains attached to that outcome.'),
('Read the selected evidence count','One evidence-map cell summarises the inputs for one result','Roughness criterion','The selected evidence cell shows 6: six of the 25 supporting heights carry the published suspicious flag.'),
('Identify the six original flagged heights','The inspector shows source heights, not neighbouring evidence counts','Roughness criterion','These 25 original heights produce the roughness value. Their flags produce the evidence count. The count is not a numerical input.'),
('Compare the slope branch at the same location','Select Slope criterion; the location stays fixed','Slope criterion','Slope uses eight neighbours, excluding the centre. Three of those inputs are suspicious; the displayed slope is 3.19°.'),
('Return to Combined without losing either branch','Shared source heights are counted once in the combined evidence','Combined','Both criteria are met here. Combined retains six unique suspicious heights—not the sum 3 + 6, because the branches overlap.'),
('Keep production history separate from quality','LROC flags and LunarBlock interpolation answer different questions','Heights','Do not convert suspicious into interpolated, or successful correlation into observed. Report the metadata that was actually supplied.'),
('Use the evidence to guide review','Hallmark exposes dependencies; a supervisor still judges acceptability','Combined','Review the flagged sources and relevant context before relying on the result. A flag count cannot quantify error or prove a changed outcome.'),
('Explain the contribution in the paper','Result → retained evidence → original sources → branch comparison','Combined','Hallmark keeps source evidence attached through calculation, thresholding and combination. This is a proposed supervisory workflow, not a validated planning procedure.')]
for i,(title,sub,active,action) in enumerate(scenes,1):
 scene_base(i,title,sub,active)
 if i<=7:
  node='slope-criterion' if i==6 else 'roughness-criterion' if 3<=i<=5 else 'combined'
  box(35,286,1030,670);box(1085,286,800,670)
  map_panel(65,node,True,i>1);map_panel(575,node,False,i>1,3<=i<=6)
  q=D['queries'][node];txt(1115,310,'Selected result · (19, 37)' if i>1 else 'What the supervisor asks',27)
  if i in [3,4,5,6]:
   slope=i==6;v=q['value'];lim=4.5 if slope else .5;unit='°' if slope else ' m'
   txt(1115,354,f"{v:.2f}{unit} ≤ {lim}{unit} · criterion met" if slope else f"{v:.3f} m ≤ 0.5 m · criterion met",29)
   txt(1115,397,f"{q['quality']['suspicious']}/{q['quality']['total']} supporting heights flagged suspicious",23,PUR)
   grid(q)
   if i==4:draw.rounded_rectangle((58,894,485,943),radius=8,outline=PUR,width=4)
   if i==5:draw.rounded_rectangle((1246,458,1718,926),radius=9,outline=TEAL,width=4)
  else:
   yy=375
   for head,body in ([('Does it meet the criteria?','Read the calculated assessment on the right.'),('What supports it?','Read the evidence map on the left.'),('What needs review?','Select a result, then inspect its original heights.')] if i==1 else [('Slope','3.19° ≤ 4.5° · met\n3/8 supporting heights suspicious'),('Roughness','0.315 m ≤ 0.5 m · met\n6/25 supporting heights suspicious'),('Combined','Both criteria met\n6/25 unique supporting heights suspicious')]):
    txt(1120,yy,head,30);yy+=48
    for line in body.split('\n'):yy=wrap(1120,yy,line,700,27,MUT)
    yy+=36
   if i==7:badge(1120,900,'Shared inputs are not independent evidence',TEAL)
 elif i==8:
  box(55,310,880,615);box(985,310,880,615)
  txt(90,350,'LROC · published stereo quality',34);badge(90,420,'Suspicious quality flag',PUR)
  wrap(90,490,'6 of 25 inputs at the selected location carry code 3. This records a stereo-quality status.',790,30)
  wrap(90,640,'Individual filling history is unavailable. These flags do not identify which heights were interpolated.',790,29,MUT)
  txt(1020,350,'LunarBlock · declared production history',32);badge(1020,420,'Interpolated height',AMBER)
  n=D['lunar']['query']['origin']['counts']['interpolated']
  wrap(1020,490,f'A separate example has {n}/25 roughness inputs declared interpolated after bounded gap filling.',790,30)
  wrap(1020,640,'This is a different dataset and location. Its production record supports the interpolation label.',790,29,MUT)
 else:
  cards=([('1 · Assess','Check the configured criterion and the selected result.'),('2 · Inspect','Use evidence counts to locate dependencies worth reviewing.'),('3 · Review','Inspect original flags, production history and both branches.'),('4 · Decide outside Hallmark','Seek corroboration, reconsider the candidate, or document acceptance.')] if i==9 else [('Numerical result','A calculation and a threshold produce an outcome.'),('Retained evidence','Source metadata remains attached through later steps.'),('Inspectable support','The supervisor can identify the actual source heights.'),('Bounded claim','Dependency disclosure is not an error estimate or a safety guarantee.')])
  for j,(h,b) in enumerate(cards):
   x=55+(j%2)*930;y=310+(j//2)*305;box(x,y,880,275);txt(x+30,y+35,h,33);wrap(x+30,y+100,b,810,30,MUT)
 bottom(action);im.save(ROOT/'frames'/f'{i:02d}.png')
# Portable slide-by-slide script and timing manifest.
durations=[8,8,10,10,12,10,10,12,10,10]
with open(ROOT/'frames.txt','w') as f:
 for i,d in enumerate(durations,1):f.write(f"file 'frames/{i:02d}.png'\nduration {d}\n")
 f.write("file 'frames/10.png'\n")
contact=Image.new('RGB',(1920,1080),'white')
for i in range(10):
 pic=Image.open(ROOT/'frames'/f'{i+1:02d}.png');pic.thumbnail((480,270));contact.paste(pic,((i%4)*480,(i//4)*270))
contact.save(ROOT/'storyboard.png')
with open(ROOT/'walkthrough.md','w') as f:
 f.write('# Hallmark: proposed supervisory walkthrough\n\nCaptioned explanatory video; data are evaluated by the current prototype, not a screen recording. Limits are illustrative. No operator study is claimed.\n\n')
 t=0
 for i,((title,sub,active,action),dur) in enumerate(zip(scenes,durations),1):
  f.write(f'## {i:02d} · {t:02d}–{t+dur:02d} seconds · {title}\n\n{sub}.\n\n{action}\n\n');t+=dur
 f.write('## Suggested paper wording\n\nA supervisor first examines a candidate location in the combined assessment, alongside a map of its retained source evidence. Selecting a criterion reveals its numerical comparison and the original heights supporting it. At the illustrated LROC location, roughness meets the configured 0.5 m limit (0.315 m), while six of its 25 supporting heights carry the published suspicious stereo flag. Inspection of the slope branch exposes a different support set: eight neighbours, three flagged, yielding 3.19° against an illustrative 4.5° limit. The combined record deduplicates shared sources rather than treating the two branches as independent observations. This supports scrutiny of the result’s dependencies; it does not estimate numerical error or establish operational safety.\n\n## Paper alignment notes\n\nThe current worked-example.tex still describes a nine-cell declared slope support and a nine-cell verification case. The implemented Horn slope support now excludes the centre and includes eight inputs. Update that passage before claiming the paper describes this exact trace. The paper’s constructed 7.1° example and this LROC example are different cases, not interchangeable measurements. The document has not been edited by this task.\n\nThe proposed supervisor sequence is a design rationale, not an empirically validated workflow. Counts measure flagged dependencies, not confidence, equal numerical influence, or probability of error. LROC quality status must not be relabelled as observed/interpolated. LunarBlock is the separate production-history demonstration.\n')
