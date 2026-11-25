// AI drivers read the same track in metres and send ordinary controls to the kart solver.
(() => {
  'use strict';
  const drive = window.ClassicDrive;
  const drivers = [
    { id:'breeze', name:'海風', color:'#268be3', number:'11', grid:-5, lane:-3.9, runout:56, launch:.23, cruise:54, corner:20, drift:true },
    { id:'citrus', name:'柑橘', color:'#eda329', number:'26', grid:3, lane:4.0, runout:47, launch:.40, cruise:48, corner:17, drift:false },
    { id:'aster', name:'星芒', color:'#9a64ce', number:'38', grid:8, lane:-3.5, runout:39, launch:.64, cruise:42, corner:14, drift:false }
  ];
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

  function create(track, laps = 3) {
    return drivers.map(driver => {
      const pose = track.sample(driver.grid);
      pose.x -= pose.tz * driver.lane;
      pose.z += pose.tx * driver.lane;
      const car = drive.create(pose);
      return {
        id:driver.id, name:driver.name, color:driver.color, number:driver.number,
        car, previousPose:{x:car.x, z:car.z, yaw:car.yaw}, progress:driver.grid, finishedAt:null,
        projection:track.project(car.x, car.z, driver.grid), finishDistance:laps * track.length,
        driver, line:driver.lane, thinkIn:0, driftAgainAt:0, input:{}
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

  function navigate(rival, rivals, track, player, playerProgress, elapsed) {
    const { car, driver, projection:p, input } = rival;
    const bends = curvatureMap(track), lead = clamp(6 + car.speed * .45, 9, 36);
    const bend = bends.at(p.s + lead);
    // Each character has a different line on the straights, independent of any quiz answer.
    const ideal = driver.lane + 1.35 * Math.sin(p.s * .006 + driver.grid) + clamp(bend * 65, -2.2, 2.2);
    const traffic = trafficAround(rival, rivals, track, player, playerProgress);
    const edge = track.halfWidth - 3.5;
    const target = rival.finishedAt === null ? chooseLine(rival, ideal, traffic, edge) : Math.sign(driver.lane) * edge;
    rival.line += clamp(target - rival.line, -6 * steerPeriod, 6 * steerPeriod);
    const next = track.sample(p.s + lead);
    const aim = Math.atan2(next.x - next.tz * rival.line - car.x, -(next.z + next.tx * rival.line - car.z));
    const steer = wrapAngle(aim - car.yaw) + .15 * car.slip - .11 * car.yawRate;
    input.left = steer < -.018;
    input.right = steer > .018;

    const brake = Math.min(18, drive.config.braking * .68);
    let speedLimit = Math.min(driver.cruise, drive.config.topSpeed / 3.6);
    // A leader eases the throttle a little when a learner loses ground.
    // Only the driver's chosen speed changes; distance and acceleration remain physical.
    const gapToPlayer = rival.progress - playerProgress;
    speedLimit *= 1 - .11 * clamp((gapToPlayer - 48) / 180, 0, 1);
    for (let look = 0; look <= 120; look += 6) {
      const curvature = bends.at(p.s + look);
      if (Math.abs(curvature) < .002) continue;
      const radius = Math.max(10, 1 / Math.abs(curvature) - Math.sign(curvature) * rival.line);
      const safeSpeed = Math.sqrt(driver.corner * radius + 2 * brake * Math.max(0, look - 5));
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
    if (elapsed < driver.launch) input.throttle = false;
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
      drive.step(car, rival.input, dt);
      const p = track.project(car.x, car.z, before.s);
      drive.constrainToRoad(car, p, track.halfWidth, dt);
      const distance = alongDifference(before.s, p.s, track.length);
      rival.progress += distance;
      rival.projection = p;
      if (rival.finishedAt === null && rival.progress >= rival.finishDistance && distance > 0) {
        rival.finishedAt = elapsed - dt * (rival.progress - rival.finishDistance) / distance;
      }
    }
  }

  window.ClassicRivals = {create, step};
})();
