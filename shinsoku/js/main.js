// main.js — bootstrap: title screen → Game.

// Surface any error visibly instead of failing to a blank page (helps diagnose
// device/browser-specific problems). Shown as a banner over the title.
function showError(msg) {
  let el = document.getElementById('fatal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fatal';
    el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#400;color:#fdd;' +
      'font:12px/1.5 monospace;padding:10px 14px;white-space:pre-wrap;max-height:60%;overflow:auto;border-bottom:2px solid #b33';
    document.body.appendChild(el);
  }
  el.textContent = 'ERROR: ' + msg;
}
window.addEventListener('error', e => showError((e.message || e.error) + '\n' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => showError('promise: ' + (e.reason && (e.reason.stack || e.reason.message || e.reason))));

import('./game.js').then(({ Game }) => {
  const game = new Game();
  window.SHINSOKU = game; // dev handle
  const title = document.getElementById('title');

  document.getElementById('startBtn').addEventListener('click', () => {
    title.style.display = 'none';
    try { game.start(); } catch (e) { showError(e.stack || e.message); }
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('セーブデータを消去しますか？')) {
      localStorage.removeItem('shinsoku_save_v1');
      location.reload();
    }
  });
}).catch(e => showError('module load: ' + (e.stack || e.message)));
