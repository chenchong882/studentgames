(() => {
  'use strict';

  const TRACK_LENGTH = 1050;
  const LAPS = 2;
  const FINISH = TRACK_LENGTH * LAPS;
  const GATES = [200, 545, 880];
  const PREVIEW_DISTANCE = 115;
  const CRUISE = 120;
  const SKID_DURATION = 1.5;
  const SKID_STEERING_LOCK = 0.8;
  const LOCK_SECONDS = 0.35;
  const ITEMS = { boost:'氮氣', banana:'香蕉', missile:'飛彈' };
  const CARS = [
    { id:'burst', name:'爆烈 G3', color:'#159c9e', specialty:'起步加速快', acceleration:43, steering:1, bumpLoss:8 },
    { id:'saber', name:'尖峰 G3', color:'#2868b4', specialty:'轉向靈敏', acceleration:36, steering:1.12, bumpLoss:8 },
    { id:'solid', name:'合金 G3', color:'#dba421', specialty:'碰撞失速少', acceleration:36, steering:1, bumpLoss:3 }
  ];
  const TRACKS = [
    { id:'beach', theme:'海灘', name:'椰岸海濱大道' },
    { id:'city', theme:'城市', name:'市中心環道' },
    { id:'desert', theme:'沙漠', name:'沙丘綠洲' },
    { id:'night', theme:'夜晚的街道', name:'月夜霓虹街' },
    { id:'space', theme:'太空', name:'星環太空站' }
  ];
  const BUILTIN_WORDS = [
    ['harbor', '港口'], ['bridge', '橋'], ['island', '島嶼'], ['boat', '船'],
    ['beach', '海灘'], ['lighthouse', '燈塔'], ['wave', '海浪'], ['windmill', '風車'],
    ['tunnel', '隧道'], ['ocean', '海洋'], ['cloud', '雲'], ['mountain', '山']
  ].map(([word, chinese]) => ({ word, chinese }));
  const DRIVERS = [
    { x: -0.63, distance: 9, cruise: 109, color: '#ffad31', name: '金砂' },
    { x:  0.57, distance: 17, cruise: 115, color: '#8b71e8', name: '紫電' },
    { x: -0.13, distance: 26, cruise: 121, color: '#20b6be', name: '青浪' }
  ];
  const CONTROL_KEYS = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'brake', KeyS: 'brake', ShiftLeft:'brake', ShiftRight:'brake', KeyZ:'brake'
  };
  const ITEM_KEYS = new Set(['ControlLeft', 'ControlRight', 'KeyX', 'Space']);
  const SWAP_KEYS = new Set(['AltLeft', 'AltRight', 'KeyC']);
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const laneAt = x => x < -1 / 3 ? 0 : x > 1 / 3 ? 2 : 1;
  const wrapKey = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const order = array => {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  let vocab = BUILTIN_WORDS;
  let lessonHash = '';
  let deck = [], itemBag = [], previousWord = '', gateIndex = 0, countdownTime = 0, feedbackTime = 0;
  let heldItemKey = null;
  let beforePause = 'racing', frameId = 0, lastFrame = null, lastUpdate = 0;
  let state = newRace('race');
  const heldKeys = new Set(), heldPointers = new Map(), heldControls = new Set();
  const canvas = document.getElementById('kart-canvas');

  function newRace(mode, car = CARS[0], stageIndex = 0, results = []) {
    const rivals = DRIVERS.map((driver, id) => ({
      ...driver, id, car: { ...CARS[id], color:driver.color }, speed: 0, hitEffect: null, hitTime: 0, bumpCooldown: 0, finishedAt: null,
      previousX: driver.x, previousDistance: driver.distance
    }));
    const standings = rivals.map(({ id, name, color }) => ({
      id: 'rival-' + id, name, number: String(id + 11), color, isPlayer: false, rivalId: id
    }));
    standings.push({ id:'player', name:'你', number:'07', color:car.color, isPlayer:true });
    const race = {
      phase: 'garage', mode, car, stageIndex, track:TRACKS[stageIndex], results,
      lap: 1, laps: LAPS, rank: standings.length, trackLength: TRACK_LENGTH, finishedAt: null,
      speed: 0, elapsed: 0, countdown: 3, distance: 0, x: 0, steer: 0, offroad: false,
      drifting: false, driftCharge: 0, boost: 0,
      items: [null, null], selectedSlot: 0, itemsUsed: 0, aim: null, bananas: [], missiles: [],
      get inventory() { return this.items[this.selectedSlot]; },
      skid: 0, skidDuration: SKID_DURATION, skidSide: 1,
      question: null, feedback: '', correct: 0, attempts: 0, review: [], vocabCount: vocab.length,
      rivals, standings
    };
    updateStandings(race);
    return race;
  }

  function updateStandings(race) {
    // Cars that crossed the line keep their finish order while the others race on.
    const kart = row => row.isPlayer ? race : race.rivals[row.rivalId];
    race.standings.sort((a, b) => {
      const first = kart(a), second = kart(b);
      if (first.finishedAt !== null || second.finishedAt !== null) {
        return (first.finishedAt ?? Infinity) - (second.finishedAt ?? Infinity);
      }
      return second.distance - first.distance;
    });
    race.rank = 1 + race.standings.findIndex(row => row.isPlayer);
  }

  function notify() {
    document.dispatchEvent(new CustomEvent('kart-update', { detail: state }));
  }
  function draw() {
    window.KartRender.draw(canvas, state);
  }
  function showFeedback(message, seconds = 2.4) {
    state.feedback = message;
    feedbackTime = seconds;
  }
  function clearControls() {
    heldKeys.clear(); heldPointers.clear(); heldControls.clear();
    heldItemKey = null; state.aim = null;
    state.steer = 0; state.drifting = false; state.driftCharge = 0;
  }
  function setControl(action, held) {
    if (!held) { heldControls.delete(action); return; }
    if (state.phase === 'racing') heldControls.add(action);
  }
  function pressed(action) {
    if (heldControls.has(action)) return true;
    for (const code of heldKeys) if (CONTROL_KEYS[code] === action) return true;
    for (const value of heldPointers.values()) if (value === action) return true;
    return false;
  }

  function wake() {
    if (!frameId) frameId = requestAnimationFrame(frame);
  }
  function frame(timestamp) {
    frameId = 0;
    // Large gaps after switching apps must not move the player past a gate.
    const dt = lastFrame === null ? 0 : Math.min((timestamp - lastFrame) / 1000, 0.08);
    lastFrame = timestamp;
    if (state.phase === 'countdown') {
      countdownTime = Math.max(0, countdownTime - dt);
      const tick = Math.ceil(countdownTime);
      if (tick !== state.countdown) {
        state.countdown = tick;
        if (!tick) state.phase = 'racing';
        notify();
      }
    } else if (state.phase === 'racing') {
      advance(dt);
    }
    draw();
    if (state.phase === 'countdown' || state.phase === 'racing') {
      if (timestamp - lastUpdate >= 80) { notify(); lastUpdate = timestamp; }
      wake();
    }
  }
  function stopFrame() {
    cancelAnimationFrame(frameId);
    frameId = 0; lastFrame = null;
  }
  function launchStage(mode, car, stageIndex, results) {
    if (!GameData.ready() || vocab.length < 3) return false;
    stopFrame(); clearControls();
    state = newRace(mode, car, stageIndex, results);
    itemBag = []; gateIndex = 0; feedbackTime = 0;
    countdownTime = 3; state.phase = 'countdown';
    notify(); wake();
    return true;
  }
  function start(mode = 'race', carId) {
    deck = []; previousWord = '';
    const car = CARS.find(entry => entry.id === carId) || CARS[0];
    return launchStage(mode === 'item' ? 'item' : 'race', car, 0, []);
  }
  function nextStage() {
    if (state.phase !== 'finished' || state.stageIndex + 1 >= TRACKS.length) return false;
    return launchStage(state.mode, state.car, state.stageIndex + 1, state.results);
  }
  function pause() {
    if (state.phase !== 'racing' && state.phase !== 'countdown') return;
    beforePause = state.phase;
    state.phase = 'paused';
    stopFrame(); clearControls(); notify(); draw();
  }
  function resume() {
    if (state.phase !== 'paused' || document.hidden) return;
    state.phase = beforePause;
    notify(); wake();
  }
  function garage() {
    stopFrame(); clearControls();
    state = newRace(state.mode, state.car);
    notify(); draw();
  }

  function nextQuestion(gateDistance) {
    if (!deck.length) {
      deck = order(vocab);
      // Avoid repeating a just-seen prompt at the boundary of two shuffled decks.
      const end = deck.length - 1;
      if (deck[end].word === previousWord) [deck[0], deck[end]] = [deck[end], deck[0]];
    }
    const target = deck.pop();
    previousWord = target.word;
    const others = order(vocab.filter(w => w.word !== target.word)).slice(0, 2);
    const options = order([target, ...others]).map(w => w.word);
    state.question = { prompt: target.chinese, word: target.word, options, distance: gateDistance, lane: laneAt(state.x) };
  }
  function giveItem() {
    const slot = state.items.indexOf(null);
    if (slot < 0) return '道具格已滿';
    if (!itemBag.length) itemBag = order(Object.keys(ITEMS));
    let pick = itemBag.length - 1;
    // Make the first pickup usable while the starting pack is still together.
    if (state.correct === 1) {
      const frontCar = state.rivals.some(r => window.KartRender.inAimRange(r, state.distance));
      pick = itemBag.findIndex(item => frontCar ? item === 'missile' : item !== 'missile');
    }
    if (!state.inventory) state.selectedSlot = slot;
    const [item] = itemBag.splice(pick, 1);
    state.items[slot] = item;
    return '獲得' + ITEMS[item];
  }
  function checkGate() {
    if (gateIndex >= LAPS * GATES.length) return;
    const gateDistance = Math.floor(gateIndex / GATES.length) * TRACK_LENGTH + GATES[gateIndex % GATES.length];
    if (!state.question && gateDistance - state.distance <= PREVIEW_DISTANCE) {
      nextQuestion(gateDistance);
      notify();
    }
    const q = state.question;
    if (!q) return;
    q.lane = state.offroad ? -1 : laneAt(state.x);
    if (state.distance < gateDistance) return;
    const chosen = q.options[q.lane] || '未通過字門';
    const correct = chosen === q.word;
    state.review.push({ word: q.word, chinese: q.prompt, chosen, correct });
    state.attempts++;
    if (correct) {
      state.correct++;
      let reward = '加速！';
      if (state.mode === 'item') reward = giveItem();
      else state.boost = Math.max(state.boost, 2.4);
      showFeedback(`${q.word} ＝ ${q.prompt}　${reward}`);
    } else {
      state.skid = SKID_DURATION;
      state.skidSide = Math.abs(state.x) > .45 ? -Math.sign(state.x) : (gateIndex % 2 === 0 ? 1 : -1);
      state.speed = Math.min(state.speed, 78);
      state.boost = 0; state.drifting = false; state.driftCharge = 0;
      state.aim = null;
      showFeedback(`打滑！正解　${q.word} ＝ ${q.prompt}`, 3);
    }
    state.question = null;
    gateIndex++;
    notify();
  }
  function cycleItem() {
    if (state.phase !== 'racing' || state.mode !== 'item') return false;
    const other = 1 - state.selectedSlot;
    if (!state.items[other]) return false;
    state.aim = null;
    state.selectedSlot = other;
    notify();
    return true;
  }
  function consumeItem() {
    const item = state.inventory;
    state.items[state.selectedSlot] = null;
    const other = 1 - state.selectedSlot;
    if (state.items[other]) state.selectedSlot = other;
    state.itemsUsed++;
    document.dispatchEvent(new CustomEvent('kart-item-used', { detail: item }));
    notify();
  }
  function beginItem() {
    if (state.phase !== 'racing' || state.skid > 0 || !state.inventory || state.aim) return false;
    if (state.inventory === 'missile') {
      state.aim = { targetId:null, progress:0 };
      notify(); return true;
    }
    if (state.inventory === 'banana') {
      state.bananas.push({ distance:state.distance - 3, x:state.x, createdAt:state.elapsed });
      showFeedback('香蕉已放在車後');
    } else {
      state.boost = Math.max(state.boost, 3.4);
      showFeedback('氮氣啟動！');
    }
    consumeItem();
    return true;
  }
  function trackAim(dt) {
    if (!state.aim) return;
    const id = window.KartRender.findAimTarget(canvas, state);
    if (id !== state.aim.targetId) state.aim.progress = 0;
    state.aim.targetId = id;
    state.aim.progress = id === null ? 0 : Math.min(1, state.aim.progress + dt / LOCK_SECONDS);
  }
  function endItem() {
    const aim = state.aim;
    if (!aim) return false;
    const id = window.KartRender.findAimTarget(canvas, state);
    state.aim = null;
    if (state.phase !== 'racing' || state.skid > 0 || state.inventory !== 'missile') { notify(); return false; }
    if (id === null || aim.targetId !== id || aim.progress < 1) {
      showFeedback('尚未鎖定，保留飛彈'); notify(); return false;
    }
    const target = state.rivals[id];
    const flightTime = .26 + (target.distance - state.distance) / 145;
    state.missiles.push({ x:state.x, distance:state.distance, targetId:id,
      startX:state.x, startDistance:state.distance, progress:0, flightTime });
    showFeedback('飛彈追擊' + target.name);
    consumeItem();
    return true;
  }
  function useItem() {
    if (heldItemKey !== null) return false;
    return state.aim ? endItem() : beginItem();
  }

  function hitRival(rival, effect) {
    const slipped = effect === 'banana';
    rival.hitEffect = effect;
    rival.hitTime = slipped ? SKID_DURATION : 2;
    rival.speed = Math.min(rival.speed, slipped ? 55 : 30);
    document.dispatchEvent(new CustomEvent('kart-item-hit', {
      detail: { effect, name: rival.name, elapsed: state.elapsed }
    }));
  }
  function advanceItems(dt) {
    for (let i = state.bananas.length - 1; i >= 0; i--) {
      const peel = state.bananas[i];
      let victim = null, earliest = Infinity;
      for (const rival of state.rivals) {
        if (rival.finishedAt !== null || rival.previousDistance > peel.distance || rival.distance < peel.distance) continue;
        const travel = rival.distance - rival.previousDistance;
        const t = travel > 0 ? (peel.distance - rival.previousDistance) / travel : 0;
        const x = rival.previousX + t * (rival.x - rival.previousX);
        if (Math.abs(x - peel.x) <= .23 && t < earliest) { victim = rival; earliest = t; }
      }
      if (victim) hitRival(victim, 'banana');
      if (victim || (state.elapsed - peel.createdAt > 2 && state.rivals.every(r => r.distance > peel.distance || r.finishedAt !== null))) {
        state.bananas.splice(i, 1);
      }
    }
    for (let i = state.missiles.length - 1; i >= 0; i--) {
      const shot = state.missiles[i], target = state.rivals[shot.targetId];
      shot.progress = Math.min(1, shot.progress + dt / shot.flightTime);
      shot.x = shot.startX + (target.x - shot.startX) * shot.progress;
      shot.distance = shot.startDistance + (target.distance - shot.startDistance) * shot.progress;
      if (shot.progress === 1 && target.finishedAt === null) hitRival(target, 'missile');
      if (shot.progress === 1 || target.finishedAt !== null) state.missiles.splice(i, 1);
    }
    trackAim(dt);
  }

  function drive(dt) {
    const turn = Number(pressed('right')) - Number(pressed('left'));
    const brake = pressed('brake');
    const curve = window.KartRender.curveAt(state.distance, state.track.id);
    const velocity = state.speed / CRUISE;
    const slipping = state.skid > 0;
    const skidElapsed = SKID_DURATION - state.skid;
    const grip = slipping ? clamp((skidElapsed - SKID_STEERING_LOCK) / (SKID_DURATION - SKID_STEERING_LOCK), 0, 1) : 1;
    const slide = slipping ? state.skidSide * .52 * Math.sin(2 * Math.PI * skidElapsed / SKID_DURATION) : 0;
    state.steer += (turn * grip - state.steer) * (1 - Math.exp(-11 * dt));
    state.x = clamp(state.x + (state.steer * grip * state.car.steering * (1.15 + 0.36 * velocity) + slide - curve * velocity * 0.61) * dt, -1.22, 1.22);
    state.offroad = Math.abs(state.x) > 1;
    const drifting = !slipping && brake && turn * curve > 0.15 && !state.offroad && state.speed > 66;
    if (drifting) state.driftCharge = Math.min(1, state.driftCharge + dt / 0.62);
    else if (state.drifting) {
      if (state.driftCharge >= 1 && !state.offroad) {
        state.boost = Math.max(state.boost, 1.35);
        showFeedback('甩尾加速！', 1.3);
      }
      state.driftCharge = 0;
    }
    state.drifting = drifting;
    const target = slipping ? 30 + grip * 36 : state.offroad ? 73 : drifting ? 105 : brake ? 63 : state.boost > 0 ? 158 : CRUISE;
    const acceleration = target < state.speed ? (slipping ? 150 : 60) : state.boost > 0 ? 86 : state.car.acceleration;
    state.speed += clamp(target - state.speed, -acceleration * dt, acceleration * dt);
    state.distance += state.speed / 3.6 * dt;
    state.skid = Math.max(0, state.skid - dt);
  }
  function driveRivals(dt) {
    for (const rival of state.rivals) {
      rival.previousX = rival.x;
      rival.previousDistance = rival.distance;
      rival.hitTime = Math.max(0, rival.hitTime - dt);
      if (!rival.hitTime) rival.hitEffect = null;
      if (rival.finishedAt !== null) {
        rival.distance += rival.speed / 3.6 * dt;
        continue;
      }
      const setup = DRIVERS[rival.id];
      const gap = state.distance - rival.distance;
      const rhythm = Math.sin(state.elapsed * 0.55 + rival.id * 2);
      const target = rival.hitTime > 0 ? 32 : setup.cruise + rhythm * 3 + clamp(gap * 0.10, -10, 8);
      rival.bumpCooldown = Math.max(0, rival.bumpCooldown - dt);
      rival.speed += clamp(target - rival.speed, -65 * dt, 31 * dt);
      rival.distance += rival.speed / 3.6 * dt;
      if (rival.distance >= FINISH) {
        const fraction = (FINISH - rival.previousDistance) / (rival.distance - rival.previousDistance);
        rival.finishedAt = state.elapsed - dt + dt * fraction;
        continue;
      }
      rival.x = clamp(setup.x + 0.12 * Math.sin(rival.distance * 0.015 + rival.id) + 0.12 * window.KartRender.curveAt(rival.distance, state.track.id), -0.86, 0.86);
      // A light racing bump costs momentum. Leave the approach to each word gate clear.
      if (!state.question && !rival.bumpCooldown && Math.abs(rival.distance - state.distance) < 2.5 && Math.abs(rival.x - state.x) < 0.19) {
        state.speed = Math.max(0, state.speed - state.car.bumpLoss);
        rival.bumpCooldown = 1.8;
      }
    }
    updateStandings(state);
  }
  function advance(dt) {
    if (!dt) return;
    state.boost = Math.max(0, state.boost - dt);
    feedbackTime = Math.max(0, feedbackTime - dt);
    if (!feedbackTime) state.feedback = '';
    const previousDistance = state.distance;
    drive(dt);
    const crossedFinish = state.distance >= FINISH;
    // Interpolate the last step so photo finishes use the same instant for all karts.
    const raceDt = crossedFinish ? dt * clamp((FINISH - previousDistance) / (state.distance - previousDistance), 0, 1) : dt;
    if (crossedFinish) state.distance = FINISH;
    state.elapsed += raceDt;
    if (crossedFinish) state.finishedAt = state.elapsed;
    driveRivals(raceDt);
    if (state.mode === 'item') advanceItems(raceDt);
    state.lap = Math.min(LAPS, Math.floor(state.distance / TRACK_LENGTH) + 1);
    checkGate();
    if (crossedFinish) {
      state.phase = 'finished';
      state.results.push({ track:state.track, rank:state.rank, elapsed:state.elapsed, correct:state.correct, attempts:state.attempts });
      clearControls(); notify();
    }
  }

  function applyKartData(raw) {
    const payload = GameData.prepare(raw);
    const seenEn = new Set(), seenZh = new Set();
    // A Chinese prompt must identify exactly one English choice, even for short lesson lists.
    const words = payload.words.filter(w => {
      const en = wrapKey(w.word), zh = wrapKey(w.chinese);
      if (!en || !zh || seenEn.has(en) || seenZh.has(zh)) return false;
      seenEn.add(en); seenZh.add(zh); return true;
    });
    const changed = words.length !== vocab.length || words.some((w, i) => w.word !== vocab[i].word || w.chinese !== vocab[i].chinese);
    vocab = words;
    lessonHash = raw ? '#lessonData=' + encodeURIComponent(JSON.stringify(raw)) : '';
    GameData.report(payload, words, 3, '#kart-lesson', '每個字門需要 3 組英、中皆不同的選項。');
    if (changed) garage();
    else { state.vocabCount = words.length; notify(); }
  }
  window.addEventListener('message', event => {
    if (event.data?.type === 'KART_DATA') applyKartData(event.data.payload);
  });

  function editable(target) {
    return target instanceof Element && (target.isContentEditable || target.closest('input, select, textarea'));
  }
  window.addEventListener('keydown', event => {
    if (editable(event.target) || event.metaKey || event.getModifierState?.('AltGraph')) return;
    if (!event.ctrlKey && !event.altKey && (event.code === 'Escape' || event.code === 'KeyP') && ['countdown', 'racing', 'paused'].includes(state.phase)) {
      event.preventDefault();
      if (!event.repeat) { if (state.phase === 'paused') resume(); else pause(); }
      return;
    }
    if (state.phase !== 'racing') return;
    const holdingUseCtrl = heldItemKey === 'ControlLeft' || heldItemKey === 'ControlRight';
    if (CONTROL_KEYS[event.code]) {
      if (event.altKey || (event.ctrlKey && !holdingUseCtrl)) return;
      event.preventDefault(); heldKeys.add(event.code);
    } else if (state.mode === 'item' && SWAP_KEYS.has(event.code) && (!event.ctrlKey || holdingUseCtrl)) {
      event.preventDefault(); if (!event.repeat) cycleItem();
    } else if (state.mode === 'item' && ITEM_KEYS.has(event.code) && !event.altKey) {
      if (event.code === 'Space' && event.target.closest?.('button:not([data-kart-control])')) return;
      if (event.ctrlKey && event.code !== 'ControlLeft' && event.code !== 'ControlRight') return;
      event.preventDefault();
      if (!event.repeat && heldItemKey === null) {
        heldItemKey = event.code;
        beginItem();
      }
    }
  });
  window.addEventListener('keyup', event => {
    heldKeys.delete(event.code);
    if (state.mode === 'item' && state.phase === 'racing' && (event.code === 'AltLeft' || event.code === 'AltRight')) event.preventDefault();
    if (event.code === heldItemKey) {
      heldItemKey = null;
      endItem();
    }
  });
  document.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('[data-kart-control]');
    if (!button || state.phase !== 'racing' || event.button !== 0) return;
    event.preventDefault();
    heldPointers.set(event.pointerId, button.dataset.kartControl);
    button.setPointerCapture(event.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    document.addEventListener(type, event => { heldPointers.delete(event.pointerId); }, true);
  }
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.KartGame = { start, nextStage, pause, resume, garage, useItem, cycleItem, cars:CARS, tracks:TRACKS, itemNames:ITEMS,
    setControl, getState: () => state, getLessonHash: () => lessonHash };
  GameRuntime.onResize(draw, canvas)();
  const hashData = new URLSearchParams(location.hash.slice(1)).get('lessonData');
  if (hashData !== null) {
    let raw = null;
    try { raw = JSON.parse(hashData); } catch (_) { /* GameData displays the invalid lesson receipt. */ }
    applyKartData(raw);
  }
})();
