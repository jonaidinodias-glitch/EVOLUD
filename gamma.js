/* Évolud – mise à jour quotidienne Gamma → Évolud Chantier (lancé par le favori « 🔄 Gamma → Évolud »)
 * Conçu et développé par Saïd OUFQIR
 * Lit dans Gamma (session de la personne connectée) : liste des logements (étapes, scénario),
 * planning (dates de travaux, RDV VTE / VTS), bons de commande des VTE, locataires et (v5.28) réserves MOE des logements
 * passés en VTS – et envoie tout au serveur Évolud. UN SEUL bouton pour toute la mise à jour Gamma du chantier.
 * Une seule mise à jour par jour suffit pour toute l'équipe.
 */
(function () {
'use strict';
var C = window.__EVG;
if (!C || !C.u) { alert('Bouton Gamma → Évolud incomplet : réinstalle-le depuis l\'appli (Plus → 🔄 Bouton Gamma).'); return; }
if (!/gamma-solutions\.fr$/i.test(location.hostname)) { alert('Ouvre d\'abord Gamma (www.metc.gamma-solutions.fr), connecte-toi, puis touche le bouton.'); return; }
if (document.getElementById('evg-box')) return;
var BASE = location.origin + '/index.php';
var pad = function (n) { return String(n).padStart(2, '0'); };
var d0 = new Date(), TODAY = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());
var HEURE = pad(d0.getHours()) + 'h' + pad(d0.getMinutes());
var MIDNIGHT = new Date(TODAY + 'T00:00:00').getTime();

/* ---------- fenêtre de progression ---------- */
var box = document.createElement('div');
box.id = 'evg-box';
box.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;max-width:560px;margin:0 auto;z-index:2147483647;background:#fff;border:3px solid #1f3a5f;border-radius:14px;padding:16px;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d2733;box-shadow:0 10px 40px rgba(0,0,0,.35)';
box.innerHTML = '<div style="font-weight:800;font-size:17px;margin-bottom:6px">🔄 Gamma → Évolud</div><div id="evg-msg">Démarrage…</div><div style="height:8px;background:#e6eaf0;border-radius:6px;margin:10px 0"><div id="evg-bar" style="height:8px;width:2%;background:#e8792b;border-radius:6px;transition:width .3s"></div></div><div id="evg-btns" style="display:flex;gap:8px;flex-wrap:wrap"></div><div style="font-size:11px;color:#8a96a8;margin-top:8px">Évolud Chantier · conçu et développé par Saïd OUFQIR</div>';
document.body.appendChild(box);
var $m = box.querySelector('#evg-msg'), $b = box.querySelector('#evg-bar'), $btn = box.querySelector('#evg-btns');
function msg(h, p) { $m.innerHTML = h; if (p != null) $b.style.width = Math.max(2, Math.min(100, p)) + '%'; }
function btn(label, fn, main) { var b = document.createElement('button'); b.textContent = label; b.style.cssText = 'flex:1;padding:12px;border:0;border-radius:10px;font-size:15px;cursor:pointer;' + (main ? 'background:#1f3a5f;color:#fff;font-weight:700' : 'background:#eef1f5;color:#1d2733'); b.onclick = fn; $btn.appendChild(b); return b; }
function close() { box.remove(); }

/* ---------- serveur Évolud ---------- */
function api(body, essai) {   // v5.24.2 : jusqu'à 4 essais si le réseau coupe (« Load failed »)
  essai = essai || 1;
  var b = Object.assign({ token: C.t, device: C.d, user: C.n }, body);
  return fetch(C.u, { method: 'POST', body: JSON.stringify(b) }).then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) throw new Error(j.error || 'erreur serveur'); return j; })
    .catch(function (e) { if (essai >= 4 || /jeton|token|autoris/i.test(String(e && e.message))) throw e; return new Promise(function (ok) { setTimeout(ok, 2000 * essai); }).then(function () { return api(body, essai + 1); }); });
}

/* ---------- lecture Gamma ---------- */
var parser = new DOMParser();
function getDoc(url) {
  return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('Gamma ' + r.status); return r.text(); }).then(function (t) { return parser.parseFromString(t, 'text/html'); });
}
var txt = function (e) { return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
var num = function (s) { s = String(s || '').replace(/[€\s]/g, ''); if (/,\d{3}(\.|$)/.test(s) || /\.\d{1,2}$/.test(s)) s = s.replace(/,/g, ''); else s = s.replace(/\./g, '').replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? 0 : n; };
var ymd = function (s) { var m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ''; };

function readCommandes() { // liste des logements : même source JSON que le tableau « Avancement commande » de Gamma
  var url = location.origin + '/pages/data_tableau_general.php?id_ville=0&id_pot=0&annee=0&scenario=0&territoire=0&etat=0&antenne=0';
  return fetch(url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('Gamma ' + r.status); return r.text(); }).then(function (t) {
    var j; try { j = JSON.parse(t); } catch (e) { if (/password|connexion/i.test(t)) throw new Error('LOGIN'); throw new Error('liste des logements illisible (Gamma a peut-être changé)'); }
    var rows = Array.isArray(j) ? j : (j.data || j.aaData || []);
    if (!rows.length) throw new Error('aucun logement renvoyé par Gamma');
    var frag = function (h) { return parser.parseFromString('<div>' + String(h == null ? '' : h) + '</div>', 'text/html').body.firstChild; };
    var ph = function (h) { var d = frag(h), img = d.querySelector('img'), sp = d.querySelector('span'); return [txt(sp) || txt(d), img ? (img.getAttribute('title') || '') : '']; };
    var out = {};
    rows.forEach(function (r) {
      var ug = txt(frag(r.code_ug)); if (!/^\d{5,7}$/.test(ug)) return;
      var act = frag(r.action), link = act.querySelector('a[href*="id_ug="]'), id = link ? ((link.getAttribute('href').match(/id_ug=(\d+)/) || [])[1] || '') : (String(r.id_ug || ''));
      var sc = txt(frag(r.scenario)), m = sc.match(/n°\s*(\d+)\s*\(([\d\s.,]+)\s*€\)/);
      out[ug] = { id: id, a: txt(frag(r.adresse)), v: txt(frag(r.ville)), cite: txt(frag(r.pot)), an: txt(frag(r.annee)), cl: txt(frag(r.classe)), doc: txt(frag(r.document)).slice(0, 200),
        ph: [ph(r.preparation), ph(r.conception), ph(r.realisation), ph(r.reception)], sc: m ? +m[1] : '', forf: m ? num(m[2]) : 0 };
    });
    if (!Object.keys(out).length) throw new Error('format de la liste Gamma non reconnu');
    return out;
  });
}

function readPlanning() {
  var s = new Date(Date.now() - 400 * 864e5), e = new Date(Date.now() + 365 * 864e5);
  var body = new URLSearchParams();
  body.set('start', s.toISOString().slice(0, 10) + 'T00:00:00'); body.set('end', e.toISOString().slice(0, 10) + 'T00:00:00');
  body.set('where_requete', ' AND ( antenne.id_territoire="2")');
  body.set('from_requete', 'JOIN etat_process ON ug.id_ug=etat_process.id_ug JOIN pot ON pot.id_pot=ug.id_pot JOIN ville ON ville.id_ville=pot.id_ville JOIN antenne ON antenne.id_antenne=ville.id_antenne ');
  body.set('charge_reno', '0'); body.set('filtre_type', '');
  return fetch(location.origin + '/includes/planning/load_events.php', { method: 'POST', credentials: 'same-origin', body: body })
    .then(function (r) { return r.json(); }).catch(function () { return []; });
}

// v5.24 : page Dossier = nom et téléphone du locataire (étape 2 « Planification de la visite d'entrée »)
function fieldAfter(doc, re) {   // v5.24.4 : la page Dossier répète les champs à chaque étape : on prend la PREMIÈRE valeur NON VIDE
  var all = doc.body ? doc.body.getElementsByTagName('*') : [], hit = false, LBL = /^(Nom locataire|T[ée]l[ée]phone locataire|Mail locataire|Date (de )?(visite|d[ée]but|fin)|Heure|Agent MOE|Choix (TCE|MOE)|Code UG|Adresse|Cit[ée]|Ville|Sc[ée]nario)/i;
  for (var i = 0; i < all.length; i++) { var e = all[i], tg = e.tagName, tx = (e.textContent || '').trim();
    if (!hit) { if (e.children.length === 0 && re.test(tx) && tx.length < 40) hit = true; continue; }
    var v = '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tg)) { if (/^(hidden|button|submit)$/i.test(e.type || '')) continue;
      v = tg === 'SELECT' ? String((e.selectedOptions && e.selectedOptions[0] && e.selectedOptions[0].textContent) || (e.querySelector('option[selected]') || {}).textContent || '').trim() : String(e.value || e.getAttribute('value') || e.getAttribute('data-value') || e.textContent || '').trim();
      if (!v) { var ph = String(e.getAttribute('placeholder') || '').trim(); if (ph && !re.test(ph)) v = ph; }
      if (v) return v; hit = false; continue; }
    if (e.children.length === 0 && tx && !/^(SCRIPT|STYLE|OPTION)$/.test(tg)) { if (LBL.test(tx)) { hit = re.test(tx); continue; } return tx; }
  }
  return '';
}
function readDossier(id) {   // v5.28.3 : champs lus par leur nom (nom_locataire, telephone_locataire…) – l'étiquette est APRÈS la case dans Gamma
  return fetch(BASE + '?module=dossier&id_ug=' + id, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('Gamma ' + r.status); return r.text(); }).then(function (raw) {
    var doc = parser.parseFromString(raw, 'text/html');
    var val = function (nm) { var E = doc.querySelectorAll('[name="' + nm + '"],#' + nm); for (var k = 0; k < E.length; k++) { var v = String(E[k].getAttribute('value') || E[k].value || '').trim(); if (v) return v; } return ''; };
    var n = val('nom_locataire'), t = val('telephone_locataire').replace(/[^\d+]/g, ''), m = val('mail_locataire');
    if (!n) n = fieldAfter(doc, /^\s*Nom\s+(du\s+)?locataire\s*\*?\s*:?\s*$/i);
    if (!t) t = fieldAfter(doc, /^\s*T[ée]l[ée]phone\s+(du\s+)?locataire\s*\*?\s*:?\s*$/i).replace(/[^\d+]/g, '');
    if (/^[\d\s.+]{8,}$/.test(n)) { if (!t) t = n.replace(/[^\d+]/g, ''); n = ''; }
    if (t === '0' || /^0+$/.test(t)) t = '';
    // dossier : montants, scénario cible, dates de travaux, documents (diags amiante / plomb avec présence Oui/Non)
    var docs = [], re = /<td>\s*([^<]{2,60}?)\s*<\/td>\s*<td>\s*<a href="\.?\/?(fichiers\/[^"]+)"[^>]*>[^<]*<\/a>\s*<\/td>\s*<td>\s*(?:<span[^>]*>\s*(Oui|Non)\s*<\/span>)?\s*<\/td>/gi, mm;
    while ((mm = re.exec(raw)) && docs.length < 40) docs.push([mm[1].trim(), mm[2], mm[3] || '']);
    var D = { mi: num(val('montant_travaux')), mc: num(val('montant_commande')), sc: val('scenario_cible'), deb: val('date_rdv_travaux'), fin: val('date_fin_travaux'), docs: docs,
      am: /Pr[ée]sence amiante ou plomb dans l'UG/i.test(raw) };
    return (n || t || docs.length) ? [n.slice(0, 60), t.slice(0, 20), m.slice(0, 80), D] : null;
  }).catch(function () { return null; });
}
/* v6.18 : colonnes Codes / Cotraitant / TVA / Lot des bons de commande (lues par le titre des colonnes, où qu'elles soient sur la page) */
var nK = function (s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '').slice(0, 60); };
var tvaN = function (s) { s = String(s || '').trim(); if (!s) return ''; var n = num(s.replace(/%/g, '').trim()); if (!n) return s; return /%/.test(s) || n > 1 ? Math.round(n * 10) / 1000 : n; };
function colsOf(tab) {
  var hr = tab.querySelector('thead tr') || [].slice.call(tab.querySelectorAll('tr')).filter(function (r) { return r.querySelector('th'); })[0];
  if (!hr) return null;
  var H = [].slice.call(hr.cells).map(function (c) { return txt(c).toLowerCase(); }), f = function (re) { for (var i = 0; i < H.length; i++) if (re.test(H[i])) return i; return -1; };
  var o = { art: f(/article|d[ée]signation|libell/), pu: f(/prix|p\.?\s*u/), code: f(/^codes?\b|code\s*(bpu|article|prix)/), cot: f(/co-?\s*traitant|entreprise|intervenant/), tva: f(/tva/), lot: f(/^lots?\b/), H: H };
  return (o.code >= 0 || o.cot >= 0 || o.tva >= 0 || o.lot >= 0) ? o : (H.length ? { H: H } : null);
}
function extraOf(doc) {   // article|PU → [code, cotraitant, TVA, lot]
  var X = {}, heads = [];
  [].slice.call(doc.querySelectorAll('table')).forEach(function (tab) {
    var o = colsOf(tab); if (!o) return; if (heads.length < 3) heads.push(o.H.join(' | '));
    if (!(o.code >= 0 || o.cot >= 0 || o.tva >= 0 || o.lot >= 0)) return;
    var ia = o.art >= 0 ? o.art : 0, ip = o.pu >= 0 ? o.pu : 1;
    [].slice.call(tab.querySelectorAll('tbody tr')).forEach(function (tr) { var c = tr.cells; if (!c || c.length <= ia || /Total|Budget|Delta/i.test(txt(tr))) return;
      var g = function (i) { return i >= 0 && c[i] ? txt(c[i]) : ''; }, v = [g(o.code), g(o.cot), tvaN(g(o.tva)), g(o.lot)];
      if (v.join('') === '') return;
      X[nK(g(ia)) + '|' + num(g(ip)).toFixed(2)] = v; X[nK(g(ia))] = X[nK(g(ia))] || v; });
  });
  X.__h = heads; return X;
}
function addX(row, X, c) {   // ajoute [code, cotraitant, TVA, lot] à la ligne lue (sinon colonnes 6 à 9 du tableau si elles existent)
  var v = X[nK(row[0]) + '|' + Number(row[1] || 0).toFixed(2)] || X[nK(row[0])];
  if (!v && c && c.length >= 9) v = [txt(c[5]), txt(c[6]), tvaN(txt(c[7])), txt(c[8])];
  return v && v.join('') !== '' ? row.concat(v) : row;
}
function readVTE(id) {
  return getDoc(BASE + '?module=visualisation_visite&id_ug=' + id).then(function (doc) {
    var H2 = [].slice.call(doc.querySelectorAll('h2'));
    var res = H2.filter(function (h) { return /R[ée]sum[ée] de la commande/i.test(txt(h)); })[0];
    if (!res) return null;
    var X = extraOf(doc); try { if (X.__h.length) localStorage.setItem('evolud_dbg_bdc', X.__h.join(' // ').slice(0, 600)); } catch (e) { }
    var sec = H2.filter(function (h) { return /ligne n°/i.test(txt(h)); }).map(function (h) {
      var n = txt(h).replace(/^.*ligne n°\s*\d+\s*:\s*/i, ''); var el = h.nextElementSibling, tot = 0, com = '', SL = [];
      for (var k = 0; k < 4 && el; k++, el = el.nextElementSibling) { var ta = el.querySelector && el.querySelector('textarea'); if (ta && !com) com = (ta.value || ta.textContent || '').trim().slice(0, 400);
        var trs = el.querySelectorAll ? [].slice.call(el.querySelectorAll('tbody tr')) : [], tr = trs.filter(function (r) { return /Total g[ée]n[ée]ral/i.test(txt(r)); })[0];
        if (tr) { trs.forEach(function (r) { var c = r.cells; if (c.length >= 5 && !/Total|Budget|Delta/i.test(txt(r))) SL.push(addX([txt(c[0]).slice(0, 160), num(txt(c[1])), txt(c[2]), num(txt(c[3])), num(txt(c[4]))], X, c)); }); tot = num(txt(tr.cells[tr.cells.length - 1])); break; } }
      return [n, Math.round(tot * 100) / 100, com, SL];
    });
    var tab = res.nextElementSibling && res.nextElementSibling.querySelector('table');
    var L = [], tot = 0, cible = 0;
    if (tab) [].slice.call(tab.querySelectorAll('tbody tr')).forEach(function (tr) {
      var c = tr.cells, t0 = txt(tr);
      if (/Total g[ée]n[ée]ral/i.test(t0)) tot = num(txt(c[c.length - 1]));
      else if (/Budget cible/i.test(t0)) cible = num(txt(c[c.length - 1]));
      else if (c.length >= 5 && !/Delta/i.test(t0)) L.push(addX([txt(c[0]).slice(0, 160), num(txt(c[1])), txt(c[2]), num(txt(c[3])), num(txt(c[4]))], X, c));
    });
    return { tot: Math.round(tot * 100) / 100, cible: cible, sec: sec, l: L, x: 1 };
  }).catch(function () { return null; });
}
/* v6.18.1 : bon de commande Gamma – index.php?module=visualisation_bdc&id_ug=…&commande=…
   colonnes : ARTICLE (« code - désignation ») | PRIX UNITAIRE | UNITÉ | QTÉ | TOTAL HT | TVA | TOTAL TTC | CEE (+ COTRAITANT / LOT si Gamma les affiche) */
var BST = { noLink: 0, codes: 0 };
/* cotraitants du chantier (Saïd) : VMC → GDS, soufflage → ISOWECK, le reste → BBNE (si Gamma ne l'indique pas) */
function cotrOf(a) { a = String(a || '').toLowerCase(); return /insufflation|soufflage|flocons/.test(a) ? 'ISOWECK' : /vmc|ventilation|entr[ée]es d.air|extracteur|bouche/.test(a) ? 'GDS' : 'BBNE'; }
function mergeBDC(R, M) {   // ajoute [code, cotraitant, TVA, lot, CEE] aux lignes du bon déjà lu
  var put = function (r) { if (r.length > 5 && r.slice(5).join('') !== '') return r; var v = M[nK(r[0]) + '|' + Number(r[1] || 0).toFixed(2)] || M[nK(r[0])]; return v ? r.slice(0, 5).concat(v) : r; };
  R.l = (R.l || []).map(put); (R.sec || []).forEach(function (x) { x[3] = (x[3] || []).map(put); }); R.cmd = M.__cmd; return R;
}
function bdcLinks(doc, raw, id) {
  var S = {}, re = /module=visualisation_bdc[^"'\s<>]*?commande=(\d+)/gi, m;
  [].slice.call(doc ? doc.querySelectorAll('a[href*="visualisation_bdc"],[onclick*="visualisation_bdc"],[data-href*="visualisation_bdc"]') : []).forEach(function (a) { var h = (a.getAttribute('href') || '') + ' ' + (a.getAttribute('onclick') || '') + ' ' + (a.getAttribute('data-href') || ''); var k = h.match(/commande=(\d+)/); if (k) S[k[1]] = 1; });
  while (raw && (m = re.exec(raw))) S[m[1]] = 1;
  return Object.keys(S);
}
function readBDC(id, doc) {
  var cmds = bdcLinks(doc, doc && doc.documentElement ? doc.documentElement.innerHTML : '', id);
  var getCmds = cmds.length ? Promise.resolve(cmds) : fetch(BASE + '?module=dossier&id_ug=' + id, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (raw) { return bdcLinks(null, raw, id); }).catch(function () { return []; });
  return getCmds.then(function (C) {
    if (!C.length) { BST.noLink++; return null; }
    return Promise.all(C.map(function (c) { return getDoc(BASE + '?module=visualisation_bdc&id_ug=' + id + '&commande=' + c).catch(function () { return null; }); })).then(function (D) {
      var M = { __cmd: C.join(',') }, n = 0;
      D.forEach(function (d) { if (!d) return;
        [].slice.call(d.querySelectorAll('table')).forEach(function (tab) {
          var o = colsOf(tab); if (!o || !o.H) return; var H = o.H, f = function (re) { for (var i = 0; i < H.length; i++) if (re.test(H[i])) return i; return -1; };
          var iA = f(/article|d[ée]signation/), iP = f(/prix/), iT = f(/tva/), iC = f(/cee/), iCo = f(/co-?\s*traitant|entreprise/), iL = f(/^lots?\b/);
          if (iA < 0 || iP < 0) return;
          try { localStorage.setItem('evolud_dbg_bdc2', H.join(' | ').slice(0, 300)); } catch (e) { }
          var pend = '';
          [].slice.call(tab.querySelectorAll('tbody tr, tr')).forEach(function (tr) { var c = tr.cells; if (!c || !c.length || tr.querySelector('th')) return;
            var g = function (i) { return i >= 0 && c[i] ? txt(c[i]) : ''; }, a = g(iA), pu = g(iP);
            if (c.length <= iP || !pu) { if (/^\d{8,12}\s*-/.test(txt(tr))) pend = txt(tr); return; }   // article seul sur sa ligne : rattaché à la ligne suivante
            if (!/^\d{8,12}\s*-/.test(a) && pend) a = pend; pend = '';
            var mm = a.match(/^(\d{8,12})\s*-\s*(.*)$/); if (!mm) return;
            var v = [mm[1], g(iCo) || cotrOf(mm[2]), tvaN(g(iT)), g(iL), g(iC)];
            M[nK(mm[2]) + '|' + num(pu).toFixed(2)] = v; M[nK(mm[2])] = M[nK(mm[2])] || v; n++; });
        }); });
      if (n) BST.codes++;
      return n ? M : null;
    });
  }).catch(function () { return null; });
}

/* v5.28 : réserves MOE (page « Réserves » du logement) – reprise du favori « Gamma du jour v5 », étape 3 */
function readReserves(id) {
  return fetch(BASE + '?module=reserve&id_ug=' + id, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('Gamma ' + r.status); return r.text(); }).then(function (h) {
    var d = parser.parseFromString(h, 'text/html'), R = [], cur = null, n;
    var cl = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); }, dt = function (m) { return m[3] + '-' + m[2] + '-' + m[1]; };
    var w = d.createTreeWalker(d.body || d.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while ((n = w.nextNode())) {
      if (n.nodeType === 1) { if (n.tagName === 'TEXTAREA') { var desc = cl(n.textContent || n.value || ''); if (desc) { cur = [desc.replace(/[;\r\n]+/g, ' ').slice(0, 400), '', '', '']; R.push(cur); } else cur = null; } continue; }
      if (!cur || (n.parentElement && n.parentElement.tagName === 'TEXTAREA')) continue;
      var t = cl(n.textContent); if (!t) continue;
      var m = t.match(/Ajout[ée]+e?\s+le\s+(\d{2})[-\/](\d{2})[-\/](\d{4})/i); if (m && !cur[1]) cur[1] = dt(m);
      m = t.match(/valid[ée]*e?\s+le\s+(\d{2})[-\/](\d{2})[-\/](\d{4})/i);
      if (m && !cur[2]) { cur[2] = dt(m); var p = t.match(/par\s+([A-Za-zÀ-ÿ' -]{2,40}?)(?:\s+Retour|$)/i); cur[3] = p ? cl(p[1]) : ''; }
      else if (cur[2] && !cur[3]) { var p2 = t.match(/^par\s+([A-Za-zÀ-ÿ' -]{2,40}?)(?:\s+Retour|$)/i); if (p2) cur[3] = cl(p2[1]); }
    }
    return R;
  });
}

function pool(items, n, fn, onStep) {
  var i = 0, done = 0, out = {};
  return new Promise(function (ok) {
    if (!items.length) return ok(out);
    function next() {
      if (i >= items.length) return;
      var k = items[i++];
      fn(k).then(function (v) { out[k] = v; }).catch(function () { }).then(function () { done++; onStep(done, items.length); if (done === items.length) ok(out); else next(); });
    }
    for (var j = 0; j < n; j++) next();
  });
}

/* ---------- déroulé ---------- */
function run() {
  $btn.innerHTML = '';
  var L, EV, stats = { log: 0, bdc: 0, trav: 0, vte: 0, vts: 0 };
  msg('1/4 – Lecture de la liste des logements dans Gamma…', 5);
  readCommandes().then(function (x) {
    L = x; stats.log = Object.keys(L).length;
    msg('2/4 – Lecture du planning (travaux, VTE, VTS)… <b>' + stats.log + '</b> logements trouvés', 15);
    return readPlanning();
  }).then(function (ev) {
    EV = Array.isArray(ev) ? ev : (ev && ev.events) || [];
    EV.forEach(function (e) {
      var p = e.extendedProps || {}, ug = String(p.code_ug || (String(e.title || '').match(/\b(\d{6})\b/) || [])[1] || '');
      if (!ug) return; var o = L[ug] = L[ug] || { id: p.id_ug || '' }; if (!o.id && p.id_ug) o.id = String(p.id_ug);
      var t = String(e.title || ''), s = ymd(e.start), f = ymd(e.end) || s;
      if (/travaux/i.test(t)) { if (!o.deb || s < o.deb) o.deb = s; if (!o.fin || f > o.fin) o.fin = f; (o.trav = o.trav || []).push({ deb: s, fin: f }); stats.trav++; }
      else if (/\bVTS\b|r[ée]ception|sortie/i.test(t)) { o.vtsRdv = String(e.start || '').slice(0, 16); (o.vts = o.vts || []).push(s); stats.vts++; }
      else if (/\bVTE\b|entr[ée]e/i.test(t)) { o.vteRdv = String(e.start || '').slice(0, 16); (o.vte = o.vte || []).push({ d: s, h: String(e.start || '').slice(11, 16), f: String(e.end || '').slice(11, 16) }); stats.vte++; }
      else { (o.ev = o.ev || []).push([t.slice(0, 60), s, f]); }
      if (p.tce) o.tce = p.tce; if (p.moe) o.moe = p.moe; if (p.charge) o.charge = p.charge;
    });
    // bons de commande : logements non annulés dont la VTE a eu lieu ou est passée (préparation OK, travaux planifiés ou RDV VTE passé)
    var ids = Object.keys(L).filter(function (ug) {
      var o = L[ug]; if (!o.id) return false;
      var ann = o.ph && o.ph.every(function (p) { return /Annul/i.test(p[0]); }); if (ann) return false;
      var ok = o.ph && o.ph.slice(1).some(function (p) { return /^Ok$/i.test(p[0]); }); // conception validée (VTE faite) ou au-delà
      return ok || o.deb || (o.vteRdv && o.vteRdv.slice(0, 10) <= TODAY) || (C.ugs && C.ugs.indexOf(ug) >= 0);
    });
    // mémoire des bons de commande déjà lus (sur cet appareil) : on ne relit que les nouveaux logements,
    // ceux dont l'étape Gamma a changé, et une petite partie des plus anciens (contrôle tournant)
    var KC = 'evolud_bdc_cache_v3', cache = {}; try { cache = JSON.parse(localStorage.getItem(KC) || '{}') || {}; } catch (e) { cache = {}; }
    var sig = function (o) { return (o.ph || []).map(function (p) { return p[0] + ':' + p[1]; }).join('|') + '#' + o.sc + '#' + o.forf; };
    var now0 = Date.now(), old = [], todo = ids.filter(function (ug) { var c = cache[ug]; if (!c || c.sig !== sig(L[ug])) return true; if (c.bdc && (c.bdc.sec || []).length && !(c.bdc.sec || []).some(function (x) { return x && x[3] && x[3].length; })) return true; /* v5.14 : relire une fois pour avoir le détail des lignes par rubrique */ if (now0 - (c.at || 0) > 14 * 864e5) old.push(ug); return false; });
    old.sort(function (a, b) { return (cache[a].at || 0) - (cache[b].at || 0); }); todo = todo.concat(old.slice(0, 30));
    ids.forEach(function (ug) { if (cache[ug] && todo.indexOf(ug) < 0 && cache[ug].bdc) L[ug].bdc = cache[ug].bdc; });
    stats.cache = ids.length - todo.length;
    msg('3/4 – Bons de commande : ' + todo.length + ' à lire' + (stats.cache ? ' (' + stats.cache + ' déjà connus)' : '') + '…', 22);
    return pool(todo, 4, function (ug) { return readVTE(L[ug].id); }, function (d, n) { msg('3/4 – Bons de commande : <b>' + d + ' / ' + n + '</b>' + (stats.cache ? ' · ' + stats.cache + ' déjà connus' : ''), 22 + 58 * d / n); })
      .then(function (B) { Object.keys(B).forEach(function (ug) { cache[ug] = { sig: sig(L[ug]), bdc: B[ug] || null, at: Date.now() }; }); try { localStorage.setItem(KC, JSON.stringify(cache)); } catch (e) { }
        // v6.18.1 : on complète UNIQUEMENT les bons qui n'ont pas encore leurs codes (page « bon de commande »), une seule fois par logement – rien d'autre n'est relu
        var need = ids.filter(function (ug) { var c = cache[ug], b = c && c.bdc; return b && !b.cx && (b.l || []).length && !(b.l || []).some(function (r) { return r.length > 5; }); });
        if (!need.length) return B;
        return pool(need, 6, function (ug) { return readBDC(L[ug].id, null).then(function (M) { var b = cache[ug].bdc; b.cx = 1; if (M) mergeBDC(b, M); return b; }); }, function (d, n) { msg('3/4 – Codes / TVA des bons de commande : <b>' + d + ' / ' + n + '</b>', 22 + 58 * d / n); })
          .then(function (E) { Object.keys(E).forEach(function (ug) { if (E[ug]) { cache[ug].bdc = E[ug]; L[ug].bdc = E[ug]; } }); try { localStorage.setItem(KC, JSON.stringify(cache)); } catch (e) { } return B; }); });
  }).then(function (B) {
    Object.keys(B).forEach(function (ug) { if (B[ug]) L[ug].bdc = B[ug]; });
    // v5.24 : coordonnées des locataires (page Dossier) – lues une fois puis gardées en mémoire, contrôle tous les 30 jours
    var KL = 'evolud_loc_cache_v4', lc = {}; try { lc = JSON.parse(localStorage.getItem(KL) || '{}') || {}; } catch (e) { lc = {}; }
    var cand = Object.keys(L).filter(function (ug) { var o = L[ug]; return o.id && (o.bdc || o.deb || o.vteRdv); });
    var todoL = cand.filter(function (ug) { var c = lc[ug]; return !c || (Date.now() - (c.at || 0)) > 30 * 864e5 || (c.v && (!c.v[0] || !c.v[3])); }).slice(0, 450);   // v5.28.3 : relecture des noms manquants et des dossiers sans documents   // v5.24.3 : on relit les dossiers où le nom manque
    cand.forEach(function (ug) { if (lc[ug] && lc[ug].v) { L[ug].loc = lc[ug].v.slice(0, 3); if (lc[ug].v[3]) L[ug].dos = lc[ug].v[3]; } });
    stats.loc = cand.filter(function (u) { return L[u].loc; }).length; stats.nom = cand.filter(function (u) { return L[u].loc && L[u].loc[0]; }).length;
    if (!todoL.length) return B;
    return pool(todoL, 4, function (ug) { return readDossier(L[ug].id); }, function (d, n) { msg('3/4 – Locataires (page Dossier) : <b>' + d + ' / ' + n + '</b>', 76 + 6 * d / n); })
      .then(function (R) { Object.keys(R).forEach(function (ug) { lc[ug] = { v: R[ug] || null, at: Date.now() }; if (R[ug]) { L[ug].loc = R[ug].slice(0, 3); if (R[ug][3]) L[ug].dos = R[ug][3]; } }); try { localStorage.setItem(KL, JSON.stringify(lc)); } catch (e) { } stats.loc = Object.keys(L).filter(function (u) { return L[u].loc; }).length; stats.nom = Object.keys(L).filter(function (u) { return L[u].loc && L[u].loc[0]; }).length; return B; });
  }).then(function (B) {
    // v5.28 : réserves MOE des logements passés en VTS (relues si VTS récente, réserve encore ouverte ou contrôle tournant)
    var KR = 'evolud_res_cache_v1', rc = {}; try { rc = JSON.parse(localStorage.getItem(KR) || '{}') || {}; } catch (e) { rc = {}; }
    var vtsD = function (o) { return (o.vts || []).filter(function (d) { return d && d <= TODAY; }).sort().pop() || ''; };
    // v5.28.1 : aussi les logements dont l'étape « Réception » est faite dans Gamma (VTS du jour pas toujours dans le planning)
    var recOk = function (o) { var p = (o.ph || [])[3]; if (!p) return false; var t = (String(p[0] || '') + ' ' + String(p[1] || '')).trim();
      return /\bok\b|effectu|valid|r[ée]alis|termin|fait/i.test(t) && !/annul|attente|en cours|à faire|a faire|non/i.test(t); };
    var candR = Object.keys(L).filter(function (ug) { return L[ug].id && (vtsD(L[ug]) || recOk(L[ug])); });
    stats.rec = Object.keys(L).filter(function (ug) { return recOk(L[ug]); }).length; try { var e3 = {}; Object.keys(L).forEach(function (ug) { var p = (L[ug].ph || [])[3]; if (p) { var k = String(p[0]) + ' | ' + String(p[1]); e3[k] = (e3[k] || 0) + 1; } }); stats.ph3 = e3; } catch (e) { }
    // v5.28.1 : VTS faite dans Gamma (étape Réception) mais absente du planning → on lit sa date sur la page Dossier
    var needRec = candR.filter(function (ug) { return recOk(L[ug]) && !vtsD(L[ug]) && !(rc[ug] && rc[ug].rec); });
    var setRec = function (ug, d) { if (!d) return; var o = L[ug]; o.vts = (o.vts || []).concat([d]); if (!o.vtsRdv || o.vtsRdv.slice(0, 10) < d) o.vtsRdv = d + 'T00:00'; stats.vts++; };
    candR.forEach(function (ug) { if (recOk(L[ug]) && !vtsD(L[ug]) && rc[ug] && rc[ug].rec) setRec(ug, rc[ug].rec); });
    var recP = !needRec.length ? Promise.resolve({}) : pool(needRec, 3, function (ug) {
      return getDoc(BASE + '?module=dossier&id_ug=' + L[ug].id).then(function (doc) { var m = txt(doc.body).match(/R[ée]ception\s+effectu[ée]e\s+le\s+(\d{2})\/(\d{2})\/(\d{4})/i); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; }).catch(function () { return ''; });
    }, function (d, n) { msg('3/4 – VTS faites dans Gamma : <b>' + d + ' / ' + n + '</b>', 74); });
    return recP.then(function (RD) {
    Object.keys(RD).forEach(function (ug) { if (RD[ug]) { rc[ug] = Object.assign(rc[ug] || {}, { rec: RD[ug] }); setRec(ug, RD[ug]); } });
    var lim = new Date(MIDNIGHT - 45 * 864e5).toISOString().slice(0, 10), oldR = [];
    var todoR = candR.filter(function (ug) { var c = rc[ug], v = vtsD(L[ug]) || (c && c.vts) || TODAY; if (!c || (c.vts !== v && vtsD(L[ug]))) return true;
      if ((c.r || []).some(function (r) { return !r[2]; }) && (Date.now() - (c.at || 0)) > 20 * 3600e3) return true;
      if (v >= lim && (Date.now() - (c.at || 0)) > 20 * 3600e3) return true; oldR.push(ug); return false; });
    oldR.sort(function (a, b) { return (rc[a].at || 0) - (rc[b].at || 0); }); todoR = todoR.concat(oldR.slice(0, 25));
    candR.forEach(function (ug) { if (rc[ug] && rc[ug].r && todoR.indexOf(ug) < 0) { L[ug].res = rc[ug].r || []; L[ug].resVts = rc[ug].vts; } });
    if (!todoR.length) { try { localStorage.setItem(KR, JSON.stringify(rc)); } catch (e) { } return B; }
    return pool(todoR, 3, function (ug) { return readReserves(L[ug].id); }, function (d, n) { msg('3/4 – Réserves MOE (logements en VTS) : <b>' + d + ' / ' + n + '</b>', 76 + 6 * d / n); })
      .then(function (R) { Object.keys(R).forEach(function (ug) { if (!R[ug]) return; var v = vtsD(L[ug]) || (rc[ug] && rc[ug].vts) || TODAY; rc[ug] = Object.assign(rc[ug] || {}, { r: R[ug], vts: v, at: Date.now() }); L[ug].res = R[ug]; L[ug].resVts = v; });
        try { localStorage.setItem(KR, JSON.stringify(rc)); } catch (e) { } return B; });
    });
  }).then(function (B) {
    stats.res = 0; stats.resO = 0; Object.keys(L).forEach(function (ug) { (L[ug].res || []).forEach(function (r) { stats.res++; if (!r[2]) stats.resO++; }); });
    stats.bdcLien = BST.codes; stats.bdcSansLien = BST.noLink; Object.keys(L).forEach(function (ug) { if (L[ug].bdc) { stats.bdc++; if ((L[ug].bdc.l || []).some(function (r) { return r.length > 5; })) stats.bdcX = (stats.bdcX || 0) + 1; } });
    msg('4/4 – Envoi vers Évolud…', 82);
    var s = JSON.stringify(L), parts = [], SZ = 30000;
    for (var i = 0; i < s.length; i += SZ) parts.push(s.slice(i, i + SZ));
    var now = Date.now(), by = C.n || '';
    var recs = parts.map(function (p, k) { return { c: 'params', id: 'gammaD' + (k + 1), updatedAt: now, data: { id: 'gammaD' + (k + 1), v: p, updatedAt: now, by: by } }; });
    for (var k = parts.length + 1; k <= parts.length + 15; k++) recs.push({ c: 'params', id: 'gammaD' + k, updatedAt: now, data: { id: 'gammaD' + k, v: '', deleted: true, updatedAt: now, by: by } });
    var meta = { date: TODAY, heure: HEURE, par: by, n: parts.length, stats: stats, ts: now };
    var send = [], seq = Promise.resolve();
    for (var j = 0; j < recs.length; j += 3) send.push(recs.slice(j, j + 3));   // v5.24.2 : envois plus petits
    send.forEach(function (part, q) { seq = seq.then(function () { msg('4/4 – Envoi vers Évolud : ' + (q + 1) + ' / ' + (send.length + 1), 82 + 16 * q / send.length); return api({ action: 'sync', since: now, records: part }); }); });
    return seq.then(function () { return api({ action: 'sync', since: now, records: [{ c: 'params', id: 'gammaMaj', updatedAt: Date.now(), data: { id: 'gammaMaj', v: meta, updatedAt: Date.now(), by: by } }] }); }).then(function () { return stats; })
      .catch(function (e) { e.data = s; e.meta = meta; throw e; });
  }).then(function (st) {
    msg('✅ <b>Mise à jour terminée</b> (' + TODAY.split('-').reverse().join('/') + ' à ' + HEURE + ')<br>' + st.log + ' logements · ' + st.bdc + ' bons de commande' + (st.bdc ? ' (' + (st.bdcX || 0) + ' avec codes / cotraitant / TVA / lot)' : '') + (st.bdc && !st.bdcX ? (function () { var d = ''; try { d = (localStorage.getItem('evolud_dbg_bdc2') || localStorage.getItem('evolud_dbg_bdc') || '') + (BST.noLink ? ' · ' + BST.noLink + ' sans lien vers le bon de commande' : ''); } catch (e) { } return '<br><span style="font-size:11px;color:#a33">Codes / cotraitant / TVA / lot non trouvés sur les bons de commande : fais une capture de ce cadre pour Claude</span><br><code style="font-size:9px;word-break:break-all">' + d.replace(/</g, '‹').slice(0, 400) + '</code>'; })() : '') + ' · ' + st.trav + ' dates de travaux · ' + st.vte + ' RDV VTE' + (st.vts ? ' · ' + st.vts + ' VTS' : '') + (st.loc ? ' · ' + st.loc + ' locataires' : '') + (st.res ? ' · ' + st.res + ' réserves (' + st.resO + ' non validées)' : '') + '<div style="font-size:11px;color:#888;margin-top:4px">v6.18.1 · ' + (st.rec || 0) + ' logements réceptionnés dans Gamma' + (!st.rec && st.ph3 ? ' – étapes réception lues : ' + Object.keys(st.ph3).slice(0, 6).join(' / ').replace(/[<>]/g, '') : '') + '</div>' + (st.loc && st.nom < st.loc ? (function () { var d = ''; try { d = localStorage.getItem('evolud_dbg_nom') || ''; } catch (e) { } return '<br><span style="font-size:11px;color:#a33">' + (st.loc - (st.nom || 0)) + ' noms de locataires non trouvés (sur ' + st.loc + ') : fais une capture de ce cadre pour Claude</span><br><code style="font-size:9px;word-break:break-all">' + d.replace(/</g, '‹').slice(0, 400) + '</code>'; })() : '') + '<br><span style="font-size:13px;color:#56627a">L\'appli se met à jour chez tout le monde à la prochaine synchro (⟳). Inutile de refaire aujourd\'hui.</span>', 100);
    btn('Fermer', close, true);
  }).catch(function (e) {
    if (e.message === 'LOGIN') { msg('⚠️ Tu n\'es pas connecté à Gamma. Connecte-toi puis touche à nouveau le bouton.', 100); btn('Fermer', close, true); return; }
    msg('⚠️ Problème : ' + (e.message || e) + (e.data ? '<br>Les données Gamma ont bien été lues mais pas envoyées. Télécharge le fichier et importe-le dans l\'appli (Plus → 🔄 Bouton Gamma → Importer un fichier).' : ''), 100);
    if (e.data) btn('⬇️ Télécharger le fichier', function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ meta: e.meta, data: JSON.parse(e.data) })], { type: 'application/json' })); a.download = 'evolud_gamma_' + TODAY + '.json'; document.body.appendChild(a); a.click(); a.remove(); }, true);
    btn('Fermer', close);
  });
}

/* ---------- déjà fait aujourd'hui ? ---------- */
msg('Vérification : la mise à jour du jour a-t-elle déjà été faite ?', 3);
api({ action: 'sync', since: MIDNIGHT, records: [] }).then(function (j) {
  var m = (j.records || []).filter(function (x) { return x.c === 'params' && x.id === 'gammaMaj' && x.data && x.data.v && x.data.v.date === TODAY; })[0];
  if (m) {
    var v = m.data.v;
    msg('✅ La mise à jour Gamma a <b>déjà été faite aujourd\'hui</b> à ' + v.heure + ' par <b>' + (v.par || '?') + '</b>.<br>Inutile de la refaire, sauf si Gamma a changé depuis.', 100);
    btn('Fermer', close, true); btn('Refaire quand même', run);
  } else run();
}).catch(function (e) {
  msg('⚠️ Serveur Évolud injoignable (' + (e.message || e) + '). On lit quand même Gamma : un fichier te sera proposé à la fin si l\'envoi échoue.', 3);
  setTimeout(run, 1500);
});
})();
