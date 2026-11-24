(() => {
  'use strict';

  const STEP = 10, EACH_SIDE = 20, PIXELS_PER_METRE = .225;
  const SCALE_START = Math.PI * .78, SCALE_SWEEP = Math.PI * 1.44;

  function minimap(c, state) {
    const points = [];
    points[EACH_SIDE] = { x:87, y:50 };
    // Start at the player's heading and integrate the same curvature as the road renderer in both directions.
    for (const sign of [-1, 1]) {
      let heading = 0;
      const dz = sign * STEP;
      for (let n = 1; n <= EACH_SIDE; n++) {
        const i = EACH_SIDE + sign * n, prev = points[i - sign];
        const bend = window.KartRender.curveAt(state.distance + (n - .5) * dz, state.track.id);
        heading += bend * dz * .008;
        points[i] = { x:prev.x + Math.sin(heading) * dz * PIXELS_PER_METRE,
          y:prev.y - Math.cos(heading) * dz * PIXELS_PER_METRE };
      }
    }

    c.save();
    c.fillStyle = 'rgba(12,28,42,.64)';
    c.fillRect(31, 2, 117, 96);
    c.strokeStyle = 'rgba(225,243,255,.45)'; c.lineWidth = 1;
    c.strokeRect(31.5, 2.5, 116, 95);
    c.beginPath(); c.rect(32, 3, 115, 94); c.clip();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y);
    c.strokeStyle = '#1a3449'; c.lineWidth = 12; c.stroke();
    c.strokeStyle = '#c0d5df'; c.lineWidth = 9; c.stroke();
    for (const rival of state.rivals) {
      const index = EACH_SIDE + (rival.distance - state.distance) / STEP;
      if (index < 0 || index > points.length - 1) continue;
      const k = Math.min(Math.floor(index), points.length - 2), a = points[k], b = points[k + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lateral = rival.x * 3.4 / (STEP * PIXELS_PER_METRE);
      const x = a.x + dx * (index - k) - dy * lateral, y = a.y + dy * (index - k) + dx * lateral;
      c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 2);
      c.fillStyle = rival.color; c.fill(); c.strokeStyle = '#253543'; c.lineWidth = 1.2; c.stroke();
    }
    const x = points[EACH_SIDE].x + state.x * 3.4, y = points[EACH_SIDE].y;
    c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 5, y + 5);
    c.lineTo(x, y + 3); c.lineTo(x - 5, y + 5); c.closePath();
    c.fillStyle = '#ff6a47'; c.fill(); c.strokeStyle = '#fff7e0'; c.lineWidth = 1.3; c.stroke();
    c.restore();
  }

  function speedometer(c, state) {
    const x = 84, y = 151;
    function disk(radius, color) {
      c.beginPath(); c.arc(x, y, radius, 0, 2 * Math.PI);
      c.fillStyle = color; c.fill();
    }
    const bezel = c.createLinearGradient(60, 108, 102, 193);
    bezel.addColorStop(0, '#ebf6fb'); bezel.addColorStop(.25, '#71889e');
    bezel.addColorStop(.52, '#c1ced8'); bezel.addColorStop(.76, '#52687d'); bezel.addColorStop(1, '#bac9ce');
    disk(45, '#182c3b'); disk(42.5, bezel); disk(38, '#142a3b');
    c.beginPath(); c.arc(x, y, 32, SCALE_START, SCALE_START + SCALE_SWEEP);
    c.lineWidth = 5; c.strokeStyle = '#637d92'; c.stroke();
    c.beginPath(); c.arc(x, y, 32, SCALE_START + SCALE_SWEEP * 2/3, SCALE_START + SCALE_SWEEP);
    c.strokeStyle = '#d88a47'; c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 7px Arial,sans-serif';
    for (let i = 0; i <= 18; i++) {
      const angle = SCALE_START + SCALE_SWEEP * i / 18;
      const dx = Math.cos(angle), dy = Math.sin(angle), major = i % 3 === 0;
      const inner = major ? 27 : 31;
      c.beginPath(); c.moveTo(x + dx * inner, y + dy * inner); c.lineTo(x + dx * 35, y + dy * 35);
      c.lineWidth = major ? 1.7 : 1; c.strokeStyle = '#f4f7ef'; c.stroke();
      if (i % 6 === 0) {
        c.fillStyle = '#dce8ec'; c.fillText(String(i * 10), x + dx * 22, y + dy * 22);
      }
    }
    const needle = SCALE_START + SCALE_SWEEP * Math.max(0, Math.min(1, state.speed / 180));
    c.save(); c.translate(x, y); c.rotate(needle);
    c.beginPath(); c.moveTo(31, 0); c.lineTo(-6, 2.6); c.lineTo(-6, -2.6); c.closePath();
    c.fillStyle = '#ff7354'; c.fill(); c.restore();
    disk(5, '#94adbd'); disk(3, '#2c4353');

    c.fillStyle = '#122734'; c.fillRect(72, 170, 76, 26);
    c.strokeStyle = '#adc2cc'; c.lineWidth = 1.2; c.strokeRect(72.6, 170.6, 74.8, 24.8);
    c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    c.font = 'italic bold 22px Arial,sans-serif'; c.fillStyle = state.boost > 0 ? '#ffdc71' : '#f0f8fb';
    c.fillText(String(Math.round(state.speed)), 124, 190);
    c.font = 'bold 7px Arial,sans-serif'; c.fillStyle = '#bed4dc'; c.fillText('km/h', 145, 190);
  }

  function draw(canvas, state) {
    const c = canvas.getContext('2d');
    if (!c) return;
    c.save();
    c.setTransform(canvas.width / 150, 0, 0, canvas.height / 200, 0, 0);
    c.clearRect(0, 0, 150, 200);
    minimap(c, state); speedometer(c, state);
    c.restore();
  }

  window.KartDash = { draw };
})();
