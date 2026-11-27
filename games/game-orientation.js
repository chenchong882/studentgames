/* Landscape entry screen shared by the games that require it. */
(() => {
  'use strict';
  const portrait = matchMedia('(orientation: portrait)');
  const ua = navigator.userAgent;
  const tablet = /iPad|Tablet|Silk/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const phone = !tablet && (/iPhone|iPod|Android.*Mobile/i.test(ua) ||
    (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600));
  const needsLandscape = document.currentScript.hasAttribute('data-all-devices') || phone;
  const blocked = () => needsLandscape && portrait.matches;
  const listeners = [];
  window.GameOrientation = { blocked, onChange: listener => listeners.push(listener) };
  if (!needsLandscape) return;

  const notice = document.createElement('dialog');
  notice.id = 'orientation-notice';
  notice.setAttribute('role', 'dialog');
  notice.setAttribute('aria-modal', 'true');
  notice.setAttribute('aria-labelledby', 'orientation-title');
  notice.setAttribute('aria-describedby', 'orientation-hint');
  notice.innerHTML = `<div class="orientation-card">
    <svg viewBox="0 0 72 58" aria-hidden="true" focusable="false">
      <path d="M13 23c2-9 10-15 20-15h9m-5-5 5 5-5 5"/>
      <rect x="10" y="24" width="52" height="29" rx="5"/>
      <path d="M55 35v7"/>
    </svg>
    <h2 id="orientation-title">請把手機橫過來遊玩</h2>
    <p id="orientation-hint">如果畫面沒有跟著轉，請先解除螢幕旋轉鎖定。</p>
    <a id="orientation-hub" href="../index.html" autofocus>返回遊戲大廳</a>
  </div>`;
  const hub = notice.querySelector('#orientation-hub');
  const nativeDialog = typeof notice.showModal === 'function';
  let previousFocus;

  function updateHub() {
    const gameHub = document.querySelector('a#hub, a#hub-link');
    hub.href = gameHub?.href || '../index.html' + location.hash;
  }

  function sync() {
    if (!notice.isConnected) return;
    const show = blocked();
    if (show === notice.hasAttribute('open')) return;
    if (show) updateHub();
    if (nativeDialog) {
      if (show) notice.showModal();
      else notice.close();
    } else {
      if (show) previousFocus = document.activeElement;
      document.body.classList.toggle('orientation-dialog-fallback', show);
      notice.toggleAttribute('open', show);
      if (show) hub.focus();
      else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
    for (const listener of listeners) listener(show);
  }

  hub.addEventListener('click', updateHub);
  notice.addEventListener('cancel', event => event.preventDefault());
  for (const type of ['mousedown', 'pointerdown', 'touchstart', 'touchmove', 'touchend', 'click']) {
    notice.addEventListener(type, event => event.stopPropagation());
  }
  // Window-level game shortcuts also receive events from a native dialog unless stopped.
  window.addEventListener('keydown', event => {
    if (!notice.hasAttribute('open')) return;
    event.stopImmediatePropagation();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      hub.focus();
    } else if (!notice.contains(event.target)) {
      event.preventDefault();
    }
  }, true);

  // interactive fires before deferred game scripts begin their heavier setup.
  document.addEventListener('readystatechange', () => {
    document.body.append(notice);
    sync();
  }, { once: true });
  if (portrait.addEventListener) portrait.addEventListener('change', sync);
  else portrait.addListener(sync);
  window.addEventListener('resize', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('hashchange', updateHub);
})();
