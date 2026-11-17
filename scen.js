/* Évolud Chantier – Comparatif scénarios & quantités réelles · conçu et développé par Saïd OUFQIR
   Module autonome (comme guide.js) : s'ajoute à l'appli sans toucher aux autres modules.
   - Bouton « ⚖️ » flottant (au-dessus du bouton « ? »)
   - Scénario commandé (forfait Gamma) ➜ bon de commande après VTE (Gamma) : gains / pertes, motifs, CCAG art. 15, courrier de réserve
   - Quantités réelles par poste, comparées aux quantités vendues du bon de commande Gamma
   - Pré-remplissage des quantités d'après les logements similaires (rue, cité, ville, année, type, surface)
   Données Gamma : lues dans l'appli (mise à jour quotidienne « Gamma → Évolud »), ou importées depuis le fichier evolud_gamma_AAAA-MM-JJ.json
   - v1.3 : suivi des MEXT (menuiseries ext.) envoyées au fabricant : envois par lot, date, et ce qu'il reste à envoyer
   API : window.EvoludScen.open(), .open('132140'), .mext()
*/
(function () {
  'use strict';
  if (window.EvoludScen) return;
  var VERSION = 'scen-1.4';
  var KEY = 'evolud_comparatif_scenarios_v1', KEYS = 'evolud_forfaits_scenarios_v1', KEYG = 'evolud_scen_gamma_import_v1';

  /* ---------- outils ---------- */
  var mem = {};
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : (mem[k] || d); } catch (e) { return mem[k] || d; } }
  function store(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function eur(n) { return (isFinite(n) ? n : 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }); }
  function pct(n) { return (isFinite(n) ? n : 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'; }
  function num(s) { if (s == null || s === '') return NaN; if (typeof s === 'number') return s; s = String(s).replace(/[€\s  ]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); return s === '' ? NaN : parseFloat(s); }
  function v0(n) { return isFinite(n) ? n : 0; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

  /* ---------- postes (quantités) et reconnaissance dans les lignes du bon de commande Gamma ---------- */
  var BS = /\bbs\b|secondaire|annexe|appentis|dependance/;
  var POSTES = [
    ['soufBP', 'Soufflage BP', 'm²', function (d) { return /souffl/.test(d) && !BS.test(d); }],
    ['soufBS', 'Soufflage BS', 'm²', function (d) { return /souffl/.test(d) && BS.test(d); }],
    ['combles', 'Débarras combles', 'm²', function (d) { return /debarras/.test(d); }],
    ['trapBP', 'Trappes BP', 'u', function (d) { return /trappe/.test(d) && !BS.test(d); }],
    ['trapBS', 'Trappes BS', 'u', function (d) { return /trappe/.test(d) && BS.test(d); }],
    ['rampEsc', 'Rampant escalier', 'm²', function (d) { return /rampant/.test(d) && /escalier/.test(d); }],
    ['rampCom', 'Rampant comble', 'm²', function (d) { return /rampant/.test(d) && !/escalier/.test(d); }],
    ['gc', 'Garde-corps', 'u', function (d) { return /garde.?corps/.test(d); }],
    ['plafSdb', 'Plafond SDB', 'm²', function (d) { return /plafond/.test(d) && /sdb|salle d.?eau|salle de bain/.test(d); }],
    ['plafBS', 'Plafond droit BS', 'm²', function (d) { return /plafond/.test(d) && /droit/.test(d); }],
    ['mursFroids', 'Murs froids', 'm²', function (d) { return /murs? froid/.test(d); }],
    ['vmc', 'VMC / VMR', 'u', function (d) { return /\bvm[cr]\b|ventilation mecanique/.test(d); }],
    ['mext', 'Menuiseries ext.', 'u', function (d) { return /(fenetre|chassis|menuiserie|porte.?fenetre|baie)/.test(d) && !/porte d.?entree|porte (de )?bs|volet seul/.test(d); }],
    ['pe', "Porte d'entrée", 'u', function (d) { return /porte d.?entree/.test(d); }],
    ['porteBS', 'Porte BS', 'u', function (d) { return /porte/.test(d) && BS.test(d) && !/fenetre/.test(d); }],
    ['detal', 'Détalonnage', 'u', function (d) { return /detalonn/.test(d); }],
    ['plinthes', 'Plinthes', 'ml', function (d) { return /plinthe/.test(d); }],
    ['cuivre', 'Réseau cuivre', 'ml', function (d) { return /cuivre/.test(d); }]
  ];
  function venduDe(g) {   // quantités vendues d'un logement d'après les lignes du bon de commande Gamma
    var out = {}; if (!g || !g.bdc) return out;
    var lignes = (g.bdc.l || []).slice();
    (g.bdc.sec || []).forEach(function (s) { (s && s[3] || []).forEach(function (l) { lignes.push(l); }); });
    var vus = {};
    lignes.forEach(function (l) {
      if (!l || !l[0]) return; var cle = l.join('|'); if (vus[cle]) return; vus[cle] = 1;
      var d = norm(l[0]), q = num(l[1]); if (!isFinite(q) || q <= 0) return;
      for (var i = 0; i < POSTES.length; i++) if (POSTES[i][3](d)) { out[POSTES[i][0]] = r1(v0(out[POSTES[i][0]]) + q); break; }
    });
    return out;
  }

  /* ---------- données Gamma de l'appli ---------- */
  var G = null, Gsrc = '';
  function isMapUG(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    var k = Object.keys(o), n = 0, ok = 0;
    for (var i = 0; i < k.length && n < 60; i++) if (/^\d{5,7}$/.test(k[i])) { n++; var v = o[k[i]]; if (v && typeof v === 'object' && ('forf' in v || 'bdc' in v || 'ph' in v)) ok++; }
    return n >= 3 && ok >= 2;
  }
  function fromParts(parts) {   // morceaux gammaD1, gammaD2… envoyés par le bouton « Gamma → Évolud »
    var best = {};
    parts.forEach(function (p) { var m = /^gammaD(\d+)$/.exec(p.id); if (!m) return; var t = p.updatedAt || 0; if (!best[m[1]] || t >= best[m[1]].t) best[m[1]] = { t: t, v: p.deleted ? '' : (typeof p.v === 'string' ? p.v : '') }; });
    var s = '', i = 1; while (best[i] && best[i].v) { s += best[i].v; i++; }
    if (!s) return null; try { var o = JSON.parse(s); return isMapUG(o) ? o : null; } catch (e) { return null; }
  }
  function search(root, maxNodes) {   // cherche, dans les données de l'appli, la liste Gamma des logements
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null, parts = [], found = null, nodes = 0;
    (function walk(o, d) {
      if (found || !o || typeof o !== 'object' || d > 6 || ++nodes > maxNodes) return;
      if (seen) { if (seen.has(o)) return; seen.add(o); }
      if (o.nodeType || o === window) return;
      if (isMapUG(o)) { found = o; return; }
      if (typeof o.id === 'string' && /^gammaD\d+$/.test(o.id) && ('v' in o || o.deleted)) parts.push(o);
      else if (o.data && typeof o.data.id === 'string' && /^gammaD\d+$/.test(o.data.id)) parts.push(o.data);
      var ks; try { ks = Object.keys(o); } catch (e) { return; }
      for (var i = 0; i < ks.length && !found; i++) { var v; try { v = o[ks[i]]; } catch (e) { continue; }
        if (typeof v === 'string' && v.length > 50 && v.length < 6e6 && /gammaD|"forf"|"bdc"/.test(v) && (v[0] === '{' || v[0] === '[')) { try { walk(JSON.parse(v), d + 1); } catch (e) { } }
        else if (v && typeof v === 'object') walk(v, d + 1); }
    })(root, 0);
    return found || (parts.length ? fromParts(parts) : null);
  }
  var NATIFS = null;
  function chercheWindow() {
    if (!NATIFS) { NATIFS = {}; try { var f = document.createElement('iframe'); f.style.display = 'none'; document.body.appendChild(f); Object.getOwnPropertyNames(f.contentWindow).forEach(function (k) { NATIFS[k] = 1; }); f.remove(); } catch (e) { } }
    var obj = {}; Object.getOwnPropertyNames(window).forEach(function (k) { if (NATIFS[k] || /^(webkit|on)/.test(k) || k === 'EvoludScen' || k === 'EvoludTuto') return; try { var v = window[k]; if (v && typeof v === 'object') obj[k] = v; } catch (e) { } });
    return search(obj, 400000);
  }
  function chercheLocal() { var o = {}; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k === KEY || k === KEYS || k === KEYG || k === 'evolud_k' || k === 'evolud_scen_origine_v1') continue; o[k] = localStorage.getItem(k); } } catch (e) { } return search(o, 400000); }
  function chercheIDB() {
    if (!window.indexedDB || !indexedDB.databases) return Promise.resolve(null);
    return indexedDB.databases().then(function (dbs) {
      return dbs.reduce(function (p, info) { return p.then(function (r) { if (r || !info.name) return r; return new Promise(function (ok) {
        var rq; try { rq = indexedDB.open(info.name); } catch (e) { return ok(null); }
        rq.onerror = function () { ok(null); }; rq.onupgradeneeded = function () { try { rq.transaction.abort(); } catch (e) { } ok(null); };
        rq.onsuccess = function () { var db = rq.result, names = [].slice.call(db.objectStoreNames), res = {}, n = names.length; if (!n) { db.close(); return ok(null); }
          try { var tx = db.transaction(names, 'readonly'); names.forEach(function (s) { var g = tx.objectStore(s).getAll(); g.onsuccess = function () { res[s] = g.result; if (--n === 0) { db.close(); ok(search(res, 600000)); } }; g.onerror = function () { if (--n === 0) { db.close(); ok(search(res, 600000)); } }; }); }
          catch (e) { db.close(); ok(null); } };
      }); }); }, Promise.resolve(null));
    }).catch(function () { return null; });
  }
  function chargeGamma() {
    var g = null;
    try { g = chercheWindow(); if (g) Gsrc = 'appli'; } catch (e) { }
    if (!g) { g = chercheLocal(); if (g) Gsrc = 'appli (stockage)'; }
    var p = g ? Promise.resolve(g) : chercheIDB().then(function (x) { if (x) Gsrc = 'appli (base locale)'; return x; });
    return p.then(function (x) { if (!x) { var imp = load(KEYG, null); if (imp && imp.data && isMapUG(imp.data)) { x = imp.data; Gsrc = 'fichier importé du ' + (imp.date || '?'); } } G = x; return x; });
  }

  /* ---------- lignes du comparatif ---------- */
  var saisies = load(KEY, []), forfaits = load(KEYS, {}), editUg = null;
  if (!Array.isArray(saisies)) saisies = [];
  function saisie(ug) { for (var i = 0; i < saisies.length; i++) if (String(saisies[i].ug) === String(ug)) return saisies[i]; return null; }
  function lignes() {   // fusion : données Gamma (automatique) + saisies faites dans l'appli (prioritaires)
    var out = {}, k;
    if (G) for (k in G) { var g = G[k]; if (!g || !g.bdc || !(v0(g.bdc.tot) > 0)) continue;
      var o0 = origine(k, g), chg = o0.sc && g.sc && String(o0.sc) !== String(g.sc);
      out[k] = { ug: k, ad: g.a || '', ville: g.v || '', cite: g.cite || '', annee: num(String(g.an || '').slice(0, 4)), classe: g.cl || '', scC: o0.sc || '', mC: v0(o0.forf) || NaN, scV: chg ? g.sc : '', mV: g.bdc.tot, date: (g.vte && g.vte.length ? g.vte[g.vte.length - 1].d : ''), gamma: 1, vendu: venduDe(g) }; }
    saisies.forEach(function (s) { var r = out[s.ug] || { ug: s.ug, vendu: {} }; Object.keys(s).forEach(function (f) { var v = s[f]; if (v === '' || v == null || (typeof v === 'number' && isNaN(v))) return; r[f] = v; }); out[s.ug] = r; });
    if (origModif) { origModif = false; store(KEYO, orig); }
    return Object.keys(out).map(function (k) { return out[k]; });
  }
  // scénario d'origine : Gamma remplace parfois le scénario après la VTE ; on garde le premier scénario vu pour chaque logement
  var KEYO = 'evolud_scen_origine_v1', orig = load(KEYO, {}), origModif = false;
  function origine(ug, g) { if (!orig[ug] && g.sc) { orig[ug] = { sc: g.sc, forf: g.forf, at: Date.now() }; origModif = true; } return orig[ug] || { sc: g.sc, forf: g.forf }; }
  function ecart(r) { return v0(r.mV) - v0(r.mC); }
  function res(r) { var e = ecart(r); return Math.abs(e) < 1 ? 'eq' : e < 0 ? 'perte' : 'gain'; }
  function nonImp(r) { return r.motif !== 'Imputable BBNE'; }

  /* ---------- logements similaires ---------- */
  function rue(ad) { return norm(ad).replace(/^\s*\d+\s*(bis|ter)?\s*,?\s*/, '').replace(/\b(boulevard|bld|bd)\b\.?/g, 'bd').replace(/\b(rue|r)\b\.?/g, 'rue').replace(/\b(avenue|av)\b\.?/g, 'av').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function score(a, b) {
    var s = 0, ra = rue(a.ad), rb = rue(b.ad);
    if (ra && ra === rb) s += 4;
    if (a.cite && b.cite && norm(a.cite) === norm(b.cite)) s += 3;
    if (a.ville && b.ville && norm(a.ville) === norm(b.ville)) s += 1;
    if (isFinite(a.annee) && isFinite(b.annee)) { var da = Math.abs(a.annee - b.annee); s += da === 0 ? 2 : da <= 5 ? 1 : 0; }
    if (a.classe && b.classe && norm(a.classe) === norm(b.classe)) s += 1;
    if (a.type && a.type === b.type) s += 3;
    if (isFinite(a.surf) && isFinite(b.surf) && a.surf > 0) { var d = Math.abs(a.surf - b.surf) / a.surf; s += d <= 0.05 ? 3 : d <= 0.12 ? 2 : 0; }
    if (a.niv && a.niv === b.niv) s += 2;
    if (a.scC && String(a.scC) === String(b.scC)) s += 1;
    return s;
  }
  function similaires(c, toutes) {
    return toutes.filter(function (r) { return String(r.ug) !== String(c.ug) && (aDesReels(r) || Object.keys(r.vendu || {}).length); })
      .map(function (r) { return { r: r, s: score(c, r) }; }).filter(function (x) { return x.s >= 6; })
      .sort(function (a, b) { return b.s - a.s || (aDesReels(b.r) ? 1 : 0) - (aDesReels(a.r) ? 1 : 0); }).slice(0, 8);
  }
  function aDesReels(r) { return r.q && Object.keys(r.q).some(function (k) { return isFinite(r.q[k]) && (r.qPre || []).indexOf(k) < 0; }); }

  /* ---------- styles ---------- */
  var CSS = [
    '.ecs-fab{position:fixed;right:14px;bottom:calc(146px + env(safe-area-inset-bottom));z-index:2147483000;width:50px;height:50px;border-radius:50%;border:0;background:#23355f;color:#fff;font:700 22px/50px system-ui,-apple-system,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}',
    '.ecs{position:fixed;inset:0;z-index:2147483100;background:#eef1f6;color:#1d2433;font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow:auto;-webkit-overflow-scrolling:touch;display:none}',
    '.ecs.open{display:block}.ecs *{box-sizing:border-box}',
    '.ecs-h{background:#23355f;color:#fff;padding:calc(12px + env(safe-area-inset-top)) 14px 12px;position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px}',
    '.ecs-h b{font-size:18px;flex:1}.ecs-h small{display:block;font-size:11px;opacity:.75;font-weight:400}',
    '.ecs-back{background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:10px;padding:8px 12px;font-weight:700;font-size:15px}',
    '.ecs-m{max-width:1100px;margin:0 auto;padding:12px 12px calc(110px + env(safe-area-inset-bottom))}',
    '.ecs-k{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}@media(min-width:760px){.ecs-k{grid-template-columns:repeat(4,1fr)}}',
    '.ecs-kp{background:#fff;border-radius:14px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}.ecs-kp .l{font-size:12px;color:#6b7385;font-weight:600}.ecs-kp .v{font-size:19px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums}.ecs-kp .s{font-size:11px;color:#6b7385}',
    '.ecs .pos,.ecs-md .pos{color:#2e7d32}.ecs .neg,.ecs-md .neg{color:#c62828}',
    '.ecs-c{background:#fff;border-radius:14px;padding:14px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}.ecs-c h2{margin:0 0 8px;font-size:15px;color:#23355f}',
    '.ecs-al{border-left:5px solid #e07b2e;background:#fdeedd}.ecs-al.ok{border-left-color:#2e7d32;background:#e3f3e5}.ecs-al.ko{border-left-color:#c62828;background:#fbe5e5}.ecs-al p{margin:4px 0;font-size:13px}',
    '.ecs-bar{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:13px}.ecs-bar .n{width:42%;min-width:110px}.ecs-bar .t{flex:1;background:#e2e6ee;border-radius:6px;height:12px;overflow:hidden}.ecs-bar .t i{display:block;height:100%;background:#c62828}.ecs-bar .m{width:90px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}',
    '.ecs-tl{display:flex;flex-wrap:wrap;gap:8px}',
    '.ecs-b{border:0;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:700;background:#2a4b9b;color:#fff;cursor:pointer}.ecs-b.sec{background:#e3ebfb;color:#2a4b9b}.ecs-b.red{background:#fbe5e5;color:#c62828}.ecs-b.sm{padding:6px 10px;font-size:13px}',
    '.ecs-f{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}@media(min-width:760px){.ecs-f{grid-template-columns:2fr 1fr 1fr 1fr}}',
    '.ecs input,.ecs select,.ecs textarea,.ecs-md input,.ecs-md select,.ecs-md textarea{width:100%;font-size:16px;padding:9px 10px;border:1px solid #e2e6ee;border-radius:10px;background:#fff;color:#1d2433;font-family:inherit}',
    '.ecs label,.ecs-md label{font-size:12px;font-weight:700;color:#6b7385;display:block;margin:8px 0 3px}',
    '.ecs-r{background:#fff;border-radius:14px;padding:12px;margin-top:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:5px solid #e2e6ee;cursor:pointer}.ecs-r.gain{border-left-color:#2e7d32}.ecs-r.perte{border-left-color:#c62828}',
    '.ecs-r .top{display:flex;justify-content:space-between;gap:8px}.ecs-r .ug{font-weight:800;color:#23355f;font-size:16px}.ecs-r .ad{font-size:13px;color:#6b7385}',
    '.ecs-bd{border-radius:20px;padding:4px 10px;font-weight:800;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums;align-self:flex-start}.ecs-bd.gain{background:#e3f3e5;color:#2e7d32}.ecs-bd.perte{background:#fbe5e5;color:#c62828}.ecs-bd.eq{background:#e2e6ee;color:#6b7385}',
    '.ecs-cmp{display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;margin-top:10px;font-size:13px}.ecs-cmp .bx{background:#eef1f6;border-radius:10px;padding:8px}.ecs-cmp .bx b{display:block;font-size:15px}',
    '.ecs-mt{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.ecs-ch{font-size:12px;background:#e3ebfb;color:#2a4b9b;border-radius:20px;padding:3px 9px;font-weight:600}.ecs-ch.w{background:#fdeedd;color:#e07b2e}',
    '.ecs-e{text-align:center;color:#6b7385;padding:26px 10px;font-size:14px}',
    '.ecs-md{font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1d2433;position:fixed;inset:0;background:rgba(15,22,40,.55);display:none;z-index:2147483200;align-items:flex-end;justify-content:center}.ecs-md.open{display:flex}',
    '.ecs-sh{background:#fff;width:100%;max-width:680px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom))}@media(min-width:760px){.ecs-md{align-items:center}.ecs-sh{border-radius:18px}}',
    '.ecs-md *{box-sizing:border-box}.ecs-sh h3{margin:0 0 6px;color:#23355f}.ecs-g2{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.ecs-st{margin:16px 0 4px;font-size:14px;color:#23355f;font-weight:800;border-top:1px solid #e2e6ee;padding-top:12px}',
    '.ecs-q{display:grid;grid-template-columns:1.4fr 1fr .9fr .8fr;gap:4px 8px;align-items:center;font-size:13px}.ecs-q .hd{font-size:11px;color:#6b7385;font-weight:700}.ecs-q input{padding:7px 8px}.ecs-q input.pre{background:#fdeedd;border-color:#e07b2e}',
    '.ecs-sim{background:#e3ebfb;border-radius:10px;padding:8px 10px;font-size:13px;margin-top:8px}',
    '.ecs-md .ecs-ck{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:14px;font-weight:600}.ecs-md .ecs-ck input{width:auto;transform:scale(1.3)}',
    '.ecs-ft{display:flex;gap:8px;justify-content:space-between;margin-top:16px;flex-wrap:wrap}',
    '.ecs-hp{font-size:12px;color:#6b7385;line-height:1.4}.ecs textarea,.ecs-sh textarea{min-height:130px;font-size:14px}',
    '.ecs-sg{text-align:center;font-size:12px;color:#6b7385;margin-top:22px}',
    '.ecs-ts{position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#23355f;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;display:none;z-index:2147483300}',
    '.ecs-sc{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
    '.ecs-tabs{display:flex;gap:6px;padding:8px 12px 0;max-width:1100px;margin:0 auto}.ecs-tabs button{flex:1;border:0;border-radius:10px 10px 0 0;padding:10px;font-weight:800;font-size:14px;background:#dfe5f0;color:#23355f}.ecs-tabs button.on{background:#2a4b9b;color:#fff}',
    '.mx-r{display:flex;gap:10px;align-items:center}.mx-r input[type=checkbox]{width:26px;height:26px;flex:none}.mx-r .x{flex:1;min-width:0}',
    '.mx-st{font-size:12px;border-radius:20px;padding:3px 9px;font-weight:700;white-space:nowrap}.mx-st.a{background:#fbe5e5;color:#c62828}.mx-st.e{background:#e3ebfb;color:#2a4b9b}.mx-st.l{background:#e3f3e5;color:#2e7d32}',
    '.mx-hl{border-top:1px solid #e2e6ee;padding:8px 0;font-size:14px}.mx-hl summary{cursor:pointer;font-weight:700}.mx-hl p{margin:6px 0 0;font-size:13px;color:#6b7385}'
  ].join('\n');

  /* ---------- interface ---------- */
  var root, md = {};
  function $(id) { return document.getElementById(id); }
  function toast(t) { var e = $('ecs-ts'); e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(function () { e.style.display = 'none'; }, 2400); }
  var MOTIFS = ['Refus du locataire', 'Menuiseries en bon état / récentes', 'Décision MOE / MOA en VTE', 'Erreur de programmation client (infos commande fausses)', 'Diag amiante / double plafond', 'Logement déjà rénové', 'Ajout de travaux en VTE', 'Imputable BBNE', 'À préciser'];

  function styles() { if (document.getElementById('ecs-css')) return; var st = document.createElement('style'); st.id = 'ecs-css'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); }
  function build() {
    styles();
    root = document.createElement('div'); root.className = 'ecs'; root.id = 'ecs';
    root.innerHTML =
      '<div class="ecs-h"><button class="ecs-back" id="ecs-x">‹ Retour</button><b>⚖️ Scénarios &amp; MEXT<small id="ecs-src">Commandé ➜ retenu en VTE</small></b></div>' +
      '<div class="ecs-tabs"><button class="on" data-tab="1">⚖️ Scénarios</button><button data-tab="2">🪟 MEXT envoyées</button></div>' +
      '<div class="ecs-m" id="ecs-p1">' +
      '<div class="ecs-k">' +
      kp('kN', 'Logements comparés', 'kNs') + kp('kC', 'Commandé (forfaits)', '', 'Scénarios des commandes') + kp('kV', 'Retenu après VTE', '', 'Bons de commande Gamma') + kp('kE', 'Écart net', 'kEs') +
      kp('kG', 'Gains', 'kGs', '', 'pos') + kp('kP', 'Pertes', 'kPs', '', 'neg') + kp('kF', 'Frais engagés', '', 'VTE, cotes, commandes…') + kp('kR', 'Réclamable au client', '', 'Frais sur pertes non imputables') +
      '</div>' +
      '<div class="ecs-c ecs-al" id="ecs-ccag"><h2>📜 Seuil de baisse (CCAG Travaux 2021, art. 15)</h2><p id="ecs-ccagT">—</p><p class="ecs-hp">Seulement si le CCAP renvoie au CCAG 2021 : 5 % en prix forfaitaire, 20 % en prix unitaires ; en accord-cadre à bons de commande, c\'est le minimum du marché qui compte. À faire valider par le service juridique / marchés.</p></div>' +
      '<div class="ecs-c"><h2>🔻 Pertes par motif</h2><div id="ecs-mot"></div></div>' +
      '<div class="ecs-c"><h2>📏 Quantités réelles / vendues (tous logements relevés)</h2><div id="ecs-qt"></div></div>' +
      '<div class="ecs-c"><h2>🛠️ Actions</h2><div class="ecs-tl">' +
      '<button class="ecs-b" data-a="add">＋ Logement</button><button class="ecs-b sec" data-a="paste">📋 Coller depuis Excel</button><button class="ecs-b sec" data-a="csv">⬇️ Export Excel</button><button class="ecs-b sec" data-a="res">✉️ Courrier de réserve</button><button class="ecs-b sec" data-a="imp">📥 Fichier Gamma</button><button class="ecs-b sec" data-a="scen">⚙️ Forfaits</button>' +
      '</div><div class="ecs-f"><input id="ecs-q" placeholder="🔎 UG, adresse, cité, ville…"><select id="ecs-fr"><option value="">Gains et pertes</option><option value="perte">Pertes</option><option value="gain">Gains</option><option value="eq">Sans écart</option><option value="motif">Motif à préciser</option></select>' +
      '<select id="ecs-fv"><option value="">Toutes les villes</option></select><select id="ecs-ft"><option value="ecart">Tri : plus grosse perte</option><option value="gain">Tri : plus gros gain</option><option value="date">Tri : VTE récente</option><option value="ug">Tri : UG</option></select></div></div>' +
      '<div id="ecs-l"></div><div class="ecs-sg">Comparatif scénarios — conçu et développé par Saïd OUFQIR</div></div>' +
      '<div class="ecs-m" id="ecs-p2" style="display:none">' +
      '<div class="ecs-k">' + kp('mA', 'À envoyer', 'mAs', '', 'neg') + kp('mR', 'En retard d\'envoi', 'mRs', '', 'neg') + kp('mE', 'Envoyées au fabricant', 'mEs', '', 'pos') + kp('mL', 'Livrées', 'mLs') + '</div>' +
      '<div class="ecs-c"><h2>🛠️ Actions</h2><div class="ecs-tl"><button class="ecs-b" data-m="sel">📤 Nouvel envoi</button><button class="ecs-b sec" data-m="paste">📋 Coller les UG envoyés</button><button class="ecs-b sec" data-m="reste">📝 Ce qu\'il reste</button><button class="ecs-b sec" data-m="csv">⬇️ Export</button><button class="ecs-b sec" data-m="add">＋ Logement</button></div>' +
      '<p class="ecs-hp">Délai : démarrage contractuel à VTE + <input id="mx-del" inputmode="numeric" style="width:60px;padding:4px 6px;font-size:14px"> j, fabrication <input id="mx-fab" inputmode="numeric" style="width:60px;padding:4px 6px;font-size:14px"> j ➜ « envoyer avant » = date VTE + délai − fabrication.</p>' +
      '<div class="ecs-f"><input id="mx-q" placeholder="🔎 UG, adresse, cité, lot…"><select id="mx-fs"><option value="a">À envoyer</option><option value="e">Envoyées (pas livrées)</option><option value="l">Livrées</option><option value="">Toutes</option></select></div></div>' +
      '<div class="ecs-c" id="mx-bar" style="display:none;position:sticky;top:64px;z-index:4;border:2px solid #2a4b9b"><b id="mx-nsel">0 sélectionné</b><div class="ecs-tl" style="margin-top:8px"><button class="ecs-b sec sm" data-m="tout">Tout cocher</button><button class="ecs-b sec sm" data-m="aucun">Décocher</button><button class="ecs-b sm" data-m="go">✅ Marquer comme envoyés</button><button class="ecs-b red sm" data-m="stop">Annuler</button></div></div>' +
      '<div id="mx-l"></div>' +
      '<div class="ecs-c"><h2>🗂️ Historique des envois</h2><div id="mx-h"></div></div>' +
      '<div class="ecs-sg">Suivi MEXT — conçu et développé par Saïd OUFQIR</div></div>' +
      '<div class="ecs-ts" id="ecs-ts"></div>';
    document.body.appendChild(root);
    modal('form', '<h3 id="ecs-ftit">Logement</h3>' +
      '<div class="ecs-g2"><div><label>UG</label><input id="e-ug" inputmode="numeric"></div><div><label>Date VTE</label><input id="e-date" type="date"></div></div>' +
      '<label>Adresse</label><input id="e-ad"><div class="ecs-g2"><div><label>Ville</label><input id="e-ville"></div><div><label>Cité</label><input id="e-cite"></div></div>' +
      '<div class="ecs-g2"><div><label>Scénario commandé</label><input id="e-scC" inputmode="numeric"></div><div><label>Montant commandé (€ HT)</label><input id="e-mC" inputmode="decimal"></div>' +
      '<div><label>Scénario retenu en VTE</label><input id="e-scV" inputmode="numeric"></div><div><label>Bon de commande après VTE (€ HT)</label><input id="e-mV" inputmode="decimal"></div></div>' +
      '<p class="ecs-hp" id="e-gam"></p>' +
      '<div class="ecs-st">🏠 Typologie (pour trouver les logements similaires)</div>' +
      '<div class="ecs-g2"><div><label>Type</label><select id="e-type"><option value="">—</option><option>T1</option><option>T2</option><option>T3</option><option>T4</option><option>T5</option><option>T6+</option></select></div><div><label>Surface habitable (m²)</label><input id="e-surf" inputmode="decimal"></div>' +
      '<div><label>Niveaux</label><select id="e-niv"><option value="">—</option><option>Plain-pied</option><option>R+1</option><option>R+1+combles</option><option>Appartement</option></select></div><div><label>Année de construction</label><input id="e-annee" inputmode="numeric"></div></div>' +
      '<div class="ecs-st">📏 Quantités réelles relevées</div>' +
      '<div class="ecs-tl"><button type="button" class="ecs-b sec sm" id="e-pre">🔮 Pré-remplir d\'après les logements similaires</button></div><div id="e-sim"></div>' +
      '<div class="ecs-q" id="e-q"></div><p class="ecs-hp">Orange = valeur pré-remplie à vérifier sur place (redevient blanche dès que tu la modifies). « Vendu » = quantité du bon de commande Gamma.</p>' +
      '<div class="ecs-st">⚖️ Écart de scénario</div>' +
      '<label>Postes retirés</label><input id="e-postes" placeholder="ex. MEXT, porte d\'entrée, porte BS">' +
      '<label>Motif</label><select id="e-motif">' + MOTIFS.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select>' +
      '<label>Frais engagés pour ce logement (€ HT)</label><input id="e-frais" inputmode="decimal" placeholder="VTE, prise de cotes, menuiseries commandées…">' +
      '<label class="ecs-ck"><input type="checkbox" id="e-preuve"> Changement acté par écrit (CR, Gamma, mail MOE)</label>' +
      '<label>Commentaire / preuve</label><textarea id="e-com" style="min-height:60px"></textarea>' +
      '<div class="ecs-ft"><button class="ecs-b red" id="e-del">🗑️ Effacer ma saisie</button><span class="ecs-tl"><button class="ecs-b sec" data-close="form">Annuler</button><button class="ecs-b" id="e-ok">Enregistrer</button></span></div>');
    modal('paste', '<h3>📋 Coller depuis Excel</h3><p class="ecs-hp">Une ligne par logement, colonnes : <b>UG · Adresse · Ville · Scénario commandé · Montant commandé · Scénario VTE · Montant après VTE · Motif · Date VTE</b>. Colonnes vides acceptées ; un UG existant est complété.</p><textarea id="ecs-pt"></textarea><div class="ecs-ft"><span></span><span class="ecs-tl"><button class="ecs-b sec" data-close="paste">Annuler</button><button class="ecs-b" id="ecs-pok">Importer</button></span></div>');
    modal('scen', '<h3>⚙️ Forfaits indicatifs par scénario</h3><p class="ecs-hp">Servent seulement si Gamma ne donne pas le forfait. Le montant payé reste le bon de commande après VTE.</p><div class="ecs-sc" id="ecs-sg"></div><div class="ecs-ft"><span></span><span class="ecs-tl"><button class="ecs-b sec" data-close="scen">Fermer</button><button class="ecs-b" id="ecs-sok">Enregistrer</button></span></div>');
    modal('res', '<h3>✉️ Courrier de réserve</h3><p class="ecs-hp">Généré à partir des logements en perte non imputables à BBNE (filtres actuels). À relire et faire valider avant envoi.</p><textarea id="ecs-rt" style="min-height:300px"></textarea><div class="ecs-ft"><span></span><span class="ecs-tl"><button class="ecs-b sec" data-close="res">Fermer</button><button class="ecs-b" id="ecs-rc">Copier</button></span></div>');
    modal('imp', '<h3>📥 Données Gamma</h3><p class="ecs-hp" id="ecs-it"></p><p class="ecs-hp">Si l\'appli ne trouve pas les données : dans Gamma, lance le bouton « 🔄 Gamma → Évolud », touche « ⬇️ Télécharger le fichier », puis choisis ce fichier ici.</p><input type="file" id="ecs-if" accept=".json,application/json"><div class="ecs-ft"><button class="ecs-b sec" id="ecs-ire">🔄 Relire l\'appli</button><button class="ecs-b sec" data-close="imp">Fermer</button></div>');

    root.addEventListener('click', function (e) { var tb = e.target.closest('[data-tab]'); if (tb) { onglet(tb.getAttribute('data-tab')); return; } var mm = e.target.closest('[data-m]'); if (mm) { mxAction(mm.getAttribute('data-m')); return; } if (e.target.closest('#ecs-p2')) { mxClic(e); return; } var a = e.target.closest('[data-a]'); if (a) action(a.getAttribute('data-a')); var r = e.target.closest('[data-ug]'); if (r) ouvrir(r.getAttribute('data-ug')); });
    $('ecs-x').onclick = fermer;
    ['ecs-q', 'ecs-fr', 'ecs-fv', 'ecs-ft'].forEach(function (i) { $(i).addEventListener(i === 'ecs-q' ? 'input' : 'change', render); });
    $('e-ok').onclick = enregistrer; $('e-del').onclick = effacer; $('e-pre').onclick = function () { prefill(true); };
    ['e-ad', 'e-cite', 'e-ville', 'e-type', 'e-surf', 'e-niv', 'e-annee'].forEach(function (i) { $(i).addEventListener('change', function () { prefill(false); }); });
    $('ecs-pok').onclick = coller; $('ecs-sok').onclick = saveScen; $('ecs-rc').onclick = copierRes;
    mxBuild();
    $('ecs-if').onchange = importFichier; $('ecs-ire').onclick = function () { chargeGamma().then(function () { infoImp(); render(); }); };
  }

  /* ---------- v1.3 : suivi des MEXT envoyées au fabricant ---------- */
  var KEYM = 'evolud_mext_envois_v1', MX = load(KEYM, {}), mxSel = null;
  MX.env = MX.env || {}; MX.man = MX.man || {}; MX.del = MX.del || 60; MX.fab = MX.fab || 42;
  function mxSave() { store(KEYM, MX); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function fr(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : ''; }
  function addJ(d, n) { var x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
  function mxListe() {   // logements avec menuiseries ext. au bon de commande Gamma + logements ajoutés à la main
    var out = {}, k;
    if (G) for (k in G) { var g = G[k], n = v0(venduDe(g).mext); if (n > 0) out[k] = { ug: k, ad: g.a || '', ville: g.v || '', cite: g.cite || '', n: n, vte: (g.vte && g.vte.length ? g.vte[g.vte.length - 1].d : '') }; }
    for (k in MX.man) { var m = MX.man[k]; out[k] = Object.assign(out[k] || { ug: k }, m); }
    for (k in MX.env) if (!out[k]) out[k] = { ug: k, ad: MX.env[k].ad || '', n: MX.env[k].n || NaN };
    return Object.keys(out).map(function (u) { var r = out[u], e = MX.env[u] || null; r.e = e; r.st = e ? (e.liv ? 'l' : 'e') : 'a'; r.avant = r.vte ? addJ(r.vte, MX.del - MX.fab) : ''; r.retard = r.st === 'a' && r.avant && r.avant < today(); return r; });
  }
  function onglet(n) { [].forEach.call(root.querySelectorAll('[data-tab]'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === n); }); $('ecs-p1').style.display = n === '1' ? '' : 'none'; $('ecs-p2').style.display = n === '2' ? '' : 'none'; if (n === '2') mxRender(); root.scrollTop = 0; }
  function mxRender() {
    $('mx-del').value = MX.del; $('mx-fab').value = MX.fab;
    var L = mxListe(), q = norm($('mx-q').value.trim()), fs = mxSel ? 'a' : $('mx-fs').value, c = { a: [0, 0], e: [0, 0], l: [0, 0], r: [0, 0] };
    L.forEach(function (r) { c[r.st][0]++; c[r.st][1] += v0(r.n); if (r.retard) { c.r[0]++; c.r[1] += v0(r.n); } });
    $('ecs-mA').textContent = c.a[0] + ' logt'; $('ecs-mAs').textContent = c.a[1] + ' menuiserie(s)'; $('ecs-mR').textContent = c.r[0] + ' logt'; $('ecs-mRs').textContent = 'date « envoyer avant » dépassée';
    $('ecs-mE').textContent = c.e[0] + ' logt'; $('ecs-mEs').textContent = c.e[1] + ' menuiserie(s) en fabrication'; $('ecs-mL').textContent = c.l[0] + ' logt'; $('ecs-mLs').textContent = c.l[1] + ' menuiserie(s)';
    var l = L.filter(function (r) { return (!fs || r.st === fs) && (!q || norm([r.ug, r.ad, r.ville, r.cite, r.e && r.e.lot].join(' ')).indexOf(q) >= 0); })
      .sort(function (a, b) { if (a.st === 'a' && b.st === 'a') return String(a.avant || '9').localeCompare(String(b.avant || '9')); return String((b.e && b.e.d) || '').localeCompare(String((a.e && a.e.d) || '')) || String(a.ug).localeCompare(String(b.ug)); });
    $('mx-bar').style.display = mxSel ? '' : 'none'; if (mxSel) $('mx-nsel').textContent = Object.keys(mxSel).length + ' logement(s) sélectionné(s) · ' + Object.keys(mxSel).reduce(function (t, u) { var r = L.filter(function (x) { return x.ug === u; })[0]; return t + v0(r && r.n); }, 0) + ' menuiserie(s)';
    var lbl = { a: 'À envoyer', e: 'Envoyée', l: 'Livrée' };
    $('mx-l').innerHTML = l.length ? l.map(function (r) {
      return '<div class="ecs-r ' + (r.st === 'a' ? 'perte' : 'gain') + '" data-mug="' + esc(r.ug) + '"><div class="mx-r">' + (mxSel ? '<input type="checkbox" data-ck="' + esc(r.ug) + '"' + (mxSel[r.ug] ? ' checked' : '') + '>' : '') +
        '<div class="x"><div class="top"><div><div class="ug">' + esc(r.ug) + '</div><div class="ad">' + esc(r.ad) + (r.ville ? ' · ' + esc(r.ville) : '') + (r.cite ? ' · ' + esc(r.cite) : '') + '</div></div><span class="mx-st ' + r.st + '">' + lbl[r.st] + '</span></div>' +
        '<div class="ecs-mt"><span class="ecs-ch">🪟 ' + (isFinite(r.n) ? r.n : '?') + ' menuiserie(s)</span>' + (r.vte ? '<span class="ecs-ch">VTE ' + fr(r.vte) + '</span>' : '') +
        (r.st === 'a' && r.avant ? '<span class="ecs-ch' + (r.retard ? ' w' : '') + '">' + (r.retard ? '⚠️ ' : '') + 'Envoyer avant le ' + fr(r.avant) + '</span>' : '') +
        (r.e ? '<span class="ecs-ch">📤 ' + fr(r.e.d) + (r.e.lot ? ' · ' + esc(r.e.lot) : '') + '</span>' : '') + (r.e && r.e.liv ? '<span class="ecs-ch">🚚 ' + fr(r.e.liv) + '</span>' : '') + '</div></div></div></div>'; }).join('')
      : '<div class="ecs-c ecs-e">' + (fs === 'a' ? '✅ Plus aucune MEXT à envoyer.' : 'Aucun logement.') + (G ? '' : '<br>Données Gamma non trouvées : utilise 📥 Fichier Gamma (onglet Scénarios) ou ＋ Logement.') + '</div>';
    // historique par envoi (date + lot)
    var H = {}; Object.keys(MX.env).forEach(function (u) { var e = MX.env[u], k = e.d + '|' + (e.lot || ''); (H[k] = H[k] || []).push(u); });
    var nOf = function (u) { var r = L.filter(function (x) { return x.ug === u; })[0]; return v0(r && r.n); };
    $('mx-h').innerHTML = Object.keys(H).sort().reverse().map(function (k) { var p = k.split('|'), us = H[k].sort(); return '<details class="mx-hl"><summary>📤 ' + fr(p[0]) + (p[1] ? ' · ' + esc(p[1]) : '') + ' — ' + us.length + ' logement(s), ' + us.reduce(function (t, u) { return t + nOf(u); }, 0) + ' menuiserie(s)</summary><p>' + us.map(esc).join(', ') + '</p></details>'; }).join('') || '<div class="ecs-hp">Aucun envoi enregistré.</div>';
  }
  function mxClic(e) {
    var ck = e.target.closest('[data-ck]'); if (ck) { var u = ck.getAttribute('data-ck'); if (ck.checked) mxSel[u] = 1; else delete mxSel[u]; mxRender(); return; }
    var r = e.target.closest('[data-mug]'); if (!r) return; var u2 = r.getAttribute('data-mug');
    if (mxSel) { if (mxSel[u2]) delete mxSel[u2]; else mxSel[u2] = 1; mxRender(); return; }
    mxFiche(u2);
  }
  function mxAction(a) {
    var L = mxListe();
    if (a === 'sel') { mxSel = {}; $('mx-fs').value = 'a'; mxRender(); toast('Coche les logements envoyés au fabricant'); }
    else if (a === 'stop') { mxSel = null; mxRender(); }
    else if (a === 'tout') { L.forEach(function (r) { if (r.st === 'a') mxSel[r.ug] = 1; }); mxRender(); }
    else if (a === 'aucun') { mxSel = {}; mxRender(); }
    else if (a === 'go') { var us = Object.keys(mxSel || {}); if (!us.length) { toast('Aucun logement coché'); return; } $('mx-ed').value = today(); $('mx-el').value = ''; $('mx-eu').value = us.join(' '); openM('mxenv'); }
    else if (a === 'paste') { $('mx-ed').value = today(); $('mx-el').value = ''; $('mx-eu').value = ''; openM('mxenv'); }
    else if (a === 'reste') mxReste('');
    else if (a === 'csv') mxCsv(L);
    else if (a === 'add') mxFiche(null);
  }
  function mxEnvoyer() {
    var d = $('mx-ed').value || today(), lot = $('mx-el').value.trim(), L = mxListe(), us = ($('mx-eu').value.match(/\d{5,7}/g) || []).filter(function (u, i, t) { return t.indexOf(u) === i; });
    if (!us.length) { toast('Aucun UG reconnu'); return; }
    var inconnus = [], deja = [];
    us.forEach(function (u) { var r = L.filter(function (x) { return x.ug === u; })[0]; if (!r) { inconnus.push(u); MX.man[u] = { ug: u }; } else if (r.e) deja.push(u); MX.env[u] = { d: d, lot: lot, n: r ? r.n : NaN, ad: r ? r.ad : '' }; });
    mxSave(); mxSel = null; closeM('mxenv'); mxRender();
    mxReste('✅ ' + us.length + ' logement(s) marqué(s) envoyé(s) le ' + fr(d) + (lot ? ' (' + lot + ')' : '') + '.' + (deja.length ? ' Déjà envoyés avant (date mise à jour) : ' + deja.join(', ') + '.' : '') + (inconnus.length ? ' Hors liste Gamma (ajoutés) : ' + inconnus.join(', ') + '.' : '') + '\n\n');
  }
  function mxReste(entete) {
    var L = mxListe(), a = L.filter(function (r) { return r.st === 'a'; }).sort(function (x, y) { return String(x.avant || '9').localeCompare(String(y.avant || '9')); }), n = a.reduce(function (t, r) { return t + v0(r.n); }, 0), ret = a.filter(function (r) { return r.retard; });
    var t = (entete || '') + '🪟 MEXT RESTANT À ENVOYER AU FABRICANT au ' + fr(today()) + ' : ' + a.length + ' logement(s), ' + n + ' menuiserie(s)' + (ret.length ? ', dont ' + ret.length + ' en retard' : '') + '\n\n' +
      (a.length ? a.map(function (r) { return '- ' + r.ug + ' ' + (r.ad || '') + (r.ville ? ', ' + r.ville : '') + ' : ' + (isFinite(r.n) ? r.n : '?') + ' menuiserie(s)' + (r.avant ? ' · à envoyer avant le ' + fr(r.avant) + (r.retard ? ' ⚠️ EN RETARD' : '') : ''); }).join('\n') : 'Plus rien à envoyer ✅') + '\n\nSuivi MEXT Évolud — Saïd OUFQIR';
    $('mx-rt').value = t; openM('mxres');
  }
  function mxFiche(ug) {
    var r = ug ? mxListe().filter(function (x) { return x.ug === ug; })[0] : null; r = r || { ug: '' };
    $('mx-fu').value = r.ug || ''; $('mx-fu').readOnly = !!ug; $('mx-fa').value = r.ad || ''; $('mx-fn').value = isFinite(r.n) ? r.n : ''; $('mx-fv').value = r.vte || '';
    $('mx-fe').checked = !!r.e; $('mx-fd').value = r.e ? r.e.d : today(); $('mx-fl').value = r.e ? r.e.lot || '' : ''; $('mx-fli').value = r.e && r.e.liv ? r.e.liv : '';
    $('mx-ft').textContent = ug ? 'MEXT · logement ' + ug : 'Ajouter un logement (MEXT)'; openM('mxf');
  }
  function mxFicheOk() {
    var u = $('mx-fu').value.trim(); if (!/^\d{4,7}$/.test(u)) { toast('UG invalide'); return; }
    var g = G && G[u], n = num($('mx-fn').value), m = MX.man[u] || {};
    if (!g || !(v0(venduDe(g).mext) === n)) m.n = n; m.ug = u; if ($('mx-fa').value.trim() && (!g || $('mx-fa').value.trim() !== g.a)) m.ad = $('mx-fa').value.trim(); if ($('mx-fv').value) m.vte = $('mx-fv').value; MX.man[u] = m;
    if ($('mx-fe').checked) MX.env[u] = { d: $('mx-fd').value || today(), lot: $('mx-fl').value.trim(), liv: $('mx-fli').value || '', n: n, ad: m.ad || (g && g.a) || '' }; else delete MX.env[u];
    mxSave(); closeM('mxf'); mxRender(); toast('Enregistré');
  }
  function mxCsv(L) {
    var q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }, lbl = { a: 'À envoyer', e: 'Envoyée', l: 'Livrée' };
    var lines = ['UG;Adresse;Ville;Cité;Menuiseries;Date VTE;Envoyer avant;Statut;Date envoi;Lot;Date livraison'].concat(L.sort(function (a, b) { return a.st.localeCompare(b.st) || String(a.ug).localeCompare(String(b.ug)); }).map(function (r) { return [q(r.ug), q(r.ad), q(r.ville), q(r.cite), isFinite(r.n) ? r.n : '', fr(r.vte), fr(r.avant), lbl[r.st] + (r.retard ? ' (en retard)' : ''), r.e ? fr(r.e.d) : '', q(r.e ? r.e.lot : ''), r.e && r.e.liv ? fr(r.e.liv) : ''].join(';'); }));
    lines.push('', '"Suivi MEXT — conçu et développé par Saïd OUFQIR"');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'Suivi_MEXT_' + today() + '.csv'; document.body.appendChild(a); a.click(); a.remove(); toast('Export téléchargé');
  }
  function mxBuild() {
    modal('mxenv', '<h3>📤 Envoi au fabricant</h3><div class="ecs-g2"><div><label>Date d\'envoi</label><input id="mx-ed" type="date"></div><div><label>N° de lot / commande (facultatif)</label><input id="mx-el" placeholder="ex. Lot 12"></div></div><label>UG envoyés (un par ligne, ou collés depuis Excel / le mail)</label><textarea id="mx-eu"></textarea><div class="ecs-ft"><span></span><span class="ecs-tl"><button class="ecs-b sec" data-close="mxenv">Annuler</button><button class="ecs-b" id="mx-eok">Valider l\'envoi</button></span></div>');
    modal('mxres', '<h3>📝 MEXT restant à envoyer</h3><textarea id="mx-rt" style="min-height:320px"></textarea><div class="ecs-ft"><span></span><span class="ecs-tl"><button class="ecs-b sec" data-close="mxres">Fermer</button><button class="ecs-b" id="mx-rc">Copier</button></span></div>');
    modal('mxf', '<h3 id="mx-ft">MEXT</h3><div class="ecs-g2"><div><label>UG</label><input id="mx-fu" inputmode="numeric"></div><div><label>Nb de menuiseries</label><input id="mx-fn" inputmode="numeric"></div></div><label>Adresse</label><input id="mx-fa"><label>Date VTE</label><input id="mx-fv" type="date">' +
      '<label class="ecs-ck"><input type="checkbox" id="mx-fe"> Envoyée au fabricant</label><div class="ecs-g2"><div><label>Date d\'envoi</label><input id="mx-fd" type="date"></div><div><label>Lot / commande</label><input id="mx-fl"></div></div><label>Date de livraison (si livrée)</label><input id="mx-fli" type="date">' +
      '<div class="ecs-ft"><span></span><span class="ecs-tl"><button class="ecs-b sec" data-close="mxf">Annuler</button><button class="ecs-b" id="mx-fok">Enregistrer</button></span></div>');
    $('mx-eok').onclick = mxEnvoyer; $('mx-fok').onclick = mxFicheOk;
    $('mx-rc').onclick = function () { var t = $('mx-rt'); t.select(); try { navigator.clipboard.writeText(t.value).then(function () { toast('Copié'); }, function () { document.execCommand('copy'); toast('Copié'); }); } catch (x) { document.execCommand('copy'); toast('Copié'); } };
    $('mx-q').addEventListener('input', mxRender); $('mx-fs').addEventListener('change', mxRender);
    ['mx-del', 'mx-fab'].forEach(function (i) { $(i).addEventListener('change', function () { var v = parseInt($(i).value, 10); if (v >= 0) { MX[i === 'mx-del' ? 'del' : 'fab'] = v; mxSave(); mxRender(); } }); });
  }
  function kp(id, l, sid, s, cls) { return '<div class="ecs-kp"><div class="l">' + l + '</div><div class="v ' + (cls || '') + '" id="ecs-' + id + '">—</div><div class="s"' + (sid ? ' id="ecs-' + sid + '"' : '') + '>' + (s || '') + '</div></div>'; }
  function modal(id, html) { var m = document.createElement('div'); m.className = 'ecs-md'; m.id = 'ecs-m-' + id; m.innerHTML = '<div class="ecs-sh">' + html + '</div>'; m.addEventListener('click', function (e) { if (e.target === m || e.target.getAttribute('data-close')) m.classList.remove('open'); }); document.body.appendChild(m); md[id] = m; }
  function openM(id) { md[id].classList.add('open'); }
  function closeM(id) { md[id].classList.remove('open'); }

  function action(a) {
    if (a === 'add') ouvrir(null);
    else if (a === 'paste') { $('ecs-pt').value = ''; openM('paste'); }
    else if (a === 'csv') exporter();
    else if (a === 'res') reserve();
    else if (a === 'imp') { infoImp(); openM('imp'); }
    else if (a === 'scen') { var h = ''; for (var s = 1; s <= 20; s++) h += '<div><label>Scén. ' + s + '</label><input inputmode="decimal" data-s="' + s + '" value="' + esc(forfaits[s] || '') + '"></div>'; $('ecs-sg').innerHTML = h; openM('scen'); }
  }
  function infoImp() { var n = G ? Object.keys(G).length : 0; $('ecs-it').innerHTML = G ? '✅ <b>' + n + ' logements Gamma</b> chargés (' + esc(Gsrc) + ').' : '⚠️ Données Gamma non trouvées dans l\'appli.'; }

  function filtrees() {
    var q = norm($('ecs-q').value.trim()), fr = $('ecs-fr').value, fv = $('ecs-fv').value, tri = $('ecs-ft').value;
    var l = lignes().filter(function (r) { var k = res(r);
      return (!fv || r.ville === fv) && (!fr || (fr === 'motif' ? (k === 'perte' && (!r.motif || r.motif === 'À préciser')) : k === fr)) && (!q || norm([r.ug, r.ad, r.ville, r.cite, r.postes, r.motif].join(' ')).indexOf(q) >= 0); });
    var T = { ecart: function (a, b) { return ecart(a) - ecart(b); }, gain: function (a, b) { return ecart(b) - ecart(a); }, date: function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }, ug: function (a, b) { return String(a.ug).localeCompare(String(b.ug), 'fr', { numeric: true }); } };
    return l.sort(T[tri]);
  }
  function render() {
    var all = lignes(), villes = {}; all.forEach(function (r) { if (r.ville) villes[r.ville] = 1; });
    var fv = $('ecs-fv'), cur = fv.value; fv.innerHTML = '<option value="">Toutes les villes</option>' + Object.keys(villes).sort().map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
    $('ecs-src').textContent = G ? 'Gamma : ' + Object.keys(G).length + ' logements (' + Gsrc + ')' : 'Données Gamma non trouvées · 📥 pour importer';
    var l = filtrees(), C = 0, V = 0, Gn = 0, P = 0, nG = 0, nP = 0, F = 0, R = 0, mot = {};
    l.forEach(function (r) { C += v0(r.mC); V += v0(r.mV); F += v0(r.frais); var e = ecart(r), k = res(r);
      if (k === 'gain') { Gn += e; nG++; } else if (k === 'perte') { P += e; nP++; var m = r.motif || 'À préciser'; mot[m] = (mot[m] || 0) + e; if (nonImp(r)) R += v0(r.frais); } });
    var E = V - C, Ep = C ? E / C * 100 : 0;
    $('ecs-kN').textContent = l.length; $('ecs-kNs').textContent = nP + ' en perte · ' + nG + ' en gain';
    $('ecs-kC').textContent = eur(C); $('ecs-kV').textContent = eur(V);
    $('ecs-kE').textContent = (E > 0 ? '+' : '') + eur(E); $('ecs-kE').className = 'v ' + (E < 0 ? 'neg' : E > 0 ? 'pos' : ''); $('ecs-kEs').textContent = (E > 0 ? '+' : '') + pct(Ep) + ' du commandé';
    $('ecs-kG').textContent = '+' + eur(Gn); $('ecs-kGs').textContent = nG + ' logement(s)'; $('ecs-kP').textContent = eur(P); $('ecs-kPs').textContent = nP + ' logement(s)';
    $('ecs-kF').textContent = eur(F); $('ecs-kR').textContent = eur(R);
    var b = -Ep; $('ecs-ccag').className = 'ecs-c ecs-al ' + (b >= 20 ? 'ko' : b >= 5 ? '' : 'ok');
    $('ecs-ccagT').innerHTML = C ? 'Baisse globale : <b>' + pct(Math.max(b, 0)) + '</b> (' + eur(Math.min(E, 0)) + '). ' + (b >= 20 ? '<b>Seuil de 20 % dépassé</b> : indemnisation du préjudice à demander.' : b >= 5 ? '<b>Seuil de 5 % (prix forfaitaire) dépassé</b>, sous le seuil de 20 % (prix unitaires).' : 'Sous les seuils de 5 % et 20 %.') : 'Pas encore de logement comparé.';
    var mt = Object.keys(mot).map(function (k) { return [k, mot[k]]; }).sort(function (a, b) { return a[1] - b[1]; }), mx = Math.max.apply(null, [1].concat(mt.map(function (m) { return -m[1]; })));
    $('ecs-mot').innerHTML = mt.length ? mt.map(function (m) { return '<div class="ecs-bar"><span class="n">' + esc(m[0]) + '</span><span class="t"><i style="width:' + (-m[1] / mx * 100).toFixed(1) + '%"></i></span><span class="m neg">' + eur(m[1]) + '</span></div>'; }).join('') + '<p class="ecs-hp">« À préciser » : choisis le motif dans chaque logement (filtre « Motif à préciser »).</p>' : '<div class="ecs-hp">Aucune perte.</div>';
    // quantités réelles vs vendues (logements où le réel est relevé)
    var tq = {}; l.forEach(function (r) { if (!aDesReels(r)) return; POSTES.forEach(function (p) { var k = p[0]; if (!r.q || !isFinite(r.q[k]) || (r.qPre || []).indexOf(k) >= 0) return; var t = tq[k] = tq[k] || { re: 0, ve: 0, n: 0 }; t.re += r.q[k]; t.ve += v0((r.vendu || {})[k]); t.n++; }); });
    var qk = POSTES.filter(function (p) { return tq[p[0]]; });
    $('ecs-qt').innerHTML = qk.length ? '<div class="ecs-q"><span class="hd">Poste</span><span class="hd">Réel</span><span class="hd">Vendu</span><span class="hd">Écart</span>' + qk.map(function (p) { var t = tq[p[0]], d = t.ve ? (t.re - t.ve) / t.ve * 100 : NaN;
      return '<span>' + p[1] + ' <span class="ecs-hp">(' + t.n + ' logt)</span></span><b>' + r1(t.re) + ' ' + p[2] + '</b><span>' + r1(t.ve) + ' ' + p[2] + '</span><b class="' + (d < 0 ? 'pos' : d > 0 ? 'neg' : '') + '">' + (isFinite(d) ? (d > 0 ? '+' : '') + pct(d) : '—') + '</b>'; }).join('') + '</div><p class="ecs-hp">Réel &lt; vendu (vert) = gain pour l\'entreprise, puisque le paiement se fait sur la quantité du bon de commande.</p>' : '<div class="ecs-hp">Aucune quantité réelle relevée pour l\'instant.</div>';
    // liste
    $('ecs-l').innerHTML = l.length ? l.slice(0, 400).map(function (r) { var e = ecart(r), k = res(r), p = v0(r.mC) ? e / r.mC * 100 : 0, nPre = (r.qPre || []).length;
      return '<div class="ecs-r ' + k + '" data-ug="' + esc(r.ug) + '"><div class="top"><div><div class="ug">' + esc(r.ug) + '</div><div class="ad">' + esc(r.ad) + (r.ville ? ' · ' + esc(r.ville) : '') + (r.cite ? ' · ' + esc(r.cite) : '') + '</div></div>' +
        '<span class="ecs-bd ' + k + '">' + (e > 0 ? '+' : '') + eur(e) + (v0(r.mC) ? ' · ' + (e > 0 ? '+' : '') + pct(p) : '') + '</span></div>' +
        '<div class="ecs-cmp"><div class="bx">Commandé<b>Scén. ' + esc(r.scC || '?') + '</b>' + eur(v0(r.mC)) + '</div><span>➜</span><div class="bx">Après VTE<b>' + (r.scV ? 'Scén. ' + esc(r.scV) : 'Bon de commande') + '</b>' + eur(v0(r.mV)) + '</div></div>' +
        '<div class="ecs-mt">' + (r.gamma ? '<span class="ecs-ch">Gamma</span>' : '') + (r.date ? '<span class="ecs-ch">VTE ' + new Date(r.date).toLocaleDateString('fr-FR') + '</span>' : '') + (k === 'perte' ? '<span class="ecs-ch' + (r.motif && r.motif !== 'À préciser' ? '' : ' w') + '">' + esc(r.motif || 'Motif à préciser') + '</span>' : '') +
        (r.postes ? '<span class="ecs-ch">− ' + esc(r.postes) + '</span>' : '') + (v0(r.frais) ? '<span class="ecs-ch">Frais ' + eur(r.frais) + '</span>' : '') + (nPre ? '<span class="ecs-ch w">🔮 ' + nPre + ' quantité(s) à vérifier</span>' : '') + (k === 'perte' && !r.preuve ? '<span class="ecs-ch w">⚠️ Pas de preuve écrite</span>' : '') + '</div></div>'; }).join('') + (l.length > 400 ? '<p class="ecs-hp">' + (l.length - 400) + ' autres : affine avec la recherche.</p>' : '')
      : '<div class="ecs-c ecs-e">Aucun logement.<br>Les logements avec un bon de commande Gamma apparaissent tout seuls ; sinon ajoute-les avec ＋.</div>';
  }

  /* ---------- fiche logement ---------- */
  function ouvrir(ug) {
    var r = null; if (ug) lignes().forEach(function (x) { if (String(x.ug) === String(ug)) r = x; });
    r = r || { date: new Date().toISOString().slice(0, 10), vendu: {} }; editUg = ug || null;
    $('ecs-ftit').textContent = ug ? 'Logement ' + ug : 'Nouveau logement';
    var set = function (id, v) { $(id).value = (v == null || (typeof v === 'number' && isNaN(v))) ? '' : v; };
    set('e-ug', r.ug); $('e-ug').readOnly = !!ug; set('e-date', r.date); set('e-ad', r.ad); set('e-ville', r.ville); set('e-cite', r.cite); set('e-scC', r.scC); set('e-mC', r.mC); set('e-scV', r.scV); set('e-mV', r.mV);
    set('e-type', r.type || ''); set('e-surf', r.surf); set('e-niv', r.niv || ''); set('e-annee', r.annee); set('e-postes', r.postes); $('e-motif').value = r.motif || 'À préciser'; set('e-frais', r.frais); $('e-preuve').checked = !!r.preuve; set('e-com', r.com);
    var g = G && ug && G[ug]; $('e-gam').innerHTML = g ? 'Gamma : scénario ' + esc(g.sc || '?') + ' (forfait ' + eur(v0(g.forf)) + ') · bon de commande VTE ' + eur(v0(g.bdc && g.bdc.tot)) + (g.bdc && g.bdc.cible ? ' · budget cible ' + eur(g.bdc.cible) : '') + '. Tes saisies remplacent ces valeurs.' : '';
    $('e-q').innerHTML = '<span class="hd">Poste</span><span class="hd">Réel</span><span class="hd">Vendu</span><span class="hd">Écart</span>' + POSTES.map(function (p) {
      var k = p[0], v = r.q && isFinite(r.q[k]) ? r.q[k] : '', pre = (r.qPre || []).indexOf(k) >= 0 && v !== '', ve = (r.vendu || {})[k];
      return '<span>' + p[1] + ' <span class="ecs-hp">' + p[2] + '</span></span><input id="eq-' + k + '" inputmode="decimal" value="' + v + '" class="' + (pre ? 'pre' : '') + '"><span>' + (isFinite(ve) ? ve : '—') + '</span><b id="ed-' + k + '"></b>'; }).join('');
    POSTES.forEach(function (p) { var i = $('eq-' + p[0]); i.addEventListener('input', function () { i.classList.remove('pre'); ecartQ(r); }); });
    $('e-q').dataset.ug = r.ug || ''; ecartQ(r); $('e-sim').innerHTML = '';
    $('e-del').style.visibility = saisie(ug) ? 'visible' : 'hidden'; $('e-del').textContent = '🗑️ Effacer ma saisie';
    openM('form');
    if (!aDesReels(r) && !(r.qPre || []).length) prefill(false);
  }
  function ecartQ(r) { POSTES.forEach(function (p) { var re = num($('eq-' + p[0]).value), ve = (r.vendu || {})[p[0]], el = $('ed-' + p[0]); if (isFinite(re) && isFinite(ve) && ve) { var d = (re - ve) / ve * 100; el.textContent = (d > 0 ? '+' : '') + pct(d); el.className = d < 0 ? 'pos' : d > 0 ? 'neg' : ''; } else el.textContent = ''; }); }
  function courant() { return { ug: $('e-ug').value.trim(), ad: $('e-ad').value, ville: $('e-ville').value, cite: $('e-cite').value, type: $('e-type').value, surf: num($('e-surf').value), niv: $('e-niv').value, annee: num($('e-annee').value), scC: $('e-scC').value.trim(), classe: (G && G[editUg] && G[editUg].cl) || '' }; }
  function prefill(force) {
    var c = courant(), sim = similaires(c, lignes()), info = $('e-sim');
    if (!sim.length) { if (force) info.innerHTML = '<div class="ecs-sim">Aucun logement similaire trouvé. Renseigne l\'adresse, la cité, l\'année, le type ou la surface.</div>'; return; }
    var n = 0, src = {};
    POSTES.forEach(function (p) { var k = p[0], inp = $('eq-' + k); if (inp.value && !inp.classList.contains('pre')) return; if (inp.value && !force) return;
      var reels = sim.filter(function (x) { return x.r.q && isFinite(x.r.q[k]) && (x.r.qPre || []).indexOf(k) < 0; }).map(function (x) { return x.r.q[k]; });
      var vals = reels.length ? reels : sim.map(function (x) { return (x.r.vendu || {})[k]; }).filter(isFinite);
      if (!vals.length) return; inp.value = r1(median(vals)); inp.classList.add('pre'); n++; src[reels.length ? 'réel' : 'vendu'] = 1; });
    var cur = null; lignes().forEach(function (x) { if (String(x.ug) === String(c.ug)) cur = x; }); ecartQ(cur || { vendu: {} });
    var conf = sim.length >= 4 ? 'élevée' : sim.length >= 2 ? 'moyenne' : 'faible';
    info.innerHTML = '<div class="ecs-sim">🔮 <b>' + n + ' poste(s) pré-rempli(s)</b> (médiane des quantités ' + Object.keys(src).join(' / ') + ') d\'après ' + sim.length + ' logement(s) similaire(s), fiabilité ' + conf + ' : ' + sim.map(function (x) { return esc(x.r.ug); }).join(', ') + '.</div>';
  }
  function enregistrer() {
    var ug = $('e-ug').value.trim(); if (!ug) { toast('Indique l\'UG'); return; }
    if (!editUg && lignes().some(function (x) { return String(x.ug) === ug; })) { editUg = ug; }
    var g = G && G[ug], s = saisie(ug); if (!s) { s = { ug: ug }; saisies.push(s); }
    var val = function (id) { return $(id).value.trim(); };
    // on ne garde que ce qui diffère de Gamma (Gamma reste la référence quand il est mis à jour)
    s.ad = (g && val('e-ad') === (g.a || '')) ? '' : val('e-ad'); s.ville = (g && val('e-ville') === (g.v || '')) ? '' : val('e-ville'); s.cite = (g && val('e-cite') === (g.cite || '')) ? '' : val('e-cite');
    var mC = num(val('e-mC')), mV = num(val('e-mV'));
    s.scC = (g && val('e-scC') === String(g.sc || '')) ? '' : val('e-scC'); s.mC = (g && mC === v0(g.forf)) ? NaN : mC;
    if (!isFinite(s.mC) && !g && forfaits[s.scC]) s.mC = num(forfaits[s.scC]);
    s.scV = val('e-scV'); s.mV = (g && g.bdc && mV === g.bdc.tot) ? NaN : mV; if (!isFinite(mV) && !g && forfaits[s.scV]) s.mV = num(forfaits[s.scV]);
    s.date = val('e-date'); s.type = $('e-type').value; s.surf = num(val('e-surf')); s.niv = $('e-niv').value; s.annee = num(val('e-annee'));
    s.postes = val('e-postes'); s.motif = $('e-motif').value; s.frais = num(val('e-frais')); s.preuve = $('e-preuve').checked; s.com = val('e-com');
    s.q = {}; s.qPre = []; POSTES.forEach(function (p) { var i = $('eq-' + p[0]), v = num(i.value); if (isFinite(v)) { s.q[p[0]] = v; if (i.classList.contains('pre')) s.qPre.push(p[0]); } });
    s.maj = Date.now(); store(KEY, saisies); closeM('form'); render(); toast('Enregistré');
  }
  var armDel = 0;
  function effacer() { var b = $('e-del'); if (Date.now() - armDel > 3000) { armDel = Date.now(); b.textContent = 'Confirmer ?'; setTimeout(function () { b.textContent = '🗑️ Effacer ma saisie'; }, 3000); return; }
    saisies = saisies.filter(function (x) { return String(x.ug) !== String(editUg); }); store(KEY, saisies); closeM('form'); render(); toast('Saisie effacée'); }

  /* ---------- import / export ---------- */
  function pDate(s) { s = String(s || '').trim(); var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
  function coller() {
    var n = 0; $('ecs-pt').value.split(/\r?\n/).forEach(function (l) { if (!l.trim()) return; var c = l.split(l.indexOf('\t') >= 0 ? '\t' : ';').map(function (x) { return x.trim(); });
      if (!/^\d{4,7}$/.test(c[0])) return; var s = saisie(c[0]); if (!s) { s = { ug: c[0] }; saisies.push(s); }
      var put = function (k, v) { if (v !== '' && !(typeof v === 'number' && isNaN(v))) s[k] = v; };
      put('ad', c[1] || ''); put('ville', c[2] || ''); put('scC', c[3] || ''); put('mC', num(c[4])); put('scV', c[5] || ''); put('mV', num(c[6])); put('motif', MOTIFS.indexOf(c[7]) >= 0 ? c[7] : (c[7] ? 'À préciser' : '')); if (c[7] && MOTIFS.indexOf(c[7]) < 0) s.com = (s.com ? s.com + ' · ' : '') + c[7]; put('date', pDate(c[8])); n++; });
    store(KEY, saisies); closeM('paste'); render(); toast(n + ' logement(s) importé(s)');
  }
  function saveScen() { [].forEach.call(document.querySelectorAll('#ecs-sg input'), function (i) { var v = i.value.trim(); if (v) forfaits[i.getAttribute('data-s')] = v; else delete forfaits[i.getAttribute('data-s')]; }); store(KEYS, forfaits); closeM('scen'); render(); toast('Forfaits enregistrés'); }
  function importFichier(e) {
    var f = e.target.files && e.target.files[0]; if (!f) return; var rd = new FileReader();
    rd.onload = function () { try { var j = JSON.parse(rd.result), d = j.data || j; if (!isMapUG(d)) throw 0; store(KEYG, { date: (j.meta && j.meta.date) || new Date().toISOString().slice(0, 10), data: d }); G = d; Gsrc = 'fichier importé'; infoImp(); render(); toast(Object.keys(d).length + ' logements Gamma importés'); } catch (x) { toast('Fichier non reconnu'); } };
    rd.readAsText(f);
  }
  function exporter() {
    var l = filtrees(), q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }, f = function (n) { return isFinite(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : ''; };
    var h = ['UG', 'Adresse', 'Ville', 'Cité', 'Date VTE', 'Scénario commandé', 'Montant commandé', 'Scénario VTE', 'Montant après VTE', 'Écart €', 'Écart %', 'Résultat', 'Postes retirés', 'Motif', 'Frais engagés', 'Preuve écrite', 'Commentaire', 'Type', 'Surface', 'Année'];
    POSTES.forEach(function (p) { h.push(p[1] + ' réel (' + p[2] + ')', p[1] + ' vendu (' + p[2] + ')'); });
    var L = [h.join(';')].concat(l.map(function (r) { var e = ecart(r), row = [q(r.ug), q(r.ad), q(r.ville), q(r.cite), r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '', q(r.scC), f(r.mC), q(r.scV), f(r.mV), f(e), v0(r.mC) ? f(e / r.mC * 100) : '', { perte: 'Perte', gain: 'Gain', eq: 'Sans écart' }[res(r)], q(r.postes), q(r.motif), f(r.frais), r.preuve ? 'Oui' : 'Non', q(r.com), q(r.type), f(r.surf), f(r.annee)];
      POSTES.forEach(function (p) { var k = p[0]; row.push(r.q ? f(r.q[k]) + ((r.qPre || []).indexOf(k) >= 0 && isFinite(r.q[k]) ? ' (estimé)' : '') : '', f((r.vendu || {})[k])); }); return row.join(';'); }));
    L.push('', '"Comparatif scénarios — conçu et développé par Saïd OUFQIR"');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'Comparatif_scenarios_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); toast('Export téléchargé');
  }
  function reserve() {
    var l = filtrees().filter(function (r) { return res(r) === 'perte' && nonImp(r); }), C = 0, V = 0, F = 0;
    l.forEach(function (r) { C += v0(r.mC); V += v0(r.mV); F += v0(r.frais); });
    var t = 'Objet : Marché Évolu\'D – Réserves sur la réduction du périmètre des travaux constatée en VTE\n\nMadame, Monsieur,\n\nÀ l\'issue des visites techniques d\'entrée (VTE), nous constatons que le périmètre des travaux retenu est nettement inférieur à celui des scénarios commandés, pour des raisons qui ne sont pas imputables à notre entreprise.\n\nLogements concernés :\n';
    l.forEach(function (r) { t += '- ' + r.ug + ' ' + (r.ad || '') + (r.ville ? ', ' + r.ville : '') + ' : scénario ' + (r.scC || '?') + ' commandé (' + eur(v0(r.mC)) + ') ➜ ' + (r.scV ? 'scénario ' + r.scV : 'bon de commande') + ' retenu (' + eur(v0(r.mV)) + '), soit ' + eur(ecart(r)) + '. Motif : ' + (r.motif || 'à préciser') + (r.postes ? ' (postes retirés : ' + r.postes + ')' : '') + '.\n'; });
    t += '\nAu total, le montant passe de ' + eur(C) + ' à ' + eur(V) + ', soit ' + eur(V - C) + (C ? ' (' + pct((V - C) / C * 100) + ')' : '') + '.\n';
    if (F) t += 'Les frais déjà engagés pour ces logements (VTE, prises de cotes, approvisionnements, organisation des équipes) s\'élèvent à ' + eur(F) + '.\n';
    t += '\nNos moyens (équipes, approvisionnements, plan de charge) ont été dimensionnés sur la base des scénarios commandés. Nous émettons donc toutes réserves sur les conséquences financières de cette réduction et nous réservons le droit de présenter une demande d\'indemnisation des frais engagés et du préjudice subi, conformément aux stipulations du marché et, le cas échéant, à l\'article 15 du CCAG Travaux 2021.\n\nNous vous remercions de nous confirmer par écrit, pour chaque logement, le scénario définitivement retenu et le motif du changement.\n\nFait le ' + new Date().toLocaleDateString('fr-FR') + '.\n\nSaïd OUFQIR\nBouygues Bâtiment Nord-Est';
    $('ecs-rt').value = l.length ? t : 'Aucun logement en perte non imputable à BBNE dans la sélection actuelle.'; openM('res');
  }
  function copierRes() { var t = $('ecs-rt'); t.select(); var ok = function () { toast('Copié'); }; try { navigator.clipboard.writeText(t.value).then(ok, function () { document.execCommand('copy'); ok(); }); } catch (e) { document.execCommand('copy'); ok(); } }

  /* ---------- ouverture ---------- */
  function ouvrirModule(ug) { if (!autorise()) return; if (!root) build(); root.classList.add('open'); document.documentElement.style.overflow = 'hidden';
    $('ecs-l').innerHTML = '<div class="ecs-c ecs-e">Lecture des données Gamma…</div>';
    chargeGamma().then(function () { render(); if ($('ecs-p2').style.display !== 'none') mxRender(); if (ug === 'mext') onglet('2'); else if (ug) ouvrir(String(ug)); }); }
  function fermer() { root.classList.remove('open'); document.documentElement.style.overflow = ''; }
  // bouton visible seulement pour les comptes qui voient l'onglet « Balance » (conducteur / direction), jamais pour les équipes
  function autorise() {   // l'onglet « Balance » est visible (conducteur / direction) ; jamais pour les équipes
    var zones = document.querySelectorAll('nav, #tabs, .tabs, footer, [class*="tab"], [class*="nav"]');
    for (var i = 0; i < zones.length; i++) { var z = zones[i]; if (z.closest && z.closest('.ecs, .ecs-md')) continue; if (/\bbalance\b/i.test(z.textContent || '')) return true; }
    var els = document.body ? document.body.getElementsByTagName('*') : [];
    for (var j = 0; j < els.length; j++) { var e = els[j]; if (e.closest && e.closest('.ecs, .ecs-md, script, style')) continue;
      var t = ''; for (var c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) t += c.nodeValue;
      if (/^\W*balance\W*$/i.test(t.trim())) return true; }
    return false; }
  function diag() {   // adresse de l'appli + #scen : petit bandeau de contrôle
    if (!/scen/i.test(location.hash) || document.getElementById('ecs-diag')) return;
    var d = document.createElement('div'); d.id = 'ecs-diag'; d.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147483600;background:#23355f;color:#fff;padding:10px;border-radius:10px;font:14px system-ui,sans-serif';
    d.style.pointerEvents = 'auto'; d.textContent = 'Comparatif ' + VERSION + ' chargé · onglet Balance trouvé : ' + (autorise() ? 'oui' : 'non') + ' · bouton : ' + (document.querySelector('.ecs-fab') ? 'oui' : 'non');
    d.onclick = function () { d.remove(); }; document.body.appendChild(d); }
  function fab() {
    if (!document.body) return; styles(); var b = document.querySelector('.ecs-fab');
    if (!b) { b = document.createElement('button'); b.className = 'ecs-fab'; b.textContent = '⚖️'; b.title = 'Scénarios & MEXT'; b.onclick = function () { ouvrirModule(); }; b.style.display = 'none'; document.body.appendChild(b); }
    var ok = autorise(); b.style.display = ok ? '' : 'none'; if (!ok && root && root.classList.contains('open')) fermer();
  }

  window.EvoludScen = { open: ouvrirModule, mext: function () { ouvrirModule('mext'); }, close: fermer, version: VERSION, _test: { venduDe: venduDe, score: score, rue: rue, isMapUG: isMapUG, fromParts: fromParts, search: search } };
  function go() { fab(); setInterval(function () { fab(); diag(); }, 1500); }   // v1.2 : n'attend plus la fin du chargement de l'appli
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
