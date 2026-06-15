'use strict';

// ══════════════════════════════════════════
//  CANVAS & RESIZE
// ══════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let W = 0, H = 0;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  W = Math.max(1, Math.round(rect.width || window.innerWidth));
  H = Math.max(1, Math.round(rect.height || window.innerHeight));
  
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  
  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  const controlY = Math.min(H * 0.80, H - Math.max(78, H * 0.14));
  if (joystick)    { joystick.baseX = W * 0.14; joystick.baseY = controlY; joystick.r = clamp(Math.min(W, H) * 0.105, 54, 84); joystick.reset(); }
  if (bombButton)  { bombButton.cx  = W * 0.86; bombButton.cy  = controlY; bombButton.r = clamp(Math.min(W, H) * 0.098, 52, 80); }
}
window.addEventListener('resize', () => {
  resizeCanvas();
  setTimeout(resizeCanvas, 100);
  setTimeout(resizeCanvas, 300);
});
window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvas, 100);
  setTimeout(resizeCanvas, 300);
  setTimeout(resizeCanvas, 500);
});

// ══════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════
const CFG = {
  GRAVITY:           0.22,
  PLANE_MAX_SPD:     5.5,
  PLANE_MIN_SPD:     2.2,
  PLANE_ACCEL:       0.28,
  PLANE_DAMP:        0.94,
  JOYSTICK_R:        58,
  BOMB_BTN_R:        54,
  GROUND_RATIO:      0.86, // keep the ground low so the plane has more room to fly
  LIVES:             3,
  WRONG_PENALTY_S:   5,    // seconds added on wrong hit
  MISSILE_SPD:       3.2,
  MISSILE_TURN:      0.045,
  TRAJ_STEPS_EASY:   35,
  TRAJ_STEPS_HARD:   18,
  BOMBS_PER_LEVEL:   6,    // bombs available per level
};

// ══════════════════════════════════════════
//  LEVEL DATA
// ══════════════════════════════════════════
const DEFAULT_LEVELS = [
  { id:1, themeEN:'Animals',    themeZH:'🐾 動物',    skyTop:'#1565c0', skyBot:'#42a5f5', groundTop:'#66bb6a', words:['cat','dog','pig','hen','cow']   },
  { id:2, themeEN:'Colors',     themeZH:'🎨 顏色',    skyTop:'#4a148c', skyBot:'#ab47bc', groundTop:'#8bc34a', words:['red','blue','green','pink','black'] },
  { id:3, themeEN:'Numbers',    themeZH:'🔢 數字',    skyTop:'#e65100', skyBot:'#ffa726', groundTop:'#4db6ac', words:['one','two','three','four','five'] },
  { id:4, themeEN:'Body Parts', themeZH:'🧍 身體',    skyTop:'#880e4f', skyBot:'#ef9a9a', groundTop:'#aed581', words:['eye','ear','nose','hand','foot'] },
  { id:5, themeEN:'Food',       themeZH:'🍎 食物',    skyTop:'#1a237e', skyBot:'#7986cb', groundTop:'#ffcc80', words:['rice','milk','cake','fish','egg']  },
];
let LEVELS = DEFAULT_LEVELS.map(level => ({ ...level, words: [...level.words] }));
let bombLessonTitle = '示範題庫';

const LESSON_LEVEL_COLORS = [
  { skyTop:'#1565c0', skyBot:'#42a5f5', groundTop:'#66bb6a' },
  { skyTop:'#4a148c', skyBot:'#ab47bc', groundTop:'#8bc34a' },
  { skyTop:'#e65100', skyBot:'#ffa726', groundTop:'#4db6ac' },
  { skyTop:'#00695c', skyBot:'#26a69a', groundTop:'#9ccc65' },
  { skyTop:'#283593', skyBot:'#5c6bc0', groundTop:'#ffb74d' },
  { skyTop:'#ad1457', skyBot:'#ec407a', groundTop:'#80cbc4' },
];

function getLessonWord(entry) {
  return String(entry?.word || entry?.phrase || '').trim();
}

function normalizeBombWords(words) {
  const seen = new Set();
  return (words || [])
    .map(getLessonWord)
    .filter(Boolean)
    .filter(word => word.length <= 18)
    .filter(word => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function chunkWords(words, size) {
  const chunks = [];
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size));
  return chunks;
}

function applyBombData(payload) {
  const words = normalizeBombWords(payload?.words);
  if (words.length === 0) {
    LEVELS = DEFAULT_LEVELS.map(level => ({ ...level, words: [...level.words] }));
    bombLessonTitle = '示範題庫';
  } else {
    bombLessonTitle = payload?.unitTitle || payload?.title || '目前課程';
    LEVELS = chunkWords(words, 5).map((chunk, index) => ({
      id: index + 1,
      themeEN: bombLessonTitle,
      themeZH: `💣 ${bombLessonTitle} ${index + 1}`,
      ...LESSON_LEVEL_COLORS[index % LESSON_LEVEL_COLORS.length],
      words: chunk,
    }));
  }

  if (typeof game !== 'undefined') {
    clearInterval(game._timerInterval);
    game = new Game();
    resizeCanvas();
  }

  const statusEl = document.getElementById('bomb-data-status');
  if (statusEl) statusEl.textContent = `${bombLessonTitle}:${LEVELS.reduce((sum, level) => sum + level.words.length, 0)}`;
}

function readLessonDataFromHash() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const raw = params.get('lessonData');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

// ══════════════════════════════════════════
//  AUDIO
// ══════════════════════════════════════════
const Audio = (() => {
  let ctx = null;
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function noise(dur, vol = 0.5) {
    ensure();
    const len = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, 1.5);
    const src  = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    src.connect(gain); gain.connect(ctx.destination); src.start();
  }

  function tone(freq, dur, type='sine', vol=0.3, detune=0) {
    ensure();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = type;
    osc.frequency.value = freq;
    osc.detune.value    = detune;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + dur);
  }

  return {
    init: ensure,
    speak(word) {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(word);
      u.lang  = 'en-US';
      u.rate  = 0.88;
      u.pitch = 1.1;
      // Prefer a US voice if available
      const voices = speechSynthesis.getVoices();
      const us = voices.find(v => v.lang === 'en-US' && !v.name.includes('Google') === false)
              || voices.find(v => v.lang === 'en-US')
              || voices.find(v => v.lang.startsWith('en'));
      if (us) u.voice = us;
      speechSynthesis.speak(u);
    },
    explosion()    { noise(0.55, 0.6); tone(80, 0.4, 'sawtooth', 0.15); },
    bombDrop()     { tone(300, 0.12, 'sine', 0.2); },
    wrong()        { tone(180, 0.5, 'sawtooth', 0.25); },
    success()      { [660,880,1100].forEach((f,i) => setTimeout(()=>tone(f,0.18,'sine',0.25), i*120)); },
    levelClear()   { [660,784,880,1046].forEach((f,i) => setTimeout(()=>tone(f,0.22,'sine',0.3), i*130)); },
    missile()      { tone(440, 0.25, 'square', 0.2); tone(360, 0.35, 'sawtooth', 0.1, -200); },
    hit()          { noise(0.3, 0.4); tone(120, 0.3, 'sawtooth', 0.2); },
  };
})();

// ══════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x+r, y);
  c.lineTo(x+w-r, y); c.quadraticCurveTo(x+w, y,   x+w, y+r);
  c.lineTo(x+w, y+h-r); c.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  c.lineTo(x+r, y+h); c.quadraticCurveTo(x,   y+h, x, y+h-r);
  c.lineTo(x, y+r); c.quadraticCurveTo(x,   y,   x+r, y);
  c.closePath();
}

function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { return Math.hypot(bx-ax, by-ay); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

// ══════════════════════════════════════════
//  PLANE
// ══════════════════════════════════════════
class Plane {
  constructor() {
    this.x = 0; this.y = 0;
    this.vx = CFG.PLANE_MIN_SPD; this.vy = 0;
    this.angle = 0;
    this.shaking = 0;
    this.invincible = 0;
    this.hidden = false;
    this.trail = [];
    this.trailMax = 30;
  }

  reset() {
    this.x = W * 0.18; this.y = H * 0.32;
    this.vx = CFG.PLANE_MIN_SPD; this.vy = 0;
    this.angle = 0; this.shaking = 0; this.invincible = 0;
    this.hidden = false;
    this.trail = [];
  }

  respawnFromSky() {
    this.x = W * 0.18;
    this.y = 44;
    this.vx = CFG.PLANE_MIN_SPD;
    this.vy = 1.2;
    this.angle = 0.25;
    this.shaking = 0;
    this.hidden = false;
    this.trail = [];
  }

  update(joy) {
    if (this.hidden) return null;

    let hitGround = false;

    // Joystick points the plane's flight direction, including turning back left.
    const joyPower = joy.active ? clamp(Math.hypot(joy.dx, joy.dy), 0, 1) : 0;
    const cruiseSpd = clamp(W / 330, CFG.PLANE_MIN_SPD, 3.45);
    const steerSpd = lerp(CFG.PLANE_MIN_SPD, CFG.PLANE_MAX_SPD, joyPower);
    const targetVx = joy.active && joyPower > 0.08 ? joy.dx * steerSpd : cruiseSpd;
    const targetVy = joy.active && joyPower > 0.08 ? joy.dy * steerSpd : 0;

    this.vx += (targetVx - this.vx) * 0.16;
    this.vy += (targetVy - this.vy) * 0.18;
    if (!joy.active && Math.abs(this.vy) < 0.06) this.vy = 0;

    this.x += this.vx;
    this.y += this.vy;

    // Point the nose into the current flight direction.
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 0.18) {
      this.angle = lerpAngle(this.angle, Math.atan2(this.vy, this.vx), 0.18);
    }

    // Bounds
    const gY = H * CFG.GROUND_RATIO;
    const topLimit = 24;
    const botLimit = gY - 24;
    if (this.y < topLimit)  { this.y = topLimit;  this.vy = Math.max(0, this.vy); }
    if (this.y > botLimit)  {
      hitGround = this.invincible === 0;
      this.y = botLimit;
      this.vy = hitGround ? -clamp(Math.abs(this.vy) * 0.75, 2.6, 4.8) : Math.min(0, this.vy);
    }
    if (this.x >  W + 70) { this.x = -70; this.trail = []; }
    if (this.x < -70)     { this.x =  W + 70; this.trail = []; }

    // Trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailMax) this.trail.shift();

    if (this.shaking  > 0) this.shaking--;
    if (this.invincible>0) this.invincible--;

    return hitGround ? 'ground' : null;
  }

  shake() { this.shaking = 18; }

  getBounds() { return { x: this.x-28, y: this.y-12, w: 56, h: 24 }; }

  draw(c) {
    if (this.hidden) return;

    // Trail arc (white dashed line like reference)
    if (this.trail.length > 3) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.32)';
      c.lineWidth = 2;
      c.setLineDash([]);
      c.beginPath();
      c.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) c.lineTo(this.trail[i].x, this.trail[i].y);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }

    // Blink when invincible
    if (this.invincible > 0 && Math.floor(this.invincible / 5) % 2 === 1) return;

    c.save();
    const sx = this.shaking > 0 ? (Math.random()-0.5)*7 : 0;
    c.translate(this.x + sx, this.y);
    c.rotate(this.angle);
    c.scale(0.78, 0.78);

    // Fuselage
    c.fillStyle = '#3d5a3e';
    c.beginPath(); c.ellipse(0, 0, 40, 11, 0, 0, Math.PI*2); c.fill();

    // Cockpit glass
    c.fillStyle = '#78c4f0';
    c.beginPath(); c.ellipse(20, -4, 11, 7, -0.25, 0, Math.PI*2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(18, -6, 5, 3, -0.25, 0, Math.PI*2); c.fill();

    // Main wings
    c.fillStyle = '#4a6741';
    c.beginPath();
    c.moveTo(-8, 2); c.lineTo(-18, -24); c.lineTo(14, -22); c.lineTo(20, 2);
    c.closePath(); c.fill();

    // Wing stripe
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.moveTo(-2, 0); c.lineTo(-10, -18); c.lineTo(6, -18); c.lineTo(10, 0);
    c.closePath(); c.fill();

    // Tail fin
    c.fillStyle = '#4a6741';
    c.beginPath();
    c.moveTo(-32, -2); c.lineTo(-42, -18); c.lineTo(-22, -2);
    c.closePath(); c.fill();

    // Horizontal stabilizers
    c.fillStyle = '#3d5a3e';
    c.beginPath();
    c.moveTo(-38, 0); c.lineTo(-30, -10); c.lineTo(-20, 0);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(-38, 0); c.lineTo(-30, 10); c.lineTo(-20, 0);
    c.closePath(); c.fill();

    // Engines (2 under wings)
    [-12, 6].forEach(ex => {
      c.fillStyle = '#2a3d2b';
      c.beginPath(); c.ellipse(ex, 14, 7, 4, 0, 0, Math.PI*2); c.fill();
      // Exhaust
      c.fillStyle = `rgba(255,${120+Math.random()*60},0,0.8)`;
      c.beginPath(); c.ellipse(ex-7, 14, 5, 3, 0, 0, Math.PI*2); c.fill();
    });

    c.restore();
  }
}

// ══════════════════════════════════════════
//  BOMB
// ══════════════════════════════════════════
class Bomb {
  constructor(px, py, pvx, pvy) {
    this.x   = px; this.y   = py;
    this.vx  = pvx * 0.55;
    this.vy  = pvy + 0.4;
    this.active = true;
    this.trail  = [];
    this.spin   = 0;
  }

  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 22) this.trail.shift();
    this.vy += CFG.GRAVITY;
    this.x  += this.vx;
    this.y  += this.vy;
    this.spin += 0.14;
    const gY = H * CFG.GROUND_RATIO;
    if (this.y > gY || this.x < -60 || this.x > W+60) { this.active = false; return 'ground'; }
  }

  getBounds() { return { x: this.x-11, y: this.y-16, w: 22, h: 32 }; }

  draw(c) {
    // Trail
    for (let i = 1; i < this.trail.length; i++) {
      const a = (i / this.trail.length) * 0.55;
      c.fillStyle = `rgba(255,160,40,${a})`;
      c.beginPath(); c.arc(this.trail[i].x, this.trail[i].y, 3*(i/this.trail.length), 0, Math.PI*2); c.fill();
    }
    c.save();
    c.translate(this.x, this.y); c.rotate(this.spin);

    // Body gradient
    const g = c.createRadialGradient(-3, -4, 2, 0, 0, 14);
    g.addColorStop(0, '#666'); g.addColorStop(1, '#111');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(0, 2, 11, 15, 0, 0, Math.PI*2); c.fill();

    // Shine
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath(); c.ellipse(-3, -4, 4, 6, -0.4, 0, Math.PI*2); c.fill();

    // Fins
    c.fillStyle = '#333';
    [[1,1],[-1,1],[1,-1],[-1,-1]].forEach(([sx]) => {
      c.beginPath(); c.moveTo(sx*2,13); c.lineTo(sx*11,18); c.lineTo(sx*8,13); c.closePath(); c.fill();
    });
    c.restore();

    // Fuse spark
    const sparkColor = Date.now()%500<250 ? '#FFD700' : '#FF6600';
    c.fillStyle = sparkColor;
    c.beginPath(); c.arc(this.x + Math.sin(this.spin*2)*2, this.y-16, 3.5, 0, Math.PI*2); c.fill();
  }
}

// ══════════════════════════════════════════
//  HOUSE
// ══════════════════════════════════════════
const HOUSE_PALETTE = [
  { wall:'#e57373', roof:'#b71c1c', win:'rgba(255,240,140,0.9)' },
  { wall:'#64b5f6', roof:'#1565c0', win:'rgba(255,240,140,0.9)' },
  { wall:'#81c784', roof:'#2e7d32', win:'rgba(255,240,140,0.9)' },
  { wall:'#ffb74d', roof:'#e65100', win:'rgba(255,240,140,0.9)' },
  { wall:'#ce93d8', roof:'#6a1b9a', win:'rgba(255,240,140,0.9)' },
];

class House {
  constructor(x, groundY, word, index) {
    this.x = x; this.groundY = groundY;
    this.word = word; this.index = index;
    this.floors = 1 + Math.floor(Math.random()*2);
    this.width  = 42 + Math.random()*14;
    this.floorH = 23;
    this.roofH  = 17;
    this.height = this.floors * this.floorH + this.roofH;
    this.y = groundY - this.height;
    this.pal = HOUSE_PALETTE[index % HOUSE_PALETTE.length];

    this.destroyed   = false;
    this.destroyT    = 0;
    this.shaking     = 0;
    this.hintFlash   = 0;
    this.wrongFlash  = 0;
    this.wrongBubble = 0;
    this.alpha       = 1;
    this.sinkY       = 0;
  }

  checkHit(b) {
    const bb = b.getBounds();
    return bb.x < this.x+this.width/2 && bb.x+bb.w > this.x-this.width/2 &&
           bb.y < this.groundY        && bb.y+bb.h > this.y - this.sinkY;
  }

  update() {
    if (this.destroyed) {
      this.sinkY += 2.5;
      this.alpha  = Math.max(0, this.alpha - 0.025);
    }
    if (this.shaking   > 0) this.shaking   -= 0.25;
    if (this.hintFlash > 0) this.hintFlash--;
    if (this.wrongFlash> 0) this.wrongFlash--;
    if (this.wrongBubble>0) this.wrongBubble--;
  }

  draw(c, isTarget) {
    if (this.alpha <= 0) return;
    c.save();
    c.globalAlpha = this.alpha;

    const shk = this.shaking > 0 ? Math.sin(this.shaking * 2.5) * 5 : 0;
    c.translate(shk, this.sinkY);

    const bx = this.x - this.width/2;
    const by = this.y;

    // Floors
    for (let f = 0; f < this.floors; f++) {
      const fy = by + this.roofH + f * this.floorH;
      c.fillStyle = this.pal.wall;
      c.fillRect(bx, fy, this.width, this.floorH);
      // Floor line
      if (f > 0) {
        c.strokeStyle = 'rgba(0,0,0,0.15)';
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(bx, fy); c.lineTo(bx+this.width, fy); c.stroke();
      }
      // Windows
      const winN = Math.max(1, Math.floor(this.width / 22));
      for (let w = 0; w < winN; w++) {
        const wx = bx + 8 + w * ((this.width - 16) / winN);
        const wy = fy + 7;
        c.fillStyle = this.pal.win;
        c.fillRect(wx, wy, 12, 13);
        c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 1;
        c.strokeRect(wx, wy, 12, 13);
      }
    }

    // Roof
    c.fillStyle = this.pal.roof;
    c.beginPath();
    c.moveTo(bx - 4,         by + this.roofH);
    c.lineTo(this.x,          by);
    c.lineTo(bx + this.width + 4, by + this.roofH);
    c.closePath(); c.fill();

    // Chimney
    if (this.index % 2 === 0) {
      c.fillStyle = this.pal.roof;
      c.fillRect(this.x + 9, by - 11, 9, 15);
    }

    // ── Word label ──
    const isHinted = this.hintFlash > 0;
    const isWrong  = this.wrongFlash > 0;
    const lY  = by - 18; // drawn closer to the smaller roof
    const fontSize = isTarget ? 16 : 13;
    c.font = `bold ${fontSize}px 'Arial Rounded MT Bold', Arial`;
    const tw  = c.measureText(this.word).width;
    const pad = 9;
    const lw  = tw + pad * 2;
    const lh  = 24;
    const lx  = this.x - lw/2;
    const ly  = lY - lh/2;

    // Glow / flash
    if (isTarget) {
      const p = 0.6 + 0.4 * Math.sin(Date.now()/280);
      c.shadowColor = '#FFD700'; c.shadowBlur = 18 * p;
    } else if (isHinted) {
      c.shadowColor = '#00FF88'; c.shadowBlur = 22;
    } else if (isWrong) {
      c.shadowColor = '#FF3333'; c.shadowBlur = 20;
    }

    c.fillStyle = isTarget ? 'rgba(255,225,50,0.95)'
                : isHinted ? 'rgba(100,255,150,0.92)'
                : isWrong  ? 'rgba(255,120,120,0.92)'
                :            'rgba(255,255,255,0.92)';
    roundRect(c, lx, ly, lw, lh, 8);
    c.fill();

    if (isTarget) { c.strokeStyle = '#FF8800'; c.lineWidth = 2.2; c.stroke(); }

    c.shadowBlur = 0;
    c.fillStyle  = '#111';
    c.textAlign  = 'center';
    c.textBaseline = 'middle';
    c.fillText(this.word, this.x, lY);

    // Wrong bubble
    if (this.wrongBubble > 0) {
      const bub_a = Math.min(1, this.wrongBubble / 20);
      c.save();
      c.globalAlpha = bub_a;
      c.fillStyle = 'rgba(255,60,60,0.92)';
      roundRect(c, this.x - 40, lY - 40, 80, 24, 8);
      c.fill();
      c.fillStyle = 'white'; c.font = 'bold 13px Arial';
      c.fillText('❌ Wrong!', this.x, lY - 29);
      c.restore();
    }

    c.restore();
  }
}

// ══════════════════════════════════════════
//  EXPLOSION
// ══════════════════════════════════════════
class Explosion {
  constructor(x, y, big = false) {
    this.x = x; this.y = y; this.done = false;
    this.shockR = 0; this.shockMax = big ? 110 : 65; this.shockA = 1;
    this.pts = [];
    const n = big ? 55 : 32;
    const cols = ['#FF4500','#FF6600','#FF8C00','#FFD700','#FF0000','#FFF','#FFAA00'];
    for (let i = 0; i < n; i++) {
      const a = Math.random()*Math.PI*2, spd = (big?4:2)+Math.random()*(big?9:6);
      this.pts.push({
        x, y, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd - (big?4:2),
        life:1, sz: (big?5:3)+Math.random()*(big?10:6),
        col: cols[Math.floor(Math.random()*cols.length)], g: 0.14+Math.random()*0.12
      });
    }
    // Debris
    for (let i = 0; i < (big?18:8); i++) {
      const a = Math.random()*Math.PI*2, spd = 1+Math.random()*4;
      this.pts.push({ x, y, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd-2, life:1, sz:2+Math.random()*4, col:'#555', g:0.22, debris:true });
    }
  }
  update() {
    this.pts.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.life-=0.028; });
    this.pts = this.pts.filter(p => p.life > 0);
    this.shockR += 9; this.shockA = Math.max(0, 1 - this.shockR/this.shockMax);
    if (this.pts.length === 0) this.done = true;
  }
  draw(c) {
    if (this.shockA > 0) {
      c.save(); c.globalAlpha = this.shockA * 0.5;
      c.strokeStyle = '#FF8C00'; c.lineWidth = 3;
      c.beginPath(); c.arc(this.x, this.y, this.shockR, 0, Math.PI*2); c.stroke();
      c.restore();
    }
    this.pts.forEach(p => {
      c.save(); c.globalAlpha = p.life;
      if (p.debris) {
        c.fillStyle = p.col; c.fillRect(p.x-p.sz/2, p.y-p.sz/2, p.sz, p.sz);
      } else {
        const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.sz*p.life);
        gr.addColorStop(0,'white'); gr.addColorStop(0.3, p.col); gr.addColorStop(1,'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.beginPath(); c.arc(p.x, p.y, p.sz*p.life, 0, Math.PI*2); c.fill();
      }
      c.restore();
    });
  }
}

// ══════════════════════════════════════════
//  MISSILE
// ══════════════════════════════════════════
class Missile {
  constructor(hx, hy, plane) {
    this.x = hx; this.y = hy;
    this.plane = plane;
    this.vx = (Math.random()-0.5)*2; this.vy = -2.5;
    this.angle = -Math.PI/2;
    this.active = true;
    this.life = 280;
    this.smoke = [];
    this.warningShown = false;
  }
  update() {
    const dx = this.plane.x - this.x, dy = this.plane.y - this.y;
    const d  = Math.hypot(dx, dy) || 1;
    const tvx = dx/d * CFG.MISSILE_SPD, tvy = dy/d * CFG.MISSILE_SPD;
    this.vx += (tvx - this.vx) * CFG.MISSILE_TURN;
    this.vy += (tvy - this.vy) * CFG.MISSILE_TURN;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > CFG.MISSILE_SPD) { this.vx=this.vx/spd*CFG.MISSILE_SPD; this.vy=this.vy/spd*CFG.MISSILE_SPD; }
    this.x += this.vx; this.y += this.vy;
    this.angle = Math.atan2(this.vy, this.vx);
    this.smoke.push({ x:this.x, y:this.y, life:1, sz: 4+Math.random()*4 });
    if (this.smoke.length > 35) this.smoke.shift();
    this.smoke.forEach(s => { s.life -= 0.04; s.sz *= 1.04; });
    this.life--;
    if (this.life <= 0) { this.active = false; return; }
    if (dist(this.x, this.y, this.plane.x, this.plane.y) < 28 && this.plane.invincible === 0) {
      this.active = false; return 'hit';
    }
  }
  draw(c) {
    this.smoke.forEach(s => {
      c.save(); c.globalAlpha = s.life * 0.4;
      c.fillStyle = '#bbb'; c.beginPath(); c.arc(s.x, s.y, s.sz, 0, Math.PI*2); c.fill();
      c.restore();
    });
    c.save(); c.translate(this.x, this.y); c.rotate(this.angle);
    // Body
    c.fillStyle = '#dd3333'; c.beginPath(); c.ellipse(0,0,15,4,0,0,Math.PI*2); c.fill();
    // Nose
    c.fillStyle = '#991111'; c.beginPath(); c.moveTo(15,0); c.lineTo(22,0); c.lineTo(15,-3); c.closePath(); c.fill();
    // Fins
    c.fillStyle = '#bb2222';
    [[-1,1],[-1,-1]].forEach(([,sy]) => {
      c.beginPath(); c.moveTo(-10,0); c.lineTo(-17,sy*9); c.lineTo(-10,sy*4); c.closePath(); c.fill();
    });
    // Exhaust flame
    c.fillStyle = `rgba(255,${100+Math.random()*100},0,0.85)`;
    c.beginPath(); c.ellipse(-18,0,9,3.5,0,0,Math.PI*2); c.fill();
    c.restore();
  }
}

// ══════════════════════════════════════════
//  FLOATING TEXT
// ══════════════════════════════════════════
class FloatText {
  constructor(x, y, text, color, size=22) {
    this.x=x; this.y=y; this.text=text; this.color=color; this.sz=size;
    this.alpha=1; this.vy=-1.8; this.life=65;
  }
  update() { this.y+=this.vy; this.vy*=0.97; this.life--; this.alpha=this.life/65; }
  draw(c) {
    c.save(); c.globalAlpha=this.alpha;
    c.fillStyle=this.color; c.font=`bold ${this.sz}px Arial`;
    c.textAlign='center'; c.textBaseline='middle';
    c.shadowColor='rgba(0,0,0,0.6)'; c.shadowBlur=4;
    c.fillText(this.text, this.x, this.y);
    c.restore();
  }
}

// ══════════════════════════════════════════
//  TREE (scenery)
// ══════════════════════════════════════════
class Tree {
  constructor(x, groundY) {
    this.x = x; this.groundY = groundY;
    this.h = 35 + Math.random() * 30;
    this.w = 22 + Math.random() * 16;
    this.shade = Math.floor(Math.random()*3);
  }
  draw(c) {
    const cols = ['#388E3C','#43A047','#2E7D32'];
    c.fillStyle = '#5D4037';
    c.fillRect(this.x - 4, this.groundY - this.h * 0.45, 8, this.h * 0.45);
    c.fillStyle = cols[this.shade];
    c.beginPath();
    c.arc(this.x, this.groundY - this.h * 0.55, this.w, 0, Math.PI*2);
    c.fill();
  }
}

// ══════════════════════════════════════════
//  VIRTUAL JOYSTICK
// ══════════════════════════════════════════
class VirtualJoystick {
  constructor() {
    this.baseX=0; this.baseY=0; this.r=CFG.JOYSTICK_R;
    this.knobX=0; this.knobY=0;
    this.active=false; this.tid=null;
    this.dx=0; this.dy=0; this.angle=0;
  }
  reset() { this.active=false; this.tid=null; this.dx=0; this.dy=0; this.knobX=this.baseX; this.knobY=this.baseY; }
  tryStart(t) {
    if (dist(t.clientX, t.clientY, this.baseX, this.baseY) < this.r*2) {
      this.active=true; this.tid=t.identifier;
      this.knobX=t.clientX; this.knobY=t.clientY;
    }
  }
  move(t) {
    if (t.identifier !== this.tid) return;
    const dx=t.clientX-this.baseX, dy=t.clientY-this.baseY;
    const d=Math.hypot(dx,dy), max=this.r*0.72;
    if (d > max) { const f=max/d; this.knobX=this.baseX+dx*f; this.knobY=this.baseY+dy*f; this.dx=dx/d; this.dy=dy/d; }
    else { this.knobX=t.clientX; this.knobY=t.clientY; this.dx=dx/max; this.dy=dy/max; }
    this.angle = Math.atan2(this.dy, this.dx);
  }
  end(t) { if (t.identifier===this.tid) { this.reset(); this.knobX=this.baseX; this.knobY=this.baseY; } }

  draw(c) {
    c.save();
    c.globalAlpha = 0.72;

    // Outer glow ring fill
    const g = c.createRadialGradient(this.baseX, this.baseY, this.r*0.35, this.baseX, this.baseY, this.r);
    g.addColorStop(0,'rgba(0,220,255,0.10)'); g.addColorStop(1,'rgba(0,220,255,0.28)');
    c.fillStyle = g;
    c.beginPath(); c.arc(this.baseX, this.baseY, this.r, 0, Math.PI*2); c.fill();

    // Outer ring border
    c.strokeStyle = 'rgba(0,230,255,0.88)'; c.lineWidth = 3.5;
    c.beginPath(); c.arc(this.baseX, this.baseY, this.r, 0, Math.PI*2); c.stroke();

    // Key + arrow icon (matches reference image)
    c.save(); c.translate(this.baseX, this.baseY);
    if (this.active) c.rotate(this.angle);
    c.fillStyle = 'rgba(255,255,255,0.88)';
    c.strokeStyle = 'rgba(255,255,255,0.88)'; c.lineWidth = 3; c.lineCap = 'round';

    // Key ring
    c.beginPath(); c.arc(-8, 0, 9, 0, Math.PI*2); c.stroke();
    // Key shaft
    c.beginPath(); c.moveTo(0, 0); c.lineTo(18, 0); c.stroke();
    // Key teeth
    c.beginPath(); c.moveTo(12, 0); c.lineTo(12, 6); c.stroke();
    c.beginPath(); c.moveTo(7, 0); c.lineTo(7, 5); c.stroke();
    // Arrow head
    c.beginPath(); c.moveTo(14, -8); c.lineTo(24, 0); c.lineTo(14, 8); c.closePath(); c.fill();
    c.restore();

    // Knob (when dragging)
    if (this.active) {
      const kg = c.createRadialGradient(this.knobX-4, this.knobY-4, 4, this.knobX, this.knobY, this.r*0.38);
      kg.addColorStop(0,'rgba(130,240,255,0.95)'); kg.addColorStop(1,'rgba(0,200,255,0.75)');
      c.fillStyle = kg;
      c.beginPath(); c.arc(this.knobX, this.knobY, this.r*0.38, 0, Math.PI*2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
      c.beginPath(); c.arc(this.knobX, this.knobY, this.r*0.38, 0, Math.PI*2); c.stroke();
    }
    c.restore();
  }
}

// ══════════════════════════════════════════
//  BOMB BUTTON
// ══════════════════════════════════════════
class BombButton {
  constructor() { this.cx=0; this.cy=0; this.r=CFG.BOMB_BTN_R; this.tid=null; this.pressed=0; this.cooldown=0; }
  tryPress(t) {
    if (this.cooldown>0) return false;
    if (dist(t.clientX, t.clientY, this.cx, this.cy) < this.r*1.3) {
      this.tid=t.identifier; this.pressed=12; this.cooldown=18; return true;
    }
    return false;
  }
  release(t) { if (t.identifier===this.tid) this.pressed=0; }
  update() { if (this.pressed>0) this.pressed--; if (this.cooldown>0) this.cooldown--; }
  draw(c) {
    const sc = this.pressed>0 ? 0.90 : 1;
    c.save(); c.translate(this.cx, this.cy); c.scale(sc, sc);
    c.globalAlpha = 0.75;

    // Outer ring fill (translucent)
    const g = c.createRadialGradient(0,0,this.r*0.35, 0,0,this.r);
    g.addColorStop(0,'rgba(0,220,255,0.10)'); g.addColorStop(1,'rgba(0,220,255,0.30)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0,0,this.r,0,Math.PI*2); c.fill();

    // Cyan outer ring border
    c.strokeStyle='rgba(0,230,255,0.92)'; c.lineWidth=4;
    c.beginPath(); c.arc(0,0,this.r,0,Math.PI*2); c.stroke();

    // Green inner circle (like reference)
    c.fillStyle = 'rgba(50,180,80,0.70)';
    c.beginPath(); c.arc(0,0,this.r*0.72,0,Math.PI*2); c.fill();

    // Inner ring border
    c.strokeStyle='rgba(0,230,255,0.60)'; c.lineWidth=2;
    c.beginPath(); c.arc(0,0,this.r*0.72,0,Math.PI*2); c.stroke();

    // Bomb icon (solid white, larger)
    c.fillStyle='rgba(255,255,255,0.96)';
    c.beginPath(); c.ellipse(0,5,17,22,0,0,Math.PI*2); c.fill();

    // Fuse
    c.strokeStyle='rgba(255,255,255,0.95)'; c.lineWidth=3; c.lineCap='round';
    c.beginPath(); c.moveTo(0,-17); c.quadraticCurveTo(13,-26,9,-36); c.stroke();

    // Spark
    const sk = Date.now()%500<250 ? '#FFD700':'#FF6600';
    c.fillStyle=sk;
    c.beginPath(); c.arc(9,-36,5,0,Math.PI*2); c.fill();

    c.restore();
  }
}

// ══════════════════════════════════════════
//  BACKGROUND
// ══════════════════════════════════════════
let cloudT = 0;
const cloudDefs = Array.from({length:7}, () => ({
  x: Math.random()*1400, y: 25+Math.random()*90,
  sz: 45+Math.random()*60, spd: 0.18+Math.random()*0.25
}));

function drawBackground(c, level) {
  const gY = H * CFG.GROUND_RATIO;

  // Sky
  const sky = c.createLinearGradient(0, 0, 0, gY);
  sky.addColorStop(0, level.skyTop);
  sky.addColorStop(1, level.skyBot);
  c.fillStyle = sky; c.fillRect(0, 0, W, gY);

  // Clouds
  cloudT += 0.25;
  cloudDefs.forEach(cl => {
    const cx = ((cl.x + cloudT*cl.spd) % (W+250)) - 125;
    c.save(); c.fillStyle = 'rgba(255,255,255,0.82)';
    c.beginPath();
    c.arc(cx, cl.y, cl.sz*0.52, 0, Math.PI*2);
    c.arc(cx+cl.sz*0.42, cl.y-cl.sz*0.1, cl.sz*0.4, 0, Math.PI*2);
    c.arc(cx-cl.sz*0.38, cl.y+cl.sz*0.05, cl.sz*0.34, 0, Math.PI*2);
    c.arc(cx+cl.sz*0.78, cl.y+cl.sz*0.06, cl.sz*0.28, 0, Math.PI*2);
    c.fill(); c.restore();
  });

  // Distant hills
  c.fillStyle = level.groundTop + 'aa';
  c.beginPath(); c.moveTo(0, gY);
  for (let x = 0; x <= W; x += 60) c.lineTo(x, gY - 14 - Math.sin(x*0.018+0.7)*16);
  c.lineTo(W, gY); c.closePath(); c.fill();

  // Ground
  const gr = c.createLinearGradient(0, gY, 0, H);
  gr.addColorStop(0, level.groundTop); gr.addColorStop(0.4, '#388E3C'); gr.addColorStop(1, '#2E7D32');
  c.fillStyle = gr; c.fillRect(0, gY, W, H-gY);

  // Ground edge highlight
  c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(0, gY, W, 3);
}

// ══════════════════════════════════════════
//  TRAJECTORY PREVIEW
// ══════════════════════════════════════════
function drawTrajectory(c, plane, difficulty) {
  const steps  = difficulty==='easy' ? CFG.TRAJ_STEPS_EASY : CFG.TRAJ_STEPS_HARD;
  const alpha  = difficulty==='easy' ? 0.72 : 0.40;
  const gY     = H * CFG.GROUND_RATIO;
  let px=plane.x, py=plane.y, pvx=plane.vx*0.55, pvy=plane.vy+0.4;

  c.save();
  c.strokeStyle=`rgba(255,255,80,${alpha})`; c.lineWidth=2; c.setLineDash([6,5]);
  c.beginPath(); c.moveTo(px, py);
  let lx=px, ly=py;
  for (let i=0; i<steps; i++) {
    pvy+=CFG.GRAVITY; px+=pvx; py+=pvy;
    if (py>gY) break;
    c.lineTo(px, py); lx=px; ly=py;
  }
  c.stroke(); c.setLineDash([]);

  // Landing marker
  c.strokeStyle=`rgba(255,100,80,${alpha})`; c.lineWidth=2.5;
  c.beginPath(); c.moveTo(lx-9,ly-9); c.lineTo(lx+9,ly+9);
  c.moveTo(lx+9,ly-9); c.lineTo(lx-9,ly+9); c.stroke();
  c.restore();
}

// ══════════════════════════════════════════
//  HUD
// ══════════════════════════════════════════
function drawHUD(c, game) {
  c.save();

  // ── Top bar background ──
  c.fillStyle='rgba(0,0,0,0.40)'; c.fillRect(0,0,W,50);

  // ── LEFT: Pause button ──
  const pbtnX=14, pbtnY=9, pbtnW=34, pbtnH=34;
  c.fillStyle='rgba(255,255,255,0.15)';
  roundRect(c,pbtnX,pbtnY,pbtnW,pbtnH,8); c.fill();
  c.fillStyle='white'; c.font='bold 16px Arial'; c.textBaseline='middle'; c.textAlign='center';
  c.fillText('❚❚', pbtnX+pbtnW/2, pbtnY+pbtnH/2+1);

  // ── LEFT: Score (after pause btn) ──
  c.font='bold 18px Arial'; c.textAlign='left'; c.fillStyle='#FFD700'; c.textBaseline='middle';
  c.fillText(`⭐ ${game.score}`, 56, 27);

  // ── LEFT: Lives ──
  c.font='17px Arial';
  for (let i=0; i<CFG.LIVES; i++) {
    c.globalAlpha = i < game.lives ? 1.0 : 0.20;
    c.fillText('❤', 56+i*24, 27+18);
  }
  c.globalAlpha=1;

  // ── CENTER: Level label + theme ──
  const lv = LEVELS[game.lvIdx];
  c.textAlign='center'; c.fillStyle='white'; c.font='bold 17px Arial'; c.textBaseline='middle';
  c.fillText(`Level ${game.lvIdx+1}`, W/2, 16);
  c.font='14px Arial'; c.fillStyle='rgba(255,255,255,0.75)';
  c.fillText(lv ? lv.themeZH : '🏆 Complete!', W/2, 34);

  // ── CENTER: thin progress bar ──
  const total = lv ? lv.words.length : 5;
  const done  = total - game.wordsLeft.length;
  const barW=W*0.26, barH=5, barX=W/2-barW/2, barY=44;
  c.fillStyle='rgba(255,255,255,0.20)'; roundRect(c,barX,barY,barW,barH,3); c.fill();
  if (done>0) {
    c.fillStyle='#00E5FF'; roundRect(c,barX,barY,barW*(done/total),barH,3); c.fill();
  }

  // ── RIGHT: Timer ──
  const m=Math.floor(game.timer/60), s=game.timer%60;
  c.textAlign='right'; c.font='bold 15px Arial'; c.textBaseline='middle';
  c.fillStyle = game.timer>90 ? '#FF6B6B' : 'rgba(255,255,255,0.85)';
  c.fillText(`⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, W-14, 15);

  // ── RIGHT: Bomb count (plane icon + number, like reference) ──
  // Small plane icon drawn on canvas
  const bx = W - 70, by2 = 32;
  c.save();
  c.translate(bx, by2); c.scale(0.55, 0.55);
  c.fillStyle='rgba(255,255,255,0.85)';
  c.beginPath(); c.ellipse(0,0,22,6,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(-4,1); c.lineTo(-11,-12); c.lineTo(9,-12); c.lineTo(12,1); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-18,-1); c.lineTo(-24,-9); c.lineTo(-12,-1); c.closePath(); c.fill();
  c.restore();
  c.textAlign='left'; c.font='bold 18px Arial'; c.fillStyle='white'; c.textBaseline='middle';
  c.fillText(game.bombsLeft, W-46, by2);

  c.restore();
}

// Word panel — sits just below HUD
function drawWordPanel(c, game) {
  if (!game.targetWord) return;
  c.save();
  const pw=210, ph=42, px=W/2-pw/2, py=55;
  // Pill background
  c.fillStyle='rgba(0,0,0,0.55)';
  roundRect(c,px,py,pw,ph,14); c.fill();
  c.strokeStyle='rgba(255,210,40,0.80)'; c.lineWidth=2; c.stroke();
  // Speaker
  c.font='19px Arial'; c.textBaseline='middle'; c.textAlign='left';
  c.fillStyle='rgba(255,255,255,0.85)'; c.fillText('🔊', px+10, py+ph/2);
  // Word
  c.fillStyle='#FFD700'; c.font='bold 22px "Arial Rounded MT Bold", Arial';
  c.textAlign='center';
  c.fillText(game.targetWord.toUpperCase(), W/2+12, py+ph/2);
  c.restore();
}

// ══════════════════════════════════════════
//  SCREEN: MAIN MENU
// ══════════════════════════════════════════
function menuBtnW() { return clamp(W * 0.38, 340, 640); }
function menuBtnH() { return clamp(H * 0.085, 58, 76); }

function drawMenu(c) {
  c.fillStyle='rgba(5,10,30,0.88)'; c.fillRect(0,0,W,H);
  c.textAlign='center'; c.textBaseline='middle';

  // Title
  c.save();
  c.font=`bold ${clamp(H * 0.082, 46, 68)}px "Arial Rounded MT Bold", Arial`;
  c.fillStyle='#FFD700'; c.shadowColor='#FF6600'; c.shadowBlur=24;
  c.fillText('💣 炸彈英文', W/2, H*0.22);
  c.shadowBlur=0;
  c.font=`${clamp(H * 0.032, 18, 26)}px Arial`; c.fillStyle='rgba(255,255,255,0.75)';
  c.fillText(`Bomb English — ${bombLessonTitle}`, W/2, H*0.33);
  c.restore();

  // Buttons
  [
    { label:'⭐ 簡單模式 (Easy)', y:H*0.50, col:'rgba(40,160,80,0.88)', id:'easy' },
    { label:'🔥 困難模式 (Hard)', y:H*0.64, col:'rgba(210,50,50,0.88)',  id:'hard' },
  ].forEach(btn => {
    const bw=menuBtnW(), bh=menuBtnH(), bx=W/2-bw/2;
    c.save();
    c.fillStyle=btn.col; roundRect(c,bx,btn.y-bh/2,bw,bh,16); c.fill();
    c.strokeStyle='rgba(255,255,255,0.4)'; c.lineWidth=2; c.stroke();
    c.fillStyle='white'; c.font=`bold ${clamp(H * 0.034, 21, 30)}px Arial`;
    c.fillText(btn.label, W/2, btn.y);
    c.restore();
  });

  c.font='16px Arial'; c.fillStyle='rgba(255,255,255,0.35)';
  c.fillText('點按模式開始遊戲', W/2, H*0.76);
}

// ══════════════════════════════════════════
//  SCREEN: PAUSE
// ══════════════════════════════════════════
function drawPauseScreen(c, game) {
  c.save();
  c.fillStyle='rgba(0,0,20,0.75)'; c.fillRect(0,0,W,H);
  c.textAlign='center'; c.textBaseline='middle';

  c.font='bold 48px Arial'; c.fillStyle='white'; c.shadowColor='#00E5FF'; c.shadowBlur=18;
  c.fillText('⏸ 暫停', W/2, H*0.3);
  c.shadowBlur=0;

  const m=Math.floor(game.timer/60), s=game.timer%60;
  c.font='22px Arial'; c.fillStyle='rgba(255,255,255,0.7)';
  c.fillText(`時間 ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}   分數 ${game.score}`, W/2, H*0.42);

  [
    { label:'▶ 繼續遊戲',   y:H*0.56, col:'rgba(40,150,80,0.90)'  },
    { label:'🏠 回主選單', y:H*0.68, col:'rgba(60,60,160,0.88)' },
  ].forEach(btn => {
    const bw=260, bh=55, bx=W/2-bw/2;
    c.fillStyle=btn.col; roundRect(c,bx,btn.y-bh/2,bw,bh,15); c.fill();
    c.strokeStyle='rgba(255,255,255,0.35)'; c.lineWidth=1.5; c.stroke();
    c.fillStyle='white'; c.font='bold 22px Arial';
    c.fillText(btn.label, W/2, btn.y);
  });
  c.restore();
}

// ══════════════════════════════════════════
//  SCREEN: LEVEL CLEAR
// ══════════════════════════════════════════
function drawLevelClear(c, score) {
  c.fillStyle='rgba(0,0,0,0.55)'; c.fillRect(0,0,W,H);
  c.textAlign='center'; c.textBaseline='middle';
  c.save();
  c.font='bold 54px Arial'; c.fillStyle='#FFD700'; c.shadowColor='#FF8800'; c.shadowBlur=22;
  c.fillText('🎉 Level Clear!', W/2, H/2-30);
  c.shadowBlur=0;
  c.font='26px Arial'; c.fillStyle='white';
  c.fillText(`Score: ${score}`, W/2, H/2+22);
  c.restore();
}

// ══════════════════════════════════════════
//  SCREEN: GAME OVER / VICTORY
// ══════════════════════════════════════════
function drawEndScreen(c, game, victory) {
  c.fillStyle='rgba(0,0,0,0.72)'; c.fillRect(0,0,W,H);
  c.textAlign='center'; c.textBaseline='middle';

  const title = victory ? '🏆 完關！All Clear!' : '💥 Game Over';
  const col   = victory ? '#FFD700' : '#FF4444';
  c.font='bold 52px Arial'; c.fillStyle=col;
  c.shadowColor=col; c.shadowBlur=18;
  c.fillText(title, W/2, H*0.3);
  c.shadowBlur=0;

  c.font='24px Arial'; c.fillStyle='white';
  c.fillText(`最終分數 Score: ${game.score}`, W/2, H*0.45);
  const m=Math.floor(game.timer/60), s=game.timer%60;
  c.fillText(`時間 Time: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, W/2, H*0.54);

  // Restart button
  const bw=250, bh=58, bx=W/2-bw/2, by=H*0.65;
  c.fillStyle='rgba(40,140,80,0.88)'; roundRect(c,bx,by,bw,bh,16); c.fill();
  c.strokeStyle='rgba(255,255,255,0.4)'; c.lineWidth=2; c.stroke();
  c.fillStyle='white'; c.font='bold 23px Arial';
  c.fillText('再玩一次 🔄 Retry', W/2, by+bh/2);
}

// ══════════════════════════════════════════
//  GAME
// ══════════════════════════════════════════
class Game {
  constructor() {
    this.phase = 'menu';  // menu | playing | paused | levelClear | gameOver | victory
    this.difficulty = 'easy';
    this.lvIdx    = 0;
    this.lives    = CFG.LIVES;
    this.score    = 0;
    this.timer    = 0;
    this.bombsLeft = CFG.BOMBS_PER_LEVEL;
    this._timerInterval = null;
    this.targetWord  = '';
    this.wordsLeft   = [];
    this.wrongAtt    = 0;  // wrong attempts this target
    this.levelClearT = 0;  // countdown before moving to next level
    this.planeRespawnT = 0;
    this._prevPhase  = 'playing'; // for pause/resume

    this.plane    = new Plane();
    this.bombs    = [];
    this.exps     = [];
    this.missiles = [];
    this.floats   = [];
    this.houses   = [];
    this.trees    = [];
  }

  // ── Start ──────────────────────────────
  start(difficulty) {
    this.difficulty = difficulty;
    this.lvIdx     = 0;
    this.lives     = CFG.LIVES;
    this.score     = 0;
    this.timer     = 0;
    this.bombsLeft = CFG.BOMBS_PER_LEVEL;
    this.planeRespawnT = 0;
    this.phase     = 'playing';
    this.plane.reset();
    Audio.init();
    this._loadLevel();
    this._startTimer();
  }

  // ── Pause / Resume ─────────────────────
  togglePause() {
    if (this.phase === 'playing') {
      this._prevPhase = 'playing';
      this.phase = 'paused';
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
    }
  }

  returnToMenu() {
    clearInterval(this._timerInterval);
    this.phase = 'menu';
  }

  _startTimer() {
    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      if (this.phase === 'playing') this.timer++;
    }, 1000);
  }

  // ── Load Level ─────────────────────────
  _loadLevel() {
    const lv = LEVELS[this.lvIdx];
    if (!lv) { this.phase = 'victory'; clearInterval(this._timerInterval); return; }
    this.wordsLeft = [...lv.words];
    this.bombs = []; this.missiles = []; this.exps = []; this.floats = [];
    this.wrongAtt  = 0;
    this.planeRespawnT = 0;
    this.plane.hidden = false;
    this.bombsLeft = CFG.BOMBS_PER_LEVEL; // refill bombs each level
    this._buildScene(lv.words);
    this._nextTarget();
  }

  _buildScene(words) {
    const gY = H * CFG.GROUND_RATIO;
    const n  = words.length;
    const spacing = W / (n + 1);
    this.houses = words.map((w, i) => new House(spacing + i * spacing, gY, w, i));

    // Scatter trees
    this.trees = [];
    for (let i = 0; i < 8; i++) {
      const tx = Math.random() * W;
      // avoid house positions
      const tooClose = this.houses.some(h => Math.abs(tx - h.x) < 55);
      if (!tooClose) this.trees.push(new Tree(tx, gY));
    }
  }

  _nextTarget() {
    if (this.wordsLeft.length === 0) { this._levelClear(); return; }
    const i = Math.floor(Math.random() * this.wordsLeft.length);
    this.targetWord = this.wordsLeft[i];
    this.wrongAtt = 0;
    setTimeout(() => Audio.speak(this.targetWord), 350);
  }

  // ── Drop Bomb ──────────────────────────
  dropBomb() {
    if (this.phase !== 'playing') return;
    if (this.plane.hidden || this.planeRespawnT > 0) return;
    if (this.bombsLeft <= 0) {
      this._float(this.plane.x, this.plane.y - 40, '💣 No bombs!', '#FF8800', 20);
      return;
    }
    this.bombsLeft--;
    const b = new Bomb(this.plane.x, this.plane.y, this.plane.vx, this.plane.vy);
    this.bombs.push(b);
    Audio.bombDrop();
    // Out of bombs = game over
    if (this.bombsLeft === 0 && this.wordsLeft.length > 0) {
      setTimeout(() => {
        if (this.phase === 'playing' && this.bombsLeft === 0 && this.wordsLeft.length > 0)
          this._loseLife();
      }, 3500);
    }
  }

  // ── Level Clear ────────────────────────
  _levelClear() {
    const bonus = Math.max(50, 600 - this.timer * 3);
    this.score += bonus;
    this.phase = 'levelClear';
    Audio.levelClear();
    this.levelClearT = 150; // ~2.5s at 60fps
  }

  // ── Lose Life ──────────────────────────
  _loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this.plane.invincible = 110;
    this.plane.shake();
    Audio.hit();
    if (this.lives <= 0) { this.phase = 'gameOver'; clearInterval(this._timerInterval); }
  }

  // ── Float Text ─────────────────────────
  _float(x, y, txt, col, sz=22) { this.floats.push(new FloatText(x, y, txt, col, sz)); }

  // ══════════════════════════════════════
  //  UPDATE
  // ══════════════════════════════════════
  update() {
    if (this.phase === 'paused') return;
    if (this.phase === 'levelClear') {
      this.levelClearT--;
      this.exps.forEach(e=>e.update()); this.exps=this.exps.filter(e=>!e.done);
      if (this.levelClearT <= 0) { this.lvIdx++; this._loadLevel(); this.phase='playing'; }
      return;
    }
    if (this.phase !== 'playing') return;

    let planeEvent = null;
    if (this.planeRespawnT > 0) {
      this.planeRespawnT--;
      if (this.planeRespawnT === 0 && this.phase === 'playing') {
        this.plane.respawnFromSky();
      }
    } else {
      planeEvent = this.plane.update(joystick);
      if (planeEvent === 'ground') {
        this.exps.push(new Explosion(this.plane.x, this.plane.y, true));
        Audio.explosion();
        this._float(this.plane.x, this.plane.y - 42, 'CRASH!', '#FF3300', 24);
        this._loseLife();
        if (this.phase === 'playing') {
          this.plane.hidden = true;
          this.plane.trail = [];
          this.planeRespawnT = 45;
          joystick.reset();
        }
      }
    }

    // Houses
    this.houses.forEach(h => h.update());

    // Bombs
    for (let i = this.bombs.length-1; i >= 0; i--) {
      const b = this.bombs[i];
      b.update();
      if (!b.active) {
        this.exps.push(new Explosion(b.x, b.y, false));
        Audio.explosion();
        this.bombs.splice(i, 1);
        continue;
      }
      // House collision
      let hit = false;
      for (const h of this.houses) {
        if (h.destroyed || !h.checkHit(b)) continue;
        // Hit a house!
        b.active = false;
        this.exps.push(new Explosion(b.x, h.y + h.height/2, true));
        Audio.explosion();

        if (h.word === this.targetWord) {
          // ✅ CORRECT
          h.destroyed = true;
          const pts = Math.max(10, 80 - this.timer);
          this.score += pts;
          this._float(h.x, h.y - 30, `✅ +${pts}`, '#FFD700', 24);
          Audio.success();
          this.wordsLeft = this.wordsLeft.filter(w => w !== h.word);
          setTimeout(() => { if (this.phase==='playing') this._nextTarget(); }, 900);
        } else {
          // ❌ WRONG
          h.shaking = 2.5; h.wrongFlash = 40; h.wrongBubble = 60;
          this.timer += CFG.WRONG_PENALTY_S;
          this._float(h.x, h.y - 30, `+${CFG.WRONG_PENALTY_S}s ⏱`, '#FF5555', 20);
          this._loseLife();
          Audio.wrong();
          this.wrongAtt++;

          // Hard mode missile
          if (this.difficulty === 'hard') {
            this.missiles.push(new Missile(h.x, h.y, this.plane));
            Audio.missile();
            this._float(h.x, h.y - 60, '🚀 MISSILE!', '#FF3300', 18);
          }

          // Hint after 2 wrong
          if (this.wrongAtt >= 2) {
            const th = this.houses.find(hh => hh.word===this.targetWord && !hh.destroyed);
            if (th) { th.hintFlash = 80; this._float(th.x, th.y-50, '👆 Hint!', '#00FF88', 18); }
          }
        }
        this.bombs.splice(i, 1); hit=true; break;
      }
    }

    // Missiles
    for (let i = this.missiles.length-1; i >= 0; i--) {
      const m = this.missiles[i];
      const r = m.update();
      if (!m.active) {
        if (r === 'hit') {
          this.exps.push(new Explosion(m.x, m.y, false));
          Audio.explosion();
          this._loseLife();
          this._float(this.plane.x, this.plane.y - 40, '💥 HIT!', '#FF3300', 26);
        }
        this.missiles.splice(i, 1);
      }
    }

    // Explosions & floats
    this.exps.forEach(e=>e.update()); this.exps=this.exps.filter(e=>!e.done);
    this.floats.forEach(f=>f.update()); this.floats=this.floats.filter(f=>f.life>0);

    bombButton.update();
  }

  // ══════════════════════════════════════
  //  DRAW
  // ══════════════════════════════════════
  draw(c) {
    c.clearRect(0,0,W,H);

    if (this.phase === 'menu') { drawBackground(c, LEVELS[0]); drawMenu(c); return; }

    const lv = LEVELS[Math.min(this.lvIdx, LEVELS.length-1)];
    drawBackground(c, lv);

    // Trees
    this.trees.forEach(t => t.draw(c));

    // Trajectory preview
    if (this.phase === 'playing' || this.phase === 'levelClear' || this.phase === 'paused') {
      if (!this.plane.hidden) drawTrajectory(c, this.plane, this.difficulty);
    }

    // Houses
    this.houses.forEach(h => h.draw(c, h.word === this.targetWord));

    // Explosions
    this.exps.forEach(e => e.draw(c));

    // Bombs
    this.bombs.forEach(b => b.draw(c));

    // Missiles
    this.missiles.forEach(m => m.draw(c));

    // Plane
    this.plane.draw(c);

    // Floats
    this.floats.forEach(f => f.draw(c));

    // Controls
    joystick.draw(c);
    bombButton.draw(c);

    // HUD
    drawHUD(c, this);
    drawWordPanel(c, this);

    // Overlays
    if (this.phase === 'paused')     drawPauseScreen(c, this);
    if (this.phase === 'levelClear') drawLevelClear(c, this.score);
    if (this.phase === 'gameOver')   drawEndScreen(c, this, false);
    if (this.phase === 'victory')    drawEndScreen(c, this, true);
  }
}

// ══════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════
let joystick   = new VirtualJoystick();
let bombButton = new BombButton();
let game       = new Game();

function hitMenu(x, y) {
  const bw=menuBtnW(), bh=menuBtnH(), bx=W/2-bw/2;
  if (x>bx && x<bx+bw && y>H*0.50-bh/2 && y<H*0.50+bh/2) game.start('easy');
  if (x>bx && x<bx+bw && y>H*0.64-bh/2 && y<H*0.64+bh/2) game.start('hard');
}

function hitEndScreen(x, y) {
  const bw=250, bh=58, bx=W/2-bw/2, by=H*0.65;
  if (x>bx && x<bx+bw && y>by && y<by+bh) { game=new Game(); resizeCanvas(); }
}

function hitPauseScreen(x, y) {
  const bw=260, bh=55, bx=W/2-bw/2;
  // Resume
  if (x>bx && x<bx+bw && y>H*0.56-bh/2 && y<H*0.56+bh/2) game.togglePause();
  // Main menu
  if (x>bx && x<bx+bw && y>H*0.68-bh/2 && y<H*0.68+bh/2) { game.returnToMenu(); game=new Game(); resizeCanvas(); }
}

function hitWordPanel(x, y) {
  if (y>55 && y<97 && x>W/2-105 && x<W/2+105) Audio.speak(game.targetWord);
}

function hitPauseBtn(x, y) {
  // Pause button: top-left 14,9 → 48,43
  if (x>14 && x<48 && y>9 && y<43) game.togglePause();
}

function handleStart(touches) {
  Audio.init();
  for (const t of touches) {
    const {clientX:x, clientY:y} = t;
    if (game.phase==='paused')  { hitPauseScreen(x,y); continue; }
    joystick.tryStart(t);
    if (bombButton.tryPress(t) && game.phase==='playing') game.dropBomb();
    if (game.phase==='menu')                              hitMenu(x,y);
    if (game.phase==='gameOver'||game.phase==='victory')  hitEndScreen(x,y);
    if (game.phase==='playing')                           hitPauseBtn(x,y);
    hitWordPanel(x,y);
  }
}

canvas.addEventListener('touchstart', e => { e.preventDefault(); handleStart(e.changedTouches); }, {passive:false});
canvas.addEventListener('touchmove',  e => { e.preventDefault(); for(const t of e.changedTouches) joystick.move(t); }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); for(const t of e.changedTouches){ joystick.end(t); bombButton.release(t); } }, {passive:false});

// Mouse fallback (desktop testing)
let mDown=false;
canvas.addEventListener('mousedown', e => {
  mDown=true; Audio.init();
  const ft={clientX:e.clientX, clientY:e.clientY, identifier:0};
  handleStart([ft]);
});
canvas.addEventListener('mousemove', e => {
  if (!mDown) return;
  joystick.move({clientX:e.clientX, clientY:e.clientY, identifier:0});
});
canvas.addEventListener('mouseup', e => {
  mDown=false;
  joystick.end({identifier:0});
  bombButton.release({identifier:0});
});

window.addEventListener('message', event => {
  if (event.source !== window.parent && event.origin !== window.location.origin) return;
  if (!event.data || event.data.type !== 'BOMB_DATA') return;
  applyBombData(event.data.payload);
});

const hashLessonData = readLessonDataFromHash();
if (hashLessonData) applyBombData(hashLessonData);
// Prevent right-click context menu
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ══════════════════════════════════════════
//  SERVICE WORKER (PWA)
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  MAIN LOOP
// ══════════════════════════════════════════
function loop() {
  game.update();
  game.draw(ctx);
  requestAnimationFrame(loop);
}

resizeCanvas();
loop();
