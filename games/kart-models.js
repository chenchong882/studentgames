// G3 bodies share the same wheelbase, cockpit and driver. The same geometry is
// projected from the front in the garage, from behind in a race and around a spin.
(() => {
  'use strict';
  const views = 24, tau = 2 * Math.PI;
  const sprites = new Map();
  const tailpipes = { burst:[-22], saber:[-29, 29], solid:[-29, 29] };

  function shade(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const channel = n => Math.round(n + (amount > 0 ? 255 - n : n) * amount);
    return 'rgb(' + [value >> 16, (value >> 8) & 255, value & 255].map(channel).join(',') + ')';
  }
  function rectangle(x0, z0, x1, z1) {
    return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
  }
  function kartSprite(car, frame, number, showroom = false) {
    const { id, color } = car;
    const key = [id, color, frame, number, showroom].join('/');
    if (sprites.has(key)) return sprites.get(key);
    const canvas = document.createElement('canvas');
    const density = showroom ? 3 : 1.25;
    canvas.width = 244 * density; canvas.height = 200 * density;
    const c = canvas.getContext('2d');
    c.scale(density, density);
    c.translate(122, 163);
    c.lineJoin = 'round';
    const angle = frame * tau / views, cos = Math.cos(angle), sin = Math.sin(angle);
    const pitch = showroom ? .50 : .36, white = '#f4f4e6', metal = '#84949c';
    const bright = shade(color,.22), dark = shade(color,-.30);
    function project([x,y,z]) {
      const depth = z * cos - x * sin;
      return [x * cos + z * sin, -y - depth * pitch, depth - y * pitch];
    }
    canvas.exhaustTips = tailpipes[id].map(x => {
      const [u,v] = project([x,20,-69]);
      return [u, v + 163 - 190];
    });
    function polygon(pts, fill) {
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.closePath(); c.fillStyle = fill; c.fill();
      c.lineWidth = .45; c.strokeStyle = fill; c.stroke();
    }
    const faces = [];
    function face(vertices, fill, finish) {
      const pts = vertices.map(project);
      const depth = pts.reduce((sum,p) => sum + p[2], 0) / pts.length;
      faces.push({depth, draw() { polygon(pts, fill); if (finish) finish(); }});
    }
    // Keep markings attached to their panel in the painter's ordering.
    function panel(outline, bottom, top, paint, markings = []) {
      const base = outline.map(([x,z]) => [x,bottom,z]);
      const lid = outline.map(([x,z]) => [x,top,z]);
      for (let i = 0; i < outline.length; i++) {
        const j = (i + 1) % outline.length;
        const dx = outline[j][0] - outline[i][0], dz = outline[j][1] - outline[i][1];
        const length = Math.hypot(dx,dz) || 1;
        const lighting = -.24 + .14 * (dz - .45 * dx) / length;
        face([base[i],base[j],lid[j],lid[i]], shade(paint,lighting));
      }
      face(lid, paint, () => {
        for (const [ink, points] of markings) polygon(points.map(([x,z]) => project([x,top,z])), ink);
      });
    }
    function wheel(side, z, rear) {
      const ring = (x,r) => Array.from({length:16}, (_,i) => {
        const a = i * tau / 16;
        return [side * x, 16 + r * Math.sin(a), z + r * Math.cos(a)];
      });
      const outerX = rear ? 81 : 75;
      const outer = ring(outerX,19), shoulder = ring(outerX-3,21), inner = ring(55,21);
      for (let i=0; i<16; i++) {
        const j = (i+1)%16, light = Math.sin((i+.5)*tau/16);
        face([inner[i],inner[j],shoulder[j],shoulder[i]], shade('#303a47',light*.20));
        face([shoulder[i],shoulder[j],outer[j],outer[i]], shade('#29303a',light*.17));
      }
      // Paint the sidewall, alloy rim and hub together, in projection.
      face(outer, '#1f2733', () => {
        polygon(ring(outerX,12.5).map(project), '#9ca9ad');
        polygon(ring(outerX,9.5).map(project), '#42505b');
        polygon(ring(outerX,5).map(project), '#d9dcd4');
      });
    }
    for (const side of [-1,1]) {
      wheel(side, 39, false); wheel(side, -40, true);
    }
    panel([[-55,-57],[55,-57],[63,-37],[53,48],[30,62],[-30,62],[-53,48],[-63,-37]], 7,20,'#303b47');

    if (id === 'burst') {
      // Boxy shoulders carry two white longitudinal stripes interrupted by the nose.
      panel([[-72,43],[-63,34],[63,34],[72,43],[72,59],[64,68],[-64,68],[-72,59]], 14,32,color,
        [-52,-29,20,43].map(x => [white,rectangle(x,37,x+9,64)]));
      panel([[-17,15],[17,15],[16,69],[-16,69]],22,44,color,[[white,rectangle(-5,22,5,43)]]);
      for (const side of [-1,1]) {
        const l = side < 0 ? -75 : 42;
        panel(rectangle(l,-49,l+33,26),24,43,color,
          [[white,rectangle(l+8,-49,l+18,26)],[bright,rectangle(l+21,-48,l+23,26)]]);
      }
      panel(rectangle(-43,-64,43,-31),15,31,color,[[white,rectangle(16,-64,28,-32)]]);
    } else if (id === 'saber') {
      // The pointed centre and separate swept mudguards form a broad white V.
      panel([[-39,30],[-23,9],[23,9],[39,30],[19,55],[0,80],[-19,55]],17,36,color,
        [[white,[[-26,27],[-18,24],[0,62],[18,24],[26,27],[0,76]]]]);
      for (const side of [-1,1]) {
        const mirrored = pts => pts.map(([x,z])=>[x*side,z]);
        panel(mirrored([[31,53],[43,20],[69,33],[79,64],[63,70]]),14,33,color,
          [[white,mirrored([[35,52],[44,29],[71,58],[54,51],[63,64]])]]);
        panel(mirrored([[39,-41],[46,-6],[75,-19],[85,-51]]),23,40,color,
          [[white,mirrored([[45,-37],[48,-16],[75,-43],[63,-39],[54,-35]])]]);
      }
      panel([[-42,-57],[-31,-36],[31,-36],[42,-57],[0,-67]],13,30,color);
    } else {
      // Flat bolted armour and checkered rear fenders distinguish the Solid.
      panel([[-78,43],[-70,34],[70,34],[78,43],[78,61],[70,67],[-70,67],[-78,61]],10,40,color);
      panel([[-72,57],[72,57],[72,69],[-72,69]],9,16,'#aa791d');
      for (const x of [-61,-12,12,61]) {
        face([[x-2,21,67.4],[x+2,21,67.4],[x+2.8,26,67.4],[x-2,26,67.4]],dark);
      }
      panel(rectangle(-24,10,24,48),26,40,color,[[white,rectangle(-5,14,5,43)]]);
      for (const side of [-1,1]) {
        const l = side < 0 ? -76 : 43;
        const checks=[];
        for (let i=0;i<2;i++) for (let j=0;j<5;j++) {
          if ((i+j)%2===0) checks.push([white,rectangle(l+1+16*i,-52+j*13,l+17+16*i,-39+j*13)]);
        }
        panel(rectangle(l,-52,l+33,15),21,42,color,checks);
      }
      panel(rectangle(-41,-63,41,-25),15,32,color,
        [[white,rectangle(-8,-62,8,-49)],[white,rectangle(-23,-49,-8,-35)]]);
    }

    // Seat and open cockpit remain visible in the driverless showroom view.
    panel([[-30,-23],[30,-23],[25,17],[-25,17]],22,33,'#404a54');
    panel([[-26,-32],[26,-32],[30,-26],[26,-19],[-26,-19],[-30,-26]],28,54,'#34424c',
      [['#6c7c83',rectangle(-19,-28,19,-24)]]);
    panel(rectangle(-3,9,3,25),33,40,'#697681');
    const steering = Array.from({length:16},(_,i) => {
      const a=i*tau/16;
      return [16*Math.cos(a),43+7*Math.sin(a),18+7*Math.sin(a)];
    });
    face(steering,'#25323d',() => {
      const inner = steering.map(([x,y,z]) => project([x*.70,43+(y-43)*.64,18+(z-18)*.64]));
      polygon(inner,metal);
    });

    // Cylinders transverse to the axle give the viewer real exhaust openings.
    function port(x) {
      const ring=(z,r)=>Array.from({length:10},(_,i)=>{
        const a=i*tau/10; return [x+r*Math.cos(a),20+r*Math.sin(a),z];
      });
      const inner=ring(-43,8), outer=ring(-69,9);
      for (let i=0;i<10;i++) {
        const j=(i+1)%10;
        face([inner[i],inner[j],outer[j],outer[i]],shade('#8a9498',.20*Math.sin(i*tau/10)));
      }
      face(outer,'#c1c9c6',()=>polygon(ring(-69,6.2).map(project),'#26323a'));
    }
    for (const x of tailpipes[id]) port(x);
    const plate = [[-22,33,-57],[22,33,-57],[22,50,-57],[-22,50,-57]];
    face(plate,'#213241',() => {
      polygon([[-20,35,-57],[20,35,-57],[20,48,-57],[-20,48,-57]].map(project),'#f7cf65');
      if (cos > .20) {
        const left=project([-16,37,-57]);
        c.save(); c.transform(cos, sin*pitch, 0, 1, left[0],left[1]);
        c.textAlign='center'; c.fillStyle='#263543'; c.font='900 11px sans-serif';
        c.fillText(number || 'G3',16,0); c.restore();
      }
    });
    if (!showroom) {
      panel([[-30,-22],[30,-22],[35,-6],[21,13],[-21,13],[-35,-6]],35,66,color);
      for (const side of [-1,1]) {
        panel(rectangle(side*34,-5,side*19,13),47,58,'#f7eacf');
      }
    }
    faces.sort((a,b)=>b.depth-a.depth);
    for (const f of faces) f.draw();

    if (!showroom) {
      const [hx,hy] = project([0,103,-5]);
      c.save(); c.translate(hx,hy); c.scale(1.32,1.16);
      c.beginPath(); c.ellipse(0,0,44,43,0,0,tau);
      c.fillStyle='#273741'; c.fill(); c.clip();
      const lacquer=c.createRadialGradient(-14,-25,4,3,5,49);
      lacquer.addColorStop(0,'#fff9dd'); lacquer.addColorStop(.45,'#f2ebd6'); lacquer.addColorStop(1,'#aab3af');
      c.fillStyle=lacquer; c.fillRect(-43,-42,86,84);
      polygon([[-8,-43],[8,-43],[8-sin*22,-14],[6-sin*32,21],[3-sin*15,43],[-5-sin*15,43],[-7-sin*32,21],[-10-sin*22,-14]],color);
      // The visor wraps over the front hemisphere, disappearing in rear view.
      for (let j=0;j<24;j++) {
        const a=-1.70+3.40*j/24, b=a+3.40/24;
        if (Math.cos((a+b)/2+angle)>.06) continue;
        function visorBand(high,low,ink) {
          const pts=[[a,high],[b,high],[b,low],[a,low]].map(([az,h])=>{
            const r=Math.sqrt(43*43-h*h);
            const u=az+angle;
            return [r*Math.sin(u),-h*.94-r*Math.cos(u)*pitch];
          });
          polygon(pts,ink);
        }
        visorBand(16,-9,'#263c51'); visorBand(14,11,'#97bcca');
      }
      c.restore();
    }
    sprites.set(key, canvas);
    return canvas;
  }

  function drawKartPreview(canvas, car) {
    const c=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
    c.clearRect(0,0,w,h);
    const sprite=kartSprite(car,15,'G3',true);
    // Crop out the area reserved for the driver's helmet in the racing sprite.
    const scale=Math.min(w/225,h/138);
    const dx=w*.5-122*scale, dy=h*.5-135*scale;
    c.fillStyle='rgba(22,37,46,.22)'; c.beginPath();
    c.ellipse(w*.5,dy+175*scale,87*scale,15*scale,-.06,0,tau); c.fill();
    c.drawImage(sprite,dx,dy,244*scale,200*scale);
  }
  window.KartModels = { kartSprite, drawKartPreview, views };
})();
