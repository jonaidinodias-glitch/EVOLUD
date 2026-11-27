/* Évolud – 🧠 garde-mémoire (v1.0) · conçu et développé par Saïd OUFQIR
 * Sur iPhone, la mémoire locale d'un site (localStorage) est limitée à ~5 Mo : quand elle est pleine, plus rien ne s'enregistre
 * (« mémoire du téléphone saturée »), même s'il reste de la place sur le téléphone.
 * Ce garde : 1) demande à Safari de ne jamais effacer les données de l'appli ; 2) au démarrage et à chaque blocage,
 * retire les miniatures (aperçus) des photos gardées en mémoire — les vraies photos restent dans le Drive — puis réessaie l'enregistrement.
 * Rien d'autre n'est touché : cotes, VTE, tâches, photos en attente d'envoi sont conservées.
 */
(function () {
'use strict';
if (window.__evGarde) return; window.__evGarde = 1;
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
var LS; try { LS = window.localStorage; } catch (e) { return; } if (!LS || typeof Storage === 'undefined') return;
var orig = Storage.prototype.setItem;
var reThumb = /"thumb"\s*:\s*"data:image\/[^"]*"/g;
var estQuota = function (e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014 || /quota|exceeded/i.test(String(e.message || ''))); };
var taille = function () { var t = 0; try { for (var i = 0; i < LS.length; i++) { var k = LS.key(i), v = LS.getItem(k) || ''; t += k.length + v.length; } } catch (e) { } return t * 2; };
function compacter(sauf) {
  var gain = 0, K = [];
  try { for (var i = 0; i < LS.length; i++) K.push(LS.key(i)); } catch (e) { }
  K.forEach(function (k) { if (k === sauf) return; var v; try { v = LS.getItem(k); } catch (e) { return; }
    if (!v || v.length < 1000 || v.indexOf('data:image') < 0) return;
    var n = v.replace(reThumb, '"thumb":""'); if (n.length >= v.length) return;
    try { orig.call(LS, k, n); gain += (v.length - n.length) * 2; } catch (e) { } });
  return gain;
}
var dire = function (m) { try { if (typeof toast === 'function') { toast(m, 4000); return; } } catch (e) { } console.log(m); };
Storage.prototype.setItem = function (k, v) {
  try { return orig.call(this, k, v); }
  catch (e) {
    if (this !== LS || !estQuota(e)) throw e;
    var g = compacter(k);
    try { var r = orig.call(this, k, v); dire('🧠 Mémoire libérée (' + Math.round(g / 1024) + ' Ko d\'aperçus photos) : enregistré ✔'); return r; }
    catch (e2) {
      var s = String(v), s2 = s.replace(reThumb, '"thumb":""');   // dernier recours : enregistrer sans l'aperçu
      if (s2.length < s.length) { var r2 = orig.call(this, k, s2); dire('🧠 Mémoire pleine : enregistré sans aperçu (la photo est dans le Drive)'); return r2; }
      throw e2;
    }
  }
};
/* au démarrage : si la mémoire dépasse ~3,5 Mo, on fait le ménage tout de suite */
try { if (taille() > 3.5 * 1024 * 1024) { var g0 = compacter(null); if (g0 > 0) console.log('garde-mémoire : ' + Math.round(g0 / 1024) + ' Ko libérés'); } } catch (e) { }
window.EvoludGarde = { taille: taille, compacter: compacter };
})();

/* Évolud – ☢️ analyse des rapports de repérage amiante (moteur, sans interface)
 * Conçu et développé par Saïd OUFQIR
 * Lit le PDF (pdf.js), retrouve chaque sondage (pièce, matériau, prélèvement / homogénéité / décision),
 * le résultat (présence ou non d'amiante), le scénario de travaux, et dit si un diag complémentaire est nécessaire.
 */
(function (root) {
'use strict';

/* ---------- 1. texte du PDF avec positions ---------- */
async function lirePdf(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
    const W = [];
    tc.items.forEach(it => {
      const s = it.str || ''; if (!s.trim()) return;
      const x0 = it.transform[4], y = vp.height - it.transform[5], cw = (it.width || 0) / Math.max(1, s.length);
      let i = 0; s.split(/(\s+)/).forEach(part => { if (part && !/^\s+$/.test(part)) W.push({ t: part, x: x0 + i * cw, y, p }); i += part.length; });
    });
    pages.push(W);
    pg.cleanup && pg.cleanup();
  }
  doc.destroy && doc.destroy();
  return pages;
}
function lignes(W) {   // regroupe les mots d'une page en lignes
  const s = W.slice().sort((a, b) => a.y - b.y || a.x - b.x), L = [];
  s.forEach(w => { const l = L[L.length - 1]; if (l && Math.abs(l.y - w.y) <= 2.2) l.w.push(w); else L.push({ y: w.y, w: [w] }); });
  L.forEach(l => { l.w.sort((a, b) => a.x - b.x); l.t = l.w.map(w => w.t).join(' '); });
  return L;
}

/* ---------- 2. familles de matériaux et pièces ---------- */
const nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function famille(titre, ligne) {
  const c = nrm(titre), l = nrm(ligne);
  if (/radiateur|tresse/.test(c)) return 'tresse';
  if (/pare.?vapeur/.test(c)) return 'pv';
  if (/plinthe/.test(c)) return 'plinthe';
  if (/colle de carrelage/.test(c)) return 'carrelage';
  if (/faience/.test(c)) return 'faience';
  if (/appuis? de fen/.test(c)) return 'appui';
  if (/glasal|allege|imposte/.test(c)) return /allege/.test(l) ? 'allege' : /imposte/.test(l) ? 'imposte' : /allege/.test(c) ? 'allege' : 'imposte';
  if (/linteau/.test(c)) return 'linteau';
  if (/seuil/.test(c)) return 'seuil';
  if (/joint de vitre/.test(c)) return 'mastic';
  if (/^porte/.test(c) || (/joint/.test(c) && /\bporte\b/.test(l) && !/fenetre/.test(l))) return 'portemaco';
  if (/joint d.?assemblage/.test(c)) return 'jointDO';
  if (/dormant|maconnerie/.test(c)) return 'jointMaco';
  if (/lambris/.test(c)) return 'lambris';
  if (/^plafond/.test(c)) return (/n.?\s?2\b|plafond 2\b/.test(c) || /plafond n.?\s?2/.test(l)) ? 'plafond2' : 'plafond';
  if (/^mur|joint de brique/.test(c)) return 'mur';
  if (/bois|parquet|revetement de sol/.test(c)) return 'bois';
  if (/conduit|gaine|ventilation|vmc/.test(c)) return 'vmc';
  if (/couverture|toiture|ardoise|tuile|sous.?toiture/.test(c)) return 'toiture';
  return 'autre';
}
function piece(r) {
  r = nrm(r).replace(/\b(rdc|1er ss|1er|2eme|ss)\b/g, '').replace(/\s+/g, ' ').trim();
  const M = [[/^chambre n.?\s?1|^chambre 1/, 'CH1'], [/^chambre n.?\s?2|^chambre 2/, 'CH2'], [/^chambre n.?\s?3|^chambre 3/, 'CH3'], [/^chambre/, 'CH1'],
    [/salle de bain|salle d.?eau|^sdb/, 'SDB'], [/esc.* r\s?\+\s?1|escalier.*etage/, 'ESC1'], [/esc.*(r\s?-\s?1|sous.?sol)|cave/, 'ESC0'], [/^esc/, 'ESC1'],
    [/degagement n.?\s?2/, 'DGT2'], [/^degagement|^couloir/, 'DGT'], [/^salon|^sejour|^salle a manger/, 'SEJ'], [/^cuisine/, 'CUI'], [/^wc|toilette/, 'WC'],
    [/^palier/, 'PAL'], [/^exterieur/, 'EXT'], [/^comble/, 'COMB'], [/^entree|^hall/, 'ENT'], [/^facade/, 'EXT'], [/^sous.?sol|^cave/, 'CAVE'], [/^garage/, 'GAR'], [/^cave/, 'CAVE']];
  for (const [re, k] of M) if (re.test(r)) return k;
  return r.toUpperCase().slice(0, 12) || '?';
}
const NOMP = { CH1: 'Chambre 1', CH2: 'Chambre 2', CH3: 'Chambre 3', SDB: 'SDB', ESC1: 'Escalier', ESC0: 'Escalier cave', DGT: 'Dégagement', DGT2: 'Dégagement 2', SEJ: 'Séjour', CUI: 'Cuisine', WC: 'WC', PAL: 'Palier', EXT: 'Extérieur', COMB: 'Combles', ENT: 'Entrée', GAR: 'Garage', CAVE: 'Cave' };
const NOMF = { tresse: 'Tresses de radiateur', pv: 'Pare-vapeur combles', plinthe: 'Colle de plinthes', carrelage: 'Colle de carrelage', faience: 'Colle de faïence', appui: 'Appui de fenêtre', allege: 'Allège Glasal', imposte: 'Imposte Glasal', linteau: 'Linteau', seuil: 'Seuil', mastic: 'Mastic de vitrage', portemaco: 'Joint de porte', jointDO: "Joint d'assemblage fenêtre", jointMaco: 'Joint dormant / maçonnerie', lambris: 'Lambris', plafond: 'Plafond', plafond2: 'Plafond (2ᵉ couche)', mur: 'Mur (enduit)', bois: 'Sol bois', vmc: 'Conduit ventilation', toiture: 'Couverture', solsouple: 'Sol souple', autre: 'Autre' };

/* ---------- 3. lecture du rapport ---------- */
function analyser(pages) {
  if (estETI(pages)) return analyserETI(pages);
  const LP = pages.map(lignes), all = [].concat(...LP.map((L, i) => L.map(l => Object.assign({ p: i }, l))));
  const txt = all.map(l => l.t).join('\n');
  const R = { ug: '', adr: '', ville: '', date: '', desc: '', scen: '', sondages: [], posZ: [], titres: {}, aucun: false };
  // en-tête
  const p1 = LP[0] ? LP[0].map(l => l.t) : [];
  for (let i = 0; i < p1.length; i++) { const m = p1[i].match(/\bUG\s*:?\s*(\d{6})\b\s*(.*)$/i); if (m) { R.ug = m[1]; R.adr = m[2].replace(/^[-–\s]+/, '').trim(); for (let k = i + 1; k < Math.min(p1.length, i + 4); k++) { const v = p1[k].match(/^\s*(\d{5})\s+(.+)$/); if (v) { R.ville = v[2].trim(); break; } if (!R.adr && p1[k].trim()) R.adr = p1[k].trim(); } break; } }
  if (!R.ug) { const m = txt.match(/\b(1[0-3]\d{4})\b/); if (m) R.ug = m[1]; }
  let m = txt.match(/Date du rep[ée]rage\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (m) R.date = m[1];
  m = txt.match(/Description succincte[^\n]*?:?\s*([^\n]*)/i); if (m) R.desc = m[1].replace(/^[:\s]+/, '').trim();
  if (!R.desc) { const i = all.findIndex(l => /Description succincte/i.test(l.t)); if (i >= 0 && all[i + 1]) R.desc = all[i + 1].t.trim(); }
  m = (R.desc + ' ' + txt).match(/simulation\s*n?°?\s*(\d{1,2})/i); if (m) R.scen = m[1];
  // conclusion : ZPSO avec amiante
  const iC = all.findIndex(l => /a [ée]t[ée] rep[ée]r[ée] des mat[ée]riaux|contenant de l.amiante\s*:/i.test(l.t));
  R.aucun = /il n.a pas [ée]t[ée] rep[ée]r[ée] de mat[ée]riaux/i.test(txt);
  if (iC >= 0 && !R.aucun) for (let i = iC; i < Math.min(all.length, iC + 120); i++) { if (/CONDITIONS DE R[ÉE]ALISATION|Locaux.{0,20}non visit/i.test(all[i].t) && i > iC + 2) break; (all[i].t.match(/\bZ\d{3}\b/g) || []).forEach(z => { if (R.posZ.indexOf(z) < 0) R.posZ.push(z); }); }
  // blocs ZPSO et sondages, page par page
  const vus = {}; let modePos = false, curZ = null, curT = '', carry = null, started = false;
  LP.forEach((L, p) => {
    const W = pages[p], ev = [];
    L.forEach(l => { const t = l.t.match(/\b(Z\d{3})\s*-\s*(.+?)\s*-\s*\(?\s*Zone continue/i); if (t) ev.push({ y: l.y, k: 'Z', z: t[1], t: t[2] });
      else if (/similitudes d.ouvrage avec pr[ée]sence/i.test(l.t)) ev.push({ y: l.y, k: 'M', pos: true }); else if (/similitudes d.ouvrage sans pr[ée]sence/i.test(l.t)) ev.push({ y: l.y, k: 'M', pos: false }); });
    W.forEach(w => { if (/^S\d{3}$/.test(w.t)) ev.push({ y: w.y, k: 'S', w }); });
    ev.sort((a, b) => a.y - b.y || (a.k === 'Z' ? -1 : 1));
    // segments (un par ZPSO sur la page)
    const segs = []; let cur = started ? { z: curZ, t: curT, y0: 0, S: [] } : null;
    ev.forEach(e => {
      if (e.k === 'M') { modePos = e.pos; return; }
      if (e.k === 'Z') { if (modePos && R.posZ.indexOf(e.z) < 0) R.posZ.push(e.z); if (cur) { cur.y1 = e.y; segs.push(cur); } started = true; curZ = e.z; curT = e.t; R.titres[e.z] = e.t; cur = { z: e.z, t: e.t, y0: e.y, S: [], neuf: true }; carry = null; }
      else if (cur && !vus[e.w.t]) { vus[e.w.t] = 1; cur.S.push(e.w); }
    });
    if (cur) { cur.y1 = 1e9; segs.push(cur); }
    segs.forEach(sg => {
      if (!sg.S.length) return;
      const xs = Math.min(...sg.S.map(w => w.x));
      // étiquettes de pièce : « 13 Chambre n°1 » dans la colonne de gauche
      const labs = [];
      L.forEach(l => { if (l.y <= sg.y0 + 1 || l.y >= sg.y1) return; const f = l.w[0]; if (!f || !/^\d{1,2}$/.test(f.t) || f.x > xs - 40 || f.x > 120) return;
        const nm = l.w.slice(1).filter(w => w.x < f.x + 175 && !/^(RDC|1er|2ème|SS|X)$/i.test(w.t)).map(w => w.t).join(' ').trim(); if (/[a-zé]/i.test(nm)) labs.push({ y: l.y, n: nm }); });
      const S = sg.S.slice().sort((a, b) => a.y - b.y);
      const asg = assigner(S.map(w => w.y), labs.map(l => l.y), !!carry && !sg.neuf);
      S.forEach((w, i) => {
        const a = asg[i], room = a === -1 ? carry : (labs[a] ? labs[a].n : carry) || '?';
        const ln = W.filter(v => Math.abs(v.y - w.y) <= 9);
        const lineTxt = ln.filter(v => v.x < w.x).map(v => v.t).join(' ');
        const pre = W.filter(v => v.x > w.x && Math.abs(v.y - w.y) <= 9 && /P[TR][DA]\d+|^ZPSO$/.test(v.t)).sort((a, b) => Math.abs(a.y - w.y) - Math.abs(b.y - w.y));
        const tok = pre.map(v => v.t).join(' ');
        const meth = /ZPSO|P[TR][DA]\d+-\s*$/.test(tok) || (pre[0] && /-$/.test(pre[0].t)) ? 'H' : /P[TR][DA]\d+/.test(tok) ? 'P' : 'D';
        R.sondages.push({ s: w.t, z: sg.z, piece: room, k: piece(room), fam: famille(sg.t, lineTxt), m: meth });
      });
      if (labs.length) carry = labs[labs.length - 1].n; else if (S.length) carry = carry || null;
    });
  });
  R.sondages.forEach(s => { s.pos = R.posZ.indexOf(s.z) >= 0; });
  return R;
}
/* ---------- 3 bis. rapports ETI-DIAG (et logiciels du même type) : un tableau par ZPSO, localisations multiples ---------- */
function estETI(pages) { return pages.some(W => W.some(w => /^ZPSO-\d{3}/.test(w.t))); }
function analyserETI(pages) {
  const LP = pages.map(lignes), all = [].concat(...LP.map((L, i) => L.map(l => Object.assign({ p: i }, l))));
  const txt = all.map(l => l.t).join('\n');
  const R = { ug: '', adr: '', ville: '', date: '', desc: '', scen: '', sondages: [], posZ: [], titres: {}, aucun: false, fmt: 'ETI' };
  let m = txt.match(/Rue\s*:\s*\.*\s*([^\n]+)/i); if (m) R.adr = m[1].replace(/^\.+\s*/, '').trim();
  m = txt.match(/Code postal, ville\s*:\s*\.*\s*\d{5}\s+([^\n(]+)/i); if (m) R.ville = m[1].trim();
  m = txt.match(/Date du rep[ée]rage\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i); if (m) R.date = m[1];
  const iD = all.findIndex(l => /Descriptif des travaux/i.test(l.t));
  if (iD >= 0) { const d = []; for (let i = iD + 1; i < Math.min(all.length, iD + 12); i++) { const t = all[i].t.trim(); if (!t || /^\d+(\.\d+)*\s+[A-ZÉ]/.test(t) || /Rapport DDT|Rep[ée]rage Amiante/.test(t)) { if (d.length) break; else continue; } d.push(t); } R.desc = d.join(' ').replace(/\s+/g, ' ').trim(); }
  m = (R.desc + ' ' + txt).match(/simulation\s*n?°?\s*(\d{1,2})/i); if (m) R.scen = m[1];
  // zone du tableau 5.0 (liste complète)
  let on = false; const rows = [], blocs = []; let xId = null;
  LP.forEach((L, p) => {
    L.forEach(l => {
      if (/^\s*5\.0\b|Liste des mat[ée]riaux reconnus visuellement/i.test(l.t)) { on = true; return; }
      if (on && /^\s*5\.1\b|Liste des mat[ée]riaux ou produits contenant de l.amiante,/i.test(l.t)) { on = false; return; }
      if (!on || /Rapport DDT|ETI-DIAG|RCS\s*:|Rep[ée]rage Amiante - Travaux|Localisation\s+Identifiant/i.test(l.t)) return;
      const id = l.w.findIndex(w => /^Identifiant:?$/.test(w.t) || /^ZPSO-\d{3}/.test(w.t));
      const k = id >= 0 ? l.w.findIndex(w => /^ZPSO-\d{3}/.test(w.t)) : -1;
      if (k >= 0) { const w = l.w[k]; if (xId == null || w.x < xId + 60) xId = Math.min(xId == null ? 1e9 : xId, l.w[id].x);
        const rest = l.w.slice(k).map(x => x.t).join(' ');
        rows.push({ p, y: l.y, z: w.t.slice(0, 8), ids: rest, desc: '', com: l.t, gauche: l.w.slice(0, id).map(x => x.t).join(' ') }); }
      else {
        const r = rows[rows.length - 1];
        const dI = l.w.findIndex(w => /^Description:?$/.test(w.t));
        if (dI >= 0 && r) { r.desc = l.w.slice(dI + 1).map(x => x.t).join(' ').replace(/\s*(Absence|Pr[ée]sence|Mat[ée]riau ou produit|\(Apr[èe]s|\(Sur ).*$/i, '').trim(); if (r.p === p) r.yd = l.y; r.com += ' ' + l.t;
          const g = l.w.slice(0, dI).map(x => x.t).join(' '); if (g) blocs.push({ p, y: l.y, t: g }); }
        else { if (r) r.com += ' ' + l.t; const lim = xId != null ? xId - 4 : 200; const g = l.w.filter(w => w.x < lim).map(x => x.t).join(' '); if (g && /[a-z]/i.test(g)) blocs.push({ p, y: l.y, t: g }); }
      }
      const r = rows[rows.length - 1]; if (r && r.gauche) { blocs.push({ p: r.p, y: r.y, t: r.gauche }); r.gauche = ''; }
    });
  });
  // regroupe les lignes de localisation qui se suivent (« ...; Rez-de-chaussée » + « - Salon; ... »)
  const B = []; blocs.sort((a, b) => a.p - b.p || a.y - b.y).forEach(b => { const q = B[B.length - 1];
    if (q && q.p === b.p && b.y - q.y1 < 16 && (/^[-–]/.test(b.t) || /[;\-–]\s*$/.test(q.t) || /(Rez-de-chauss[ée]e|[ée]tage|Sous-?Sol|Sous)\s*$/i.test(q.t) || /^(chauss[ée]e|Sol|sol)\b/.test(b.t))) { q.t += ' ' + b.t; q.y1 = b.y; q.n++; }
    else B.push({ p: b.p, y0: b.y, y1: b.y, t: b.t, n: 1 }); });
  // chaque bloc va à la ligne ZPSO la plus proche ; les lignes sans bloc héritent du précédent
  rows.forEach(r => { r.ym = r.yd ? (r.y + r.yd) / 2 : r.y; r.loc = null; });
  B.forEach(b => { const c = (b.y0 + b.y1) / 2, near = f => { let best = null, d = 1e9; rows.forEach(r => { if (r.p !== b.p || !f(r)) return; const e = Math.abs(r.ym - c); if (e < d) { d = e; best = r; } }); return [best, d]; };
    let [best, d] = near(r => !r.loc); if (!best || d > 40) best = near(() => true)[0];
    const t = b.t.replace(/\s+/g, ' ').replace(/\s*-\s*$/, ''); if (best && !best.loc) best.loc = t; else if (best) best.loc += '; ' + t; });
  let cur = '';
  rows.forEach(r => { if (r.loc) cur = r.loc; const loc = r.loc || cur, c = nrm(r.com);
    const pos = /presence d.amiante/.test(c) && !/absence d.amiante/.test(c.replace(/presence d.amiante.*$/, ''));
    if (pos && R.posZ.indexOf(r.z) < 0) R.posZ.push(r.z); R.titres[r.z] = r.desc;
    const P = (r.ids.match(/\bP\d{3}\b/g) || []);
    const pieces = loc.split(/;\s*/).map(x => x.replace(/^.*?\s[-–]\s/, '').replace(/^[-–]\s*/, '').trim()).filter(Boolean);
    const nat = /par nature|justificatif/.test(c);
    (pieces.length ? pieces : ['?']).forEach((pc, i) => R.sondages.push({ s: r.z + (pieces.length > 1 ? '/' + (i + 1) : ''), z: r.z, piece: pc, k: piece(pc), fam: familleETI(r.desc, pc), m: nat || !P.length ? 'D' : (i === 0 ? 'P' : 'H'), pos }));
  });
  R.aucun = !R.posZ.length;
  return R;
}
function familleETI(desc, pc) {
  const d = nrm(desc), p = nrm(pc);
  if (/entre fen.*structure|fenetres? et (la )?structure|dormant/.test(d)) return 'jointMaco';
  if (/entre porte.*structure|porte/.test(d)) return 'portemaco';
  if (/joint d.?assemblage/.test(d)) return 'jointDO';
  if (/joint de vitrage|mastic/.test(d)) return 'mastic';
  if (/appuis? de fen/.test(d)) return 'appui';
  if (/allege|glasal/.test(d)) return 'allege';
  if (/linteau/.test(d)) return 'linteau';
  if (/seuil/.test(d)) return 'seuil';
  if (/colle de carrelage/.test(d)) return 'carrelage';
  if (/colle de plinthe/.test(d)) return 'plinthe';
  if (/faience/.test(d)) return 'faience';
  if (/tresse|radiateur/.test(d)) return 'tresse';
  if (/pare.?vapeur|comble/.test(d)) return 'pv';
  if (/conduit|gaine|ventilation/.test(d)) return 'vmc';
  if (/tuile|ardoise|couverture|toiture|plaque.*fibre/.test(d)) return 'toiture';
  if (/calicot|plafond|faux.?plafond/.test(d)) return 'plafond';
  if (/enduit|peinture|plaques? de platre/.test(d)) return /facade|exterieur/.test(p) ? 'mur' : 'mur';
  if (/revetement souple|dalle.*sol|sol souple|sous-couche/.test(d)) return 'solsouple';
  return 'autre';
}
/* étiquettes de pièce fusionnées sur plusieurs lignes : l'étiquette est au milieu de son groupe de sondages */
function assigner(sy, ly, carry) {
  const n = sy.length, k = ly.length, INF = 1e12;
  if (!k) return sy.map(() => -1);
  // f[i][j] : coût minimal pour les i premiers sondages avec les j premières étiquettes ; option : groupe de tête hérité (page précédente)
  const f = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(INF)), b = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(null));
  f[0][0] = 0;
  if (carry) for (let i = 1; i <= n; i++) { const c = 25 + Math.max(0, sy[i - 1] - ly[0]); if (c < f[i][0]) { f[i][0] = c; b[i][0] = [0, 0, 'c']; } }
  for (let j = 1; j <= k; j++) for (let i = 0; i <= n; i++) {
    if (f[i][j - 1] + 400 < f[i][j]) { f[i][j] = f[i][j - 1] + 400; b[i][j] = [i, j - 1, 's']; }   // étiquette sans sondage
    for (let s = 0; s < i; s++) { if (f[s][j - 1] >= INF) continue; const mid = (sy[s] + sy[i - 1]) / 2, c = f[s][j - 1] + Math.abs(ly[j - 1] - mid) + (ly[j - 1] < sy[s] - 14 || ly[j - 1] > sy[i - 1] + 14 ? 60 : 0);
      if (c < f[i][j]) { f[i][j] = c; b[i][j] = [s, j - 1, 'g']; } }
  }
  const out = new Array(n).fill(-1); let i = n, j = k;
  while (i > 0 && b[i][j]) { const [s, jj, t] = b[i][j]; if (t === 'g') for (let q = s; q < i; q++) out[q] = j - 1; i = s; j = jj; if (t === 'c') break; }
  return out;
}

/* ---------- 4. colonnes du tableau « Synt. Logements allégés » ---------- */
const MAP = {
  carrelage: { ENT: 'AA', CUI: 'U', SDB: 'V', SEJ: 'W', CH1: 'X', DGT: 'Y', DGT2: 'Z', WC: 'AC', ESC1: 'AB' },
  plinthe: { ENT: 'BJ', SEJ: 'AY', DGT: 'AZ', DGT2: 'BA', WC: 'BB', CH1: 'BC', CH2: 'BD', CH3: 'BE', CUI: 'BF', ESC1: 'BH', SDB: 'BK' },
  mur: { DGT: 'AE', DGT2: 'AF', SEJ: 'AG', CH1: 'AH', CH2: 'AI', CH3: 'AJ', CUI: 'AL', SDB: 'AM', WC: 'AN', EXT: 'AO', ESC0: 'AP', ESC1: 'AQ', PAL: 'AS', COMB: 'AT' },
  faience: { CUI: 'AU', SDB: 'AV', DGT: 'AW', WC: 'AX' },
  plafond: { ENT: 'BL', DGT: 'BM', DGT2: 'BN', SEJ: 'BQ', CH1: 'BR', CH2: 'BS', CH3: 'BT', CUI: 'BV', SDB: 'BW', WC: 'BX', ESC1: 'BY', PAL: 'CA', COMB: 'CB' },
  plafond2: { CUI: 'CC', SDB: 'CD', WC: 'CE', DGT: 'CF', DGT2: 'CF', ESC1: 'CG', PAL: 'CH', CH1: 'CI', CH2: 'CJ', CH3: 'CK' },
  mastic: { DGT: 'CW', SEJ: 'CZ', CH1: 'DC', CH2: 'DD', CH3: 'DE', CUI: 'DM', SDB: 'DP', WC: 'DQ', EXT: 'DR' },
  jointDO: { DGT: 'DW', SEJ: 'EA', CH1: 'EB', CH2: 'EC', CH3: 'ED', CUI: 'EG', SDB: 'EH', WC: 'EI' },
  portemaco: { SEJ: 'EO', CUI: 'EW', DGT: 'EM' },
  appui: { CUI: 'FQ', CH1: 'FS', CH2: 'FT', SDB: 'FV', WC: 'FW', SEJ: 'FZ' },
  allege: { CUI: 'GF', WC: 'GG', SDB: 'GH' },
  seuil: { CUI: 'GT', SEJ: 'GX' },
  linteau: { CUI: 'GK', WC: 'GR', SDB: 'GS' }
};
const RANG = { Pp: 6, Hp: 5, Dp: 4, Pn: 3, Hn: 2, Dn: 1 };
function colonnes(R) {
  const out = {}, hors = [];
  R.sondages.forEach(s => {
    const code = s.m + (s.pos ? 'p' : 'n');
    const col = s.fam === 'tresse' ? 'HL' : s.fam === 'pv' ? 'HO' : (MAP[s.fam] || {})[s.k];
    if (!col) { hors.push(Object.assign({ code }, s)); return; }
    if (!out[col] || RANG[code] > RANG[out[col]]) out[col] = code;
  });
  return { out, hors };
}

/* ---------- 5. travaux du scénario → diag complémentaire ---------- */
function travauxTexte(txt, sc) {
  const d = nrm(txt); sc = +sc || 0;
  const T = { combles: /comble/.test(d), rampants: /rampant/.test(d), vmc: /\bvmc\b|ventilation/.test(d), portes: /porte/.test(d), baies: /baie|fenetre|menuiserie/.test(d), murFroid: /mur.{0,3}froid/.test(d) };
  if (sc === 13 || sc === 14) T.murFroid = true;
  return T;
}
function travaux(R) { return travauxTexte(R.desc, R.scen); }
/* travaux d'après les tâches / prestations du logement dans Évolud */
function travauxTaches(noms) {
  const T = { combles: false, rampants: false, vmc: false, portes: false, baies: false, murFroid: false }, n = noms.map(nrm).join(' | ');
  if (/souffl|trappe.*(bp|bs)|creation trappe|comble|plafond droit/.test(n)) T.combles = true;
  if (/rampant/.test(n)) T.rampants = true;
  if (/vmc|vmr|ventil/.test(n)) T.vmc = true;
  if (/\bpe\b|porte d.?entree|porte bs|porte/.test(n)) T.portes = true;
  if (/mext|menuiserie|fenetre|chassis|baie/.test(n)) T.baies = true;
  if (/mur.{0,3}froid/.test(n)) T.murFroid = true;
  return T;
}
function complement(R, Tx) {
  const T = Tx || travaux(R), S = R.sondages, has = (f, k) => S.some(s => s.fam === f && (!k || s.k === k));
  const items = [], impacts = [];
  const pieces = {}; S.forEach(s => { pieces[s.k] = 1; });
  if (T.baies) {
    const fen = ['SEJ', 'CUI', 'SDB', 'CH1', 'CH2', 'CH3'].filter(k => pieces[k]);
    const parFacade = S.some(s => s.k === 'EXT' && ['mastic', 'jointDO', 'jointMaco', 'appui', 'allege', 'imposte'].indexOf(s.fam) >= 0);   // rapports qui sondent les fenêtres côté façade
    const sansFen = parFacade ? [] : fen.filter(k => !S.some(s => s.k === k && ['mastic', 'jointDO', 'appui', 'allege', 'imposte', 'linteau'].indexOf(s.fam) >= 0));
    if (sansFen.length) items.push('Fenêtres non sondées : ' + sansFen.map(k => NOMP[k] || k).join(', ') + ' (mastic, joints, appui)');
    if (!has('jointMaco')) items.push('Joints dormant / maçonnerie des fenêtres');
    const fenAvec = fen.filter(k => sansFen.indexOf(k) < 0);
    const sansAppui = parFacade ? [] : fenAvec.filter(k => !S.some(s => s.k === k && (s.fam === 'appui' || s.fam === 'allege')) && ['CH1', 'CH2', 'CH3', 'SEJ'].indexOf(k) >= 0);
    if (sansAppui.length) items.push('Appui de fenêtre : ' + sansAppui.map(k => NOMP[k] || k).join(', '));
    if (!has('linteau')) items.push('Linteaux');
    if (!has('jointDO')) items.push("Joints d'assemblage des fenêtres");
  }
  if (T.portes) { const np = S.filter(s => s.fam === 'portemaco').length; if (np < 2) items.push(np ? 'Porte BS / porte d\'entrée (une seule porte sondée) + seuils' : 'Portes (entrée, BS) : joints et seuils'); else if (!has('seuil')) items.push('Seuils des portes'); }
  if (T.vmc && !has('vmc') && !has('toiture')) items.push('VMC : conduits existants et sortie en toiture');
  if (T.combles || T.rampants) { if (!has('pv')) items.push('Combles : pare-vapeur / isolant'); if (!has('plafond') && !has('plafond2')) items.push('Plafonds sous combles'); }
  if (T.murFroid) { if (!has('mur')) items.push('Murs : aucun mur sondé (mur froid, trappes 30×30)'); else items.push('Murs de façade des trappes 30×30 : vérifier sur plan qu\'ils sont sondés'); }
  else if (!has('mur')) items.push('Murs : aucun sondé (nécessaire si trappes 30×30)');
  // impacts des matériaux amiantés sur les travaux
  const P = S.filter(s => s.pos), fams = {}; P.forEach(s => { (fams[s.fam] = fams[s.fam] || []).push(s.k); });
  Object.keys(fams).forEach(f => {
    const ou = [...new Set(fams[f])].map(k => NOMP[k] || k).join(', ');
    const tr = (['appui', 'allege', 'imposte', 'mastic', 'jointDO', 'linteau', 'jointMaco'].indexOf(f) >= 0 && T.baies) ? 'touché par le changement des baies : retrait SS3 ou intervention SS4 avec mode opératoire'
      : (f === 'tresse' && T.murFroid) ? 'dépose des radiateurs pour les murs froids = intervention SS4'
      : (['plafond', 'plafond2', 'pv'].indexOf(f) >= 0 && (T.combles || T.rampants || T.vmc)) ? 'touché par les travaux combles / VMC'
      : (f === 'portemaco' || f === 'seuil') && T.portes ? 'touché par le changement des portes' : 'à protéger, ne pas dégrader';
    impacts.push((NOMF[f] || f) + ' (' + ou + ') : ' + tr);
  });
  const besoin = items.filter(t => !/^Murs : aucun sondé \(nécessaire si/.test(t) && !/vérifier sur plan/.test(t)).length > 0;
  return { T, items, impacts, besoin: besoin ? 'OUI' : (items.length ? 'À VÉRIFIER' : 'NON') };
}

/* ---------- 6. résumé compact (stocké dans la fiche du logement) ---------- */
function resume(R) {
  const c = complement(R), col = colonnes(R);
  const amiante = R.sondages.filter(s => s.pos);
  const ou = {}; amiante.forEach(s => { const f = NOMF[s.fam] || s.fam; (ou[f] = ou[f] || []).push(NOMP[s.k] || s.k); });
  return { v: 1, ug: R.ug, adr: R.adr, ville: R.ville, date: R.date, desc: R.desc, scen: R.scen, n: R.sondages.length,
    am: amiante.length ? 'OUI' : 'NON', ou: Object.keys(ou).map(f => f + ' : ' + [...new Set(ou[f])].join(', ')),
    compl: c.besoin, items: c.items, impacts: c.impacts, cols: col.out, at: Date.now(),
    S: R.sondages.map(s => [s.z, s.k, s.fam, s.m, s.pos ? 1 : 0]) };
}

function reanalyser(r, Tx) {   // refait l'analyse depuis le résumé stocké (sans le PDF), avec les travaux actuels du logement
  const R = { desc: r.desc || '', scen: r.scen || '', sondages: (r.S || []).map(x => ({ z: x[0], k: x[1], fam: x[2], m: x[3], pos: !!x[4] })) };
  if (!R.sondages.length) return { items: r.items || [], impacts: r.impacts || [], besoin: r.compl, T: null };
  return complement(R, Tx);
}
const API = { reanalyser, travauxTexte, travauxTaches, lirePdf, analyser, colonnes, complement, resume, famille, piece, NOMP, NOMF, MAP };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.EvoludDiagCore = API;
})(typeof window !== 'undefined' ? window : globalThis);

/* Évolud – ☢️ module Diag amiante (interface) · conçu et développé par Saïd OUFQIR
 * v1.1 : le diag amiante est affiché dans CHAQUE VTE ouverte (en haut), sans exception ; s'il manque, alerte rouge ;
 *        s'il existe en ligne mais n'est pas analysé, il est analysé automatiquement ; analyse selon le scénario validé.
 * v1.0 : carte « Diag amiante » dans la fiche logement (ouvrir / télécharger le rapport, analyse, diag complémentaire),
 *        page #/diagam (import de plusieurs PDF, liste, filtres, export Excel au format « Synt. Logements allégés »).
 * Module ajouté par-dessus l'existant (comme scen.js) : aucune fonction d'origine n'est modifiée.
 * L'analyse (petit résumé) est rangée dans la fiche du logement (setLog → synchronisée pour toute l'équipe) ;
 * le PDF est gardé sur le téléphone qui l'a importé (et le lien en ligne du rapport, s'il existe, reste disponible).
 */
(function () {
'use strict';
if (window.__evDiagam) return; window.__evDiagam = 1;
var C = window.EvoludDiagCore; if (!C) return;
var BASE = (function () { try { return new URL('.', document.currentScript.src).href; } catch (e) { return location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''); } })();
var HDR = ["", "Numéro", "Rue", "Ville", "UG", "Diagnostic complémentaire", "Scénario prévu", "Séjour Séjour_Sol souple", "Chambres Chambres 1_Sol souple", "Chambres 2_Sol souple", "Chambres 3_Sol souple", "Chambres 4_Sol souple", "SDB SDB_Sol souple", "Wc Wc_Sol souple", "Escalier Escalier_Sol souple", "Palier R+1 Palier R+1_Sol souple", "1er - Comble BS 1er - Comble BS Laine minérale_Sol souple", "Sol Porte d'entrée Sol Porte d'entrée_Dalle de sol", "Plancher comble", "Sol Porte sur cour Sol Porte sur cour_Dalle de sol", "Cuisine Cuisine 1_Carrelage", "SDB SDB_Carrelage", "Séjour Séjour_Carrelage", "Chambres Chambres 1_Carrelage", "Dégagement Dégagement_Carrelage", "Dégagement 2 Dégagement 2_Carrelage", "Entrée Entrée_Carrelage", "Escalier Escalier_Carrelage", "WC WC_Carrelage", "Entrée Entrée_Autre", "Dégagement Dégagement_Peinture - Plâtre - Enduit", "Dégagement 2 Dégagement 2_Peinture - Plâtre - Enduit", "Séjour Séjour_Peinture - Plâtre - Enduit", "Chambres Chambres 1_Peinture - Plâtre - Enduit", "Chambres 2_Peinture - Plâtre - Enduit", "Chambres 3_Peinture - Plâtre - Enduit", "Chambres 4_Peinture - Plâtre - Enduit", "Cuisine Cuisine 1_Peinture - Plâtre - Enduit", "SDB SDB_Peinture - Plâtre - Enduit", "Wc Wc_Peinture - Plâtre - Enduit", "Extérieur maison Extérieur maison_Peinture - Plâtre - Enduit", "Escalier 0 Escalier 0_Peinture - Plâtre - Enduit", "Escalier 1 Escalier 1_Peinture - Plâtre - Enduit", "Escalier 2 Escalier 2_Peinture - Plâtre - Enduit", "Palier R+1 Palier R+1_Peinture - Plâtre - Enduit", "Combles Combles 1_Peinture - Plâtre - Enduit", "Cuisine Cuisine 1_Faïence des murs", "SDB SDB_Faïence des murs", "Dégagement Dégagement_Faïence des murs", "WC WC_Faïence des murs", "Séjour Séjour_Colle plinthe", "Dégagement Dégagement_Colle plinthe", "Dégagement 2 Dégagement 2_Colle plinthe", "WC WC_Colle plinthe", "Chambre Chambre 1_Colle plinthe", "Chambre 2_Colle plinthe", "Chambre 3_Colle plinthe", "Cuisine Cuisine 1_Colle plinthe", "Cuisine 2_Colle plinthe", "Escalier Escalier_Colle plinthe", "Accès cave Accès cave_Colle plinthe", "Entrée Entrée_Colle plinthe", "SDB SDB_Colle plinthe", "Entrée Entrée_Enduit et peinture", "Dégagement Dégagement_Enduit et peinture", "Dégagement 2 Dégagement 2_Enduit et peinture", "Salle à manger Salle à manger_Enduit et peinture", "Salon Salon_Enduit et peinture", "Séjour Séjour_Enduit et peinture", "Chambres Chambres 1_Enduit et peinture", "Chambres 2_Enduit et peinture", "Chambres 3_Enduit et peinture", "Chambres 4_Enduit et peinture", "Cuisine Cuisine 1_Enduit et peinture", "SDB SDB_Enduit et peinture", "Wc Wc_Enduit et peinture", "Escalier 1 Escalier 1_Enduit et peinture", "Escalier 2 Escalier 2_Enduit et peinture", "Palier R+1 Palier R+1_Enduit et peinture", "Combles Combles 1_Enduit et peinture", "Cuisine", "SDB", "WC", "DGT", "ESCR+1", "Palier R+1", "Chambres", "", "", "Cuisine", "SDB", "WC", "DGT", "ESCR+1", "Palier R+1", "Chambres", "", "", "Entrée Entrée Fenêtre_Mastic de vitrage", "Entrée Porte_Mastic de vitrage", "Dégagement Dégagement Fenêtre_Mastic de vitrage", "Dégagement Porte_Mastic de vitrage", "Salle à manger Salle à manger Fenêtre_Mastic de vitrage", "Séjour Séjour Fenêtre_Mastic de vitrage", "Séjour Porte_Mastic de vitrage", "Séjour Volet_Mastic de vitrage", "Chambres Chambres 1_Mastic de vitrage", "Chambres 2_Mastic de vitrage", "Chambres 3_Mastic de vitrage", "Chambres 4_Mastic de vitrage", "Chambres (Porte) Chambres (Porte) 1_Mastic de vitrage", "Chambres (Porte) 2_Mastic de vitrage", "Chambres (Porte) 3_Mastic de vitrage", "Chambres (Volet) Chambres (Volet) 1_Mastic de vitrage", "Chambres (Volet) 2_Mastic de vitrage", "Chambres (Volet) 3_Mastic de vitrage", "Cuisine Cuisine Fenêtre_Mastic de vitrage", "Cuisine Porte_Mastic de vitrage", "Cuisine Volet_Mastic de vitrage", "SDB SDB_Mastic de vitrage", "Wc Wc_Mastic de vitrage", "Extérieur Extérieur Fenêtre_Mastic de vitrage", "Extérieur Porte_Mastic de vitrage", "Entrée Entrée Fenêtre_Joint d'étanchéité Entre dormant et ouvrant", "Entrée Porte_Joint d'étanchéité Entre dormant et ouvrant", "Entrée 2 Entrée 2 Porte_Joint d'étanchéité Entre dormant et ouvrant", "Dégagement Dégagement Fenêtre_Joint d'étanchéité Entre dormant et ouvrant", "Dégagement Porte_Joint d'étanchéité Entre dormant et ouvrant", "Salle à manger Salle à manger_Joint d'étanchéité Entre dormant et ouvrant", "Séjour Séjour Porte_Joint d'étanchéité Entre dormant et ouvrant", "Séjour Fenêtre_Joint d'étanchéité Entre dormant et ouvrant", "Chambres Chambres 1_Joint d'étanchéité Entre dormant et ouvrant", "Chambres 2_Joint d'étanchéité Entre dormant et ouvrant", "Chambres 3_Joint d'étanchéité Entre dormant et ouvrant", "Chambres 4_Joint d'étanchéité Entre dormant et ouvrant", "Cuisine Cuisine Porte_Joint d'étanchéité Entre dormant et ouvrant", "Cuisine fenêtre_Joint d'étanchéité Entre dormant et ouvrant", "SDB SDB_Joint d'étanchéité Entre dormant et ouvrant", "Wc Wc_Joint d'étanchéité Entre dormant et ouvrant", "Entrée Entrée_Joint d'étanchéité Entre dormant et maçonnerie", "Entrée porte Entrée porte_Joint d'étanchéité Entre dormant et maçonnerie", "Dégagement Dégagement_Joint d'étanchéité Entre dormant et maçonnerie", "Dégagement porte_Joint d'étanchéité Entre dormant et maçonnerie", "Salle à manger Salle à manger_Joint d'étanchéité Entre dormant et maçonnerie", "Séjour Séjour Porte _Joint d'étanchéité Entre dormant et maçonnerie", "Séjour Fenêtre_Joint d'étanchéité Entre dormant et maçonnerie", "Chambres Chambres 1_Joint d'étanchéité Entre dormant et maçonnerie", "Chambres 2_Joint d'étanchéité Entre dormant et maçonnerie", "Chambres 3_Joint d'étanchéité Entre dormant et maçonnerie", "Chambres 4_Joint d'étanchéité Entre dormant et maçonnerie", "Chambres porte Chambres porte 1_Joint d'étanchéité Entre dormant et maçonnerie", "Chambres porte 2_Joint d'étanchéité Entre dormant et maçonnerie", "Cuisine Cuisine Porte_Joint d'étanchéité Entre dormant et maçonnerie", "Cuisine Fenêtre_Joint d'étanchéité Entre dormant et maçonnerie", "SDB SDB_Joint d'étanchéité Entre dormant et maçonnerie", "SDB porte_Joint d'étanchéité Entre dormant et maçonnerie", "Escalier porte Escalier porte_Joint d'étanchéité Entre dormant et maçonnerie", "Wc Wc_Joint d'étanchéité Entre dormant et maçonnerie", "WC porte_Joint d'étanchéité Entre dormant et maçonnerie", "Extérieur Extérieur_Joint d'étanchéité Entre dormant et maçonnerie", "Extérieur porte Extérieur porte_Joint d'étanchéité Entre dormant et maçonnerie", "Entrée Entrée_Joint entre dormant pose réno et ancien dormant", "Dégagement Dégagement_Joint entre dormant pose réno et ancien dormant", "Salle à manger Salle à manger_Joint entre dormant pose réno et ancien dormant", "Séjour Séjour_Joint entre dormant pose réno et ancien dormant", "Chambres Chambres 1_Joint entre dormant pose réno et ancien dormant", "Chambres 2_Joint entre dormant pose réno et ancien dormant", "Chambres 3_Joint entre dormant pose réno et ancien dormant", "Cuisine Cuisine_Joint entre dormant pose réno et ancien dormant", "SDB SDB_Joint entre dormant pose réno et ancien dormant", "Wc Wc_Joint entre dormant pose réno et ancien dormant", "Chambre Chambre_Porte fenête Glasal", "Cuisine Cuisine _Appui de fenêtre", "Cuisine 2 Cuisine _Appui de fenêtre N2", "Chambre Chambre 1_Appui de fenêtre", "Chambre 2_Appui de fenêtre", "", "SDB SDB_Appui de fenêtre", "WC WC_Appui de fenêtre", "Volume Ajouté Volume Ajouté_Appui de fenêtre", "Salle à manger Salle à manger_Appui de fenêtre", "Séjour Séjour_Appui de fenêtre", "_Sous évier (cuisine)", "_Sous baignoire (SDB)", "Mur éxtérieurs Mur éxtérieurs Cuisine_Façade", "Mur éxtérieurs Séjour_Façade", "Mur éxtérieurs Dégagement_Façade", "Cuisine Cuisine_Allège fenêtre", "WC WC_Allège fenêtre", "SDB SDB_Allège fenêtre", "Séjour Séjour_Joint O/D porte", "Dégagement Dégagement_Joint O/D porte", "Cuisine Cuisine_Linteau Extérieur", "Entrée", "Salle à manger Salle à manger_Linteau Extérieur", "Chambre", "", "DGT", "Séjour", "WC WC_Linteau Extérieur", "SDB SDB_Linteau Extérieur", "Cuisine Cuisine_Seuil Extérieur", "SDB", "WC", "DGT", "Séjour Séjour_Seuil Extérieur", "Séjour Séjour_Bloc porte", "Cuisine Cuisine_Bloc porte", "Séjour Séjour_Porte d'entrée", "Dégagement Dégagement_Porte d'entrée", "Entrée", "Cuisine Cuisine_Porte d'entrée", "1er SS - Cage d'escalier 1er SS - Cage d'escalier_Marches", "Marche béton Marche béton_Marches", "1er  - Cage d'escalier n°2 1er  - Cage d'escalier n°2_Marches", "Lavabo Lavabo_Joint d'étanchéité", "Evier Evier_Joint d'étanchéité", "Cuisine Cuisine_Joint en péripherie des équipements sanitaires", "SDB SDB_Joint en péripherie des équipements sanitaires", "toute zone", "degagement", "wc", "Cuisine Cuisine_Pare-vapeur", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];

/* ---------- utilitaires ---------- */
var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var Q = function (s, r) { return (r || document).querySelector(s); };
var T = function (m, ms) { try { if (typeof toast === 'function') return toast(m, ms); } catch (e) { } console.log(m); };
var hasApp = function () { try { return typeof routes !== 'undefined' && typeof log === 'function' && typeof setLog === 'function'; } catch (e) { return false; } };
var pill = function (t, fg, bg) { return '<span class="pill" style="background:' + bg + ';color:' + fg + ';white-space:nowrap">' + t + '</span>'; };

var PJ = null;
function polyfills() {   // iPhone (Safari) : ReadableStream n'est pas « itérable » → pdf.js plante (« undefined is not a function »)
  try { if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) ReadableStream.prototype[Symbol.asyncIterator] = async function* () { var r = this.getReader(); try { for (;;) { var x = await r.read(); if (x.done) return; yield x.value; } } finally { try { r.releaseLock(); } catch (e) { } } }; } catch (e) { }
  try { if (!Promise.withResolvers) Promise.withResolvers = function () { var a, b, p = new Promise(function (x, y) { a = x; b = y; }); return { promise: p, resolve: a, reject: b }; }; } catch (e) { }
}
function pdfjs() {   // lecteur PDF : à la racine du site (ou dossier pdfjs/) ; tourne dans la page (pas de « worker ») pour profiter des correctifs iPhone
  if (PJ) return Promise.resolve(PJ);
  polyfills();
  var go = function (d) { return import(BASE + d + 'pdf.worker.min.mjs').then(function () { return import(BASE + d + 'pdf.min.mjs'); }).then(function (m) { m.GlobalWorkerOptions.workerSrc = BASE + d + 'pdf.worker.min.mjs'; PJ = m; return m; }); };
  return go('').catch(function () { return go('pdfjs/'); });
}

/* ---------- PDF gardés sur le téléphone ---------- */
function idb() { return new Promise(function (ok, ko) { var r = indexedDB.open('evolud_diagam', 1); r.onupgradeneeded = function () { r.result.createObjectStore('pdf'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; }); }
function putPdf(ug, blob, name) { return idb().then(function (db) { return new Promise(function (ok) { var tx = db.transaction('pdf', 'readwrite'); tx.objectStore('pdf').put({ blob: blob, name: name, at: Date.now() }, String(ug)); tx.oncomplete = tx.onerror = function () { db.close(); ok(); }; }); }).catch(function () { }); }
function getPdf(ug) { return idb().then(function (db) { return new Promise(function (ok) { var g = db.transaction('pdf').objectStore('pdf').get(String(ug)); g.onsuccess = function () { db.close(); ok(g.result || null); }; g.onerror = function () { db.close(); ok(null); }; }); }).catch(function () { return null; }); }
function delPdf(ug) { return idb().then(function (db) { return new Promise(function (ok) { var tx = db.transaction('pdf', 'readwrite'); tx.objectStore('pdf').delete(String(ug)); tx.oncomplete = tx.onerror = function () { db.close(); ok(); }; }); }).catch(function () { }); }
/* ménage : un PDF déjà rangé dans le Drive n'a pas besoin de rester sur le téléphone */
function menagePdf() { return keysPdf().then(function (K) { return Promise.all(K.map(function (ug) { var r = resOf(ug); return r && r.url ? delPdf(ug) : null; })); }); }
function keysPdf() { return idb().then(function (db) { return new Promise(function (ok) { var g = db.transaction('pdf').objectStore('pdf').getAllKeys(); g.onsuccess = function () { db.close(); ok(g.result || []); }; g.onerror = function () { db.close(); ok([]); }; }); }).catch(function () { return []; }); }

/* ---------- résultats d'analyse ---------- */
var KL = 'evolud_diagam_res_v1';
function local() { try { return JSON.parse(localStorage.getItem(KL) || '{}') || {}; } catch (e) { return {}; } }
function resOf(ug) { var r = null; try { if (hasApp()) r = (log(ug) || {}).dga || null; } catch (e) { } return r || local()[ug] || null; }
function saveRes(ug, r) {
  var L = local(); L[ug] = r; try { localStorage.setItem(KL, JSON.stringify(L)); } catch (e) { }
  try { if (hasApp() && typeof SEEDMAP !== 'undefined' && SEEDMAP[ug]) setLog(ug, { dga: r }); } catch (e) { console.warn('diagam setLog', e); }
}
function allUgs() { var s = {}; Object.keys(local()).forEach(function (u) { s[u] = 1; }); try { if (typeof SEED !== 'undefined') (SEED.logements || []).forEach(function (x) { var d = (log(x.ug) || {}).dga; if (d) s[x.ug] = 1; }); } catch (e) { } return Object.keys(s).sort(); }
function lienEnLigne(ug) { try { var d = ((window.EVOLUD_DIAGS || {}).diags || {})[ug]; return (d && d.docs && d.docs.amiante) || []; } catch (e) { return []; } }
function infoLog(ug) { try { if (typeof SEEDMAP !== 'undefined' && SEEDMAP[ug]) { var s = SEEDMAP[ug], l = log(ug) || {}; return { a: l.a || s.a || s.adresse || '', v: l.v || s.v || s.ville || '', sc: l.sc || s.sc || s.scen || '' }; } } catch (e) { } return {}; }

/* ---------- serveur Évolud : envoi du PDF dans le Drive (dossier du logement) ---------- */
function conf() {
  var o = { url: '', token: '', device: '', user: '' }, seen = 0;
  var scan = function (v, d) { if (d > 3 || v == null || seen > 4000) return; seen++;
    if (typeof v === 'string') { if (!o.url && /^https:\/\/script\.google(usercontent)?\.com\/.+\/exec/.test(v)) o.url = v; else if (!o.token && /^EVD-[A-Za-z0-9]{3,}-/.test(v) && !/^EVD-QR-/.test(v)) o.token = v; else if (!o.device && /^dev-[a-z0-9]{6,}$/i.test(v)) o.device = v;
      else if (d === 0 && /^[\[{]/.test(v) && v.length < 20000) { try { scan(JSON.parse(v), 1); } catch (e) { } } return; }
    if (typeof v === 'object') Object.keys(v).slice(0, 60).forEach(function (k) { scan(v[k], d + 1); }); };
  try { if (typeof cfg === 'function') scan(cfg(), 1); } catch (e) { }
  try { for (var i = 0; i < localStorage.length && !(o.url && o.token && o.device); i++) { var v = localStorage.getItem(localStorage.key(i)); if (v && v.length < 20000) scan(v, 0); } } catch (e) { }
  try { o.user = (typeof ME !== 'undefined' && ME && ME.nom) || ''; } catch (e) { }
  return o;
}
function b64(ab) { var u = new Uint8Array(ab), s = '', k = 0x8000; for (var i = 0; i < u.length; i += k) s += String.fromCharCode.apply(null, u.subarray(i, i + k)); return btoa(s); }
function versDrive(ug, ab, name, adr) {
  var c = conf(); if (!c.url || !c.token) return Promise.reject(new Error('serveur non trouvé'));
  var nom = 'DIAG_AMIANTE_' + ug + '_' + String(name || 'diag.pdf').replace(/[^\w.-]+/g, '_').replace(/(\.pdf)?$/i, '.pdf');
  return fetch(c.url, { method: 'POST', body: JSON.stringify({ token: c.token, device: c.device, user: c.user, action: 'photo', ug: String(ug), name: nom, mime: 'application/pdf', kind: 'DIAG', b64: b64(ab), meta: { adresse: adr || '', ts: Date.now(), comment: 'Diag amiante' } }) })
    .then(function (r) { return r.json(); }).then(function (j) { if (!j.ok || !j.url) throw new Error(j.error || 'envoi refusé'); return j.url; });
}

/* ---------- travaux actuels du logement (tâches / VTE / scénario Gamma) ---------- */
var KS = 'evolud_diagam_scen_v1';
function scMap() { var M = {}; try { M = JSON.parse(localStorage.getItem(KS) || '{}') || {}; } catch (e) { }
  allUgs().forEach(function (u) { var r = resOf(u); if (r && r.scen && r.desc && !M[r.scen]) M[r.scen] = r.desc; }); return M; }
function apprendre(r) { if (!r || !r.scen || !r.desc) return; try { var M = JSON.parse(localStorage.getItem(KS) || '{}') || {}; M[r.scen] = r.desc; localStorage.setItem(KS, JSON.stringify(M)); } catch (e) { } }
function scenActuel(ug) { var v = '';
  try { var l0 = log(ug) || {}, g0 = (window.GAMMA && window.GAMMA[ug]) || {}; v = l0.scValide || l0.scv || l0.scenValide || g0.scValide || g0.scv || ''; } catch (e) { }   // scénario validé en priorité
  try { var g = window.GAMMA && window.GAMMA[ug]; if (!v && g && g.sc) v = g.sc; } catch (e) { } try { if (!v) { var l = log(ug) || {}; v = l.sc || l.scen || ''; } } catch (e) { } try { if (!v && typeof SEEDMAP !== 'undefined' && SEEDMAP[ug]) v = SEEDMAP[ug].sc || SEEDMAP[ug].scen || ''; } catch (e) { } return String(v || ''); }
function nomsTaches(ug) { var N = [];
  try { if (typeof tachesOf === 'function') (tachesOf(ug) || []).forEach(function (t) { if (t && !t.deleted && t.prest) N.push(t.prest); }); } catch (e) { }
  try { if (typeof vteOf === 'function') { var v = vteOf(ug); if (v && v.prest) Object.keys(v.prest).forEach(function (k) { if (!/^(np|non|annul)/i.test(String(v.prest[k]))) N.push(k); }); } } catch (e) { }
  return N; }
function travauxActuels(ug, r) {
  var sc = scenActuel(ug), N = nomsTaches(ug), M = scMap(), T = null, src = '';
  if (N.length) { T = C.travauxTaches(N); src = 'tâches du logement'; }
  if (sc && M[sc]) { var T2 = C.travauxTexte(M[sc], sc); if (T) Object.keys(T2).forEach(function (k) { T[k] = T[k] || T2[k]; }); else T = T2; src = (src ? src + ' + ' : '') + 'scénario validé ' + sc; }
  else if (sc && (+sc === 13 || +sc === 14) && T) { T.murFroid = true; }
  if (!T) { T = C.travauxTexte((r && r.desc) || '', (r && r.scen) || ''); src = 'travaux écrits dans le diag'; }
  return { T: T, src: src, sc: sc };
}
function analyseActuelle(ug, r) { var w = travauxActuels(ug, r), a = C.reanalyser(r, w.T); return { items: a.items, impacts: a.impacts, compl: a.besoin, src: w.src, sc: w.sc, change: !!(w.sc && r.scen && String(w.sc) !== String(r.scen)), T: w.T }; }
var NOMT = { combles: 'combles', rampants: 'rampants', vmc: 'VMC', portes: 'portes', baies: 'fenêtres', murFroid: 'mur(s) froid(s)' };

/* ---------- analyse d'un fichier ---------- */
function analyseFichier(file, ugHint, onEtape) {
  return file.arrayBuffer().then(function (ab) {
    return pdfjs().then(function (pj) { return C.lirePdf(pj, new Uint8Array(ab.slice(0))); }).then(function (pages) {
      var R = C.analyser(pages);
      var fromName = (String(file.name).match(/(?:^|[^\d])(1\d{5})(?:[^\d]|$)/) || [])[1];
      if (ugHint && R.ug && R.ug !== String(ugHint) && !confirm('Ce rapport concerne l\'UG ' + R.ug + ', pas ' + ugHint + '. Le ranger quand même dans ' + ugHint + ' ?')) throw new Error('annulé');
      var ug = String(ugHint || R.ug || fromName || ''); if (!ug) { ug = prompt('UG non trouvée dans le rapport « ' + file.name + ' ». Numéro d\'UG ?') || ''; }
      if (!/^\d{5,7}$/.test(ug)) throw new Error('UG inconnue pour ' + file.name);
      R.ug = ug; if (!R.adr || !R.ville) { var il = infoLog(ug); R.adr = R.adr || il.a || ''; R.ville = R.ville || il.v || ''; } var res = C.resume(R); res.file = file.name;
      var old = resOf(ug); if (old && old.url) res.url = old.url;
      apprendre(res); saveRes(ug, res);
      return putPdf(ug, new Blob([ab], { type: 'application/pdf' }), file.name).then(function () {
        if (typeof onEtape === 'function') onEtape('☁️ Envoi du PDF dans le Drive…');
        return versDrive(ug, ab, file.name, res.adr).then(function (u) { res.url = u; saveRes(ug, res); res._drive = 'ok'; return delPdf(ug).then(function () { return res; }); })
          .catch(function (e) { res._drive = e.message || String(e); return res; });
      });
    });
  });
}

/* ---------- carte dans la fiche logement ---------- */
function carte(ug) {
  var r0 = resOf(ug), on = lienEnLigne(ug), A = r0 ? analyseActuelle(ug, r0) : null, r = r0 ? Object.assign({}, r0, { items: A.items, impacts: A.impacts, compl: A.compl }) : null;
  if (r0 && r0.url && on.indexOf(r0.url) < 0) on = [r0.url].concat(on);
  var tete = !r ? pill('non analysé', '#555', '#eceff3') : (r.am === 'OUI' ? pill('☣️ Amiante présent', '#C00000', '#fbe0e0') : pill('✔ Pas d\'amiante', '#1b5e20', '#dff3e0')) + ' ' +
    (r.compl === 'OUI' ? pill('Diag complémentaire : OUI', '#a34a00', '#fde9d7') : r.compl === 'NON' ? pill('Diag complet', '#1b5e20', '#dff3e0') : pill('Complément à vérifier', '#7a5b00', '#fff3c4'));
  if (!r) tete = on.length ? pill('⏳ analyse automatique…', '#7a5b00', '#fff3c4') : pill('⛔ DIAG MANQUANT', '#fff', '#C00000');
  var h = '<div class="card" id="dgaC" style="border-left:5px solid ' + (!r ? (on.length ? '#e8792b' : '#C00000') : r.am === 'OUI' ? 'var(--red,#C00000)' : r.compl === 'OUI' ? 'var(--orange,#e8792b)' : 'var(--green,#2e7d32)') + '">' +
    '<div class="row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 class="grow" style="margin:0;flex:1">☢️ Diag amiante</h3>' + tete + '</div>';
  if (r) {
    h += '<div class="small mut" style="margin:6px 0">Repérage du ' + E(r.date || '?') + (r.scen ? ' · scénario ' + E(r.scen) : '') + ' · ' + r.n + ' sondages' + (r.file ? ' · ' + E(r.file) : '') + '</div>';
    if (r.desc) h += '<div class="small"><b>Travaux écrits dans le diag :</b> ' + E(r.desc) + '</div>';
    h += '<div class="small" style="margin-top:4px"><b>Analyse faite selon :</b> ' + E(A.src) + ' → ' + Object.keys(NOMT).filter(function (k) { return A.T && A.T[k]; }).map(function (k) { return NOMT[k]; }).join(', ') + '</div>';
    if (!A.sc) h += '<div class="small" style="margin-top:6px;padding:6px 8px;border-radius:8px;background:#fde9d7;color:#a34a00"><b>⚠️ Scénario validé introuvable</b> pour ce logement : l\'analyse se base sur ' + E(A.src) + '. Renseigne le scénario pour une analyse fiable.</div>';
    if (A.change) h += '<div class="small" style="margin-top:6px;padding:6px 8px;border-radius:8px;background:#fff3c4;color:#7a5b00"><b>⚠️ Scénario changé :</b> le diag a été fait pour le scénario ' + E(r0.scen) + ', le logement est maintenant en scénario ' + E(A.sc) + '. L\'analyse ci-dessous est refaite pour le scénario ' + E(A.sc) + '.</div>';
    if (r.ou && r.ou.length) h += '<div class="small" style="margin-top:6px;color:#C00000"><b>Amiante :</b><br>' + r.ou.map(E).join('<br>') + '</div>';
    if (r.impacts && r.impacts.length) h += '<div class="small" style="margin-top:6px"><b>Impact sur les travaux :</b><ul style="margin:4px 0 0 18px;padding:0">' + r.impacts.map(function (t) { return '<li>' + E(t) + '</li>'; }).join('') + '</ul></div>';
    if (r.items && r.items.length) h += '<div class="small" style="margin-top:6px"><b>Diag complémentaire (' + E(r.compl) + ') – à faire sonder :</b><ul style="margin:4px 0 0 18px;padding:0">' + r.items.map(function (t) { return '<li>' + E(t) + '</li>'; }).join('') + '</ul></div>';
  } else if (on.length) h += '<div class="small" style="margin:6px 0">Le diag existe en ligne : analyse automatique en cours selon le scénario validé…</div>';
  else h += '<div class="small" style="margin:6px 0;padding:8px;border-radius:8px;background:#fbe0e0;color:#C00000"><b>⛔ Aucun diag amiante pour ce logement.</b> Pas de VTE ni de travaux sans diag : récupère le rapport et importe-le ci-dessous.</div>';
  h += '<div class="row" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
    '<button class="btn sm" data-dga="open" style="display:none">📄 Ouvrir le diag (téléphone)</button><button class="btn sm sec" data-dga="dl" style="display:none">⬇️ Télécharger</button>' +
    on.map(function (u, i) { return '<a class="btn sm sec" href="' + E(u) + '" target="_blank" rel="noopener">' + (r0 && u === r0.url ? '📄 Diag (Drive)' : '🌐 Rapport en ligne' + (on.length > 1 ? ' ' + i : '')) + '</a>'; }).join('') +
    '<label class="btn sm sec" style="cursor:pointer;margin:0">📥 ' + (r ? 'Remplacer le PDF' : 'Importer le PDF du diag') + '<input type="file" accept="application/pdf,.pdf" data-dga="imp" style="display:none"></label>' +
    '<a class="btn sm sec" href="#/diagam">📊 Tous les diags</a></div><div class="small mut" data-dga="msg" style="margin-top:6px"></div></div>';
  return h;
}
function lierCarte(ug) {
  var c = Q('#dgaC'); if (!c) return;
  var msg = Q('[data-dga="msg"]', c);
  getPdf(ug).then(function (p) { if (!p) return; var u = URL.createObjectURL(p.blob);
    var o = Q('[data-dga="open"]', c), d = Q('[data-dga="dl"]', c); o.style.display = d.style.display = '';
    o.onclick = function () { window.open(u, '_blank'); };
    d.onclick = function () { var a = document.createElement('a'); a.href = u; a.download = p.name || ('Diag_amiante_' + ug + '.pdf'); document.body.appendChild(a); a.click(); a.remove(); }; });
  var inp = Q('[data-dga="imp"]', c);
  inp.onchange = function () { var f = inp.files && inp.files[0]; if (!f) return; msg.textContent = '⏳ Lecture du rapport…';
    analyseFichier(f, ug, function (m) { msg.textContent = m; }).then(function (r) { T('☢️ Diag analysé : amiante ' + r.am + (r._drive === 'ok' ? ' · rangé dans le Drive' : ' · Drive : ' + r._drive)); var n = document.createElement('div'); n.innerHTML = carte(ug); n.firstElementChild.dataset.top = c.dataset.top || '0'; c.replaceWith(n.firstElementChild); lierCarte(ug); })
      .catch(function (e) { msg.textContent = e.message === 'annulé' ? '' : '⚠️ ' + (e.message || e); }); };
}
/* diag pas encore analysé mais disponible en ligne : on le récupère et on l'analyse tout seul (une fois par UG et par session) */
var AUTO = {};
function autoAnalyse(ug) {
  if (AUTO[ug] || resOf(ug)) return; var on = lienEnLigne(ug); if (!on.length) return; AUTO[ug] = 1;
  fetch(on[0]).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
    .then(function (b) { var f = new File([b], 'Diag_amiante_' + ug + '.pdf', { type: 'application/pdf' }); return analyseFichier(f, ug); })
    .then(function () { var c = Q('#dgaC'); if (c) { var top = c.dataset.top === '1'; c.remove(); poserCarte(ug, top); } })
    .catch(function (e) { var m = Q('#dgaC [data-dga="msg"]'); if (m) m.textContent = '⚠️ Analyse automatique impossible (' + (e.message || e) + ') : ouvre le rapport en ligne et importe-le.'; });
}
function poserCarte(ug, enHaut) {
  if (!ug || Q('#dgaC')) return; var app = Q('#app'); if (!app) return;
  var h = carte(ug);
  if (enHaut) app.insertAdjacentHTML('afterbegin', h);   // VTE : le diag est la première chose qu'on voit
  else { var ref = Q('#tmc') || Q('#m6c') || Q('#qrc') || Q('#planbox'); if (ref) ref.insertAdjacentHTML('beforebegin', h); else app.insertAdjacentHTML('beforeend', h); }
  var c = Q('#dgaC'); if (c) c.dataset.top = enHaut ? '1' : '0';
  lierCarte(ug); autoAnalyse(ug);
}
/* ---------- VTE : le diag dans chaque VTE ouverte, sans exception ---------- */
var reVTE = /vte|visite/i;
function ugDuHash() { var m = String(location.hash).match(/(?:^|[^\d])(\d{5,7})(?:[^\d]|$)/); return m ? m[1] : ''; }
function surVTE() { try { if (!reVTE.test(location.hash)) return; var ug = ugDuHash(); if (ug) poserCarte(ug, true); } catch (e) { } }
function brancherVTE() {
  try { Object.keys(routes).forEach(function (k) { var f = routes[k]; if (!reVTE.test(k) || typeof f !== 'function' || f.__dga) return;
    var w = function () { var o = f.apply(this, arguments); setTimeout(surVTE, 0); return o; }; w.__dga = 1; routes[k] = w; }); } catch (e) { }
}
function surveiller() {
  window.addEventListener('hashchange', function () { brancherVTE(); setTimeout(surVTE, 150); });
  var t = null; try { new MutationObserver(function () { if (t) return; t = setTimeout(function () { t = null; brancherVTE(); surVTE(); }, 250); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  surVTE();
}

/* ---------- page #/diagam ---------- */
var F = { q: '', f: '' };
function page() {
  var app = Q('#app'); if (!app) return;
  var U = allUgs(), R = U.map(function (u) { var r0 = resOf(u); if (!r0) return null; var A = analyseActuelle(u, r0); return { ug: u, r: Object.assign({}, r0, { items: A.items, impacts: A.impacts, compl: A.compl }), A: A }; }).filter(Boolean);
  var nA = R.filter(function (x) { return x.r.am === 'OUI'; }).length, nC = R.filter(function (x) { return x.r.compl === 'OUI'; }).length;
  app.innerHTML = '<div class="card"><h2 style="margin:0 0 6px">☢️ Diags amiante</h2><div class="small mut">' + R.length + ' rapport(s) analysé(s) · <b style="color:#C00000">' + nA + ' avec amiante</b> · <b style="color:#a34a00">' + nC + ' diag(s) complémentaire(s) à demander</b></div>' +
    '<div class="row" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><label class="btn" style="cursor:pointer;margin:0">📥 Importer des PDF de diags<input id="dgaF" type="file" accept="application/pdf,.pdf" multiple style="display:none"></label>' +
    '<button class="btn sec" id="dgaX">📊 Excel (Synt. Logements allégés + compléments)</button></div><div id="dgaP" class="small" style="margin-top:8px"></div>' +
    '<div class="small mut" style="margin-top:6px">L\'UG est lue dans le rapport (sinon dans le nom du fichier). Le PDF est rangé dans le Drive (dossier du logement) : toute l\'équipe peut l\'ouvrir. L\'analyse suit le scénario actuel du logement et se refait seule s\'il change.</div></div>' +
    '<div class="card"><input id="dgaQ" placeholder="🔎 UG, adresse, matériau…" value="' + E(F.q) + '" style="width:100%"><div class="seg" style="margin-top:8px">' + [['', 'Tous'], ['am', '☣️ Amiante'], ['co', '📝 Complément'], ['ok', '✔ OK']].map(function (x) { return '<button type="button" data-ff="' + x[0] + '" class="' + (F.f === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div><div id="dgaL"></div>';
  liste(R);
  Q('#dgaQ').oninput = function () { F.q = this.value; liste(R); };
  [].slice.call(app.querySelectorAll('[data-ff]')).forEach(function (b) { b.onclick = function () { F.f = b.dataset.ff; page(); }; });
  Q('#dgaX').onclick = function () { excel(R); };
  Q('#dgaF').onchange = function () {
    var fs = [].slice.call(this.files || []), P = Q('#dgaP'), ok = 0, ko = [];
    fs.reduce(function (p, f, i) { return p.then(function () { P.innerHTML = '⏳ ' + (i + 1) + ' / ' + fs.length + ' : ' + E(f.name); return analyseFichier(f, null, function (m) { P.innerHTML = '⏳ ' + (i + 1) + ' / ' + fs.length + ' : ' + E(f.name) + ' – ' + E(m); }).then(function (r) { ok++; if (r._drive !== 'ok') ko.push(f.name + ' (analysé, mais pas rangé dans le Drive : ' + r._drive + ')'); }).catch(function (e) { ko.push(f.name + ' (' + (e.message || e) + ')'); }); }); }, Promise.resolve())
      .then(function () { T('☢️ ' + ok + ' diag(s) analysé(s)'); page(); if (ko.length) Q('#dgaP').innerHTML = '⚠️ À vérifier : ' + ko.map(E).join(', '); });
  };
}
function liste(R) {
  var q = String(F.q || '').toLowerCase();
  var L = R.filter(function (x) { var r = x.r; if (F.f === 'am' && r.am !== 'OUI') return false; if (F.f === 'co' && r.compl !== 'OUI') return false; if (F.f === 'ok' && (r.am === 'OUI' || r.compl === 'OUI')) return false;
    return !q || (x.ug + ' ' + r.adr + ' ' + r.ville + ' ' + (r.ou || []).join(' ') + ' ' + (r.items || []).join(' ')).toLowerCase().indexOf(q) >= 0; });
  Q('#dgaL').innerHTML = L.map(function (x) { var r = x.r;
    return '<div class="card" style="border-left:5px solid ' + (r.am === 'OUI' ? '#C00000' : r.compl === 'OUI' ? '#e8792b' : '#2e7d32') + '"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="flex:1">' + E(x.ug) + ' – ' + E(r.adr) + (r.ville ? ', ' + E(r.ville) : '') + '</b>' +
      (r.am === 'OUI' ? pill('☣️ Amiante', '#C00000', '#fbe0e0') : pill('✔ Sans amiante', '#1b5e20', '#dff3e0')) + (r.compl === 'OUI' ? pill('Complément', '#a34a00', '#fde9d7') : '') + '</div>' +
      '<div class="small mut">' + E(r.date) + (r.scen ? ' · scén. diag ' + E(r.scen) : '') + (x.A && x.A.sc ? ' · scén. actuel ' + E(x.A.sc) : '') + ' · analyse selon ' + E(x.A ? x.A.src : '') + '</div>' + (x.A && x.A.change ? '<div class="small" style="color:#7a5b00">⚠️ Scénario changé depuis le diag : analyse refaite</div>' : '') +
      (r.ou && r.ou.length ? '<div class="small" style="color:#C00000;margin-top:4px">' + r.ou.map(E).join(' · ') + '</div>' : '') +
      (r.items && r.items.length ? '<div class="small" style="margin-top:4px"><b>À sonder :</b> ' + r.items.map(E).join(' ; ') + '</div>' : '') +
      '<div style="margin-top:6px"><a class="btn sm sec" href="#/logement/' + E(x.ug) + '">🏠 Logement</a> <button class="btn sm sec" data-op="' + E(x.ug) + '">📄 Diag</button></div></div>'; }).join('') || '<div class="card small mut">Aucun diag pour ce filtre.</div>';
  [].slice.call(document.querySelectorAll('[data-op]')).forEach(function (b) { b.onclick = function () { getPdf(b.dataset.op).then(function (p) { if (p) window.open(URL.createObjectURL(p.blob), '_blank'); else { var rr = resOf(b.dataset.op), on = (rr && rr.url ? [rr.url] : []).concat(lienEnLigne(b.dataset.op)); if (on.length) window.open(on[0], '_blank'); else T('PDF non présent sur ce téléphone'); } }); }; });
}

/* ---------- export Excel (sans bibliothèque) ---------- */
function colIdx(L) { var n = 0; for (var i = 0; i < L.length; i++) n = n * 26 + L.charCodeAt(i) - 64; return n; }
function colLet(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
var crcT = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(u) { var c = 0xFFFFFFFF; for (var i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  var enc = new TextEncoder(), parts = [], cd = [], off = 0;
  var le = function (v, n) { var a = []; for (var i = 0; i < n; i++) { a.push(v & 255); v >>>= 8; } return a; };
  files.forEach(function (f) { var nm = enc.encode(f[0]), d = enc.encode(f[1]), c = crc(d);
    var h = [].concat(le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 4), le(c, 4), le(d.length, 4), le(d.length, 4), le(nm.length, 2), le(0, 2));
    parts.push(new Uint8Array(h), nm, d);
    cd.push(new Uint8Array([].concat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(0, 2), le(0, 4), le(c, 4), le(d.length, 4), le(d.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4))), nm);
    off += h.length + nm.length + d.length; });
  var cdl = cd.reduce(function (t, x) { return t + x.length; }, 0);
  return new Blob(parts.concat(cd, [new Uint8Array([].concat(le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cdl, 4), le(off, 4), le(0, 2)))]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
var X = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); };
function sheet(rows, widths) {
  var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>';
  rows.forEach(function (r, ri) { x += '<row r="' + (ri + 1) + '">'; r.forEach(function (v, ci) { if (v === '' || v == null) return; var ref = colLet(ci + 1) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
    x += typeof v === 'number' && isFinite(v) ? '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>' : '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + X(v) + '</t></is></c>'; }); x += '</row>'; });
  return x + '</sheetData></worksheet>';
}
function xlsx(sheets) {
  var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>';
  var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + X(s[0]) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>';
  var wbr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  var sty = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF23355F"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf></cellXfs></styleSheet>';
  var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  return zip([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wbr], ['xl/styles.xml', sty]].concat(sheets.map(function (s, i) { return ['xl/worksheets/sheet' + (i + 1) + '.xml', sheet(s[1], s[2])]; })));
}
function lignesExcel(R) {
  var nc = HDR.length, rows = [HDR.slice()], rec = [['UG', 'Adresse', 'Ville', 'Date repérage', 'Scénario', 'Travaux prévus', 'Amiante', 'Où', 'Impact travaux', 'Diag complémentaire', 'À faire sonder']];
  R.forEach(function (x) { var r = x.r, row = new Array(nc).fill(''), m = String(r.adr || '').match(/^\s*(\d+\s*(?:bis|ter)?)\s+(.*)$/i);
    row[1] = m ? (isNaN(+m[1]) ? m[1] : +m[1]) : ''; row[2] = m ? m[2] : r.adr || ''; row[3] = r.ville || ''; row[4] = +x.ug || x.ug;
    row[5] = r.compl + (r.items && r.items.length ? ' : ' + r.items.join(' ; ') : ''); row[6] = r.scen ? +r.scen : (r.desc || '');
    Object.keys(r.cols || {}).forEach(function (L) { var i = colIdx(L) - 1; if (i < nc) row[i] = r.cols[L]; });
    var hp = colIdx('HP') - 1; if (hp < nc) row[hp] = (r.am === 'OUI' ? 'AMIANTE : ' + (r.ou || []).join(' ; ') : 'Aucun amiante') + '. Repérage ' + (r.date || '');
    rows.push(row);
    rec.push([+x.ug || x.ug, r.adr || '', r.ville || '', r.date || '', r.scen || '', r.desc || '', r.am, (r.ou || []).join(' ; '), (r.impacts || []).join(' ; '), r.compl, (r.items || []).join(' ; ')]); });
  return { rows: rows, rec: rec };
}
function excel(R) {
  if (!R.length) return T('Aucun diag analysé');
  var o = lignesExcel(R), w = o.rows[0].map(function (h, i) { return i < 7 ? [4, 8, 22, 18, 10, 40, 14][i] : 9; });
  var b = xlsx([['Synt. Logements allégés', o.rows, w], ['Diags complémentaires', o.rec, [10, 26, 18, 12, 9, 40, 9, 40, 50, 12, 70]]]);
  var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'Diags_amiante_' + new Date().toISOString().slice(0, 10) + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- branchement dans l'appli ---------- */
function brancher() {
  if (window.__evDiagamOn) return true;
  if (!hasApp()) return false;
  window.__evDiagamOn = 1;
  routes.diagam = function () { page(); };
  var lg0 = routes.logement; if (lg0) routes.logement = function () { var a = arguments, o = lg0.apply(this, a); try { var ug = (a[0] && a[0][0]) || a[0] || (location.hash.split('/')[2] || '').split('?')[0]; if (Array.isArray(ug)) ug = ug[0]; poserCarte(String(ug)); } catch (e) { console.warn('diagam', e); } return o; };
  var pl0 = routes.plus; if (pl0) routes.plus = function () { var o = pl0.apply(this, arguments); try { if (!Q('#dgaPlus')) Q('#app').insertAdjacentHTML('afterbegin', '<a class="card" id="dgaPlus" href="#/diagam" style="display:flex;gap:10px;align-items:center;text-decoration:none;color:inherit"><span style="font-size:26px">☢️</span><span><b>Diags amiante</b><br><span class="small mut">Analyse des rapports, diags complémentaires, export Excel</span></span></a>'); } catch (e) { } return o; };
  brancherVTE(); surveiller();
  try { var h = location.hash; if (/^#\/(logement|diagam|plus)\b/.test(h) && typeof render === 'function') render(); } catch (e) { }
  return true;
}
/* iPhone : après le sélecteur de fichiers ou le clavier, Safari laisse parfois la barre du bas « flotter » au milieu de l'écran.
   On force Safari à recaler l'affichage (aucun effet ailleurs). */
(function () {
  var recale = function () { setTimeout(function () { try { var y = window.scrollY; window.scrollTo(window.scrollX, y + 1); window.scrollTo(window.scrollX, y); } catch (e) { } }, 60); };
  ['focusout', 'change'].forEach(function (ev) { document.addEventListener(ev, recale, true); });
  window.addEventListener('focus', recale); window.addEventListener('pageshow', recale); document.addEventListener('visibilitychange', function () { if (!document.hidden) recale(); });
  if (window.visualViewport) { var h0 = window.visualViewport.height; window.visualViewport.addEventListener('resize', function () { var h = window.visualViewport.height; if (h > h0 - 2) recale(); h0 = h; }); }
})();
window.EvoludDiag = { analyseFichier: analyseFichier, resOf: resOf, page: page, getPdf: getPdf, carte: carte, poserCarte: poserCarte };
(window.EVX_READY || Promise.resolve()).then(function () { var n = 0; (function t() { if (brancher() || ++n > 120) { setTimeout(menagePdf, 3000); return; } setTimeout(t, 500); })(); });
})();

/* Évolud – ⏱️ délais réels (v1.0) · conçu et développé par Saïd OUFQIR
 * Accueil « Délai en danger » : les jours couverts par une période neutralisée (attente diag client, arrêt double plafond,
 * locataire absent/refus, attente validation du bon de commande…) ne comptent plus comme retard Bouygues.
 * Chaque carte affiche le retard réel + les jours neutralisés avec leurs motifs et dates (preuve face au client).
 * + nouveau motif d'arrêt : « Attente validation bon de commande client ».
 */
(function () {
'use strict';
if (window.__evDelais) return; window.__evDelais = 1;
var iso = function (d) { return d.toISOString().slice(0, 10); };
var moins = function (j, n) { var d = new Date(j + 'T12:00:00'); d.setDate(d.getDate() - n); return iso(d); };
var fr = function (j) { return j ? String(j).slice(0, 10).split('-').reverse().join('/') : ''; };
var jour = function () { try { if (typeof today === 'function') return today(); } catch (e) { } return iso(new Date()); };
function motifs(ug, a, b) {
  var G = []; try { G = window.gelsOf ? gelsOf(ug) : []; } catch (e) { }
  var M = {}; G.forEach(function (g) { if (!g || !g[0]) return; var x = g[0], y = g[1] || b; if (y <= a || x >= b) return; var k = g[2] || 'période neutralisée'; (M[k] = M[k] || []).push(fr(x) + '→' + fr(y)); });
  return Object.keys(M).map(function (k) { return k + ' ' + M[k].join(', '); }).join(' ; ') || 'période neutralisée';
}
function brancherDelais() {
  var R0 = window.EVO_RISQUE; if (!R0) return false; if (R0.__dl) return true;
  var w = function (ug) {
    var r = R0(ug); if (!r || !r.R || typeof window.gelDays !== 'function') return r;
    try {
      var td = jour(), s = r.s, R = [];
      r.R.forEach(function (t) {
        var m = String(t).match(/^(limite de démarrage|fin Gamma) dépassée de (\d+) j/); if (!m) { R.push(t); return; }
        var n = +m[2], a = moins(td, n), gel = Math.min(n, Math.max(0, gelDays(ug, a, td) || 0)), reel = n - gel, pen = /^limite/.test(m[1]) ? ' (pénalités)' : '';
        if (!gel) { R.push(t); return; }
        if (reel <= 0) { s -= 35; R.push(m[1] + ' : ' + n + ' j de retard, tous neutralisés (' + motifs(ug, a, td) + ')'); }
        else R.push(m[1] + ' dépassée de ' + reel + ' j réels' + pen + ' · ' + gel + ' j neutralisés : ' + motifs(ug, a, td));
      });
      r.R = R; r.s = Math.max(0, Math.min(100, s));
    } catch (e) { console.warn('délais réels', e); }
    return r.s ? r : null;
  };
  w.__dl = 1; window.EVO_RISQUE = w; return true;
}
/* motif d'arrêt supplémentaire dans la carte « Arrêt de chantier » de la fiche logement */
var MOTIF = 'Attente validation bon de commande client';
function ajoutMotif() { try { var s = document.getElementById('armo'); if (s && ![].some.call(s.options, function (o) { return o.text === MOTIF; })) { var o = document.createElement('option'); o.text = MOTIF; s.appendChild(o); } } catch (e) { } }
var n = 0; (function t() { var ok = brancherDelais(); if (!ok && ++n < 240) return setTimeout(t, 500); try { if (ok && /^#\/(home)?$/.test(location.hash || '#/home') && typeof render === 'function') render(); } catch (e) { } })();
try { var tm = null; new MutationObserver(function () { if (tm) return; tm = setTimeout(function () { tm = null; ajoutMotif(); }, 300); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { }
})();
