// Original city and circuit scenery, built for the selected road geometry.
(() => {
  'use strict';
  const {tracks} = window.ClassicCourses;
  function build(scene, track=tracks[0]) {
    const {length,gates,halfWidth,sample,project,gridLanes} = track;
    const T = window.THREE;
    const city = new T.Group();
    const theme = window.ClassicLandscapes.themeFor(track.id), sunport = track.id === 'sunport';
    city.name = track.english;
    scene.add(city);
    let seed = theme.seed;
    function rand() {
      seed = (Math.imul(1664525,seed)+1013904223)>>>0;
      return seed/4294967296;
    }
    const range = (a,b) => a+(b-a)*rand();
    const canvas = (w,h) => Object.assign(document.createElement('canvas'), {width:w,height:h});
    function texture(surface) {
      const result = new T.CanvasTexture(surface);
      result.colorSpace = T.SRGBColorSpace;
      result.anisotropy = 4;
      return result;
    }
    const night=track.id==='metro', sky=canvas(night?1024:4,512), skyCtx=sky.getContext('2d');
    const skyGradient = skyCtx.createLinearGradient(0,0,0,512);
    theme.sky.forEach((c,i)=>skyGradient.addColorStop([0,.35,.66,1][i],c));
    skyCtx.fillStyle=skyGradient; skyCtx.fillRect(0,0,sky.width,512);
    if(night){
      for(let i=0;i<180;i++){
        const x=rand()*sky.width,y=range(0,206),size=range(.6,1.65);
        skyCtx.fillStyle=`rgba(254,240,214,${range(.3,.8)*(1-y/270)})`;skyCtx.fillRect(x,y,size,size);
      }
    }
    scene.background = texture(sky);
    scene.fog = new T.Fog(theme.fog,theme.fogNear,theme.fogFar);
    scene.add(new T.HemisphereLight(theme.skyLight,theme.groundLight,theme.ambient));
    const sun = new T.DirectionalLight(theme.sun,theme.sunlight);
    sun.position.set(-110,180,80); scene.add(sun);

    const plain = new T.MeshLambertMaterial({color:0xffffff});
    const unlit = new T.MeshBasicMaterial({color:0xffffff});
    const boxGeo = new T.BoxGeometry(1,1,1);
    const ball = new T.IcosahedronGeometry(1,1);
    const cloudBall = new T.SphereGeometry(1,12,7);
    const cylinder = new T.CylinderGeometry(1,1,1,10);
    const cone = new T.ConeGeometry(1,1,12);
    const round = new T.CylinderGeometry(1,1,1,24);
    const plate = new T.PlaneGeometry(1,1);
    const transform = new T.Object3D(), tempColor = new T.Color();
    const batches = new Map();
    // Batch by geometry, material and neighbourhood for frustum culling on the long straights.
    function put(geo,mat,ink,x,y,z,sx,sy,sz,rotation=0,tilt=0,roll=0) {
      const key = geo.id+'/'+mat.id+'/'+Math.floor(x/145)+'/'+Math.floor(z/145);
      let batch = batches.get(key);
      if (!batch) { batch={geo,mat,parts:[]}; batches.set(key,batch); }
      transform.position.set(x,y,z); transform.scale.set(sx,sy,sz);
      transform.rotation.set(tilt,rotation,roll,'YXZ'); transform.updateMatrix();
      batch.parts.push([transform.matrix.clone(),ink]);
    }
    const box=(x,y,z,w,h,d,color,yaw=0)=>put(boxGeo,plain,color,x,y,z,w,h,d,yaw);
    function tube(ax,ay,az,bx,by,bz,r,ink) {
      const dx=bx-ax,dy=by-ay,dz=bz-az;
      put(cylinder,plain,ink,(ax+bx)/2,(ay+by)/2,(az+bz)/2,r,Math.hypot(dx,dy,dz),r,
        Math.atan2(dx,dz),Math.atan2(Math.hypot(dx,dz),dy));
    }
    function radial(x,y,z,r,h,color) { put(round,plain,color,x,y,z,r,h,r); }
    function along(s,offset) {
      const p=sample(s); return {x:p.x-p.tz*offset,z:p.z+p.tx*offset,tx:p.tx,tz:p.tz};
    }
    function roadside(s,side,distance) {
      return along(s, side*distance);
    }
    const warningSites=track.warnings.map(q=>({...q,r:6}));
    const nearWarning=p=>warningSites.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<q.r);
    const roadTex=canvas(192,192), roadCtx=roadTex.getContext('2d');
    roadCtx.fillStyle=theme.asphalt; roadCtx.fillRect(0,0,192,192);
    for (let i=0;i<10500;i++) {
      roadCtx.fillStyle=rand()<.47?'rgba(41,59,75,.073)':'rgba(236,238,229,.066)';
      roadCtx.fillRect(rand()*192,rand()*192,range(.6,2),range(.5,1.6));
    }
    const asphalt=texture(roadTex); asphalt.wrapS=asphalt.wrapT=T.RepeatWrapping;
    function ribbon(left,right,y,material,step=3.2,start=0,end=length) {
      const n=Math.ceil((end-start)/step),positions=[],uv=[],indices=[];
      for(let i=0;i<=n;i++){
        const s=start+(end-start)*i/n;
        const a=along(s,left),b=along(s,right);
        positions.push(a.x,y,a.z,b.x,y,b.z);
        uv.push(left/8,s/8,right/8,s/8);
        if(i<n){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
      const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
      city.add(new T.Mesh(g,material));
    }
    const flatMaterial=(color,map=null)=>new T.MeshLambertMaterial({color,map,side:T.DoubleSide});
    // Asphalt and footways are separate surfaces so the bright edge lines keep their width in bends.
    ribbon(-halfWidth,halfWidth,0,flatMaterial(0xffffff,asphalt),2.5);
    const edgePaint=flatMaterial(0xffe9aa);
    ribbon(-halfWidth+.4,-halfWidth+.58,.012,edgePaint);
    ribbon(halfWidth-.58,halfWidth-.4,.012,edgePaint);
    const pavers=canvas(256,256),pc=pavers.getContext('2d');
    pc.fillStyle='#c5b99c';pc.fillRect(0,0,256,256);
    const paverTones=['#e4d5b4','#e9dabc','#e7d8b6','#e2d2ae'];
    for(let row=0;row<8;row++)for(let col=-1;col<4;col++){
      const x=col*64+(row%2)*32,y=row*32;
      pc.fillStyle=paverTones[Math.floor(rand()*4)];pc.fillRect(x+1,y+1,63,31);
      pc.fillStyle='rgba(255,250,224,.48)';pc.fillRect(x+1,y+1,63,1);
    }
    const paving=texture(pavers); paving.wrapS=paving.wrapT=T.RepeatWrapping;
    const pavingMaterial=flatMaterial(theme.pavers,paving);
    const outerTrim=flatMaterial(0xb8a38d);
    const pier=track.id==='beach'?{start:track.landmarks.lagoon-44,end:track.landmarks.lagoon+44}:null;
    const footways=pier?[[0,pier.start],[pier.end,length]]:[[0,length]];
    for(const [start,end] of footways){
      ribbon(-21,-13.45,.12,pavingMaterial,3.2,start,end);
      ribbon(13.45,21,.12,pavingMaterial,3.2,start,end);
      ribbon(-21.18,-20.86,.14,outerTrim,3.2,start,end);
      ribbon(20.86,21.18,.14,outerTrim,3.2,start,end);
    }
    const grass = canvas(96,96), gc=grass.getContext('2d');
    gc.fillStyle=theme.ground[0];gc.fillRect(0,0,96,96);
    for(let i=0;i<450;i++){gc.fillStyle=rand()<.5?theme.ground[1]:theme.ground[2];gc.fillRect(rand()*96,rand()*96,range(.7,2.1),1);}
    const grassMap=texture(grass);grassMap.wrapS=grassMap.wrapT=T.RepeatWrapping;grassMap.repeat.set(240,240);
    const meadow=new T.Mesh(new T.PlaneGeometry(2400,2400),flatMaterial(0xffffff,grassMap));
    meadow.rotation.x=-Math.PI/2;meadow.position.set(200,track.id==='beach'?-5:-.15,-45);city.add(meadow);
    for(let s=0;s<length;s+=12){
      const p=sample(s),yaw=Math.atan2(p.tx,p.tz);
      for(const lane of [-halfWidth/3,halfWidth/3]){
        const a=along(s,lane);box(a.x,.014,a.z,.16,.012,4.5,'#f1eee0',yaw);
      }
    }
    for(const side of [-1,1]){
      for(let s=0;s<length;s+=4.4){
        const end=Math.min(s+4.4,length),a=roadside(s,side,halfWidth+.19),b=roadside(end,side,halfWidth+.19);
        const dx=b.x-a.x,dz=b.z-a.z,turn=sample(s+9),start=sample(s-8);
        const bend=Math.abs(start.tx*turn.tz-start.tz*turn.tx)>.08;
        const ink=(Math.floor(s/4.4)%2)?'#fff0d8':bend?theme.bend:theme.kerb;
        box((a.x+b.x)/2,.14,(a.z+b.z)/2,.64,.29,Math.hypot(dx,dz)+.04,ink,Math.atan2(dx,dz));
        box((a.x+b.x)/2,.76,(a.z+b.z)/2,.34,.27,Math.hypot(dx,dz)+.05,theme.rail,Math.atan2(dx,dz));
        box(a.x,.52,a.z,.31,.97,.34,theme.post);
        if(track.id==='metro' && Math.floor(s/4.4)%2===0)
          put(boxGeo,unlit,'#ffe6a1',a.x,.98,a.z,.22,.12,.27);
      }
    }
    function panelTexture(w,h,paint) {
      const img=canvas(w,h); paint(img.getContext('2d'),w,h);
      return new T.MeshBasicMaterial({map:texture(img),side:T.DoubleSide});
    }
    // Lightweight baked contact shadows under trees, stalls and landmark bases.
    const shadowCanvas=canvas(64,64),sh=shadowCanvas.getContext('2d');
    const radialShadow=sh.createRadialGradient(32,32,0,32,32,32);
    radialShadow.addColorStop(0,'rgba(48,64,73,.34)');radialShadow.addColorStop(.72,'rgba(57,71,81,.29)');radialShadow.addColorStop(.89,'rgba(65,80,84,.15)');radialShadow.addColorStop(1,'rgba(50,68,77,0)');
    sh.fillStyle=radialShadow;sh.fillRect(0,0,64,64);
    const shade=new T.MeshBasicMaterial({map:texture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    function shadow(x,z,w,d){put(plate,shade,'#ffffff',x,.158,z,w,d,1,0,-Math.PI/2);}

    // Each hand-painted shop front has mouldings, recessed arches, café doors,
    // contrasting shutters, masonry details and lettering readable from the kart.
    const castVertices=[];
    function castFootprint(points){
      // Convex hull of the base and its sun-projected roof. Shadows stay on
      // the ground when the camera moves, with no shadow-map cost per frame.
      const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      const sorted=points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      const half=ordered=>{
        const hull=[];
        for(const p of ordered){while(hull.length>1&&cross(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}
        return hull.slice(0,-1);
      };
      const boundary=half(sorted).concat(half(sorted.reverse()));
      for(let j=1;j<boundary.length-1;j++){
        for(const v of [boundary[0],boundary[j],boundary[j+1]])castVertices.push(v[0],.151,v[1]);
      }
    }
    const shops=[
      ['GELATO','#ffd8a7','#c85c45','#369d9e','#539ea2'],
      ['MARINA','#c2e4d4','#398d8c','#ec8666','#669b9b'],
      ['POSTE','#f3c496','#ad593f','#347c94','#417999'],
      ['PANETTERIA','#f7d990','#a96a3f','#e77559','#528695'],
      ['RIVIERA','#efb3a1','#b4605a','#44957e','#43928b'],
      ['FIORI','#c4d8ee','#547dab','#c96d79','#5a88ae'],
      ['OLIVA','#d7dfa3','#79834b','#529b7b','#658d78'],
      ['CAFFÈ','#ffdcbb','#aa6656','#ba5955','#578b91']
    ];
    const facades=[],sides=[];
    function facade(style,storefront){
      const [name,wall,trim,accent,shutters]=style;
      return panelTexture(640,512,(c,w,h)=>{
        c.fillStyle=wall;c.fillRect(0,0,w,h);
        for(let i=0;i<220;i++){c.fillStyle=i%2?'rgba(255,250,225,.14)':'rgba(116,80,64,.07)';c.fillRect(rand()*w,rand()*h,range(3,14),range(1,3));}
        c.fillStyle='#f9e9c7';c.fillRect(0,4,w,10);c.fillStyle=trim;c.fillRect(0,16,w,4);
        for(const y of [165,318]){c.fillStyle='rgba(105,63,53,.26)';c.fillRect(0,y+6,w,7);c.fillStyle='#f8e4b9';c.fillRect(0,y,w,8);}
        const cols=storefront?4:3;
        for(let row=0;row<(storefront?2:3);row++)for(let j=0;j<cols;j++){
          const x=Math.round(w*(j+.5)/cols),y=28+row*152;
          const sill=y+113,ww=storefront?65:77;
          c.fillStyle=trim;c.fillRect(x-ww/2-6,y+3,ww+12,106);
          c.fillStyle='#fff1cc';c.fillRect(x-ww/2-3,y,ww+6,103);
          const g=c.createLinearGradient(x-30,y,x+30,y+100);g.addColorStop(0,'#467a92');g.addColorStop(.55,'#80b8c5');g.addColorStop(1,'#386377');c.fillStyle=g;c.fillRect(x-ww/2+3,y+6,ww-6,94);
          c.fillStyle='rgba(224,249,255,.46)';c.beginPath();c.moveTo(x-ww/2+4,y+9);c.lineTo(x+6,y+9);c.lineTo(x-ww/2+4,y+52);c.fill();
          c.fillStyle='#f4e3bd';c.fillRect(x-2,y+4,4,97);c.fillRect(x-ww/2+3,y+45,ww-6,4);
          for(const side of [-1,1]){
            const xx=x+side*(ww/2+13)-8;
            c.fillStyle=shutters;c.fillRect(xx,y+5,16,98);c.fillStyle='rgba(27,66,69,.32)';
            for(let k=0;k<9;k++)c.fillRect(xx+2,y+10+k*10,12,2);
          }
          c.fillStyle='rgba(115,77,60,.29)';c.fillRect(x-ww/2-10,sill-2,ww+20,7);c.fillStyle='#fff0d2';c.fillRect(x-ww/2-10,sill-5,ww+20,5);
          if((row+j)%3===0){
            c.fillStyle='#b37851';c.fillRect(x-23,sill-5,46,8);
            for(let k=0;k<12;k++){c.fillStyle=k%4?'#4e9364':'#d76755';c.beginPath();c.arc(x-22+k*4,sill-6-rand()*5,4,0,Math.PI*2);c.fill();}
          }
        }
        if(storefront){
          c.fillStyle=trim;c.fillRect(0,334,w,48);c.fillStyle='#f7e6c4';c.fillRect(7,337,w-14,4);c.fillRect(7,373,w-14,3);
          c.fillStyle='#fff1d0';c.font='bold 29px Georgia, serif';c.textAlign='center';c.fillText(name,w/2,367);
          for(let j=0;j<4;j++){
            const x=40+j*155;
            c.fillStyle='#f8e9c9';c.beginPath();c.moveTo(x,512);c.lineTo(x,430);c.arc(x+47,430,47,Math.PI,0);c.lineTo(x+94,512);c.fill();
            c.fillStyle=j===1?'#685452':'#50808a';c.beginPath();c.moveTo(x+6,512);c.lineTo(x+6,431);c.arc(x+47,431,41,Math.PI,0);c.lineTo(x+88,512);c.fill();
            c.fillStyle='#e6c794';c.fillRect(x+43,392,5,120);c.fillRect(x+7,440,81,4);
            c.fillStyle='rgba(217,245,240,.38)';c.fillRect(x+12,448,5,39);
          }
          c.fillStyle=accent;c.fillRect(0,496,w,16);
        }
        c.fillStyle='#efe0bf';for(const x of [0,w-14])for(let y=20;y<h;y+=25)c.fillRect(x,y,14,19);
      });
    }
    if(sunport)shops.forEach(style=>{facades.push(facade(style,true));sides.push(facade(style,false));});

    // Hip roofs meet at a shortened ridge. Face normals are flat so the roof
    // reads clearly against the sky, even before the dormers become visible.
    function roofShape(){
      const vert=[[-.52,0,-.53],[.52,0,-.53],[.52,0,.53],[-.52,0,.53],[-.34,1,0],[.34,1,0]];
      const indices=[[0,4,5],[0,5,1],[1,5,2],[2,5,4],[2,4,3],[3,4,0]];
      const pos=indices.flatMap(face=>face.flatMap(i=>vert[i]));
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g;
    }
    const hipRoof=roofShape(),roofMat=new T.MeshLambertMaterial({side:T.DoubleSide});
    const awningMat=(sunport?shops:[]).map(([, , ,accent])=>panelTexture(128,64,(c,w,h)=>{
      for(let i=0;i<8;i++){c.fillStyle=i%2?accent:'#fff1cd';c.fillRect(i*16,0,16,h);}
      c.fillStyle='rgba(77,46,35,.17)';c.fillRect(0,h-7,w,7);
    }));
    const mansard=new T.CylinderGeometry(.49,.71,1,4,1,false,Math.PI/4);
    const roofColors=['#be6650','#aa6757','#688b93','#c67e53','#5b8990','#be7058'];
    const sites=warningSites.slice();
    function reserve(x,z,r) { sites.push({x,z,r}); }
    function available(x,z,r) {
      return sites.every(a=>(x-a.x)**2+(z-a.z)**2>(r+a.r)**2);
    }
    reserve(-56,-164,15); reserve(-48,-299,32); reserve(52,-156,15);
    function building(x,z,yaw,w,d,h,kind){
      const style=shops[kind],cs=Math.cos(yaw),sn=Math.sin(yaw);
      const pos=(u,v)=>[x+u*cs+v*sn,z-u*sn+v*cs];
      function localBox(u,y,v,ww,hh,dd,ink){
        const [px,pz]=pos(u,v);box(px,y,pz,ww,hh,dd,ink,yaw);
      }
      const roofH=range(3,5.2),paint=roofColors[(kind+Math.floor(rand()*3))%roofColors.length];
      localBox(0,h/2,0,w,h,d,style[1]); // stucco envelope
      const [fx,fz]=pos(0,d/2+.025);put(plate,facades[kind],'#ffffff',fx,h/2,fz,w,h,1,yaw);
      for(const k of [-1,1]){
        const [sx,sz]=pos(k*(w/2+.025),0);put(plate,sides[kind],'#ffffff',sx,h/2,sz,d,h,1,yaw+k*Math.PI/2);
      }
      localBox(0,h-.1,0,w+.45,.54,d+.48,'#fff0d0');
      localBox(0,h+.26,0,w+.9,.34,d+.83,style[2]);
      const frenchRoof=kind===1||kind===5;
      if(frenchRoof){
        put(mansard,roofMat,paint,x,h+.37+roofH/2,z,w*1.02,roofH,d*1.02,yaw);
        localBox(0,h+roofH+.38,0,w*.69,.26,d*.69,'#cfbba8');
      }else put(hipRoof,roofMat,paint,x,h+.37,z,w,roofH,d,yaw);
      if(kind%3!==0){
        // Street-facing dormers and their projecting sills animate the roof silhouette.
        for(const side of (kind%2?[-1,1]:[0])){
          const u=side*w*.23,v=d*.23,dy=h+roofH*.52;
          localBox(u,dy,v,2.82,2.7,2.58,'#e7cb9e');
          localBox(u,dy+.05,v+1.31,1.43,1.54,.12,'#5c8994');
          localBox(u,dy+.05,v+1.41,.13,1.57,.12,'#fff0d0');
          localBox(u,dy-.82,v+1.42,1.88,.21,.26,'#fff0cf');
          const [px,pz]=pos(u,v);
          put(hipRoof,roofMat,paint,px,dy+1.33,pz,3.4,1.31,3.12,yaw);
        }
      }
      const chimneyAt=(rand()<.5?-1:1)*w*.28;
      localBox(chimneyAt,h+roofH*.83,-d*.18,1.05,roofH*.75,.93,style[1]);
      localBox(chimneyAt,h+roofH*1.2,-d*.18,1.32,.25,1.23,style[2]);
      const [ex,ez]=pos(0,d/2+1.0);
      put(plate,awningMat[kind],'#ffffff',ex,h*.246,ez,w*.88,2.15,1,yaw,-1.13);
      const [vx,vz]=pos(0,d/2+1.99);
      put(plate,awningMat[kind],'#ffffff',vx,h*.246-.52,vz,w*.88,.4,1,yaw);
      if(kind%2===0){
        // A balcony with a projecting floor and rails casts a real silhouette.
        const floor=h*.355,ww=w*.42;
        localBox(-w*.19,floor,d/2+.48,ww,.24,1.03,'#fff3d9');
        localBox(-w*.19,floor+.89,d/2+.94,ww,.1,.12,style[2]);
        for(let j=0;j<8;j++)localBox(-w*.19+ww*(j/7-.5),floor+.46,d/2+.94,.07,.82,.08,style[2]);
      }
      shadow(x+1,z+.5,w+5,d+5);
      const footprint=[];
      for(const u of [-w*.5,w*.5])for(const v of [-d*.5,d*.5]){
        const q=pos(u,v);footprint.push(q,[q[0]+h*.92,q[1]-h*.35]);
      }
      castFootprint(footprint);
    }
    function tree(x,z,size,species=0) {
      const h=size, tone=rand()<.5?'#6a9f50':'#569958';
      if(species===2){
        // Umbrella pine with a broad crown and forked terracotta trunk.
        put(cylinder,plain,'#996d49',x,h*.38,z,h*.055,h*.76,h*.055);
        for(const side of [-1,1])tube(x,h*.44,z,x+side*h*.24,h*.73,z+.25,h*.035,'#966849');
        put(ball,plain,'#477e57',x,h*.75,z,h*.57,h*.28,h*.47);
        put(ball,plain,'#79a95b',x-.9,h*.86,z-.4,h*.47,h*.235,h*.39);
      }else{
        put(cylinder,plain,'#9b7056',x,h*.32,z,h*.054,h*.65,h*.054);
        const scale=species===1?.24:.35;
        put(ball,plain,tone,x,h*.68,z,h*scale,h*.40,h*scale);
        put(ball,plain,species===1?'#85b261':'#8cba58',x-.5,h*.84,z-.25,h*scale*.8,h*.28,h*scale*.80);
        if(!species)put(ball,plain,'#73ac52',x+h*.18,h*.62,z+.1,h*.23,h*.24,h*.22);
      }
      shadow(x+.35,z-.25,h*.65,h*.57);
      shadow(x+h*.73,z-h*.27,h*(species===2?1.28:1.02),h*(species===2?1.05:.84));
      castFootprint([[x-.32,z-.35],[x+.3,z+.29],[x+h*.71+.46,z-h*.29+.33],[x+h*.71-.36,z-h*.29-.41]]);
    }
    if(sunport)for(const side of [-1,1]){
      for(let s=17;s<length;s+=range(19,26)){
        // Open waterfront promenades and park gaps reveal the large landmarks.
        const open=(side<0 && ((s>82&&s<235)||(s>length*.57&&s<length*.63))) || (side>0 && s>gates[1]+158&&s<gates[1]+232);
        const w=range(15,24),d=range(10,17),h=range(12,20);
        const p=roadside(s,side,22+d*.5+range(0,5));
        const r=Math.hypot(w,d)*.49;
        if(open || !available(p.x,p.z,r) || Math.abs(project(p.x,p.z).lateral)<halfWidth+d*.52+1.5) continue;
        const kind=Math.floor(rand()*shops.length);reserve(p.x,p.z,r);
        building(p.x,p.z,Math.atan2(side*p.tz,-side*p.tx),w,d,h,kind);
      }
      for(let s=16;s<length;s+=range(21,30)){
        const p=roadside(s,side,range(17.25,19.9));
        if(available(p.x,p.z,2.9))tree(p.x,p.z,range(7,10.3),Math.floor(rand()*3));
      }
    }
    // One-metre lamp fixtures, with pennants and benches alongside the footway.
    const flagColors=['#e66c46','#4cafa7','#f1bf58','#638daf'];
    function lamp(s,side){
      const p=roadside(s,side,halfWidth+2.1),arm=roadside(s,side,halfWidth+.95);
      if(nearWarning(p))return;
      radial(p.x,.25,p.z,.43,.5,'#778c88');radial(p.x,2.9,p.z,.13,5.45,'#527b7d');
      tube(p.x,5.42,p.z,arm.x,5.87,arm.z,.095,'#4b777b');
      radial(arm.x,5.73,arm.z,.35,.22,'#4c6d71');
      put(cloudBall,track.id==='metro'?unlit:plain,'#fff1b5',arm.x,5.49,arm.z,.28,.3,.28);
      if(side>0){
        const f=roadside(s,side,halfWidth+2.84);
        put(plate,plain,flagColors[Math.floor(s/32)%4],f.x,4.14,f.z,1.05,1.6,1,Math.atan2(-p.tx,-p.tz));
      }
    }
    if(sunport||night)for(let s=24;s<length;s+=32)for(const side of [-1,1])lamp(s+(side<0?11:0),side);
    if(sunport||night)for(let s=47;s<length;s+=78){
      const a=roadside(s,s%3>1?-1:1,17.1),yaw=Math.atan2(a.tx,a.tz);
      if(nearWarning(a))continue;
      box(a.x,.63,a.z,1.05,.21,2.3,'#a4774d',yaw);
      for(const k of [-1,1])box(a.x+k*a.tx*.77,.31,a.z+k*a.tz*.77,.65,.55,.15,'#647f79',yaw);
    }
    // The old port's clock faces, cornices and glazed copper roof.
    const clockFace=panelTexture(192,192,(c,w,h)=>{
      c.fillStyle='#527e7b';c.fillRect(0,0,w,h);c.translate(w/2,h/2);
      c.fillStyle='#f7d999';c.beginPath();c.arc(0,0,90,0,Math.PI*2);c.fill();
      c.fillStyle='#fff3d6';c.beginPath();c.arc(0,0,80,0,Math.PI*2);c.fill();
      c.strokeStyle='#4a635f';c.lineWidth=5;
      for(let i=0;i<12;i++){c.save();c.rotate(i*Math.PI/6);c.beginPath();c.moveTo(0,-70);c.lineTo(0,-60);c.stroke();c.restore();}
      c.lineCap='round';c.lineWidth=7;c.beginPath();c.moveTo(-34,-23);c.lineTo(0,0);c.lineTo(24,-47);c.stroke();
      c.fillStyle='#cc784e';c.beginPath();c.arc(0,0,6,0,Math.PI*2);c.fill();
    });
    function clockTower(x,z){
      box(x,5,z,13,10,13,'#e5a974');box(x,10.3,z,14,.8,14,'#fff1d3');
      box(x,17,z,9,13,9,'#edcb98');
      for(const i of [-1,1])for(const j of [-1,1])box(x+i*4.3,17,z+j*4.3,.72,13,.72,'#fff0d0');
      box(x,23.3,z,10,.78,10,'#986951');box(x,26.1,z,9.4,5.1,9.4,'#699a91');
      for(let j=0;j<4;j++){const yaw=j*Math.PI/2;put(plate,clockFace,'#fff',x+Math.sin(yaw)*4.72,26.15,z+Math.cos(yaw)*4.72,4.55,4.55,1,yaw);}
      box(x,28.9,z,11,.65,11,'#fbdfac');
      const towerRoof=new T.ConeGeometry(7.8,7.5,4);put(towerRoof,plain,'#568b87',x,32.75,z,1,1,1,Math.PI/4);
      radial(x,37,z,.17,2.7,'#986e4d');put(cloudBall,plain,'#ffce65',x,37.8,z,.42,.42,.42);
    }
    if(sunport)clockTower(52,-156);
    function lighthouse(x,z){
      radial(x,.7,z,6.1,1.5,'#dad6b8');
      for(let i=0;i<6;i++){
        const lower=4.8-i*.42,upper=lower-.42,g=new T.CylinderGeometry(upper,lower,4.3,16);
        put(g,plain,i%2?'#d75a48':'#feefcf',x,1.3+(i+.5)*4.3,z,1,1,1);
      }
      radial(x,27.3,z,3.55,.75,'#627d80');
      for(let i=0;i<10;i++){
        const a=i*Math.PI/5;radial(x+Math.cos(a)*2.05,28.9,z+Math.sin(a)*2.05,.13,2.8,'#805849');
      }
      put(cloudBall,plain,'#ffe699',x,28.8,z,1.35,1.55,1.35);
      radial(x,30.2,z,2.7,.33,'#f5cf9d');put(cone,plain,'#cf5a45',x,31.5,z,3.15,2.6,3.15);
      radial(x,33,z,.13,1.4,'#995b46');
    }
    if(sunport)lighthouse(-56,-164);
    function wheel(x,z){
      const y=26,r=21;
      for(const dz of [-2.6,2.6])for(const dx of [-10,10])tube(x+dx,.2,z+dz*1.7,x,y,z+dz,.74,'#db9a6a');
      for(const dz of [-2.45,2.45]){
        const ring=new T.TorusGeometry(r,.42,6,56);put(ring,plain,'#e8c596',x,y,z+dz,1,1,1);
      }
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,wx=x+r*Math.cos(a),wy=y+r*Math.sin(a);
        tube(x,y,z,wx,wy,z,.22,'#e1ac71');
        tube(wx,wy,z-2.5,wx,wy,z+2.5,.27,'#d9966a');
        tube(wx,wy,z,wx,wy-1.6,z,.14,'#8c796c');
        const ink=flagColors[i%4];box(wx,wy-2.32,z,2.5,1.35,2.6,ink);
        box(wx,wy-1.82,z,2.8,.15,2.85,'#ffe6bc');
      }
      put(cloudBall,plain,'#ecab5f',x,y,z+2.3,1.65,1.65,.65);
    }
    if(sunport)wheel(-48,-299);

    // The inlet is on the west of the circuit. Recess the water slightly
    // below the road and lift it above the meadow underlay.
    if(sunport){
      const inlet=new T.Mesh(new T.PlaneGeometry(845,1040),flatMaterial(0x58b8cb));
      inlet.rotation.x=-Math.PI/2;inlet.position.set(-478,-.105,-140);city.add(inlet);
      box(-55.7,.31,-140,1.45,1,900,'#9aa89a');
      for(let i=0;i<340;i++){
        const x=range(-410,-58),z=range(-510,240);
        box(x,-.063,z,range(1.1,6),.02,range(.1,.38),i%3?'#97d5d7':'#c5e7df');
      }
      function boat(x,z,ink,scale){
        put(ball,plain,ink,x,1.15*scale,z,2.3*scale,1.1*scale,6.4*scale);
        box(x,2*scale,z,3.3*scale,.36*scale,7.5*scale,'#e8cd9e');
        tube(x,2*scale,z,x,15*scale,z,.13*scale,'#906d54');
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute([.04,14,0,.04,3,-4.9,.04,3,0, 0,12,.15,0,3,.15,0,3,4.1],3));
        g.computeVertexNormals();const m=new T.Mesh(g,flatMaterial(ink==='#ca7062'?0xffe8bc:0xffc277));m.position.set(x,0,z);m.scale.setScalar(scale);city.add(m);
      }
      boat(-73,-107,'#ca7062',.85);boat(-96,-181,'#477f97',1.2);boat(-79,-217,'#ca7062',.92);
      for(const z of [-95,-190,-247]){
        box(-65,.62,z,20,.6,3.5,'#aa886a');
        for(const dx of [-8,-3,3,8])box(-65+dx,.18,z, .6,1.6,4.2,'#8e725c');
      }

    }
    function sign(text,small=false){
      return panelTexture(768,160,(c,w,h)=>{
        c.fillStyle='#225969';c.fillRect(0,0,w,h);
        c.fillStyle='#34848b';c.fillRect(7,7,w-14,h-14);
        c.fillStyle='#1e626d';c.beginPath();c.moveTo(w*.44,8);c.lineTo(w-8,8);c.lineTo(w-8,h-8);c.lineTo(w*.31,h-8);c.fill();
        c.strokeStyle='#f6c67c';c.lineWidth=4;c.strokeRect(13,13,w-26,h-26);
        for(const edge of [22,w-92])for(let j=0;j<5;j++)for(let i=0;i<3;i++){
          c.fillStyle=(i+j)%2?'#f6e6ba':'#315a65';c.fillRect(edge+i*21,28+j*21,21,21);
        }
        c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff2d4';c.font='italic bold '+(small?'64':'76')+'px Arial, sans-serif';
        c.fillText(text,w/2,81,550);c.fillStyle='#ffb957';c.fillRect(w*.4,h-32,w*.2,4);
      });
    }
    const grandPrix=sign(track.english.toUpperCase());
    // Start gantry, supporting trusses and five black starting lamps.
    const start=sample(0),startYaw=Math.atan2(-start.tx,-start.tz);
    for(const side of [-1,1]){
      const b=along(0,side*14.65);
      box(b.x,.64,b.z,2.28,1.3,2.8,'#f3d399');
      box(b.x,4.7,b.z,1.03,8.9,1.28,'#267783');
      box(b.x,2.25,b.z,1.14,1,1.43,'#ec8b54');box(b.x,7.8,b.z,1.32,.7,1.8,'#f0ab5a');
      tube(b.x,7.3,b.z,b.x-side*2.6,9.5,b.z,.19,'#f3c987');
    }
    box(start.x,9.65,start.z,31.5,1.15,1.5,'#397f87');
    for(const dz of [-.83,.83])put(plate,grandPrix,'#ffffff',start.x,9.75,start.z+dz,21.4,3.35,1,startYaw+(dz<0?Math.PI:0));
    box(0,7.86,0,5.85,.57,1.12,'#355663');
    for(let j=-2;j<=2;j++){put(cloudBall,plain,'#f6b55f',j*.86,7.85,.57,.27,.26,.15);}
    const check=canvas(768,64),cc=check.getContext('2d');
    for(let j=0;j<2;j++)for(let i=0;i<24;i++){cc.fillStyle=(i+j)%2?'#fdf1cd':'#354c58';cc.fillRect(i*32,j*32,32,32);}
    const finish=new T.Mesh(new T.PlaneGeometry(halfWidth*2,2.25),new T.MeshBasicMaterial({map:texture(check)}));
    finish.rotation.x=-Math.PI/2;finish.position.y=.025;city.add(finish);
    for(const x of gridLanes){
      box(x,.021,2.5,2.9,.012,.16,'#fae4ac');
      for(const dx of [-1.38,1.38])box(x+dx,.021,2.02,.15,.012,1,'#fae4ac');
    }
    // Mirror the painting, not the instance scale: all boards keep a forward
    // face, including left arrows on renderers that cull mirrored instances.
    function arrowFaces(w,h,paint){
      const faces={};
      for(const direction of [-1,1]){
        const face=panelTexture(w,h,c=>{
          if(direction<0){c.translate(w,0);c.scale(-1,1);}
          paint(c,w,h);
        });
        face.side=T.FrontSide;
        faces[direction]=face;
      }
      return faces;
    }
    const warningFace=arrowFaces(192,112,(c,w,h)=>{
      c.fillStyle='#243640';c.fillRect(0,0,w,h);
      c.strokeStyle='#ffd567';c.lineWidth=5;c.strokeRect(5,5,w-10,h-10);
      c.fillStyle='#ffe181';c.beginPath();c.moveTo(43,94);c.lineTo(43,66);
      c.quadraticCurveTo(43,32,83,32);c.lineTo(114,32);c.lineTo(114,15);
      c.lineTo(151,43);c.lineTo(114,73);c.lineTo(114,55);c.lineTo(86,55);
      c.quadraticCurveTo(66,55,66,71);c.lineTo(66,94);c.fill();
    });
    for(const q of warningSites){
      const yaw=Math.atan2(-q.tx,-q.tz);
      box(q.x,1.3,q.z,.26,2.6,.26,'#726955');
      box(q.x,3.65,q.z,5.8,3.35,.15,'#334550',yaw);
      put(plate,warningFace[q.direction],'#fff',q.x-q.tx*.09,3.65,q.z-q.tz*.09,5.8,3.35,1,yaw);
    }
    const chevron=arrowFaces(128,88,c=>{
      c.fillStyle='#324e56';c.fillRect(0,0,128,88);c.fillStyle='#ffce66';c.fillRect(4,4,120,80);
      c.fillStyle='#3e5357';c.beginPath();c.moveTo(36,13);c.lineTo(64,13);c.lineTo(95,44);c.lineTo(64,75);c.lineTo(36,75);c.lineTo(65,44);c.fill();
    });
    for(let s=15;s<length;s+=13){
      const a=sample(s-10),b=sample(s+10),bend=a.tx*b.tz-a.tz*b.tx;
      if(Math.abs(bend)<.19)continue;
      // Positive signed turning is to the right. Boards sit beyond the outside barrier.
      const side=bend>0?-1:1,q=roadside(s,side,halfWidth+2.7),toward=sample(s-13);
      const yaw=Math.atan2(toward.x-q.x,toward.z-q.z);
      box(q.x,1.5,q.z,.16,2.7,.16,'#837c67');
      put(plate,chevron[Math.sign(bend)],'#ffffff',q.x,2.65,q.z,2.8,1.7,1,yaw);
    }
    function bunting(s){
      const a=roadside(s,-1,15.8),b=roadside(s,1,15.8);
      for(const p of [a,b]){radial(p.x,5.1,p.z,.15,10.2,'#578c84');put(cloudBall,plain,'#f9bc61',p.x,10.3,p.z,.3,.3,.3);}
      const flagGeo=new T.BufferGeometry();flagGeo.setAttribute('position',new T.Float32BufferAttribute([-.5,.1,0,.5,.1,0,-.13,-1,0],3));flagGeo.computeVertexNormals();
      const cloth=new T.MeshLambertMaterial({side:T.DoubleSide});
      function flagPos(t){return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:10.15-5.4*t*(1-t)};}
      for(let i=0;i<18;i++){
        const p=flagPos(i/18),e=flagPos((i+1)/18),c=flagPos((i+.48)/18);
        tube(p.x,p.y,p.z,e.x,e.y,e.z,.038,'#7a8d82');
        put(flagGeo,cloth,flagColors[i%4],c.x,c.y-.08,c.z,1.35,1.18,1,Math.atan2(-a.tx,-a.tz));
      }
    }
    if(sunport){bunting(56);bunting(gates[1]+40);bunting(gates[3]+42);}

    // Café parasols, kiosks and flower troughs break up the waterfront promenade.
    function parasol(x,z,ink){
      radial(x,.25,z,.64,.34,'#b5a990');radial(x,1.75,z,.095,3.35,'#8c705e');
      const fabric=new T.ConeGeometry(2.22,.95,8,1,false);
      put(fabric,plain,ink,x,3.56,z,1,1,1);radial(x,3.07,z,2.1,.13,'#f6e4be');
      radial(x,1.02,z,1.16,.17,'#ebc58c');
      for(const a of [0,2.09,4.18]){const px=x+Math.cos(a)*1.6,pz=z+Math.sin(a)*1.6;radial(px,.59,pz,.36,.16,ink);radial(px,.32,pz,.11,.52,'#7b8070');}
      shadow(x+.3,z+.5,5.4,4.9);
    }
    if(sunport)for(let i=0;i<10;i++){
      const p=along(88+i*13,-range(21,26));
      if(available(p.x,p.z,2.25))parasol(p.x,p.z,flagColors[i%4]);
    }
    function planter(x,z,yaw){
      box(x,.52,z,4.55,.94,1.25,'#c58a63',yaw);box(x,.99,z,4.75,.17,1.47,'#edc198',yaw);
      const dx=Math.cos(yaw),dz=-Math.sin(yaw);
      for(let i=-2;i<=2;i++){
        put(ball,plain,'#6b9958',x+dx*i*.77,1.23,z+dz*i*.77,.67,.48,.52);
        put(ball,plain,i%2?'#f39a76':'#e9be5a',x+dx*i*.77+.1,1.63,z+dz*i*.77,.23,.19,.22);
      }
    }
    if(sunport)for(let s=38;s<length;s+=57){
      const side=Math.floor(s/57)%2?1:-1,p=roadside(s,side,17);
      if(nearWarning(p))continue;
      planter(p.x,p.z,Math.atan2(p.tz,p.tx)*-1);
    }
    if(!sunport)window.ClassicLandscapes.decorate(track,{
      T,city,plain,unlit,put,box,boxGeo,tube,radial,ball,cloudBall,cone,cylinder,plate,shadow,
      roof:hipRoof,roofMat,panelTexture,along,roadside,range,rand,pier,ribbon,warningSites
    });
    // Low-detail hills and roof silhouettes complete the horizon where streets open up.
    if(sunport){
      for(let i=0;i<76;i++){
        const a=i*Math.PI*2/76;
        let x=260+Math.cos(a)*range(550,695),z=-75+Math.sin(a)*range(545,700);
        const nearest=project(x,z),distance=Math.hypot(x-nearest.x,z-nearest.z);
        if(distance<150){x+=Math.cos(a)*(160-distance);z+=Math.sin(a)*(160-distance);}
        const h=range(28,66);
        put(ball,plain,i%3?'#a4c4aa':'#aecab0',x,-1,z,range(30,89),h,range(53,90));
      }
      for(let i=0;i<72;i++){
        const x=range(75,457),z=range(-374,72),w=range(13,28),h=range(12,29),d=range(13,23);
        const p=project(x,z);
        if(!available(x,z,19) || Math.abs(p.lateral)<42)continue;
        reserve(x,z,18);building(x,z,rand()<.55?0:Math.PI*.5,w,d,h,i%shops.length);
      }
      for(let i=0;i<120;i++){
        const x=range(-48,654),z=range(-502,334);
        const p=project(x,z);
        if(!available(x,z,4.2)||Math.abs(p.lateral)<23)continue;
        tree(x,z,range(7,13),i%3);
      }
      for(let i=0;i<52;i++){
        const x=range(-350,852),z=range(-788,492),y=range(67,111),size=range(7,12);
        for(let j=-1;j<=1;j++)put(cloudBall,unlit,j===0?'#fffbed':'#f1f8f0',x+j*size*.93,y+(j===0?1.5:0),z+j*1.3,size*range(.83,1.14),size*(j===0?.56:.38),size*.72);
      }
    }
    if(castVertices.length){
      const castGeo=new T.BufferGeometry();
      castGeo.setAttribute('position',new T.Float32BufferAttribute(castVertices,3));
      const cast=new T.Mesh(castGeo,new T.MeshBasicMaterial({color:0x586578,opacity:.22,transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true}));
      cast.renderOrder=-2;city.add(cast);
    }
    // All shop walls and awnings share two atlases. Merge the planar draws
    // within neighbourhoods, retaining colour variation and frustum culling.
    const atlasLookups=new Map();
    function atlas(materials,cols,rows,cellWidth,cellHeight){
      const surf=canvas(cols*cellWidth,rows*cellHeight),c=surf.getContext('2d');
      const material=new T.MeshBasicMaterial({map:texture(surf),side:T.DoubleSide,vertexColors:true});
      materials.forEach((original,i)=>{
        const col=i%cols,row=Math.floor(i/cols),left=col*cellWidth,top=row*cellHeight;
        // Gutter copies avoid seams in mipmapped distant storefronts.
        c.drawImage(original.map.image,left,top,cellWidth,cellHeight);
        atlasLookups.set(original,{material,u:(left+2)/surf.width,v:1-(top+cellHeight-2)/surf.height,
          uw:(cellWidth-4)/surf.width,vh:(cellHeight-4)/surf.height});
      });
    }
    if(sunport){atlas(facades.concat(sides),4,4,512,512);atlas(awningMat,4,2,128,64);}
    const panels=new Map(),vert=new T.Vector3(),normal=new T.Vector3(),sunDir=new T.Vector3(-.78,.32,.51).normalize();
    const tint=new T.Color('#cfdbdf'),panelColor=new T.Color();
    const quad=[[-.5,-.5,0,0],[.5,-.5,1,0],[.5,.5,1,1],[-.5,-.5,0,0],[.5,.5,1,1],[-.5,.5,0,1]];
    for(const [key,{geo,mat,parts}] of batches.entries()){
      const rect=atlasLookups.get(mat);
      if(rect){
        const k=rect.material.id+'/'+key.split('/').slice(2).join('/');
        let block=panels.get(k);if(!block){block={material:rect.material,p:[],uv:[],colors:[]};panels.set(k,block);}
        for(const [matrix] of parts){
          normal.set(0,0,1).transformDirection(matrix);const shadeRatio=(1-normal.dot(sunDir))*.45;
          for(const [x,y,u,v] of quad){
            vert.set(x,y,0).applyMatrix4(matrix);block.p.push(vert.x,vert.y,vert.z);
            block.uv.push(rect.u+u*rect.uw,rect.v+v*rect.vh);
            panelColor.set('#ffffff').lerp(tint,shadeRatio+(.5-y)*.13);
            block.colors.push(panelColor.r,panelColor.g,panelColor.b);
          }
        }
        continue;
      }
      const mesh=new T.InstancedMesh(geo,mat,parts.length);
      parts.forEach(([matrix,ink],i)=>{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,tempColor.set(ink));});
      mesh.computeBoundingSphere();city.add(mesh);
    }
    for(const {material,p,uv,colors} of panels.values()){
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));
      geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      city.add(new T.Mesh(geo,material));
    }
    return city;
  }
  window.ClassicCity = {tracks,track:tracks[0],build};
})();
