// Circuit layouts are measured in metres. All renderers and cars share these
// sampled centre lines and the same physical edges for each quiz bypass.
(() => {
  'use strict';
  const halfWidth = 13.5;
  const gridLanes = [-7.2,-2.4,2.4,7.2];
  const diversion = {
    bypassCenter:23.5, bypassHalfWidth:6.5,
    forkStart:-152, forkEnd:-52, mergeStart:24, mergeEnd:124,
    islandStart:-60, islandEnd:32
  };
  const {bypassCenter,bypassHalfWidth,forkStart,forkEnd,mergeStart,mergeEnd,islandStart,islandEnd} = diversion;
  const islandTaper = 10;
  const bypassExtra = bypassCenter+bypassHalfWidth-halfWidth;
  const noBypass = {blend:0, center:bypassCenter, extra:0, inner:-halfWidth, innerSlope:0, outerSlope:0};
  const fullBypass = {blend:1, center:bypassCenter, extra:bypassExtra, inner:bypassCenter-bypassHalfWidth, innerSlope:0, outerSlope:0};

  function createTrack(id, name, english, layout) {
    const path = [{ x: 0, z: 0, s: 0 }];
    let length = 0;
    const gates = [];
    const last = () => path[path.length - 1];
    function point(x, z) {
      const previous = last();
      length += Math.hypot(x - previous.x, z - previous.z);
      path.push({ x, z, s: length });
    }
    function straight(x, z) {
      const a = last();
      const steps = Math.ceil(Math.hypot(x - a.x, z - a.z) / 2.5);
      for (let j = 1; j <= steps; j++) point(a.x + (x - a.x) * j / steps, a.z + (z - a.z) * j / steps);
    }
    function curve(bx, bz, cx, cz, x, z) {
      const a = last();
      const upper = Math.hypot(bx-a.x,bz-a.z) + Math.hypot(cx-bx,cz-bz) + Math.hypot(x-cx,z-cz);
      const steps = Math.ceil(upper / 2);
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, u = 1 - t;
        point(u*u*u*a.x + 3*u*u*t*bx + 3*u*t*t*cx + t*t*t*x,
              u*u*u*a.z + 3*u*u*t*bz + 3*u*t*t*cz + t*t*t*z);
      }
    }
    function quizStraight(x,z,gateOffset) {
      gates.push(length + gateOffset);
      straight(x,z);
    }
    layout({straight,curve,quizStraight});
    const wrap = s => (s % length + length) % length;

    function bypassAt(distance) {
      const s = wrap(distance);
      for (const gate of gates) {
        const d = s-gate;
        if (d <= forkStart || d >= mergeEnd) continue;
        if (d >= forkEnd && d <= mergeStart) return fullBypass;
        const entry = d < forkEnd, span = entry ? forkEnd-forkStart : mergeStart-mergeEnd;
        const t = (d-(entry ? forkStart : mergeEnd))/span;
        const blend = t*t*(3-2*t), slope = 6*t*(1-t)/span;
        const sweep = fullBypass.inner-noBypass.inner;
        return {blend, center:bypassCenter, extra:bypassExtra*blend, inner:noBypass.inner+sweep*blend,
          innerSlope:sweep*slope, outerSlope:bypassExtra*slope};
      }
      return noBypass;
    }
    function segmentIndex(s) {
      let low = 0, high = path.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (path[middle].s <= s) low = middle;
        else high = middle;
      }
      return low;
    }
    function sample(distance) {
      const s = wrap(distance), i = segmentIndex(s), a = path[i], b = path[i+1];
      const span = b.s-a.s, tx = (b.x-a.x)/span, tz = (b.z-a.z)/span;
      return { x:a.x + tx*(s-a.s), z:a.z + tz*(s-a.s), tx, tz };
    }
    function project(x,z,hintDistance) {
      let best = Infinity, bestIndex = 0, bestT = 0;
      const count = path.length-1;
      function check(i) {
        const a = path[i], b = path[i+1], dx=b.x-a.x, dz=b.z-a.z;
        const t = Math.min(1,Math.max(0,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
        const ex = x-(a.x+t*dx), ez = z-(a.z+t*dz), d2 = ex*ex+ez*ez;
        if (d2 < best) { best = d2; bestIndex = i; bestT = t; }
      }
      let scanAll = !Number.isFinite(hintDistance);
      if (!scanAll) {
        const near = segmentIndex(wrap(hintDistance));
        for (let j=-16; j<=16; j++) check((near+j+count)%count);
        // The closest endpoint at the edge of a hint window may still be far
        // along this straight. Retry globally after a reset or a large jump.
        scanAll = (bestIndex===(near-16+count)%count && bestT===0) ||
          (bestIndex===(near+16)%count && bestT===1);
      }
      const searchMargin=halfWidth+7;
      if(scanAll || (best>searchMargin**2 && best>(searchMargin+bypassAt(path[bestIndex].s).extra)**2))
        for(let i=0;i<count;i++)check(i);
      const a=path[bestIndex], b=path[bestIndex+1], span=b.s-a.s;
      const tx=(b.x-a.x)/span, tz=(b.z-a.z)/span, cx=a.x+bestT*(b.x-a.x), cz=a.z+bestT*(b.z-a.z);
      return {s:wrap(a.s+bestT*span),lateral:-(x-cx)*tz+(z-cz)*tx, x:cx,z:cz,tx,tz};
    }
    function islandEdges(d) {
      const taper = Math.min(1, Math.max(0,d-islandStart)/islandTaper, Math.max(0,islandEnd-d)/islandTaper);
      return {left:halfWidth-.04, right:halfWidth+2.45*taper};
    }
    function islandAt(distance) {
      const s = wrap(distance);
      for (const gate of gates) {
        const d = s-gate;
        if (d >= islandStart-1e-7 && d <= islandEnd+1e-7) return islandEdges(d);
      }
      return null;
    }

    // Quiz areas lie on straights. Their six true kerb corners form a convex
    // footprint, also used for contacts with the narrow leading/trailing faces.
    const islands = gates.map(gate => {
      function corner(d, side) {
        const p = sample(gate+d), offset = islandEdges(d)[side];
        return {x:p.x-p.tz*offset, z:p.z+p.tx*offset};
      }
      const vertices = [corner(islandStart,'left'), corner(islandEnd,'left'), corner(islandEnd,'right'),
        corner(islandEnd-islandTaper,'right'), corner(islandStart+islandTaper,'right'), corner(islandStart,'right')];
      const xs = vertices.map(v=>v.x), zs = vertices.map(v=>v.z);
      return {vertices, minX:Math.min(...xs), maxX:Math.max(...xs), minZ:Math.min(...zs), maxZ:Math.max(...zs)};
    });
    return {id,name,english,length,halfWidth,gates,sample,project,gridLanes,diversion,bypassAt,islandAt,islands};
  }

  function sunport({straight, curve, quizStraight}) {
    quizStraight(0, -290, 160);
    curve(0, -329, 31, -360, 70, -360);
    quizStraight(370,-360, 157);
    curve(410,-360,442,-328,442,-288);
    quizStraight(442, 6, 154);
    curve(442,61,510,65,510,136); // offset S through the gardens
    straight(510,220);
    curve(510,239.4,494.4,255,475,255);
    curve(455.6,255,440,239.4,440,220); // 35 m radius quay hairpin
    straight(440,174);
    curve(440,145,416,121,387,121);
    quizStraight(104,121, 154);
    curve(78,121,72,143,48,143);
    curve(20,143,0,123,0,95);
    straight(0,0);
  }

  function dunes({straight, curve, quizStraight}) {
    quizStraight(0,-302,162);
    curve(0,-343,-32,-378,-74,-378);
    quizStraight(-389,-378,166);
    curve(-423,-378,-452,-350,-452,-316);
    quizStraight(-452,-18,161);
    // Two linked bends drop into a left-hand hairpin around the western bluff.
    curve(-452,29,-514,21,-514,67);
    curve(-514,96,-538,120,-567,120);
    straight(-620,120);
    curve(-645,120,-663,140,-663,164);
    curve(-663,188,-643,208,-619,208);
    quizStraight(-134,208,215);
    curve(-99,208,-96,173,-69,157);
    curve(-32,135,0,122,0,73);
    straight(0,0);
  }

  function metro({straight, curve, quizStraight}) {
    quizStraight(0,-320,172);
    // The northern hook opens onto a diagonal boulevard and a downtown S.
    curve(0,-381,59,-409,105,-363);
    quizStraight(335,-133,165);
    curve(371,-97,406,-127,437,-100);
    curve(461,-79,459,-36,459,-6);
    quizStraight(459,310,164);
    curve(459,352,429,385,385,385);
    curve(349,385,336,355,312,345);
    curve(275,330,254,309,210,309);
    quizStraight(-116,309,168);
    curve(-151,309,-176,279,-176,247);
    curve(-176,213,-154,185,-120,185);
    straight(-68,185);
    curve(-28,185,0,152,0,112);
    straight(0,0);
  }

  function giant({straight, curve, quizStraight}) {
    quizStraight(0,-308,162);
    // Fold the track around the toy drum and return down its opposite side.
    curve(0,-339,25,-364,56,-364);
    curve(87,-364,112,-339,112,-308);
    quizStraight(112,35,171);
    curve(112,80,148,116,193,116);
    quizStraight(506,116,168);
    curve(546,116,577,147,577,187);
    curve(577,238,507,244,507,294);
    curve(507,342,484,393,430,393);
    quizStraight(76,393,178);
    curve(34,393,0,359,0,317);
    straight(0,0);
  }

  function beach({straight, curve, quizStraight}) {
    quizStraight(0,-310,163);
    curve(0,-352,-38,-384,-80,-384);
    curve(-125,-384,-150,-360,-178,-336);
    quizStraight(-430,-120,170);
    // Two diagonal straights wrap around the sandy point at the west tip.
    curve(-465,-90,-486,-66,-486,-32);
    curve(-486,9,-462,32,-434,60);
    quizStraight(-204,290,173);
    curve(-167,327,-141,358,-94,358);
    curve(-62,358,-53,334,-17,334);
    quizStraight(302,334,170);
    curve(340,334,370,303,370,265);
    curve(370,226,342,195,302,195);
    straight(213,195);
    curve(151,195,134,124,79,124);
    curve(30,124,0,103,0,55);
    straight(0,0);
  }

  const tracks = [
    createTrack('sunport','晴港市街','Sunport Circuit',sunport),
    createTrack('dunes','赤砂峽谷','Saffron Dunes',dunes),
    createTrack('metro','霓虹夜城','Neon City',metro),
    createTrack('giant','巨人玩具屋',"Giant's Playroom",giant),
    createTrack('beach','珊瑚海灘','Coral Beach',beach)
  ];
  window.ClassicCourses = {tracks};
})();
