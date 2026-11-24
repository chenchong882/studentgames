// The kart faces local -Z. Its road contact patches and exhaust tips share the
// same body transform as the visible wheels and pipes.
(() => {
  'use strict';

  const T = THREE;
  const TAU = Math.PI * 2;
  const palette = {
    ink: 0x243242, rubber: 0x222939, tread: 0x303b4b, steel: 0x7a9ca5,
    silver: 0xc8ded8, cherry: 0xdd352d, coral: 0xff5740, amber: 0xffb72f,
    ivory: 0xffe7a7, white: 0xfff6df, teal: 0x24acae
  };
  const paint = new T.MeshPhongMaterial({
    vertexColors: true, specular: 0x414449, shininess: 24
  });
  const cylinder = (radius, depth, sides = 16) => new T.CylinderGeometry(radius, radius, depth, sides);
  const block = () => new T.BoxGeometry();
  const vec = (x, y, z) => new T.Vector3(x, y, z);

  // Merge the rigid parts of each wheel, the helmet, and the chassis separately.
  // Each animated assembly can then move with one transform and one draw call.
  class Assembly {
    constructor() {
      this.pos = []; this.norm = []; this.color = []; this.index = [];
    }
    part(geometry, tint, x, y, z, scale = [1, 1, 1], rotation = [0, 0, 0]) {
      const angle = new T.Quaternion().setFromEuler(new T.Euler(...rotation));
      geometry.applyMatrix4(new T.Matrix4().compose(vec(x, y, z), angle, vec(...scale)));
      const positions = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const base = this.pos.length / 3;
      const c = new T.Color(tint);
      for (let i = 0; i < positions.count; i++) {
        this.pos.push(positions.getX(i), positions.getY(i), positions.getZ(i));
        this.norm.push(normals.getX(i), normals.getY(i), normals.getZ(i));
        this.color.push(c.r, c.g, c.b);
      }
      if (geometry.index) {
        for (const idx of geometry.index.array) this.index.push(idx + base);
      } else {
        for (let i = 0; i < positions.count; i++) this.index.push(i + base);
      }
      geometry.dispose();
    }
    ellipsoid(tint, x, y, z, rx, ry, rz, rotation = [0, 0, 0]) {
      const radius = Math.max(rx, ry, rz);
      const rings = radius > .32 ? 12 : radius > .11 ? 8 : 6;
      this.part(new T.SphereGeometry(1, rings*2, rings), tint, x, y, z, [rx, ry, rz], rotation);
    }
    bar(tint, a, b, radius, sides = 10) {
      const diff = vec(...b).sub(vec(...a));
      const g = cylinder(radius, diff.length(), sides);
      g.applyQuaternion(new T.Quaternion().setFromUnitVectors(vec(0, 1, 0), diff.normalize()));
      this.part(g, tint, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    }
    finish(group) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(this.norm, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(this.color, 3));
      g.setIndex(this.index);
      const mesh = new T.Mesh(g, paint);
      group.add(mesh);
      return mesh;
    }
  }

  // Each section describes a transverse slice [z, half width, bottom, top].
  // The chamfers follow every section, including the upswept nose and sidepods.
  function hull(sections, bevel = 0.24) {
    const position = [], index = [];
    for (const [z, w, low, high] of sections) {
      const dx = w * bevel, dy = (high - low) * 0.27;
      const ring = [[-w+dx,low],[w-dx,low],[w,low+dy],[w,high-dy],
        [w-dx,high],[-w+dx,high],[-w,high-dy],[-w,low+dy]];
      for (const [x, y] of ring) position.push(x, y, z);
    }
    const end = (sections.length - 1) * 8;
    for (let n = 0; n < end; n += 8) {
      for (let j = 0; j < 8; j++) {
        const a = n+j, b = n+(j+1)%8;
        index.push(a,b,b+8, a,b+8,a+8);
      }
    }
    for (let i = 1; i < 7; i++) index.push(0,i+1,i, end,end+i,end+i+1);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
  }
  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'));
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }
  function numberPlate() {
    return canvasTexture(256, 94, c => {
      c.fillStyle = '#27394a'; c.fillRect(0, 0, 256, 94);
      c.fillStyle = '#f9da78'; c.fillRect(4, 4, 248, 86);
      c.fillStyle = '#eb9d3c'; c.fillRect(4, 73, 248, 17);
      c.fillStyle = '#27394a'; c.font = 'italic 900 78px Arial, sans-serif';
      c.textAlign = 'center'; c.fillText('07', 125, 73);
      for (const x of [13, 243]) for (const y of [13, 80]) {
        c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill();
      }
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) {
        if ((x+y)%2 === 0) c.fillRect(30+x*8, 33+y*8, 8, 8);
      }
    });
  }
  function helmetLivery() {
    return canvasTexture(1024, 512, c => {
      c.fillStyle = '#f45239'; c.fillRect(0, 0, 1024, 512);
      // Painted crown stripe splits into a cream spear and gold pinstripe.
      for (const front of [256, 768]) {
        const stripe = (offset, size, color) => {
          c.beginPath(); c.moveTo(front+offset-size, 0);
          c.bezierCurveTo(front+offset-size, 105, front+offset-size*.67, 220, front+offset-size*.39, 359);
          c.lineTo(front+offset+size*.39, 359);
          c.bezierCurveTo(front+offset+size*.67,220,front+offset+size,105,front+offset+size,0);
          c.closePath(); c.fillStyle = color; c.fill();
        };
        stripe(0, 52, '#fff1c0'); stripe(-64, 6, '#fdbd45'); stripe(64, 6, '#fdbd45');
      }
      c.fillStyle = '#b72c35';
      c.beginPath(); c.moveTo(0, 272);
      for (let x = 0; x <= 1024; x += 8) {
        c.lineTo(x, 276 + 18*Math.cos((x-256)/512*TAU));
      }
      c.lineTo(1024, 512); c.lineTo(0, 512); c.fill();
      c.fillStyle = '#fff0bc'; c.fillRect(0, 300, 1024, 6);
      c.fillStyle = '#223846'; c.fillRect(0, 312, 1024, 32);
      for (let k=0; k<64; k++) {
        c.fillStyle = '#45616a';
        c.fillRect(k*16, 316+(k%2)*11, 16, 11);
      }
      // Gull emblem on the nape. Shape is drawn here and wraps with the shell.
      c.save(); c.translate(256, 230); c.scale(1, 1.25);
      c.fillStyle = '#b1302e'; c.beginPath(); c.ellipse(0,0,43,34,0,0,TAU); c.fill();
      c.fillStyle = '#fff4cc'; c.beginPath(); c.ellipse(0,0,36,29,0,0,TAU); c.fill();
      c.fillStyle = '#243c50'; c.beginPath(); c.ellipse(0,0,29,23,0,0,TAU); c.fill();
      c.fillStyle = '#ffd268'; c.beginPath(); c.moveTo(-23,-10); c.lineTo(-6,-4);
      c.lineTo(0,2); c.lineTo(10,-5); c.lineTo(24,-9); c.lineTo(12,2);
      c.lineTo(0,12); c.lineTo(-10,4); c.closePath(); c.fill(); c.restore();
    });
  }

  function makeChassis(rig) {
    const p = palette, b = new Assembly();
    b.part(hull([[-1.39,.46,.20,.30],[-1.18,.76,.16,.31],[.75,.78,.17,.35],[1.18,.52,.23,.35]]), p.ink, 0,0,0);
    b.part(hull([[-1.50,.57,.24,.40],[-1.40,.76,.23,.43],[-1.24,.75,.27,.48],[-1.06,.48,.31,.49]]), p.coral,0,0,0);
    b.part(hull([[-1.48,.55,.21,.245],[-1.4,.79,.2,.27],[-1.23,.75,.23,.29]]), p.steel,0,0,0);
    b.part(hull([[-1.33,.36,.31,.40],[-1.05,.46,.31,.55],[-.62,.42,.31,.70],[-.39,.33,.33,.66]]),p.cherry,0,0,0);
    b.part(hull([[-1.32,.09,.40,.415],[-1.05,.10,.549,.56],[-.62,.11,.695,.71],[-.42,.09,.66,.673]]),p.ivory,0,0,0);
    b.part(hull([[-.66,.34,.38,.52],[-.41,.49,.34,.56],[.46,.51,.33,.55],[.73,.43,.39,.55]]),p.ink,0,0,0);
    b.ellipsoid(0x5c4746,0,.52,.12,.42,.13,.47);
    b.ellipsoid(p.ink,0,.75,.47,.43,.39,.15,[-.18,0,0]);
    b.ellipsoid(0xc18864,0,.76,.44,.35,.30,.11,[-.18,0,0]);
    // The pressed aluminum seatback stays visible below the helmet in chase view.
    b.part(hull([[.555,.28,.54,.79],[.626,.26,.57,.77],[.643,.19,.60,.74]]),0x465564,0,0,0);
    for (let n=0;n<3;n++) {
      b.part(block(),p.steel,0,.615+n*.060,.646,[.28-n*.038,.016,.011]);
    }
    b.part(hull([[.58,.48,.32,.54],[.85,.66,.28,.64],[1.15,.67,.30,.61],[1.23,.50,.34,.57]]),p.cherry,0,0,0);
    for (const side of [-1,1]) {
      b.part(hull([[-1.437,.13,.30,.36],[-1.37,.146,.33,.44],[-1.31,.14,.35,.444]]),p.cherry,side*.49,0,0);
      b.part(hull([[-1.443,.111,.315,.345],[-1.375,.117,.349,.431],[-1.33,.10,.355,.438]]),p.white,side*.49,0,0);
      b.part(hull([[-.18,.04,.317,.366],[-.045,.058,.317,.454],[.33,.061,.341,.515],[.39,.046,.361,.51]]),p.ink,side*.822,0,0);
      for (let vent=0;vent<3;vent++) {
        b.part(block(),p.steel,side*.88,.385+vent*.012,.05+vent*.083,[.008,.065,.018],[-.35,0,0]);
      }
      b.bar(p.steel,[side*.32,.24,-.85],[side*.87,.34,-.87],.052);
      b.bar(p.ink,[side*.32,.27,-.55],[side*.84,.34,-.86],.047);
      b.bar(p.ink,[0,.32,.81],[side*.88,.34,.81],.083);
      b.bar(p.silver,[side*.51,.39,-.50],[side*.65,.35,.57],.061);
      b.part(hull([[-.63,.075,.37,.51],[-.46,.16,.28,.57],[.08,.19,.30,.62],[.52,.15,.34,.69],[.62,.10,.40,.63]]),p.coral,side*.65,0,0);
      b.part(hull([[-.44,.032,.56,.58],[.08,.048,.605,.63],[.51,.036,.68,.70]]),p.ivory,side*.69,0,0);
      b.part(hull([[.81,.14,.24,.36],[1.26,.19,.23,.42],[1.38,.14,.27,.39]]),p.ink,side*.70,0,0);
      b.bar(p.steel,[side*.38,.54,.83],[side*.51,.82,1.13],.048);
      b.bar(p.ink,[side*.51,.54,1.13],[side*.51,.83,1.13],.042);
      b.ellipsoid(p.ink,side*.53,.52,1.20,.162,.084,.048);
      b.ellipsoid(0xff6d52,side*.53,.53,1.242,.126,.049,.025);
      b.bar(p.ink,[side*.33,.37,.62],[side*.38,.38,1.27],.116,16);
      for (const z of [.91,1.12,1.27]) {
        b.bar(p.silver,[side*.38,.38,z-.035],[side*.38,.38,z+.035],z===1.27?.125:.116,16);
      }
      b.bar(0x1d2632,[side*.38,.38,1.304],[side*.38,.38,1.309],.094,16);
      b.bar(0x664536,[side*.38,.38,1.31],[side*.38,.38,1.313],.056,12);
      for (let i=0;i<3;i++) {
        b.part(block(),p.ink,side*(.41+i*.075),.621,1.025,[.043,.016,.142],[-.07,0,0]);
      }
      b.part(hull([[.93,.04,.76,.86],[1.12,.042,.77,.93],[1.27,.035,.77,.94]]),p.cherry,side*.82,0,0);
      b.bar(0x83464a,[side*.18,.83,.606],[side*.11,1.02,.518],.029);
      b.part(block(),p.amber,side*.153,.903,.595,[.071,.046,.022],[-.48,0,side*.28]);
      b.bar(p.cherry,[side*.08,.81,-.04],[side*.34,.65,-.09],.145);
      b.bar(p.teal,[side*.34,.68,-.09],[side*.29,.73,-.38],.098);
      b.ellipsoid(p.ivory,side*.29,.76,-.39,.103,.09,.108);
      b.ellipsoid(0x304653,side*.17,.54,-.32,.144,.13,.30,[.11,0,0]);
    }
    b.part(hull([[.94,.66,.782,.806],[1.04,.81,.80,.85],[1.23,.80,.79,.86],[1.28,.65,.77,.84]]),p.coral,0,0,0);
    b.part(hull([[1.15,.73,.849,.86],[1.20,.72,.854,.865]]),p.ivory,0,0,0);
    b.bar(p.ink,[0,.41,-.64],[0,.74,-.39],.05);
    b.part(new T.TorusGeometry(.26,.034,8,24),0x24303a,0,.78,-.39,[1,.78,1],[-.42,0,0]);
    b.ellipsoid(p.ink,0,.78,-.39,.08,.063,.04);
    b.ellipsoid(0x198e96,0,.81,.04,.34,.35,.26);
    b.ellipsoid(p.ivory,0,1.045,.04,.22,.11,.19);
    b.part(block(),p.ink,0,.505,1.244,[.61,.228,.062]);
    b.finish(rig);
    const plate = new T.Mesh(new T.PlaneGeometry(.57,.20),new T.MeshLambertMaterial({map:numberPlate()}));
    plate.position.set(0,.505,1.278); rig.add(plate);
  }

  function makeDriver(rig) {
    const head = new T.Group();
    head.position.set(0,1.50,.055); rig.add(head);
    const shell = new T.Mesh(new T.SphereGeometry(1,40,26),
      new T.MeshPhongMaterial({map:helmetLivery(),shininess:31,specular:0x545050}));
    shell.scale.set(.55,.53,.50); head.add(shell);
    const h = new Assembly(), p = palette;
    h.ellipsoid(p.ink,0,-.043,-.346,.478,.304,.210);
    h.ellipsoid(0xffbc86,0,-.066,-.406,.428,.252,.179);
    for (const side of [-1,1]) {
      h.ellipsoid(p.cherry,side*.493,-.043,-.017,.085,.148,.113);
      h.ellipsoid(p.ivory,side*.531,-.043,-.017,.066,.108,.089);
      h.ellipsoid(p.ink,side*.582,-.043,-.017,.021,.06,.05);
      h.ellipsoid(0xff9869,side*.276,-.13,-.523,.065,.034,.015,[0,-side*.44,0]);
      h.ellipsoid(0x293844,side*.159,-.038,-.560,.048,.075,.024,[0,-side*.2,0]);
      h.ellipsoid(0xfffae7,side*.16-.009,-.010,-.581,.015,.019,.007);
      h.ellipsoid(p.ink,side*.165,.050,-.539,.081,.025,.019,[0,-side*.2,-side*.18]);
      h.ellipsoid(p.cherry,side*.355,.174,.334,.075,.029,.036,[-.3,side*.58,-side*.17]);
      h.ellipsoid(p.ink,side*.360,.173,.352,.056,.013,.014,[-.3,side*.58,-side*.17]);
    }
    h.ellipsoid(0xffb17e,0,-.079,-.579,.050,.040,.037);
    h.bar(0x9f5943,[-.055,-.156,-.553],[.038,-.156,-.554],.009);
    h.ellipsoid(p.cherry,0,.168,-.397,.482,.072,.192,[-.10,0,0]);
    h.ellipsoid(p.ivory,0,.154,-.438,.438,.026,.157,[-.10,0,0]);
    h.finish(head);
    return head;
  }

  function wheelGeometry() {
    const b = new Assembly(), p = palette;
    const profile = [[.12,-.178],[.25,-.178],[.31,-.164],[.341,-.125],
      [.347,-.080],[.342,-.073],[.347,-.062],[.347,.062],[.342,.073],
      [.347,.080],[.341,.125],[.31,.164],[.25,.178],[.12,.178]];
    const tire = new T.LatheGeometry(profile.map(([r,w])=>new T.Vector2(r,w)),30);
    b.part(tire,p.rubber,0,0,0,[1,1,1],[0,0,-Math.PI/2]);
    for (const side of [-1,1]) {
      b.part(cylinder(.242,.018,24),p.ink,side*.175,0,0,[1,1,1],[0,0,Math.PI/2]);
      b.part(cylinder(.204,.020,24),p.steel,side*.185,0,0,[1,1,1],[0,0,Math.PI/2]);
      b.part(cylinder(.160,.024,24),p.coral,side*.195,0,0,[1,1,1],[0,0,Math.PI/2]);
      for (let n=0;n<5;n++) {
        const a = TAU*n/5;
        b.ellipsoid(p.ink,side*.208,Math.cos(a)*.110,Math.sin(a)*.110,.008,.048,.025,[a,0,0]);
      }
      b.part(cylinder(.060,.028,6),p.ivory,side*.210,0,0,[1,1,1],[0,0,Math.PI/2]);
    }
    const holder = new T.Group();
    return b.finish(holder).geometry;
  }

  function addWheels(rig) {
    const wheels = [], geometry = wheelGeometry();
    for (const z of [-.85,.81]) for (const side of [-1,1]) {
      const pivot = new T.Group();
      pivot.position.set(side*(z<0?.76:.79),.345,z); rig.add(pivot);
      const wheel = new T.Mesh(geometry,paint);
      if (z<0) wheel.scale.set(.84,.93,.93);
      pivot.add(wheel); wheels.push({pivot,wheel,front:z<0});
    }
    return wheels;
  }

  function makeShadow(rig) {
    const map = canvasTexture(128,128,c=>{
      const gradient = c.createRadialGradient(64,64,7,64,64,62);
      gradient.addColorStop(0,'rgba(19,31,38,.65)'); gradient.addColorStop(.57,'rgba(24,39,44,.5)');
      gradient.addColorStop(.86,'rgba(30,41,48,.16)'); gradient.addColorStop(1,'rgba(30,41,48,0)');
      c.fillStyle=gradient; c.fillRect(0,0,128,128);
    });
    const shadow = new T.Mesh(new T.PlaneGeometry(2.73,3.64),
      new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    shadow.rotation.x=-Math.PI/2; shadow.position.set(.04,.042,.06); shadow.renderOrder=1;
    rig.add(shadow);
  }

  function jetShape(radius, length) {
    // A pointed, fluted teardrop with its base inside the pipe.
    const section = [[radius*.64,0],[radius,.12],[radius*.69,.45],[radius*.30,.73],[0,1]];
    return new T.LatheGeometry(section.map(([r,f])=>new T.Vector2(r,f*length)),10).rotateX(Math.PI/2);
  }
  function makeJets(rig) {
    const inner = new T.MeshBasicMaterial({color:0xfff3ad});
    const tip = new T.MeshBasicMaterial({color:0xff8130,transparent:true,opacity:.78,depthWrite:false});
    const glint = new T.MeshBasicMaterial({color:0xffc346});
    const jets = [-1,1].map(side=>{
      const jet = new T.Group();
      jet.position.set(side*.38,.38,1.30); rig.add(jet);
      const plume = new T.Mesh(jetShape(.120,1.23),tip);
      const mid = new T.Mesh(jetShape(.095,.79),glint);
      const core = new T.Mesh(jetShape(.076,.50),inner);
      jet.add(plume,mid,core); jet.visible=false;
      return jet;
    });
    return jets;
  }

  function makeMarks(scene) {
    const slots=360, positions=new Float32Array(slots*4*3), index=[];
    for (let i=0;i<slots;i++) {
      const b=i*4; index.push(b,b+1,b+2,b+2,b+1,b+3);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
    geometry.setIndex(index);
    const mat = new T.MeshBasicMaterial({color:0x253344,opacity:.55,transparent:true,side:T.DoubleSide,depthWrite:false});
    const mesh=new T.Mesh(geometry,mat);
    mesh.frustumCulled=false; mesh.renderOrder=0; scene.add(mesh);
    return {mesh,positions,slots,cursor:0,previous:[null,null]};
  }
  function tireContact(car, side) {
    const sn=Math.sin(car.yaw), cs=Math.cos(car.yaw);
    return {x:car.x+side*.79*cs-.81*sn,z:car.z+side*.79*sn+.81*cs,dx:cs*.105,dz:sn*.105};
  }
  function paintTracks(marks,car,active) {
    if (!active) { marks.previous[0]=marks.previous[1]=null; return; }
    for (let i=0;i<2;i++) {
      const now=tireContact(car,i===0?-1:1), prev=marks.previous[i];
      if (prev) {
        const distance=Math.hypot(now.x-prev.x,now.z-prev.z);
        if (distance<.13) continue;
        if (distance<7) {
          const offset = marks.cursor*12;
          marks.positions.set([prev.x-prev.dx,.036,prev.z-prev.dz,prev.x+prev.dx,.036,prev.z+prev.dz,
            now.x-now.dx,.036,now.z-now.dz,now.x+now.dx,.036,now.z+now.dz],offset);
          marks.cursor=(marks.cursor+1)%marks.slots;
          marks.mesh.geometry.attributes.position.needsUpdate=true;
        }
      }
      marks.previous[i]=now;
    }
  }

  function makeSmoke(scene) {
    const count=30, g=new T.InstancedBufferGeometry(), quad=new T.PlaneGeometry(1,1);
    g.index=quad.index; g.setAttribute('position',quad.attributes.position); g.setAttribute('uv',quad.attributes.uv);
    const attrs=new Float32Array(count*4), opacity=new Float32Array(count);
    g.setAttribute('cloud',new T.InstancedBufferAttribute(attrs,4).setUsage(T.DynamicDrawUsage));
    g.setAttribute('fade',new T.InstancedBufferAttribute(opacity,1).setUsage(T.DynamicDrawUsage));
    g.instanceCount=count;
    const shader=new T.ShaderMaterial({
      transparent:true,depthWrite:false,uniforms:{},
      vertexShader:`attribute vec4 cloud; attribute float fade; varying vec2 vUv; varying float alpha;
        void main(){vUv=uv;alpha=fade;vec4 mv=viewMatrix*vec4(cloud.xyz,1.);
        mv.xy+=position.xy*cloud.w;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying vec2 vUv;varying float alpha;
        void main(){vec2 p=2.*vUv-1.;float d=min(length(p*vec2(1.,1.22)),min(.24+length(p-vec2(-.28,.06)),.23+length(p-vec2(.28,.08))));
        float a=alpha*(1.-smoothstep(.46,.96,d));if(a<.012)discard;gl_FragColor=vec4(.91,.91,.85,a);}`
    });
    const mesh=new T.Mesh(g,shader);
    mesh.frustumCulled=false; mesh.renderOrder=4; scene.add(mesh);
    return {mesh,attrs,opacity,cursor:0,clock:0,particles:Array.from({length:count},()=>({age:1,life:0}))};
  }
  function smokeStep(smoke,car,dt,active) {
    smoke.clock += active ? dt : 0;
    if (!active) smoke.clock=0;
    if (smoke.clock>=.065) {
      smoke.clock%=.065;
      for (const side of [-1,1]) {
        const p=smoke.particles[smoke.cursor], at=tireContact(car,side);
        smoke.cursor=(smoke.cursor+1)%smoke.particles.length;
        Object.assign(p,{age:0,life:.52+Math.random()*.28,x:at.x,z:at.z,
          vx:car.vx*.15 + (Math.random()-.5)*1.3,vz:car.vz*.15+(Math.random()-.5)*1.3});
      }
    }
    let visible=false;
    smoke.particles.forEach((p,i)=>{
      if (p.age>=p.life) {smoke.opacity[i]=0; return;}
      p.age+=dt; p.x+=p.vx*dt; p.z+=p.vz*dt;
      const t=Math.min(1,p.age/p.life), n=i*4;
      smoke.attrs[n]=p.x; smoke.attrs[n+1]=.18+t*.68; smoke.attrs[n+2]=p.z; smoke.attrs[n+3]=.32+t*.85;
      smoke.opacity[i]=(1-t)*.43;
      visible=true;
    });
    smoke.mesh.visible=visible;
    smoke.mesh.geometry.attributes.cloud.needsUpdate=visible; smoke.mesh.geometry.attributes.fade.needsUpdate=visible;
  }
  function makePenalty(rig) {
    const g=new T.Group(), b=new Assembly();
    const star=new T.Shape();
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4+Math.PI/2, r=i%2===0?.15:.048;
      if (i===0) star.moveTo(Math.cos(a)*r,Math.sin(a)*r);
      else star.lineTo(Math.cos(a)*r,Math.sin(a)*r);
    }
    star.closePath();
    for(let n=0;n<4;n++){
      const a=TAU*n/4, x=Math.cos(a)*.81, z=Math.sin(a)*.69;
      const gem = new T.ExtrudeGeometry(star,{depth:.016,bevelEnabled:false});
      b.part(gem,n%2?palette.amber:palette.ivory,x,.055*Math.cos(a),z,[1,1,1],[0,-a,.10]);
      b.ellipsoid(palette.amber,x*.82,.08,z*.82,.034,.034,.034);
    }
    b.finish(g); rig.add(g); g.visible=false;
    return g;
  }

  function create(scene) {
    const root=new T.Group(), body=new T.Group();
    root.name='Gull 07'; root.add(body); scene.add(root);
    makeChassis(body);
    const head=makeDriver(body), wheels=addWheels(root), jets=makeJets(body);
    makeShadow(root);
    return {root,body,head,wheels,jets,penalty:makePenalty(root),marks:makeMarks(scene),smoke:makeSmoke(scene),time:0,spin:0,lean:0};
  }
  function update(model,car,dt) {
    // Render interpolation supplies an independent pose; physics owns the velocity.
    dt=Math.max(0,Math.min(.1,dt));
    model.time+=dt;
    model.root.position.set(car.x,0,car.z); model.root.rotation.y=-car.yaw;
    const speed=car.speed||0, steer=car.steer||0, slip=car.slip||0;
    const forward=(car.vx||0)*Math.sin(car.yaw)-(car.vz||0)*Math.cos(car.yaw);
    const wheelAngle=Number.isFinite(car.wheelAngle) ? car.wheelAngle : steer*.38;
    model.spin=(model.spin-forward*dt/.345)%TAU;
    for(const {pivot,wheel,front} of model.wheels) {
      pivot.rotation.y=front ? -wheelAngle : 0; wheel.rotation.x=model.spin;
    }
    const blend=1-Math.exp(-10*dt);
    model.lean+=(Math.max(-1,Math.min(1,slip*1.7+steer*.14))*Math.min(1,speed/12)-model.lean)*blend;
    model.body.rotation.z=model.lean*.045;
    model.head.rotation.z=-model.lean*.16; model.head.rotation.y=-steer*.12;
    model.jets.forEach((jet,i)=>{
      jet.visible=!!car.boosting;
      if(jet.visible) jet.scale.z=.97+.13*Math.sin(model.time*35+i*2.1)+.08*Math.cos(model.time*58+i);
    });
    const skid=Math.abs(slip)>.115 && speed>7;
    paintTracks(model.marks,car,skid && dt>0);
    smokeStep(model.smoke,car,dt,skid);
    model.penalty.visible=car.penalty>0;
    if(model.penalty.visible) {
      model.penalty.rotation.y=model.time*4.1;
      model.penalty.position.y=2.03+Math.sin(model.time*7)*.07;
      model.penalty.scale.setScalar(Math.min(1,car.penalty*3+.12));
    }
  }
  function reset(model) {
    model.spin=0; model.lean=0; model.time=0;
    model.jets.forEach(jet=>{jet.visible=false;});
    model.penalty.visible=false;
    model.smoke.clock=0; model.smoke.particles.forEach(p=>{p.life=0;p.age=1;});
    model.smoke.mesh.visible=false;
    model.marks.previous.fill(null); model.marks.positions.fill(0); model.marks.cursor=0;
    model.marks.mesh.geometry.attributes.position.needsUpdate=true;
  }
  window.ClassicKartArt={create,update,reset};
})();
