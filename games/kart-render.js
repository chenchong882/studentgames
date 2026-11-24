// Circuit distances are in metres. The player's rear wheels sit at z = 0.
(function () {
  'use strict';

  const LAP = 1050;
  const DEPTH = 22;
  const FAR = 460;
  const HALF_ROAD = 7;
  const TAU = Math.PI * 2;
  const views = new WeakMap();
  const models = window.KartModels;
  const scenerySprites = new Map();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const wrap = (n, length) => ((n % length) + length) % length;

  // The 115 metres leading into each vocabulary gate are straight.
  const courses = {
    beach: { turns:[[10,76,-.62],[216,345,.89],[345,419,-.58],[558,683,-.85],[683,757,.67],[894,1008,.86],[1008,1049,-.40]],
      hill:[.85,.29], ground:['#e8ca91','#f0d79f'], shoulder:['#d3ac76','#edc78e'], curb:['#e86751','#fff1cf'],
      asphalt:['#686e70','#6d7475'], line:'#fff0ce', post:'beacon' },
    city: { turns:[[9,78,.64],[209,309,-.99],[320,423,-.86],[554,636,.99],[642,756,.83],[888,974,-.93],[980,1047,.68]],
      hill:[.43,.18], ground:['#75aa78','#80b782'], shoulder:['#bbb2a4','#ded5be'], curb:['#ca5d4c','#fff2d8'],
      asphalt:['#5b6570','#616d79'], line:'#faf2ce', post:'city-post' },
    desert: { turns:[[12,80,-.74],[209,282,-.86],[288,356,.98],[360,422,-.67],[551,680,.91],[687,758,-.78],[890,952,.88],[960,1049,-.93]],
      hill:[1.36,.53], ground:['#e4a85e','#edb96c'], shoulder:['#dd9955','#edb26b'], curb:['#a0593e','#ffe1a0'],
      asphalt:['#b87c51','#bf8355'], line:'#fff1bc', post:'sand-post' },
    night: { turns:[[12,79,.81],[211,275,.96],[282,357,-1],[365,424,.68],[551,613,-.87],[622,714,.97],[719,758,-.65],[890,990,-.98],[992,1049,.74]],
      hill:[.65,.24], ground:['#293c52','#2e4056'], shoulder:['#53516d','#6c6579'], curb:['#d85b84','#ffe6c6'],
      asphalt:['#353a50','#3a4056'], line:'#f3daaa', post:'night-post' },
    space: { turns:[[6,80,-.88],[208,271,.89],[276,345,.99],[352,422,-.94],[551,630,-1],[636,700,.95],[706,760,-.78],[889,948,-.92],[953,1047,.99]],
      hill:[1.29,.42], ground:['#776c99','#827699'], shoulder:['#424563','#59617e'], curb:['#5bdeed','#485779'],
      asphalt:['#535973','#5c627d'], line:'#c8f5ff', post:'orbit-post' }
  };

  function curveAt(distance, trackId = 'beach') {
    const pos = wrap(distance, LAP);
    for (const [start, end, strength] of courses[trackId].turns) {
      if (pos > start && pos < end) return Math.sin(Math.PI * (pos - start) / (end - start)) ** 2 * strength;
    }
    return 0;
  }

  function elevation(distance, trackId) {
    const [swell, ripple] = courses[trackId].hill;
    return swell * Math.sin(distance * TAU / 525) + ripple * Math.sin(distance * TAU / 210 + .4);
  }

  function polygon(ctx, color, ...points) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function line(ctx, color, width, ...points) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function oval(ctx, color, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function box(ctx, color, x, y, w, h) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function rounded(ctx, color, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function gradient(ctx, y1, y2, stops) {
    const fill = ctx.createLinearGradient(0, y1, 0, y2);
    stops.forEach(([pos, color]) => fill.addColorStop(pos, color));
    return fill;
  }

  function surface(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  // Paint the distant landscape once per stage/size; road furniture is projected separately.
  function makePanorama(w, h, id) {
    const bw = Math.ceil(w * 1.4), horizon = h * .314;
    const canvas = surface(bw, h), c = canvas.getContext('2d');
    const u = Math.min(w / 730, h / 440), span = bw / u, sky = horizon / u;
    const palette = {
      beach:['#279cdd','#b9f3f4','#5eced6','#147ea9'],
      city:['#55b7ec','#daeff5','#bdd6ab','#729a77'],
      desert:['#77bde2','#ffe3a3','#f1c27c','#d99752'],
      night:['#16264d','#746294','#473f5c','#26394c'],
      space:['#100f30','#44386c','#a69ac0','#6d6289']
    }[id];
    box(c, gradient(c, 0, horizon, [[0,palette[0]],[1,palette[1]]]), 0, 0, bw, horizon + 1);
    box(c, gradient(c, horizon, h, [[0,palette[2]],[1,palette[3]]]), 0, horizon, bw, h - horizon);
    c.save(); c.translate(0, horizon); c.scale(u, u);
    function hills(color, base, height, phase) {
      const pts = [0,1];
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        pts.push(t * span, -base - height * (.52 * Math.sin(t * 13 + phase) + .31 * Math.cos(t * 26 - phase) + .14 * Math.sin(t * 63 + .2)));
      }
      polygon(c, color, ...pts, span, 1);
    }
    function cloud(x, y, size) {
      c.save(); c.translate(x, y); c.scale(size,size);
      polygon(c,'rgba(255,251,223,.87)',-37,1,-29,-3,-23,-4,-18,-12,-10,-14,-3,-10,3,-17,12,-19,21,-14,24,-7,34,-6,43,0,32,3,-25,3);
      box(c,'rgba(255,251,230,.55)',-46,5,34,1.4); c.restore();
    }
    function tower(x, y, width, height, face, shade, lamps) {
      box(c, face, x, y-height, width, height);
      polygon(c,shade,x+width,y-height,x+width+5,y-height-3,x+width+5,y-2,x+width,y);
      for (let row=0; row < Math.floor(height/10); row++) {
        for (let column=0; column < Math.floor(width/8); column++) {
          if ((row*3+column*7)%5 !== 2) box(c,lamps,x+3+column*8,y-height+4+row*10,3,3);
        }
      }
    }
    function skyline(night) {
      const distant = night ? '#565779' : '#92b6bf';
      for (let i = 0; i * 20 < span; i++) {
        const bh = 9 + (i*41%38);
        box(c,distant,i*20,-bh,18+(i%3)*4,bh+1);
      }
      for (let i=0; i*57 < span; i++) {
        const x=i*57-5, bh=19+(i*27%49), wd=14+i*7%19;
        tower(x,0,wd,bh,night?'#333955':'#79a0ad',night?'#252d48':'#698d9b',night?'#edc18b':'#c5d7d1');
        if(i%4===1) {
          box(c,night?'#343e61':'#83b0b8',x+wd*.25,-bh-9,wd*.5,10);
          line(c,night?'#e5a5ae':'#7895a3',1.2,x+wd*.5,-bh-9,x+wd*.5,-bh-19);
        }
      }
    }
    function stars(count) {
      for (let i=0; i<count; i++) {
        const x=(i*.61803399 % 1) * span, y=-sky*(.05+(i*i*37%347)/368);
        const size=i%8 ? .9 : 1.65;
        box(c,i%3?'#d5e8fd':'#ffe3b6',x,y,size,size);
        if (i%17===0) {line(c,'#c9c8e4',.55,x-2,y+.5,x+3,y+.5);line(c,'#c9c8e4',.55,x+.5,y-2,x+.5,y+3);}
      }
    }
    if (id === 'beach') {
      oval(c,'#fff1ae',span*.67,-sky*.71,22,22);
      for (const [x,y,k] of [[.18,.70,1.05],[.43,.46,.64],[.79,.65,1.14]]) cloud(span*x,-sky*y,k);
      hills('#b0d8cb',4,9,1.2);
      for (const [x,y,k] of [[.19,11,.76],[.65,5,.50],[.83,17,.83]]) {
        const bx = span*x;
        polygon(c,'#fcf1d0',bx,y-30*k,bx,y-2*k,bx-13*k,y-2*k);
        polygon(c,'#e97a65',bx+2*k,y-27*k,bx+13*k,y-3*k,bx+2*k,y-3*k);
        polygon(c,'#2e677c',bx-16*k,y,bx+17*k,y,bx+11*k,y+4*k,bx-10*k,y+4*k);
      }
      for (let i=0;i<78;i++) {
        const t=(i*73%89)/89;
        box(c,'rgba(230,255,241,.55)',(i*269%863)/863*span,3+95*t*t,2+t*16,.7+t);
      }
    } else if (id === 'city') {
      cloud(span*.20,-sky*.67,1.05); cloud(span*.49,-sky*.72,.65); cloud(span*.79,-sky*.5,1.2);
      hills('#abc9b4',13,11,.4); skyline(false);
      // Suspension bridge, its pale arches readable against the darker waterfront.
      const x=span*.32;
      for (const a of [0,88]) {
        polygon(c,'#648fa3',x+a-5,1,x+a-3,-51,x+a+2,-51,x+a+5,1);
        line(c,'#e5c477',2,x+a-3,-50,x+a+2,-50);
      }
      c.beginPath(); c.moveTo(x-39,-5); c.lineTo(x,-50); c.quadraticCurveTo(x+44,8,x+88,-50); c.lineTo(x+127,-5);
      c.strokeStyle='#708f9e'; c.lineWidth=2;c.stroke();
      for(let i=1;i<8;i++){const t=i/8; line(c,'#7597a5',1,x+88*t,-50+116*t*(1-t),x+88*t,-5);}
      box(c,'#dae2cd',x-42,-6,171,5);
    } else if (id === 'desert') {
      oval(c,'#fff2b2',span*.69,-sky*.70,25,25);
      hills('#dcaa7e',20,17,.7); hills('#e7ba80',13,11,2.6);
      for(const [x,base,sz] of [[.20,133,.57],[.32,163,.94],[.67,116,.69],[.81,142,1.08]]) {
        const bx=x*span, py=-base*sz*.59;
        polygon(c,'#fbce88',bx-base*sz*.57,0,bx,py,bx+base*sz*.25,0);
        polygon(c,'#c98656',bx,py,bx+base*sz*.58,0,bx+base*sz*.25,0);
        for(let n=1;n<5;n++) {
          const t=n/5; line(c,'#eab976',.9,bx-base*sz*.57*t,py*(1-t),bx+base*sz*.25*t,py*(1-t));
        }
      }
      hills('#edc780',3,5,.9);
    } else if (id === 'night') {
      stars(90);
      const mx=span*.72, my=-sky*.70;
      oval(c,'rgba(255,227,169,.13)',mx,my,34,34); oval(c,'#ffdfa0',mx,my,21,21);
      oval(c,'#f0ce96',mx-5,my-5,5,3.2); oval(c,'#f0ce96',mx+8,my+6,3,3);
      skyline(true);
      box(c,'#53546b',0,-9,span,6); box(c,'#b98e85',0,-10,span,1.6);
      for(let i=0;i<span;i+=48) box(c,'#42455d',i,-6,4,7);
    } else {
      stars(154);
      const px = span*.68, py=-sky*.65, r=Math.min(48,sky*.24);
      c.save(); c.translate(px,py); c.rotate(-.22);
      c.beginPath(); c.ellipse(0,0,r*1.83,r*.34,0,0,TAU); c.strokeStyle='#c9b4e6'; c.lineWidth=4.2; c.stroke();
      oval(c,'#e6b4b7',0,0,r,r);
      c.save(); c.beginPath(); c.arc(0,0,r,0,TAU); c.clip();
      for(const [y,height,paint] of [[-.63,.16,'#ffd9be'],[-.30,.14,'#d58f9e'],[.01,.18,'#ecb9ad'],[.44,.20,'#bf899f']]) box(c,paint,-r,y*r,2*r,height*r);
      c.restore(); c.beginPath(); c.ellipse(0,0,r*1.83,r*.34,0,0,Math.PI); c.strokeStyle='#e2cef1'; c.lineWidth=3.5; c.stroke(); c.restore();
      oval(c,'#92b9df',span*.32,-sky*.78,11,11);
      hills('#837996',15,18,.5); hills('#a699b8',6,9,1.4);
      for(let i=0;i<35;i++) {
        const t=(i*37%41)/41;
        oval(c,'#9388ae',(i*.61803399%1)*span,7+120*t*t,1+13*t,1+3*t);
      }
    }
    c.restore();
    return canvas;
  }

  // Sprites use a 200 px square with the ground contact at its bottom centre.
  function scenery(kind) {
    if (scenerySprites.has(kind)) return scenerySprites.get(kind);
    const canvas = surface(240, 220);
    const c = canvas.getContext('2d');
    c.translate(120, 215);
    c.lineCap = 'round';
    if (kind === 'palm' || kind === 'palms') {
      function palm(x, k, flip) {
        c.save();
        c.translate(x, 0);
        c.scale(k * flip, k);
        polygon(c, '#715d4a', -7, 0, -5, -45, 2, -84, 14, -123, 18, -123, 10, -83, 5, -41, 7, 0);
        polygon(c, '#c89562', -5, 0, -3, -40, 4, -80, 15, -120, 15, -113, 7, -77, 1, -36, 0, 0);
        for (let n = 0; n < 5; n++) {
          const y = n * -18 - 11;
          const dx = n * 2;
          line(c, '#8b704f', 1.8, -4 + dx, y, 4 + dx, y - 2);
        }
        c.translate(16, -122);
        const leaf = (color, coords) => polygon(c, color, ...coords);
        leaf('#246e61', [0, 3, -18, -12, -38, -16, -53, -10, -65, 4, -46, -2, -47, 2, -31, -3, -29, 0, -15, -4]);
        leaf('#419b72', [0, 3, -20, -5, -36, 3, -48, 17, -53, 36, -39, 22, -40, 27, -30, 15, -28, 17, -17, 8]);
        leaf('#5aac77', [0, 0, -16, -22, -37, -33, -59, -32, -44, -27, -48, -27, -31, -20, -32, -17, -17, -11]);
        leaf('#2c7b69', [0, 0, 11, -21, 29, -32, 46, -32, 34, -25, 37, -25, 23, -15, 24, -13, 11, -5]);
        leaf('#66b780', [0, 1, 23, -14, 44, -12, 62, -2, 70, 10, 53, 3, 55, 7, 39, -1, 40, 3, 21, -3]);
        leaf('#337f63', [0, -1, 15, 0, 31, 13, 36, 32, 32, 47, 26, 30, 25, 34, 19, 20, 16, 20, 10, 10]);
        oval(c, '#aeb876', 1, 2, 5, 3);
        c.restore();
      }
      if (kind === 'palms') palm(45, .64, -1);
      palm(-7, 1.22, 1);
    } else if (kind === 'lighthouse') {
      polygon(c, '#9c9d86', -62, 0, -39, -9, -12, -13, 15, -10, 32, -15, 60, -4, 68, 0);
      polygon(c, '#fcf0cb', -23, -7, -14, -131, 12, -131, 23, -7);
      polygon(c, '#e66e56', -20, -44, -17, -78, 16, -78, 20, -44);
      polygon(c, 'rgba(92,98,94,.21)', 3, -130, 12, -130, 23, -8, 7, -9);
      box(c, '#4c686c', -18, -139, 35, 10);
      box(c, '#546d70', -13, -160, 25, 21);
      box(c, '#ffe1a1', -9, -158, 6, 14);
      box(c, '#f3c28d', 0, -158, 7, 14);
      polygon(c, '#c15349', -22, -160, -11, -165, -2, -174, 2, -174, 12, -165, 22, -160);
      line(c, '#667670', 2, 0, -172, 0, -180);
      box(c, '#536a69', -4, -109, 6, 10);
      rounded(c, '#647677', -6, -27, 12, 19, 5);
      line(c, '#72857f', 2, -20, -140, -20, -144, 19, -144, 19, -140);
      box(c, '#fff0cb', 17, -23, 25, 15);
      polygon(c, '#cf6950', 13, -23, 23, -31, 39, -31, 47, -23);
    } else if (kind === 'parasol') {
      line(c,'#8f6e49',3,-29,-2,-28,-94);
      for(const [l,r,color] of [[-88,-64,'#e96557'],[-64,-39,'#fff2c9'],[-39,-13,'#f17a63'],[-13,12,'#fff1cc'],[12,31,'#e46251']]) {
        polygon(c,color,-28,-98,l,-67,(l+r)/2,-61,r,-67);
      }
      for(const x of [-28,23]){
        polygon(c,'#ad8456',x-13,-8,x+16,-24,x+21,-20,x-7,-4);
        polygon(c,'#f1e9c8',x-12,-10,x+8,-28,x+15,-25,x-3,-7);
        line(c,'#b58a59',3,x-9,-6,x-14,-1); line(c,'#b58a59',3,x+4,-13,x+11,-1);
      }
    } else if (kind === 'lifeguard') {
      for(const x of [-34,21]) {box(c,'#996f51',x,-53,7,52);box(c,'#ce9f74',x,-53,2,52);}
      polygon(c,'#e2b791',-45,-54,38,-54,49,-60,-36,-60);
      box(c,'#cc6655',-36,-96,67,39);
      polygon(c,'#a5584c',31,-96,42,-105,42,-64,31,-57);
      box(c,'#8ed1d9',-29,-92,51,23); box(c,'#fcf1d6',-6,-92,3,23);
      box(c,'#fff1ce',-38,-68,71,5); box(c,'#f4c380',-39,-60,80,4);
      polygon(c,'#ffc970',-47,-97,-30,-112,33,-112,48,-104,33,-96);
      line(c,'#e9c494',3,-23,-55,-36,-3); line(c,'#e9c494',3,-9,-55,-22,-3);
      for(let j=0;j<5;j++)line(c,'#ca9e73',2,-24-j*2.6,-48+j*10,-11-j*2.6,-48+j*10);
      line(c,'#b37d54',2,28,-111,28,-139); polygon(c,'#f37152',29,-140,51,-134,29,-128);
      oval(c,'#fff2c6',23,-71,8,8); oval(c,'#cc6456',23,-71,4,4);
    } else if (kind === 'shop' || kind === 'bakery' || kind === 'cinema' || kind === 'hotel') {
      const night = kind === 'cinema' || kind === 'hotel', tall = kind === 'bakery' || kind === 'hotel';
      const roof=tall?-142:-105, x=-49, w=85;
      const wall=night?(tall?'#566379':'#784e68'):(tall?'#dd9d74':'#e8bf80');
      const edge=night?'#393650':'#a77963';
      polygon(c,edge,x+w,roof,x+w+18,roof-11,x+w+18,-11,x+w,0);
      box(c,wall,x,roof,w,-roof);
      polygon(c,night?'#a48094':'#f4d6a4',x-4,roof,x+12,roof-11,x+w+21,roof-11,x+w+3,roof+1);
      box(c,night?'#e19ba9':'#f9dfaf',x-3,roof,w+6,6);
      if (!night) {
        const tile = tall ? '#b85e4e' : '#568f85';
        polygon(c,tile,x-6,roof,x+5,roof-18,x+w-8,roof-18,x+w+5,roof);
        polygon(c,tall?'#9a5145':'#44776f',x+w-8,roof-18,x+w+8,roof-23,x+w+21,roof-11,x+w+5,roof);
        line(c,tall?'#db8470':'#84b5a4',2,x+5,roof-18,x+w-8,roof-18);
      }
      for(let yy=roof+13; yy < -43; yy+=26) {
        for(let xx=x+8; xx<x+w-8; xx+=22) {
          box(c,night?'#39334a':'#fff0cb',xx-2,yy-2,17,19);
          box(c,night?'#ffd48a':'#76a9b1',xx,yy,13,14);
          box(c,night?'#e9a676':'#acd5cf',xx+2,yy+1,4,11);
        }
      }
      box(c,edge,x+4,-34,w-8,34);
      for(let col=0;col<3;col++) {
        box(c,night?'#795f81':'#87b5b6',x+9+col*23,-32,18,30);
        box(c,night?'#eabf92':'#c7e4db',x+12+col*23,-29,3,22);
      }
      if(night){
        rounded(c,'#33334f',x-5,-52,w+10,20,4);
        box(c,kind==='cinema'?'#ffb0b6':'#7ae8e0',x-3,-51,w+6,2);
        box(c,'#f4d39f',x-2,-35,w+4,2);
        c.textAlign='center';c.fillStyle='#ffe2ba';c.font='bold 12px sans-serif';
        c.fillText(kind==='cinema'?'C I N E M A':'H O T E L',x+w/2,-38);
        if(tall){box(c,'#fcafb4',x+2,roof+5,2,-roof-55);box(c,'#8be4d5',x+w-5,roof+5,2,-roof-55);}
      } else {
        for(let i=0;i<7;i++){
          const xx=x-4+i*13;
          polygon(c,i%2?'#fff1cd':tall?'#ca6f56':'#54959a',xx,-45,xx+13,-45,xx+15,-36,xx-2,-36);
          box(c,i%2?'#e9daba':tall?'#b35c49':'#467e87',xx-2,-36,17,4);
        }
      }
    } else if (kind === 'clock') {
      polygon(c,'#ab7958',-26,0,-26,-114,16,-114,31,-123,31,-10,16,0);
      box(c,'#f5cd94',-24,-113,40,111);
      box(c,'#c37d53',-31,-119,53,7); box(c,'#b2744d',-30,-5,52,5);
      for(const x of [-22,7])box(c,'#fbe5b6',x,-107,5,97);
      rounded(c,'#786b63',-10,-37,13,36,6);
      oval(c,'#795f4b',-4,-88,17,17);oval(c,'#fff3c9',-4,-88,14,14);
      line(c,'#755b4b',2,-4,-98,-4,-88,4,-85);
      polygon(c,'#419a98',-33,-119,-5,-160,26,-120);
      polygon(c,'#347675',-5,-160,32,-131,31,-120,26,-120);
      oval(c,'#fcd378',-5,-160,3,3);
    } else if (kind === 'street-tree') {
      box(c,'#ae8661',-27,-10,55,9);box(c,'#775e4c',-5,-75,11,68);
      for(const [x,y,r] of [[-18,-77,23],[17,-77,25],[-1,-97,29]]) {
        oval(c,'#487b58',x,y,r,r);oval(c,'#76b56b',x-3,y-4,r*.83,r*.81);
        oval(c,'#93c97b',x-r*.32,y-r*.4,r*.34,r*.25);
      }
    } else if (kind === 'obelisk' || kind === 'ruins') {
      function column(x,y,h,w) {
        polygon(c,'#c38350',x-w-7,y,x-w-7,y-7,x+w+7,y-7,x+w+7,y);
        polygon(c,'#edc784',x-w-7,y-7,x-w+2,y-12,x+w+12,y-12,x+w+7,y-7);
        polygon(c,'#e7b374',x-w+1,y-9,x-w*.65,y-h,x+w*.46,y-h,x+w*.68,y-9);
        polygon(c,'#bf8050',x+w*.46,y-h,x+w*.9,y-h+3,x+w,y-10,x+w*.68,y-9);
        for(let j=0;j<4;j++)line(c,'#bd885d',1.4,x-w*.79,y-h+8+j*10,x+w*.35,y-h+8+j*10);
      }
      if(kind==='obelisk') {
        column(0,0,143,19);
        polygon(c,'#ffe0a1',-12,-143,0,-170,9,-143); polygon(c,'#d79d68',0,-170,17,-140,9,-143);
        for(let i=0;i<3;i++) polygon(c,'#bd8654',-7,-76+i*14,0,-81+i*14,6,-76+i*14,0,-70+i*14);
      } else {
        column(-42,0,66,12); column(-3,-6,101,12);column(36,-5,98,12);
        polygon(c,'#e6b47b',-24,-119,48,-119,49,-105,-22,-105);
        polygon(c,'#ba8058',48,-119,55,-124,55,-111,49,-105);
        polygon(c,'#f6d093',-24,-119,-16,-124,55,-124,48,-119);
      }
    } else if (kind === 'market') {
      line(c,'#815639',3,-45,-6,-45,-54); line(c,'#815639',3,42,-3,42,-54);
      polygon(c,'#c75f48',-57,-49,-15,-84,21,-81,55,-49);
      polygon(c,'#e18b55',-57,-49,-16,-84,2,-81,-13,-48);
      polygon(c,'#edba73',-14,-49,1,-83,8,-82,10,-49);
      for(let i=0;i<7;i++)polygon(c,i%2?'#b85a46':'#e6aa64',-54+i*15,-49,-39+i*15,-49,-46+i*15,-40);
      box(c,'#9e6e4e',-46,-24,82,21);box(c,'#daa66a',-49,-28,89,6);
      for(const [x,r,pot] of [[-31,9,'#b66d4d'],[-6,12,'#6ba6a1'],[22,8,'#d29558']]){
        oval(c,pot,x,-34,r,r*.83);box(c,pot,x-r*.48,-47,r*.96,8);oval(c,'#6e6355',x,-47,r*.53,2.1);
      }
    } else if (kind === 'rail-stop') {
      for(const x of [-42,35])box(c,'#646476',x,-88,5,86);
      box(c,'#54475d',-37,-66,72,35);box(c,'#e3bd89',-27,-62,19,22);
      box(c,'#9ec2c4',-3,-62,29,22); box(c,'#c6b3ba',-30,-24,65,4);
      for(const x of [-22,24])box(c,'#737084',x,-20,4,19);
      polygon(c,'#6d6c87',-53,-85,-36,-98,42,-98,53,-88,37,-83);
      box(c,'#e7b58e',-51,-85,92,3);
      rounded(c,'#364053',-27,-102,53,13,3); c.fillStyle='#a9f5e5'; c.textAlign='center'; c.font='bold 9px sans-serif'; c.fillText('M E T R O',0,-93);
    } else if (kind === 'lamp') {
      box(c,'#444c64',-7,-10,14,10);line(c,'#536478',4,0,-6,0,-115,5,-122,18,-122);
      oval(c,'rgba(255,218,158,.15)',20,-115,18,15);
      polygon(c,'#465268',11,-119,14,-124,26,-124,31,-119);
      polygon(c,'#ffdea0',12,-118,30,-118,25,-111,17,-111);
    } else if (kind === 'saucer') {
      polygon(c,'rgba(128,237,240,.24)',-20,-77,19,-77,39,-3,-38,-3);
      oval(c,'#33475f',0,-79,51,14); oval(c,'#91adb9',0,-84,54,11);
      oval(c,'#c1d3d1',0,-88,43,7); oval(c,'#3b7996',0,-94,21,13);
      oval(c,'#91f2df',-4,-98,13,7);
      for(let i=-2;i<=2;i++)oval(c,i%2?'#82ffff':'#fcca94',i*16,-80+(Math.abs(i)*-1.2),3,2);
    } else if (kind === 'solar') {
      for(const x of [-33,27]) {
        polygon(c,'#797f9c',x-10,-1,x-4,-32,x+4,-35,x+9,-1);
        polygon(c,'#b0aeca',x-35,-70,x+19,-82,x+36,-46,x-19,-33);
        polygon(c,'#315a96',x-32,-69,x+18,-78,x+32,-48,x-18,-37);
        for(let n=1;n<4;n++)line(c,'#86b4df',1,x-32+n*12.4,-69-n*2.3,x-18+n*12.4,-37-n*2.3);
        for(let n=1;n<3;n++)line(c,'#86b4df',1,x-32+n*5,-69+n*10.7,x+18+n*5,-78+n*10.2);
      }
    } else if (kind === 'radar') {
      polygon(c,'#747994',-47,0,-34,-29,25,-29,47,0);
      box(c,'#a8abc2',-30,-38,51,26);box(c,'#61cdd2',-22,-31,32,6);
      polygon(c,'#b4a9c3',-10,-38,-5,-77,8,-80,12,-38);
      c.save();c.translate(2,-88);c.rotate(-.48);
      c.beginPath();c.ellipse(0,0,43,23,0,0,Math.PI);c.fillStyle='#9290af';c.fill();
      oval(c,'#d3d5de',0,0,43,8);oval(c,'#a9b7c9',0,-1,37,5);
      line(c,'#c7d3d9',2,-21,0,1,-30,26,-1);oval(c,'#72edee',1,-30,4,4);c.restore();
      line(c,'#787d9e',2,31,-7,32,-64);oval(c,'#f5bb9b',32,-65,3,3);
    } else if (kind === 'city-post' || kind === 'sand-post' || kind === 'night-post' || kind === 'orbit-post') {
      const p={
        'city-post':['#677f80','#e4cfaa','#83a5a0'],
        'sand-post':['#b47a51','#f7d093','#af7551'],
        'night-post':['#4c5370','#f7c5a3','#f29c93'],
        'orbit-post':['#4b526d','#c2cde0','#68ffff']
      }[kind];
      polygon(c,p[0],-11,0,-7,-4,-6,-27,5,-30,9,-4,13,0);
      polygon(c,p[1],-7,-4,-6,-28,1,-29,2,-4);
      box(c,p[2],-7,-25,14,7);
    } else if (kind === 'windmill') {
      polygon(c, '#9ebbb0', -3, 0, -1.5, -135, 2, -135, 5, 0);
      polygon(c, '#e3e8cd', -3, 0, -1.5, -135, .5, -135, 1, 0);
      c.translate(0, -134);
      for (let i = 0; i < 3; i++) {
        c.rotate(i === 0 ? -.40 : TAU / 3);
        polygon(c, '#fbf2d4', 0, 0, -3, -13, -2, -54, 1, -67, 3, -24, 2, -6);
        polygon(c, '#e99776', -.9, -54, 1, -67, 2, -54);
      }
      oval(c, '#f7efcd', 0, 0, 3.8, 3.8);
    } else if (kind === 'flag') {
      line(c, '#e0d6b2', 3.4, -1, 0, -1, -116);
      polygon(c, '#f1734f', 1, -115, 20, -107, 33, -104, 45, -106, 37, -96, 28, -90, 15, -92, 1, -98);
      polygon(c, '#f7db92', 1, -113, 9, -110, 9, -97, 1, -100);
      oval(c, '#f8dfa0', -1, -117, 2, 2);
    } else if (kind === 'beacon') {
      polygon(c, '#666d5b', -16, 0, -15, -4, 12, -4, 15, 0);
      rounded(c, '#e2dbc0', -7, -43, 14, 40, 2);
      box(c, '#ee845b', -7, -33, 14, 12);
      box(c, '#95a196', 2, -20, 5, 16);
      rounded(c, '#ecebcf', -7, -46, 14, 7, 3);
    } else if (kind === 'left' || kind === 'right') {
      box(c, '#617e78', -20, -61, 5, 61);
      box(c, '#617e78', 17, -61, 5, 61);
      rounded(c, '#365758', -37, -86, 74, 33, 4);
      rounded(c, '#f9ce72', -35, -84, 70, 28, 3);
      c.translate(0, -70);
      c.scale(kind === 'left' ? -1 : 1, 1);
      for (const x of [-21, 1]) polygon(c, '#394d4d', x, -11, x + 9, -11, x + 20, 0, x + 9, 11, x, 11, x + 10, 0);
    }
    scenerySprites.set(kind, canvas);
    return canvas;
  }


  // Distance, side of the track and apparent size. Landmarks repeat at the lap boundary.
  const landmarks = {
    beach:[[28,1.68,'lifeguard',1.50],[47,-1.75,'palms',1.65],[92,1.49,'parasol',1.40],
      [141,-1.75,'lighthouse',1.50],[172,1.70,'palms',1.35],[233,1.60,'parasol',1.25],[288,-1.72,'palm',1.60],
      [351,1.70,'lifeguard',1.40],[399,-1.62,'palms',1.38],[459,1.56,'parasol',1.34],[499,-1.69,'palm',1.42],
      [581,1.71,'palms',1.55],[605,-1.75,'lighthouse',1.75],[652,1.59,'parasol',1.42],
      [728,-1.62,'lifeguard',1.48],[784,1.65,'palms',1.61],[843,-1.82,'windmill',1.68],[903,-1.50,'parasol',1.28],
      [942,1.71,'palm',1.57],[995,-1.74,'palms',1.40],[1021,1.41,'flag',.91]],
    city:[[25,-1.80,'clock',1.80],[43,1.70,'shop',1.78],[81,1.64,'bakery',1.68],[106,-1.70,'street-tree',1.49],
      [146,1.62,'shop',1.80],[200,-1.70,'bakery',1.73],[249,1.52,'street-tree',1.42],[299,-1.68,'shop',1.94],
      [353,1.72,'clock',1.83],[409,-1.79,'bakery',1.61],[443,1.65,'shop',1.72],[499,-1.51,'street-tree',1.37],
      [561,1.69,'bakery',1.73],[599,-1.69,'shop',1.83],[657,1.60,'street-tree',1.42],[712,-1.68,'clock',1.80],
      [756,1.66,'shop',1.87],[818,-1.71,'bakery',1.72],[872,-1.59,'street-tree',1.35],
      [914,1.73,'shop',1.82],[963,-1.65,'bakery',1.65],[1012,1.51,'street-tree',1.42]],
    desert:[[29,1.63,'obelisk',1.60],[48,-1.78,'ruins',1.69],[112,-1.67,'market',1.42],[158,1.73,'palms',1.58],
      [224,-1.79,'obelisk',1.74],[271,1.64,'market',1.43],[323,-1.63,'palm',1.30],[372,1.75,'ruins',1.71],
      [422,-1.89,'palms',1.53],[469,1.73,'obelisk',1.57],[532,-1.65,'market',1.61],[579,1.79,'ruins',1.59],
      [632,-1.72,'obelisk',1.74],[684,1.64,'palm',1.5],[754,1.73,'market',1.49],[800,-1.75,'ruins',1.71],
      [851,1.72,'obelisk',1.62],[907,-1.79,'market',1.47],[974,1.64,'palms',1.44],[1018,-1.76,'ruins',1.8]],
    night:[[24,1.76,'cinema',1.92],[41,-1.72,'hotel',1.77],[88,1.54,'lamp',1.36],[136,-1.70,'rail-stop',1.70],
      [179,1.83,'hotel',1.79],[237,-1.67,'cinema',1.84],[291,1.58,'lamp',1.40],[334,-1.74,'hotel',1.86],
      [397,1.75,'rail-stop',1.64],[454,-1.71,'cinema',1.78],[508,1.65,'lamp',1.40],[568,1.69,'hotel',1.92],
      [626,-1.74,'rail-stop',1.64],[683,1.70,'cinema',1.82],[732,-1.58,'lamp',1.40],[776,-1.72,'hotel',1.88],
      [830,1.70,'cinema',1.78],[901,-1.64,'rail-stop',1.70],[941,1.55,'lamp',1.42],[992,1.66,'hotel',1.86]],
    space:[[25,1.77,'saucer',1.74],[48,-1.74,'radar',1.64],[96,1.60,'solar',1.57],[153,-1.74,'saucer',1.73],
      [213,1.72,'radar',1.67],[272,-1.67,'solar',1.52],[338,1.80,'saucer',1.82],[383,-1.78,'radar',1.69],
      [442,1.66,'solar',1.55],[514,-1.78,'saucer',1.71],[575,1.68,'radar',1.63],[621,-1.72,'solar',1.64],
      [684,1.79,'saucer',1.85],[743,-1.71,'radar',1.65],[804,1.70,'solar',1.56],[884,-1.74,'saucer',1.80],
      [936,1.72,'radar',1.65],[998,-1.68,'solar',1.68]]
  };
  const crossings = {beach:[], city:[75,616], desert:[], night:[85,611,948], space:[66,339,624,939]};

  function drawCrossing(c, p, id) {
    const half=p.half;
    c.save(); c.translate(p.x,p.y); c.scale(half,half);
    if (id === 'space') {
      for (const side of [-1,1]) {
        c.save(); c.scale(side,1);
        polygon(c,'#344653',1.05,0,1.24,0,1.34,-.22,1.34,-.96,.89,-1.44,0,-1.44,0,-1.28,.80,-1.28,1.16,-.91,1.16,-.25);
        line(c,'#a2ee84',.056,1.12,-.02,1.24,-.24,1.24,-.93,.83,-1.36,0,-1.36);
        line(c,'#98f3ea',.016,1.19,-.23,1.19,-.91,.80,-1.31,.36,-1.31);
        c.restore();
      }
    } else {
      const day = id === 'city';
      for (const side of [-1,1]) {
        box(c,day?'#bd6749':'#4e4b68',side*1.16-.052,-1.19,.104,1.19);
        box(c,day?'#f4a364':'#81728b',side*1.16-.045,-1.19,.024,1.19);
      }
      box(c,day?'#b96548':'#534e66',-1.25,-1.24,2.5,.09);
      box(c,day?'#dd8251':'#a2909c',-1.25,-1.56,2.5,.045);
      for(let i=0;i<8;i++){
        const x=-1.20+i*.30;
        line(c,day?'#e9995a':'#8e7e94',.033,x,-1.25,x+.15,-1.53,x+.30,-1.25);
      }
      if(!day) {
        rounded(c,'#75839a',-.87,-1.68,1.14,.19,.03);
        for(let i=0;i<7;i++)box(c,'#f9d392',-.79+i*.144,-1.64,.1,.065);
        box(c,'#e2a6a1',-.83,-1.53,1.06,.021);
      }
    }
    c.restore();
  }

  function ribbon(c, color, a, b, from, to) {
    polygon(c, color, a.x + a.half * from, a.y, a.x + a.half * to, a.y,
      b.x + b.half * to, b.y + .55, b.x + b.half * from, b.y + .55);
  }

  function buildRoad(v, s) {
    const points = [];
    const trackId = s.track.id;
    const baseElevation = elevation(s.distance, trackId);
    const start = Math.floor((s.distance - DEPTH * .49) / 3) * 3;
    const step = 3;
    let center = 0;
    let heading = 0;
    for (let pos = start; pos <= s.distance + FAR + step; pos += step) {
      const z = pos - s.distance;
      if (z > 0) {
        const dz = Math.min(z, step);
        heading += curveAt(pos - dz * .5, trackId) * dz * .008;
        center += Math.sin(heading) * dz;
      }
      const k = DEPTH / (DEPTH + z);
      const x = v.w * .5 + (center / HALF_ROAD - s.x * .41) * v.half * k;
      const y = v.horizon + v.depth * k * (1 - (elevation(pos, trackId) - baseElevation) / 10);
      points.push({ pos, x, y, half: v.half * k, k });
    }
    return points;
  }

  function at(points, distance) {
    const raw = (distance - points[0].pos) / 3;
    const i = clamp(Math.floor(raw), 0, points.length - 2);
    const t = clamp(raw - i, 0, 1);
    const p = points[i], q = points[i + 1];
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t,
      half: p.half + (q.half - p.half) * t, k: p.k + (q.k - p.k) * t };
  }

  // Aiming and drawing use the same road sample, including on turn-in and over crests.
  function roadFor(v, s) {
    if (v.distance !== s.distance || v.lane !== s.x || v.roadTrack !== s.track.id) {
      v.points = buildRoad(v, s);
      v.distance = s.distance;
      v.lane = s.x;
      v.roadTrack = s.track.id;
    }
    return v.points;
  }

  function kartPosition(v, p, driver) {
    const width = v.kartWidth * p.k;
    const hit = driver.hitEffect === 'missile' && driver.hitTime > 0;
    const hop = hit && !reducedMotion.matches ? Math.sin(Math.PI * clamp((2 - driver.hitTime) / .55, 0, 1)) * width * .32 : 0;
    return { x:p.x + p.half * driver.x, y:p.y, centerY:p.y - hop - .48 * width, width, hop };
  }

  function gateBoard(p) {
    return { top:p.y - p.half * .75, height:p.half * .174 };
  }

  function inAimRange(rival, distance) {
    const gap = rival.distance - distance;
    return rival.finishedAt === null && gap >= 2 && gap <= 125;
  }

  function aimSight(v, points, s) {
    const ahead = s.rivals.filter(r => inAimRange(r, s.distance))
      .sort((a, b) => a.distance - b.distance);
    const nearer = [kartPosition(v, at(points, s.distance), s)];
    const gate = s.question && at(points, s.question.distance);
    const board = gate && gateBoard(gate);
    let preview = null;
    for (const rival of ahead) {
      const road = at(points, rival.distance), kart = kartPosition(v, road, rival);
      // Do not lock a car hidden by another kart, the next hill, or a word sign.
      const offscreen = kart.x < 0 || kart.x > v.w || kart.centerY < 0 || kart.centerY > v.h;
      const blockedByKart = nearer.some(n => Math.abs(n.x - kart.x) < n.width * .30 &&
        kart.centerY > n.y - n.hop - n.width * .80 && kart.centerY < n.y - n.hop);
      nearer.push(kart);
      if (offscreen || blockedByKart) continue;
      if (points.some(p => p.pos > s.distance && p.pos < rival.distance && p.y < kart.centerY &&
        Math.abs(p.x - kart.x) < p.half)) continue;
      if (gate && s.question.distance < rival.distance && Math.abs(kart.x - gate.x) < gate.half &&
        kart.centerY >= board.top && kart.centerY <= board.top + board.height) continue;
      const x = road.x + s.x * road.half;
      const sight = { x, y:kart.centerY, tolerance:road.half * .22, kart, rival };
      if (Math.abs(kart.x - x) <= sight.tolerance) return { ...sight, targetId:rival.id };
      if (!preview) preview = sight;
    }
    if (preview) return preview;
    const p = at(points, s.distance + 40);
    return { x:p.x + p.half * s.x, y:p.y - v.kartWidth * p.k * .48, tolerance:p.half * .22 };
  }

  function findAimTarget(canvas, s) {
    const v = views.get(canvas);
    return v ? aimSight(v, roadFor(v, s), s).targetId ?? null : null;
  }

  function oasisWidth(pos) {
    const t = (wrap(pos,LAP) - 365) / 200;
    return t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
  }

  function drawRoad(v, points, id) {
    const c = v.c;
    const course = courses[id];
    // Several distant segments can project into a single pixel on a phone.
    for (let j = points.length - 1; j > 0;) {
      const a = points[j--];
      while (j > 0 && points[j].y - a.y < .8) j--;
      const b = points[j];
      if (a.y > v.h + 4 || b.y < v.horizon) continue;
      const stripe = wrap(Math.floor(b.pos / 6), 2);
      if (id === 'beach') {
        const coast = -1.75 - .40 * Math.sin(b.pos * TAU / 210);
        const nextCoast = -1.75 - .40 * Math.sin(a.pos * TAU / 210);
        polygon(c,course.ground[stripe],a.x+a.half*nextCoast,a.y,v.w,a.y,v.w,b.y+.7,b.x+b.half*coast,b.y+.7);
        polygon(c,'#e6efcd',a.x+a.half*nextCoast,a.y,a.x+a.half*(nextCoast+.07),a.y,b.x+b.half*(coast+.07),b.y+.7,b.x+b.half*coast,b.y+.7);
      } else {
        box(c,course.ground[stripe],0,a.y,v.w,b.y-a.y+.7);
        if (id === 'desert') {
          // The oasis follows the road for part of a lap. Both sampling points use the same shoreline.
          const nearLake = oasisWidth(b.pos), farLake = oasisWidth(a.pos);
          if (nearLake || farLake) {
            const nearBank = b.x - b.half * (1.65 + (1-nearLake)*2.7);
            const farBank = a.x - a.half * (1.65 + (1-farLake)*2.7);
            polygon(c, stripe ? '#59afb3' : '#62b9b9',nearBank,b.y+.5,nearBank-b.half*nearLake*3.4,b.y+.5,
              farBank-a.half*farLake*3.4,a.y,farBank,a.y);
          }
        }
      }
      const sidewalk = id === 'night' || id === 'city' ? 1.46 : 1.21;
      ribbon(c,course.shoulder[stripe],a,b,-sidewalk,sidewalk);
      ribbon(c,course.curb[stripe],a,b,-1.095,1.095);
      ribbon(c,course.asphalt[stripe],a,b,-1,1);
      ribbon(c,course.line,a,b,-.987,-.976);
      ribbon(c,course.line,a,b,.976,.987);
      if (id === 'space' && wrap(b.pos, 33) < 3) {
        line(c,'#41465d',Math.max(.5,b.half*.007),b.x-b.half*.96,b.y,b.x+b.half*.96,b.y);
        for (const edge of [-.88,.88]) ribbon(c,'#8fced8',a,b,edge-.03,edge+.03);
      }
      if ((id === 'city' || id === 'night') && wrap(b.pos+35, 350) < 6) {
        for (let i=0;i<12;i++) ribbon(c,id==='city'?'#e1ddc6':'#9d9bac',a,b,-.94+i*.16,-.86+i*.16);
      }
      if (wrap(b.pos, 18) < 6) {
        for (const x of [-1 / 3, 1 / 3]) ribbon(c,course.line,a,b,x-.006,x+.006);
      }
      if (wrap(b.pos, LAP) < 3) {
        for (let i = 0; i < 16; i++) {
          const x = -1 + i / 8;
          const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, half: (a.half + b.half) / 2 };
          ribbon(c, i % 2 ? '#ebe6d8' : '#303e48', a, middle, x, x + .125);
          ribbon(c, i % 2 ? '#303e48' : '#ebe6d8', middle, b, x, x + .125);
        }
      }
    }
  }

  function drawGate(c, p, question) {
    const half = p.half;
    const {top, height} = gateBoard(p);
    const pole = Math.max(1.4, half * .015);
    const width = half * (2 / question.options.length);
    c.save();
    for (let i = 0; i <= question.options.length; i++) {
      const x = p.x - half + width * i;
      box(c, '#455c62', x - pole, top + height * .5, pole * 2, p.y - top - height * .5);
      box(c, '#b8cbbe', x - pole, top + height * .5, pole * .65, p.y - top - height * .5);
      box(c, '#f1b857', x - pole, p.y - half * .085, pole * 2, half * .04);
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    question.options.forEach((word, i) => {
      const x = p.x - half + width * i;
      const selected = i === question.lane;
      const inset = half * .010;
      const frame = selected ? '#ffca62' : '#e9e8c9';
      rounded(c, frame, x + inset, top, width - inset * 2, height, Math.max(1, height * .10));
      rounded(c, selected ? '#174c58' : '#284c58', x + inset * 2, top + inset, width - inset * 4, height - inset * 2, Math.max(1, height * .07));
      if (selected) polygon(c, '#ffca62', x + width * .5 - height * .14, top + height - 1,
        x + width * .5 + height * .14, top + height - 1, x + width * .5, top + height * 1.17);
      c.font = 'bold ' + Math.max(4, Math.min(height * .58, width * 1.4 / Math.max(3, word.length))) + 'px system-ui, sans-serif';
      c.fillStyle = '#fff4d6';
      c.fillText(word, x + width / 2, top + height * .51, width - inset * 7);
      const lane = x + width / 2;
      polygon(c, selected ? 'rgba(255,202,98,.70)' : 'rgba(238,232,205,.50)',
        lane - width * .27, p.y, lane + width * .27, p.y, lane + width * .24, p.y - half * .012,
        lane - width * .24, p.y - half * .012);
    });
    c.restore();
  }

  function drawPeel(c, lift) {
    oval(c, 'rgba(28,40,43,.23)', 2, 2, 18, 4);
    c.translate(0, -lift);
    polygon(c, '#935e26', -20, 1, -12, -2, -4, -5, -2, -16, 2, -18, 4, -7, 10, -4, 20, -7, 16, 0, 6, 4, 0, 2, -9, 6);
    polygon(c, '#ffd84e', -19, 1, -10, -1, -2, -5, 0, -15, 2, -16, 2, -6, 9, -3, 17, -5, 13, -1, 5, 1, 0, -1, -9, 4);
    polygon(c, '#fff2a4', 0, -2, 5, 2, 9, 8, 1, 5, -4, 1);
  }

  function drawKart(v, p, s, driver, isPlayer) {
    const c = v.c;
    const steer = isPlayer ? s.steer : clamp(curveAt(driver.distance, s.track.id) * .65, -.8, .8);
    const {width, x, y, hop} = kartPosition(v, p, driver);
    if (x < -width || x > v.w + width || y - width > v.h) return;
    const bouncing = isPlayer && s.offroad;
    const wobble = reducedMotion.matches ? 0 : Math.sin(s.elapsed * (bouncing ? 40 : 21) + driver.id) * width
      * (bouncing ? .014 : .004) * clamp(s.speed / 100, 0, 1);
    oval(c, 'rgba(36,47,52,.30)', x + width * .05, y - width * .018, width * .52, width * .094);
    const skidRemaining = isPlayer ? s.skid : driver.hitEffect === 'banana' ? driver.hitTime : 0;
    const slipping = skidRemaining > 0;
    const skidSide = isPlayer ? s.skidSide : driver.id % 2 === 0 ? 1 : -1;
    const skidProgress = slipping ? clamp(1 - skidRemaining / s.skidDuration, 0, 1) : 0;
    const spin = 1 - (1 - skidProgress) ** 2;
    const car = driver.car;
    const slideAngle = isPlayer && s.drifting ? Math.round(steer * 2) : 0;
    const rotation = slipping ? Math.round(spin * models.views) * skidSide : slideAngle;
    const frame = reducedMotion.matches ? 0 : wrap(rotation, models.views);
    const sprite = models.kartSprite(car, frame, isPlayer ? '07' : String(driver.id + 11));
    const hitTime = driver.hitEffect === 'missile' ? driver.hitTime : 0;
    c.save();
    c.translate(x, y + wobble - hop);
    if (slipping) {
      const t = reducedMotion.matches ? 0 : skidProgress;
      c.save();
      c.translate(-skidSide * width * (.45 + .19 * t), width * (.02 + .11 * t));
      c.scale(-skidSide * width / 170, width / 170);
      c.globalAlpha = Math.min(1, (1 - skidProgress) * 4);
      drawPeel(c, Math.sin(t * Math.PI) * 13);
      c.restore();
    }
    c.rotate(steer * (s.drifting && isPlayer ? .105 : .030));
    const scale = width / 184;
    if (!reducedMotion.matches && (slipping || isPlayer && (s.drifting || s.offroad))) {
      for (const side of [-1, 1]) {
        for (let n = 0; n < 4; n++) {
          const t = wrap(s.elapsed * 2.5 + n / 4, 1);
          const dx = side * width * (.40 + t * .15) - steer * width * t * .12;
          oval(c, isPlayer && s.offroad ? 'rgba(220,198,157,.43)' : 'rgba(227,232,227,.46)',
            dx, width * (.008 + .12 * t), width * (.02 + t * .05), width * (.015 + t * .028));
        }
      }
    }
    if (isPlayer && s.boost > 0) {
      const fire = reducedMotion.matches ? 1 : 1 + Math.sin(s.elapsed * 39) * .24;
      const sweep = -Math.sin(frame * TAU / models.views) * 48 * scale;
      for (const [u,v] of sprite.exhaustTips) {
        const xx = u * scale, yy = v * scale;
        polygon(c, '#ff9954', xx - 6 * scale, yy, xx + 6 * scale, yy,
          xx + sweep * .4 + 3 * scale, yy + 20 * scale, xx + sweep, yy + 42 * scale * fire,
          xx + sweep * .4 - 4 * scale, yy + 19 * scale);
        polygon(c, '#fff0a5', xx - 3 * scale, yy, xx + 3 * scale, yy,
          xx + sweep * .5, yy + 28 * scale * fire);
      }
    }
    c.drawImage(sprite, -122 * scale, -190 * scale, 244 * scale, 200 * scale);
    c.restore();
    if (hitTime > 0) {
      const t = reducedMotion.matches ? .55 : clamp((2 - hitTime) / .55, 0, 1);
      const glow = Math.max(.6, 1 - t);
      c.save();
      c.translate(x, y - .78 * width - hop);
      c.globalAlpha = Math.min(1, hitTime * 5);
      for (let i = 0; i < 3; i++) {
        const angle = Math.PI * (1.12 + i * .38);
        const radius = width * (.21 + .15 * t);
        const dx = Math.cos(angle) * radius, dy = Math.sin(angle) * radius;
        const size = Math.max(3, width * .13 * glow);
        polygon(c, '#784c24', dx, dy - size, dx + .34 * size, dy - .30 * size, dx + size, dy,
          dx + .34 * size, dy + .30 * size, dx, dy + size, dx - .34 * size, dy + .30 * size,
          dx - size, dy, dx - .34 * size, dy - .30 * size);
        polygon(c, '#ffdb56', dx, dy - .78 * size, dx + .62 * size, dy, dx, dy + .78 * size, dx - .62 * size, dy);
      }
      c.restore();
    }
  }

  function drawSight(v, points, s) {
    const c = v.c, sight = aimSight(v, points, s);
    const acquiring = sight.targetId != null && s.aim.targetId === sight.targetId;
    const locked = acquiring && s.aim.progress >= 1;
    const color = locked ? '#ff726a' : acquiring ? '#83ffdf' : '#f3fffd';
    const w = Math.max(5, sight.tolerance);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    // Horizontal ticks mark the tolerance at the opponent's actual depth.
    for (const side of [-1, 1]) {
      const x = sight.x + side * w;
      const pts = [x, sight.y - 4, x, sight.y + 4, x + side * 4, sight.y + 4];
      line(c, '#203a48', 3.5, ...pts); line(c, color, 1.6, ...pts);
    }
    oval(c, '#203a48', sight.x, sight.y, 2.5, 2.5);
    oval(c, color, sight.x, sight.y, 1.4, 1.4);
    if (acquiring) {
      const {x, centerY, width} = sight.kart;
      const radius = Math.max(9, width * (.61 - .08 * s.aim.progress));
      const tip = Math.max(4, radius * .34);
      for (const a of [-1, 1]) for (const b of [-1, 1]) {
        const xx = x + a * radius, yy = centerY + b * radius * .90;
        const stroke = [xx - a * tip, yy, xx, yy, xx, yy - b * tip];
        line(c, '#203a48', 4, ...stroke); line(c, color, 2, ...stroke);
      }
      const barWidth = Math.max(18, radius * 1.3), barY = centerY - radius * .9 - 6;
      box(c, '#203a48', x - barWidth / 2 - 1, barY - 1, barWidth + 2, 4);
      box(c, color, x - barWidth / 2, barY, barWidth * s.aim.progress, 2);
      if (locked) {
        const tipY = barY - 3;
        polygon(c, color, x - 4, tipY - 4, x + 4, tipY - 4, x, tipY);
        c.font = 'bold 12px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.lineWidth = 3; c.strokeStyle = '#203a48';
        c.strokeText('可發射', x, tipY - 5);
        c.fillStyle = '#fff5e0'; c.fillText('可發射', x, tipY - 5);
      }
    }
    c.restore();
  }

  function drawMissile(v, points, s, p, shot) {
    const c = v.c, target = s.rivals.find(r => r.id === shot.targetId);
    if (!target) return;
    const projectile = kartPosition(v, p, shot);
    const end = kartPosition(v, at(points, target.distance), target);
    const lift = reducedMotion.matches ? 0 : .56 * Math.sin(Math.PI * shot.progress);
    const x = projectile.x + (.20 * projectile.width * (1 - shot.progress));
    const y = projectile.centerY - lift * projectile.width;
    const scale = clamp(projectile.width / 125, .28, 1.75);
    c.save();
    c.translate(x, y);
    c.rotate(Math.atan2(end.centerY - y, end.x - x));
    c.scale(scale, scale);
    polygon(c, '#f9a549', -12,-3, -21,-5, -19,-2, -29,1, -21,3, -23,5, -12,3);
    polygon(c, '#fff6ba', -11,-2, -22,0, -11,2);
    polygon(c, '#213849', -16,-8, -8,-6, -5,-5, 6,-5, 15,0, 6,5, -5,5, -16,8, -14,2, -14,-2);
    polygon(c, '#ee6556', -14,-6, -5,-4, -6,4, -14,6, -12,1, -12,-1);
    polygon(c, '#fff2cf', -9,-3, 5,-4, 13,0, 5,4, -9,3);
    polygon(c, '#ee6556', 6,-3, 13,0, 6,3);
    c.restore();
  }

  function drawObjects(v, points, s, preview) {
    const near = Math.max(points[0].pos, s.distance - 8);
    const far = s.distance + FAR;
    const entries = [];
    function add(pos, lane, kind, size, driver) {
      if (pos >= near && pos <= far) entries.push({ pos, lane, kind, size, driver });
    }
    const id = s.track.id, course = courses[id], length = s.trackLength;
    for (let lap = Math.floor(near / length); lap <= Math.floor(far / length); lap++) {
      const base = lap * length;
      for (const [pos, lane, kind, size] of landmarks[id]) add(base + pos, lane, kind, size);
      for (const pos of crossings[id]) add(base + pos, 0, 'crossing', 1);
      for (const [start, end, strength] of course.turns) {
        const outside = -Math.sign(strength) * 1.36, arrow = strength > 0 ? 'right' : 'left';
        add(base + start + 2, outside, arrow, .80);
        if (end - start > 98) add(base + start + 45, outside, arrow, .80);
      }
    }
    for (let i = Math.ceil(near / 21); i * 21 < far; i++) {
      add(i * 21, -1.13, course.post, .68);
      if (i % 3 === 0) add(i * 21, 1.14, course.post, .60);
    }
    if (!preview) {
      if (s.question) add(s.question.distance, 0, 'gate', 1);
      for (const peel of s.bananas) add(peel.distance, peel.x, 'banana', .16);
      for (const shot of s.missiles) add(shot.distance, shot.x, 'missile', 1, shot);
      for (const rival of s.rivals) add(rival.distance, rival.x, 'kart', 1, rival);
      add(s.distance, s.x, 'player', 1, { id: 7, x: s.x, car: s.car });
    }
    entries.sort((a, b) => b.pos - a.pos);
    for (const obj of entries) {
      const p = at(points, obj.pos);
      if (obj.kind === 'kart' || obj.kind === 'player') {
        drawKart(v, p, s, obj.driver, obj.kind === 'player');
      } else if (obj.kind === 'crossing') {
        drawCrossing(v.c, p, id);
      } else if (obj.kind === 'gate') {
        drawGate(v.c, p, s.question);
      } else if (obj.kind === 'banana') {
        const scale = Math.max(.14, p.half * obj.size / 40);
        v.c.save();
        v.c.translate(p.x + p.half * obj.lane, p.y);
        v.c.scale(scale, scale);
        drawPeel(v.c, 0);
        v.c.restore();
      } else if (obj.kind === 'missile') {
        drawMissile(v, points, s, p, obj.driver);
      } else {
        const width = p.half * obj.size;
        const x = p.x + p.half * obj.lane;
        if (x + width / 2 < 0 || x - width / 2 > v.w) continue;
        const icon = scenery(obj.kind);
        oval(v.c, 'rgba(38,42,53,.24)', x + width * .04, p.y, width * .12, width * .019);
        v.c.drawImage(icon, x - width / 2, p.y - width * 215 / 240, width, width * 220 / 240);
      }
    }
  }

  function landscapeView(c, w, h, id) {
    const half = Math.min(w * .465, h * 1.03);
    return { w, h, c, half, horizon: h * .314, depth: h * .535, trackId: id,
      kartWidth: Math.min(half * .46, h * .32), panorama: makePanorama(w, h, id) };
  }

  function drawLandscape(v, s, preview) {
    const id = s.track.id, course = courses[id], c = v.c;
    const pan = .12 * Math.sin(s.distance * TAU / s.trackLength) + .047 * Math.sin(s.distance * TAU / 350);
    c.drawImage(v.panorama, Math.round(-v.w * (.20 + pan)), 0);
    const points = roadFor(v, s);
    const end = points[points.length - 1];
    const tip = { x: end.x, y: v.horizon, half: 0 };
    ribbon(c, course.ground[0], tip, end, -1.5, 6.5);
    ribbon(c, course.asphalt[1], tip, end, -1, 1);
    drawRoad(v, points, id);
    drawObjects(v, points, s, preview);
    return points;
  }

  function drawTrackPreview(canvas, track) {
    const v = landscapeView(canvas.getContext('2d'), canvas.width, canvas.height, track.id);
    drawLandscape(v, { track, trackLength:LAP, distance:5, x:0 }, true);
  }

  function draw(canvas, s) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    let v = views.get(canvas);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75, 2200 / Math.max(w, h));
    if (!v || w !== v.w || h !== v.h || dpr !== v.dpr || v.trackId !== s.track.id) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const c = canvas.getContext('2d', { alpha: false });
      c.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      v = landscapeView(c, w, h, s.track.id);
      v.dpr = dpr;
      views.set(canvas, v);
    }
    const c = v.c;
    const points = drawLandscape(v, s, false);
    if (s.aim) drawSight(v, points, s);
    if (s.boost > 0 && !reducedMotion.matches) {
      const center = .51 * w;
      for (let i = 0; i < 10; i++) {
        const t = wrap(s.elapsed * 1.6 + i * .23, 1);
        const x = i % 2 ? w * (1.04 - i * .012) : w * (-.06 + i * .013);
        const y = h * (.41 + t * .73);
        line(c, 'rgba(255,239,184,.45)', Math.max(1, w * .0018),
          x, y, x + (center - x) * (.04 + t * .04), y - (y - v.horizon) * .14);
      }
    }
  }

  window.KartRender = { draw, drawTrackPreview, drawKartPreview:models.drawKartPreview, curveAt, findAimTarget, inAimRange };
})();
