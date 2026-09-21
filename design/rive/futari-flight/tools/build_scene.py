import math
from pathlib import Path
import xml.etree.ElementTree as E
def el(tag,p,**kw): return E.SubElement(p,tag,{k:str(v) for k,v in kw.items()})
def node(p,name,id=None,**kw):
    if id: kw['id']=f'0:{id}'
    return el('Node',p,name=name,**kw)
def paint(s,color,stroke=None):
    p=el('Stroke',s,thickness=stroke,cap='round',join='round',name='Ink') if stroke else el('Fill',s,name='Fill')
    el('SolidColor',p,colorValue='FF'+color,name='Color')
def ellipse(p,name,x,y,w,h,col):
    s=el('Shape',p,name=name,x=x,y=y);el('Ellipse',s,width=w,height=h,originX=.5,originY=.5);paint(s,col);return s
def rect(p,name,x,y,w,h,col,r=5):
    s=el('Shape',p,name=name,x=x,y=y);el('Rectangle',s,width=w,height=h,originX=.5,originY=.5,cornerRadiusTL=r);paint(s,col);return s
def path(p,name,start,segs,col,stroke=None,closed=False):
    s=el('Shape',p,name=name);q=el('PointsPath',s,isClosed=str(closed).lower());pts=[start]+[seg[2] for seg in segs]
    if closed and pts[-1]==pts[0]: pts.pop()
    for i,pt in enumerate(pts):
        incoming=segs[i-1][1] if i else (segs[-1][1] if closed else pt)
        outgoing=segs[i][0] if i<len(segs) else pt
        def handle(h):return math.atan2(h[1]-pt[1],h[0]-pt[0]),math.hypot(h[0]-pt[0],h[1]-pt[1])
        ir,di=handle(incoming);orr,do=handle(outgoing)
        el('CubicDetachedVertex',q,x=pt[0],y=pt[1],inRotation=ir,inDistance=di,outRotation=orr,outDistance=do)
    paint(s,col,stroke);return s

import re
project=Path(__file__).resolve().parents[1]
repo=project.parents[2]
svg=E.parse(repo/'design/hero/futari-flying.svg').getroot()
root=E.Element('Rive',version='1',kind='fragment')
ab=el('Artboard',root,width=720,height=520,name='Futari Flight',id='0:2',defaultStateMachineId='0:7',styleId='0:5')
el('LayoutComponentStyle',ab,id='0:5')
def tag(e):return e.tag.split('}')[-1]
defs={e.get('id'):e for e in svg.iter() if e.get('id')}
flight=node(ab,'Flight',20)
serial=200
trails=[]
arm_nodes=[]
particles=[]
gradients=[]
def convert(e,parent):
    global serial
    t=tag(e);a=dict(e.attrib)
    if t=='defs':return
    if t=='g':
        # Rotation around the approved illustration's body center.
        pivot=node(parent,'Flight pose',x=371,y=235,rotation=math.radians(18))
        inner=node(pivot,'Pose contents',x=-371,y=-235)
        for c in reversed(list(e)):convert(c,inner)
        return
    if t=='use':
        shape=defs[a['href'][1:]];a={**shape.attrib,**a};t='path'
    if t not in ['path','ellipse','circle']:return
    if t=='path' and a['d'].count('M')>1:
        for d in re.findall(r'M[^M]+',a['d']):convert(E.Element('path',{**a,'d':d}),parent)
        return
    serial+=1
    n=node(parent,'Artwork',serial,opacity=float(a.get('opacity',1)))
    d=a.get('d','')
    if d.startswith('M279 238') or a.get('cx')=='286':arm_nodes.append((serial,'bent'))
    if d.startswith('M459 211') or a.get('cx')=='505':arm_nodes.append((serial,'forward'))
    if parent is flight and (a.get('cx')=='249' or d.startswith('M524') or d.startswith('M517')):particles.append(serial)
    if parent is flight and t=='path' and 'trail' in a.get('stroke',''):
        trails.append(serial)
    if t=='path':
        tokens=re.findall(r'[MLCZ]|-?\d*\.?\d+',a['d']);i=0;start=None;segs=[];pos=None;closed=False
        while i<len(tokens):
            op=tokens[i];i+=1
            if op=='M':pos=(float(tokens[i]),float(tokens[i+1]));i+=2;start=pos
            elif op=='L':end=(float(tokens[i]),float(tokens[i+1]));i+=2;segs.append((pos,end,end));pos=end
            elif op=='C':v=list(map(float,tokens[i:i+6]));i+=6;segs.append(((v[0],v[1]),(v[2],v[3]),(v[4],v[5])));pos=(v[4],v[5])
            elif op=='Z':
                if pos!=start:segs.append((pos,start,start))
                closed=True
            else:raise ValueError(op)
        s=path(n,'Vector',start,segs,'25272B',closed=closed)
    else:
        s=ellipse(n,'Round detail',float(a['cx']),float(a['cy']),2*float(a.get('rx',a.get('r',0))),2*float(a.get('ry',a.get('r',0))),'25272B')
    for c in list(s):
        if c.tag in ['Fill','Stroke']:s.remove(c)
    def addpaint(kind,col,width=None,opacity=1):
        kw={'thickness':width,'cap':'round','join':'round'} if kind=='Stroke' else {}
        p=el(kind,s,**kw)
        if col.startswith('url'):
            gdef=defs[col[5:-1]]
            g=el('LinearGradient',p,startX=gdef.get('x1'),startY=gdef.get('y1'),endX=gdef.get('x2'),endY=gdef.get('y2'),opacity=opacity)
            if col=='url(#rainbow)':
                gid=1000+len(gradients);g.set('id',f'0:{gid}');gradients.append(gid)
            for st in gdef:
                alpha=round(255*float(st.get('stop-opacity',1)))
                el('GradientStop',g,position=float(st.get('offset',0)),colorValue=f'{alpha:02X}'+st.get('stop-color')[1:])
        else:el('SolidColor',p,colorValue=f'{round(255*opacity):02X}'+col[1:])
    if a.get('fill','none')!='none':addpaint('Fill',a['fill'])
    if a.get('stroke'):
        width=float(a.get('stroke-width',1))
        if a.get('filter')=='url(#glow)':
            # Soft concentric translucent native strokes replace SVG Gaussian blur.
            for extra,alpha in [(22,.025),(12,.04),(4,.07)]:addpaint('Stroke',a['stroke'],width+extra,alpha)
        else:addpaint('Stroke',a['stroke'],width)
for e in reversed(list(svg)):convert(e,flight)
anim=el('LinearAnimation',ab,name='Flying',id='0:6',fps=60,duration=240,loopValue='loop')
def keys(id,prop,values):
    obj=el('KeyedObject',anim,objectId=f'0:{id}');pr=el('KeyedProperty',obj,propertyKey=prop)
    for frame,value in values:el('KeyFrameDouble',pr,frame=frame,value=round(value,5),interpolationType='linear')
keys(20,13,[(f,2*math.sin(2*math.pi*f/120)) for f in range(241)])
keys(20,14,[(f,3*math.sin(2*math.pi*f/120)) for f in range(241)])
for j,id in enumerate(trails):
    vals=[(f,((f/40+j/3)%1)) for f in range(241)]
    keys(id,13,[(f,-65*t) for f,t in vals]);keys(id,14,[(f,55*t) for f,t in vals])
    keys(id,18,[(f,math.sin(math.pi*t)**2*.8) for f,t in vals])
# Subtle arm strokes stay attached visually, including their round fingertips.
for id,kind in arm_nodes:
    phase=0 if kind=='forward' else .8
    keys(id,13,[(f,2*math.sin(2*math.pi*f/80+phase)) for f in range(241)])
    keys(id,14,[(f,3*math.sin(2*math.pi*f/80+phase)) for f in range(241)])
for j,id in enumerate(particles):
    # Both strokes of the star share a phase and remain joined.
    phase=0 if j else 1
    keys(id,13,[(f,4*math.sin(2*math.pi*f/120+phase)) for f in range(241)])
    keys(id,14,[(f,6*math.sin(2*math.pi*f/120+phase)) for f in range(241)])
    keys(id,18,[(f,.7+.3*math.cos(2*math.pi*f/120+phase)) for f in range(241)])
for id in gradients:
    for prop,base,sign,fn in [(42,340,-1,math.cos),(34,340,1,math.cos),(33,245,-1,math.sin),(35,245,1,math.sin)]:
        keys(id,prop,[(f,base+sign*190*fn(2*math.pi*f/240)) for f in range(0,241,2)])
sm=el('StateMachine',ab,name='Flight',id='0:7');l=el('StateMachineLayer',sm,name='Fly')
el('AnyState',l,x=0,y=-150);el('ExitState',l,x=220,y=-150)
en=el('EntryState',l,x=0,y=0);el('StateTransition',en,stateToId='0:12')
el('AnimationState',l,id='0:12',animationId='0:6',x=220,y=0)
E.indent(root,space='  ');project.joinpath('scene.rml').write_text(E.tostring(root,encoding='unicode'))
