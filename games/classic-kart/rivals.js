// AI drivers read the same track in metres and send ordinary controls to the kart solver.
(() => {
  'use strict';
  const drive = window.ClassicDrive;
  const drivers = [
    { id:'breeze', name:'海風', color:'#268be3', number:'11', gridSlot:0, lane:-4.8, bypassOffset:-3.4, runout:56, drift:true },
    { id:'citrus', name:'柑橘', color:'#eda329', number:'26', gridSlot:2, lane:1.0, bypassOffset:0, runout:47, drift:false },
    { id:'aster', name:'星芒', color:'#9a64ce', number:'38', gridSlot:3, lane:5.0, bypassOffset:3.4, runout:39, drift:false }
  ];
  // Pace scales engine thrust and cruising speed. Corner is the driver's target lateral acceleration in m/s².
  const fieldPaces = {
    easy:   { breeze:{pace:.80, corner:14.3}, citrus:{pace:.75, corner:13.5}, aster:{pace:.70, corner:12.8} },
    normal: { breeze:{pace:1.08, corner:21.6}, citrus:{pace:1.06, corner:21.2}, aster:{pace:1.04, corner:21.2} },
    hard:   { breeze:{pace:1.14, corner:23.6}, citrus:{pace:1.115, corner:22.8}, aster:{pace:1.095, corner:22.5} }
  };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const steerPeriod = 1 / 20;
  const curvatureMaps = new WeakMap();

  // Positive curvature means a right-hand bend. The samples span the seam at the finish line.
  function curvatureMap(track) {
    let map = curvatureMaps.get(track);
    if (map) return map;
    const count = Math.ceil(track.length / 5);
    const spacing = track.length / count, values = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const s = i * spacing, a = track.sample(s - 5), b = track.sample(s + 5);
      values[i] = wrapAngle(Math.atan2(b.tx, -b.tz) - Math.atan2(a.tx, -a.tz)) / 10;
    }
    map = { at(s) { const i = Math.round(s / spacing) % count; return values[(i + count) % count]; } };
    curvatureMaps.set(track, map);
    return map;
  }

  function startPose(track, slot) {
    const pose = track.sample(0);
    const lateral = track.gridLanes[slot];
    pose.x -= pose.tz * lateral;
    pose.z += pose.tx * lateral;
    return pose;
  }
  const playerStart = track => startPose(track, 1);

  function create(track, laps = 3, difficulty = 'normal') {
    const field = (difficulty === 'easy' || difficulty === 'hard') ? fieldPaces[difficulty] : fieldPaces.normal;
    return drivers.map(profile => {
      const driver = {...profile, ...field[profile.id]};
      const car = drive.create(startPose(track, driver.gridSlot));
      const startLane = track.gridLanes[driver.gridSlot];
      return {
        id:driver.id, name:driver.name, color:driver.color, number:driver.number,
        car, previousPose:{x:car.x, z:car.z, yaw:car.yaw}, progress:0, finishedAt:null,
        projection:track.project(car.x, car.z, 0), finishDistance:laps * track.length,
        driver, line:startLane, roadLine:startLane, thinkIn:0, driftAgainAt:0, input:{}
      };
    });
  }

  function alongDifference(from, to, length) {
    let delta = (to - from) % length;
    if (delta > length / 2) delta -= length;
    if (delta < -length / 2) delta += length;
    return delta;
  }

  function trafficAround(rival, rivals, track, player, playerProgress) {
    const nearby = [];
    function add(progress, lateral, speed) {
      const gap = alongDifference(rival.progress, progress, track.length);
      const look = 17 + Math.max(0, rival.car.speed - speed) * .9;
      if (gap > -6 && gap < look) nearby.push({gap, lateral, speed, look});
    }
    for (const other of rivals) {
      if (other !== rival) add(other.progress, other.projection.lateral, other.car.speed);
    }
    const p = track.sample(playerProgress);
    add(playerProgress, -(player.x - p.x) * p.tz + (player.z - p.z) * p.tx, player.speed);
    return nearby;
  }

  function chooseLine(rival, ideal, traffic, edge) {
    let best = Infinity, chosen = ideal;
    // Look for a clear kart-width corridor. The current line gets a modest preference
    // so cars don't oscillate from side to side while passing each other.
    for (const shift of [0, -4, 4, -8, 8]) {
      const line = clamp(ideal + shift, -edge, edge);
      let cost = .08 * (line - ideal) ** 2 + .05 * (line - rival.roadLine) ** 2;
      for (const other of traffic) {
        const overlap = Math.max(0, 3.9 - Math.abs(line - other.lateral));
        const weight = clamp(1 - Math.abs(other.gap) / other.look, .16, 1);
        cost += 5 * overlap ** 2 * weight;
      }
      if (cost < best) { best = cost; chosen = line; }
    }
    return chosen;
  }

  function navigate(rival, rivals, track, player, playerProgress, elapsed) {
    const { car, driver, projection:p, input } = rival;
    const bends = curvatureMap(track), lead = clamp(6 + car.speed * .45, 9, 36);
    const bend = bends.at(p.s + lead);
    const wave = Math.sin(p.s * .006 + track.gridLanes[driver.gridSlot]);
    const ideal = driver.lane + 1.35 * wave + clamp(bend * 65, -2.2, 2.2);
    const traffic = trafficAround(rival, rivals, track, player, playerProgress);
    const edge = track.halfWidth - 3.5;
    const target = rival.finishedAt === null ? chooseLine(rival, ideal, traffic, edge) : Math.sign(driver.lane) * edge;
    rival.roadLine += clamp(target - rival.roadLine, -6 * steerPeriod, 6 * steerPeriod);
    // Follow the paved diversion through its merge and exit. It is the same for every language lesson.
    const bypass = track.bypassAt(p.s + lead);
    rival.line = rival.roadLine + bypass.blend * (bypass.center + driver.bypassOffset - rival.roadLine);
    const next = track.sample(p.s + lead);
    const aim = Math.atan2(next.x - next.tz * rival.line - car.x, -(next.z + next.tx * rival.line - car.z));
    const steer = wrapAngle(aim - car.yaw) + .15 * car.slip - .11 * car.yawRate;
    input.left = steer < -.018;
    input.right = steer > .018;

    const cfg = drive.config, brake = Math.min(18, cfg.braking * .68);
    let speedLimit = cfg.topSpeed * driver.pace / 3.6;
    const steeringTorque = cfg.frontAxle * cfg.frontStiffness * cfg.steerHigh * Math.PI / 180;
    const yawRate = steeringTorque / (cfg.yawInertia * cfg.yawDamping);
    if (bypass.blend || track.bypassAt(p.s + lead + 40).blend) {
      // Low steering authority in live tuning calls for an earlier, slower merge.
      speedLimit = Math.min(speedLimit, 38 * yawRate, 13 * cfg.steerResponse);
    }
    for (let look = 0; look <= 120; look += 6) {
      const curvature = bends.at(p.s + look);
      if (Math.abs(curvature) < .002) continue;
      const radius = Math.max(10, 1 / Math.abs(curvature) - Math.sign(curvature) * rival.line);
      const cornerSpeed = Math.min(Math.sqrt(driver.corner * radius), .69 * yawRate * radius);
      const safeSpeed = Math.sqrt(cornerSpeed ** 2 + 2 * brake * Math.max(0, look - 5));
      speedLimit = Math.min(speedLimit, safeSpeed);
    }
    for (const other of traffic) {
      if (other.gap > 0 && other.gap < 8 && Math.abs(p.lateral - other.lateral) < 2.8)
        speedLimit = Math.min(speedLimit, Math.max(7, other.speed - 2));
    }
    if (rival.finishedAt !== null) {
      // Clear the stripe before stopping. The finish time stays locked at the crossing.
      const rollout = Math.max(0, driver.runout - (rival.progress - rival.finishDistance));
      speedLimit = Math.min(speedLimit, Math.sqrt(2 * brake * rollout));
    }
    const canDrift = driver.drift && rival.finishedAt === null && car.speed > 17 &&
      Math.abs(bend) > .024 && Math.sign(steer) === Math.sign(bend) &&
      Math.abs(steer) > .028 && Math.abs(p.lateral) < edge - 1;
    if (canDrift && elapsed > rival.driftAgainAt && car.phase === 'grip') {
      rival.driftUntil = elapsed + .25;
      rival.driftAgainAt = elapsed + 3;
    }
    input.drift = elapsed < (rival.driftUntil || 0);
    input.throttle = car.speed < speedLimit - .2 && speedLimit > 0;
    input.brake = car.speed > speedLimit + .65;
    input.nitro = !input.brake && !bend && car.stock > 0 && car.speed > 26 && rival.finishedAt === null;
  }

  function step(rivals, track, player, playerProgress, dt, elapsed) {
    for (const rival of rivals) {
      const car = rival.car, before = rival.projection;
      rival.previousPose.x = car.x; rival.previousPose.z = car.z; rival.previousPose.yaw = car.yaw;
      if (rival.finishedAt !== null && car.speed < .75 && rival.progress >= rival.finishDistance + rival.driver.runout) {
        car.vx = car.vz = car.speed = 0;
        continue;
      }
      rival.thinkIn -= dt;
      if (rival.thinkIn <= 0) {
        navigate(rival, rivals, track, player, playerProgress, elapsed);
        rival.thinkIn += steerPeriod;
      }
      drive.step(car, rival.input, dt, rival.driver.pace);
      let p = track.project(car.x, car.z, before.s);
      let bypass = track.bypassAt(p.s);
      // A badly understeering kart can touch the divider. Resolve against the
      // local edge normal even on the tapered approach, while the route opens.
      const over = bypass.inner + drive.config.collisionRadius - p.lateral;
      if (bypass.blend && over > 0) {
        const slope = bypass.innerSlope, scale = 1 / Math.hypot(1, slope);
        const nx = (p.tx * slope + p.tz) * scale, nz = (p.tz * slope - p.tx) * scale;
        drive.resolveWallContact(car, nx, nz, over * scale);
        p = track.project(car.x, car.z, p.s);
        bypass = track.bypassAt(p.s);
      }
      drive.constrainToRoad(car, p, track.halfWidth, dt, track.halfWidth + bypass.extra);
      const distance = alongDifference(before.s, p.s, track.length);
      rival.progress += distance;
      rival.projection = p;
      if (rival.finishedAt === null && rival.progress >= rival.finishDistance && distance > 0) {
        rival.finishedAt = elapsed - dt * (rival.progress - rival.finishDistance) / distance;
      }
    }
  }

  window.ClassicRivals = {create, step, playerStart};
})();
