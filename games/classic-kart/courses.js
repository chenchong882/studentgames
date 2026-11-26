// Circuit layouts are measured in metres. All renderers and cars share these
// sampled centre lines and the same physical edges for each quiz bypass.
(() => {
  'use strict';
  const halfWidth = 13.5;
  const gridLanes = [-11.2,-8,-4.8,-1.6,1.6,4.8,8,11.2];
  const sunportDiversion = {
    bypassCenter:23.5, bypassHalfWidth:6.5,
    forkStart:-152, forkEnd:-52, mergeStart:24, mergeEnd:124,
    islandStart:-60, islandEnd:32
  };
  function createTrack(id, name, english, layout, diversion = sunportDiversion) {
    const {bypassCenter,bypassHalfWidth,forkStart,forkEnd,mergeStart,mergeEnd,islandStart,islandEnd} = diversion;
    const islandTaper = 10;
    const bypassExtra = bypassCenter+bypassHalfWidth-halfWidth;
    const noBypass = {blend:0, center:bypassCenter, extra:0, inner:-halfWidth, innerSlope:0, outerSlope:0};
    const fullBypass = {blend:1, center:bypassCenter, extra:bypassExtra, inner:bypassCenter-bypassHalfWidth, innerSlope:0, outerSlope:0};
    const path = [{ x: 0, z: 0, s: 0 }];
    let length = 0;
    const gates = [];
    const last = () => path[path.length - 1];
    function point(x, z, arc) {
      const previous = last();
      length += arc ? arc.span : Math.hypot(x - previous.x, z - previous.z);
      path.push({ x, z, s: length, arc });
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
    const landmarks = layout({point, straight, curve, quizStraight, distance:() => length, gates}) || {};
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
        const inner = noBypass.inner+sweep*blend, extra = bypassExtra*blend;
        // A metre of centre line is shorter at the inside rail of a bend.
        // Express each taper's slope along its own edge for wall contact.
        const curvature = path[segmentIndex(s)+1].arc?.curvature || 0;
        return {blend, center:bypassCenter, extra, inner,
          innerSlope:sweep*slope/(1-curvature*inner),
          outerSlope:bypassExtra*slope/(1-curvature*(halfWidth+extra))};
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
    function sampleSegment(i,offset) {
      const a = path[i], b = path[i+1], arc = b.arc;
      if (arc) {
        const angle = arc.startAngle + offset*arc.curvature;
        const rx = Math.cos(angle), rz = Math.sin(angle), side = Math.sign(arc.curvature);
        return {x:arc.cx+arc.r*rx, z:arc.cz+arc.r*rz, tx:-side*rz, tz:side*rx};
      }
      const span = b.s-a.s, tx = (b.x-a.x)/span, tz = (b.z-a.z)/span;
      return {x:a.x+tx*offset, z:a.z+tz*offset, tx, tz};
    }
    function sample(distance) {
      const s = wrap(distance), i = segmentIndex(s);
      return sampleSegment(i,s-path[i].s);
    }
    function project(x,z,hintDistance) {
      let best = Infinity, bestIndex = 0, bestT = 0;
      const count = path.length-1;
      function check(i) {
        const a = path[i], b = path[i+1], dx=b.x-a.x, dz=b.z-a.z, arc=b.arc;
        let t = ((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz), d2;
        if (arc) {
          // Project onto the circle between its two radii. Rounded shoulders
          // and vehicles keep the same station even at the joins of short arcs.
          const rx=x-arc.cx, rz=z-arc.cz, ax=a.x-arc.cx, az=a.z-arc.cz;
          const side=Math.sign(arc.curvature), fromStart=ax*rz-az*rx, toEnd=rx*(b.z-arc.cz)-rz*(b.x-arc.cx);
          if (side*fromStart>=0 && side*toEnd>=0) {
            t=Math.atan2(fromStart,ax*rx+az*rz)/(arc.curvature*arc.span);
            d2=(Math.hypot(rx,rz)-arc.r)**2;
          } else {
            t=t<.5 ? 0 : 1;
          }
        }
        t=Math.min(1,Math.max(0,t));
        if (d2===undefined) {
          const ex=x-(a.x+t*dx), ez=z-(a.z+t*dz);
          d2=ex*ex+ez*ez;
        }
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
      const a=path[bestIndex], offset=bestT*(path[bestIndex+1].s-a.s);
      const p=sampleSegment(bestIndex,offset);
      return {s:wrap(a.s+offset),lateral:-(x-p.x)*p.tz+(z-p.z)*p.tx, ...p};
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
    return {id,name,english,length,halfWidth,gates,sample,project,gridLanes,diversion,bypassAt,islandAt,islands,landmarks};
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

  // Each vertex specifies the intersection of two tangents and the bend radius.
  // Replace the corner with a circular arc tangent to both legs. Measure gate
  // and landmark stations on the completed road to keep art and timing aligned.
  function roundedCircuit(vertices, gateStations, landmarkStations) {
    const corners = vertices.map(([x,z,r], i) => {
      const [px,pz] = vertices[(i+vertices.length-1)%vertices.length];
      const [nx,nz] = vertices[(i+1)%vertices.length];
      const incoming = Math.hypot(x-px,z-pz), outgoing = Math.hypot(nx-x,nz-z);
      const ux = (x-px)/incoming, uz = (z-pz)/incoming;
      const vx = (nx-x)/outgoing, vz = (nz-z)/outgoing;
      const turn = Math.atan2(ux*vz-uz*vx, ux*vx+uz*vz);
      const trim = r*Math.tan(Math.abs(turn)/2);
      const entryX = x-ux*trim, entryZ = z-uz*trim;
      const side = Math.sign(turn);
      return {entryX, entryZ, r, turn,
        cx:entryX-uz*r*side, cz:entryZ+ux*r*side,
        startAngle:Math.atan2(-ux*side,uz*side)};
    });
    return ({point, straight, distance, gates}) => {
      const sections = [];
      for (let i=0; i<corners.length; i++) {
        const c = corners[i], next = corners[(i+1)%corners.length], bendStart = distance();
        const count = Math.ceil(c.r*Math.abs(c.turn)/1.8);
        for (let j=1; j<=count; j++) {
          const a = c.startAngle+c.turn*j/count;
          const arc = {cx:c.cx,cz:c.cz,r:c.r,curvature:Math.sign(c.turn)/c.r,
            startAngle:c.startAngle+c.turn*(j-1)/count,span:c.r*Math.abs(c.turn)/count};
          point(c.cx+c.r*Math.cos(a),c.cz+c.r*Math.sin(a),arc);
        }
        const legStart = distance();
        straight(next.entryX,next.entryZ);
        sections.push({bendStart,legStart,end:distance()});
      }
      function alongLeg(i,fraction) {
        const section = sections[i];
        return section.legStart + fraction*(section.end-section.legStart);
      }
      for (const [i,fraction] of gateStations) gates.push(alongLeg(i,fraction));
      const landmarks = {};
      for (const [name,station] of Object.entries(landmarkStations)) {
        if (station.leg !== undefined) {
          landmarks[name] = alongLeg(station.leg,station.at);
        } else {
          const section = sections[station.bend];
          landmarks[name] = section.bendStart + station.at*(section.legStart-section.bendStart);
        }
      }
      return landmarks;
    };
  }

  // Two sweeping switchbacks fold three diagonals across opposite faces of the canyon.
  const dunes = roundedCircuit([
    [0,0,0], [0,-65,55], [-108,-187,60], [-330,-275,50],
    [-428,-271,35], [-448,-182,35], [-218,-28,56], [-127,60,40],
    [-173,143,35], [-333,92,56], [-489,-27,36], [-570,-40,42],
    [-586,78,50], [-443,223,57], [-217,331,61], [-58,292,55],
    [0,166,68]
  ], [[2,.53],[5,.60],[9,.55],[13,.56]],
  {arch:{leg:1,at:.33}, canyonEntry:{bend:7,at:.53}});

  // A stepped market district, two back-to-back left turns around the station, then a finishing boulevard.
  const metro = roundedCircuit([
    [0,0,0], [0,-276,54], [180,-276,39], [180,-434,36],
    [416,-434,44], [416,-314,38], [564,-314,46], [564,-97,49],
    [300,-97,37], [300,37,36], [444,37,38], [444,227,60],
    [0,227,63]
  ], [[0,.80],[3,.58],[7,.53],[11,.38]],
  {station:{leg:4,at:.45}, plaza:{bend:10,at:.52}});

  // Three lobes around the playroom: a book alcove, the drum carousel and two opposing turns through the toy chests.
  const giant = roundedCircuit([
    [0,0,0], [0,-84,52], [-182,-84,42], [-182,-372,71],
    [64,-372,61], [64,-238,47], [173,-141,35], [335,-232,55],
    [487,-139,78], [446,53,71], [255,91,59], [164,32,37],
    [85,71,33], [116,249,59], [-92,352,68], [-207,247,53],
    [-144,109,48], [0,109,41]
  ], [[2,.55],[6,.57],[9,.58],[13,.58]],
  {drum:{bend:9,at:.48}, desk:{leg:15,at:.62}});

  // Two broad bays meet at a narrow waist. Enter the first bay to the right,
  // cut back through the neck and sweep around a longer second headland.
  const beach = roundedCircuit([
    [0,0,0], [0,-67,52], [224,-201,79], [205,-352,92],
    [-125,-406,96], [-209,-276,87], [-182,-152,73], [-121,-64,71],
    [-112,13,67], [-213,73,62], [-390,87,92], [-500,210,107],
    [-482,362,99], [-334,467,111], [-103,443,93], [-14,319,87],
    [-62,205,66], [-58,137,53], [0,84,54]
  ], [[1,.62],[3,.46],[9,.60],[13,.62]],
  {cape:{bend:11,at:.57}, lagoon:{leg:6,at:.43}});

  const tracks = [
    createTrack('sunport','晴港市街','Sunport Circuit',sunport),
    createTrack('dunes','赤砂峽谷','Saffron Dunes',dunes,
      {...sunportDiversion, forkStart:-132, forkEnd:-48, mergeStart:22, mergeEnd:106, islandStart:-56, islandEnd:30}),
    createTrack('metro','霓虹夜城','Neon City',metro,
      {...sunportDiversion, forkStart:-118, forkEnd:-42, mergeStart:18, mergeEnd:88, islandStart:-50, islandEnd:26}),
    createTrack('giant','巨人玩具屋',"Giant's Playroom",giant,
      {...sunportDiversion, forkStart:-112, forkEnd:-40, mergeStart:16, mergeEnd:84, islandStart:-48, islandEnd:24}),
    createTrack('beach','珊瑚海灘','Coral Beach',beach,
      {...sunportDiversion, forkStart:-126, forkEnd:-48, mergeStart:24, mergeEnd:102, islandStart:-56, islandEnd:32})
  ];
  window.ClassicCourses = {tracks};
})();
