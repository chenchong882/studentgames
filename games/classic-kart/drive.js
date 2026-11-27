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
  setting(tire, 'steerLow', '低速最大舵角', 35, 15, 46, 1, '°');
  setting(tire, 'steerHigh', '高速最大舵角', 12.5, 6, 17, .5, '°');
  setting(tire, 'steerResponse', '方向盤反應', 7.2, 3, 12, .2, '/s');
  setting(tire, 'frontStiffness', '前輪側向剛度', 154, 100, 240, 2);
  setting(tire, 'rearStiffness', '後輪側向剛度', 192, 110, 270, 2);
  setting(tire, 'yawDamping', '車身迴轉阻尼', 6.6, 4, 15, .1, '/s');
  setting(slide, 'entryTime', '入甩反應時間', .035, .02, .12, .005, 's');
  setting(slide, 'driftRearGrip', '甩尾後輪抓地比例', .37, .25, .85, .01);
  setting(slide, 'driftSteer', '甩尾舵角倍率', 1.8, 1, 2, .05);
  setting(slide, 'driftCarry', '放開甩尾後續滑時間', .58, .18, .9, .02, 's');
  setting(slide, 'gripReturn', '後輪回抓速率', 3.9, 1.1, 5, .1, '/s');
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
    wallSpeedRetention: .87, wallImpactSpeed: 5, wallDebounce: .35, wallReleaseGap: .55,
    frontAxle: 1.08, rearAxle: 1.15, yawInertia: 2.5, tireDragFraction: .36,
    frontLimit: 55, rearLimit: 65, driftFrontGripGain: .12, slipFloorSpeed: 7, angularDrag: 1.15,
    rollingDrag: .60, aeroDrag: .00092, overspeedDrag: .85, throttleTaper: 8,
    reverseAcceleration: 8, lowSpeedCrossover: 1.0, slowSpeed: 86, penaltyBrake: 24,
    launchLead: 1, launchGrace: .5,
    penaltyOnset: .15, entryYawImpulse: 3.35, driftMinSpeed: 11.5, gripRelease: 32,
    skidMinSpeed: 7, bodySkidAngle: .115, rearSkidAngle: 3.5 * rad, skidGrip: .93,
    counterSteerResponse: 1.85, alignmentRate: 4.5, alignmentResponse: 7,
    shallowSlide: 6 * rad, deepSlide: 27 * rad, deepSlideSpeedLoss: .33, slideScrubRate: 4.4,
    qualifyingSlip: 8 * rad, qualifyingTime: .22,
    settledSlip: 4 * rad, miniWindow: .86, miniForce: 10.5,
    miniAutoDelay: .8,
    miniSpeedGain: 23, slots: 2, speedSteerFalloff: 21, cameraBodyMix: .25,
    aimHeight: 1.08, farDistance: 2.7, farHeight: 1.25, farLookAhead: 1.8,
    cameraBoostIn: 3.6, cameraBoostOut: 2.05, gridHalfSpan: 15, gridViewSeconds: 1.4
  });

  function create(pose) {
    // These values belong to the race, so putting the kart back on the road preserves them.
    return reset({
      stock: 0, charge: 0, prevThrottle: false, prevNitro: false,
      launchTimer: 0, tankTimer: 0, quizTimer: 0, miniTimer: 0, penalty: 0,
      boostKind: '', boosting: false
    }, pose);
  }
  function reset(car, pose) {
    return Object.assign(car, {
      x: pose.x, z: pose.z, vx: 0, vz: 0, yaw: Math.atan2(pose.tx, -pose.tz),
      yawRate: 0, speed: 0, slip: 0, rearSlip: 0, skidding: false, steer: 0, wheelAngle: 0,
      phase: 'grip', grip: 1, entryLoad: 0, driftSide: 0, driftSeconds: 0, effectiveSeconds: 0,
      driftLatched: false, driftEntrySpeed: 0, releasedFor: 0, miniReady: 0,
      rewardChargeBefore: null, rewardStockBefore: 0,
      throttleLifted: false, cameraState: null, wallCooldown: 0, wallContact: false
    });
  }
  function resolveWallContact(car, nx, nz, penetration) {
    // The solver advances before checking the rail. Discard only this tick's
    // provisional drift credit, including a tank it might just have filled.
    if (Number.isFinite(car.rewardChargeBefore)) {
      car.charge = car.rewardChargeBefore;
      car.stock = car.rewardStockBefore;
      car.rewardChargeBefore = null;
    }
    if (!car.wallContact) car.yawRate = 0;
    car.wallContact = true;
    car.phase = 'grip';
    car.grip = 1;
    car.driftSide = car.driftSeconds = car.effectiveSeconds = car.entryLoad = 0;
    car.miniReady = car.miniTimer = 0;
    car.skidding = false;
    if (car.boostKind === 'mini') {
      car.boostKind = '';
      car.boosting = false;
    }
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
    const forward = car.vx * Math.sin(car.yaw) - car.vz * Math.cos(car.yaw);
    car.slip = forward > 1 ? arc(car.yaw - Math.atan2(car.vx, -car.vz)) : 0;
    car.rearSlip = 0;
  }

  function constrainToRoad(car, projection, halfWidth, dt, rightHalfWidth = halfWidth) {
    const side = Math.sign(projection.lateral);
    const rim = (side > 0 ? rightHalfWidth : halfWidth) - config.collisionRadius;
    const hit = Math.abs(projection.lateral) >= rim;
    if (hit) {
      resolveWallContact(car, -projection.tz * side, projection.tx * side, Math.abs(projection.lateral) - rim);
      projection.lateral = side * rim;
    } else if (rim - Math.abs(projection.lateral) >= config.wallReleaseGap) car.wallContact = false;
    car.rewardChargeBefore = null;
    car.wallCooldown = Math.max(0, car.wallCooldown - dt);
    return hit;
  }

  function constrainToTrack(car, track, projection, dt) {
    const corrected = constrainToRoad(car, projection, track.halfWidth, dt);
    return corrected ? track.project(car.x, car.z, projection.s) : projection;
  }

  function recoveryPose(track, projection) {
    return track.sample(projection.s);
  }
  function useNitro(car) {
    if (car.stock <= 0 || car.penalty > 0) return false;
    car.stock--;
    car.tankTimer += config.nitroTime;
    return true;
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
    car.effectiveSeconds = 0;
    car.boostKind = '';
    car.boosting = false;
  }
  function openMiniWindow(car, throttle) {
    if (car.miniReady <= 0 && car.penalty <= 0 && !car.wallContact && car.effectiveSeconds >= config.qualifyingTime) {
      car.miniReady = config.miniWindow;
      car.throttleLifted = !throttle;
    }
    car.effectiveSeconds = 0;
  }
  function useMini(car) {
    if (car.wallContact || car.miniReady <= 0 || car.penalty > 0) return false;
    car.miniReady = 0;
    car.miniTimer = config.miniTime;
    return true;
  }
  function updateDrift(car, input, steerInput, forward, dt) {
    car.rewardChargeBefore = null;
    if (car.wallContact) {
      // A held drift button cannot re-arm between small bounces along the rail.
      car.driftLatched = !!input.drift;
      return;
    }
    const fastEnough = forward > config.driftMinSpeed;
    const requested = input.drift && fastEnough;
    if (!input.drift) car.driftLatched = false;
    if (requested && !car.driftLatched && steerInput &&
        (car.phase === 'grip' || car.phase === 'recover')) {
      car.phase = 'entry';
      car.driftSide = steerInput;
      car.driftEntrySpeed = car.speed;
      // A rear axle that is still sliding has less grip left to break on a second tap.
      car.entryLoad = clamp((car.grip - config.driftRearGrip) / (1 - config.driftRearGrip), 0, 1);
      car.driftLatched = true;
      car.driftSeconds = car.effectiveSeconds = car.releasedFor = 0;
    }
    if (car.phase === 'entry' || car.phase === 'slide') {
      car.driftSeconds += dt;
      car.releasedFor = requested ? 0 : car.releasedFor + dt;
      // Holding the original direction briefly carries a tapped drift. Neutral
      // begins recovery; an opposite press catches the existing slide once.
      const loaded = steerInput === car.driftSide && fastEnough &&
        (requested || car.releasedFor < config.driftCarry);
      if (!loaded) {
        openMiniWindow(car, input.throttle);
        car.phase = steerInput === -car.driftSide ? 'counter' : 'recover';
      } else if (car.driftSeconds >= config.entryTime) {
        car.phase = 'slide';
      }
    }
    const settled = car.slip * car.driftSide <= config.settledSlip || !fastEnough;
    if (car.phase === 'recover' && !settled && steerInput === -car.driftSide) car.phase = 'counter';
    if (car.phase === 'counter' && (settled || steerInput !== -car.driftSide)) car.phase = 'recover';
    if (car.phase === 'recover' && car.grip > .94 && (settled || steerInput === car.driftSide)) {
      car.phase = 'grip';
      car.driftSide = 0;
    }
    const reduced = car.phase === 'entry' || car.phase === 'slide';
    const gripTarget = reduced ? config.driftRearGrip : 1;
    const response = reduced ? config.gripRelease : config.gripReturn;
    car.grip += (gripTarget - car.grip) * fade(response, dt);

    const slip = Math.abs(car.slip);
    // Only a moving, loaded rear axle in a genuine slide counts. A stationary spin cannot farm nitro.
    if (reduced && car.penalty <= 0 && car.slip * car.driftSide > config.qualifyingSlip) {
      car.effectiveSeconds += dt;
      if (car.stock < config.slots) {
        car.rewardChargeBefore = car.charge;
        car.rewardStockBefore = car.stock;
        const load = clamp(slip / (.55 + slip * .45), .25, 1);
        car.charge += dt * config.chargeRate * load * clamp(forward / 36, .25, 1.25);
        if (car.charge >= 1) {
          car.stock++;
          // Filling the last slot discards overflow. Charging resumes only after spending a tank.
          car.charge = car.stock >= config.slots ? 0 : car.charge - 1;
        }
      }
    }
    if (car.miniReady > 0) {
      // On touch the pedal release restores cruise. Only a tap can spend the mini early.
      // If the player is still braking at the deadline, fire when the pedal is released.
      const assistAt = input.autoMini ? config.miniWindow - config.miniAutoDelay : 0;
      car.miniReady = Math.max(assistAt, car.miniReady - dt);
      if (!input.throttle) car.throttleLifted = true;
      const reapplied = !input.autoThrottle && car.throttleLifted && input.throttle && !car.prevThrottle;
      const due = input.autoMini && car.miniReady <= assistAt;
      if ((reapplied || due) && !input.brake) useMini(car);
    }
  }

  // Both the driver and the chassis use this forward speed limit in metres per second.
  function speedLimitFor(pace, boostKind) {
    const cruise = config.topSpeed * pace;
    if (!boostKind) return cruise / 3.6;
    if (boostKind === 'mini') return (cruise + config.miniSpeedGain) / 3.6;
    return Math.max(config.boostSpeed, cruise + 5) / 3.6;
  }

  function step(car, input, dt, pace = 1) {
    const cfg = config;
    if (input.nitro && !car.prevNitro) useNitro(car);
    const fx = Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const rx = -fz, rz = fx;
    const forward = car.vx * fx + car.vz * fz;
    const lateral = car.vx * rx + car.vz * rz;
    const speed = Math.hypot(forward, lateral);
    const steerInput = Number(!!input.right) - Number(!!input.left);
    updateDrift(car, input, steerInput, forward, dt);
    // When catching a slide the front wheels must track the opposite input promptly.
    const catching = car.phase === 'counter';
    const steerResponse = catching || !steerInput ? cfg.steerResponse * cfg.counterSteerResponse : cfg.steerResponse;
    car.steer += (steerInput - car.steer) * fade(steerResponse, dt);
    const highSpeedFraction = 1 / (1 + (speed / cfg.speedSteerFalloff) ** 2);
    const steerMax = cfg.steerHigh + (cfg.steerLow - cfg.steerHigh) * highSpeedFraction;
    const driftAmount = clamp((1 - car.grip) / (1 - cfg.driftRearGrip), 0, 1);
    car.wheelAngle = rad * steerMax * (1 + (cfg.driftSteer - 1) * driftAmount) * car.steer;
    if (catching && car.wheelAngle * car.driftSide < 0) {
      // Point into the path the tires are already travelling before steering into the next bend.
      car.wheelAngle = -car.driftSide * Math.min(Math.abs(car.wheelAngle), Math.abs(car.slip) + cfg.settledSlip);
    }

    // Each axle sees a different side velocity from the yaw rate. Project the front contact
    // into its steered wheel frame first, then return its cornering force to chassis space.
    const frontSide = lateral + cfg.frontAxle * car.yawRate;
    const rearSide = lateral - cfg.rearAxle * car.yawRate;
    const c = Math.cos(car.wheelAngle), s = Math.sin(car.wheelAngle);
    const frontSlip = Math.atan2(frontSide * c - forward * s,
      Math.max(cfg.slipFloorSpeed, Math.abs(forward * c + frontSide * s)));
    car.rearSlip = Math.atan2(rearSide, Math.max(cfg.slipFloorSpeed, Math.abs(forward)));
    const sliding = car.phase === 'entry' || car.phase === 'slide';
    // A loaded front tire needs extra lateral grip to tighten the actual path at full drift lock.
    const frontGrip = sliding ? 1 + cfg.driftFrontGripGain * driftAmount * Math.max(0, car.steer * car.driftSide) : 1;
    const frontForce = -frontGrip * cfg.frontLimit * Math.tanh(frontSlip * cfg.frontStiffness / cfg.frontLimit);
    const rearForce = -cfg.rearLimit * car.grip * Math.tanh(car.rearSlip * cfg.rearStiffness / cfg.rearLimit);
    const frontLateral = frontForce * c;
    const cornerForce = frontLateral + rearForce;
    const tireLong = -frontForce * s;
    // Integrate the decaying handbrake moment over this tick. A shorter time
    // delivers the same angular impulse earlier while yaw and the travel path stay continuous.
    const handbrakeImpulse = sliding ?
      cfg.entryYawImpulse * car.entryLoad * car.driftSide *
        Math.exp(-(car.driftSeconds - dt) / cfg.entryTime) * fade(1 / cfg.entryTime, dt) : 0;
    const torque = (cfg.frontAxle * frontLateral - cfg.rearAxle * rearForce) / cfg.yawInertia;
    car.yawRate += (torque - (cfg.yawDamping + cfg.angularDrag * Math.abs(car.yawRate)) * car.yawRate) * dt;
    car.yawRate += handbrakeImpulse;
    if (forward > cfg.lowSpeedCrossover && (catching || (car.phase === 'recover' && !steerInput))) {
      // Carve along the current velocity arc as the nose realigns. The tires still
      // turn the velocity vector continuously, including during a left/right switch.
      const pathYawRate = (cornerForce * forward - tireLong * lateral) / (speed * speed);
      const alignment = pathYawRate - cfg.alignmentRate * car.slip;
      car.yawRate += (alignment - car.yawRate) * fade(cfg.alignmentResponse, dt);
    }

    const penalized = car.penalty > 0;
    const largeBoost = !penalized && (car.quizTimer > 0 || car.tankTimer > 0 || car.launchTimer > 0);
    const mini = !penalized && car.miniTimer > 0;
    car.boostKind = penalized ? '' : car.quizTimer > 0 ? 'quiz' : car.tankTimer > 0 ? 'tank' :
      car.launchTimer > 0 ? 'launch' : mini ? 'mini' : '';
    car.boosting = !!car.boostKind;
    let speedLimit = speedLimitFor(pace, car.boostKind);
    const brakingPenalty = penalized && car.penalty < cfg.penaltyTime - cfg.penaltyOnset;
    if (brakingPenalty) speedLimit = cfg.slowSpeed / 3.6;
    const bodySlip = Math.atan2(Math.abs(lateral), Math.max(1, Math.abs(forward)));
    const slideLoad = clamp((bodySlip - cfg.shallowSlide) / (cfg.deepSlide - cfg.shallowSlide), 0, 1);
    // Scrub approaches a fraction of this drift's entry speed. Unwinding early
    // preserves momentum; active boost still adds its usual extra headroom.
    const boostHeadroom = car.boosting ? Math.max(0, speedLimit - speedLimitFor(pace, '')) : 0;
    const slideLimit = sliding ? car.driftEntrySpeed * (1 - cfg.deepSlideSpeedLoss * slideLoad) + boostHeadroom : Infinity;
    let thrust = 0;
    const drag = cfg.rollingDrag * Math.min(speed * 2, 1) + cfg.aeroDrag * speed * speed;
    if ((input.throttle || car.boosting) && !input.brake) {
      const motor = cfg.acceleration * pace + (largeBoost ? cfg.boostForce : mini ? cfg.miniForce : 0);
      const engineDemand = (speedLimit - forward) / cfg.throttleTaper;
      const slideDemand = (slideLimit - speed) / (cfg.throttleTaper * car.grip);
      const throttle = clamp(Math.min(engineDemand, slideDemand), 0, 1);
      thrust = motor * throttle + drag * clamp(forward / speedLimit, 0, 1);
      if (forward < -cfg.lowSpeedCrossover) thrust = cfg.braking;
    } else if (input.brake) {
      thrust = forward > cfg.lowSpeedCrossover ? -cfg.braking :
        -cfg.reverseAcceleration * clamp(1 + forward / (cfg.reverseSpeed / 3.6), 0, 1);
    }
    const overspeed = Math.max(0, (speed - speedLimit) * cfg.overspeedDrag, (speed - slideLimit) * cfg.slideScrubRate);
    // Tire scrub removes kinetic energy as the car ploughs across its own path.
    const scrub = cfg.scrub * Math.sin(bodySlip) ** 2 * Math.min(1, speed / 12);
    let resistance = drag + overspeed + scrub;
    if (brakingPenalty && speed > speedLimit) resistance += cfg.penaltyBrake;
    const decel = speed > .0001 ? Math.min(resistance / speed, 1 / dt) : 0;
    // As rear grip breaks, tire forces mostly redirect momentum. The explicit
    // scrub above accounts for sliding friction, so a deep drift isn't charged twice.
    const tireWork = speed > .1 ? (tireLong * forward + cornerForce * lateral) / speed : 0;
    const returned = speed > .1 ? -Math.min(0, tireWork) * (1 - cfg.tireDragFraction * car.grip) / speed : 0;
    const longitudinal = thrust + tireLong;
    car.vx += (longitudinal * fx + cornerForce * rx + (returned - decel) * car.vx) * dt;
    car.vz += (longitudinal * fz + cornerForce * rz + (returned - decel) * car.vz) * dt;
    car.yaw = arc(car.yaw + car.yawRate * dt);
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.speed = Math.hypot(car.vx, car.vz);
    // Positive sideslip means the nose is to the right of the forward travel direction.
    car.slip = forward > 1 ? arc(car.yaw - Math.atan2(car.vx, -car.vz)) : 0;
    car.skidding = !car.wallContact && car.speed > cfg.skidMinSpeed && (Math.abs(car.slip) > cfg.bodySkidAngle ||
      (car.grip < cfg.skidGrip && Math.abs(car.rearSlip) > cfg.rearSkidAngle));
    car.launchTimer = Math.max(0, car.launchTimer - dt);
    car.quizTimer = Math.max(0, car.quizTimer - dt);
    // A wrong gate suppresses propulsion but preserves the remainder of a paid-for tank.
    if (!penalized) car.tankTimer = Math.max(0, car.tankTimer - dt);
    // Save the mini boost until the higher-priority boost finishes.
    if (!largeBoost) car.miniTimer = Math.max(0, car.miniTimer - dt);
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
  window.ClassicDrive = {config, sliders, speedLimitFor, step, create, reset, recoveryPose, constrainToRoad, constrainToTrack, resolveWallContact, camera, useNitro, useMini, boost, launch, penalize};
})();
