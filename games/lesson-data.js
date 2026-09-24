/* Shared lesson boundary: aliases, explicit load receipt, and readable picture answers. */
window.GameData = (() => {
  let blocked = false;
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  function prepare(payload) {
    if (!payload || typeof payload !== 'object') return { words:[], _rawCount:0 };
    const source = Array.isArray(payload.words) ? payload.words : [];
    return { ...payload, _rawCount:payload._rawCount ?? source.length, words:source.map(item => {
      const w = item && typeof item === 'object' ? item : {};
      const word = text(w.word || w.en || w.phrase);
      const chinese = text(w.chinese || w.zh || w.meaning || w.translation || w.definition);
      const emoji = text(w.emoji || w.icon || w.sticker || w.img || w.image);
      const example = text(w.example || w.sentence);
      return { ...w, word, en:word, chinese, zh:chinese, meaning:chinese, emoji, icon:emoji,
        example, sentence:example, pos:text(w.pos || w.part_of_speech) };
    }) };
  }
  function uniqueWords(words) {
    const seen = new Set();
    return words.filter(w => {
      const key = text(w.word || w.en).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function picturePool(words) {
    const counts = new Map();
    for (const w of words) if (w.emoji) counts.set(w.emoji, (counts.get(w.emoji) || 0) + 1);
    return words.filter(w => w.emoji && counts.get(w.emoji) === 1);
  }
  function report(payload, words, minimum, selector, hint = '') {
    const count = words.length, raw = payload._rawCount ?? payload.words.length;
    blocked = count < minimum;
    let receipt = document.getElementById('lesson-load-receipt');
    if (!receipt) {
      receipt = document.createElement('p'); receipt.id = 'lesson-load-receipt'; receipt.setAttribute('role','status');
      const host = document.querySelector(selector);
      (host || document.body).appendChild(receipt);
      if (!host) receipt.className = 'lesson-floating-receipt';
    }
    const pictures = picturePool(words).length;
    receipt.textContent = `題庫：原始 ${raw}／可用 ${count}／排除 ${Math.max(0,raw-count)} 字。${hint}`;
    if (words.some(w => w.emoji)) receipt.textContent += ` 可辨識圖片 ${pictures} 個；無圖或重複圖案的單字僅文字題可練習。`;
    document.getElementById('lesson-load-error')?.remove();
    if (blocked) {
      const layer = document.createElement('div'); layer.id = 'lesson-load-error'; layer.setAttribute('role','alertdialog'); layer.setAttribute('aria-modal','true');
      const card = document.createElement('section');
      const title = document.createElement('h2'); title.textContent = '這份題庫暫時無法開始';
      const message = document.createElement('p'); message.textContent = `${receipt.textContent} 本遊戲至少需要 ${minimum} 個有效單字，請調整題庫後重新進入。`;
      const back = document.createElement('button'); back.type = 'button'; back.textContent = '返回遊戲選單';
      back.onclick = () => { location.href = '../index.html' + location.hash; };
      card.append(title,message,back); layer.append(card); document.body.append(layer); back.focus();
    }
    return !blocked;
  }
  const style = document.createElement('style');
  style.textContent = '#lesson-load-receipt{font:600 12px/1.5 Arial,sans-serif;color:inherit;opacity:.85;max-width:100%;margin:6px 0;overflow-wrap:anywhere;flex-shrink:0}.lesson-floating-receipt{position:fixed;z-index:60;bottom:6px;left:12px;right:12px;color:white!important;pointer-events:none;text-align:center}#lesson-load-error{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:#101827;color:white}#lesson-load-error section{width:min(460px,100%);max-height:90dvh;overflow:auto;padding:24px;background:#202d45;border-radius:18px}#lesson-load-error p{margin:16px 0;line-height:1.7}#lesson-load-error button{min-height:48px;padding:10px 20px;font-size:16px;cursor:pointer}';
  document.head.append(style);
  window.addEventListener('keydown', e => { if (blocked && e.target?.closest?.('#lesson-load-error') == null) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const raw = new URLSearchParams(location.hash.slice(1)).get('lessonData');
    if (raw === null) return;
    try {
      const payload = JSON.parse(raw);
      if (payload && Array.isArray(payload.words)) return;
    } catch(e) {}
    report(prepare(null), [], 1, '#lesson-data-missing', '題庫格式無法讀取。');
  });
  return { prepare, uniqueWords, picturePool, report, ready:() => !blocked };
})();
