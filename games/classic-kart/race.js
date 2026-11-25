(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const showFailure = message => { el('fault').textContent = message; el('fault').hidden = false; };
  if (![window.THREE, window.ClassicCourses, window.ClassicLandscapes, window.ClassicExtraWorlds,
        window.ClassicCity, window.ClassicDrive, window.ClassicRivals, window.ClassicKartArt,
        window.ClassicGates, window.GameData, window.WORD_BANK].every(Boolean)) {
    showFailure('賽道資料未載入完整，請重新整理。');
    return;
  }
  const drive = ClassicDrive, tracks = ClassicCity.tracks, cfg = drive.config;
  const stage = el('stage'), view = el('view');
  let track = ClassicCity.track, scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, .12, 1100);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: 'high-performance', alpha: false });
  }
  catch (_) {
    showFailure('瀏覽器無法開啟 WebGL。請開啟硬體加速，再重新整理賽道。');
    return;
  }
  ClassicCity.build(scene, track);
  let gates = ClassicGates.build(scene, track);
  const racers = new THREE.Group();
  scene.add(racers);
  const model = ClassicKartArt.create(racers);
  const LAPS = 3, step = cfg.fixedStep;
  let totalGates = LAPS * track.gates.length;
  const rivalGroup = new THREE.Group();
  const rivalViews = new Map(), orderRows = new Map();
  racers.add(rivalGroup);
  rivalGroup.visible = false;
  let rivals = [], playerFinishedAt = null, displayedOrder = '';
  const difficultyNames = { easy: '簡單', normal: '普通', hard: '困難' };
  const courseChoice = el('course-choice');
  for (const course of tracks) courseChoice.add(new Option(course.name, course.id));
  let courseBag = [], lastCourse = null;
  let matchElapsed = 0, arrivalTimes = [], joined = 0;
  const matchConfirmationTime = 1.35;

  function drawCourse() {
    const specified = tracks.find(course => course.id === courseChoice.value);
    if (specified) {
      courseBag = [];
      lastCourse = specified;
      return specified;
    }
    if (!courseBag.length) courseBag = tracks.slice();
    const candidates = courseBag.filter(course => course !== lastCourse);
    const options = candidates.length ? candidates : courseBag;
    lastCourse = options[Math.floor(Math.random() * options.length)];
    courseBag.splice(courseBag.indexOf(lastCourse), 1);
    return lastCourse;
  }

  function changeCourse(next) {
    if (next === track) return;
    scene.remove(racers);
    const resources = new Set([scene.background]);
    scene.traverse(object => {
      if (object.isInstancedMesh) resources.add(object);
      if (object.geometry) resources.add(object.geometry);
      if (!object.material) return;
      for (const material of [].concat(object.material)) {
        if (resources.has(material)) continue;
        resources.add(material);
        for (const value of Object.values(material)) {
          if (value?.isTexture) resources.add(value);
        }
      }
    });
    for (const resource of resources) resource?.dispose?.();
    scene.clear();
    renderer.renderLists.dispose();
    scene = new THREE.Scene();
    track = next;
    ClassicCity.build(scene, track);
    gates = ClassicGates.build(scene, track);
    scene.add(racers);
    totalGates = LAPS * track.gates.length;
    rebuildMap();
  }
  const boostLabels = { launch: '起步衝刺', mini: '小噴', tank: '氮氣', quiz: '氮氣' };
  let difficulty = 'normal', launchArmed = false, launchUsed = false;
  let car = drive.create(track.sample(0)), renderCar = { ...car }, previousPose = { x: car.x, z: car.z, yaw: car.yaw };
  let phase = 'grid', beforePause = 'grid', modalKind = '', elapsed = 0, countdown = 3;
  let progress = 0, projection = track.project(car.x, car.z, 0), gateIndex = 0, deck = [], records = [], correct = 0;
  let question = null, feedbackTime = 0, goTime = 0, cameraMode = 0, dirty = true, accum = 0, last = 0;
  let pixelLimit = Math.min(window.devicePixelRatio || 1, 1.5), slowFrames = 0;
  const keys = new Set(), pointers = new Map(), inputs = {}, requested = {}, inputEvents = [];
  const keyMap = { ArrowUp: 'throttle', ArrowDown: 'brake', ArrowLeft: 'left', ArrowRight: 'right',
    ShiftLeft: 'drift', ShiftRight: 'drift', ControlLeft: 'nitro', ControlRight: 'nitro' };
  const pressed = name => Object.keys(keyMap).some(key => keyMap[key] === name && keys.has(key)) || [...pointers.values()].includes(name);

  function recordInput(name) {
    if (!name)
      return;
    const down = pressed(name);
    if (down === !!requested[name])
      return;
    requested[name] = down;
    if (phase === 'countdown' && name === 'throttle')
      launchArmed = down && countdown <= cfg.launchLead;
    if (phase === 'race')
      inputEvents.push({ name, down, time: performance.now() });
  }
  // Preserve a quick throttle lift or Shift tap even when both DOM events land
  // between two renders. Each edge reaches a distinct 120 Hz physics tick.

  function readInputs(wallTime) {
    if (!inputEvents.length || inputEvents[0].time > wallTime)
      return;
    const consumed = new Set();
    let throttlePressed = false;
    for (const event of inputEvents) {
      if (event.time > wallTime || consumed.has(event.name))
        break;
      inputs[event.name] = event.down;
      if (event.name === 'throttle' && event.down)
        throttlePressed = true;
      consumed.add(event.name);
    }
    inputEvents.splice(0, consumed.size);
    if (throttlePressed && elapsed <= cfg.launchGrace)
      tryLaunch();
  }

  function clearInputs() {
    launchArmed = false;
    keys.clear();
    pointers.clear();
    inputEvents.length = 0;
    for (const name of Object.values(keyMap))
      inputs[name] = requested[name] = false;
    document.querySelectorAll('#touch .held').forEach(b => b.classList.remove('held'));
  }
  let words = ClassicGates.prepare(WORD_BANK.getWords());
  let nextPayload, hasNextPayload = false;

  function applyLesson(raw) {
    if (phase !== 'grid' && phase !== 'finished') {
      nextPayload = raw;
      hasNextPayload = true;
      return;
    }
    hasNextPayload = false;
    nextPayload = undefined;
    const payload = GameData.prepare(raw), options = ClassicGates.prepare(payload.words);
    const distinct = new Set(options.map(w => w.chinese.toLowerCase()));
    words = options;
    GameData.report(payload, distinct.size < 3 ? options.filter((w, i, a) => a.findIndex(v => v.chinese.toLowerCase() === w.chinese.toLowerCase()) === i) : options, 3, '#lesson', '每座門有 3 個不同選項。');
    el('start').disabled = !GameData.ready();
    if (raw)
      el('hub').href = '../index.html#lessonData=' + encodeURIComponent(JSON.stringify(raw));
  }
  const incoming = new URLSearchParams(location.hash.slice(1)).get('lessonData');
  if (incoming !== null) {
    try {
      applyLesson(JSON.parse(incoming));
    }
    catch (_) {
      applyLesson(null);
    }
  }
  window.addEventListener('message', e => {
    if (e.data?.type === 'KART_DATA' || e.data?.type === 'CLASSIC_KART_DATA')
      applyLesson(e.data.payload);
  });
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const wrapAngle = n => Math.atan2(Math.sin(n), Math.cos(n));
  const timeText = t => {
    const n = Math.floor(t * 100);
    return Math.floor(n / 6000) + ':' + String(Math.floor(n / 100) % 60).padStart(2, '0') + '.' + String(n % 100).padStart(2, '0');
  };
  const music = el('race-music'), musicLevel = .24;
  const lobbyMusic = music.getAttribute('src');
  const courseMusic = { metro: '../assets/music/Neon City Dash.mp3' };
  music.volume = musicLevel;
  let ctx = null, motor = null, sound = true, audioUnlocked = false;
  try {
    sound = localStorage.getItem('classic-kart-sound') !== 'off';
  }
  catch (_) { }

  function audioLabel() {
    el('audio').setAttribute('aria-label', sound ? '關閉音樂與音效' : '開啟音樂與音效');
    el('audio').setAttribute('aria-pressed', String(sound));
    el('audio').querySelector('use').setAttribute('href', sound ? '#sound' : '#mute');
  }

  function unlock() {
    if (!sound)
      return;
    audioUnlocked = true;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio)
        return;
      const firstUse = !ctx;
      if (firstUse) ctx = new Audio();
      if (ctx.state !== 'running')
        ctx.resume().catch(() => { });
      // Mix the music below the engine on devices with hardware-controlled media volume.
      if (firstUse && location.protocol !== 'file:' && ctx.createMediaElementSource) {
        const gain = ctx.createGain();
        gain.gain.value = musicLevel;
        gain.connect(ctx.destination);
        ctx.createMediaElementSource(music).connect(gain);
        music.volume = 1;
      }
    }
    catch (_) { }
  }

  function syncAudio() {
    const audible = sound && audioUnlocked && !document.hidden;
    const driving = phase === 'countdown' || phase === 'race';
    if (audible && (phase === 'grid' || phase === 'matching' || driving)) {
      const src = phase === 'grid' ? lobbyMusic : (courseMusic[track.id] || lobbyMusic);
      if (music.getAttribute('src') !== src) {
        music.pause();
        music.setAttribute('src', src);
      }
      if (music.paused) music.play().catch(() => { });
    } else {
      music.pause();
    }
    if (!audible || !ctx || !driving) {
      if (motor)
        motor.stop();
      motor = null;
      return;
    }
    motor ||= KartDriveAudio.create(ctx);
  }

  function beep(hz, duration, delay = 0) {
    if (!sound || !ctx || ctx.state !== 'running')
      return;
    const osc = ctx.createOscillator(), volume = ctx.createGain(), t = ctx.currentTime + delay;
    osc.type = 'triangle';
    osc.frequency.value = hz;
    volume.gain.setValueAtTime(.0001, t);
    volume.gain.exponentialRampToValueAtTime(.095, t + .01);
    volume.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(volume);
    volume.connect(ctx.destination);
    osc.onended = () => { osc.disconnect(); volume.disconnect(); };
    osc.start(t);
    osc.stop(t + duration + .01);
  }
  document.querySelector('.race-difficulty').addEventListener('click', () => {
    unlock();
    syncAudio();
  });
  el('audio').onclick = () => { sound = !sound; audioLabel(); unlock(); syncAudio(); try {
    localStorage.setItem('classic-kart-sound', sound ? 'on' : 'off');
  }
  catch (_) { } };
  audioLabel();

  function phaseTo(value) {
    phase = value;
    document.body.dataset.phase = value;
    const onGrid = value === 'grid';
    rivalGroup.visible = !onGrid;
    el('grid-card').hidden = !onGrid;
    el('match-card').hidden = value !== 'matching';
    const beforeGrid = value === 'matching' || (value === 'paused' && beforePause === 'matching');
    el('hud').hidden = onGrid || beforeGrid;
    el('camera-button').hidden = onGrid || beforeGrid;
    el('pause').hidden = !['matching', 'countdown', 'race', 'paused'].includes(value);
    const showTour = onGrid && courseChoice.value === 'random';
    el('choice-map').hidden = !onGrid || showTour;
    el('footer-english').textContent = showTour ? 'CIRCUIT TOUR' : track.english.toUpperCase();
    el('footer-course').textContent = showTour ? '單字巡迴賽' : track.name;
    el('touch').hidden = !['countdown', 'race'].includes(value);
    if (!['race', 'countdown'].includes(value))
      document.body.classList.remove('boosting');
    syncAudio();
    dirty = true;
  }

  function introCamera() {
    const w = stage.clientWidth, h = stage.clientHeight, portrait = w / h < .95;
    const origin = track.sample(0);
    camera.position.set(origin.x + 3.35, 2.05, origin.z + 5.05);
    camera.fov = portrait ? 54 : 41;
    camera.lookAt(origin.x, .92, origin.z - .55);
    camera.setViewOffset(w, h, portrait ? -.06 * w : -.205 * w, portrait ? -.19 * h : -.052 * h, w, h);
    camera.updateProjectionMatrix();
  }

  function resize() {
    let w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h)
      return;
    renderer.setPixelRatio(pixelLimit);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (phase === 'grid')
      introCamera();
    else {
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    dirty = true;
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver)
    new ResizeObserver(resize).observe(stage);

  function resetPose() {
    Object.assign(previousPose, { x: car.x, z: car.z, yaw: car.yaw });
    Object.assign(renderCar, car);
    renderCar.cameraState = null;
    ClassicKartArt.reset(model);
  }

  function resetOnRoad() {
    const onGrid = phase === 'countdown' || (phase === 'paused' && beforePause === 'countdown');
    drive.reset(car, onGrid ? ClassicRivals.playerStart(track) : drive.recoveryPose(track, projection));
    projection = track.project(car.x, car.z, projection.s);
    resetPose();
    drive.camera(camera, renderCar, 0, cameraMode, true, onGrid ? 1 : 0);
    dirty = true;
  }

  function lineUpRivals() {
    rivals = ClassicRivals.create(track, LAPS, difficulty);
    for (const view of rivalViews.values()) view.model.root.visible = false;
    for (const rival of rivals) {
      if (!rivalViews.has(rival.id)) {
        const kart = ClassicKartArt.createRival(rivalGroup, rival);
        rivalViews.set(rival.id, { model: kart, pose: {} });
      }
    }
    el('field-order').replaceChildren();
    playerFinishedAt = null;
    displayedOrder = '';
  }

  function standings() {
    const player = { id: 'player', name: '你', color: '#ff7254', progress, finishedAt: playerFinishedAt };
    return [player, ...rivals].sort((a, b) => {
      if (a.finishedAt !== null || b.finishedAt !== null)
        return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity);
      return b.progress - a.progress;
    });
  }

  function levelAtStart() {
    return elapsed < 1 && Math.abs(progress) < .1 && rivals.every(r => Math.abs(r.progress) < .1);
  }

  function updateOrder() {
    const field = standings(), tied = levelAtStart();
    const key = (tied ? '=' : '') + field.map(r => r.id).join('/');
    if (key === displayedOrder) return;
    displayedOrder = key;
    el('place').textContent = tied ? '–' : field.findIndex(r => r.id === 'player') + 1;
    el('field-order').classList.toggle('level-start', tied);
    el('field-order').setAttribute('aria-label', tied ? '四位車手並排起跑' : '車手即時排名');
    for (const driver of field) {
      if (!orderRows.has(driver.id)) {
        const row = document.createElement('li'), marker = document.createElement('i');
        marker.style.backgroundColor = driver.color;
        row.append(marker, driver.name);
        if (driver.id === 'player') row.className = 'your-row';
        orderRows.set(driver.id, row);
      }
      el('field-order').append(orderRows.get(driver.id));
    }
  }

  function resetRace(pose) {
    car = drive.create(pose);
    resetPose();
    projection = track.project(car.x, car.z, 0);
    records = [];
    gateIndex = 0;
    progress = elapsed = correct = 0;
    launchUsed = false;
    feedbackTime = goTime = 0;
    el('feedback').hidden = true;
    setQuestion(null);
  }

  function returnToGrid() {
    closeModal();
    clearInputs();
    phaseTo('grid');
    resetRace(track.sample(0));
    rivals = [];
    playerFinishedAt = null;
    track.gates.forEach((_, i) => gates.set(i, null));
    if (hasNextPayload)
      applyLesson(nextPayload);
    document.querySelector('input[name="difficulty"]:checked').focus({ preventScroll: true });
  }

  courseChoice.addEventListener('change', () => {
    if (phase !== 'grid') return;
    const preview = tracks.find(course => course.id === courseChoice.value);
    if (preview) {
      changeCourse(preview);
      resetRace(track.sample(0));
    }
    phaseTo('grid');
  });

  function prepareMatch() {
    matchElapsed = 0;
    joined = 0;
    let arrival = 0;
    arrivalTimes = rivals.map(() => {
      arrival += .8 + Math.random() * .35;
      return arrival;
    });
    el('match-name').textContent = track.name;
    el('match-english').textContent = track.english;
    el('match-level').textContent = difficultyNames[difficulty];
    el('match-card').dataset.ready = 'false';
    el('match-status').textContent = '配對中，請稍候';
    el('match-count').textContent = '對手 0 / ' + rivals.length;
    el('skip-match').textContent = '略過等待';
    el('match-rivals').replaceChildren(...rivals.map(rival => {
      rivalViews.get(rival.id).model.root.visible = false;
      const item = document.createElement('li'), number = document.createElement('b');
      number.textContent = '··';
      number.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = '等待加入';
      item.append(number, name);
      return item;
    }));
  }

  function advanceMatch(time) {
    matchElapsed = time;
    while (joined < rivals.length && time >= arrivalTimes[joined]) {
      const rival = rivals[joined], slot = el('match-rivals').children[joined];
      slot.firstChild.textContent = rival.number;
      slot.style.setProperty('--driver-color', rival.color);
      slot.lastChild.textContent = rival.name;
      slot.classList.add('joined');
      rivalViews.get(rival.id).model.root.visible = true;
      joined++;
      el('match-count').textContent = '對手 ' + joined + ' / ' + rivals.length;
      if (joined === rivals.length) {
        el('match-card').dataset.ready = 'true';
        el('match-status').textContent = '配對完成';
        el('skip-match').textContent = '開始倒數';
        beep(580, .09);
        beep(780, .13, .09);
      }
    }
    if (time >= arrivalTimes[rivals.length - 1] + matchConfirmationTime) startCountdown();
  }

  function begin(replayCourse) {
    if (hasNextPayload)
      returnToGrid();
    if (!GameData.ready() || words.length < 3)
      return;
    unlock();
    clearInputs();
    closeModal();
    el('tuning').hidden = true;
    el('tune').setAttribute('aria-expanded', 'false');
    changeCourse(replayCourse || drawCourse());
    resetRace(ClassicRivals.playerStart(track));
    deck = ClassicGates.questions(words, totalGates);
    difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    lineUpRivals();
    track.gates.forEach((_, i) => gates.set(i, deck[i]));
    prepareMatch();
    countdown = 3;
    accum = 0;
    last = 0;
    phaseTo('matching');
    camera.clearViewOffset();
    drive.camera(camera, renderCar, 0, cameraMode, true, 1);
    el('countdown').hidden = true;
    el('skip-match').focus({ preventScroll: true });
  }

  function startCountdown() {
    if (phase !== 'matching') return;
    phaseTo('countdown');
    el('skip-match').blur();
    el('countdown').textContent = '3';
    delete el('countdown').dataset.launch;
    el('launch-cue').textContent = '按住油門';
    el('countdown').hidden = false;
    beep(460, .12);
    hud();
  }
  el('start').onclick = () => begin();
  el('skip-match').onclick = () => {
    if (phase !== 'matching') return;
    if (joined === rivals.length) startCountdown();
    else advanceMatch(arrivalTimes[rivals.length - 1]);
  };

  function tryLaunch() {
    if (launchUsed || !inputs.throttle || inputs.brake) return;
    launchUsed = true;
    drive.launch(car);
    el('countdown').dataset.launch = 'boost';
    el('launch-cue').textContent = '起步衝刺！';
    goTime = .72;
    dirty = true;
  }

  function setQuestion(q) {
    if (q === question)
      return;
    question = q;
    el('question').hidden = !q;
    if (q) {
      el('prompt').textContent = q.answer.chinese;
      [...el('choices').children].forEach((e, i) => e.textContent = q.choices[i].word);
    }
  }

  function notify(msg, wrong = false, seconds = 1.4) {
    const tag = el('feedback');
    tag.textContent = msg;
    tag.classList.toggle('wrong', wrong);
    tag.hidden = false;
    feedbackTime = seconds;
  }

  function scoreGate(index, lateral) {
    const lane = ClassicGates.answerLane(lateral, track.halfWidth);
    const q = deck[index], hit = lane === q.correctLane, selected = q.choices[lane];
    records.push({ word: q.answer.word, chinese: q.answer.chinese, picked: selected?.word ?? null, hit });
    if (hit) {
      correct++;
      drive.boost(car);
      notify('Correct!  氮氣加速');
      beep(740, .13);
      beep(990, .16, .08);
    }
    else {
      drive.penalize(car);
      notify((lane === null ? '未作答 · ' : '') + q.answer.chinese + ' ＝ ' + q.answer.word, true, 2.2);
      beep(245, .18);
      beep(175, .18, .10);
    }
    gateIndex++;
    setQuestion(null);
    // Leave the gate the driver just answered intact until it disappears behind the camera.
  }

  function solve(dt, wallTime) {
    const previous = projection, from = progress;
    Object.assign(previousPose, { x: car.x, z: car.z, yaw: car.yaw });
    readInputs(wallTime);
    drive.step(car, inputs, dt);
    projection = track.project(car.x, car.z, previous.s);
    projection = drive.constrainToTrack(car, track, projection, dt);
    let ds = projection.s - previous.s;
    if (ds > track.length / 2)
      ds -= track.length;
    if (ds < -track.length / 2)
      ds += track.length;
    progress += ds;
    elapsed += dt;
    ClassicRivals.step(rivals, track, car, progress, dt, elapsed);
    const target = gateIndex < totalGates ? Math.floor(gateIndex / track.gates.length) * track.length + track.gates[gateIndex % track.gates.length] : Infinity;
    const remaining = target - progress;
    // Once a question is on screen, braking cannot make it flicker off during approach.
    const readingDistance = question ? 278 : clamp(45 + car.speed * 3.65, 140, 268);
    if (from < target && remaining <= 0 && ds > 0) {
      const fraction = clamp((target - from) / ds, 0, 1);
      scoreGate(gateIndex, previous.lateral + (projection.lateral - previous.lateral) * fraction);
    }
    else if (remaining >= 0 && remaining <= readingDistance)
      setQuestion(deck[gateIndex]);
    else
      setQuestion(null);
    const lap = Math.floor(progress / track.length), oldLap = Math.floor(from / track.length);
    if (lap > oldLap && lap > 0 && lap < LAPS)
      track.gates.forEach((_, i) => gates.set(i, deck[lap * track.gates.length + i]));
    if (progress >= track.length * LAPS && gateIndex === totalGates) {
      const fraction = ds > 0 ? clamp((track.length * LAPS - from) / ds, 0, 1) : 1;
      playerFinishedAt = elapsed - dt + fraction * dt;
      elapsed = playerFinishedAt;
      finish();
      return;
    }
    if (feedbackTime > 0 && (feedbackTime -= dt) <= 0)
      el('feedback').hidden = true;
    if (goTime > 0 && (goTime -= dt) <= 0)
      el('countdown').hidden = true;
  }

  function hideTuning() { el('tuning').hidden = true; el('tune').setAttribute('aria-expanded', 'false'); }
  const action = (label, handler, main = false) => { const b = document.createElement('button'); b.className = main ? 'primary' : 'secondary'; b.textContent = label; b.onclick = handler; el('dialog-actions').appendChild(b); return b; };
  let focusBack;

  function openModal(kind, title) {
    if (el('modal').hidden)
      focusBack = document.activeElement;
    modalKind = kind;
    hideTuning();
    el('dialog-title').textContent = title;
    el('dialog-course').textContent = phase === 'grid' ? 'CIRCUIT TOUR' : track.name + ' / ' + track.english;
    el('dialog-content').replaceChildren();
    el('dialog-actions').replaceChildren();
    el('modal').hidden = false;
  }

  function closeModal() { el('modal').hidden = true; modalKind = ''; if (focusBack?.isConnected && !focusBack.closest('[hidden]'))
    focusBack.focus({ preventScroll: true }); }

  function resume() { closeModal(); clearInputs(); unlock(); phaseTo(beforePause); last = 0; accum = 0; }

  function stopRace() {
    if (['matching', 'countdown', 'race'].includes(phase)) {
      beforePause = phase;
      clearInputs();
      phaseTo('paused');
      return true;
    }
    return phase === 'paused';
  }

  function pauseRace() {
    if (phase === 'paused') {
      resume();
      return;
    }
    if (!stopRace())
      return;
    openModal('pause', '比賽暫停');
    const a = action('繼續比賽', resume, true);
    action('重新開始', () => begin(track));
    action('更換賽道與難度', returnToGrid);
    a.focus();
  }

  function help() {
    if (!el('modal').hidden)
      return;
    const interrupted = stopRace();
    openModal('help', '駕駛操作');
    const content = el('dialog-content');
    const list = document.createElement('dl');
    for (const [key, label] of [['↑ / ↓', '油門／煞車。倒數到 1 時按住油門可衝刺起跑，停下後按煞車可倒車。'], ['← / →', '轉向，甩尾中按反方向拉正'], ['Shift', '與方向鍵同按進入甩尾'], ['Ctrl', '使用一格甩尾集滿的氮氣'], ['R / C', '重置車輛／切換跟車鏡頭'], ['Esc / T', '暫停／即時調校']]) {
      const term = document.createElement('dt'), desc = document.createElement('dd'), k = document.createElement('kbd');
      k.textContent = key;
      term.appendChild(k);
      desc.textContent = label;
      list.append(term, desc);
    }
    content.appendChild(list);
    const p = document.createElement('p');
    p.textContent = '讀上方的中文，開進對應的英文門。答對加速 ' + cfg.quizTime + ' 秒，答錯會短暫緩速。右側繞行道也能開，從那裡經過會算一次答錯。有效甩尾後，放開再踩油門即可小噴。';
    content.appendChild(p);
    action(interrupted ? '回到比賽' : '回到起跑線', interrupted ? resume : closeModal, true).focus();
  }

  function finish() {
    phaseTo('finished');
    clearInputs();
    setQuestion(null);
    el('feedback').hidden = true;
    el('countdown').hidden = true;
    const place = standings().findIndex(driver => driver.id === 'player') + 1;
    openModal('result', '第 ' + place + ' 名衝線！');
    const c = el('dialog-content'), time = document.createElement('div');
    time.className = 'result-time';
    time.textContent = timeText(elapsed);
    c.append(time);
    const stats = document.createElement('div');
    stats.className = 'result-stats';
    for (const [label, value] of [['AI 難度', difficultyNames[difficulty]], ['答對', correct], ['答錯', records.length - correct], ['正確率', Math.round(100 * correct / records.length) + '%']]) {
      const col = document.createElement('span'), v = document.createElement('b');
      col.textContent = label;
      v.textContent = value;
      col.append(v);
      stats.append(col);
    }
    c.append(stats);
    const misses = records.filter(r => !r.hit), h = document.createElement('h3');
    h.textContent = misses.length ? '錯題複習' : '全部答對！';
    c.append(h);
    if (misses.length) {
      const ul = document.createElement('ul');
      misses.forEach(r => { const li = document.createElement('li'); li.textContent = r.chinese + ' ＝ ' + r.word + (r.picked === null ? '（繞行，未作答）' : '（你選了 ' + r.picked + '）'); ul.append(li); });
      c.append(ul);
    }
    action(courseChoice.value === 'random' ? '下一場隨機賽' : '重新開始', () => begin(), true).focus();
    action('更換賽道與難度', returnToGrid);
    action('返回遊戲大廳', () => location.href = el('hub').href);
    beep(660, .18);
    beep(880, .22, .16);
    hud();
  }

  function switchCamera() { if (phase !== 'grid') {
    cameraMode = 1 - cameraMode;
    dirty = true;
  } }
  el('camera-button').onclick = switchCamera;
  el('pause').onclick = pauseRace;
  el('help').onclick = help;

  function toggleTune() { if (!el('modal').hidden)
    return; const open = el('tuning').hidden; el('tuning').hidden = !open; el('tune').setAttribute('aria-expanded', String(open)); }
  el('tune').onclick = toggleTune;
  el('close-tune').onclick = hideTuning;
  const groups = new Map(), ranges = [];
  for (const spec of drive.sliders) {
    if (!groups.has(spec.group)) {
      const d = document.createElement('details'), s = document.createElement('summary');
      s.textContent = spec.group;
      d.open = groups.size === 0;
      d.append(s);
      el('sliders').append(d);
      groups.set(spec.group, d);
    }
    const l = document.createElement('label'), o = document.createElement('output'), r = document.createElement('input');
    l.textContent = spec.label;
    r.type = 'range';
    r.min = spec.min;
    r.max = spec.max;
    r.step = spec.step;
    r.value = cfg[spec.key];
    const initial = cfg[spec.key];
    function read() { cfg[spec.key] = Number(r.value); o.textContent = r.value + ' ' + spec.unit; dirty = true; }
    r.oninput = read;
    read();
    ranges.push(() => { r.value = initial; read(); });
    l.append(o, r);
    groups.get(spec.group).append(l);
  }
  el('defaults').onclick = () => ranges.forEach(f => f());
  el('modal').addEventListener('keydown', e => {
    if (e.key !== 'Tab')
      return;
    const buttons = [...el('modal').querySelectorAll('button')], first = buttons[0], lastButton = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      lastButton.focus();
    }
    if (!e.shiftKey && document.activeElement === lastButton) {
      e.preventDefault();
      first.focus();
    }
  });
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (e.repeat)
        return;
      if (!el('tuning').hidden)
        hideTuning();
      else if (modalKind === 'help')
        phase === 'paused' ? resume() : closeModal();
      else
        pauseRace();
      return;
    }
    if (e.code === 'KeyT' && !e.repeat) {
      toggleTune();
      return;
    }
    if (e.target.matches?.('input') || modalKind || !['countdown', 'race'].includes(phase) || e.metaKey || e.altKey)
      return;
    if (keyMap[e.code]) {
      e.preventDefault();
      if (e.repeat) return;
      keys.add(e.code);
      recordInput(keyMap[e.code]);
    }
    else if (!e.repeat && ['KeyC', 'KeyR'].includes(e.code)) {
      e.preventDefault();
      if (e.code === 'KeyC')
        switchCamera();
      else
        resetOnRoad();
    }
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); recordInput(keyMap[e.code]); });

  function away() { if (['matching', 'race', 'countdown'].includes(phase))
    pauseRace(); clearInputs(); }
  window.addEventListener('blur', away);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) away();
    syncAudio();
  });
  window.addEventListener('pagehide', () => music.pause());
  window.addEventListener('pageshow', syncAudio);
  for (const b of document.querySelectorAll('[data-drive]')) {
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); pointers.set(e.pointerId, b.dataset.drive); recordInput(b.dataset.drive); b.classList.add('held'); });
    const release = e => { pointers.delete(e.pointerId); recordInput(b.dataset.drive); b.classList.toggle('held', [...pointers.values()].includes(b.dataset.drive)); };
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }

  function drawDial() {
    const dial = el('dial'), NS = 'http://www.w3.org/2000/svg';
    const path = (d, stroke, width, fill = 'none') => { const p = document.createElementNS(NS, 'path'); for (const [k, v] of Object.entries({ d, stroke, 'stroke-width': width, fill }))
      p.setAttribute(k, v); dial.append(p); return p; };
    path('M8 112 A87 87 0 1 1 182 112 Z', '#f4e5c2', 2.5, '#173249');
    const polar = (a, r) => [95 + Math.cos(a) * r, 96 + Math.sin(a) * r].join(' ');
    for (let i = 0; i <= 28; i++) {
      const a = (-180 + i * 180 / 28) * Math.PI / 180;
      path('M' + polar(a, i % 4 === 0 ? 65 : 72) + ' L' + polar(a, 79), i >= 21 ? '#ff8654' : '#d7e9e6', i % 4 === 0 ? 3 : 2);
    }
    const needle = path('M95 15 L89 28 L101 28 Z', 'none', 0, '#ffd05d');
    return v => needle.setAttribute('transform', 'rotate(' + (-90 + clamp(v / 300, 0, 1) * 180) + ' 95 96)');
  }
  const gauge = drawDial();
  const map = el('map'), mc = map.getContext('2d'), base = document.createElement('canvas');
  base.width = map.width;
  base.height = map.height;
  let mx, my;
  function rebuildMap() {
    const points = Array.from({ length: 420 }, (_, i) => track.sample(track.length * i / 420));
    const xs = points.map(p => p.x), zs = points.map(p => p.z), minX = Math.min(...xs), minZ = Math.min(...zs), dx = Math.max(...xs) - minX, dz = Math.max(...zs) - minZ;
    const mapScale = Math.min((map.width - 18) / dx, (map.height - 14) / dz);
    mx = x => (x - minX - dx / 2) * mapScale + map.width / 2;
    my = z => (z - minZ - dz / 2) * mapScale + map.height / 2;
    const bg = base.getContext('2d');
    bg.clearRect(0, 0, base.width, base.height);
    bg.beginPath();
    let onBypass = false;
    for (const [i, p] of points.entries()) {
      const branch = track.bypassAt(i * track.length / points.length);
      if (branch.blend > 0) {
        const offset = branch.center * branch.blend;
        const x = mx(p.x - p.tz * offset), y = my(p.z + p.tx * offset);
        if (onBypass) bg.lineTo(x, y);
        else bg.moveTo(x, y);
      }
      onBypass = branch.blend > 0;
    }
    bg.lineWidth = 2;
    bg.strokeStyle = '#87bdc4';
    bg.stroke();
    bg.beginPath();
    points.forEach((p, i) => i ? bg.lineTo(mx(p.x), my(p.z)) : bg.moveTo(mx(p.x), my(p.z)));
    bg.closePath();
    bg.lineJoin = 'round';
    bg.lineWidth = 8;
    bg.strokeStyle = '#132d3e';
    bg.stroke();
    bg.lineWidth = 4;
    bg.strokeStyle = '#f5efcf';
    bg.stroke();
    track.gates.forEach(s => { const p = track.sample(s); bg.fillStyle = '#ffc354'; bg.fillRect(mx(p.x) - 2.5, my(p.z) - 2.5, 5, 5); });
    const start = points[0];
    for (const id of ['match-map', 'choice-map']) {
      const preview = el(id).getContext('2d');
      preview.clearRect(0, 0, base.width, base.height);
      preview.drawImage(base, 0, 0);
      preview.save();
      preview.translate(mx(start.x), my(start.z));
      preview.rotate(Math.atan2(start.tx, -start.tz));
      preview.beginPath();
      preview.moveTo(0, -7);
      preview.lineTo(5.5, 5);
      preview.lineTo(-5.5, 5);
      preview.closePath();
      preview.fillStyle = '#ff7955';
      preview.fill();
      preview.restore();
    }
    el('map-name').textContent = track.english.toUpperCase();
  }
  rebuildMap();
  for (let i = 0; i < cfg.slots; i++)
    el('slots').append(document.createElement('i'));

  function hud() {
    const speed = Math.round(car.speed * 3.6);
    updateOrder();
    el('speed').textContent = speed;
    gauge(speed);
    el('time').textContent = timeText(elapsed);
    el('lap').textContent = clamp(Math.floor(progress / track.length) + 1, 1, LAPS);
    el('hits').textContent = correct;
    el('misses').textContent = records.length - correct;
    el('fill').style.transform = 'scaleX(' + car.charge + ')';
    [...el('slots').children].forEach((s, i) => s.classList.toggle('full', i < car.stock));
    const mode = car.penalty ? '緩速' : car.boosting ? boostLabels[car.boostKind] : car.miniReady ? '補油小噴' : ({ entry: '甩尾', slide: '甩尾', counter: '反打', recover: '回抓' })[car.phase] || '';
    el('drive-status').textContent = mode;
    document.body.classList.toggle('boosting', phase === 'race' && car.boosting);
    mc.clearRect(0, 0, map.width, map.height);
    mc.drawImage(base, 0, 0);
    for (const rival of rivals) {
      mc.beginPath();
      mc.arc(mx(rival.car.x), my(rival.car.z), 4, 0, 2 * Math.PI);
      mc.fillStyle = rival.color;
      mc.strokeStyle = '#132d3e';
      mc.lineWidth = 1.5;
      mc.fill();
      mc.stroke();
    }
    mc.save();
    mc.translate(mx(car.x), my(car.z));
    mc.rotate(car.yaw);
    mc.fillStyle = '#ff6d4c';
    mc.strokeStyle = '#fffbea';
    mc.lineWidth = 2;
    mc.beginPath();
    mc.moveTo(0, -8);
    mc.lineTo(5, 5);
    mc.lineTo(0, 3);
    mc.lineTo(-5, 5);
    mc.closePath();
    mc.fill();
    mc.stroke();
    mc.restore();
  }
  const lines = document.createElement('div');
  lines.className = 'streaks';
  lines.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 10; i++) {
    const line = document.createElement('i');
    line.style.setProperty('--angle', (i * 36 + 9) + 'deg');
    lines.append(line);
  }
  stage.insertBefore(lines, el('hud'));
  let hudAge = 0;

  function interpolatePose(target, car, previous, fraction) {
    Object.assign(target, car);
    target.x = previous.x + (car.x - previous.x) * fraction;
    target.z = previous.z + (car.z - previous.z) * fraction;
    target.yaw = previous.yaw + wrapAngle(car.yaw - previous.yaw) * fraction;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const raw = last ? (now - last) / 1000 : 0, dt = clamp(raw, 0, .18);
    last = now;
    if (document.hidden)
      return;
    const moving = ['race', 'countdown', 'matching'].includes(phase);
    if (!moving && !dirty)
      return;
    if (moving && raw > 0) {
      slowFrames = raw > .048 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 24 && pixelLimit > .72) {
        pixelLimit = Math.max(.72, pixelLimit * .80);
        slowFrames = 0;
        resize();
      }
    }
    if (phase === 'matching') {
      advanceMatch(matchElapsed + dt);
    }
    else if (phase === 'countdown') {
      const tick = Math.ceil(countdown);
      countdown = Math.max(0, countdown - dt);
      if (Math.ceil(countdown) !== tick) {
        el('countdown').textContent = Math.ceil(countdown) || 'GO!';
        if (countdown && countdown <= cfg.launchLead)
          el('countdown').dataset.launch = 'ready';
        beep(countdown ? 460 : 870, countdown ? .1 : .28);
      }
      if (!countdown) {
        Object.assign(inputs, requested);
        phaseTo('race');
        goTime = .72;
        delete el('countdown').dataset.launch;
        if (launchArmed) tryLaunch();
        launchArmed = false;
        accum = 0;
      }
    }
    else if (phase === 'race') {
      accum += dt;
      while (accum >= step && phase === 'race') {
        solve(step, now - (accum - step) * 1000);
        accum -= step;
      }
    }
    if (phase === 'grid') {
      introCamera();
      ClassicKartArt.update(model, car, 0);
    }
    else {
      const rig = renderCar.cameraState;
      const f = clamp(accum / step, 0, 1);
      interpolatePose(renderCar, car, previousPose, f);
      renderCar.cameraState = rig;
      ClassicKartArt.update(model, renderCar, moving ? dt : 0);
      for (const rival of rivals) {
        const view = rivalViews.get(rival.id);
        interpolatePose(view.pose, rival.car, rival.previousPose, f);
        ClassicKartArt.updateRival(view.model, view.pose, moving ? dt : 0);
      }
      const gridView = 1 - clamp(elapsed / cfg.gridViewSeconds, 0, 1);
      drive.camera(camera, renderCar, dt, cameraMode, false, gridView);
      hudAge += dt;
      if (hudAge >= .04 || dirty) {
        hud();
        hudAge = 0;
      }
      if (motor)
        motor.update({ elapsed, speed: car.speed * 3.6, boost: car.boosting ? Math.max(car.quizTimer, car.miniTimer, car.tankTimer, car.launchTimer) : 0,
          drifting: car.skidding, driftCharge: Math.min(1, Math.abs(car.slip)), skid: car.penalty });
    }
    renderer.render(scene, camera);
    dirty = false;
  }
  window.ClassicRace = { telemetry: () => ({ phase, elapsed, difficulty, trackId: track.id, launchUsed, car: { ...car, cameraState: undefined }, progress, projection: { ...projection },
      place: levelAtStart() ? null : standings().findIndex(r => r.id === 'player') + 1,
      rivals: rivals.map(r => ({ id: r.id, name: r.name, x: r.car.x, z: r.car.z, speed: r.car.speed, progress: r.progress, finishedAt: r.finishedAt })),
      gateIndex, question: question ? { correctLane: question.correctLane, choices: question.choices.map(w => w.word), meaning: question.answer.chinese } : null,
      correct, wrong: records.length - correct, vocabCount: words.length, cameraMode, fov: camera.fov, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }) };
  view.addEventListener('webglcontextlost', () => { away(); showFailure('3D 顯示已中斷，請重新整理以載入賽道。'); });
  el('start').disabled = !GameData.ready();
  el('start').innerHTML = '開始競速 <svg aria-hidden="true"><use href="#arrow"/></svg>';
  resize();
  requestAnimationFrame(frame);
})();
