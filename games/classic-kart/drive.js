// World units are metres, seconds and radians. Yaw zero faces -Z. Positive yaw steers right.
(() => {
  'use strict';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const fade = (rate, dt) => 1 - Math.exp(-rate * dt);
  const arc = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const rad = Math.PI / 180;

  // Each entry supplies the same live value to the solver, the camera, and the tuning panel.
  const sliders = [];
  const config = {};
  function setting(group, key, label, value, min, max, step, unit = '') {
    config[key] = value;
    sliders.push({group, key, label, min, max, step, unit});
  }
  const engine = '推進與制動', tire = '輪胎與轉向', slide = '甩尾與小噴', cam = '追蹤鏡頭';
  setting(engine, 'topSpeed', '一般極速', 210, 120, 270, 5, 'km/h');
  setting(engine, 'boostSpeed', '氮氣極速', 290, 230, 360, 5, 'km/h');
  setting(engine, 'acceleration', '油門推力', 14, 7, 26, .5, 'm/s²');
  setting(engine, 'boostForce', '氮氣額外推力', 13.5, 5, 30, .5, 'm/s²');
  setting(engine, 'braking', '煞車力', 29, 10, 52, 1, 'm/s²');
  setting(engine, 'reverseSpeed', '倒車極速', 29, 10, 45, 1, 'km/h');
  setting(engine, 'launchTime', '起步衝刺秒數', 1.25, .5, 2, .05, 's');
  setting(engine, 'nitroTime', '儲存氮氣秒數', 2.7, 1, 5, .1, 's');
  setting(engine, 'quizTime', '答對獎勵秒數', 2.5, 1, 5, .1, 's');
  setting(engine, 'penaltyTime', '答錯緩速秒數', 1.8, .7, 4, .1, 's');
  setting(tire, 'steerLow', '低速最大舵角', 31, 15, 46, 1, '°');
  setting(tire, 'steerHigh', '高速最大舵角', 10.5, 6, 17, .5, '°');
  setting(tire, 'steerResponse', '方向盤反應', 6.4, 3, 12, .2, '/s');
  setting(tire, 'frontStiffness', '前輪側向剛度', 154, 100, 240, 2);
  setting(tire, 'rearStiffness', '後輪側向剛度', 192, 110, 270, 2);
  setting(tire, 'yawDamping', '車身迴轉阻尼', 6.6, 4, 15, .1, '/s');
  setting(slide, 'entryTime', '入甩反應時間', .035, .02, .12, .005, 's');
  setting(slide, 'driftRearGrip', '甩尾後輪抓地比例', .37, .25, .85, .01);
  setting(slide, 'driftSteer', '甩尾舵角倍率', 1.35, 1, 1.75, .05);
  setting(slide, 'driftCarry', '放開甩尾後續滑時間', .58, .18, .9, .02, 's');
  setting(slide, 'gripReturn', '後輪回抓速率', 2.4, 1.1, 5, .1, '/s');
  setting(slide, 'scrub', '大角度側滑失速', 17, 5, 32, 1, 'm/s²');
  setting(slide, 'chargeRate', '甩尾集氣速率', .9, .2, 1.4, .05, '/s');
  setting(slide, 'miniTime', '小噴持續時間', .56, .25, 1, .01, 's');
  setting(cam, 'distance', '基本跟車距離', 7.1, 5, 12, .1, 'm');
  setting(cam, 'height', '基本跟車高度', 3.65, 2.4, 6.5, .05, 'm');
  setting(cam, 'lookAhead', '鏡頭前望距離', 5.3, 2, 10, .1, 'm');
  setting(cam, 'speedPullback', '高速拉遠距離', 1.3, .3, 3.5, .1, 'm');
  setting(cam, 'boostPullback', '氮氣拉遠距離', .85, .1, 2, .05, 'm');
  setting(cam, 'baseFov', '一般視角', 54, 42, 70, 1, '°');
  setting(cam, 'boostFov', '氮氣增加視角', 10, 3, 18, 1, '°');
  setting(cam, 'orbitResponse', '鏡頭轉向反應', 5.6, 2, 11, .2, '/s');
  setting(cam, 'positionResponse', '鏡頭位置反應', 11, 4, 20, .5, '/s');
  setting(cam, 'aimResponse', '鏡頭視線反應', 12, 5, 22, .5, '/s');

  // Secondary chassis constants stay together with the live calibration.
  Object.assign(config, {
    fixedStep: 1 / 120, collisionRadius: 1.14, wallRestitution: .1,
    wallSpeedRetention: .87, wallImpactSpeed: 5, wallDebounce: .35, frontAxle: 1.08, rearAxle: 1.15, yawInertia: 2.5, tireDragFraction: .36,
    frontLimit: 55, rearLimit: 65, slipFloorSpeed: 7, angularDrag: 1.15,
    rollingDrag: .60, aeroDrag: .00092, overspeedDrag: .85, throttleTaper: 8,
    reverseAcceleration: 8, lowSpeedCrossover: 1.0, slowSpeed: 86, penaltyBrake: 24,
    launchLead: 1, launchGrace: .5,
    penaltyOnset: .15, entryYawImpulse: 2.72, driftMinSpeed: 11.5, gripRelease: 32,
    skidMinSpeed: 7, bodySkidAngle: .115, rearSkidAngle: 3.5 * rad, skidGrip: .93,
    counterGrip: .75, qualifyingSlip: 8 * rad, qualifyingTime: .22,
    settledSlip: 4 * rad, miniWindow: .86, miniForce: 10.5,
    miniSpeedGain: 23, slots: 2, speedSteerFalloff: 21, cameraBodyMix: .25,
    aimHeight: 1.08, farDistance: 2.7, farHeight: 1.25, farLookAhead: 1.8,
    cameraBoostIn: 3.6, cameraBoostOut: 2.05, gridHalfSpan: 12, gridViewSeconds: 1.4
  });

  function create(pose) {
    return reset({stock: 0, charge: 0}, pose);
  }
  function reset(car, pose) {
    return Object.assign(car, {
      x: pose.x, z: pose.z, vx: 0, vz: 0, yaw: Math.atan2(pose.tx, -pose.tz),
      yawRate: 0, speed: 0, slip: 0, rearSlip: 0, skidding: false, steer: 0, wheelAngle: 0,
      phase: 'grip', grip: 1, entryLoad: 0, driftSide: 0, driftSeconds: 0, effectiveSeconds: 0,
      driftLatched: false, releasedFor: 0, driftFinished: false, prevThrottle: false, prevNitro: false, miniReady: 0,
      throttleLifted: false, launchTimer: 0, tankTimer: 0, quizTimer: 0, miniTimer: 0,
      penalty: 0, boostKind: '', boosting: false, cameraState: null, wallCooldown: 0
    });
  }
  function resolveWallContact(car, nx, nz, penetration) {
    car.x -= nx * penetration;
    car.z -= nz * penetration;
    const outward = car.vx * nx + car.vz * nz;
    if (outward > 0) {
      car.vx -= nx * outward * (1 + config.wallRestitution);
      car.vz -= nz * outward * (1 + config.wallRestitution);
      if (outward > config.wallImpactSpeed && car.wallCooldown <= 0) {
        car.vx *= config.wallSpeedRetention;
        car.vz *= config.wallSpeedRetention;
        car.wallCooldown = config.wallDebounce;
      }
    }
    car.speed = Math.hypot(car.vx, car.vz);
  }

  function constrainToRoad(car, projection, halfWidth, dt, rightHalfWidth = halfWidth) {
    const side = Math.sign(projection.lateral);
    const rim = (side > 0 ? rightHalfWidth : halfWidth) - config.collisionRadius;
    if (Math.abs(projection.lateral) > rim) {
      resolveWallContact(car, -projection.tz * side, projection.tx * side, Math.abs(projection.lateral) - rim);
      projection.lateral = side * rim;
    }
    car.wallCooldown = Math.max(0, car.wallCooldown - dt);
  }
  // The kart is a disc. Test each solid kerb in world space, including its end
  // faces, so a nose impact or a reversing kart is pushed back on its own side.
  function collideIsland(car, island, radius) {
    if (car.x < island.minX-radius || car.x > island.maxX+radius ||
        car.z < island.minZ-radius || car.z > island.maxZ+radius) return false;
    let inside = true, nearest = Infinity, ex = 0, ez = 0, edgeX = 0, edgeZ = 0;
    const points = island.vertices;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i+1) % points.length];
      const dx = b.x-a.x, dz = b.z-a.z, px = car.x-a.x, pz = car.z-a.z;
      if (dx*pz - dz*px < 0) inside = false;
      const t = clamp((px*dx + pz*dz) / (dx*dx + dz*dz), 0, 1);
      const x = px - t*dx, z = pz - t*dz, d2 = x*x + z*z;
      if (d2 < nearest) {
        nearest = d2; ex = x; ez = z; edgeX = dx; edgeZ = dz;
      }
    }
    if (!inside && nearest >= radius*radius) return false;
    const distance = Math.sqrt(nearest);
    if (distance > 1e-8) {
      const sign = inside ? 1 : -1;
      resolveWallContact(car, sign*ex/distance, sign*ez/distance, radius + sign*distance);
    } else {
      const length = Math.hypot(edgeX, edgeZ);
      resolveWallContact(car, -edgeZ/length, edgeX/length, radius);
    }
    return true;
  }

  function constrainToTrack(car, track, projection, dt) {
    const radius = config.collisionRadius, side = projection.lateral < 0 ? -1 : 1;
    const bypass = track.bypassAt(projection.s);
    const width = track.halfWidth + (side > 0 ? bypass.extra : 0);
    const slope = side > 0 ? bypass.outerSlope : 0;
    const scale = 1 / Math.hypot(1, slope);
    const penetration = (side*projection.lateral - width)*scale + radius;
    let corrected = false;
    if (penetration > 0) {
      // A glancing hit on the merging shoulder follows the taper.
      const nx = (-side*projection.tz - slope*projection.tx)*scale;
      const nz = (side*projection.tx - slope*projection.tz)*scale;
      resolveWallContact(car, nx, nz, penetration);
      corrected = true;
    }
    for (const island of track.islands) {
      if (collideIsland(car, island, radius)) corrected = true;
    }
    car.wallCooldown = Math.max(0, car.wallCooldown - dt);
    return corrected ? track.project(car.x, car.z, projection.s) : projection;
  }

  function recoveryPose(track, projection) {
    const pose = track.sample(projection.s);
    if (projection.lateral > track.halfWidth) {
      const island = track.islandAt(projection.s), outer = track.halfWidth + track.bypassAt(projection.s).extra;
      const inner = island ? island.right : track.halfWidth;
      const lateral = Math.min((inner+outer)/2, outer-config.collisionRadius);
      pose.x -= pose.tz*lateral;
      pose.z += pose.tx*lateral;
    }
    return pose;
  }
  function boost(car) {
    car.quizTimer = config.quizTime;
    car.penalty = 0;
    car.boostKind = 'quiz';
    car.boosting = true;
  }
  function launch(car) {
    car.launchTimer = config.launchTime;
    car.boostKind = 'launch';
    car.boosting = true;
  }
  function penalize(car) {
    car.penalty = config.penaltyTime;
    car.launchTimer = 0;
    car.quizTimer = 0;
    car.miniTimer = car.miniReady = 0;
    car.boostKind = '';
    car.boosting = false;
  }
  function openMiniWindow(car, throttle) {
    if (car.effectiveSeconds >= config.qualifyingTime) {
      car.miniReady = config.miniWindow;
      car.throttleLifted = !throttle;
    }
    car.effectiveSeconds = 0;
  }
  function updateDrift(car, input, steerInput, forward, dt) {
    const requested = input.drift && forward > config.driftMinSpeed;
    if (!input.drift) car.driftLatched = false;
    if (requested && !car.driftLatched && steerInput &&
        (car.phase === 'grip' || car.phase === 'recover')) {
      car.phase = 'entry';
      car.driftSide = steerInput;
      // A rear axle that is still sliding has less grip left to break on a second tap.
      car.entryLoad = clamp((car.grip - config.driftRearGrip) / (1 - config.driftRearGrip), 0, 1);
      car.driftLatched = true;
      car.driftSeconds = car.effectiveSeconds = car.releasedFor = 0;
      car.driftFinished = false;
      car.miniReady = 0;
    }
    const active = car.phase === 'entry' || car.phase === 'slide' || car.phase === 'counter';
    let carrying = false;
    if (active) {
      car.driftSeconds += dt;
      car.releasedFor = requested ? 0 : car.releasedFor + dt;
      // A tap of Shift can initiate a whole corner. Keeping the same steering loads
      // the sliding tires briefly; countersteering unloads them and ends the drift.
      carrying = !requested && !car.driftFinished && forward > config.driftMinSpeed &&
        steerInput === car.driftSide && car.releasedFor < config.driftCarry;
      if (!requested && !carrying) {
        if (!car.driftFinished) openMiniWindow(car, input.throttle);
        car.driftFinished = true;
        const correcting = steerInput === -car.driftSide &&
          car.releasedFor < config.driftCarry && Math.abs(car.slip) > config.settledSlip;
        car.phase = correcting ? 'counter' : 'recover';
      } else if (steerInput === -car.driftSide) {
        car.phase = 'counter';
      } else if (car.driftSeconds > config.entryTime) {
        car.phase = 'slide';
      }
    }
    if (car.phase === 'recover' && car.grip > .94 && Math.abs(car.slip) < config.settledSlip) {
      car.phase = 'grip';
      car.driftSide = 0;
    }
    const reduced = car.phase === 'entry' || car.phase === 'slide';
    const gripTarget = reduced ? config.driftRearGrip :
      car.phase === 'counter' ? Math.max(config.counterGrip, config.driftRearGrip) : 1;
    const response = gripTarget < car.grip ? config.gripRelease : config.gripReturn;
    car.grip += (gripTarget - car.grip) * fade(response, dt);

    const slip = Math.abs(car.slip);
    // Only a moving, loaded rear axle in a genuine slide counts. A stationary spin cannot farm nitro.
    if (active && (requested || carrying) && slip > config.qualifyingSlip && car.slip * car.driftSide > 0) {
      car.effectiveSeconds += dt;
      if (car.stock < config.slots) {
        const load = clamp(slip / (.55 + slip * .45), .25, 1);
        car.charge += dt * config.chargeRate * load * clamp(forward / 36, .25, 1.25);
        if (car.charge >= 1) {
          car.stock++;
          car.charge = car.stock >= config.slots ? 0 : car.charge - 1;
        }
      }
    }
    car.miniReady = Math.max(0, car.miniReady - dt);
    if (car.miniReady > 0 && !input.throttle) car.throttleLifted = true;
    if (car.miniReady > 0 && car.throttleLifted && input.throttle && !car.prevThrottle && car.penalty <= 0) {
      car.miniTimer = config.miniTime;
      car.miniReady = 0;
    }
  }

  function step(car, input, dt, pace = 1) {
    const cfg = config;
    if (input.nitro && !car.prevNitro && car.stock > 0 && car.tankTimer <= 0 && car.penalty <= 0) {
      car.stock--;
      car.tankTimer = cfg.nitroTime;
    }
    const fx = Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const rx = -fz, rz = fx;
    const forward = car.vx * fx + car.vz * fz;
    const lateral = car.vx * rx + car.vz * rz;
    const speed = Math.hypot(forward, lateral);
    const steerInput = Number(!!input.right) - Number(!!input.left);
    updateDrift(car, input, steerInput, forward, dt);
    car.steer += (steerInput - car.steer) * fade(cfg.steerResponse, dt);
    const highSpeedFraction = 1 / (1 + (speed / cfg.speedSteerFalloff) ** 2);
    const steerMax = cfg.steerHigh + (cfg.steerLow - cfg.steerHigh) * highSpeedFraction;
    const driftAmount = clamp((1 - car.grip) / (1 - cfg.driftRearGrip), 0, 1);
    car.wheelAngle = rad * steerMax * (1 + (cfg.driftSteer - 1) * driftAmount) * car.steer;

    // Each axle sees a different side velocity from the yaw rate. Project the front contact
    // into its steered wheel frame first, then return its cornering force to chassis space.
    const frontSide = lateral + cfg.frontAxle * car.yawRate;
    const rearSide = lateral - cfg.rearAxle * car.yawRate;
    const c = Math.cos(car.wheelAngle), s = Math.sin(car.wheelAngle);
    const frontSlip = Math.atan2(frontSide * c - forward * s,
      Math.max(cfg.slipFloorSpeed, Math.abs(forward * c + frontSide * s)));
    car.rearSlip = Math.atan2(rearSide, Math.max(cfg.slipFloorSpeed, Math.abs(forward)));
    const frontForce = -cfg.frontLimit * Math.tanh(frontSlip * cfg.frontStiffness / cfg.frontLimit);
    const rearForce = -cfg.rearLimit * car.grip * Math.tanh(car.rearSlip * cfg.rearStiffness / cfg.rearLimit);
    const frontLateral = frontForce * c;
    const cornerForce = frontLateral + rearForce;
    // Integrate the decaying handbrake moment over this tick. A shorter time
    // delivers the same angular impulse earlier while yaw and the travel path stay continuous.
    const handbrakeImpulse = (car.phase === 'entry' || car.phase === 'slide') ?
      cfg.entryYawImpulse * car.entryLoad * car.driftSide *
        Math.exp(-(car.driftSeconds - dt) / cfg.entryTime) * fade(1 / cfg.entryTime, dt) : 0;
    const torque = (cfg.frontAxle * frontLateral - cfg.rearAxle * rearForce) / cfg.yawInertia;
    car.yawRate += (torque - (cfg.yawDamping + cfg.angularDrag * Math.abs(car.yawRate)) * car.yawRate) * dt;
    car.yawRate += handbrakeImpulse;

    const penalized = car.penalty > 0;
    const largeBoost = !penalized && (car.quizTimer > 0 || car.tankTimer > 0 || car.launchTimer > 0);
    const mini = !penalized && car.miniTimer > 0;
    car.boostKind = penalized ? '' : car.quizTimer > 0 ? 'quiz' : car.tankTimer > 0 ? 'tank' :
      car.launchTimer > 0 ? 'launch' : mini ? 'mini' : '';
    car.boosting = !!car.boostKind;
    const cruisingSpeed = cfg.topSpeed * pace;
    let speedLimit = (largeBoost ? Math.max(cfg.boostSpeed, cruisingSpeed + 5) :
      cruisingSpeed + (mini ? cfg.miniSpeedGain : 0)) / 3.6;
    const brakingPenalty = penalized && car.penalty < cfg.penaltyTime - cfg.penaltyOnset;
    if (brakingPenalty) speedLimit = cfg.slowSpeed / 3.6;
    let thrust = 0;
    const drag = cfg.rollingDrag * Math.min(speed * 2, 1) + cfg.aeroDrag * speed * speed;
    if ((input.throttle || car.boosting) && !input.brake) {
      const motor = cfg.acceleration * pace + (largeBoost ? cfg.boostForce : mini ? cfg.miniForce : 0);
      const throttle = clamp((speedLimit - forward) / cfg.throttleTaper, 0, 1);
      thrust = motor * throttle + drag * clamp(forward / speedLimit, 0, 1);
      if (forward < -cfg.lowSpeedCrossover) thrust = cfg.braking;
    } else if (input.brake) {
      thrust = forward > cfg.lowSpeedCrossover ? -cfg.braking :
        -cfg.reverseAcceleration * clamp(1 + forward / (cfg.reverseSpeed / 3.6), 0, 1);
    }
    const overspeed = Math.max(0, speed - speedLimit) * cfg.overspeedDrag;
    // Tire scrub removes kinetic energy as the car ploughs across its own path.
    const bodySlip = Math.atan2(Math.abs(lateral), Math.max(1, Math.abs(forward)));
    const scrub = cfg.scrub * Math.sin(bodySlip) ** 2 * Math.min(1, speed / 12);
    let resistance = drag + overspeed + scrub;
    if (brakingPenalty && speed > speedLimit) resistance += cfg.penaltyBrake;
    const decel = speed > .0001 ? Math.min(resistance / speed, 1 / dt) : 0;
    // A pneumatic tire redirects momentum largely sideways. Blend the dissipative
    // part of its impulse with rolling contact; the separate scrub term above
    // accounts for the sustained energy cost of an excessively wide slide.
    const tireLong = -frontForce * s;
    const tireWork = speed > .1 ? (tireLong * forward + cornerForce * lateral) / speed : 0;
    const returned = speed > .1 ? -Math.min(0, tireWork) * (1 - cfg.tireDragFraction) / speed : 0;
    const longitudinal = thrust + tireLong;
    car.vx += (longitudinal * fx + cornerForce * rx + (returned - decel) * car.vx) * dt;
    car.vz += (longitudinal * fz + cornerForce * rz + (returned - decel) * car.vz) * dt;
    car.yaw = arc(car.yaw + car.yawRate * dt);
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.speed = Math.hypot(car.vx, car.vz);
    // Positive sideslip means the nose is to the right of the forward travel direction.
    car.slip = forward > 1 ? arc(car.yaw - Math.atan2(car.vx, -car.vz)) : 0;
    car.skidding = car.speed > cfg.skidMinSpeed && (Math.abs(car.slip) > cfg.bodySkidAngle ||
      (car.grip < cfg.skidGrip && Math.abs(car.rearSlip) > cfg.rearSkidAngle));
    car.launchTimer = Math.max(0, car.launchTimer - dt);
    car.quizTimer = Math.max(0, car.quizTimer - dt);
    // A wrong gate suppresses propulsion but preserves the remainder of a paid-for tank.
    if (!penalized) car.tankTimer = Math.max(0, car.tankTimer - dt);
    car.miniTimer = Math.max(0, car.miniTimer - dt);
    car.penalty = Math.max(0, car.penalty - dt);
    car.prevNitro = !!input.nitro;
    car.prevThrottle = !!input.throttle;
  }

  function camera(view, car, dt, mode = 0, snap = false, gridView = 0) {
    const cfg = config;
    let state = car.cameraState;
    const initial = snap || !state;
    if (initial) {
      state = car.cameraState = {
        heading: car.yaw, previousX: car.x, previousZ: car.z, boost: 0,
        orientation: new THREE.Quaternion(), target: new THREE.Vector3(), look: new THREE.Matrix4()
      };
    }
    const mix = rate => initial ? 1 : fade(rate, dt);
    // Reverse stays a rear chase view. Above walking speed the travel path leads the orbit,
    // so the tail and both skid marks remain visible while the player countersteers.
    const travelWeight = clamp((car.speed - 2) / 8, 0, 1) * (1 - cfg.cameraBodyMix);
    const heading = car.yaw - car.slip * travelWeight;
    state.heading = arc(state.heading + arc(heading - state.heading) * mix(cfg.orbitResponse));
    const wantBoost = car.boosting ? (car.boostKind === 'mini' ? .5 : 1) : 0;
    state.boost += (wantBoost - state.boost) * mix(wantBoost > state.boost ? cfg.cameraBoostIn : cfg.cameraBoostOut);
    const ratio = clamp(car.speed / (cfg.topSpeed / 3.6), 0, 1.28);
    const far = mode === 1;
    const chaseDistance = cfg.distance + (far ? cfg.farDistance : 0) + ratio * cfg.speedPullback + state.boost * cfg.boostPullback;
    const gridDistance = cfg.gridHalfSpan / (view.aspect * Math.tan(cfg.baseFov * rad / 2));
    const pullback = gridView * Math.max(0, gridDistance - chaseDistance);
    const distance = chaseDistance + pullback;
    const height = cfg.height + (far ? cfg.farHeight : 0) + .45 * ratio + .26 * pullback;
    const dx = Math.sin(state.heading), dz = -Math.cos(state.heading);
    // Translate the rig with the kart, then damp the offset. This keeps it in frame
    // even on a slow display where smoothing absolute coordinates would add metres of lag.
    view.position.x += car.x - state.previousX;
    view.position.z += car.z - state.previousZ;
    state.previousX = car.x;
    state.previousZ = car.z;
    state.target.set(car.x - dx * distance, height, car.z - dz * distance);
    view.position.lerp(state.target, mix(cfg.positionResponse));
    const ahead = cfg.lookAhead + (far ? cfg.farLookAhead : 0);
    state.target.set(car.x + dx * ahead, cfg.aimHeight, car.z + dz * ahead);
    state.look.lookAt(view.position, state.target, view.up);
    state.orientation.setFromRotationMatrix(state.look);
    view.quaternion.slerp(state.orientation, mix(cfg.aimResponse));
    const fov = cfg.baseFov + cfg.boostFov * state.boost;
    if (Math.abs(view.fov - fov) > .005) {
      view.fov = fov;
      view.updateProjectionMatrix();
    }
  }
  window.ClassicDrive = {config, sliders, step, create, reset, recoveryPose, constrainToRoad, constrainToTrack, resolveWallContact, camera, boost, launch, penalize};
})();
