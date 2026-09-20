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

project=Path(__file__).resolve().parents[1]
public=project.parents[2]/'public'/'animations'
ink='25272B';pink='FF797F'
for kind in ['weather','shop','route','plan']:
    root=E.Element('Rive',version='1',kind='fragment')
    ab=el('Artboard',root,width=160,height=160,name='Planning '+kind,id='0:2',defaultStateMachineId='0:7',styleId='0:5')
    el('LayoutComponentStyle',ab,id='0:5')
    ch=node(ab,'Character',20,x=80,y=80)
    # Frontmost siblings first. Eyes change expression without distorting the body.
    eyes=node(ch,'Open eyes',30,y=14 if kind=='shop' else 0)
    ellipse(eyes,'Left eye',-16,-5,9,11,ink)
    ellipse(eyes,'Right eye',16,-5,9,11,ink)
    happy=node(ch,'Smiling eyes',31,opacity=0,y=14 if kind=='shop' else 0)
    for x in [-16,16]:
        path(happy,'Happy eye',(x-5,-3),[((x-4,-11),(x+4,-11),(x+6,-4))],ink,5)
    path(ch,'Smile',(-10,9),[((-6,20),(7,20),(12,8))],ink,5).set('y','14' if kind=='shop' else '0')
    if kind=='weather':
        ellipse(ch,'Sun',0,0,92,92,'FF9456')
        for i in range(8):
            a=i*math.pi/4
            x,y=57*math.cos(a),57*math.sin(a)
            xx,yy=66*math.cos(a),66*math.sin(a)
            path(ch,'Ray',(x,y),[((x,y),(xx,yy),(xx,yy))],'FF9456',8)
    elif kind=='shop':
        # Reference storefront: broad fabric awning and a plain soft facade.
        # All panels share one continuous crown instead of separate domed lobes.
        panels=[
            ((-47,-51),[((-54,-51),(-58,-43),(-61,-34)),((-63,-28),(-65,-23),(-65,-20)),((-65,-6),(-39,-6),(-39,-20)),((-38,-31),(-35,-43),(-34,-53)),((-38,-53),(-43,-52),(-47,-51))]),
            ((-34,-53),[((-26,-54),(-18,-54),(-11,-54)),((-11,-43),(-12,-30),(-13,-20)),((-13,-6),(-39,-6),(-39,-20)),((-38,-31),(-35,-43),(-34,-53))]),
            ((-11,-54),[((-4,-54),(4,-54),(11,-54)),((11,-43),(12,-30),(13,-20)),((13,-6),(-13,-6),(-13,-20)),((-12,-30),(-11,-43),(-11,-54))]),
            ((11,-54),[((18,-54),(26,-54),(34,-53)),((35,-43),(38,-31),(39,-20)),((39,-6),(13,-6),(13,-20)),((12,-30),(11,-43),(11,-54))]),
            ((34,-53),[((38,-53),(43,-52),(47,-51)),((54,-51),(58,-43),(61,-34)),((63,-28),(65,-23),(65,-20)),((65,-6),(39,-6),(39,-20)),((38,-31),(35,-43),(34,-53))]),
        ]
        for i,(start,segments) in enumerate(panels):
            path(ch,'Awning panel',start,segments,'FF7D86' if i%2==0 else 'FFD1D2',closed=True)
        rect(ch,'Shop facade',0,14,108,96,'F3EAE0',10)
    elif kind=='route':
        # Circular upper head (radius 54, center 0,-10), tangent into the tip.
        path(ch,'Location pin',(0,-64),[
            ((29.823,-64),(54,-39.823),(54,-10)),
            ((54,16),(20,49),(5,65)),
            ((2,69),(-2,69),(-5,65)),
            ((-20,49),(-54,16),(-54,-10)),
            ((-54,-39.823),(-29.823,-64),(0,-64))],'6CC58C',closed=True)
    else:
        path(ch,'Bulb',(-23,40),[((-27,23),(-53,12),(-51,-19)),((-48,-82),(48,-82),(51,-19)),((53,12),(27,23),(23,40)),((23,40),(-23,40),(-23,40))],'FFD352',closed=True)
        rect(ch,'Socket top',0,45,48,12,'A6A6A5',6)
        rect(ch,'Socket base',0,55,39,12,'929391',5)
        ellipse(ch,'Socket end',0,60,24,17,'616460')
    svg=E.Element('svg',xmlns='http://www.w3.org/2000/svg',viewBox='0 0 160 160',fill='none')
    svg_node(ch,svg)
    out=E.tostring(svg,encoding='unicode')
    project.joinpath(f'exports/planning-{kind}-static.svg').write_text(out)
    public.joinpath(f'planning-{kind}-static.svg').write_text(out)
    if kind!='weather': continue
    anim=el('LinearAnimation',ab,name='Gentle smile',id='0:6',fps=60,duration=240,loopValue='loop')
    def keys(id,prop,seq):
        obj=el('KeyedObject',anim,objectId=f'0:{id}');pr=el('KeyedProperty',obj,propertyKey=prop)
        for frame,value in seq:el('KeyFrameDouble',pr,frame=frame,value=round(value,6),interpolationType='linear')
    keys(20,14,[(f,80-2*(1-math.cos(2*math.pi*f/120))) for f in range(241)])
    keys(30,18,[(0,1),(66,1),(72,0),(150,0),(156,1),(240,1)])
    keys(31,18,[(0,0),(66,0),(72,1),(150,1),(156,0),(240,0)])
    sm=el('StateMachine',ab,name='Weather',id='0:7');layer=el('StateMachineLayer',sm,name='Smile')
    el('AnyState',layer,x=0,y=-150);el('ExitState',layer,x=220,y=-150)
    entry=el('EntryState',layer,x=0,y=0);el('StateTransition',entry,stateToId='0:12')
    el('AnimationState',layer,id='0:12',animationId='0:6',x=220,y=0)
    E.indent(root,space='  ')
    project.joinpath('scene.rml').write_text(E.tostring(root,encoding='unicode'))
