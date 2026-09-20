"""Editable native-vector Rive scene. Run with Python 3 to regenerate scene.rml."""
import math
from pathlib import Path
import xml.etree.ElementTree as E
root=E.Element('Rive',version='1',kind='fragment')
def el(tag,p,**kw): return E.SubElement(p,tag,{k:str(v) for k,v in kw.items()})
ab=el('Artboard',root,width=500,height=500,name='Futari Memo',id='0:2',defaultStateMachineId='0:7',styleId='0:5')
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
ch=node(ab,'Character',20,x=0,y=0)
# First siblings are in front. Pen and fingers sit over the page.
arm=node(ch,'Writing arm and pen',40,x=234,y=307,rotation=0,opacity=1)
ellipse(arm,'Fingers',0,0,26,23,ink)
pen=node(arm,'Pen',41,rotation=-.55)
path(pen,'Nib',(-6,28),[((-6,28),(0,43),(0,43)),((0,43),(6,28),(6,28)),((6,28),(-6,28),(-6,28))],paper,closed=True)
rect(pen,'Pen barrel',0,-6,13,70,paper,5)
rect(pen,'Black cap',0,-43,13,17,ink,4)
reach=node(ch,'Writing arm',42,opacity=1)
arm_path=path(reach,'Bent arm',(180,298),[((183,320),(214,322),(234,307))],ink,11)
arm_path.find('PointsPath')[1].set('id','0:43')
nb=node(ch,'Notebook and holding hand',50,x=282,y=264,rotation=.28,opacity=1)
ellipse(nb,'Holding fingers',85,55,24,23,ink)
path(nb,'Holding arm',(85,55),[((103,55),(99,31),(96,27))],ink,10)
for i in range(5):
    x=10+i*16
    path(nb,f'Spiral {i+1}',(x,-3),[((x+1,-13),(x+14,-10),(x+10,0)),((x+9,3),(x+5,4),(x+5,4))],ink,5)
# Very subtle handwritten lines are separate, keyed reveals.
for i in range(3):
    line=node(nb,f'Written line {i+1}',60+i,opacity=1)
    path(line,'Pencil mark',(15,31+i*17),[((25,27+i*17),(34,34+i*17),(43,30+i*17)),((49,28+i*17),(56,31+i*17),(64-(i%2)*13,30+i*17))],'DDA7AB',2.4)
rect(nb,'Paper',43,49,90,106,paper,7)
# Face expression layers.
face=node(ch,'Face',70)
eyes=node(face,'Open eyes',71)
ellipse(eyes,'Left eye',210,208,21,24,ink);ellipse(eyes,'Right eye',264,207,21,24,ink)
happy=node(face,'Happy eyes',72,opacity=0)
for x in [210,264]:path(happy,'Happy eye',(x-11,208),[((x-7,194),(x+7,194),(x+12,207))],ink,11)
path(face,'Smile',(219,230),[((227,247),(247,247),(256,229))],ink,12)
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
idle=node(ch,'Resting arms',80,opacity=0)
path(idle,'Left resting arm',(149,281),[((133,295),(134,317),(147,321))],ink,11)
path(idle,'Right resting arm',(328,281),[((343,294),(343,314),(331,321))],ink,11)
anim=el('LinearAnimation',ab,name='Writing',id='0:6',fps=60,duration=144,loopValue='loop')
def keys(id,prop,seq,hold=False):
    obj=el('KeyedObject',anim,objectId=f'0:{id}');pr=el('KeyedProperty',obj,propertyKey=prop)
    for fr,val in seq:
        k=el('KeyFrameDouble',pr,frame=fr,value=round(val,5),interpolationType='hold' if hold else 'cubic')
        if not hold:el('CubicEaseInterpolator',k,x1=.42,y1=0,x2=.58,y2=1)
# Both timelines key the same properties, so arbitrary-time transitions blend.
def pose_keys(duration, pop=False):
    keys(20,14,[(0,0),(8,3),(19,-13),(29,1),(39,0)] if pop else [(0,0),(72,-2),(144,0)])
    keys(50,14,[(0,264),(8,266),(19,254),(29,262),(39,264)] if pop else [(0,264),(72,263),(144,264)])
    keys(50,15,[(0,.28),(19,.10),(39,.28)] if pop else [(0,.28),(72,.265),(144,.28)])
    keys(40,15,[(0,0),(19,-.28),(39,0)] if pop else [(0,0),(144,0)])
    keys(71,18,[(0,1),(8,1),(13,0),(29,0),(37,1),(39,1)] if pop else [(0,1),(144,1)])
    keys(72,18,[(0,0),(8,0),(13,1),(29,1),(37,0),(39,0)] if pop else [(0,0),(144,0)])
    if pop:
        xs=[(0,238),(8,235),(19,225),(29,232),(39,238)]
        ys=[(0,303),(8,301),(19,284),(29,296),(39,303)]
    else:
        xs=[(f,238+(-3 if (f//12)%2==0 else 5)) for f in range(0,145,12)]
        ys=[(f,303+3*math.sin(f*math.pi/36)) for f in range(0,145,12)]
    keys(40,13,xs);keys(40,14,ys);keys(43,24,xs);keys(43,25,ys)
pose_keys(144)
anim=el('LinearAnimation',ab,name='Next',id='0:90',fps=60,duration=39,loopValue='oneShot')
pose_keys(39,True)
ab.set('viewModelId','0:100');ab.set('viewModelInstanceId','0:101')
vm=el('ViewModel',root,name='MemoControls',id='0:100',defaultInstanceId='0:101')
el('ViewModelPropertyTrigger',vm,name='next',id='0:102')
inst=el('ViewModelInstance',vm,name='Default',id='0:101',exports='true')
el('ViewModelInstanceTrigger',inst,viewModelPropertyId='0:102',propertyValue=0)
sm=el('StateMachine',ab,name='Memo',id='0:7')
l=el('StateMachineLayer',sm,name='Writing and next')
el('AnyState',l,x=0,y=-150);el('ExitState',l,x=440,y=-150)
en=el('EntryState',l,x=0,y=0);el('StateTransition',en,stateToId='0:12')
writing=el('AnimationState',l,id='0:12',animationId='0:6',x=220,y=0,reset='true')
t=el('StateTransition',writing,stateToId='0:91',duration=70)
c=el('TransitionViewModelCondition',t)
left=el('TransitionPropertyViewModelComparator',c)
bind=el('BindablePropertyTrigger',left)
el('DataBindContext',bind,sourcePathIds='0:100-0:102',propertyKey=686)
el('TransitionValueTriggerComparator',c)
next_state=el('AnimationState',l,id='0:91',animationId='0:90',x=440,y=0,reset='true')
el('StateTransition',next_state,stateToId='0:12',duration=70,enableExitTime='true',exitTimeIsPercetange='true',exitTime=100)
# Clicking the body tests the same public trigger in the standalone preview.
body.set('id','0:92')
listener=el('StateMachineListenerSingle',sm,name='Preview next',targetId='0:92',listenerTypeValue='click')
change=el('ListenerViewModelChange',listener)
bind=el('BindablePropertyTrigger',change,propertyValue=1)
el('DataBindContext',bind,sourcePathIds='0:100-0:102',propertyKey=686,direction='true')
E.indent(root,space='  ')
project=Path(__file__).resolve().parents[1]
project.joinpath('scene.rml').write_text(E.tostring(root,encoding='unicode')+'\n')

# A matching static vector for reduced-motion, initial loading, and load failures.
svg=E.Element('svg',xmlns='http://www.w3.org/2000/svg',viewBox='0 0 500 500',fill='none')
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
project.joinpath('exports/futari-memo-static.svg').write_text(E.tostring(svg,encoding='unicode'))
