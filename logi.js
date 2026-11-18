/* Évolud – petit bouton rond « Outils » (Logistique + Index INSEE)
   Conçu et développé par Saïd OUFQIR
   Script non chiffré, ajouté à la page par sw.js (comme guide.js) : ne modifie aucune fonction existante.
   v5.31.9 : boutons intégrés à l'Accueil (à côté de « Brief »), plus aucun bouton flottant. */
(function () {
  if (window.__evoludLogi) return; window.__evoludLogi = true;
  var F = 'font:600 14px -apple-system,Segoe UI,Roboto,Arial,sans-serif;';
  var css = document.createElement('style');
  css.textContent =
    '#evLogiBtn{position:fixed;left:14px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:2147483000;width:46px;height:46px;border-radius:50%;' +
    'background:#0f2a44;color:#fff;border:2px solid #f07c1b;font-size:20px;line-height:1;box-shadow:0 3px 10px rgba(0,0,0,.25);cursor:pointer;opacity:.9;padding:0}' +
    '#evLogiBtn:active{transform:scale(.94)}' +
    '#evLogiMenu{position:fixed;left:14px;bottom:calc(146px + env(safe-area-inset-bottom));z-index:2147483001;background:#fff;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.25);display:none;overflow:hidden}' +
    '#evLogiMenu.on{display:block}' +
    '#evLogiMenu button{display:block;width:100%;text-align:left;background:#fff;border:0;border-bottom:1px solid #e3e8ef;padding:12px 16px;color:#0f2a44;cursor:pointer;' + F + '}' +
    '#evLogiWrap{position:fixed;inset:0;z-index:2147483600;background:#f3f5f8;display:none;flex-direction:column}' +
    '#evLogiWrap.on{display:flex}' +
    '#evLogiBar{background:#0f2a44;color:#fff;display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top)) 12px 8px;' + F + '}' +
    '#evLogiBar button{background:none;border:1px solid rgba(255,255,255,.45);color:#fff;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer}' +
    '#evLogiFrame{flex:1;border:0;width:100%;background:#f3f5f8}';
  document.head.appendChild(css);

  var PAGES = { logi: ['🚚 Logistique & Kitting', 'logistique.html?embed=1'], idx: ['📈 Index INSEE & révision', 'indices.html?embed=1'] };
  var wrap = null, cur = null;
  function open(k) {
    k = PAGES[k] ? k : 'logi'; menu.classList.remove('on');
    if (!wrap) {
      wrap = document.createElement('div'); wrap.id = 'evLogiWrap';
      wrap.innerHTML = '<div id="evLogiBar"><button type="button" id="evLogiClose">← Retour Évolud</button><span id="evLogiTit"></span></div><iframe id="evLogiFrame" title="Outil"></iframe>';
      document.body.appendChild(wrap);
      wrap.querySelector('#evLogiClose').onclick = close;
    }
    if (cur !== k) { wrap.querySelector('#evLogiFrame').src = PAGES[k][1]; cur = k; }
    wrap.querySelector('#evLogiTit').textContent = PAGES[k][0];
    wrap.classList.add('on'); btn.style.display = 'none';
    try { history.pushState({ evLogi: 1 }, ''); } catch (e) {}
  }
  function close() { if (wrap) wrap.classList.remove('on'); vis(); }
  window.addEventListener('popstate', function () { if (wrap && wrap.classList.contains('on')) close(); });
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data === 'evolud-logi-close') close(); });

  var btn = document.createElement('button');
  btn.id = 'evLogiBtn'; btn.type = 'button'; btn.title = 'Outils : Logistique, Index INSEE'; btn.textContent = '🧰';
  var menu = document.createElement('div'); menu.id = 'evLogiMenu';
  menu.innerHTML = '<button type="button" data-k="logi">🚚 Logistique</button><button type="button" data-k="idx">📈 Index INSEE & révision</button>';
  menu.onclick = function (e) { var b = e.target.closest('button'); if (b) open(b.getAttribute('data-k')); };
  btn.onclick = function (e) { e.stopPropagation(); menu.classList.toggle('on'); };
  document.addEventListener('click', function (e) { if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove('on'); });

  // v5.31.9 : plus de bouton flottant. Les outils sont ajoutés comme boutons sur l'Accueil, à côté de « Brief ».
  // Le bouton flottant ⚖️ (Scénarios & MEXT), qui recouvrait le « ? », est aussi rangé à cet endroit.
  function balance() {
    var bs = document.body.querySelectorAll('*');
    for (var i = 0; i < bs.length; i++) { var el = bs[i]; if (el.closest && el.closest('#evLogiWrap')) continue;
      var t = (el.textContent || '').trim();
      if (t.length <= 4 && t.indexOf('\u2696') >= 0 && !el.firstElementChild) { var x = el; while (x && x !== document.body) { if (getComputedStyle(x).position === 'fixed') { x.__evLeaf = el; return x; } x = x.parentElement; } } }
    return null;
  }
  function findBrief() {
    var all = document.body.querySelectorAll('button,a,div,span,label,li'), best = null;
    for (var i = 0; i < all.length; i++) { var t = (all[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 14 && /Brief$/.test(t) && all[i].offsetParent) { best = all[i]; break; } }
    if (!best) return null;
    // remonte jusqu'au « bouton » complet (dernier parent dont le texte reste « ☀️ Brief »)
    while (best.parentElement && best.parentElement !== document.body) {
      var pt = (best.parentElement.textContent || '').replace(/\s+/g, ' ').trim();
      if (pt.length < 14 && /Brief$/.test(pt)) best = best.parentElement; else break; }
    return best;
  }
  function chips() {
    if (wrap && wrap.classList.contains('on')) return;
    var brief = findBrief();
    var bal = balance();
    if (bal && brief && !bal.__evHid) { bal.__evHid = 1; bal.setAttribute('data-ev-hide', '1');
      var r = document.getElementById('evHideCss') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'evHideCss' }));
      r.textContent = '[data-ev-hide]{display:none!important}' + (bal.id ? '#' + CSS.escape(bal.id) + '{display:none!important}' : ''); }
    if (!brief || document.getElementById('evChipLogi')) return;
    function mk(id, txt, fn) {
      var c = document.createElement('button'); c.type = 'button'; c.id = id; c.textContent = txt;
      c.className = brief.className || ''; var st = brief.getAttribute('style'); if (st) c.setAttribute('style', st);
      if (!c.className && !st) c.setAttribute('style', 'padding:8px 12px;border-radius:8px;border:0;background:#e9eef6;font:600 14px inherit');
      c.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); fn(); }, true);
      return c;
    }
    var after = brief;
    [['evChipLogi', '🚚 Logistique', function () { open('logi'); }],
     ['evChipIdx', '📈 Index INSEE', function () { open('idx'); }],
     ['evChipBal', '⚖️ Scénarios & MEXT', function () { var x = balance(); if (x) (x.__evLeaf || x).click(); }]].forEach(function (d) {
      if (d[0] === 'evChipBal' && !bal) return;
      var c = mk(d[0], d[1], d[2]); after.parentNode.insertBefore(c, after.nextSibling); after = c; });
  }
  function vis() { btn.style.display = 'none'; menu.classList.remove('on'); }
  function add() { setInterval(chips, 800); chips(); }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  window.EvoludOuvrirLogistique = function () { open('logi'); };
  window.EvoludOuvrirIndex = function () { open('idx'); };
})();
