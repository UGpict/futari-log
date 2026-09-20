"""Editable native-vector Rive scene. Run with Python 3 to regenerate scene.rml."""
import math
from pathlib import Path
import xml.etree.ElementTree as E
root=E.Element('Rive',version='1',kind='fragment')
def el(tag,p,**kw): return E.SubElement(p,tag,{k:str(v) for k,v in kw.items()})
ab=el('Artboard',root,width=320,height=340,name='Futari Suggestion',id='0:2',defaultStateMachineId='0:7',styleId='0:5')
el('LayoutComponentStyle',ab,id='0:5',name='Artboard Style')
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
ink='171E23'; pink='FF797F'; paper='FFEAE7'
motion=node(ab,'Floating center',120,x=147,y=170)
ch=node(motion,'Character',20,x=-237,y=-240)
# Face expression layers.
face=node(ch,'Face',70)
eyes=node(face,'Open eyes',71)
ellipse(eyes,'Left eye',210,208,21,24,ink).set('id','0:121')
ellipse(eyes,'Right eye',264,207,21,24,ink).set('id','0:122')
happy=node(face,'Happy eyes',72,opacity=0)
for x in [210,264]:path(happy,'Happy eye',(x-11,208),[((x-7,194),(x+7,194),(x+12,207))],ink,11)
smile=node(face,'Smile',73)
path(smile,'Smile',(219,230),[((227,247),(247,247),(256,229))],ink,12)
# Bookmark silhouette, asymmetrical softened top and notched bottom.
body=path(ch,'Coral bookmark body',(139,183),[
 ((137,146),(155,128),(189,120)),
 ((223,111),(273,105),(298,112)),
 ((326,120),(337,144),(338,177)),
 ((340,218),(337,296),(330,347)),
 ((328,367),(319,376),(305,370)),
 ((282,360),(251,341),(239,340)),
 ((226,344),(197,363),(174,373)),
 ((158,380),(147,370),(145,352)),
 ((140,299),(138,231),(139,183))],pink,closed=True)
# Modest tonal gradient matches the soft source without raster texture.
f=body.find('Fill');f.remove(f[0]);g=el('LinearGradient',f,startX=170,startY=120,endX=315,endY=370)
el('GradientStop',g,colorValue='FFFF7D83',position=0);el('GradientStop',g,colorValue='FFFF777E',position=1)

# Arms pivot at the shoulders; the right arm presents the adjacent speech bubble.
left_hand=node(ch,'Left round hand',85,x=130,y=317)
ellipse(left_hand,'Round hand',0,0,26,26,ink)
right_hand=node(ch,'Right round hand',86,x=346,y=317)
ellipse(right_hand,'Round hand',0,0,26,26,ink)
left=node(ch,'Left arm',81,x=140,y=282)
lp=path(left,'Left arm curve',(0,0),[((-30,2),(-30,35),(-10,35))],ink,11)
lp.find('PointsPath')[1].set('id','0:83')
right=node(ch,'Right arm',82,x=336,y=282)
rp=path(right,'Right arm curve',(0,0),[((30,2),(30,35),(10,35))],ink,11)
rp.find('PointsPath')[1].set('id','0:84')
# Open talking smile (front of ordinary smile via its own opacity).
talk=node(face,'Talking mouth',74,opacity=0)
path(talk,'Open smile',(218,227),[((229,227),(249,227),(258,225)),((260,259),(218,261),(218,227))],ink,closed=True)
anim=el('LinearAnimation',ab,name='Suggest',id='0:6',fps=60,duration=600,loopValue='loop')
def keys(id,prop,seq,hold=False,linear=False):
    obj=el('KeyedObject',anim,objectId=f'0:{id}');pr=el('KeyedProperty',obj,propertyKey=prop)
    for fr,val in seq:
        k=el('KeyFrameDouble',pr,frame=fr,value=round(val,5),interpolationType='hold' if hold else ('linear' if linear else 'cubic'))
        if not hold and not linear:el('CubicEaseInterpolator',k,x1=.42,y1=0,x2=.58,y2=1)

# Two unhurried proposals with resting beats between them; seamless 10s loop.
# Animate the hand tips outward/upward instead of rotating arms behind the body.
# Viewer-right hand presents the speech bubble; the opposite arm rests.
right_poses=[(0,10,35),(54,10,35),(83,42,-12),(110,43,-9),(154,44,-12),(177,46,-16),(199,43,-10),(230,10,35),(294,10,35),(325,42,-12),(375,44,-10),(410,46,-16),(435,43,-10),(468,10,35),(600,10,35)]
left_poses=[(0,-10,35),(600,-10,35)]
for vid,poses in [(84,right_poses),(83,left_poses)]:
    keys(vid,24,[(f,x) for f,x,y in poses]);keys(vid,25,[(f,y) for f,x,y in poses])
    hand_id,shoulder_x=(86,336) if vid==84 else (85,140)
    keys(hand_id,13,[(f,shoulder_x+x) for f,x,y in poses]);keys(hand_id,14,[(f,282+y) for f,x,y in poses])
    keys(vid,84,[(f,(0 if vid==84 else math.pi) if y>0 else math.pi/2) for f,x,y in poses])
keys(73,18,[(0,1),(112,1),(121,0),(195,0),(214,1),(354,1),(367,0),(432,0),(449,1),(600,1)])
keys(74,18,[(0,0),(112,0),(121,1),(195,1),(214,0),(354,0),(367,1),(432,1),(449,0),(600,0)])
keys(71,18,[(0,1),(153,1),(163,0),(188,0),(203,1),(391,1),(401,0),(425,0),(439,1),(600,1)])
keys(72,18,[(0,0),(153,0),(163,1),(188,1),(203,0),(391,0),(401,1),(425,1),(439,0),(600,0)])
for eye in [121,122]:
    keys(eye,17,[(0,1),(32,1),(36,.12),(42,1),(268,1),(272,.12),(278,1),(510,1),(514,.12),(520,1),(600,1)])
sm=el('StateMachine',ab,name='Suggestion',id='0:7')
l=el('StateMachineLayer',sm,name='Propose and rest')
el('AnyState',l,x=0,y=-150);el('ExitState',l,x=420,y=-150)
en=el('EntryState',l,x=0,y=0);el('StateTransition',en,stateToId='0:12')
el('AnimationState',l,id='0:12',animationId='0:6',x=220,y=0)
# Two 2.2-second bobs under a slower sway; rotate around the body center.
anim=el('LinearAnimation',ab,name='Breathing',id='0:110',fps=60,duration=264,loopValue='loop')
# Sample smooth periodic curves. Position and velocity match at the loop seam.
# No scale or face-offset animation: preserve the character's silhouette.
frames=range(265)
keys(120,14,[(f,160+10*math.cos(2*math.pi*f/132)) for f in frames],linear=True)
keys(120,13,[(f,147+2*math.sin(2*math.pi*f/264)) for f in frames],linear=True)
keys(120,15,[(f,.025*math.sin(2*math.pi*f/264)) for f in frames],linear=True)
breath=el('StateMachineLayer',sm,name='Continuous breathing')
el('AnyState',breath,x=0,y=-150);el('ExitState',breath,x=420,y=-150)
entry=el('EntryState',breath,x=0,y=0);el('StateTransition',entry,stateToId='0:112')
el('AnimationState',breath,id='0:112',animationId='0:110',x=220,y=0)
E.indent(root,space='  ')

project=Path(__file__).resolve().parents[1]
project.joinpath('scene.rml').write_text(E.tostring(root,encoding='unicode')+'\n')
# A matching static vector for reduced-motion, initial loading, and load failures.
svg=E.Element('svg',xmlns='http://www.w3.org/2000/svg',viewBox='0 0 320 340',fill='none')
def svg_node(src,parent):
    tag=src.tag
    if tag not in ('Node','Shape'): return
    attrs=src.attrib
    group=E.SubElement(parent,'g',{'transform':f"translate({attrs.get('x',0)} {attrs.get('y',0)}) rotate({float(attrs.get('rotation',0))*180/math.pi})",'opacity':attrs.get('opacity','1')})
    if tag=='Node':
        for child in reversed(list(src)):svg_node(child,group)
        return
    common={}
    fill=src.find('Fill');stroke=src.find('Stroke')
    if fill is not None:
        color=fill.find('SolidColor')
        common['fill']='#'+(color.get('colorValue')[2:] if color is not None else pink)
    if stroke is not None:
        common.update({'stroke':'#'+stroke.find('SolidColor').get('colorValue')[2:],'stroke-width':stroke.get('thickness'),'stroke-linecap':'round','stroke-linejoin':'round'})
    for geom in src:
        a=geom.attrib
        if geom.tag=='Ellipse':E.SubElement(group,'ellipse',dict(common,rx=str(float(a['width'])/2),ry=str(float(a['height'])/2)))
        elif geom.tag=='Rectangle':
            w=float(a['width']);h=float(a['height']);E.SubElement(group,'rect',dict(common,x=str(-w/2),y=str(-h/2),width=str(w),height=str(h),rx=a.get('cornerRadiusTL','0')))
        elif geom.tag=='PointsPath':
            vs=list(geom);d=f"M {vs[0].get('x')} {vs[0].get('y')}"
            pairs=list(zip(vs,vs[1:]))+([(vs[-1],vs[0])] if geom.get('isClosed')=='true' else [])
            for v,w in pairs:
                x,y=float(v.get('x')),float(v.get('y'));nx,ny=float(w.get('x')),float(w.get('y'))
                r,dist=float(v.get('outRotation')),float(v.get('outDistance'));ir,di=float(w.get('inRotation')),float(w.get('inDistance'))
                d+=f" C {x+math.cos(r)*dist} {y+math.sin(r)*dist} {nx+math.cos(ir)*di} {ny+math.sin(ir)*di} {nx} {ny}"
            if geom.get('isClosed')=='true':d+=' Z'
            E.SubElement(group,'path',dict(common,d=d))
svg_node(ch,svg)
project.joinpath('exports/futari-suggestion-static.svg').write_text(E.tostring(svg,encoding='unicode'))
