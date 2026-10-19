/* Small shared helpers for the standalone games; no game state or vocabulary here. */
(() => {
  'use strict';
  // Block native long-press selection/menus without cancelling gameplay gestures.
  function preventGameSelection(event) {
    const target = event.target;
    if (target instanceof Element && (target.closest('input, textarea, select') || target.isContentEditable)) return;
    event.preventDefault();
  }
  ['selectstart', 'contextmenu'].forEach(type => document.addEventListener(type, preventGameSelection, true));
  const touch = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  function pixelRatio() { return Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2); }
  function text(el, value) {
    const next = String(value);
    if (el.textContent !== next) el.textContent = next;
  }
  // Read sizes after CSS has settled, once per frame. The delayed pass covers iOS
  // orientation/safe-area changes; ResizeObserver also catches container-only changes.
  function onResize(callback, element) {
    let frame = 0, timer = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; callback(); });
    };
    const settle = () => { schedule(); clearTimeout(timer); timer = setTimeout(schedule, 250); };
    addEventListener('resize', schedule);
    addEventListener('orientationchange', settle);
    addEventListener('pageshow', settle);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
    if (element && window.ResizeObserver) new ResizeObserver(schedule).observe(element);
    if (document.fonts) document.fonts.ready.then(schedule);
    return schedule;
  }
  window.GameRuntime = { touch, pixelRatio, text, onResize };
})();
