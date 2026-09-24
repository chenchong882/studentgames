/* Shared setup controls. Each game supplies its own difficulty and data adapter. */
window.GameSetup = (() => {
  const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  let preference = read('sgQuestionType', 'text');
  if (!['text', 'picture', 'mixed'].includes(preference)) preference = 'text';
  let mounted = null;
  const kind = available => available ? preference : 'text';
  const usePicture = available => kind(available) === 'picture' || (kind(available) === 'mixed' && Math.random() < 0.5);
  function button(text, action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.addEventListener('click', action); return b;
  }
  function mount(config) {
    const start = document.querySelector(config.start);
    if (!start) return;
    document.body.dataset.sgGame = config.id;
    const shell = document.querySelector(config.shell);
    shell?.classList.add('sg-start-screen');
    if (config.legacy) document.querySelectorAll(config.legacy).forEach(el => { el.dataset.sgLegacy = 'true'; el.style.setProperty('display', 'none', 'important'); });
    start.classList.add('sg-start-button');
    start.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
    // Keep the existing real button and its audio-unlock / gameplay handlers.
    if (config.id !== 'wordhunt') start.textContent = '開始遊戲';
    const panel = document.createElement('section'); panel.className = 'sg-setup'; panel.setAttribute('aria-label', '遊戲設定');
    (config.host ? document.querySelector(config.host) : start.parentElement).insertBefore(panel, config.host ? document.querySelector(config.before || config.start) : start);
    const receipt = document.createElement('p'); receipt.className = 'sg-course'; panel.append(receipt);
    const typeButtons = [], difficultyButtons = [];
    const typeNote = document.createElement('p'); typeNote.className = 'sg-note'; typeNote.id = 'sg-type-note'; typeNote.setAttribute('role', 'status');
    function group(label) {
      const field = document.createElement('fieldset'); const legend = document.createElement('legend'); legend.textContent = label;
      const row = document.createElement('div'); row.className = 'sg-options'; field.append(legend, row); panel.append(field); return row;
    }
    if (!config.fixedType) {
      const row = group('練習題型');
      for (const [value, label] of [['text', '中英文字'], ['picture', '圖片題'], ['mixed', '混合練習']]) {
        const b = button(label, () => {
          preference = value; save('sgQuestionType', value);
          config.onTypeChange?.(); sync();
        });
        b.dataset.value = value; b.setAttribute('aria-describedby', 'sg-type-note'); row.append(b); typeButtons.push(b);
      }
    }
    panel.append(typeNote);
    let difficulty = read('sgGameDifficulty', '') || config.getDifficulty?.() || 'simple';
    if (!['simple', 'hard'].includes(difficulty)) difficulty = 'simple';
    const difficultyNote = document.createElement('p'); difficultyNote.className = 'sg-note'; difficultyNote.setAttribute('role', 'status');
    if (config.setDifficulty) {
      const row = group('遊戲難度'); row.classList.add('sg-two-options');
      for (const [value, label] of [['simple', '簡單'], ['hard', '困難']]) {
        const b = button(label, () => {
          difficulty = value; save('sgGameDifficulty', value); config.setDifficulty(value); sync();
        });
        b.dataset.value = value; row.append(b); difficultyButtons.push(b);
      }
      panel.append(difficultyNote); config.setDifficulty(difficulty);
    }
    function sync() {
      const available = !!config.hasPictures?.();
      const selected = kind(available);
      typeButtons.forEach(b => {
        b.disabled = b.dataset.value !== 'text' && !available;
        b.setAttribute('aria-pressed', String(b.dataset.value === selected));
      });
      typeNote.textContent = config.fixedType || (!available
        ? `本題庫可用中英文字；圖片題需至少 ${config.pictureMinimum || 4} 個可辨識圖案。`
        : selected === 'picture' ? '看英文、聽發音，選對應圖片；只練有可辨識圖片的單字。'
        : selected === 'mixed' ? '文字題與圖片題混合出現，比例不隨遊戲難度改變。'
        : (config.textNote?.() || '英文選中文、中文選英文。'));
      if (!available && preference !== 'text' && !config.fixedType) typeNote.textContent += ' 本次已改選中英文字。';
      difficultyButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === difficulty)));
      difficultyNote.textContent = config.hints?.[difficulty] || '';
      if (config.id !== 'wordhunt') start.textContent = '開始遊戲';
      const data = GameData.current();
      const title = data?.payload.unitTitle || data?.payload.title || (data && data.payload.builtin !== true ? '指定課程' : '內建單字');
      const count = config.count?.() ?? data?.count;
      receipt.textContent = `本次課程：${title}${Number.isFinite(count) ? ` · 可用 ${count} 字` : ''}`;
      const detail = document.getElementById('lesson-load-receipt');
      if (detail && !panel.contains(detail)) {
        const details = document.createElement('details'); details.className = 'sg-data-details';
        const summary = document.createElement('summary'); summary.textContent = '查看題庫載入明細';
        detail.classList.remove('lesson-floating-receipt'); details.append(summary, detail); panel.append(details);
      }
      config.syncExtra?.(selected);
    }
    const pause = document.querySelector(config.pause);
    if (pause) { pause.classList.add('sg-pause-button'); pause.setAttribute('aria-label', '暫停遊戲'); pause.textContent = '⏸'; }
    const actions = document.querySelector(config.pauseActions || '.game-pause-actions');
    if (actions) {
      actions.classList.add('sg-pause-actions');
      const buttons = actions.querySelectorAll('button');
      if (buttons[0]) buttons[0].textContent = '繼續遊戲';
      if (buttons[1]) buttons[1].textContent = '返回遊戲選單';
      const restart = button('重新開始', () => {
        if (!window.confirm('結束本局並回到開始畫面？目前這局的進度不會保留，題庫與設定會保留。')) return;
        const current = config.restartData ? {payload:config.restartData()} : GameData.current();
        const hash = current ? '#lessonData=' + encodeURIComponent(JSON.stringify(current.payload)) : location.hash;
        const target = location.pathname + location.search + hash;
        // assign of the same hash alone does not reload; replace keeps the back stack stable.
        if (target === location.pathname + location.search + location.hash) location.reload();
        else { history.replaceState(null, '', target); location.reload(); }
      });
      actions.insertBefore(restart, buttons[1] || null);
    }
    // These controls must not become movement, shooting, or keyboard shortcuts.
    for (const el of [panel, actions, pause]) if (el) {
      for (const event of ['pointerdown', 'mousedown', 'touchstart', 'touchend']) el.addEventListener(event, e => e.stopPropagation(), { passive:true });
      el.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
      el.addEventListener('click', e => e.stopPropagation());
    }
    for (const selector of config.advanced || []) {
      const extra = document.querySelector(selector); if (extra) panel.append(extra);
    }
    if (pause && shell) {
      const syncPauseVisibility = () => pause.classList.toggle('sg-suppressed', !shell.hidden && getComputedStyle(shell).display !== 'none');
      new MutationObserver(syncPauseVisibility).observe(shell, { attributes:true, attributeFilter:['class','style','hidden'] });
      syncPauseVisibility();
    }
    mounted = {sync, panel}; sync();
  }
  function register(config) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(config), { once:true });
    else mount(config);
  }
  document.addEventListener('game-data-ready', () => mounted?.sync());
  return { register, kind, usePicture, refresh:() => mounted?.sync() };
})();
