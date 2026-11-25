// Original room-scale toys and a sandy island shaped around its own circuit.
(() => {
  'use strict';
  const tau = Math.PI*2;
  const themes = {
    giant:{seed:642088, sky:['#9ebece','#bad3d8','#fff0d7','#e7c79e'],fog:0xdcccb7,fogNear:180,fogFar:725,
      skyLight:0xfff0dc,groundLight:0xbba897,ambient:1.53,sun:0xffe4bd,sunlight:1.65,
      asphalt:'#647680',pavers:0xd7b18c,ground:['#bd8c64','#c99365','#b68460'],bend:'#ce5d4f',kerb:'#4cad9b',rail:'#ca8a60',post:'#93654e'},
    beach:{seed:183742,sky:['#348fc8','#75d6e7','#ceeee6','#fbe5b6'],fog:0xb1dfdf,fogNear:220,fogFar:760,
      skyLight:0xfff6de,groundLight:0xadc8b6,ambient:1.56,sun:0xffe5ae,sunlight:1.83,
      asphalt:'#71848a',pavers:0xffdfb3,ground:['#edc88e','#e9b981','#f1d198'],bend:'#eb795e',kerb:'#32afa8',rail:'#83c4b4',post:'#907c61'}
  };

  function giant(track,d) {
    const {T,city,plain,unlit,put,box,cloudBall,plate,tube,radial,shadow,
      local,faceRoad,site,bounds,panelTexture,range} = d;
    const inks=['#d96855','#479f9a','#dea842','#5989bb','#a2739c'];
    // Brush marks, board joints, and knots are on the floor's own repeating UVs.
    const floor=panelTexture(512,512,(c,w,h)=>{
      for(let j=0;j<5;j++){
        const y=j*h/5, sh=h/5;
        c.fillStyle=['#cf986a','#d6a276','#ca9166','#d49e72','#d5a87b'][j];c.fillRect(0,y,w,sh+1);
        c.strokeStyle='rgba(119,64,40,.22)';c.lineWidth=2;c.beginPath();c.moveTo(0,y+1);c.lineTo(w,y+1);c.stroke();
        const joint=[61,402,158,322,247][j];c.fillStyle='rgba(119,72,47,.32)';c.fillRect(joint,y,2,sh);
        for(let k=0;k<23;k++){
          const x=range(-45,510),v=y+range(5,sh-5),len=range(20,145);
          c.strokeStyle=k%3?'rgba(255,217,153,.24)':'rgba(147,82,45,.23)';c.lineWidth=range(.5,2);
          c.beginPath();c.moveTo(x,v);c.bezierCurveTo(x+len*.4,v-3,x+len*.55,v+3,x+len,v);c.stroke();
        }
        const kx=[203,69,353,111,440][j];c.strokeStyle='rgba(145,85,53,.27)';c.lineWidth=2;
        for(const size of [1,1.6,2.2]){c.beginPath();c.ellipse(kx,y+48,13*size,2.3*size,0,0,tau);c.stroke();}
      }
    });
    const wallpaper=panelTexture(192,192,(c,w,h)=>{
      c.fillStyle='#a8c8c5';c.fillRect(0,0,w,h);
      for(const x of [5,95]){c.fillStyle='#9bbeba';c.fillRect(x,0,7,h);c.fillStyle='#c2d3c6';c.fillRect(x+11,0,2,h);}
      for(const [x,y] of [[50,38],[146,130]]){
        c.fillStyle='#d3d9bd';c.beginPath();c.moveTo(x,y-10);c.quadraticCurveTo(x+2,y-2,x+10,y);
        c.quadraticCurveTo(x+2,y+2,x,y+10);c.quadraticCurveTo(x-2,y+2,x-10,y);c.quadraticCurveTo(x-2,y-2,x,y-10);c.fill();
      }
    });
    function sheet(mat,w,h,repeatX,repeatY,x,y,z,rx,ry){
      mat.map.wrapS=mat.map.wrapT=T.RepeatWrapping;
      const geo=new T.PlaneGeometry(w,h),uv=geo.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*repeatX,uv.getY(i)*repeatY);
      const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,0,'YXZ');city.add(m);
    }
    const x0=bounds.minX-68,x1=bounds.maxX+72,z0=bounds.minZ-69,z1=bounds.maxZ+71;
    sheet(floor,x1-x0+8,z1-z0+8,(x1-x0)/73,(z1-z0)/73,(x0+x1)/2,-.112,(z0+z1)/2,-Math.PI/2,0);
    const roomX=(x0+x1)/2,roomZ=(z0+z1)/2,roomHeight=151;
    box(roomX,roomHeight+1,roomZ,x1-x0+3,2,z1-z0+3,'#e4d3b0');
    for(let x=x0+32;x<x1;x+=82)box(x,roomHeight-1,roomZ,3.8,2.15,z1-z0,'#cbb99c');
    for(const fx of [.20,.70])for(const fz of [.20,.66]){
      const x=x0+(x1-x0)*fx,z=z0+(z1-z0)*fz;
      radial(x,roomHeight-.9,z,4.1,1.7,'#ccaa76');radial(x,roomHeight-7,z,.32,13,'#9f8c72');
      put(d.cone,plain,'#96b3a0',x,roomHeight-16.8,z,7.6,6.9,7.6);
      radial(x,roomHeight-20.24,z,7.14,.19,'#f4d598');
      put(cloudBall,unlit,'#fff0be',x,roomHeight-20.6,z,2.0,1.4,2.0);
    }
    const windowView=panelTexture(512,256,(c,w,h)=>{
      const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#60a8d5');sky.addColorStop(1,'#d2e6d5');
      c.fillStyle=sky;c.fillRect(0,0,w,h);c.fillStyle='#fff1b4';c.beginPath();c.arc(381,67,30,0,tau);c.fill();
      for(const [x,y] of [[57,91],[197,46],[427,128]]){
        c.fillStyle='#f7f2dd';for(let j=0;j<3;j++){c.beginPath();c.ellipse(x+j*18,y-Math.sin(j*1.57)*7,18,10,0,0,tau);c.fill();}
      }
      for(let k=0;k<2;k++){
        c.fillStyle=k?'#82ae89':'#93bbb2';c.beginPath();c.moveTo(0,h);
        for(let x=0;x<=w;x+=4)c.lineTo(x,201+k*24+19*Math.sin(x*.016+k*2)+12*Math.sin(x*.023+1));
        c.lineTo(w,h);c.fill();
      }
    });
    const walls=[
      [{x:(x0+x1)/2,z:z0},0,x1-x0], [{x:(x0+x1)/2,z:z1},Math.PI,x1-x0],
      [{x:x0,z:(z0+z1)/2},Math.PI/2,z1-z0], [{x:x1,z:(z0+z1)/2},-Math.PI/2,z1-z0]
    ];
    for(const [p,yaw,span] of walls){
      const {point,block}=local(p,yaw);
      sheet(wallpaper,span,152,span/24,152/24,p.x,75.8,p.z,0,yaw);
      block(0,4.8,.35,span,9.8,1.8,'#aa7656');block(0,10.2,.70,span,1.22,2.3,'#f1d69f');
      for(const k of [-.27,.23]){
        const u=span*k,[x,z]=point(u,1.72),w=95,h=55,mid=72;
        block(u,mid,.92,w+6,h+6,1.4,'#e8c28b');
        put(plate,windowView,'#fff',x,mid,z,w,h,1,yaw);
        for(const dx of [-w/2,0,w/2])block(u+dx,mid,2.05,2.1,h+3,2,'#fff1ce');
        for(const dy of [-h/2,-3,h/2])block(u,mid+dy,2.15,w+3,2.1,2,'#fff1ce');
        block(u,mid-h/2-1.4,2.5,w+9,2.4,5.1,'#f2cf9e');
        for(const side of [-1,1])for(let j=0;j<4;j++){
          const [cx,cz]=point(u+side*(w/2-3+j*2.1),3.08);
          put(cloudBall,plain,j%2?'#d17b70':'#e79982',cx,mid+4,cz,2.55,33-j*1.1,1.9,yaw);
        }
      }
    }
    function blockArt(letter,color){
      return panelTexture(128,128,(c,w,h)=>{
        c.fillStyle=color;c.fillRect(0,0,w,h);c.strokeStyle='#fbe6ae';c.lineWidth=5;c.strokeRect(6,6,w-12,h-12);
        c.fillStyle='#fff0bd';c.font='bold 80px Georgia, serif';c.textAlign='center';c.textBaseline='middle';c.fillText(letter,64,68);
      });
    }
    const tiles=['A','B','C','D','E'].map((c,i)=>blockArt(c,inks[i]));
    function toyBlock(p,yaw,size,y,i){
      const {point,block}=local(p,yaw),h=size*.5;
      block(0,y+h,0,size,size,size,'#dfb574');
      for(let face=0;face<4;face++){
        const a=face*Math.PI/2,[x,z]=point(Math.sin(a)*(h+.025),Math.cos(a)*(h+.025));
        put(plate,tiles[i%5],'#fff',x,y+h,z,size*.87,size*.87,1,yaw+a);
      }
      block(0,y+size+.005,0,size*.87,.055,size*.87,inks[i%5]);
    }
    const cover=panelTexture(256,384,(c,w,h)=>{
      c.fillStyle='#344f76';c.fillRect(0,0,w,h);c.strokeStyle='#f2cc87';c.lineWidth=4;c.strokeRect(10,11,w-20,h-22);
      for(let j=0;j<36;j++){c.fillStyle=j%3?'#fbdda6':'#8fc2cb';c.beginPath();c.arc(range(18,w-18),range(68,h-28),range(1,3),0,tau);c.fill();}
      c.fillStyle='#df9972';c.beginPath();c.arc(62,281,37,0,tau);c.fill();c.strokeStyle='#f0c997';c.lineWidth=5;c.beginPath();c.ellipse(62,281,52,10,-.4,0,tau);c.stroke();
      c.save();c.translate(150,175);c.rotate(.4);
      c.fillStyle='#ec9254';c.beginPath();c.moveTo(-10,27);c.lineTo(0,76);c.lineTo(12,26);c.fill();
      c.fillStyle='#da6860';c.beginPath();c.moveTo(-12,0);c.lineTo(-30,42);c.lineTo(0,31);c.lineTo(29,42);c.lineTo(11,0);c.fill();
      c.fillStyle='#f8e9c3';c.beginPath();c.moveTo(0,-61);c.bezierCurveTo(19,-43,23,-12,11,27);c.lineTo(-11,27);c.bezierCurveTo(-23,-12,-19,-43,0,-61);c.fill();
      c.fillStyle='#578baf';c.beginPath();c.arc(0,-15,8,0,tau);c.fill();c.restore();
      c.font='bold 23px Georgia, serif';c.fillStyle='#fff0cc';c.textAlign='center';c.fillText('MOON VOYAGE',128,48);
    });
    function storybooks(p,yaw){
      const {block,point}=local(p,yaw);
      for(let j=0;j<3;j++){
        const y=j*2.75,u=(j%2)*1.1,v=(j%3)*.65;
        block(u,y+.2,v,18,.40,14,inks[(j+2)%5]);block(u,y+1.35,v-.18,17.4,2.0,13.2,'#f2dca6');
        for(let i=0;i<3;i++)block(u,y+.65+i*.61,v+6.48,17.1,.065,.04,'#c7a473');
        block(u,y+2.52,v,18,.4,14,inks[(j+2)%5]);
      }
      block(-2.9,18.1,-2.3,12.3,19.7,2.0,'#315377');block(-2.9,18.1,-2.12,11.6,18.9,2.22,'#e7cf9b');
      const [x,z]=point(-2.9,-.88);put(plate,cover,'#fff',x,18.1,z,12.4,19.8,1,yaw);shadow(p.x,p.z,25,19);
    }
    function spool(p,i){
      const r=range(3,5.4), h=r*2.4, ink=inks[i%5];
      radial(p.x,.62,p.z,r,1.24,'#dbaa74');radial(p.x,h*.5,p.z,r*.73,h-.5,ink);
      for(let k=1;k<10;k++)radial(p.x,h*k/10,p.z,r*(k%2?.755:.78),.18,k%2?ink:'#e4bd91');
      radial(p.x,h-.3,p.z,r,1.0,'#dfb583');radial(p.x,h+.22,p.z,r*.31,.08,'#835d48');shadow(p.x,p.z,r*2.5,r*2.1);
    }
    function furniture(p,yaw,kind){
      const {block,beam,point}=local(p,yaw);
      if(kind==='desk'){
        block(0,34.2,0,47,3.8,27,'#b57453');block(0,36.1,0,48,1.45,28,'#e3a775');
        block(0,29.8,0,44,6.5,24,'#c48a63');block(0,29.8,12.1,32,4.9,.6,'#da9e6c');
        const [x,z]=point(0,12.75);put(cloudBall,plain,'#d6ab62',x,29.7,z,1,.8,.7);
        for(const u of [-19,19])for(const v of [-10,10])beam(u,1,v,u*.94,32,v*.94,1.9,'#ae7654');
        for(const u of [-11,4,13]){const [x,z]=point(u,-2);toyBlock({x,z},yaw+u*.015,6.3,36.9,Math.abs(u)%5);}
        shadow(p.x,p.z,54,35);
      }else{
        block(0,18.8,0,18,2.7,17,'#65a193');block(0,20.1,.1,18.6,1.1,17.3,'#88b4a0');
        for(const u of [-7.2,7.2])for(const v of [-6.6,6.6])beam(u*1.14,.65,v*1.17,u,18,v,1.02,'#9c7557');
        for(const u of [-7.6,7.6])beam(u,19,-6.8,u,39,-8.1,.95,'#49877e');
        for(const h of [27,32.8,38])block(0,h,-7.7,17,3.6,1.7,'#74aca0');
        shadow(p.x,p.z,24,23);
      }
    }
    function drum(p){
      const r=10,h=14;
      radial(p.x,h/2,p.z,r,h,'#d76b5f');radial(p.x,.65,p.z,r+.45,1.3,'#ddb473');
      radial(p.x,h,p.z,r+.48,.93,'#d9ae6c');radial(p.x,h+.51,p.z,r-.45,.17,'#f0ddb1');
      for(let i=0;i<14;i++){
        const a=i*tau/14,b=(i+1)*tau/14;
        tube(p.x+r*Math.cos(a),i%2?1:13,p.z+r*Math.sin(a),p.x+r*Math.cos(b),i%2?13:1,p.z+r*Math.sin(b),.24,'#ffe0a0');
      }
      shadow(p.x,p.z,25,22);
    }
    // On the home straight the race actually passes under the drawing table.
    // Register the four feet as scenery sites. The beams under the tabletop
    // stay 19 metres above the road, clear of every camera and kart.
    function drawingTable(s){
      const p=track.sample(s),yaw=Math.atan2(-p.tx,-p.tz),{point,block,beam}=local(p,yaw);
      for(const u of [-27,27])for(const v of [-18,18]){
        const [x,z]=point(u,v);if(!d.clear({x,z},2.65))return;
      }
      for(const side of [-1,1])for(const along of [-18,18])site(s+along,side,27-track.halfWidth,2.65);
      for(const u of [-27,27])for(const v of [-18,18]){
        beam(u,1.1,v,u*.966,23.8,v*.96,1.65,'#ac7050');
        const [x,z]=point(u,v);radial(x,.8,z,2.14,1.62,'#ca8d61');shadow(x,z,6.5,6.5);
      }
      for(const u of [-26,26])block(u,21.1,0,2.1,4.2,38,'#b67b58');
      for(const v of [-17.4,17.4])block(0,21.1,v,53.5,4.2,2.2,'#cb895c');
      block(0,23.9,0,62,2.45,44,'#b67953');block(0,25.25,0,62.8,.94,44.8,'#e0a776');
      block(0,21.17,18.57,31.5,3.2,.48,'#df9e6e');
      for(const u of [-9,9]){
        const [x,z]=point(u,19.05);put(cloudBall,plain,'#e4bf78',x,21.23,z,.60,.56,.53);
      }
      const [x,z]=point(-17,-4);radial(x,26.32,z,4.0,1.15,'#568e84');
      tube(x,26.8,z,x+1.2,36.2,z,.49,'#b08b5d');tube(x+1.2,36.2,z,x+3.5,40.7,z,.45,'#b08b5d');
      put(d.cone,plain,'#6bad9e',x+3.5,38.8,z,4.7,4.8,4.7);shadow(p.x,p.z,65,43);
    }
    drawingTable(track.length-141);
    for(const [s,side,dist,r,kind] of [[72,-1,45,30,'desk'],[track.gates[1],1,50,30,'desk'],[track.gates[2]+60,-1,47,30,'desk'],
      [185,-1,27,16,'chair'],[track.gates[2]-40,-1,29,16,'chair'],[track.gates[3],1,30,16,'chair']]){
      const p=site(s,side,dist,r);if(p)furniture(p,faceRoad(p,side),kind);
    }
    for(let s=25,i=0;s<track.length;s+=range(38,57),i++){
      const side=i%2?1:-1, type=i%7, r=type===0?13:type===1?13:type<4?8:13;
      const p=site(s,side,r+range(8,16),r);if(!p)continue;
      const yaw=faceRoad(p,side)+range(-.22,.22);
      if(type===0)drum(p);
      else if(type===1||type===5)storybooks(p,yaw);
      else if(type===2||type===3)spool(p,i);
      else{
        const a=range(8.5,12);toyBlock(p,yaw,a,0,i);
        if(i%3)toyBlock(p,yaw+.16,a*.81,a+.05,i+1);
        shadow(p.x,p.z,a*1.55,a*1.3);
      }
    }
  }

  // A radial shoreline encloses every sample of the road, including the
  // right-hand diversions. The beach widens into coves between headlands.
  function beach(track,d) {
    const {T,city,plain,unlit,put,ball,cloudBall,cone,tube,radial,shadow,local,site,clear,faceRoad,range,rand}=d;
    const road=[];
    let cx=0,cz=0;
    for(let s=0;s<track.length;s+=4){
      const p=track.sample(s),extra=track.bypassAt(s).extra;
      const x=p.x-p.tz*extra/2,z=p.z+p.tx*extra/2;
      const margin=20+7.1*Math.sin(s*.019)+4.5*Math.sin(s*.034);
      road.push({x,z,r:track.halfWidth+extra/2+margin});cx+=x;cz+=z;
    }
    cx/=road.length;cz/=road.length;
    const shore=[];
    function coast(a,r){return{x:cx+r*Math.cos(a),z:cz+r*Math.sin(a)};}
    const n=256;
    for(let i=0;i<n;i++){
      const a=tau*i/n, dx=Math.cos(a),dz=Math.sin(a);
      let radius=0;
      for(const p of road){
        const x=p.x-cx,z=p.z-cz,dot=x*dx+z*dz,perp=x*dz-z*dx;
        if(Math.abs(perp)<=p.r)radius=Math.max(radius,dot+Math.sqrt(p.r*p.r-perp*perp));
      }
      shore.push({a,r:radius});
    }
    function drySand(p,r){
      const angle=(Math.atan2(p.z-cz,p.x-cx)+tau)%tau, ix=angle*n/tau, i=Math.floor(ix), f=ix-i;
      const edge=shore[i].r+(shore[(i+1)%n].r-shore[i].r)*f;
      return Math.hypot(p.x-cx,p.z-cz)+r<edge+2;
    }
    // Fade from a sloped, wet sand bank through the reef into deep water.
    const verts=[], colors=[], color=new T.Color();
    function triangle(a,b,c,ink){
      verts.push(...a,...b,...c);color.set(ink);
      for(let j=0;j<3;j++)colors.push(color.r,color.g,color.b);
    }
    const ring=(p,extend,y)=>{const w=coast(p.a,p.r+extend);return[w.x,y,w.z];};
    const wave=p=>Math.sin(p.a*17)*1.3+Math.sin(p.a*36)*.72;
    for(let i=0;i<n;i++){
      const a=shore[i],b=shore[(i+1)%n],wa=wave(a),wb=wave(b);
      const da=6+4*Math.sin(a.a*6),db=6+4*Math.sin(b.a*6);
      triangle([cx,-.135,cz],ring(a,0,-.135),ring(b,0,-.135),'#e9c58b');
      const bands=[
        [0,0,-.135,'#e9c58b'],[9+wa,9+wb,-.49,'#e6bf86'],[13+da+wa,13+db+wb,-1.19,'#d7b58b'],
        [15+da+wa,15+db+wb,-1.18,'#e0e4bf'],[21+da,21+db,-1.20,'#8bdbc7'],
        [37+da+wa,37+db+wb,-1.20,'#58c9ba'],[72+da*2,72+db*2,-1.20,'#3bb5b2'],
        [140+da*3,140+db*3,-1.20,'#309eab'],[1100,1100,-1.20,'#358da5']
      ];
      for(let j=1;j<bands.length;j++){
        const prev=bands[j-1],next=bands[j],a0=ring(a,prev[0],prev[2]),b0=ring(b,prev[1],prev[2]);
        const a1=ring(a,next[0],next[2]),b1=ring(b,next[1],next[2]);
        triangle(a0,a1,b0,next[3]);triangle(b0,a1,b1,next[3]);
      }
      if(i%19<13){
        const a0=ring(a,23+da+wa,-1.15),b0=ring(b,23+db+wb,-1.15);
        const w=.18+.6*Math.sin(Math.PI*(i%19)/13),a1=ring(a,23+da+wa+w,-1.15),b1=ring(b,23+db+wb+w,-1.15);
        triangle(a0,a1,b0,'#e4efe0');triangle(b0,a1,b1,'#e4efe0');
      }
    }
    const sandSea=new T.BufferGeometry();sandSea.setAttribute('position',new T.Float32BufferAttribute(verts,3));
    sandSea.setAttribute('color',new T.Float32BufferAttribute(colors,3));sandSea.computeBoundingSphere();
    const water=new T.Mesh(sandSea,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide}));water.name='Sand island, surf and coral shelf';city.add(water);

    function geometry(triangles){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(triangles,3));g.computeVertexNormals();return g;
    }
    const cloth=new T.MeshLambertMaterial({color:0xffffff,side:T.DoubleSide,flatShading:true});
    // Palm leaflets form a tapered sawtooth edge around a raised curved spine.
    const leafVertices=[];
    function leaf(t,k){
      const w=Math.sin(Math.PI*t)**.65*(.15+(k%2?.46:.76))+.015*(1-t);
      return {w,y:1.04*t+1.7*Math.sin(t*Math.PI)-.4*t*t,z:t*5.7};
    }
    for(let i=0;i<16;i++){
      const a=leaf(i/16,i),b=leaf((i+1)/16,i+1);
      for(const side of [-1,1]){
        const mid=[0,a.y+.11,a.z],tip=[0,b.y+.11,b.z];
        const left=[side*a.w,a.y-a.w*.4,a.z],right=[side*b.w,b.y-b.w*.4,b.z];
        leafVertices.push(...mid,...left,...tip,...tip,...left,...right);
      }
    }
    const frond=geometry(leafVertices);
    function palm(p,h,heading){
      const sway=h*.18,dx=Math.sin(heading)*sway,dz=Math.cos(heading)*sway;
      const trunk=t=>[p.x+dx*t*t,h*t,p.z+dz*t*t];
      for(let i=0;i<6;i++){
        const a=trunk(i/6),b=trunk((i+1)/6);
        tube(...a,...b,h*(.031-.012*i/6),'#ad815d');
        radial(a[0],a[1]+.14,a[2],h*(.032-.012*i/6),.23,'#ce9d71');
      }
      const [x,y,z]=trunk(1),scale=h*.087;
      for(let k=0;k<10;k++)put(frond,cloth,['#378a71','#519a63','#42845e','#6ca45e'][k%4],x,y,z,
        scale,scale*(.73+(k%3)*.19),scale*(.86+(k%4)*.08),heading+k*tau/10,(k%2)*.15);
      for(let k=0;k<3;k++)put(cloudBall,plain,'#966847',x+Math.sin(k*2.1)*.37,y-.29,z+Math.cos(k*2.1)*.37,.42,.49,.42);
      shadow(p.x+dx*.25,p.z+dz*.25,h*.57,h*.41);
    }
    // A stitched canopy with alternating wedges and scalloped valances.
    const fabric=[];
    for(let j=0;j<4;j++){
      const a=j*Math.PI/16,b=(j+1)*Math.PI/16;
      const point=(t,angle,y)=>[Math.cos(angle)*t,y,Math.sin(angle)*t];
      const a1=point(.48,a,.49),b1=point(.48,b,.49),a2=point(1,a,.1),b2=point(1,b,.1);
      const al=point(1,a,-.03-.11*Math.sin(j*Math.PI/4)),bl=point(1,b,-.03-.11*Math.sin((j+1)*Math.PI/4));
      fabric.push(0,.68,0,...a1,...b1,...a1,...a2,...b1,...b1,...a2,...b2,...a2,...al,...b2,...b2,...al,...bl);
    }
    const wedge=geometry(fabric);
    function parasol(p,yaw,i){
      const ink=['#ed8267','#4ca6ad','#e4b750','#db827c'][i%4], r=range(2.8,4.2), h=r*1.21;
      radial(p.x,h/2,p.z,.10,h,'#997650');
      for(let k=0;k<8;k++)put(wedge,cloth,k%2?'#ffe9b7':ink,p.x,h,p.z,r,r*.7,r,yaw+k*Math.PI/4);
      put(cloudBall,plain,'#d89056',p.x,h+r*.47,p.z,.19,.16,.19);
      const {block,beam}=local(p,yaw);
      for(const u of [-1.2,1.3]){
        // Reclining fabric beach chairs have slatted seats and crossed frames.
        block(u,.5,.4,1.06,.15,1.54,'#f0cd94');
        for(const edge of [-.53,.53]){
          beam(u+edge,.07,.97,u+edge,1.59,-.67,.073,'#a17b59');
          beam(u+edge,.07,-.80,u+edge,.60,.76,.073,'#b28d64');
        }
        for(let j=0;j<6;j++)block(u,.55+j*.16,-.16-j*.085,1.07,.17,.10,j%2?ink:'#fff0bf');
      }
      shadow(p.x,p.z,r*2.20,r*1.95);
    }
    const hullGeometry=geometry([
      0,.06,-3.3, -1,.36,-.6, 0,-.46,-.55, 0,.06,-3.3, 0,-.46,-.55, 1,.36,-.6,
      -1,.36,-.6, -.76,.32,2.2, 0,-.46,-.55, 0,-.46,-.55, -.76,.32,2.2, 0,-.18,2.15,
      1,.36,-.6, 0,-.46,-.55, .76,.32,2.2, .76,.32,2.2, 0,-.46,-.55, 0,-.18,2.15,
      -.76,.32,2.2, .76,.32,2.2, 0,-.18,2.15,
      0,.06,-3.3, 1,.36,-.6, -1,.36,-.6, -1,.36,-.6, 1,.36,-.6, -.76,.32,2.2,
      -.76,.32,2.2, 1,.36,-.6, .76,.32,2.2
    ]);
    const mainsail=geometry([0,4.9,-.14, .25,1.7,.66, 0,.89,1.95, 0,4.9,-.14, 0,1.04,-.14, .25,1.7,.66, 0,1.04,-.14, 0,.89,1.95, .25,1.7,.66]);
    const jib=geometry([0,4.5,-.23, 0,1.12,-2.34, .22,1.25,-.70, 0,4.5,-.23, .22,1.25,-.70, 0,1.02,-.24]);
    function sailboat(p,i){
      const yaw=range(-2.8,2.8),sc=range(1.8,3.3),y=-.68;
      const ink=['#bd6955','#497e96','#d89f4d'][i%3];
      put(hullGeometry,cloth,ink,p.x,y,p.z,sc,sc,sc,yaw);
      const l=local(p,yaw),[x,z]=l.point(0,-.16*sc);
      radial(x,y+2.65*sc,z,.06*sc,4.94*sc,'#95795f');
      put(mainsail,cloth,i%2?'#fff1ca':'#f7bc72',p.x,y,p.z,sc,sc,sc,yaw);
      put(jib,cloth,i%2?'#ecab7a':'#f8e5bf',p.x,y,p.z,sc,sc,sc,yaw);
    }
    function lighthouse(p){
      const r=5.5,h=27;
      const rim=new T.CylinderGeometry(.92,1,1,18);
      radial(p.x,.84,p.z,8,1.76,'#cfb59b');
      for(let i=0;i<5;i++){
        const radius=r*Math.pow(.92,i);
        put(rim,plain,i%2?'#db7766':'#ffedc5',p.x,1.72+(i+.5)*h/5,p.z,radius,h/5,radius);
      }
      radial(p.x,29,p.z,4.7,.75,'#587f83');radial(p.x,29.6,p.z,4.65,.38,'#f5d399');
      for(let i=0;i<12;i++){
        const a=i*tau/12,b=(i+1)*tau/12;
        const x=p.x+Math.sin(a)*4.35,z=p.z+Math.cos(a)*4.35;
        radial(x,30.25,z,.09,1.3,'#66898b');
        tube(x,30.85,z,p.x+Math.sin(b)*4.35,30.85,p.z+Math.cos(b)*4.35,.09,'#66898b');
        if(i%2===0)radial(p.x+Math.sin(a)*2.67,31.83,p.z+Math.cos(a)*2.67,.16,4.4,'#527876');
      }
      put(cloudBall,unlit,'#ffde88',p.x,31.8,p.z,1.8,2.1,1.8);
      radial(p.x,34.1,p.z,3.45,.45,'#466f77');put(cone,plain,'#c76654',p.x,35.7,p.z,4.1,3.05,4.1);
      radial(p.x,38,p.z,.14,1.7,'#856a54');shadow(p.x,p.z,17,14);
    }
    for(const [dist,side] of [[204,1],[track.gates[3]+43,1]]){
      const p=site(dist,side,20,8.7);if(p)lighthouse(p);
    }
    // Offshore limestone cays make a different skyline on the two long coasts.
    for(const [index,scale] of [[55,1],[211,1.28]]){
      const heading=shore[index],p=coast(heading.a,heading.r+105),yaw=heading.a+.7;
      if(!clear(p,34*scale))continue;
      put(cloudBall,plain,'#eed39a',p.x,-1.33,p.z,31*scale,4.2*scale,15*scale,yaw);
      put(ball,plain,'#b79b87',p.x,1.4*scale,p.z,19*scale,11*scale,9*scale,yaw);
      put(ball,plain,'#88aa85',p.x,7.1*scale,p.z,15*scale,6.8*scale,8.8*scale,yaw);
      const {point}=local(p,yaw);
      for(const [u,v,h] of [[-19,1,9],[19,-2,11],[23,1,7]]){
        const [x,z]=point(u*scale,v*scale);palm({x,z},h*scale,yaw+u);
      }
    }
    for(let i=0;i<n;i++){
      const p=shore[i];
      if(i%19===7)sailboat(coast(p.a,p.r+range(52,99)),i);
      // Low, wind-shaped rock clusters break up the north and west headlands.
      if(i%5===0 && (p.a>2.35&&p.a<3.9||p.a>4.8&&p.a<5.5)){
        const rock=coast(p.a,p.r+range(8,26));
        if(clear(rock,6.6))for(let k=0;k<3;k++)put(ball,plain,['#b18579','#bd9982','#a77970'][k],
          rock.x+range(-2.2,2.2),-.64,rock.z+range(-1.6,1.6),range(1.6,3.4),range(1.6,4.08),range(2,3.5),range(0,6));
      }
      if(i%2===0) {
        const p1=coast(p.a,p.r+range(26,102));
        put(cloudBall,unlit,'#a7dcd2',p1.x,-1.13,p1.z,range(.7,2.5),.022,.13,p.a+.5);
      }
    }
    for(const side of [-1,1])for(let s=14,i=side+2;s<track.length;s+=range(17,31),i++){
      // Palms and chairs stay on the dry, route-facing part of the sand.
      const radius=i%4===0?5.1:7.3,p=site(s,side,range(9,16),radius);
      if(!p || !drySand(p,radius*.65))continue;
      if(i%4===0)parasol(p,faceRoad(p,side)+range(-.5,.5),i>>2);
      else palm(p,range(8.5,15.4),range(0,tau));
    }
    for(const side of [-1,1])for(let s=33;s<track.length;s+=range(39,71)){
      const r=range(6,11),p=site(s,side,range(23,39),r);
      if(!p || !drySand(p,r))continue;
      const h=range(1.25,3.0),yaw=range(0,tau);
      put(cloudBall,plain,'#eac88b',p.x,-.24,p.z,r*.97,h,r*.60,yaw);
      const hill=local(p,yaw);
      for(let k=0;k<5;k++){
        const u=range(-r*.64,r*.64),v=range(-r*.25,r*.25),[x,z]=hill.point(u,v);
        const y=-.24+h*Math.sqrt(Math.max(0,1-(u/(r*.97))**2-(v/(r*.6))**2));
        for(let j=-1;j<=1;j++)put(cone,plain,j?'#a6ac75':'#879d74',x+j*.27,y+.36,z,.18,.98,.19,yaw,0,j*.42);
      }
    }
    for(let i=0;i<30;i++){
      const cloud=shore[(i*19)%n],p=coast(cloud.a,cloud.r+range(120,260)),y=range(43,80),s=range(4.5,8.5);
      for(let k=-1;k<=1;k++)put(cloudBall,unlit,k?'#e8f3e7':'#fff9e9',p.x+k*s,y+(k?0:s*.21),p.z+k*.6,s*(k?.79:1.1),s*(k?.38:.6),s*.68);
    }
  }

  function decorate(track,d){
    if(track.id==='giant')giant(track,d);
    if(track.id==='beach')beach(track,d);
  }
  window.ClassicExtraWorlds={themes,decorate};
})();
