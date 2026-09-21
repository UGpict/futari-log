import math,copy
from pathlib import Path
import xml.etree.ElementTree as E
project=Path(__file__).resolve().parents[1];repo=project.parents[2]
source=repo/'design/rive/planning-weather/tools/build_scene.py'
scope={'__file__':str(source),'characters':{}}
code=source.read_text().replace("    if kind!='weather': continue","    characters[kind]=__import__('copy').deepcopy(ch)\n    if kind!='weather': continue")
code='\n'.join(line for line in code.split('\n') if '.write_text(' not in line)
exec(code,scope)
el=scope['el'];node=scope['node'];rect=scope['rect'];ellipse=scope['ellipse'];path=scope['path']
root=E.Element('Rive',version='1',kind='fragment');ab=el('Artboard',root,width=600,height=420,name='Welcome flight',id='0:2',defaultStateMachineId='0:7',styleId='0:5');el('LayoutComponentStyle',ab,id='0:5')
# First child is front. Flight path is in front of the phone screen.
actors=[]
for i,kind in enumerate(['memo','weather','shop','plan','route']):
 outer=node(ab,kind+' flight',30+i,x=280,y=247,opacity=0,scaleX=.05,scaleY=.05)
 inner=node(outer,'Centered art',x=-360 if kind=='memo' else -80,y=-260 if kind=='memo' else -80)
 if kind=='memo':
  art=copy.deepcopy(E.parse(repo/'design/rive/futari-flight/scene.rml').getroot().find('Artboard').find('Node'))
 else:art=copy.deepcopy(scope['characters'][kind])
 for e in art.iter():e.attrib.pop('id',None)
 inner.append(art);actors.append((30+i,kind))
phone=node(ab,'Phone',x=258,y=248,rotation=-.10)
rect(phone,'Speaker',0,-96,27,5,'C9BCB9',3)
rect(phone,'Home indicator',0,100,35,4,'C9BCB9',2)
rect(phone,'Screen',0,0,112,166,'F5E8E2',15)
rect(phone,'White frame',0,0,130,224,'FFFDFA',22)
rect(phone,'Soft shadow',3,7,136,230,'E4D4D0',23)
# Simple screen content visible between takeoffs.
screen=phone[2]
# Static halo behind the phone.
ellipse(ab,'Warm backdrop',279,237,300,290,'F7E2D9')
anim=el('LinearAnimation',ab,name='Team takeoff',id='0:6',fps=60,duration=600,loopValue='loop')
def keys(id,prop,seq):
 obj=el('KeyedObject',anim,objectId=f'0:{id}');pr=el('KeyedProperty',obj,propertyKey=prop)
 for f,v in seq:el('KeyFrameDouble',pr,frame=f,value=round(v,5),interpolationType='linear')
def interp(t,points):
 for (a,v),(b,w) in zip(points,points[1:]):
  if t<=b:
   u=max(0,(t-a)/(b-a));u=u*u*(3-2*u);return v+(w-v)*u
 return points[-1][1]
for i,(id,kind) in enumerate(actors):
 delay=25+i*45;scale=.45 if kind=='memo' else .63
 seq={p:[] for p in [13,14,16,17,18,15]}
 for f in range(601):
  t=(f-delay)/240
  visible=0<=t<=1
  x=interp(t,[(0,258),(.32,198),(.58,350),(1,478)])
  y=interp(t,[(0,250),(.32,218),(.58,152),(1,62)])
  size=interp(t,[(0,.03),(.28,scale),(.5,scale),(1,.025)])
  opacity=interp(t,[(0,0),(.1,1),(.78,1),(1,0)]) if visible else 0
  for p,v in [(13,x),(14,y),(16,size),(17,size),(18,opacity),(15,interp(t,[(0,-.1),(.35,-.1),(.65,.10),(1,.15)]))]:seq[p].append((f,v))
 for p,vals in seq.items():keys(id,p,vals)
sm=el('StateMachine',ab,name='Welcome',id='0:7');layer=el('StateMachineLayer',sm,name='Launch')
el('AnyState',layer,x=0,y=-150);el('ExitState',layer,x=220,y=-150);entry=el('EntryState',layer,x=0,y=0);el('StateTransition',entry,stateToId='0:12');el('AnimationState',layer,id='0:12',animationId='0:6',x=220,y=0)
E.indent(root,space='  ');project.joinpath('scene.rml').write_text(E.tostring(root,encoding='unicode'))
