/* Évolud Chantier – chargeur chiffré · conçu et développé par Saïd OUFQIR
   v5.8.1 : le code, les données et les plans sont chiffrés (AES-256-GCM) ; plans regroupés en paquets.
   Sans la clé de l'application (transmise dans le lien d'installation), rien n'est lisible. */
(function () {
  'use strict';
  var SCRIPTS = ['data', 'lib', 'plan', 'app', 'diags', 'charge', 'mt', 'fin', 'opr', 'cr', 'ajout', 'v52', 'v53', 'v54', 'v55', 'ops'];
  var ENC_FETCH = { 'plans.json': 'application/json', 'plans2.json': 'application/json' };
  var LS = 'evolud_k';
  var keyP = null, cache = {};

  function b64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function getK() {
    var m = /[?&#]k=([A-Za-z0-9_-]{40,})/.exec(location.hash);
    if (m) { try { localStorage.setItem(LS, m[1]); } catch (e) {} history.replaceState(null, '', location.pathname + location.hash.replace(/[?&]k=[A-Za-z0-9_-]+/, '').replace(/^#k=[A-Za-z0-9_-]+&?/, '#')); return m[1]; }
    try { return localStorage.getItem(LS); } catch (e) { return null; }
  }
  function key() { return keyP || (keyP = crypto.subtle.importKey('raw', b64u(getK()), 'AES-GCM', false, ['decrypt'])); }
  // v5.8.1 : les plans chiffrés sont regroupés en quelques paquets (packN.bin + packs.json, à la racine)
  var nf0 = window.fetch.bind(window), packIdx = null, packBuf = {};
  function packs() { return packIdx || (packIdx = nf0('packs.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })); }
  function fichier(path) { return nf0(path + '.enc', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('fichier absent : ' + path); return r.arrayBuffer(); }); }
  function brut(path) {
    if (!/^img\//.test(path)) return fichier(path);
    return packs().then(function (ix) {
      var e = ix[path]; if (!e) return fichier(path);
      var pb = packBuf[e[0]] || (packBuf[e[0]] = nf0('pack' + e[0] + '.bin').then(function (r) { if (!r.ok) { delete packBuf[e[0]]; throw new Error('paquet absent : ' + e[0]); } return r.arrayBuffer(); }));
      return pb.then(function (b) { return b.slice(e[1], e[1] + e[2]); });
    });
  }
  function dec(path) {
    if (cache[path]) return cache[path];
    return cache[path] = brut(path)
      .then(function (buf) { return key().then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, k, new Uint8Array(buf, 12)); }); });
  }
  // URL locale (blob) d'un fichier chiffré : plans Gamma groupés, images de plans
  window.EVX = {
    url: function (path, type) { return dec(path).then(function (ab) { return URL.createObjectURL(new Blob([ab], { type: type || 'text/javascript' })); }); },
    key: function () { try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } }
  };
  // les fichiers JSON chiffrés restent lisibles par fetch('plans.json') comme avant
  var nf = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var u = typeof input === 'string' ? input : (input && input.url) || '';
    var url; try { url = new URL(u, location.href); } catch (e) { return nf(input, init); }
    if (url.origin !== location.origin) return nf(input, init);
    var base = location.pathname.replace(/[^/]*$/, ''), p = url.pathname.indexOf(base) === 0 ? url.pathname.slice(base.length) : url.pathname.replace(/^\//, '');
    if (ENC_FETCH[p]) return dec(p).then(function (ab) { return new Response(ab, { status: 200, headers: { 'Content-Type': ENC_FETCH[p] } }); }, function () { return new Response('', { status: 404 }); });
    if (/^img\/[\w.-]+\.jpe?g$/i.test(p)) return dec(p).then(function (ab) { return new Response(ab, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }); }, function () { return new Response('', { status: 404 }); });
    return nf(input, init);
  };

  function ask(msg) {
    document.getElementById('app').innerHTML = '<div class="login"><div class="card"><h3>🔒 Clé de l\'application</h3>' +
      '<p class="mut small">' + (msg || 'Ouvrez le lien d\'installation reçu de votre conducteur de travaux, ou collez ici la clé de l\'application.') + '</p>' +
      '<label>Clé</label><input id="kk" autocomplete="off" autocapitalize="off" spellcheck="false">' +
      '<button class="btn block" style="margin-top:12px" id="kgo">Valider</button></div>' +
      '<p class="mut small" style="text-align:center">Évolud Chantier · conçu et développé par Saïd OUFQIR</p></div>';
    document.getElementById('kgo').onclick = function () { var v = (document.getElementById('kk').value || '').trim(); if (!/^[A-Za-z0-9_-]{40,}$/.test(v)) return; try { localStorage.setItem(LS, v); } catch (e) {} location.reload(); };
  }

  var done;
  window.EVX_READY = new Promise(function (r) { done = r; });
  if (!getK()) return ask();
  Promise.all(SCRIPTS.map(function (n) { return dec(n + '.js'); })).then(function (bufs) {
    var last;
    bufs.forEach(function (ab, i) {
      var s = document.createElement('script'); s.async = false;
      s.src = URL.createObjectURL(new Blob([ab], { type: 'text/javascript' })); s.dataset.f = SCRIPTS[i];
      document.body.appendChild(s); last = s;
    });
    last.onload = function () { done(); };
  }).catch(function (e) {
    console.warn(e);
    if (e && (e.name === 'OperationError' || e.name === 'DataError')) { try { localStorage.removeItem(LS); } catch (x) {} keyP = null; cache = {}; return ask('⚠️ Clé incorrecte. Vérifiez le lien reçu ou la clé saisie.'); }
    document.getElementById('app').innerHTML = '<div class="card"><h3>Chargement impossible</h3><p class="mut small">Vérifiez le réseau puis rouvrez l\'application.</p></div>';
  });
})();
