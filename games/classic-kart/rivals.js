// AI drivers read the same track in metres and send ordinary controls to the kart solver.
(() => {
  'use strict';
  const drive = window.ClassicDrive;
  const roster = [
    {id:'breeze', name:'海風', color:'#268be3', number:'11'},
    {id:'citrus', name:'柑橘', color:'#eda329', number:'26'},
    {id:'aster', name:'星芒', color:'#9a64ce', number:'38'},
    {id:'bamboo', name:'青竹', color:'#209d6c', number:'42'},
    {id:'peach', name:'蜜桃', color:'#e66696', number:'53'},
    {id:'indigo', name:'夜鷹', color:'#5364b4', number:'64'},
    {id:'skipper', name:'飛魚', color:'#2bbbc1', number:'75'},
    {id:'chestnut', name:'栗子', color:'#b87747', number:'86'}
  ];
  const driverSlots = [
    {gridSlot:0, lane:-7.6, runout:56, drift:true},
    {gridSlot:1, lane:-5.2, runout:48, drift:false},
    {gridSlot:2, lane:-2.8, runout:40, drift:false},
    {gridSlot:4, lane:1.0,  runout:59, drift:false},
    {gridSlot:5, lane:3.3,  runout:51, drift:true},
    {gridSlot:6, lane:5.5,  runout:43, drift:false},
    {gridSlot:7, lane:7.6,  runout:35, drift:false}
  ];
  // Spread the field between the fastest and slowest engines and cornering targets of each difficulty.
  const fieldPaces = {
    normal: {pace:[1.155,1.12], corner:[23.6,23.0]},
    hard:   {pace:[1.175,1.14], corner:[24.3,23.5]}
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
  const playerStart = track => startPose(track, 3);

  function create(track, laps = 3, difficulty = 'normal') {
    const field = difficulty === 'hard' ? fieldPaces.hard : fieldPaces.normal;
    const pool = roster.slice();
    return driverSlots.map((slot, index) => {
      const [identity] = pool.splice(Math.floor(Math.random()*pool.length), 1);
      const fraction = index / (driverSlots.length - 1);
      const driver = {...slot, pace:field.pace[0] + (field.pace[1] - field.pace[0])*fraction,
        corner:field.corner[0] + (field.corner[1] - field.corner[0])*fraction};
      const car = drive.create(startPose(track, driver.gridSlot));
      const startLane = track.gridLanes[driver.gridSlot];
      return {
        ...identity,
        car, previousPose:{x:car.x, z:car.z, yaw:car.yaw}, progress:0, finishedAt:null,
        projection:track.project(car.x, car.z, 0), finishDistance:laps * track.length,
        driver, line:startLane, thinkIn:0, driftAgainAt:0, input:{}
      };
    });
  }

  function launchPack(rivals) {
    const pool = rivals.slice();
    const count = Math.min(pool.length, 3 + Math.floor(Math.random() * 3));
    for (let i = 0; i < count; i++) {
      const [rival] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      drive.launch(rival.car);
    }
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
      const look = 17 + Math.max(0, rival.car.speed - speed) * 1.35;
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
      let cost = .08 * (line - ideal) ** 2 + .05 * (line - rival.line) ** 2;
      for (const other of traffic) {
        const overlap = Math.max(0, 3.9 - Math.abs(line - other.lateral));
        const weight = clamp(1 - Math.abs(other.gap) / other.look, .16, 1);
        cost += 5 * overlap ** 2 * weight;
      }
      if (cost < best) { best = cost; chosen = line; }
    }
    return chosen;
  }

  function navigate(rival, rivals, track, player, playerProgress, elapsed, pace) {
    const { car, driver, projection:p, input } = rival;
    const bends = curvatureMap(track), lead = clamp(6 + car.speed * .45, 9, 36);
    const bend = bends.at(p.s + lead);
    const wave = Math.sin(p.s * .006 + track.gridLanes[driver.gridSlot]);
    const ideal = driver.lane + 1.35 * wave + clamp(bend * 65, -2.2, 2.2);
    const traffic = trafficAround(rival, rivals, track, player, playerProgress);
    const edge = track.halfWidth - 3.5;
    const target = rival.finishedAt === null ? chooseLine(rival, ideal, traffic, edge) : Math.sign(driver.lane) * edge;
    rival.line += clamp(target - rival.line, -6 * steerPeriod, 6 * steerPeriod);
    const next = track.sample(p.s + lead);
    const aim = Math.atan2(next.x - next.tz * rival.line - car.x, -(next.z + next.tx * rival.line - car.z));
    const steer = wrapAngle(aim - car.yaw) + .15 * car.slip - .11 * car.yawRate;
    input.left = steer < -.018;
    input.right = steer > .018;

    const cfg = drive.config, brake = Math.min(22, cfg.braking * .74);
    let speedLimit = drive.speedLimitFor(pace, car.boostKind);
    const steeringTorque = cfg.frontAxle * cfg.frontStiffness * cfg.steerHigh * Math.PI / 180;
    const yawRate = steeringTorque / (cfg.yawInertia * cfg.yawDamping);
    // A tank can carry the kart beyond cruising speed. Look far enough ahead
    // to brake for a hairpin even on a boosted straight.
    const brakeHorizon = Math.max(120, car.speed ** 2 / (2 * brake) + 12);
    for (let look = 0; look <= brakeHorizon; look += 6) {
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
    input.nitro = !input.brake && !car.boosting && Math.abs(bend) < .002 &&
      car.stock > 0 && car.speed > 26 && rival.finishedAt === null;
  }

  function step(rivals, track, player, playerProgress, dt, elapsed) {
    for (const rival of rivals) {
      const car = rival.car, before = rival.projection;
      rival.previousPose.x = car.x; rival.previousPose.z = car.z; rival.previousPose.yaw = car.yaw;
      if (rival.finishedAt !== null && car.speed < .75 && rival.progress >= rival.finishDistance + rival.driver.runout) {
        car.vx = car.vz = car.speed = 0;
        continue;
      }
      // Use total race progress so the gain stays continuous across the finish line.
      // The extra pace rises from zero at 30 m behind to 4% of the base pace at 150 m.
      const pursuit = clamp((playerProgress - rival.progress - 30) / 120, 0, 1);
      const pace = rival.driver.pace + .04 * pursuit;
      rival.thinkIn -= dt;
      if (rival.thinkIn <= 0) {
        navigate(rival, rivals, track, player, playerProgress, elapsed, pace);
        rival.thinkIn += steerPeriod;
      }
      drive.step(car, rival.input, dt, pace);
      let p = track.project(car.x, car.z, before.s);
      p = drive.constrainToTrack(car, track, p, dt);
      const distance = alongDifference(before.s, p.s, track.length);
      rival.progress += distance;
      rival.projection = p;
      if (rival.finishedAt === null && rival.progress >= rival.finishDistance && distance > 0) {
        rival.finishedAt = elapsed - dt * (rival.progress - rival.finishDistance) / distance;
      }
    }
  }

  window.ClassicRivals = {create, step, playerStart, launchPack};
})();
