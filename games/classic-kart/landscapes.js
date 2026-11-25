// Course palettes and original scenery. All roadside props use the selected course's geometry.
(() => {
  'use strict';
  const themes = {
    sunport: {
      seed:7331, sky:['#4099e7','#86d4f5','#d3f0f3','#deefdf'], fog:0xc7e8ec, fogNear:155, fogFar:515,
      skyLight:0xfffaf1,groundLight:0xabb8c7,ambient:1.66,sun:0xfff1d3,sunlight:2.05,
      asphalt:'#64768a',pavers:0xffffff,ground:['#a2c776','#99c16e','#afcc80'],bend:'#e66149',kerb:'#4cbeb0',rail:'#7baba8',post:'#5c7e7c'
    },
    dunes: {
      seed:74329, sky:['#5ba6d8','#98d4e8','#ffdfb0','#f8d3a0'], fog:0xeccda6, fogNear:155, fogFar:530,
      skyLight:0xffefd4,groundLight:0xc1a38b,ambient:1.42,sun:0xffdfac,sunlight:1.7,
      asphalt:'#ac8260',pavers:0xcaaf90,ground:['#dea875','#e2b47e','#cc966c'],bend:'#b84c38',kerb:'#c67a4c',rail:'#a77453',post:'#785740'
    },
    metro: {
      seed:85363, sky:['#182e62','#41578e','#a581a1','#e5a294'], fog:0x847d9c, fogNear:160, fogFar:555,
      skyLight:0xe0e7ff,groundLight:0x8c9abd,ambient:1.60,sun:0xffdfcf,sunlight:1.03,
      asphalt:'#626e84',pavers:0xa3acc0,ground:['#626f77','#626a73','#727f82'],bend:'#ea926c',kerb:'#7dafc3',rail:'#809bab',post:'#586c87'
    }
  };

  function decorate(track, d) {
    const {T,city,plain,unlit,put,box,boxGeo,tube,radial,ball,cloudBall,cone,plate,shadow,roof,roofMat,panelTexture,roadside,range,rand}=d;
    // Spatially check the full width of every road (including nearby parallel straights and the forks).
    const road=[], occupied=[];
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(let s=0;s<track.length;s+=5){
      const p=track.sample(s), extra=track.bypassAt(s).extra;
      road.push({x:p.x-p.tz*extra/2,z:p.z+p.tx*extra/2,r:track.halfWidth+extra/2+2});
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
    }
    function clear(p,r){
      return road.every(a=>(a.x-p.x)**2+(a.z-p.z)**2>(a.r+r)**2);
    }
    function site(s,side,setback,r){
      const p=roadside(s,side,track.halfWidth+setback);
      if(!clear(p,r)||occupied.some(a=>(a.x-p.x)**2+(a.z-p.z)**2<(r+a.r)**2))return null;
      occupied.push({x:p.x,z:p.z,r}); return p;
    }
    function local(p,yaw){
      const sn=Math.sin(yaw),cs=Math.cos(yaw);
      const point=(u,v)=>[p.x+u*cs+v*sn,p.z-u*sn+v*cs];
      const block=(u,y,v,w,h,l,color,glow=false)=>{
        const [x,z]=point(u,v); put(boxGeo,glow?unlit:plain,color,x,y,z,w,h,l,yaw);
      };
      const beam=(u,y,v,U,Y,V,r,color)=>{
        const [x,z]=point(u,v),[X,Z]=point(U,V);tube(x,y,z,X,Y,Z,r,color);
      };
      return {point,block,beam};
    }
    const faceRoad=(p,side)=>Math.atan2(side*p.tz,-side*p.tx);
    const sign=(text,background,ink)=>panelTexture(384,96,(c,w,h)=>{
      c.fillStyle=background;c.fillRect(0,0,w,h);c.strokeStyle=ink;c.lineWidth=3;c.strokeRect(5,5,w-10,h-10);
      c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';c.font='bold 55px sans-serif';c.fillText(text,w/2,h*.52,w*.91);
    });
    const context={...d,site,clear,local,faceRoad,sign,bounds:{minX,maxX,minZ,maxZ}};
    if(track.id==='giant'||track.id==='beach'){
      window.ClassicExtraWorlds.decorate(track,context);return;
    }
    if(track.id==='dunes'){
      // Broad sediment shelves with receding, irregular crowns and a pale cap of hard limestone.
      const chip=new T.DodecahedronGeometry(1);
      function rockProfile(variant){
        const vertices=[],corners=[],n=8;
        for(let j=0;j<n;j++){
          const a=Math.PI*2*j/n+.12*Math.sin(2*j+variant),r=.88+.13*Math.cos(2*j+variant)+.06*Math.sin(3*j-variant);
          corners.push([r*Math.cos(a),r*Math.sin(a)]);
        }
        function at(j,top){
          const [x,z]=corners[j%n],tilt=x*.08+z*.05;
          return top ? [x*.91+.03,.51+tilt,z*.91+.025] : [x,-.53+tilt,z];
        }
        for(let j=0;j<n;j++){
          const a=at(j,false),b=at(j,true),c=at(j+1,false),e=at(j+1,true);
          vertices.push(...a,...b,...c,...b,...e,...c,...e,...b,0,.52,0);
        }
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
      }
      const rocks=[0,1,2].map(rockProfile);
      const beds=['#a8573f','#c56f49','#dc8c5b','#bb6749','#edb47a','#c57c54'];
      function mesa(p,r,h,yaw){
        const variant=Math.floor(rand()*3),g=rocks[variant],lean=range(-.13,.13),shelf=range(.54,.8);
        const layers=[.18,.23,.075,.31,.062,.143],widths=[1,.91,.88,shelf+.04,shelf+.06,shelf-.018];let bottom=0;
        for(let i=0;i<layers.length;i++){
          const thick=h*layers[i],off=bottom/h*r*lean;
          put(g,plain,beds[i],p.x+off,bottom+thick/2-.15,p.z+off*.5,r*widths[i],thick*1.07+.12,r*widths[i]*.81,yaw);bottom+=thick;
        }
        if(r>12 && variant!==1){
          const cap=r*(.25+.08*variant),x=p.x+r*.13,z=p.z-r*.10;
          put(g,plain,'#cf8156',x,h+h*.08-.4,z,cap,h*.18,cap*.91,yaw);
          put(g,plain,'#e6ad78',x,h+h*.176-.4,z,cap*1.03,h*.035,cap*.96,yaw);
        }
      }
      const sandstoneWall=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
      function arch(s){
        // A freestanding sandstone arch spans the course. The spring line sits above even the outer guardrails.
        const a=roadside(s,-1,track.halfWidth+10),b=roadside(s,1,track.halfWidth+10);
        if(!clear(a,6.1)||!clear(b,6.1))return;
        const dx=b.x-a.x,dz=b.z-a.z,span=Math.hypot(dx,dz),ux=dx/span,uz=dz/span;
        const cx=(a.x+b.x)*.5,cz=(a.z+b.z)*.5,r=span*.5,innerH=11.7;
        const positions=[],colors=[],col=new T.Color();
        for(let i=0;i<14;i++){
          const u=Math.PI*i/14,v=Math.PI*(i+1)/14;
          function point(angle,outer,depth){
            const rise=Math.sin(angle),wear=.65*Math.sin(3*angle)+.36*Math.sin(7*angle+.5);
            const thickness=3.4+1.52*Math.cos(2*angle-.5)+1.05*Math.sin(5*angle+.4),radius=r+(outer?thickness:0);
            const offset=Math.cos(angle)*radius+rise*(1.7*Math.sin(2*angle)+.6);
            const y=7.5+rise*(innerH+wear*2.9+(outer?thickness+1.2*Math.sin(8*angle):0));
            const depthShift=.53*Math.cos(4*angle)+rise*.48*Math.sin(7*angle);
            return [cx+ux*offset-uz*(depth+depthShift),y,cz+uz*offset+ux*(depth+depthShift)];
          }
          const pts=[point(u,false,-2.65),point(v,false,-2.65),point(v,true,-2.65),point(u,true,-2.65),point(u,false,2.65),point(v,false,2.65),point(v,true,2.65),point(u,true,2.65)];
          for(const [ids,ink] of [[[0,1,2,0,2,3,4,6,5,4,7,6],i%3?'#d78c60':'#e5a273'],[[2,3,7,2,7,6],'#edba81'],[[0,5,1,0,4,5],'#b26e51']]){
            col.set(ink);for(const j of ids){positions.push(...pts[j]);colors.push(col.r,col.g,col.b);}
          }
        }
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();city.add(new T.Mesh(g,sandstoneWall));
        for(const p of [a,b]){mesa(p,6.0,9.2,Math.atan2(dz,dx));occupied.push({x:p.x,z:p.z,r:6.5});}
      }
      arch(102);arch(track.gates[2]+96);
      for(const side of [-1,1])for(let s=23;s<track.length;s+=range(26,49)){
        const r=range(9,19),p=site(s,side,r+range(10,23),r*1.06);if(p)mesa(p,r,range(12,29),range(0,2));
        const big=range(22,42),q=site(s,side,big+range(46,78),big*1.06);if(q)mesa(q,big,range(29,61),range(0,2));
      }
      function cactus(p,h){
        const skin=rand()<.5?'#578863':'#71915f';
        radial(p.x,h*.48,p.z,h*.102,h*.96,skin);put(cloudBall,plain,skin,p.x,h*.96,p.z,h*.102,h*.105,h*.102);
        const yaw=range(0,Math.PI),{point,beam}=local(p,yaw);
        for(const k of [-1,1]){
          const f=k<0?.36:.55,[x,z]=point(k*h*.29,0),top=h*(f+.26);
          beam(k*h*.04,h*f,0,k*h*.29,h*(f+.08),0,h*.068,skin);radial(x,(top+h*(f+.08))*.5,z,h*.070,h*.18,skin);
          put(cloudBall,plain,skin,x,top,z,h*.071,h*.074,h*.071);
        }
        if(rand()<.4)put(ball,plain,'#ec986d',p.x+.07,h*1.055,p.z,.22,.18,.23);
      }
      for(const side of [-1,1])for(let s=8;s<track.length;s+=range(9,17)){
        const p=site(s,side,range(6.5,18),2.5);if(!p)continue;
        if(rand()<.64){const h=range(2.9,6);cactus(p,h);shadow(p.x+.15,p.z,h*.53,h*.43);}
        else {const h=range(.38,1.4);put(chip,plain,'#d59466',p.x,h*.62,p.z,h*1.45,h,h*.95,range(0,3));}
      }
      const cx=(minX+maxX)*.5,cz=(minZ+maxZ)*.5;
      for(let i=0;i<30;i++){
        const a=i*Math.PI*2/30,dx=Math.cos(a),dz=Math.sin(a),r=range(28,54);
        const edge=Math.min((maxX-minX)*.5/Math.max(.001,Math.abs(dx)),(maxZ-minZ)*.5/Math.max(.001,Math.abs(dz)));
        const dist=edge+r+range(78,130);mesa({x:cx+dx*dist,z:cz+dz*dist},r,range(27,68),range(0,3));
      }
      return;
    }

    // Downtown façades combine relief, rooftop equipment and hand-drawn window patterns.
    const neons=['#ff8eb3','#7ee7e4','#e8b0ff','#f6c86d'];
    const walls=['#505779','#52617f','#525e7c','#665977'];
    const logos=['NOVA PLAZA','LUMEN','NEON CITY','STUDIO 08','MIDNIGHT'];
    const displays=logos.map((label,i)=>sign(label,['#3c3554','#264557','#4a355c'][i%3],neons[i%4]));
    const facades=walls.map((wall,i)=>panelTexture(256,512,(c,w,h)=>{
      c.fillStyle=wall;c.fillRect(0,0,w,h);
      for(let row=0;row<13;row++)for(let col=0;col<5;col++){
        const x=col*48+12,y=row*38+10,n=(row*31+col*23+i*7+row*col*9)%17;
        c.fillStyle='#3f4763';c.fillRect(x-2,y-2,40,28);
        c.fillStyle=['#f3c990','#aecad6','#435774','#e4a7bd','#536580','#354661','#65718a'][n%7];c.fillRect(x,y,36,23);
        c.fillStyle='rgba(38,42,66,.66)';c.fillRect(x+17,y,2,23);c.fillRect(x,y+5,36,2);
      }
      c.fillStyle='rgba(36,44,67,.60)';for(let y=0;y<h;y+=38)c.fillRect(0,y,w,3);
    }));
    function highrise(p,side,i,near){
      const yaw=faceRoad(p,side),{block,point}=local(p,yaw),k=i%4,w=near?range(12,17):range(15,24),l=near?range(9,12):range(13,19);
      const h=near?range(15,36):range(38,70),base=near?4.8:2.2;
      block(0,base*.5,0,w+.7,base,l+.65,'#6d6880');block(0,base+.19,0,w+.85,.44,l+.82,'#a9a7b5');
      block(0,base+h/2,0,w,h,l,walls[k]);
      for(const n of [-1,1]){
        let [x,z]=point(0,n*(l*.5+.035));put(plate,facades[k],'#fff',x,base+h*.5,z,w-.5,h-.2,1,yaw+(n<0?Math.PI:0));
        [x,z]=point(n*(w*.5+.035),0);put(plate,facades[(k+1)%4],'#fff',x,base+h*.5,z,l-.5,h-.2,1,yaw+n*Math.PI/2);
      }
      for(const u of [-1,1])block(u*(w*.5-.13),base+h*.5,l*.5+.12,.17,h*.98,.12,neons[k],true);
      block(0,base+h+.24,0,w+.36,.45,l+.38,neons[k],true);
      block(0,base+h+1.2,0,w*.72,2.2,l*.68,'#6d718b');block(w*.25,base+h+2.6,0,1.4,2.2,2.0,'#9097a7');
      if(near){
        for(const u of [-.31,0,.31]){block(u*w,1.65,l*.5+.38,w*.24,2.9,.2,'#38465c');block(u*w,2.68,l*.5+.51,w*.21,.35,.12,'#e6b58e',true);}
        const [x,z]=point(0,l*.5+.58);put(plate,displays[i%5],'#fff',x,3.89,z,w*.84,1.46,1,yaw);
        if(i%3===0){const [X,Z]=point(w*.32,l*.5+.1);put(plate,displays[(i+1)%5],'#fff',X,base+h*.78,Z,w*.52,2.2,1,yaw);}
        shadow(p.x,p.z,w+3,l+3);
      }
    }
    // The elevated commuter line physically clears both road edges. Its platforms and towers stand beyond the sidewalks.
    function metroViaduct(s){
      const a=roadside(s,-1,track.halfWidth+25),b=roadside(s,1,track.halfWidth+25);
      if(!clear(a,4.7)||!clear(b,4.7))return;
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),p={x:(a.x+b.x)*.5,z:(a.z+b.z)*.5};
      const yaw=Math.atan2(-dz,dx),{block}=local(p,yaw);
      for(const k of [-1,1]){
        block(k*len*.5,5.3,0,2.8,10.6,3.1,'#788194');block(k*len*.5,10.55,0,3.4,1.2,6.2,'#83909c');
        occupied.push({...(k<0?a:b),r:4.6});
      }
      block(0,11.2,0,len+10,.84,5.2,'#79849a');
      for(const v of [-2.4,2.4]){block(0,11.98,v,len+10,1.15,.26,'#737b94');block(0,12.45,v,len+10,.13,.29,'#b4d7db',true);}
      for(let car=-1;car<=1;car++){
        const u=car*10.45;block(u,13.72,0,10.1,3.15,3.35,'#d5d1ce');block(u,12.71,0,10.16,.51,3.42,'#c76c91');
        block(u,15.36,0,9.5,.37,3.05,'#8e9aa9');
        for(const v of [-1.69,1.69])for(const i of [-3.6,-1.8,0,1.8,3.6])block(u+i,14.07,v,1.35,1.13,.09,'#c5e1ea',true);
      }
    }
    // A tiered jade tower rises above the smaller blocks on the opening boulevard.
    function jadeTower(){
      const side=1;
      let p=null;for(const s of [233,252,209,285]){p=site(s,side,53,17.5);if(p)break;}
      if(!p)return;
      const yaw=faceRoad(p,side),{block}=local(p,yaw);
      block(0,6,0,22,12,20,'#396367');block(0,12.2,0,23,.8,21,'#bec7ab');
      const tier=new T.CylinderGeometry(.71,.57,1,4,1,false,Math.PI/4);
      let y=12.6;
      for(let i=0;i<7;i++){
        const w=22-i*1.62,h=i<4?8.6:7.35;
        put(tier,plain,i%2?'#42767b':'#3c6a76',p.x,y+h*.5,p.z,w,h,w,yaw);
        for(const v of [-1,1]){
          block(0,y+h*.63,v*w*.468,w*.82,.18,.14,'#8bd6c4',true);
          block(v*w*.468,y+h*.63,0,.14,.18,w*.82,'#8bd6c4',true);
        }
        block(0,y+h-.19,0,w+.2,.42,w+.2,'#84ddcc',true);
        for(const k of [-1,1])for(const j of [-1,1])block(k*w*.467,y+h,j*w*.467,.62,.94,.62,'#ffca86',true);
        y+=h;
      }
      block(0,y+2.5,0,5.8,5,5.8,'#709b9e');block(0,y+5.05,0,6.25,.38,6.25,'#f6cb8e',true);
      put(cone,plain,'#679c9e',p.x,y+8,p.z,3.45,5.7,3.45,yaw);radial(p.x,y+14,p.z,.21,7.2,'#bfd6ce');
      put(cloudBall,unlit,'#ffb398',p.x,y+17.72,p.z,.41,.50,.41);shadow(p.x,p.z,25,24);
    }
    jadeTower();metroViaduct(111);metroViaduct(track.gates[2]+100);
    for(const side of [-1,1])for(let s=24,i=0;s<track.length;s+=range(21,30),i++){
      const p=site(s,side,range(18,25),11.6);if(p)highrise(p,side,i,true);
      const q=site(s,side,range(42,75),16);if(q)highrise(q,side,i+2,false);
    }
    const treeColor=['#517c79','#63897e','#6d8c85'];
    for(const side of [-1,1])for(let s=9;s<track.length;s+=range(19,29)){
      const p=site(s,side,range(6.8,10.8),3.5);if(!p)continue;
      radial(p.x,2.3,p.z,.24,4.6,'#867a72');
      for(const k of [-1,0,1])put(ball,plain,treeColor[k+1],p.x+.68*k,5.0+(k===0?1.15:0),p.z,1.48,2.05,1.66,k);
      shadow(p.x+.2,p.z,4.8,4.2);
    }
    // A far skyline rises behind the boulevard. Keep the stars on the sky texture so distant buildings occlude them naturally.
    const cx=(minX+maxX)*.5,cz=(minZ+maxZ)*.5;
    for(let i=0;i<68;i++){
      const a=range(0,Math.PI*2),dx=Math.cos(a),dz=Math.sin(a);
      const reach=Math.min((maxX-minX)*.5/Math.max(.001,Math.abs(dx)),(maxZ-minZ)*.5/Math.max(.001,Math.abs(dz)))+range(85,147);
      const x=cx+dx*reach,z=cz+dz*reach,w=range(9,20),h=range(38,91);
      if(!clear({x,z},w))continue;
      box(x,h*.5-.1,z,w,h,w,'#68748d');box(x,h+.9,z,w*.67,2,w*.66,'#8591a2');
      for(let y=6;y<h-1;y+=7)for(const k of [-1,1]){
        const ink=(i+Math.floor(y))%3?'#d1b2ab':'#a7c8d4';
        put(boxGeo,unlit,ink,x,y,z+k*(w*.5+.05),w*.73,.59,.15);put(boxGeo,unlit,ink,x+k*(w*.5+.05),y,z,.15,.59,w*.73);
      }
    }
  }
  function themeFor(id){return themes[id] || window.ClassicExtraWorlds.themes[id];}
  window.ClassicLandscapes={themeFor,decorate};
})();
