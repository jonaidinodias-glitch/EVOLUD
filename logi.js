/* Évolud – bouton « Logistique » : ouvre le module Logistique & Kitting dans l'appli
   Conçu et développé par Saïd OUFQIR
   Script non chiffré, ajouté à la page par sw.js (comme guide.js) : ne modifie aucune fonction existante. */
(function () {
  if (window.__evoludLogi) return; window.__evoludLogi = true;
  var css = document.createElement('style');
  css.textContent =
    '#evLogiBtn{position:fixed;left:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147483000;' +
    'background:#0f2a44;color:#fff;border:2px solid #f07c1b;border-radius:24px;padding:9px 14px;font:600 14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;display:flex;align-items:center;gap:6px}' +
    '#evLogiBtn:active{transform:scale(.96)}' +
    '#evLogiWrap{position:fixed;inset:0;z-index:2147483600;background:#f3f5f8;display:none;flex-direction:column}' +
    '#evLogiWrap.on{display:flex}' +
    '#evLogiBar{background:#0f2a44;color:#fff;display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top)) 12px 8px;font:600 14px -apple-system,Segoe UI,Roboto,Arial,sans-serif}' +
    '#evLogiBar button{background:none;border:1px solid rgba(255,255,255,.45);color:#fff;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer}' +
    '#evLogiFrame{flex:1;border:0;width:100%;background:#f3f5f8}';
  document.head.appendChild(css);

  var wrap = null;
  function open() {
    if (!wrap) {
      wrap = document.createElement('div'); wrap.id = 'evLogiWrap';
      wrap.innerHTML = '<div id="evLogiBar"><button type="button" id="evLogiClose">← Retour Évolud</button><span>🚚 Logistique & Kitting</span></div>' +
        '<iframe id="evLogiFrame" title="Logistique" src="logistique.html?embed=1"></iframe>';
      document.body.appendChild(wrap);
      wrap.querySelector('#evLogiClose').onclick = close;
    }
    wrap.classList.add('on'); btn.style.display = 'none';
    try { history.pushState({ evLogi: 1 }, ''); } catch (e) {}
  }
  function close() { if (wrap) wrap.classList.remove('on'); btn.style.display = 'flex'; }
  window.addEventListener('popstate', function () { if (wrap && wrap.classList.contains('on')) close(); });
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data === 'evolud-logi-close') close(); });

  var btn = document.createElement('button');
  btn.id = 'evLogiBtn'; btn.type = 'button'; btn.title = 'Logistique & Kitting';
  btn.innerHTML = '🚚 Logistique';
  btn.onclick = open;
  function add() { if (!document.getElementById('evLogiBtn')) document.body.appendChild(btn); }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  window.EvoludOuvrirLogistique = open;
})();
