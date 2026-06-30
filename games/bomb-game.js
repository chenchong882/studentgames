'use strict';

// ══════════════════════════════════════════
//  CANVAS & RESIZE
// ══════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
let W = 0, H = 0;
let SAFE_L = 0, SAFE_R = 0, SAFE_T = 0;  // 瀏海/動態島安全區內距（px），橫放時左右會有缺口

// 用一個隱藏探針讀 env(safe-area-inset-*)：直接讀 CSS 變數常拿不到解析後的 px，
// 但設成 padding 再讀 computed 值就一定是 px。
let _safeProbe = null;
function readSafeAreaInsets() {
  if (!document.body) return;
  if (!_safeProbe) {
    _safeProbe = document.createElement('div');
    _safeProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);padding-top:env(safe-area-inset-top,0px);';
    document.body.appendChild(_safeProbe);
  }
  const cs = getComputedStyle(_safeProbe);
  SAFE_L = parseFloat(cs.paddingLeft) || 0;
  SAFE_R = parseFloat(cs.paddingRight) || 0;
  SAFE_T = parseFloat(cs.paddingTop) || 0;
}

// iOS (incl. iPadOS, which reports as Mac + touch). Kept for audio-unlock quirks.
const IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function resizeCanvas() {
  // 手機 devicePixelRatio 常是 3，canvas 實際像素 = 螢幕 ×3，漸層/陰影很吃效能、
  // 幀率掉一半。上限壓到 2 倍：畫面幾乎看不出差別，但手機效能省一大截。
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  W = Math.max(1, Math.round(rect.width || window.innerWidth));
  H = Math.max(1, Math.round(rect.height || window.innerHeight));
  readSafeAreaInsets();
  
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  
  ctx.resetTransform();
  ctx.scale(dpr, dpr);

  const controlY = Math.min(H * 0.80, H - Math.max(78, H * 0.14));
  if (joystick)    { joystick.baseX = W * 0.14; joystick.baseY = controlY; joystick.r = clamp(Math.min(W, H) * 0.105, 54, 84); joystick.reset(); }
  if (bombButton)  { bombButton.cx  = W * 0.88; bombButton.cy  = controlY; bombButton.r = clamp(Math.min(W, H) * 0.078, 42, 62); }
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
  // ── Hard-mode anti-air turrets ──
  TURRET_FIRE_MIN:   115,  // frames between volleys (~1.9s)
  TURRET_FIRE_MAX:   210,  // ~3.5s
  TURRET_CHARGE:     46,   // warning frames (barrel locks + glows) before firing
  TURRET_BATCH_MAX:  2,    // up to N turrets fire per volley (usually 1)
  SHELL_SPD:         4.4,  // straight shot, slower than plane top speed so it's dodgeable
  // ── Supply crate (bomb refill) ──
  CRATE_LOW_THRESHOLD: 2,    // crate can spawn once bombsLeft drops to/below this
  CRATE_BOMBS:       3,    // bombs granted on pickup
  CRATE_FALL_SPD:    0.85,
  CRATE_COOLDOWN_MIN: 180, // frames before another crate may appear (~3s)
  CRATE_COOLDOWN_MAX: 300, // ~5s
  CRATE_PICKUP_R:    34,   // collision radius vs. the plane
};

// ══════════════════════════════════════════
//  WORD → EMOJI LOOKUP (picture-matching mode)
// ══════════════════════════════════════════
// Houses show this emoji instead of the plain word label when a match exists
// (DEFAULT_LEVELS below is built entirely from matched words; words coming
// in via BOMB_DATA fall back to the plain text label when there's no entry).
const WORD_EMOJI = {
  'blanket':'🛏️', 'mirror':'🪞', 'cousin':'👨‍👩‍👦', 'backpack':'🎒', 'crayons':'🖍️', 'scissors':'✂️',
  'puzzle':'🧩', 'mountain':'⛰️', 'spaghetti':'🍝', 'cookie':'🍪', 'yogurt':'🥛', 'sandwich':'🥪',
  'lemonade':'🍋', 'hospital':'🏥', 'bakery':'🥖', 'police station':'🚔', 'museum':'🏛️', 'library':'📚',
  'subway':'🚇', 'rocket':'🚀', 'flashlight':'🔦', 'notebook':'📓', 'paintbrush':'🖌️', 'basket':'🧺',
  'ticket':'🎫', 'castle':'🏰', 'traffic light':'🚦', 'umbrella':'☂️', 'suitcase':'🧳', 'thermometer':'🌡️',
  'toothbrush':'🪥', 'calculator':'🧮', 'microscope':'🔬', 'telescope':'🔭', 'compass':'🧭', 'calendar':'📅',
  'envelope':'✉️', 'headphones':'🎧', 'microphone':'🎤', 'skateboard':'🛹', 'bicycle':'🚲', 'helmet':'🪖',
  'wallet':'👛', 'watch':'⌚', 'soap':'🧼', 'sponge':'🧽', 'key':'🔑', 'lamp':'💡',
  'battery':'🔋', 'magnet':'🧲', 'broom':'🧹', 'bucket':'🪣', 'chair':'🪑', 'window':'🪟',
  'package':'📦', 'newspaper':'📰', 'remote control':'🎮', 'airport':'✈️', 'harbor':'⚓', 'lighthouse':'🗼',
  'bridge':'🌉', 'tunnel':'🚇', 'fountain':'⛲', 'playground':'🛝', 'stadium':'🏟️', 'aquarium':'🐠',
  'planetarium':'🪐', 'pharmacy':'💊', 'restaurant':'🍽️', 'bookstore':'📚', 'train station':'🚉', 'fire station':'🚒',
  'parking lot':'🅿️', 'bus stop':'🚏', 'crosswalk':'🚸', 'ferry':'⛴️', 'taxi':'🚕', 'tram':'🚋',
  'cable car':'🚠', 'gas station':'⛽', 'market':'🛒', 'factory':'🏭', 'post office':'📮', 'clinic':'🩺',
  'temple':'⛩️', 'garden':'🌷', 'campground':'🏕️', 'noodles':'🍜', 'pancake':'🥞', 'dumpling':'🥟',
  'popcorn':'🍿', 'cupcake':'🧁', 'watermelon':'🍉', 'pineapple':'🍍', 'coconut':'🥥', 'avocado':'🥑',
  'mushroom':'🍄', 'cereal':'🥣', 'honey':'🍯', 'jam':'🫙', 'smoothie':'🥤', 'sushi':'🍣',
  'waffle':'🧇', 'pretzel':'🥨', 'taco':'🌮', 'burrito':'🌯', 'falafel':'🧆', 'croissant':'🥐',
  'bagel':'🥯', 'oatmeal':'🥣', 'yogurt cup':'🥛', 'pudding':'🍮', 'milkshake':'🥤', 'tea pot':'🫖',
  'hot chocolate':'☕', 'salad':'🥗', 'spice jar':'🧂', 'stapler':'📎', 'marker':'🖊️', 'ruler':'📏',
  'palette':'🎨', 'clay':'🧱', 'locker':'🗄️', 'chalkboard':'⬛', 'globe':'🌐', 'diploma':'🎓',
  'violin':'🎻', 'drum':'🥁', 'guitar':'🎸', 'keyboard':'🎹', 'trophy':'🏆', 'camera':'📷',
  'printer':'🖨️', 'paper clip':'📎', 'folder':'📁', 'clipboard':'📋', 'paint tube':'🎨', 'easel':'🖼️',
  'music stand':'🎼', 'projector':'📽️', 'tablet':'📱', 'laptop':'💻', 'badge':'🏷️', 'flash card':'🃏',
  'test tube':'🧪', 'abacus':'🧮', 'megaphone':'📣', 'lion':'🦁', 'tiger':'🐯', 'elephant':'🐘',
  'monkey':'🐵', 'panda':'🐼', 'zebra':'🦓', 'giraffe':'🦒', 'kangaroo':'🦘', 'koala':'🐨',
  'rabbit':'🐰', 'squirrel':'🐿️', 'hedgehog':'🦔', 'wolf':'🐺', 'fox':'🦊', 'bear':'🐻',
  'polar bear':'🐻‍❄️', 'deer':'🦌', 'horse':'🐴', 'cow':'🐮', 'pig':'🐷', 'sheep':'🐑',
  'goat':'🐐', 'camel':'🐫', 'llama':'🦙', 'hippopotamus':'🦛', 'rhinoceros':'🦏', 'gorilla':'🦍',
  'raccoon':'🦝', 'otter':'🦦', 'bat':'🦇', 'fish':'🐟', 'tropical fish':'🐠', 'blowfish':'🐡',
  'shark':'🦈', 'dolphin':'🐬', 'whale':'🐳', 'octopus':'🐙', 'squid':'🦑', 'crab':'🦀',
  'lobster':'🦞', 'shrimp':'🦐', 'oyster':'🦪', 'turtle':'🐢', 'seal':'🦭', 'jellyfish':'🪼',
  'coral':'🪸', 'seashell':'🐚', 'wave':'🌊', 'beach':'🏖️', 'island':'🏝️', 'anchor':'⚓',
  'sailboat':'⛵', 'surfing':'🏄', 'snorkel mask':'🤿', 'lifebuoy':'🛟', 'swimming':'🏊', 'penguin':'🐧',
  'duck':'🦆', 'swan':'🦢', 'flamingo':'🦩', 'apple':'🍎', 'pear':'🍐', 'orange':'🍊',
  'banana':'🍌', 'grapes':'🍇', 'strawberry':'🍓', 'blueberry':'🫐', 'cherry':'🍒', 'peach':'🍑',
  'mango':'🥭', 'kiwi':'🥝', 'lemon':'🍋', 'melon':'🍈', 'tomato':'🍅', 'eggplant':'🍆',
  'broccoli':'🥦', 'leafy greens':'🥬', 'cucumber':'🥒', 'corn':'🌽', 'carrot':'🥕', 'garlic':'🧄',
  'onion':'🧅', 'potato':'🥔', 'sweet potato':'🍠', 'beans':'🫘', 'chestnut':'🌰', 'bell pepper':'🫑',
  'olive':'🫒', 'ginger':'🫚', 'hot pepper':'🌶️', 'sun':'☀️', 'cloud':'☁️', 'partly cloudy':'⛅',
  'rain':'🌧️', 'thunderstorm':'⛈️', 'lightning':'⚡', 'snow':'❄️', 'snowman':'⛄', 'rainbow':'🌈',
  'wind':'💨', 'tornado':'🌪️', 'fog':'🌫️', 'water drop':'💧', 'star':'⭐', 'sparkles':'✨',
  'comet':'☄️', 'full moon':'🌕', 'crescent moon':'🌙', 'new moon':'🌑', 'sunrise':'🌅', 'sunset':'🌇',
  'earth':'🌍', 'saturn':'🪐', 'cyclone':'🌀', 'ice':'🧊', 'drizzle':'🌦️', 'mist':'🌁',
  'milky way':'🌌', 'shooting star':'🌠', 'frost':'❄️', 'car':'🚗', 'police car':'🚓', 'ambulance':'🚑',
  'fire truck':'🚒', 'bus':'🚌', 'van':'🚐', 'pickup truck':'🛻', 'truck':'🚚', 'tractor':'🚜',
  'motorcycle':'🏍️', 'moped':'🛵', 'auto rickshaw':'🛺', 'train':'🚆', 'high speed train':'🚄', 'monorail':'🚝',
  'trolleybus':'🚎', 'airplane':'✈️', 'helicopter':'🚁', 'small airplane':'🛩️', 'parachute':'🪂', 'balloon':'🎈',
  'canoe':'🛶', 'speedboat':'🚤', 'ship':'🚢', 'mountain railway':'🚞', 'cruise ship':'🛳️', 'flying saucer':'🛸',
  'sled':'🛷', 'wheel':'🛞', 'construction sign':'🚧', 't-shirt':'👕', 'pants':'👖', 'jacket':'🧥',
  'dress':'👗', 'shorts':'🩳', 'socks':'🧦', 'gloves':'🧤', 'scarf':'🧣', 'cap':'🧢',
  'top hat':'🎩', 'crown':'👑', 'necktie':'👔', 'shoes':'👞', 'sneakers':'👟', 'boots':'🥾',
  'high heels':'👠', 'sandals':'👡', 'ballet shoes':'🩰', 'graduation cap':'🎓', 'swimsuit':'🩱', 'bikini':'👙',
  'kimono':'👘', 'sari':'🥻', 'handbag':'👜', 'glasses':'👓', 'sunglasses':'🕶️', 'ring':'💍',
  'diamond':'💎', 'lipstick':'💄', 'nail polish':'💅', 'soccer ball':'⚽', 'basketball':'🏀', 'football':'🏈',
  'baseball':'⚾', 'softball':'🥎', 'tennis':'🎾', 'volleyball':'🏐', 'rugby':'🏉', 'frisbee':'🥏',
  'billiards':'🎱', 'ping pong':'🏓', 'badminton':'🏸', 'ice hockey':'🏒', 'field hockey':'🏑', 'lacrosse':'🥍',
  'golf':'⛳', 'archery':'🏹', 'fishing':'🎣', 'boxing':'🥊', 'martial arts':'🥋', 'roller skate':'🛼',
  'skiing':'🎿', 'snowboarding':'🏂', 'ice skating':'⛸️', 'weightlifting':'🏋️', 'gymnastics':'🤸', 'wrestling':'🤼',
  'rowing':'🚣', 'climbing':'🧗', 'cycling':'🚴', 'ant':'🐜', 'bee':'🐝', 'butterfly':'🦋',
  'caterpillar':'🐛', 'ladybug':'🐞', 'snail':'🐌', 'spider':'🕷️', 'spider web':'🕸️', 'scorpion':'🦂',
  'mosquito':'🦟', 'fly':'🪰', 'cricket':'🦗', 'cockroach':'🪳', 'beetle':'🪲', 'worm':'🪱',
  'lizard':'🦎', 'frog':'🐸', 'snake':'🐍', 'crocodile':'🐊', 'mouse':'🐭', 'rat':'🐀',
  'hamster':'🐹', 'chick':'🐤', 'chicken':'🐔', 'rooster':'🐓', 'turkey':'🦃', 'peacock':'🦚',
  'owl':'🦉', 'parrot':'🦜', 'bird':'🐦',
};

// ══════════════════════════════════════════
//  LEVEL DATA
// ══════════════════════════════════════════
const MAX_LEVELS = 6;   // 一局最多 6 關，打完就結算
const DEFAULT_LEVELS = [
  { id:1, themeEN:'Picture Match 1', themeZH:'📷 圖片配對 1', skyTop:'#1565c0', skyBot:'#42a5f5', groundTop:'#66bb6a', words:['blanket','mirror','cousin','backpack','crayons'] },
  { id:2, themeEN:'Picture Match 2', themeZH:'📷 圖片配對 2', skyTop:'#4a148c', skyBot:'#ab47bc', groundTop:'#8bc34a', words:['scissors','puzzle','mountain','spaghetti','cookie'] },
  { id:3, themeEN:'Picture Match 3', themeZH:'📷 圖片配對 3', skyTop:'#e65100', skyBot:'#ffa726', groundTop:'#4db6ac', words:['yogurt','sandwich','lemonade','hospital','bakery'] },
  { id:4, themeEN:'Picture Match 4', themeZH:'📷 圖片配對 4', skyTop:'#00695c', skyBot:'#26a69a', groundTop:'#9ccc65', words:['police station','museum','library','subway','rocket'] },
  { id:5, themeEN:'Picture Match 5', themeZH:'📷 圖片配對 5', skyTop:'#283593', skyBot:'#5c6bc0', groundTop:'#ffb74d', words:['flashlight','notebook','paintbrush','basket','ticket'] },
  { id:6, themeEN:'Picture Match 6', themeZH:'📷 圖片配對 6', skyTop:'#ad1457', skyBot:'#ec407a', groundTop:'#80cbc4', words:['castle','traffic light','umbrella','suitcase','thermometer'] },
  { id:7, themeEN:'Picture Match 7', themeZH:'📷 圖片配對 7', skyTop:'#1565c0', skyBot:'#42a5f5', groundTop:'#66bb6a', words:['toothbrush','calculator','microscope','telescope','compass'] },
  { id:8, themeEN:'Picture Match 8', themeZH:'📷 圖片配對 8', skyTop:'#4a148c', skyBot:'#ab47bc', groundTop:'#8bc34a', words:['calendar','envelope','headphones','microphone','skateboard'] },
];
let LEVELS = DEFAULT_LEVELS.slice(0, MAX_LEVELS).map(level => ({ ...level, words: [...level.words] }));
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

function shuffleWords(words) {
  const a = [...words];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 課程題庫（lessonData）才隨機；打散整池再切關，所以每次開新局第一關出現的
// 單字都不一樣，不會永遠是題庫前 5 個。
let bombWordPool = null;
// 注入題庫（wordbank / 課程）帶來的 emoji：word(小寫) → emoji。
// 畫字牌時優先用這張，查不到才退回內建 WORD_EMOJI 表，這樣 wordbank 改 emoji 會即時反映。
let lessonEmoji = {};
function emojiForWord(word) {
  const k = String(word).toLowerCase();
  return lessonEmoji[k] || WORD_EMOJI[k];
}
function buildLessonLevels() {
  LEVELS = chunkWords(shuffleWords(bombWordPool), 5).slice(0, MAX_LEVELS).map((chunk, index) => ({
    id: index + 1,
    themeEN: bombLessonTitle,
    themeZH: `💣 ${bombLessonTitle} ${index + 1}`,
    ...LESSON_LEVEL_COLORS[index % LESSON_LEVEL_COLORS.length],
    words: chunk,
  }));
}

function applyBombData(payload) {
  const words = normalizeBombWords(payload?.words);
  if (words.length === 0) {
    bombWordPool = null;
    lessonEmoji = {};
    LEVELS = DEFAULT_LEVELS.slice(0, MAX_LEVELS).map(level => ({ ...level, words: [...level.words] }));
    bombLessonTitle = '示範題庫';
  } else {
    lessonEmoji = {};
    (payload?.words || []).forEach(w => {
      const word = getLessonWord(w), em = String(w?.emoji || '').trim();
      if (word && em) lessonEmoji[word.toLowerCase()] = em;
    });
    bombLessonTitle = payload?.unitTitle || payload?.title || '目前課程';
    bombWordPool = words;
    buildLessonLevels();
  }

  if (typeof game !== 'undefined') {
    clearInterval(game._timerInterval);
    Audio.stopBgm();
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
  let speaking = false;   // iOS 唸字中：讓出音訊工作階段給人聲，期間別硬把 ctx resume 回來
  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended' && !speaking) ctx.resume();
  }

  function primeSpeech() {
    // First user gesture: just make sure BGM is running if it's wanted.
    if (bgmWanted) startBgm();
  }

  // ── Speech: read the target word aloud（發音規則沿用「挖金礦」miner.html）──
  let availableVoices = [];
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    availableVoices = window.speechSynthesis.getVoices();
  }
  function pickEnglishVoice() {
    return availableVoices.find(v => /^en[-_]?US/i.test(v.lang))
        || availableVoices.find(v => /^en/i.test(v.lang))
        || null;
  }
  function speechTextFor(word) {
    return String(word || '')
      .replace(/\bA\b/g, 'something')
      .replace(/\bB\b/g, 'something')
      .replace(/\s*\/\s*/g, ' or ')
      .replace(/[()]/g, ' ')
      .replace(/…|\.\.\./g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  loadVoices();
  if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;

  // iOS Safari 只認「真實使用者手勢」內的第一次 speak()。canvas 的 touchstart 常常
  // 不被 iOS 採信，導致整路靜音。所以第一次觸碰時，先在手勢裡 speak() 一個無聲語句把
  // 語音引擎解鎖，之後（含 setTimeout / 換題）的唸字才會出聲。
  let speechUnlocked = false;
  let speechGen = 0;   // 世代 token：連續換題時只有「最新的字」負責恢復音效，避免 race
  function unlockSpeech() {
    if (speechUnlocked || !('speechSynthesis' in window)) return;
    speechUnlocked = true;
    try {
      window.speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function speak(word) {
    if (!('speechSynthesis' in window)) return;
    const text = speechTextFor(word);
    if (!text) return;
    const voice = pickEnglishVoice();
    const msg = new SpeechSynthesisUtterance(text);
    if (voice) msg.voice = voice;
    msg.lang  = voice?.lang || 'en-US';
    msg.rate  = 0.82;
    msg.pitch = 1;

    // iOS：唸字瞬間把音訊工作階段讓給人聲——暫停 Web Audio 音效 + BGM，唸完再恢復。
    // 桌機本來就能混音，不做讓位（免得每唸一字 BGM 停一秒）。
    if (IS_IOS) {
      const myGen = ++speechGen;
      speaking = true;
      if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) {} }
      if (bgmAudio && bgmWanted) { try { bgmAudio.pause(); } catch (e) {} }
      const restore = () => {
        if (myGen !== speechGen) return;            // 已被更新的字接手，交給它恢復
        speaking = false;
        if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
        if (bgmWanted && bgmAudio) { const p = bgmAudio.play(); if (p && p.catch) p.catch(() => {}); }
      };
      msg.onend = restore;
      msg.onerror = restore;
      setTimeout(restore, 6000);                    // 安全網：onend 沒觸發時也別讓音效卡死
    }

    try { window.speechSynthesis.resume(); } catch (e) {}  // iOS 有時會自動 pause
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
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

  // ── Background music: user-provided MP3, kept quiet under the speech ──
  const BGM_SRC = '../assets/music/悠然小步.mp3';
  const BGM_VOLUME = 0.10;
  let bgmAudio = null;
  let bgmWanted = false;

  function getBgmAudio() {
    if (bgmAudio) return bgmAudio;
    bgmAudio = document.createElement('audio');
    bgmAudio.src = BGM_SRC;
    bgmAudio.loop = true;
    bgmAudio.preload = 'auto';
    bgmAudio.volume = BGM_VOLUME;
    bgmAudio.setAttribute('playsinline', '');
    bgmAudio.setAttribute('webkit-playsinline', '');
    bgmAudio.style.display = 'none';
    (document.body || document.documentElement).appendChild(bgmAudio);
    return bgmAudio;
  }

  function startBgm() {
    bgmWanted = true;
    const a = getBgmAudio();
    a.volume = BGM_VOLUME;
    const playPromise = a.play();
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {});
  }

  function stopBgm() {
    bgmWanted = false;
    if (!bgmAudio) return;
    try { bgmAudio.pause(); } catch (e) {}
  }

  // 測試開關：true = 暫停「唸題以外」的所有聲音（合成音效 + BGM），只留 speechSynthesis。
  // （已確認 iOS 唸不出來的根因是 canvas touch 無法解鎖語音、需真實 DOM 按鈕，與搶音訊無關，
  //   故恢復 false；iOS 唸字時改用 speak() 內的 suspend/resume 讓位來避免 Web Audio 搶音訊。）
  const MUTE_NON_SPEECH = false;

  const api = {
    init: ensure,
    primeSpeech,
    startBgm, stopBgm,
    speak, unlockSpeech,
    // ── Bigger, more cinematic SFX ──
    explosion()    {
      noise(0.7, 0.65);                       // impact crack
      // Downward pitch-bend on a round sine — reads as a spoken "boooom"
      // rather than a harsh buzz (sawtooth/square removed on purpose).
      ensure();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(175, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(42, ctx.currentTime + 0.32);
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.9);
      tone(40, 0.9, 'sine', 0.2);              // low rumble tail
    },
    bombDrop()     { tone(340, 0.14, 'sine', 0.22); tone(180, 0.2, 'sine', 0.12, -120); },
    wrong()        { tone(180, 0.5, 'sawtooth', 0.25); tone(120, 0.6, 'sine', 0.16); },
    success()      {
      [523.25,659.25,783.99,1046.5].forEach((f,i) => setTimeout(()=>tone(f,0.3,'triangle',0.27), i*90));
      tone(130.81, 0.7, 'sine', 0.18);        // low pad underneath
    },
    levelClear()   {
      // Triumphant fanfare with octave-doubled bass
      [392,523.25,659.25,783.99,1046.5].forEach((f,i) => setTimeout(()=>{
        tone(f, 0.5, 'sawtooth', 0.22); tone(f/2, 0.5, 'sine', 0.14);
      }, i*140));
      noise(0.45, 0.32);
    },
    missile()      { tone(520, 0.3, 'square', 0.22); tone(300, 0.5, 'sawtooth', 0.16, -300); noise(0.22, 0.32); },
    cannon()       { noise(0.32, 0.6); tone(120, 0.36, 'square', 0.3); tone(50, 0.6, 'sawtooth', 0.27); },
    turretCharge() { tone(440, 0.32, 'sine', 0.14); tone(660, 0.32, 'sine', 0.09, 8); },
    hit()          { noise(0.45, 0.58); tone(95, 0.5, 'sawtooth', 0.3); tone(48, 0.65, 'sine', 0.22); },
    cratePickup()  { [660, 880, 1100].forEach((f,i) => setTimeout(()=>tone(f, 0.18, 'triangle', 0.24), i*60)); },
  };

  if (MUTE_NON_SPEECH) {
    // 把「唸題以外」全部換成空函式：不建立/喚醒 AudioContext、不播 BGM。
    // 保留 speak（唸單字）與 stopBgm（停 BGM 用，呼叫也安全）。
    const noop = () => {};
    ['init', 'primeSpeech', 'startBgm', 'explosion', 'bombDrop', 'wrong', 'success',
     'levelClear', 'missile', 'cannon', 'turretCharge', 'hit', 'cratePickup']
      .forEach(k => { api[k] = noop; });
  }

  return api;
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
    let targetVx, targetVy;
    if (joyPower > 0.08) {
      // Treat the stick as a pure heading (normalized) and fly at a speed that
      // ramps from cruise (light touch) up to max (full deflection). Earlier we
      // scaled velocity by the raw deflection, so a small/near-centre push
      // multiplied two small numbers and the plane stalled in mid-air.
      const inv = 1 / Math.hypot(joy.dx, joy.dy);
      const flySpd = lerp(cruiseSpd, CFG.PLANE_MAX_SPD, joyPower);
      targetVx = joy.dx * inv * flySpd;
      targetVy = joy.dy * inv * flySpd;
    } else {
      targetVx = cruiseSpd;
      targetVy = 0;
    }

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
//  SUPPLY CRATE (bomb refill airdrop)
// ══════════════════════════════════════════
class SupplyCrate {
  constructor(x) {
    this.x = x; this.y = -40;
    this.swayPhase = Math.random() * Math.PI * 2;
    this.active = true;
  }

  update() {
    this.y += CFG.CRATE_FALL_SPD;
    this.x += Math.sin((this.y + this.swayPhase*40) * 0.02) * 0.6;
    const gY = H * CFG.GROUND_RATIO;
    if (this.y > gY) { this.active = false; return 'missed'; }
  }

  draw(c) {
    c.save();
    c.translate(this.x, this.y);

    // Parachute lines
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5;
    [[-16,-26],[16,-26],[0,-30]].forEach(([px,py]) => {
      c.beginPath(); c.moveTo(0, -6); c.lineTo(px, py); c.stroke();
    });
    // Parachute canopy
    c.fillStyle = '#FF5252';
    c.beginPath();
    c.moveTo(-20, -26); c.quadraticCurveTo(0, -42, 20, -26);
    c.quadraticCurveTo(0, -34, -20, -26);
    c.closePath(); c.fill();
    c.fillStyle = '#FFEB3B';
    c.beginPath();
    c.moveTo(-9, -29); c.quadraticCurveTo(0, -38, 9, -29);
    c.quadraticCurveTo(0, -33, -9, -29);
    c.closePath(); c.fill();

    // Crate body
    c.fillStyle = '#A1662F';
    c.fillRect(-13, -6, 26, 22);
    c.strokeStyle = '#5D3A1A'; c.lineWidth = 2;
    c.strokeRect(-13, -6, 26, 22);
    c.beginPath(); c.moveTo(-13, 5); c.lineTo(13, 5); c.stroke();
    c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 16); c.stroke();
    c.font = 'bold 13px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#FFEB3B'; c.fillText('💣', 0, 5);

    c.restore();
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

    // ── Hard-mode anti-air turret state ──
    this.isTurret    = false;
    this.aimAngle    = -Math.PI / 2; // barrel points up by default
    this.charging    = 0;            // counts down warning frames; >0 = locking on
    this.muzzle      = 0;            // muzzle flash frames after firing
    this.recoil      = 0;            // barrel recoil offset
  }

  // Barrel pivot point (top-centre of the base) in world coords
  get muzzleX() { return this.x; }
  get muzzleY() { return this.groundY - 26; }

  aimAt(plane) {
    // Track the plane but keep the barrel in the upper half-circle
    const ang = Math.atan2(plane.y - this.muzzleY, plane.x - this.muzzleX);
    const clamped = clamp(ang, -Math.PI + 0.15, -0.15);
    this.aimAngle = lerpAngle(this.aimAngle, clamped, this.charging > 0 ? 0.18 : 0.06);
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
    if (this.muzzle    > 0) this.muzzle--;
    if (this.recoil    > 0) this.recoil -= 1.2;
  }

  draw(c, isTarget) {
    if (this.alpha <= 0) return;
    c.save();
    c.globalAlpha = this.alpha;

    const shk = this.shaking > 0 ? Math.sin(this.shaking * 2.5) * 5 : 0;
    c.translate(shk, this.sinkY);

    if (this.isTurret) this._drawTurretBody(c);
    else               this._drawHouseBody(c);

    this._drawLabel(c, isTarget);
    c.restore();
  }

  _drawHouseBody(c) {
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
  }

  // ── Hard-mode: anti-air gun emplacement (same hitbox as the house) ──
  _drawTurretBody(c) {
    const baseW = this.width + 10;
    const bx = this.x - baseW / 2;
    const gY = this.groundY;

    // Sandbag / concrete base (trapezoid)
    c.fillStyle = '#5b6650';
    c.beginPath();
    c.moveTo(bx, gY);
    c.lineTo(bx + 8, gY - 22);
    c.lineTo(bx + baseW - 8, gY - 22);
    c.lineTo(bx + baseW, gY);
    c.closePath(); c.fill();
    // Sandbag rows
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(bx + 6, gY - 12, baseW - 12, 3);
    c.fillStyle = '#6f7a62';
    for (let sx = bx + 6; sx < bx + baseW - 10; sx += 14) {
      c.beginPath(); c.ellipse(sx + 7, gY - 5, 7, 5, 0, 0, Math.PI*2); c.fill();
    }

    // Rotating hub
    const hubX = this.x, hubY = gY - 24;
    c.fillStyle = '#414a3a';
    c.beginPath(); c.arc(hubX, hubY, 13, Math.PI, 0); c.fill();
    c.fillStyle = '#2f3630';
    c.beginPath(); c.arc(hubX, hubY, 7, 0, Math.PI*2); c.fill();

    // Barrel (rotates to aim, recoils when firing)
    c.save();
    c.translate(hubX, hubY);
    c.rotate(this.aimAngle);
    const charging = this.charging > 0;
    const barrelLen = 30 - (this.recoil > 0 ? this.recoil : 0);
    c.fillStyle = charging && Math.floor(this.charging / 4) % 2 === 0 ? '#c0392b' : '#3a4233';
    roundRect(c, 0, -5, barrelLen, 10, 3); c.fill();
    c.fillStyle = '#2a3026';
    roundRect(c, barrelLen - 6, -6, 6, 12, 2); c.fill();
    // Muzzle flash
    if (this.muzzle > 0) {
      const fa = this.muzzle / 8;
      c.fillStyle = `rgba(255,${160 + Math.random()*80|0},40,${fa})`;
      c.beginPath(); c.arc(barrelLen + 4, 0, 7 + Math.random()*5, 0, Math.PI*2); c.fill();
    }
    c.restore();

    // Charge warning glow on the hub
    if (charging) {
      const p = 0.4 + 0.4 * Math.sin(Date.now() / 70);
      c.save();
      c.globalAlpha = p * this.alpha;
      c.fillStyle = '#FF3300';
      c.beginPath(); c.arc(hubX, hubY, 7, 0, Math.PI*2); c.fill();
      c.restore();
    }
  }

  _drawLabel(c, isTarget) {
    const by = this.y;
    // ── Word / picture label ──
    const isHinted = this.hintFlash > 0;
    const isWrong  = this.wrongFlash > 0;
    const lY  = by - 18; // drawn closer to the smaller roof
    const emoji = emojiForWord(this.word);

    // Glow / flash (reactive only)
    if (isHinted) {
      c.shadowColor = '#00FF88'; c.shadowBlur = 22;
    } else if (isWrong) {
      c.shadowColor = '#FF3333'; c.shadowBlur = 20;
    }

    if (emoji) {
      // Picture-matching mode: show the image, no English text to read.
      c.font = '30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(emoji, this.x, lY);
    } else {
      // No gold highlight for the target — every label looks the same so the
      // player must read (or listen) to find the right one. Green = hint after
      // repeated misses, red = just answered wrong; both are reactive feedback.
      c.font = `bold 13px 'Arial Rounded MT Bold', Arial`;
      const tw  = c.measureText(this.word).width;
      const pad = 9;
      const lw  = tw + pad * 2;
      const lh  = 24;
      const lx  = this.x - lw/2;
      const ly  = lY - lh/2;

      c.fillStyle = isHinted ? 'rgba(100,255,150,0.92)'
                  : isWrong  ? 'rgba(255,120,120,0.92)'
                  :            'rgba(255,255,255,0.92)';
      roundRect(c, lx, ly, lw, lh, 8);
      c.fill();

      c.fillStyle  = '#111';
      c.textAlign  = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.word, this.x, lY);
    }
    c.shadowBlur = 0;

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
    this.life = 600;            // self-destructs after ~10s
    this.smoke = [];
    this.closest = Infinity;    // tracks nearest approach, for dodge detection
    this.giveUp = false;        // once dodged, stops homing and flies off straight
  }
  update() {
    const d = dist(this.x, this.y, this.plane.x, this.plane.y);

    // Dodge detection: if it got close then the plane pulled well clear, give up.
    if (!this.giveUp) {
      if (d < this.closest) this.closest = d;
      if (this.closest < 80 && d > this.closest + 95) {
        this.giveUp = true;
      }
    }

    // Home toward the plane unless it's been shaken off.
    if (!this.giveUp) {
      const dx = this.plane.x - this.x, dy = this.plane.y - this.y;
      const dd = Math.hypot(dx, dy) || 1;
      const tvx = dx/dd * CFG.MISSILE_SPD, tvy = dy/dd * CFG.MISSILE_SPD;
      this.vx += (tvx - this.vx) * CFG.MISSILE_TURN;
      this.vy += (tvy - this.vy) * CFG.MISSILE_TURN;
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > CFG.MISSILE_SPD) { this.vx=this.vx/spd*CFG.MISSILE_SPD; this.vy=this.vy/spd*CFG.MISSILE_SPD; }
    }
    this.x += this.vx; this.y += this.vy;
    this.angle = Math.atan2(this.vy, this.vx);
    this.smoke.push({ x:this.x, y:this.y, life:1, sz: 4+Math.random()*4 });
    if (this.smoke.length > 35) this.smoke.shift();
    this.smoke.forEach(s => { s.life -= 0.04; s.sz *= 1.04; });
    this.life--;
    // Off-screen after giving up? Let it go silently.
    if (this.giveUp && (this.x < -80 || this.x > W+80 || this.y < -80 || this.y > H+80)) {
      this.active = false; return;
    }
    if (this.life <= 0) { this.active = false; return 'expire'; }  // auto-detonate
    if (d < 28 && this.plane.invincible === 0 && !this.plane.hidden) {
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
//  SHELL (anti-air cannon round — straight shot, dodgeable)
// ══════════════════════════════════════════
class Shell {
  constructor(x, y, angle, plane) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * CFG.SHELL_SPD;
    this.vy = Math.sin(angle) * CFG.SHELL_SPD;
    this.plane = plane;
    this.active = true;
    this.life = 240;
    this.trail = [];
  }
  update() {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 10) this.trail.shift();
    this.x += this.vx; this.y += this.vy;
    this.life--;
    if (this.life <= 0 || this.y > H * CFG.GROUND_RATIO || this.x < -40 || this.x > W + 40) {
      this.active = false; return;
    }
    if (dist(this.x, this.y, this.plane.x, this.plane.y) < 24 && this.plane.invincible === 0 && !this.plane.hidden) {
      this.active = false; return 'hit';
    }
  }
  draw(c) {
    for (let i = 1; i < this.trail.length; i++) {
      const a = (i / this.trail.length) * 0.5;
      c.fillStyle = `rgba(255,200,80,${a})`;
      c.beginPath(); c.arc(this.trail[i].x, this.trail[i].y, 2.5 * (i / this.trail.length), 0, Math.PI*2); c.fill();
    }
    c.save();
    c.fillStyle = '#ffcc33';
    c.shadowColor = '#ff8800'; c.shadowBlur = 8;
    c.beginPath(); c.arc(this.x, this.y, 5, 0, Math.PI*2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(this.x - this.vx*0.3, this.y - this.vy*0.3, 2.5, 0, Math.PI*2); c.fill();
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
    // More see-through overall so the button doesn't block the houses/view
    // behind it; the cyan rings still mark where to tap.
    c.globalAlpha = this.pressed>0 ? 0.7 : 0.55;

    // Outer ring fill (translucent)
    const g = c.createRadialGradient(0,0,this.r*0.35, 0,0,this.r);
    g.addColorStop(0,'rgba(0,220,255,0.06)'); g.addColorStop(1,'rgba(0,220,255,0.20)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0,0,this.r,0,Math.PI*2); c.fill();

    // Cyan outer ring border
    c.strokeStyle='rgba(0,230,255,0.92)'; c.lineWidth=4;
    c.beginPath(); c.arc(0,0,this.r,0,Math.PI*2); c.stroke();

    // Green inner circle (translucent so the house shows through)
    c.fillStyle = 'rgba(50,180,80,0.32)';
    c.beginPath(); c.arc(0,0,this.r*0.72,0,Math.PI*2); c.fill();

    // Inner ring border
    c.strokeStyle='rgba(0,230,255,0.60)'; c.lineWidth=2;
    c.beginPath(); c.arc(0,0,this.r*0.72,0,Math.PI*2); c.stroke();

    // Bomb icon (kept readable but no longer solid)
    c.fillStyle='rgba(255,255,255,0.80)';
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
// 「← 選單」返回鈕的右緣（canvas 座標）；左側 HUD 一律排在它右邊，才不會被選單蓋住
function backBtnRight() {
  const el = document.getElementById('back-to-menu');
  if (el) return el.getBoundingClientRect().right;
  return 10 + SAFE_L + 92;  // 按鈕還沒建立時的估計值
}

function drawHUD(c, game) {
  c.save();

  // ── Top bar background ──
  c.fillStyle='rgba(0,0,0,0.40)'; c.fillRect(0,0,W,50+SAFE_T);

  // ── LEFT: Pause button（排在「← 選單」鈕右邊，避免重疊）──
  const pbtnX=backBtnRight()+14, pbtnY=9, pbtnW=34, pbtnH=34;
  c.fillStyle='rgba(255,255,255,0.15)';
  roundRect(c,pbtnX,pbtnY,pbtnW,pbtnH,8); c.fill();
  c.fillStyle='white'; c.font='bold 16px Arial'; c.textBaseline='middle'; c.textAlign='center';
  c.fillText('❚❚', pbtnX+pbtnW/2, pbtnY+pbtnH/2+1);

  // ── LEFT: Score / Lives（放在暫停鈕右邊一點，不被選單蓋住）──
  const infoX = pbtnX + pbtnW + 16;
  c.font='bold 18px Arial'; c.textAlign='left'; c.fillStyle='#FFD700'; c.textBaseline='middle';
  c.fillText(`⭐ ${game.score}`, infoX, 27);

  c.font='17px Arial';
  for (let i=0; i<CFG.LIVES; i++) {
    c.globalAlpha = i < game.lives ? 1.0 : 0.20;
    c.fillText('❤', infoX+i*24, 27+18);
  }
  c.globalAlpha=1;

  // ── CENTER: Level label + theme（同一行：主題名排在 Level 右邊，不蓋住 Level 與進度格）──
  const lv = LEVELS[game.lvIdx];
  const levelTxt = `Level ${game.lvIdx+1}`;
  const fullTheme = lv ? lv.themeZH : '🏆 Complete!';
  c.textBaseline='middle'; c.textAlign='left';
  c.font='bold 16px Arial';
  const lvW = c.measureText(levelTxt).width;
  // 主題名過長就截斷，避免撞到左右兩側的分數/計時
  c.font='13px Arial';
  let themeTxt = fullTheme;
  const maxThemeW = W * 0.30;
  if (c.measureText(themeTxt).width > maxThemeW) {
    while (themeTxt.length > 1 && c.measureText(themeTxt + '…').width > maxThemeW) themeTxt = themeTxt.slice(0, -1);
    themeTxt += '…';
  }
  const thW = c.measureText(themeTxt).width;
  const lineGap = 10;
  const groupX = W/2 - (lvW + lineGap + thW) / 2;
  c.font='bold 16px Arial'; c.fillStyle='white';
  c.fillText(levelTxt, groupX, 14);
  c.font='13px Arial'; c.fillStyle='rgba(255,255,255,0.72)';
  c.fillText(themeTxt, groupX + lvW + lineGap, 14);

  // ── CENTER: 升級進度 — 答對 clearGoal 題過關，分格顯示（1│2│3）──
  const total = game.clearGoal || (lv ? lv.words.length : 3);
  const done  = Math.min(game.solvedCount, total);
  const segGap = 4;
  const barW = clamp(W*0.26, 120, 240), barH = 12, barY = 31;
  const barX = W/2 - barW/2;
  const segW = (barW - segGap*(total-1)) / total;
  for (let i = 0; i < total; i++) {
    const sx = barX + i*(segW+segGap);
    const onCell = i < done;
    c.fillStyle = onCell ? '#00E5FF' : 'rgba(255,255,255,0.18)';
    roundRect(c, sx, barY, segW, barH, 3); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.40)'; c.lineWidth = 1; roundRect(c, sx, barY, segW, barH, 3); c.stroke();
    // 格子編號 1、2、3
    c.fillStyle = onCell ? '#003844' : 'rgba(255,255,255,0.55)';
    c.font = 'bold 9px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(i+1), sx + segW/2, barY + barH/2 + 0.5);
  }

  // ── RIGHT: Timer（避開右側瀏海安全區）──
  const m=Math.floor(game.timer/60), s=game.timer%60;
  c.textAlign='right'; c.font='bold 15px Arial'; c.textBaseline='middle';
  c.fillStyle = game.timer>90 ? '#FF6B6B' : 'rgba(255,255,255,0.85)';
  c.fillText(`⏱ ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, W-14-SAFE_R, 15);

  // ── RIGHT: Bomb count (plane icon + number, like reference) ──
  // Small plane icon drawn on canvas
  const bx = W - 70 - SAFE_R, by2 = 32;
  c.save();
  c.translate(bx, by2); c.scale(0.55, 0.55);
  c.fillStyle='rgba(255,255,255,0.85)';
  c.beginPath(); c.ellipse(0,0,22,6,0,0,Math.PI*2); c.fill();
  c.beginPath(); c.moveTo(-4,1); c.lineTo(-11,-12); c.lineTo(9,-12); c.lineTo(12,1); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-18,-1); c.lineTo(-24,-9); c.lineTo(-12,-1); c.closePath(); c.fill();
  c.restore();
  c.textAlign='left'; c.font='bold 18px Arial'; c.fillStyle='white'; c.textBaseline='middle';
  c.fillText(game.bombsLeft, W-46-SAFE_R, by2);

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
// 兩顆模式鈕的中心 Y：用「按鈕高＋間距」算，數學上保證不重疊（小螢幕也不會疊）
function menuBtnYs() {
  const bh = menuBtnH();
  const gap = clamp(H * 0.045, 18, 30);
  const easyY = H * 0.46;
  return { easyY, hardY: easyY + bh + gap };
}

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
  const ys = menuBtnYs();
  [
    { label:'⭐ 簡單模式 (Easy)', y:ys.easyY, col:'rgba(40,160,80,0.88)', id:'easy' },
    { label:'🔥 困難模式 (Hard)', y:ys.hardY, col:'rgba(210,50,50,0.88)',  id:'hard' },
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
  c.fillText('點按模式開始遊戲', W/2, ys.hardY + menuBtnH()/2 + clamp(H*0.05, 22, 40));
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

  const ys = pauseBtnYs();
  [
    { label:'▶ 繼續遊戲',   y:ys.resumeY, col:'rgba(40,150,80,0.90)'  },
    { label:'🏠 回主選單', y:ys.menuY,   col:'rgba(60,60,160,0.88)' },
  ].forEach(btn => {
    const bw=PAUSE_BTN_W, bh=PAUSE_BTN_H, bx=W/2-bw/2;
    c.fillStyle=btn.col; roundRect(c,bx,btn.y-bh/2,bw,bh,15); c.fill();
    c.strokeStyle='rgba(255,255,255,0.35)'; c.lineWidth=1.5; c.stroke();
    c.fillStyle='white'; c.font='bold 22px Arial';
    c.fillText(btn.label, W/2, btn.y);
  });
  c.restore();
}

// 暫停畫面兩顆鈕：用「按鈕高＋間距」算中心 Y，保證不重疊（小螢幕也是）
const PAUSE_BTN_W = 260, PAUSE_BTN_H = 55;
function pauseBtnYs() {
  const gap = clamp(H * 0.045, 18, 30);
  const resumeY = H * 0.54;
  return { resumeY, menuY: resumeY + PAUSE_BTN_H + gap };
}

// ══════════════════════════════════════════
//  SCREEN: LEVEL CLEAR
// ══════════════════════════════════════════
// 結算等級：用「實得總分 ÷ 完美總分」的百分比換算 S/A/B/C/D
function computeGrade(game) {
  const ratio = game.perfectScore > 0 ? game.score / game.perfectScore : 0;
  if (ratio >= 0.90) return { g:'S', col:'#FFD700', tip:'完美！神準射手 🎯' };
  if (ratio >= 0.80) return { g:'A', col:'#7CFC00', tip:'厲害！火力全開 🔥' };
  if (ratio >= 0.65) return { g:'B', col:'#00E5FF', tip:'不錯！繼續加油 💪' };
  if (ratio >= 0.50) return { g:'C', col:'#FFA726', tip:'再快一點就更棒 ⏱' };
  return { g:'D', col:'#FF6B6B', tip:'多練習會更好 📚' };
}

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
  c.font='bold 46px Arial'; c.fillStyle=col;
  c.shadowColor=col; c.shadowBlur=18;
  c.fillText(title, W/2, H*0.22);
  c.shadowBlur=0;

  // 等級評分
  const grade = computeGrade(game);
  c.save();
  c.font='bold 80px "Arial Rounded MT Bold", Arial'; c.fillStyle=grade.col;
  c.shadowColor=grade.col; c.shadowBlur=28;
  c.fillText(grade.g, W/2, H*0.42);
  c.restore();
  c.font='20px Arial'; c.fillStyle='rgba(255,255,255,0.9)';
  c.fillText(grade.tip, W/2, H*0.55);

  c.font='22px Arial'; c.fillStyle='white';
  c.fillText(`最終分數 Score: ${game.score}`, W/2, H*0.63);
  const m=Math.floor(game.timer/60), s=game.timer%60;
  c.fillText(`時間 Time: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, W/2, H*0.70);

  // Restart button
  const bw=250, bh=58, bx=W/2-bw/2, by=H*0.79;
  c.fillStyle='rgba(40,140,80,0.88)'; roundRect(c,bx,by,bw,bh,16); c.fill();
  c.strokeStyle='rgba(255,255,255,0.4)'; c.lineWidth=2; c.stroke();
  c.fillStyle='white'; c.font='bold 23px Arial';
  c.fillText('再玩一次 🔄 Retry', W/2, by+bh/2);
}

// ══════════════════════════════════════════
//  SCREEN: VICTORY (all levels cleared)
// ══════════════════════════════════════════
function drawVictoryScreen(c, game) {
  // Dark overlay
  c.fillStyle = 'rgba(0,0,20,0.88)'; c.fillRect(0,0,W,H);

  // Confetti
  game.victoryConfetti.forEach(p => {
    c.save();
    c.translate(p.x, p.y); c.rotate(p.rot);
    c.fillStyle = p.col;
    if (p.isRect) c.fillRect(-p.sz/2, -p.sz*0.3, p.sz, p.sz*0.6);
    else { c.beginPath(); c.arc(0, 0, p.sz*0.5, 0, Math.PI*2); c.fill(); }
    c.restore();
  });

  c.textAlign = 'center'; c.textBaseline = 'middle';

  // Trophy — pulse animation
  const sc = 1 + Math.sin(game._victoryPhase * 0.055) * 0.08;
  c.save();
  c.translate(W/2, H * 0.13);
  c.scale(sc, sc);
  c.shadowColor = '#FFD700'; c.shadowBlur = 38;
  c.font = `${clamp(H * 0.085, 46, 70)}px Arial`;
  c.fillText('🏆', 0, 0);
  c.shadowBlur = 0;
  c.restore();

  // Title
  c.font = `bold ${clamp(H * 0.056, 32, 50)}px "Arial Rounded MT Bold", Arial`;
  c.fillStyle = '#FFD700';
  c.shadowColor = '#FF8800'; c.shadowBlur = 24;
  c.fillText('全關通過！', W/2, H * 0.25);
  c.shadowBlur = 0;

  // 等級評分 — 大字母
  const grade = computeGrade(game);
  c.save();
  c.font = `bold ${clamp(H * 0.16, 70, 120)}px "Arial Rounded MT Bold", Arial`;
  c.fillStyle = grade.col;
  c.shadowColor = grade.col; c.shadowBlur = 34;
  c.fillText(grade.g, W/2, H * 0.42);
  c.restore();
  c.font = `${clamp(H * 0.030, 18, 25)}px Arial`;
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fillText(grade.tip, W/2, H * 0.54);

  // Score
  c.font = `bold ${clamp(H * 0.038, 22, 32)}px Arial`;
  c.fillStyle = '#FFD700';
  c.fillText(`⭐ ${game.score} 分`, W/2, H * 0.62);

  // Time
  const m = Math.floor(game.timer/60), s = game.timer % 60;
  c.font = `${clamp(H * 0.024, 16, 21)}px Arial`;
  c.fillStyle = 'rgba(255,255,255,0.72)';
  c.fillText(`完成時間  ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, W/2, H * 0.68);

  // Buttons — 繼續（上排）＋ 再玩一次 / 主選單（下排）
  const r = victoryBtnRects();
  const bfs = `bold ${clamp(H * 0.030, 18, 24)}px Arial`;
  const drawBtn = (rect, fill, label) => {
    c.fillStyle = fill;
    roundRect(c, rect.x, rect.y, rect.w, rect.h, 16); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.42)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'white'; c.font = bfs; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, rect.x + rect.w/2, rect.y + rect.h/2);
  };
  drawBtn(r.cont,  'rgba(225,140,30,0.95)', '▶️ 繼續');
  drawBtn(r.retry, 'rgba(40,140,80,0.92)',  '再玩一次 🔄');
  drawBtn(r.menu,  'rgba(50,100,210,0.92)', '🏠 主選單');
}

// 勝利畫面三顆按鈕的座標（draw 與點擊判定共用，避免兩邊不同步）
function victoryBtnRects() {
  const bh = 54, gap = 16;
  const topW = clamp(W * 0.42, 220, 360);
  const botW = clamp(W * 0.34, 180, 270);
  const by1 = H * 0.74;
  const by2 = by1 + bh + gap;
  return {
    cont:  { x: W/2 - topW/2,        y: by1, w: topW, h: bh },
    retry: { x: W/2 - botW - gap/2,  y: by2, w: botW, h: bh },
    menu:  { x: W/2 + gap/2,         y: by2, w: botW, h: bh },
  };
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
    this.solvedCount = 0;  // correct houses destroyed this level
    this.clearGoal   = 5;  // destroy this many to clear (set per level)
    this.wrongAtt    = 0;  // wrong attempts this target
    this.streak      = 0;  // 連續答對數（答錯歸零），用於連擊加分
    this.totalCorrect= 0;  // 整局答對總題數（給結算等級基準用）
    this.perfectScore= 0;  // 完美基準分：每題滿分＋完美連擊＋過關獎勵的理論上限
    this.qStartT     = 0;  // 本題開始計時的時間戳（performance.now）
    this.endless     = false; // 按過「繼續」後 = true，之後打完不再跳結算
    this.levelClearT = 0;  // countdown before moving to next level
    this.planeRespawnT = 0;
    this._prevPhase  = 'playing'; // for pause/resume

    this.plane    = new Plane();
    this.bombs    = [];
    this.exps     = [];
    this.missiles = [];
    this.shells   = [];
    this.floats   = [];
    this.houses   = [];
    this.trees    = [];
    this.turretFireT = 0; // hard-mode: frames until next turret volley
    this.crate    = null; // active supply crate, if any
    this._crateCooldown = 150; // frames until another crate may spawn
    this.victoryConfetti = []; this._victoryPhase = 0;
    this._hardAutoMissileT = 360;
  }

  // ── Start ──────────────────────────────
  start(difficulty) {
    if (bombWordPool) buildLessonLevels();   // 每次開新局重洗，關卡單字組合都不同
    this.difficulty = difficulty;
    this.lvIdx     = 0;
    this.lives     = CFG.LIVES;
    this.score     = 0;
    this.timer     = 0;
    this.streak       = 0;
    this.totalCorrect = 0;
    this.perfectScore = 0;
    this.endless      = false;
    this.bombsLeft = CFG.BOMBS_PER_LEVEL;
    this.planeRespawnT = 0;
    this.phase     = 'playing';
    this.plane.reset();
    this._loadLevel();
    Audio.startBgm();
    this._startTimer();
  }

  // ── Pause / Resume ─────────────────────
  togglePause() {
    if (this.phase === 'playing') {
      this._prevPhase = 'playing';
      this.phase = 'paused';
      Audio.stopBgm();
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      Audio.startBgm();
    }
  }

  returnToMenu() {
    clearInterval(this._timerInterval);
    Audio.stopBgm();
    this.phase = 'menu';
  }

  _startTimer() {
    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      if (this.phase === 'playing') this.timer++;
    }, 1000);
  }

  // ── Load Level ─────────────────────────
  // 重洗下一輪 6 關（自選/課程題庫重新打散，預設題庫重置）
  _reshuffleRound() {
    if (bombWordPool) buildLessonLevels();
    else LEVELS = DEFAULT_LEVELS.slice(0, MAX_LEVELS).map(l => ({ ...l, words: [...l.words] }));
    this.lvIdx = 0;
  }

  // 結算後按「繼續」：開啟無限模式，保留分數/愛心/時間接著玩
  continueEndless() {
    this.endless = true;
    this._reshuffleRound();
    this.phase = 'playing';
    this.plane.reset();
    this._loadLevel();
    Audio.startBgm();
    this._startTimer();
  }

  _loadLevel() {
    const lv = LEVELS[this.lvIdx];
    if (!lv) {
      // 無限模式：打完 6 關就重洗接著玩，不再跳結算
      if (this.endless) { this._reshuffleRound(); return this._loadLevel(); }
      this.phase = 'victory'; clearInterval(this._timerInterval); Audio.stopBgm(); this._initVictoryConfetti(); return;
    }
    this.wordsLeft = [...lv.words];
    this.solvedCount = 0;
    // 留最後兩間不打：5 間打掉 3 間就通關，避免剩兩間時答案太好猜。
    this.clearGoal = Math.max(1, lv.words.length - 2);
    this.bombs = []; this.missiles = []; this.shells = []; this.exps = []; this.floats = [];
    this.turretFireT = Math.floor(lerp(CFG.TURRET_FIRE_MIN, CFG.TURRET_FIRE_MAX, Math.random())) + 90;
    this.wrongAtt  = 0;
    this.planeRespawnT = 0;
    this.plane.hidden = false;
    this.bombsLeft = CFG.BOMBS_PER_LEVEL; // refill bombs each level
    this.crate = null;
    this._crateCooldown = 150;
    this._hardAutoMissileT = Math.floor(lerp(200, 340, Math.random()));
    this._buildScene(lv.words);
    this._nextTarget();            // pick + read aloud the first target of the level
  }

  _buildScene(words) {
    const gY = H * CFG.GROUND_RATIO;
    const n  = words.length;
    const spacing = W / (n + 1);
    const turret = this.difficulty === 'hard';
    this.houses = words.map((w, i) => {
      const h = new House(spacing + i * spacing, gY, w, i);
      h.isTurret = turret;
      return h;
    });

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
    this.qStartT = performance.now();   // 本題開始計時：答得越快速度分越高
    Audio.speak(this.targetWord);   // 進場 / 換題：唸出目標單字
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
    const bonus = 50;            // 過關固定獎勵（快慢已反映在每題速度分上）
    this.score += bonus;
    this.perfectScore += bonus;  // 完美基準同步加，等級換算才準
    this.phase = 'levelClear';
    Audio.levelClear();
    this.levelClearT = 150; // ~2.5s at 60fps
  }

  // ── Plane crash (ground or house): explode, lose a life, respawn ──
  _crashPlane() {
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

  // ── Lose Life ──────────────────────────
  _loseLife() {
    this.lives = Math.max(0, this.lives - 1);
    this.plane.invincible = 110;
    this.plane.shake();
    Audio.hit();
    if (this.lives <= 0) { this.phase = 'gameOver'; clearInterval(this._timerInterval); Audio.stopBgm(); }
  }

  // ── Float Text ─────────────────────────
  _float(x, y, txt, col, sz=22) { this.floats.push(new FloatText(x, y, txt, col, sz)); }

  // ══════════════════════════════════════
  //  UPDATE
  // ══════════════════════════════════════
  update() {
    if (this.phase === 'paused') return;
    if (this.phase === 'victory') { this._updateVictoryConfetti(); return; }
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
      planeEvent = this.plane.update(getControl());
      if (planeEvent === 'ground') {
        this._crashPlane();
      } else if (this.plane.invincible === 0) {
        // 撞到還沒被炸掉的房子 → 爆炸墜機（和撞地面一樣）
        const pb = this.plane.getBounds();
        for (const h of this.houses) {
          if (h.destroyed) continue;
          if (pb.x < h.x + h.width/2 && pb.x + pb.w > h.x - h.width/2 &&
              pb.y + pb.h > h.y && pb.y < h.groundY) {
            this._crashPlane();
            break;
          }
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
          // 單題速度分：2 秒內答對 = 滿分 100，之後每秒 −12，最低 10
          const qSec = (performance.now() - this.qStartT) / 1000;
          const speedPts = clamp(Math.round(100 - Math.max(0, qSec - 2) * 12), 10, 100);
          // 連擊加分：連續答對第 2 題起額外加分，每題 +5 遞增，上限 +25；答錯歸零
          this.streak++;
          this.totalCorrect++;
          const comboPts = this.streak >= 2 ? Math.min((this.streak - 1) * 5, 25) : 0;
          this.score += speedPts + comboPts;
          // 完美基準（給結算等級換算）：每題理論滿分 100 ＋ 完美連擊
          const perfectCombo = this.totalCorrect >= 2 ? Math.min((this.totalCorrect - 1) * 5, 25) : 0;
          this.perfectScore += 100 + perfectCombo;
          this._float(h.x, h.y - 30, `✅ +${speedPts}`, '#FFD700', 24);
          if (comboPts > 0) this._float(h.x, h.y - 58, `🔥 連擊 ×${this.streak}  +${comboPts}`, '#FF8C00', 20);
          Audio.success();
          this.wordsLeft = this.wordsLeft.filter(w => w !== h.word);
          this.solvedCount++;
          if (this.solvedCount >= this.clearGoal) {
            setTimeout(() => { if (this.phase==='playing') this._levelClear(); }, 900);
          } else {
            setTimeout(() => { if (this.phase==='playing') this._nextTarget(); }, 900);
          }
        } else {
          // ❌ WRONG
          h.shaking = 2.5; h.wrongFlash = 40; h.wrongBubble = 60;
          Audio.wrong();
          this.wrongAtt++;
          this.streak = 0;   // 答錯：連擊中斷歸零

          if (this.difficulty === 'easy') {
            // Easy mode: no penalty — no life lost, no time added. The enemy
            // just fires a missile the player has to dodge.
            this._float(h.x, h.y - 30, '❌ 再試一次', '#FF5555', 20);
          } else {
            this.timer += CFG.WRONG_PENALTY_S;
            this._float(h.x, h.y - 30, `+${CFG.WRONG_PENALTY_S}s ⏱`, '#FF5555', 20);
            this._loseLife();
          }

          // Wrong answer fires a homing missile in both modes
          const missile = new Missile(h.x, h.y, this.plane);
          missile.sourceHouse = h;            // don't let it blow up the house that fired it
          this.missiles.push(missile);
          Audio.missile();
          this._float(h.x, h.y - 60, '🚀 MISSILE!', '#FF3300', 18);

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

      // A missile that flies into a house just detonates on impact — it blows up
      // (explosion + boom) but the house takes no damage. Only the player's own
      // dropped bombs decide right/wrong. Skip the house that fired it (the
      // missile spawns on top of it) and any already-destroyed ones.
      if (m.active) {
        for (const h of this.houses) {
          if (h.destroyed || h === m.sourceHouse) continue;
          if (m.x > h.x - h.width/2 && m.x < h.x + h.width/2 && m.y > h.y && m.y < h.groundY) {
            m.active = false;
            this.exps.push(new Explosion(m.x, m.y, false));
            Audio.explosion();
            break;
          }
        }
      }

      if (!m.active) {
        if (r === 'hit') {
          this.exps.push(new Explosion(m.x, m.y, false));
          Audio.explosion();
          this._loseLife();
          this._float(this.plane.x, this.plane.y - 40, '💥 HIT!', '#FF3300', 26);
        } else if (r === 'expire') {
          // Timed out — detonates harmlessly in the air
          this.exps.push(new Explosion(m.x, m.y, false));
          Audio.explosion();
        }
        this.missiles.splice(i, 1);
      }
    }

    // Anti-air turrets (hard mode only)
    if (this.difficulty === 'hard') this._updateTurrets();
    // Hard-mode level 2+ auto homing missiles
    if (this.difficulty === 'hard' && this.lvIdx >= 1) this._updateHardMissiles();

    // Shells
    for (let i = this.shells.length-1; i >= 0; i--) {
      const s = this.shells[i];
      const r = s.update();
      if (!s.active) {
        if (r === 'hit') {
          this.exps.push(new Explosion(s.x, s.y, false));
          Audio.explosion();
          this._loseLife();
          this._float(this.plane.x, this.plane.y - 40, '💥 HIT!', '#FF3300', 26);
        }
        this.shells.splice(i, 1);
      }
    }

    // Explosions & floats
    this.exps.forEach(e=>e.update()); this.exps=this.exps.filter(e=>!e.done);
    this.floats.forEach(f=>f.update()); this.floats=this.floats.filter(f=>f.life>0);

    // Supply crate — spawns when bombs run low, refills on pickup
    this._updateCrate();

    bombButton.update();
  }

  _updateCrate() {
    if (!this.crate) {
      if (this._crateCooldown > 0) { this._crateCooldown--; return; }
      if (this.bombsLeft <= CFG.CRATE_LOW_THRESHOLD && this.bombsLeft < CFG.BOMBS_PER_LEVEL) {
        this.crate = new SupplyCrate(60 + Math.random() * (W - 120));
        this._float(this.crate.x, 50, '📦 Supply incoming!', '#33CCFF', 18);
      }
      return;
    }
    const r = this.crate.update();
    if (!this.plane.hidden && dist(this.plane.x, this.plane.y, this.crate.x, this.crate.y) < CFG.CRATE_PICKUP_R) {
      this.bombsLeft = Math.min(CFG.BOMBS_PER_LEVEL, this.bombsLeft + CFG.CRATE_BOMBS);
      this._float(this.crate.x, this.crate.y - 20, `📦 +${CFG.CRATE_BOMBS} 💣`, '#33FF99', 22);
      Audio.cratePickup();
      this.crate = null;
      this._crateCooldown = Math.floor(lerp(CFG.CRATE_COOLDOWN_MIN, CFG.CRATE_COOLDOWN_MAX, Math.random()));
    } else if (r === 'missed') {
      this.crate = null;
      this._crateCooldown = Math.floor(lerp(CFG.CRATE_COOLDOWN_MIN, CFG.CRATE_COOLDOWN_MAX, Math.random()));
    }
  }

  // ── Hard-mode turret fire scheduler ──
  _updateTurrets() {
    const live = this.houses.filter(h => !h.destroyed);
    if (live.length === 0) return;

    // Living turrets slowly track the plane; charging ones lock & fire.
    live.forEach(h => {
      if (this.plane.hidden) { h.charging = 0; return; }
      h.aimAt(this.plane);
      if (h.charging > 0) {
        h.charging--;
        if (h.charging === 0) this._turretFire(h);
      }
    });

    // Don't pile on a downed/respawning plane.
    if (this.plane.hidden || this.planeRespawnT > 0) return;

    this.turretFireT--;
    if (this.turretFireT <= 0) {
      const ready = live.filter(h => h.charging === 0 && h.muzzle === 0);
      if (ready.length) {
        // Usually 1 turret, occasionally 2 — never every turret at once.
        const batch = (ready.length > 2 && Math.random() < 0.3) ? 2 : 1;
        for (let k = 0; k < Math.min(batch, CFG.TURRET_BATCH_MAX, ready.length); k++) {
          const pick = ready.splice(Math.floor(Math.random()*ready.length), 1)[0];
          pick.charging = CFG.TURRET_CHARGE;
        }
        Audio.turretCharge();
      }
      this.turretFireT = Math.floor(lerp(CFG.TURRET_FIRE_MIN, CFG.TURRET_FIRE_MAX, Math.random()));
    }
  }

  _turretFire(h) {
    if (h.destroyed || this.phase !== 'playing') return;
    h.muzzle = 8;
    h.recoil = 10;
    // Fire along the barrel's locked direction (straight shot, so it's dodgeable).
    this.shells.push(new Shell(h.muzzleX, h.muzzleY, h.aimAngle, this.plane));
    Audio.cannon();
  }

  // ── Hard-mode level 2+ auto homing missile ──
  _updateHardMissiles() {
    if (this.plane.hidden || this.planeRespawnT > 0) return;
    if (this._hardAutoMissileT > 0) { this._hardAutoMissileT--; return; }
    const live = this.houses.filter(h => !h.destroyed);
    if (!live.length) { this._hardAutoMissileT = 180; return; }
    const src = live[Math.floor(Math.random() * live.length)];
    const missile = new Missile(src.x, src.muzzleY, this.plane);
    missile.sourceHouse = src;
    this.missiles.push(missile);
    Audio.missile();
    this._float(src.x, src.muzzleY - 30, '🚀 追蹤導彈！', '#FF3300', 18);
    // Interval: ~5-8s at level 2, shortens slightly each level thereafter
    const base = Math.max(200, 360 - this.lvIdx * 25);
    this._hardAutoMissileT = Math.floor(lerp(base * 0.75, base * 1.4, Math.random()));
  }

  // ── Victory confetti ──
  _initVictoryConfetti() {
    const cols = ['#FFD700','#FF6B6B','#00E5FF','#69F0AE','#FF80AB','#FFAB40','#CE93D8'];
    this.victoryConfetti = Array.from({length: 75}, (_, idx) => ({
      x: Math.random() * W,
      y: Math.random() < 0.55 ? Math.random() * H : -20 - Math.random() * 80,
      vy: 1.2 + Math.random() * 2.5,
      vx: (Math.random() - 0.5) * 1.8,
      col: cols[idx % cols.length],
      sz: 5 + Math.random() * 9,
      rot: Math.random() * Math.PI * 2,
      rotSpd: (Math.random() - 0.5) * 0.13,
      isRect: Math.random() < 0.6,
    }));
    this._victoryPhase = 0;
    Audio.levelClear();
  }

  _updateVictoryConfetti() {
    this._victoryPhase++;
    this.victoryConfetti.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rotSpd;
      if (p.y > H + 20) { p.y = -15; p.x = Math.random() * W; }
    });
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

    // Supply crate
    if (this.crate) this.crate.draw(c);

    // Missiles
    this.missiles.forEach(m => m.draw(c));

    // Shells (turret fire)
    this.shells.forEach(s => s.draw(c));

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
    if (this.phase === 'victory')    drawVictoryScreen(c, this);
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
  const ys = menuBtnYs();
  if (x>bx && x<bx+bw && y>ys.easyY-bh/2 && y<ys.easyY+bh/2) game.start('easy');
  if (x>bx && x<bx+bw && y>ys.hardY-bh/2 && y<ys.hardY+bh/2) game.start('hard');
}

function hitEndScreen(x, y) {
  const bw=250, bh=58, bx=W/2-bw/2, by=H*0.79;
  if (x>bx && x<bx+bw && y>by && y<by+bh) { game=new Game(); resizeCanvas(); }
}

function hitVictoryScreen(x, y) {
  const r = victoryBtnRects();
  const inside = (b) => x > b.x && x < b.x+b.w && y > b.y && y < b.y+b.h;
  // 繼續：無限續玩，分數/愛心都保留，之後打完不再跳結算
  if (inside(r.cont)) { game.continueEndless(); return; }
  // 再玩一次：相同難度從第 1 關重來
  if (inside(r.retry)) {
    const d = game.difficulty;
    game = new Game(); resizeCanvas();
    game.start(d);
    return;
  }
  // 主選單：回主選單
  if (inside(r.menu)) { game = new Game(); resizeCanvas(); }
}

function hitPauseScreen(x, y) {
  const bw=PAUSE_BTN_W, bh=PAUSE_BTN_H, bx=W/2-bw/2;
  const ys = pauseBtnYs();
  // Resume
  if (x>bx && x<bx+bw && y>ys.resumeY-bh/2 && y<ys.resumeY+bh/2) game.togglePause();
  // Main menu
  if (x>bx && x<bx+bw && y>ys.menuY-bh/2 && y<ys.menuY+bh/2) { game.returnToMenu(); game=new Game(); resizeCanvas(); }
}

function hitWordPanel(x, y) {
  // 按題目面板（含 🔊 喇叭）重播目標單字發音
  if (game.phase !== 'playing' || !game.targetWord) return;
  const pw=210, ph=42, px=W/2-pw/2, py=55;
  if (x>px && x<px+pw && y>py && y<py+ph) Audio.speak(game.targetWord);
}

function hitPauseBtn(x, y) {
  // Pause button: 跟著「← 選單」鈕右邊位移，多給一點觸控容錯
  const px = backBtnRight() + 14;
  if (x>px-6 && x<px+40 && y>5 && y<47) game.togglePause();
}

function handleStart(touches) {
  Audio.unlockSpeech();  // 第一次觸碰：在使用者手勢內解鎖 iOS 語音
  Audio.primeSpeech();   // 第一次觸碰：確保背景音樂開始播放
  for (const t of touches) {
    const {clientX:x, clientY:y} = t;
    if (game.phase==='paused')  { hitPauseScreen(x,y); continue; }
    joystick.tryStart(t);
    if (bombButton.tryPress(t) && game.phase==='playing') game.dropBomb();
    if (game.phase==='menu')                              hitMenu(x,y);
    if (game.phase==='gameOver')   hitEndScreen(x,y);
    if (game.phase==='victory')    hitVictoryScreen(x,y);
    if (game.phase==='playing')                           hitPauseBtn(x,y);
    hitWordPanel(x,y);
  }
}

canvas.addEventListener('touchstart', e => { e.preventDefault(); handleStart(e.changedTouches); }, {passive:false});
canvas.addEventListener('touchmove',  e => { e.preventDefault(); for(const t of e.changedTouches) joystick.move(t); }, {passive:false});
canvas.addEventListener('touchend',   e => { e.preventDefault(); Audio.unlockSpeech(); for(const t of e.changedTouches){ joystick.end(t); bombButton.release(t); } }, {passive:false});

// Mouse fallback (desktop testing)
let mDown=false;
canvas.addEventListener('mousedown', e => {
  mDown=true; Audio.unlockSpeech(); Audio.primeSpeech();
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

// ── Keyboard controls (desktop): WASD / arrows to steer, Space to bomb, Esc/P to pause ──
const keys = {};
function getControl() {
  let dx = 0, dy = 0;
  if (keys['ArrowLeft']  || keys['KeyA']) dx -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
  if (keys['ArrowUp']    || keys['KeyW']) dy -= 1;
  if (keys['ArrowDown']  || keys['KeyS']) dy += 1;
  if (dx || dy) {
    const d = Math.hypot(dx, dy) || 1;
    return { active: true, dx: dx/d, dy: dy/d };
  }
  return joystick; // fall back to touch joystick
}
const STEER_KEYS = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD','Space'];
window.addEventListener('keydown', e => {
  if (STEER_KEYS.includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  Audio.primeSpeech();
  if (e.code === 'Space' && !e.repeat && game.phase === 'playing') game.dropBomb();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat &&
      (game.phase === 'playing' || game.phase === 'paused')) game.togglePause();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

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
//  iOS 語音用：透明 DOM 按鈕層
//  canvas 的 touch 無法解鎖 iOS speechSynthesis，只有真實 <button> 的 click 才行
//  （挖金礦就是靠真實按鈕才唸得出來）。視覺仍由 canvas 畫，這些按鈕透明疊在上面：
//    ・選難度 → 真實 click：解鎖語音 + 開始遊戲 + 進場唸第一個單字
//    ・🔊     → 真實 click：重播目前目標單字
// ══════════════════════════════════════════
const _speechOverlay = (() => {
  const root = document.body || document.documentElement;
  function mkBtn(label) {
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', label);
    el.style.cssText = 'position:fixed;z-index:9000;margin:0;padding:0;border:none;'
      + 'background:transparent;color:transparent;font:inherit;cursor:pointer;'
      + 'display:none;-webkit-tap-highlight-color:transparent;';
    root.appendChild(el);
    return el;
  }
  function place(el, x, y, w, h) {
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.width = w + 'px'; el.style.height = h + 'px';
  }
  const easyBtn  = mkBtn('選擇簡單模式');
  const hardBtn  = mkBtn('選擇困難模式');
  const speakBtn = mkBtn('播放單字發音');
  easyBtn.addEventListener('click',  () => { Audio.unlockSpeech(); if (game.phase === 'menu') game.start('easy'); });
  hardBtn.addEventListener('click',  () => { Audio.unlockSpeech(); if (game.phase === 'menu') game.start('hard'); });
  speakBtn.addEventListener('click', () => { Audio.unlockSpeech(); if (game.phase === 'playing' && game.targetWord) Audio.speak(game.targetWord); });

  return function sync() {
    if (game.phase === 'menu') {
      const bw = menuBtnW(), bh = menuBtnH(), bx = W/2 - bw/2;
      place(easyBtn, bx, H*0.50 - bh/2, bw, bh); easyBtn.style.display = 'block';
      place(hardBtn, bx, H*0.64 - bh/2, bw, bh); hardBtn.style.display = 'block';
    } else {
      easyBtn.style.display = 'none'; hardBtn.style.display = 'none';
    }
    if (game.phase === 'playing' && game.targetWord) {
      const pw = 210, ph = 42, px = W/2 - pw/2, py = 55;
      place(speakBtn, px, py, pw, ph); speakBtn.style.display = 'block';
    } else {
      speakBtn.style.display = 'none';
    }
  };
})();

// ══════════════════════════════════════════
//  MAIN LOOP
// ══════════════════════════════════════════
// 固定步長累加器：邏輯恆定跑 60 次/秒，不管畫面幾 fps。
// 手機掉幀時一幀補跑多步，120Hz 平板則隔幀才更新——三邊速度因此一致。
const _STEP = 1000 / 60;
let _lastT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
let _acc = 0;
function loop(now) {
  if (now === undefined) now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let dt = now - _lastT;
  _lastT = now;
  if (dt > 250) dt = 250;          // 切分頁回來/卡頓時夾住，避免一次補太多步
  _acc += dt;
  let steps = 0;
  while (_acc >= _STEP && steps < 5) { game.update(); _acc -= _STEP; steps++; }
  if (steps === 5) _acc = 0;       // 補不完就放棄積欠，別陷入死亡螺旋
  game.draw(ctx);
  _speechOverlay();
  requestAnimationFrame(loop);
}

resizeCanvas();
loop();
document.addEventListener('visibilitychange',()=>{ if(document.hidden&&game&&game.phase==='playing')game.togglePause(); });

/* 返回選單按鈕：記住目前單字，返回時帶回主機 */
(function(){
  function rawFromHash(){ const h=location.hash.startsWith('#')?location.hash.slice(1):location.hash; return h?(new URLSearchParams(h).get('lessonData')||''):''; }
  let LESSON_RAW=rawFromHash();
  window.addEventListener('message',e=>{ if(e.data&&e.data.type==='BOMB_DATA'&&e.data.payload){ try{ LESSON_RAW=JSON.stringify(e.data.payload); }catch(_){} } });
  function backToMenu(){
    location.href='../index.html'+(LESSON_RAW?'#lessonData='+encodeURIComponent(LESSON_RAW):'');
  }
  const b=document.createElement('button');
  b.type='button'; b.id='back-to-menu'; b.textContent='← 選單'; b.setAttribute('aria-label','返回遊戲選單');
  b.style.cssText='position:fixed;top:calc(10px + env(safe-area-inset-top, 0px));left:calc(10px + env(safe-area-inset-left, 0px));z-index:99999;padding:7px 13px;font-size:14px;line-height:1;color:#e2e8f0;background:rgba(15,23,42,0.72);border:1px solid rgba(255,255,255,0.28);border-radius:999px;cursor:pointer;font-family:inherit;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);';
  b.addEventListener('click',backToMenu);
  b.addEventListener('mouseenter',()=>{ b.style.background='rgba(250,204,21,0.92)'; b.style.color='#1f2937'; });
  b.addEventListener('mouseleave',()=>{ b.style.background='rgba(15,23,42,0.72)'; b.style.color='#e2e8f0'; });
  (document.body||document.documentElement).appendChild(b);
})();
