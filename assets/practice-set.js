/* Today's vocabulary picker and local PNG card. No account or upload required. */
window.PracticeSet = (() => {
  'use strict';
  const STORE = 'sg_practice_sets_v1';
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const keyOf = w => text(w.word || w.en).toLowerCase();
  function normalize(words) {
    const seen = new Set();
    return (Array.isArray(words) ? words : []).flatMap(item => {
      if(!item || typeof item !== 'object') return [];
      const word = text(item.word || item.en || item.phrase);
      const chinese = text(item.chinese || item.zh || item.meaning || item.translation || item.definition);
      const key = word.toLowerCase();
      if(!word || !chinese || seen.has(key)) return [];
      seen.add(key);
      return [{word, chinese, emoji:text(item.emoji || item.icon || item.sticker),
        sentence:text(item.sentence || item.example), pos:text(item.pos || item.part_of_speech),
        avoidWith:Array.isArray(item.avoidWith) ? item.avoidWith.map(text).filter(Boolean) : []}];
    });
  }
  function sourceKey(source) {
    const value = JSON.stringify([source.builtin === true, source.title, normalize(source.words)]);
    let hash = 2166136261;
    for(let i=0;i<value.length;i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(36);
  }
  function isPayload(data) {
    return !!(data && data.practice && data.practice.version === 1 &&
      typeof data.practice.sourceTitle === 'string' && Array.isArray(data.words) &&
      data.words.length > 0 && data.words.length <= 10 && normalize(data.words).length === data.words.length &&
      (!data.practice.themeIds || (Array.isArray(data.practice.themeIds) && data.practice.themeIds.every(id => typeof id === 'string'))));
  }
  function taipeiDate() {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
    const value = type => parts.find(p => p.type === type).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  function create({getSource, initial, speak, onChange}) {
    const $ = id => document.getElementById('practice-' + id);
    let source, catalog = [], selected = [], mode = 'all', cache = {}, currentKey = '';
    let imageURL = '', generation = 0;
    try { cache = JSON.parse(sessionStorage.getItem(STORE) || '{}'); } catch(e) {}
    if(!cache || Array.isArray(cache) || typeof cache !== 'object') cache = {};

    function save() {
      cache[currentKey] = {mode, words:selected};
      const entries = Object.entries(cache).slice(-12);
      try { sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries(entries))); } catch(e) {}
    }
    function message(value, focus = false) {
      $('message').textContent = value;
      if(focus) { $('message').focus(); $('message').scrollIntoView({block:'center'}); }
    }
    function invalidateCard() {
      generation++;
      $('download').hidden = true;
      $('download').removeAttribute('href');
      $('card-image').hidden = true;
      $('card-image').removeAttribute('src');
      if(imageURL) { URL.revokeObjectURL(imageURL); imageURL = ''; }
    }
    function closeCard() {
      invalidateCard();
      $('card-panel').hidden = true;
    }
    function paintSelection() {
      const keys = new Set(selected.map(keyOf));
      $('words').querySelectorAll('input').forEach(input => {
        input.checked = keys.has(input.value);
        input.disabled = selected.length >= 10 && !input.checked;
        input.closest('.practice-word').classList.toggle('selected', input.checked);
      });
      $('count').textContent = `已選 ${selected.length}／10 字`;
      $('chosen').textContent = selected.length ? '這次練習：' + selected.map(w => w.word).join(' · ') : '從下方勾選，或用分組快選開始。';
      $('clear').disabled = selected.length === 0;
      ['play','image','copy'].forEach(id => { $(id).disabled = !selected.length; });
    }
    function changed() {
      closeCard();
      $('link-fallback').hidden = true;
      message('');
      paintSelection(); save(); onChange();
    }
    function renderCatalog() {
      $('words').replaceChildren(); $('batch').replaceChildren();
      for(let i=0;i<catalog.length;i+=10) {
        const option = document.createElement('option');
        option.value = String(i); option.textContent = `第 ${i+1}～${Math.min(i+10,catalog.length)} 字`;
        $('batch').appendChild(option);
      }
      $('apply').disabled = !catalog.length; $('batch').disabled = !catalog.length;
      const fragment = document.createDocumentFragment();
      catalog.forEach(w => {
        const row = document.createElement('div'); row.className = 'practice-word';
        const label = document.createElement('label');
        const input = document.createElement('input'); input.type = 'checkbox'; input.value = keyOf(w);
        const copy = document.createElement('span');
        const en = document.createElement('strong'); en.lang = 'en'; en.textContent = (w.emoji ? w.emoji + ' ' : '') + w.word;
        const zh = document.createElement('small'); zh.textContent = w.chinese;
        copy.append(en, zh); label.append(input, copy);
        input.addEventListener('change', () => {
          if(input.checked && selected.length < 10) selected.push(w);
          else selected = selected.filter(item => keyOf(item) !== keyOf(w));
          changed();
        });
        const audio = document.createElement('button'); audio.type = 'button'; audio.className = 'practice-listen';
        audio.setAttribute('aria-label', '聽 ' + w.word + ' 的發音'); audio.title = '聽發音';
        audio.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4V4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
        audio.addEventListener('click', () => speak(w.word));
        row.append(label, audio); fragment.appendChild(row);
      });
      $('words').appendChild(fragment);
    }
    function renderMode() {
      $('panel').hidden = source.builtin !== true;
      $('daily').disabled = source.builtin !== true;
      $('all').textContent = `全部 ${catalog.length} 字`;
      $('all').setAttribute('aria-pressed', String(mode === 'all'));
      $('daily').setAttribute('aria-pressed', String(mode === 'daily'));
      $('picker').hidden = mode !== 'daily';
      $('description').textContent = mode === 'daily'
        ? `${source.title}｜選好的字會固定使用，換遊戲、重玩都沿用同一組。`
        : '沿用整個範圍的出題方式；切換「今日 10 字」可以挑選今天要練的字。';
      paintSelection();
    }
    function refreshSource(payload = null) {
      source = getSource(); currentKey = sourceKey(source);
      const saved = cache[currentKey];
      // Focused practice is only available for built-in topics, including restored lists.
      const builtin = source.builtin === true;
      mode = builtin && (payload || saved?.mode === 'daily' || (!saved && mode === 'daily')) ? 'daily' : 'all';
      selected = builtin ? normalize(payload ? payload.words : saved?.words).slice(0,10) : [];
      // Preserve the exact shared snapshot even if a word's definition later changes.
      const snapshots = new Map(selected.map(w => [keyOf(w),w]));
      catalog = normalize(source.words).map(w => snapshots.get(keyOf(w)) || w);
      const present = new Set(catalog.map(keyOf));
      selected.forEach(w => { if(!present.has(keyOf(w))) catalog.push(w); });
      renderCatalog(); renderMode(); changed();
    }
    function raw() {
      if(source.builtin !== true || mode !== 'daily' || !selected.length) return null;
      return JSON.stringify({unitTitle:`${source.title}・今日 ${selected.length} 字`, builtin:source.builtin === true,
        words:selected, practice:{version:1, sourceTitle:source.title, sourceKey:currentKey, themeIds:source.themeIds || []}});
    }
    function canLaunch(base) {
      if(!selected.length) { message('請先選至少 1 個單字，再開始遊戲。', true); return false; }
      const name = base.split('/').pop();
      const minimum = {'tank.html':4,'runner.html':4,'ship.html':4,'battle.html':4,'sniper.html':5}[name] || 1;
      let count = selected.length;
      if(name === 'battle.html') count = selected.filter(w => !['pillow','eraser','towel'].includes(keyOf(w))).length;
      if(name === 'word-hunt-vocab.html') count = selected.filter(w => /^[a-z]{2,9}$/i.test(w.word)).length;
      if(name === 'bomb.html') count = selected.filter(w => w.word.length <= 18).length;
      if(count < minimum) {
        message(name === 'word-hunt-vocab.html' ? '單字獵人至少需要 1 個由 2～9 個英文字母組成的單字；可以改選其他遊戲。'
          : name === 'bomb.html' ? '炸彈英文需要至少 1 個不超過 18 字元的單字；可以改玩挖金礦或殭屍堡壘。'
          : `這款遊戲至少需要 ${minimum} 個可用單字，目前有 ${count} 個。請再選幾個字，或改玩挖金礦、炸彈英文、殭屍堡壘。`, true);
        return false;
      }
      return true;
    }
    ['all','daily'].forEach(value => $(value).addEventListener('click', () => {
      if(value === 'daily' && source.builtin !== true) return;
      mode = value; renderMode(); changed();
    }));
    $('clear').addEventListener('click', () => { selected = []; changed(); });
    $('apply').addEventListener('click', () => {
      const start = Number($('batch').value); selected = catalog.slice(start, start+10); changed();
    });
    $('play').addEventListener('click', () => {
      const heading = document.getElementById('game-list-title');
      heading.tabIndex = -1; heading.focus(); heading.scrollIntoView({block:'start'});
    });
    $('copy').addEventListener('click', async () => {
      const data = raw(); if(!data) return;
      // Use the public home even when the teacher is working in a local preview.
      const link = 'https://studentgames.pages.dev/#lessonData=' + encodeURIComponent(data);
      $('link').value = link; $('copy').disabled = true;
      try {
        if(!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(link);
        message(raw() === data ? '已複製練習連結。傳給家長後，打開就會是這組單字。' : '已複製剛才的清單；目前選字已變更，請重新複製。');
      } catch(e) {
        $('link-fallback').hidden = false; $('link').focus(); $('link').select();
        message('請長按連結，或按 Ctrl／⌘ + C 複製。');
      } finally { $('copy').disabled = !selected.length; }
    });
    $('date').value = taipeiDate();
    $('image').addEventListener('click', () => {
      if(!selected.length) return;
      $('card-panel').hidden = false; generateImage();
      $('card-panel').scrollIntoView({block:'start'});
    });
    $('card-close').addEventListener('click', () => { closeCard(); $('image').focus(); });
    $('card-form').addEventListener('submit', e => { e.preventDefault(); generateImage(); });
    $('card-form').addEventListener('input', () => {
      invalidateCard(); $('card-status').textContent = '內容已變更，按「更新圖片」即可產生新卡片。';
    });
    async function generateImage() {
      if(!selected.length || !$('card-form').reportValidity()) return;
      invalidateCard(); const token = generation;
      $('card-update').disabled = true; $('card-status').textContent = '正在製作圖片…';
      try {
        const canvas = drawCard({title:source.title, words:selected.slice(), date:$('date').value,
          className:$('class').value.trim(), note:$('note').value.trim()});
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if(token !== generation) return;
        if(!blob) throw new Error('Could not encode image');
        imageURL = URL.createObjectURL(blob);
        const img = $('card-image');
        img.src = imageURL; img.width = canvas.width; img.height = canvas.height;
        img.alt = `今日練習內容，${source.title}，${$('date').value}。` + selected.map(w => `${w.word}：${w.chinese}`).join('；');
        img.hidden = false;
        $('download').href = imageURL; $('download').download = `今日單字-${$('date').value}-${selected.length}字.png`; $('download').hidden = false;
        $('card-status').textContent = '圖片已做好，可直接截圖或下載 PNG；手機也可長按圖片儲存。內容是練習範圍，不代表已完成或已學會。';
        img.scrollIntoView({block:'center'});
      } catch(e) {
        if(token === generation) $('card-status').textContent = '圖片未能產生，請再按一次「更新圖片」。';
      } finally { $('card-update').disabled = false; }
    }
    refreshSource(initial);
    return {refreshSource:() => refreshSource(), isDaily:() => mode === 'daily', words:() => selected.slice(), raw, canLaunch, notify:onChange};
  }

  function drawCard({title, words, date, className, note}) {
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    const family = 'Arial, "PingFang TC", "Microsoft JhengHei", sans-serif';
    const font = (size, weight = 400) => { ctx.font = `${weight} ${size}px ${family}`; };
    function wrap(value, width, size, weight = 400) {
      font(size, weight);
      const lines = []; let line = '';
      // Keep ordinary English words together; split only tokens too wide for a cell.
      for(const token of String(value).split(/(\s+)/)) {
        if(ctx.measureText(line + token).width <= width) { line += token; continue; }
        if(line.trim()) lines.push(line.trim()); line = '';
        for(const char of Array.from(token.trimStart())) {
          if(line && ctx.measureText(line + char).width > width) { lines.push(line); line = ''; }
          line += char;
        }
      }
      if(line.trim()) lines.push(line.trim());
      return lines;
    }
    const titleLines = wrap(title, 952, 36, 700);
    const classLines = className ? wrap('班級／學生：' + className, 952, 30) : [];
    const noteLines = note ? wrap(note, 888, 32) : [];
    const cells = words.map(w => ({...w, en:wrap(w.word, 342, 42, 700), zh:wrap(w.chinese, 342, 32)}));
    const rows = [];
    for(let i=0;i<cells.length;i+=2) {
      const pair = cells.slice(i,i+2);
      rows.push({cells:pair, height:Math.max(...pair.map(w => 56 + w.en.length*50 + w.zh.length*42), 160)});
    }
    const top = 242 + titleLines.length*46 + classLines.length*40;
    const listHeight = rows.reduce((sum,row) => sum + row.height + 18, 0);
    const footerHeight = note ? 104 + noteLines.length*42 : 0;
    canvas.width = 1080; canvas.height = top + listHeight + footerHeight + 108;
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#124f47'; ctx.fillRect(0,0,1080,18);
    function print(value, x, y, size, color, weight = 400) {
      font(size,weight); ctx.fillStyle = color; ctx.fillText(value,x,y);
    }
    print("TODAY'S WORDS",64,78,24,'#28675e',700);
    print('今日練習內容',64,151,64,'#133b35',700);
    print(`${date.replace(/-/g,' / ')}    ·    ${words.length} 個單字`,64,207,30,'#50675f');
    let y = 258;
    titleLines.forEach(line => { print(line,64,y,36,'#133b35',700); y += 46; });
    classLines.forEach(line => { print(line,64,y,30,'#50675f'); y += 40; });
    y = top;
    rows.forEach(row => {
      row.cells.forEach((w,i) => {
        const x = 64 + i*486;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x,y,466,row.height);
        ctx.strokeStyle = '#d4e3d8'; ctx.lineWidth = 2; ctx.strokeRect(x,y,466,row.height);
        font(42); ctx.fillStyle = '#28675e';
        ctx.fillText(w.emoji || String(cells.indexOf(w)+1).padStart(2,'0'),x+22,y+61,64);
        let ty = y + 53;
        w.en.forEach(line => { print(line,x+100,ty,42,'#133b35',700); ty += 50; });
        ty += 3;
        w.zh.forEach(line => { print(line,x+100,ty,32,'#50675f'); ty += 42; });
      });
      y += row.height + 18;
    });
    if(note) {
      ctx.fillStyle = '#e8f0de'; ctx.fillRect(64,y+8,952,footerHeight-12);
      print('一起複習',96,y+53,28,'#286044',700);
      noteLines.forEach((line,i) => print(line,96,y+101+i*42,32,'#314e3d'));
      y += footerHeight;
    }
    print('Student Games  ·  每天一小步，慢慢記牢。',64,y+61,25,'#61786a');
    return canvas;
  }
  return {create, sourceKey, isPayload};
})();
