(() => {
  'use strict';

  const ui = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), el => [el.id, el]));
  const game = window.KartGame;
  const write = GameRuntime.text;
  const standingRows = new Map();
  const standingAnimations = new WeakMap();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const itemActions = { boost:'噴氮氣', banana:'放香蕉', missile:'瞄準飛彈' };
  const slotButtons = Array.from(ui['item-rack'].querySelectorAll('[data-slot]'));
  let mode = 'race', phase = '', currentQuestion = null, activeLane = -2, approachLength = 1;
  let previousCountdown = null, previousAttempts = 0, previousUses = 0, previousLock = null, audio = null;
  let soundOn = true, motor = null;
  try { soundOn = localStorage.getItem('kart-sound') !== 'off'; } catch (_) {}

  function enableAudio() {
    if (!soundOn) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      if (!audio) audio = new Context();
      if (audio.state === 'suspended' || audio.state === 'interrupted') audio.resume().catch(() => {});
    } catch (_) { /* The visual signals work independently of audio. */ }
  }
  function tone(hz, duration, delay = 0) {
    if (!soundOn || !audio || audio.state !== 'running') return;
    const start = audio.currentTime + delay;
    const osc = audio.createOscillator(), volume = audio.createGain();
    osc.type = 'triangle'; osc.frequency.value = hz;
    volume.gain.setValueAtTime(.001, start);
    volume.gain.exponentialRampToValueAtTime(.085, start + .012);
    volume.gain.exponentialRampToValueAtTime(.001, start + duration);
    osc.connect(volume); volume.connect(audio.destination);
    osc.onended = () => { osc.disconnect(); volume.disconnect(); };
    osc.start(start); osc.stop(start + duration + .01);
  }
  function updateMotor(state) {
    if (state.phase !== 'racing' || !soundOn || audio?.state !== 'running') {
      if (motor) { motor.stop(); motor = null; }
      return;
    }
    if (!motor) {
      const osc = audio.createOscillator(), volume = audio.createGain();
      osc.type = 'triangle'; osc.frequency.value = 42 + state.speed * .48; volume.gain.value = .011;
      osc.connect(volume); volume.connect(audio.destination);
      osc.onended = () => { osc.disconnect(); volume.disconnect(); };
      osc.start(); motor = osc;
    }
    motor.frequency.setTargetAtTime(42 + state.speed * .48, audio.currentTime, .08);
  }
  function paintSound() {
    for (const button of soundButtons) {
      button.setAttribute('aria-pressed', String(soundOn));
      button.querySelector('use').setAttribute('href', soundOn ? '#i-speaker' : '#i-muted');
      write(button.querySelector('span'), soundOn ? '音效開啟' : '音效關閉');
    }
  }
  const soundButtons = [ui['audio-toggle'], ui['pause-audio']];
  soundButtons.forEach(button => button.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem('kart-sound', soundOn ? 'on' : 'off'); } catch (_) {}
    paintSound(); enableAudio(); tone(660, .11);
  }));
  paintSound();

  const modes = Array.from(document.querySelectorAll('[data-mode]'));
  modes.forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    modes.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
  function startRace() {
    enableAudio();
    previousCountdown = null; previousAttempts = 0; previousUses = 0; previousLock = null;
    ui['standing-list'].textContent = '';
    standingRows.clear();
    game.start(mode);
  }
  ui.start.addEventListener('click', startRace);
  ui.again.addEventListener('click', startRace);
  ui.pause.addEventListener('click', game.pause);
  ui.resume.addEventListener('click', () => { enableAudio(); game.resume(); });
  ui.item.addEventListener('click', () => {
    game.useItem();
    ui.race.focus({preventScroll:true});
  });
  slotButtons.forEach((button, i) => button.addEventListener('click', () => {
    if (i !== game.getState().selectedSlot) game.cycleItem();
    ui.race.focus({preventScroll:true});
  }));
  [ui.back, ui.leave].forEach(button => button.addEventListener('click', game.garage));
  ui['help-open'].addEventListener('click', () => {
    ui.help.hidden = false;
    ui['help-close'].focus();
  });
  function closeHelp() {
    ui.help.hidden = true;
    ui['help-open'].focus();
  }
  ui['help-close'].addEventListener('click', closeHelp);
  ui.help.addEventListener('click', event => { if (event.target === ui.help) closeHelp(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !ui.help.hidden) { event.preventDefault(); closeHelp(); return; }
    if (event.key !== 'Tab') return;
    const modal = [ui.help, ui.break, ui.finish].find(el => !el.hidden);
    if (!modal) return;
    const buttons = modal.querySelectorAll('button:enabled');
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function paintQuestion(q, distance) {
    if (q !== currentQuestion) {
      currentQuestion = q; activeLane = -2;
      ui['word-prompt'].hidden = !q;
      ui['word-lanes'].textContent = '';
      if (q) {
        approachLength = Math.max(1, q.distance - distance);
        write(ui.prompt, q.prompt);
        for (const word of q.options) {
          const label = document.createElement('span');
          label.textContent = word;
          ui['word-lanes'].appendChild(label);
        }
      }
    }
    if (q) {
      const remaining = Math.max(0, Math.min(1, (q.distance - distance) / approachLength));
      ui['gate-meter'].style.transform = 'scaleX(' + remaining + ')';
    }
    if (q && activeLane !== q.lane) {
      activeLane = q.lane;
      Array.from(ui['word-lanes'].children).forEach((label, i) => label.classList.toggle('selected', i === q.lane));
    }
  }

  function showResults(state) {
    write(ui['final-rank'], '第 ' + state.rank + ' 名');
    const seconds = Math.floor(state.elapsed);
    write(ui['final-time'], Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + '.' + Math.floor((state.elapsed - seconds) * 10));
    write(ui['final-words'], state.correct + ' / ' + state.attempts);
    const list = ui['review-list'];
    list.textContent = '';
    for (const answer of state.review) {
      const li = document.createElement('li'), status = document.createElement('span'), words = document.createElement('span');
      status.className = 'verdict'; status.textContent = answer.correct ? '答對' : '答錯';
      words.textContent = answer.word + '　' + answer.chinese;
      if (!answer.correct) {
        li.className = 'wrong';
        const chosen = document.createElement('span');
        chosen.className = 'picked'; chosen.textContent = '你的選擇：' + answer.chosen;
        words.appendChild(chosen);
      }
      li.append(status, words); list.appendChild(li);
    }
    tone(523, .14); tone(659, .14, .14); tone(784, .24, .28);
  }

  function standingRow(driver) {
    if (standingRows.has(driver.id)) return standingRows.get(driver.id);
    const row = document.createElement('li');
    row.className = driver.isPlayer ? 'standing-row is-player' : 'standing-row';
    row.style.setProperty('--kart-color', driver.color);
    const marker = document.createElement('span'), number = document.createElement('span');
    marker.className = 'rank-marker'; number.className = 'car-number';
    number.textContent = '#' + driver.number;
    row.append(marker, document.createTextNode(driver.name), number);
    standingRows.set(driver.id, row);
    return row;
  }

  function paintStandings(state) {
    const list = ui['standing-list'];
    const drivers = state.standings;
    if (list.childElementCount === drivers.length && drivers.every((driver, i) => list.children[i] === standingRows.get(driver.id))) return;

    write(ui.rank, state.rank);
    write(ui['rank-suffix'], ['st','nd','rd','th'][state.rank - 1]);
    ui['standing-place'].setAttribute('aria-label', '目前第 ' + state.rank + ' 名');
    const rows = drivers.map(standingRow);
    const animate = state.phase === 'racing' && list.children.length === rows.length && !reduceMotion.matches && typeof list.animate === 'function';
    // Read every current screen position before changing layout, including a pass still in motion.
    const before = animate ? rows.map(row => row.getBoundingClientRect()) : [];
    rows.forEach((row, i) => {
      standingAnimations.get(row)?.cancel();
      list.appendChild(row);
      row.setAttribute('aria-label', '第 ' + (i + 1) + ' 名，' + drivers[i].name + '，' + drivers[i].number + ' 號車');
    });
    if (!animate) return;
    const after = rows.map(row => row.getBoundingClientRect());
    rows.forEach((row, i) => {
      const dy = before[i].top - after[i].top, dx = before[i].left - after[i].left;
      if (Math.abs(dy) < .5 && Math.abs(dx) < .5) return;
      const drop = dy < 0;
      const move = (x, y) => 'translate(' + x + 'px,' + y + 'px)';
      const frames = [{transform:move(dx, dy)}];
      if (drop) frames.push({transform:move(-3, dy - 2), offset:.19});
      frames.push({transform:move(0, drop ? 2 : -1), offset:.85}, {transform:move(0, 0)});
      standingAnimations.set(row, row.animate(frames, {duration:drop ? 240 : 200, easing:'ease-in-out'}));
    });
  }

  function paintItems(state) {
    const available = state.phase === 'racing' && state.skid <= 0;
    slotButtons.forEach((button, i) => {
      const item = state.items[i], selected = !!item && i === state.selectedSlot;
      const slotState = [item, selected, state.phase].join('/');
      if (button.dataset.slotState === slotState) return;
      button.dataset.slotState = slotState;
      button.disabled = state.phase !== 'racing' || !item;
      button.setAttribute('aria-pressed', String(selected));
      const name = game.itemNames[item] || '空格';
      button.setAttribute('aria-label', '第 ' + (i + 1) + ' 格，' + name + (selected ? '，已選取' : ''));
      button.querySelector('use').setAttribute('href', '#i-' + (item || 'box'));
      write(button.querySelector('span'), name);
    });
    const selected = state.inventory;
    const target = state.aim && state.aim.progress >= 1 ? state.aim.targetId : null;
    if (target !== null && target !== previousLock && available) tone(880, .075);
    previousLock = target;
    if (state.itemsUsed > previousUses && available) { tone(360, .13); tone(690, .13, .08); }
    previousUses = state.itemsUsed;
    ui.item.disabled = !available || !selected;
    if (ui.item.dataset.item !== (selected || 'box')) {
      ui.item.dataset.item = selected || 'box';
      ui.item.querySelector('use').setAttribute('href', '#i-' + (selected || 'box'));
    }
    let action = itemActions[selected] || '空道具格';
    if (state.aim) {
      action = state.rank === 1 ? '前方無車' : target === null ? '瞄準中' : '發射飛彈';
    }
    write(ui['item-name'], action);
    write(ui['item-key-tip'], selected === 'missile'
      ? '　Alt / C 換格　按住 X 瞄準，鎖定後放開'
      : '　Alt / C 換格　Ctrl / X 使用');
  }

  function update(state) {
    const next = state.phase;
    updateMotor(state);
    if (next !== phase) {
      const prior = phase;
      phase = next;
      ui.garage.hidden = next !== 'garage';
      ui.race.hidden = next === 'garage';
      document.body.classList.toggle('in-race', next !== 'garage');
      ui.break.hidden = next !== 'paused';
      ui.finish.hidden = next !== 'finished';
      ui.count.hidden = next !== 'countdown';
      ui['item-rack'].hidden = ui.item.hidden = ui['item-key-tip'].hidden = state.mode !== 'item';
      if (next === 'garage') {
        if (prior) ui.start.focus({preventScroll:true});
      } else if (next === 'paused') {
        ui.resume.focus();
      } else if (next === 'finished') {
        showResults(state); ui.again.focus({preventScroll:true});
      } else {
        ui.race.focus({preventScroll:true});
        if (prior === 'countdown' && next === 'racing') tone(850, .3);
      }
    }

    if (next === 'garage') {
      const hash = game.getLessonHash() || location.hash;
      ui['hub-link'].setAttribute('href', '../index.html' + hash);
      ui.start.disabled = !GameData.ready() || state.vocabCount < 3;
      return;
    }
    paintStandings(state);
    write(ui.lap, state.lap + ' / ' + state.laps);
    write(ui.speed, Math.round(state.speed));
    if (next === 'countdown' && previousCountdown !== state.countdown) {
      previousCountdown = state.countdown;
      write(ui.count, state.countdown); tone(440, .12);
    }
    if (previousAttempts < state.attempts) {
      const answer = state.review[state.review.length - 1];
      if (answer.correct) { tone(740, .12); tone(990, .15, .09); }
      else tone(260, .19);
    }
    previousAttempts = state.attempts;
    paintQuestion(state.question, state.distance);
    ui['race-message'].hidden = !state.feedback;
    write(ui['race-message'], state.feedback);
    const pace = state.skid > 0 ? '打滑減速' : state.offroad ? '駛回賽道' : state.drifting ? (state.driftCharge >= 1 ? '放開煞車加速！' : '甩尾集氣 ' + Math.floor(state.driftCharge * 100) + '%') : state.boost > 0 ? '氮氣加速' : '';
    write(ui['pace-status'], pace);
    if (state.mode === 'item') paintItems(state);
  }
  document.addEventListener('kart-update', event => update(event.detail));
  update(game.getState());
})();
