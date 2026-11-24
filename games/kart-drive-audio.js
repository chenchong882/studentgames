(() => {
  'use strict';

  function create(ctx) {
    const output = ctx.createGain();
    output.connect(ctx.destination);

    function filteredVoice(type, frequency, resonance) {
      const filter = ctx.createBiquadFilter(), level = ctx.createGain();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = resonance;
      level.gain.value = 0;
      filter.connect(level); level.connect(output);
      return { filter, level };
    }
    const exhaust = filteredVoice('lowpass', 450, .7);
    const tires = filteredVoice('bandpass', 900, 2.2);
    const wind = filteredVoice('bandpass', 600, .8);

    const engine = ctx.createOscillator();
    // Unequal harmonics give each exhaust pulse a low thump and a raspy edge.
    const harmonics = new Float32Array([0, 1, .52, .71, .3, .38, .17, .19, .08, .09]);
    engine.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(harmonics.length), harmonics));
    engine.frequency.value = 42;
    engine.connect(exhaust.filter);

    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, 32000, 24000);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    noise.loop = true;
    noise.connect(tires.filter); noise.connect(wind.filter);

    const squeal = ctx.createOscillator(), squealMix = ctx.createGain();
    squeal.type = 'triangle'; squeal.frequency.value = 900;
    squealMix.gain.value = .24;
    squeal.connect(squealMix); squealMix.connect(tires.filter);
    const sources = [engine, noise, squeal];
    for (const source of sources) source.start();

    let lastTime = null, lastSpeed = 0, load = 0;
    let lastBoost = null, burstAt = -Infinity, stopped = false;
    function update(state) {
      if (stopped) return;
      const { speed, elapsed, boost, drifting, driftCharge } = state;
      const now = ctx.currentTime;
      if (lastTime !== null && elapsed > lastTime) {
        load = Math.max(-1, Math.min(1, (speed - lastSpeed) / (45 * (elapsed - lastTime))));
      }
      lastTime = elapsed; lastSpeed = speed;
      const speedRatio = Math.min(1, speed / 158);
      const throttle = Math.max(0, load);
      const flutter = Math.sin(elapsed * 16) * (1.7 - speedRatio);
      engine.frequency.setTargetAtTime(42 + speed * .95 + load * 8 + flutter, now, .085);
      exhaust.filter.frequency.setTargetAtTime(430 + speedRatio * 800 + throttle * 450 + (boost > 0 ? 300 : 0), now, .09);
      exhaust.level.gain.setTargetAtTime(.042 + speedRatio * .02 + throttle * .02, now, .065);

      const cornerLoad = drifting ? .55 + driftCharge * .45 : 0;
      const tirePitch = 720 + speedRatio * 450 + cornerLoad * 420 + Math.sin(elapsed * 22) * 32;
      squeal.frequency.setTargetAtTime(tirePitch, now, .045);
      tires.filter.frequency.setTargetAtTime(tirePitch * 1.08, now, .045);
      tires.level.gain.setTargetAtTime(cornerLoad * .25, now, drifting ? .04 : .055);

      // A new charge adds one burst. Keep the airflow continuous for its remaining duration.
      if (lastBoost !== null && boost > lastBoost) burstAt = elapsed;
      lastBoost = boost;
      const jet = state.skid > 0 ? 0 : Math.min(1, boost / .24);
      const burst = jet * Math.exp(-6 * (elapsed - burstAt));
      wind.filter.frequency.setTargetAtTime(500 + speedRatio * 460 + jet * 730 + burst * 2300, now, .04);
      wind.level.gain.setTargetAtTime(speedRatio * speedRatio * .045 + jet * .20 + burst * .22, now, .035);
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      function disconnect() {
        for (const node of [engine, noise, squeal, squealMix, exhaust.filter, exhaust.level,
          tires.filter, tires.level, wind.filter, wind.level, output]) node.disconnect();
      }
      if (ctx.state === 'running') {
        output.gain.setValueAtTime(1, now);
        output.gain.linearRampToValueAtTime(0, now + .025);
        engine.onended = disconnect;
        for (const source of sources) source.stop(now + .03);
      } else {
        for (const source of sources) source.stop();
        disconnect();
      }
    }
    return { update, stop };
  }
  window.KartDriveAudio = { create };
})();
