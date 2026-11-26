/**
 * ÉVOLUD CHANTIER — serveur de synchronisation (Google Sheet + Google Drive)
 * Conçu et développé par Saïd OUFQIR. — Version 5 (plan de charge, heures, sécurité, index INSEE automatiques)
 * Version 5.1 : module ERBM (action « erbm », onglet « Erbm » séparé : ne change rien à la synchro de l'appli)
 * Version 5.2 : ERBM – QR codes intervenants (clé intervenant limitée : lire un logement, pointer, déclarer, photo),
 *               téléphones intervenants autorisés automatiquement (blocables dans « Appareils »),
 *               fusion des pointages / tâches / découvertes : rien n'est perdu si conducteur et intervenant écrivent en même temps.
 *               Ne change rien à la synchro de l'appli Évolud.
 * Version 5.3 : ERBM – l'intervenant reçoit les désignations de ses lignes de bon de commande (jamais les prix).
 * Version 5.4 : ERBM – envoi des diags amiante en PDF dans le dossier du logement (Drive).
 * Version 5.6 : plus de blocage « 50000 caractères par cellule » : une fiche trop longue est rangée dans un fichier
 *               du Drive (dossier EVOLUD_Photos_Gamma/_fiches_longues) et la cellule garde un renvoi. Rien ne change pour l'appli.
 * Version 5.5 : ERBM – accès nominatifs (un code personnel par personne) et verrou financier côté serveur :
 *               prix, balance, pénalités, insertion et pilotage financier ne sont envoyés qu'aux personnes
 *               ayant l'accès « chiffres complets » (les autres ne les reçoivent jamais).
 *
 * MISE À JOUR : Apps Script > collez ce fichier à la place de l'ancien > 💾
 *   > Déployer > Gérer les déploiements > ✏️ > Version : « Nouvelle version » > Déployer. L'URL /exec ne change pas.
 * INDEX INSEE : choisir la fonction « installerIndexAuto » > ▶ Exécuter > autoriser.
 *   Index BT / TP récupérés seuls les 16, 20 et 25 de chaque mois (onglet « Index »). Source : Insee, Licence Ouverte Etalab 2.0.
 */
const CLE = 'EVD-K7m2-Q9x4-R8t5-W3p6';
const CLE_QR = 'EVD-QR-zu6OTp1o5bmWSZM8ubuU';   // v5.2 : clé intervenant (QR codes ERBM), droits limités
const QR_AUTO = true;                            // v5.2 : téléphone intervenant autorisé tout seul (bloquer = « bloqué » dans Appareils)
const DOSSIER = 'EVOLUD_Photos_Gamma';
const SIGNATURE = 'Évolud Chantier — conçu et développé par Saïd OUFQIR';
const COLLS = ['logements', 'vtes', 'taches', 'photos', 'users', 'heures', 'plan', 'params', 'securite'];
const TST = { a_planifier: 'À planifier', affectee: 'Affectée', rdv: 'RDV pris', en_cours: 'En cours', terminee: 'Terminée', bloquee: 'Bloquée', gamma: 'Déposée Gamma' };

// colonnes lisibles (la dernière colonne « json » sert à l'appli)
const COLS = {
  taches: [['ug', r => r.ug], ['n°', r => r.n || ''], ['prestation', r => r.prest], ['entreprise', r => r.ent], ['statut', r => TST[r.statut] || r.statut], ['intervenant', r => r.assignee || ''], ['rdv', r => (r.rdv && r.rdv.date) || ''], ['précision', r => r.precision || ''], ['motif', r => r.motif || ''], ['terminée le', r => r.doneAt ? new Date(r.doneAt) : ''], ['gamma le', r => r.gammaAt ? new Date(r.gammaAt) : ''], ['supprimée', r => r.deleted ? 'oui' : '']],
  vtes: [['ug', r => r.ug], ['date', r => r.date || ''], ['validée', r => r.validee ? 'oui' : 'non'], ['locataire', r => (r.loc && r.loc.nom) || ''], ['téléphone', r => (r.loc && r.loc.tel) || ''], ['observations', r => r.obs || '']],
  photos: [['ug', r => r.ug], ['tâche', r => r.tache || ''], ['type', r => r.kind], ['fichier', r => r.name], ['date', r => r.ts ? new Date(r.ts) : ''], ['latitude', r => r.lat || ''], ['longitude', r => r.lng || ''], ['distance logement (m)', r => r.dist == null ? '' : r.dist], ['lien Drive', r => r.url || '']],
  users: [['nom', r => r.nom], ['rôle', r => r.role], ['entreprise', r => r.ent || '']],
  heures: [['date', r => r.date || ''], ['équipe', r => r.equipe || ''], ['lignes', r => (r.lignes || []).map(l => l.ug + ' ' + l.prest + ' ' + l.h + 'h x' + (l.pers || 1)).join(' | ')], ['total h·homme', r => (r.lignes || []).reduce((a, l) => a + (+l.h || 0) * (+l.pers || 1), 0)]],
  plan: [['ug', r => r.ug || ''], ['corps', r => r.pool === 'menu' ? 'Menuiseries' : 'Second œuvre'], ['date', r => r.date || ''], ['équipe', r => r.eq || ''], ['RDV confirmé', r => r.verrou ? 'oui' : 'non'], ['commande', r => r.cmd || ''], ['livraison', r => r.livre || ''], ['libéré', r => r.deleted ? 'oui' : '']],
  params: [['paramètres', r => 'équipes : ' + ((r.v && r.v.equipes) || []).map(t => t.nom + ' (' + t.pers + ')').join(', ')]],
  securite: [['date', r => r.date || ''], ['nom', r => r.nom || ''], ['entreprise', r => r.ent || ''], ['logement', r => r.ug || ''], ['écart', r => r.ecart || ''], ['points', r => r.points || 0], ['commentaire', r => r.comment || ''], ['constaté par', r => r.par || ''], ['supprimé', r => r.deleted ? 'oui' : '']],
  erbm: [['type', r => r.type || ''], ['ug', r => r.ug || ''], ['adresse', r => r.adresse || ''], ['cité', r => r.cite || ''], ['parcours', r => r.parcours || ''], ['étape', r => r.etape || ''], ['montant HT', r => r.montant || ''], ['supprimé', r => r.deleted ? 'oui' : '']],
  logements: [['statut appli', r => (r.data && r.data.statutApp) || ''], ['date VTE', r => (r.data && r.data.vte) || '']]
};

function doGet() { return out({ ok: true, app: SIGNATURE, now: Date.now() }); }
function doPost(e) {
  let b; try { b = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, error: 'requête illisible' }); }
  const tok = String(b.token || ''), qr = tok === CLE_QR;
  if (tok !== CLE && !qr) return out({ ok: false, error: 'clé du chantier incorrecte' });
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return out({ ok: false, error: 'serveur occupé, nouvel essai automatique' });
  try {
    const refus = appareil(b, qr); if (refus) return out(refus);
    if (qr) {   // v5.2 : intervenant (QR) — uniquement ces trois actions
      if (b.action === 'qrget') return out(qrGet(b));
      if (b.action === 'qrput') return out(qrPut(b));
      if (b.action === 'photo') return out(photo(b));
      return out({ ok: false, error: 'action non autorisée pour un intervenant' });
    }
    if (b.action === 'sync') return out(sync(b));
    if (b.action === 'erbm') { const fin = finOk(b); const r = sync(b, ['erbm'], fin); r.qrKey = CLE_QR; r.fin = fin; r.finSet = usersOn(); r.moi = moi(b); return out(r); }   // v5.1 ERBM (+ QR v5.2, verrou financier v5.5)
    if (b.action === 'acces') return out(acces(b));
    if (b.action === 'photo') return out(photo(b));
    if (b.action === 'fiche') return out(fiche(b));
    if (b.action === 'idx') return out(lireIndex(true));
    return out({ ok: false, error: 'action inconnue' });
  } catch (x) { return out({ ok: false, error: String((x && x.message) || x) }); }
  finally { lock.releaseLock(); }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function feuille(c) {
  const ss = SpreadsheetApp.getActive(), nom = c.charAt(0).toUpperCase() + c.slice(1);
  let s = ss.getSheetByName(nom);
  if (!s) {
    s = ss.insertSheet(nom);
    const h = ['id'].concat((COLS[c] || []).map(x => x[0]), ['mis à jour', 'par', 'srv', 'json']);
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
    s.setFrozenRows(1);
  }
  return s;
}
const NC = c => 1 + (COLS[c] || []).length + 4;

function sync(b, liste, fin) {
  liste = liste || COLLS; const erbmFiltre = liste.length === 1 && liste[0] === 'erbm' && fin === false;
  const since = Number(b.since) || 0, now = Date.now(), by = {};
  (b.records || []).forEach(r => { if (liste.indexOf(r.c) >= 0 && r.id && !(erbmFiltre && finEcritInterdite(r.id))) (by[r.c] = by[r.c] || []).push(r); });
  const outR = [];
  liste.forEach(c => {
    const sh = feuille(c), nc = NC(c), n = sh.getLastRow();
    const vals = n > 1 ? sh.getRange(2, 1, n - 1, nc).getValues() : [], idx = {};
    vals.forEach((r, i) => idx[String(r[0])] = i);
    const app = [];
    (by[c] || []).forEach(r => {
      const i = idx[String(r.id)];
      if (i >= 0) {
        let old = {}; try { old = lireCellule(vals[i][nc - 1]); } catch (x) {}
        if ((r.updatedAt || 0) >= (old.updatedAt || 0)) { if (c === 'erbm' && String(r.id).indexOf('L:') === 0) { r = fusionQR(old, r); if (erbmFiltre) r = finGarde(old, r); } vals[i] = ligne(c, r, now); }
      } else if (i === undefined) { idx[String(r.id)] = -1; app.push(ligne(c, r, now)); }
    });
    if (by[c] && by[c].length && vals.length) sh.getRange(2, 1, vals.length, nc).setValues(vals);
    if (app.length) sh.getRange(sh.getLastRow() + 1, 1, app.length, nc).setValues(app);
    const all = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues() : [];
    all.forEach(r => { if (Number(r[nc - 2]) > since) { try { let d = lireCellule(r[nc - 1]); const id = String(r[0]);
      if (erbmFiltre) { if (finPrive(id)) return; d = finRetire(id, d); }
      outR.push({ c, id: id, updatedAt: d.updatedAt || 0, data: d }); } catch (x) {} } });
  });
  return { ok: true, now: now, records: outR };
}
function ligne(c, r, now) {
  const d = r.data || {}; d.id = d.id || r.id; d.updatedAt = r.updatedAt || d.updatedAt || now;
  return [String(r.id)].concat((COLS[c] || []).map(x => { try { return x[1](d); } catch (e) { return ''; } }), [new Date(d.updatedAt), d.by || '', now, ecrireCellule(c, String(r.id), d)]);
}

function dossier(nom, parent) {
  const it = parent ? parent.getFoldersByName(nom) : DriveApp.getFoldersByName(nom);
  return it.hasNext() ? it.next() : (parent ? parent.createFolder(nom) : DriveApp.createFolder(nom));
}
function photo(b) {
  const f = dossier(String(b.ug), dossier(DOSSIER));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) {}
  const ex = f.getFilesByName(b.name);
  const mime = b.mime === 'application/pdf' ? 'application/pdf' : 'image/jpeg';   // v5.4 : PDF des diags
  const file = ex.hasNext() ? ex.next() : f.createFile(Utilities.newBlob(Utilities.base64Decode(b.b64), mime, b.name));
  const m = b.meta || {};
  try { file.setDescription([SIGNATURE, 'UG ' + b.ug + ' – ' + (m.adresse || ''), b.kind + ' – ' + new Date(m.ts || Date.now()).toLocaleString('fr-FR'), m.lat ? 'GPS ' + m.lat + ', ' + m.lng + ' (±' + m.acc + ' m)' : 'sans GPS', m.comment || ''].join('\n')); } catch (x) {}
  return { ok: true, url: file.getUrl(), fileId: file.getId(), folderUrl: f.getUrl() };
}
function fiche(b) {
  const ug = String(b.ug), T = lire('taches').filter(t => t.ug === ug && !t.deleted), P = lire('photos').filter(p => p.ug === ug && !p.deleted);
  const e = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = '<html><body style="font-family:Arial;font-size:11px"><h2 style="color:#1F3864">Fiche travaux – UG ' + e(ug) + '</h2><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%"><tr style="background:#1F3864;color:#fff"><th>N°</th><th>Prestation</th><th>Entreprise</th><th>Statut</th><th>Précision</th><th>Photos</th></tr>' +
    T.map(t => '<tr><td>' + e(t.n || '') + '</td><td>' + e(t.prest) + '</td><td>' + e(t.ent) + '</td><td>' + e(TST[t.statut] || t.statut) + '</td><td>' + e(t.precision || '') + '</td><td>' + P.filter(p => p.tache === t.id).map(p => e(p.kind) + ' ' + e(p.name)).join('<br>') + '</td></tr>').join('') +
    '</table><p style="color:#888;font-size:9px">' + e(SIGNATURE) + ' · ' + new Date().toLocaleString('fr-FR') + '</p></body></html>';
  const pdf = Utilities.newBlob(html, 'text/html', 'f.html').getAs('application/pdf').setName('Fiche_' + ug + '.pdf');
  const f = dossier(ug, dossier(DOSSIER)).createFile(pdf);
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) {}
  return { ok: true, url: f.getUrl() };
}
// =====================================================================================
// v5.6 — fiches trop longues (> 50 000 caractères, limite d'une cellule Google Sheets) – conçu par Saïd OUFQIR
// La fiche complète est rangée dans un fichier JSON du Drive ; la cellule garde un renvoi { __f, id, updatedAt }.
// =====================================================================================
const MAX_CELLULE = 45000;
const _F = {};   // mémoire pendant une requête : id de fichier → texte
function dossierLongues() { return dossier('_fiches_longues', dossier(DOSSIER)); }
function ecrireCellule(c, id, d) {
  const s = JSON.stringify(d);
  if (s.length <= MAX_CELLULE) return s;
  const nom = (c + '_' + id).replace(/[^\w.-]+/g, '_') + '.json', f = dossierLongues(), ex = f.getFilesByName(nom);
  const file = ex.hasNext() ? ex.next() : f.createFile(nom, '', 'application/json');
  file.setContent(s); _F[file.getId()] = s;
  return JSON.stringify({ __f: file.getId(), id: d.id, updatedAt: d.updatedAt || 0, by: d.by || '', taille: s.length });
}
function lireCellule(s) {
  const o = JSON.parse(s);
  if (!o || !o.__f) return o;
  const t = _F[o.__f] || (_F[o.__f] = DriveApp.getFileById(o.__f).getBlob().getDataAsString('UTF-8'));
  return JSON.parse(t);
}
function lire(c) { const sh = feuille(c), nc = NC(c), n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, nc).getValues().map(r => { try { return lireCellule(r[nc - 1]); } catch (x) { return null; } }).filter(Boolean); }

// =====================================================================================
// INDEX INSEE (BT / TP) – mise à jour automatique mensuelle – conçu par Saïd OUFQIR
// Source 1 : service web SDMX officiel de l'Insee (bdm.insee.fr). Source 2 (secours) : DBnomics.
// =====================================================================================
const IDX_DEBUT = '2018-01';
const IDX_CODE = /\b((?:BT|TP)\d{2}[a-z]?)\b/i;

function installerIndexAuto() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'majIndices').forEach(t => ScriptApp.deleteTrigger(t));
  [16, 20, 25].forEach(j => ScriptApp.newTrigger('majIndices').timeBased().onMonthDay(j).atHour(7).create());
  const r = majIndices();
  Logger.log('Automatique installé (16, 20 et 25 du mois). ' + r);
  return r;
}

function idxGet(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'EvoludChantier/1.0' } });
      if (r.getResponseCode() === 200) return r.getContentText();
      Logger.log('HTTP ' + r.getResponseCode() + ' : ' + url);
    } catch (e) { Logger.log('Échec ' + (i + 1) + ' : ' + e + ' : ' + url); }
    Utilities.sleep(3000 * (i + 1));
  }
  return null;
}

function majIndices() {
  const best = {};
  const garder = (code, vals, src, titre) => {
    const ks = Object.keys(vals); if (!ks.length) return;
    code = code.toUpperCase(); const last = ks.sort().pop(), cur = best[code];
    if (!cur || last > cur.last || (last === cur.last && ks.length > Object.keys(cur.v).length)) best[code] = { last, v: vals, src, titre };
  };
  const attrs = t => { const o = {}; let m; const re = /([\w:]+)="([^"]*)"/g; while ((m = re.exec(t))) o[m[1].replace(/^\w+:/, '')] = m[2]; return o; };
  const lireSdmx = (xml, src) => {
    let m; const re = /<(?:\w+:)?Series\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Series>/g;
    while ((m = re.exec(xml))) {
      const a = attrs(m[1]); if (a.FREQ && a.FREQ !== 'M') continue;
      const titre = a.TITLE_FR || a.TITLE_EN || ''; if (/arr[êe]t[ée]e|stopped/i.test(titre)) continue;
      const c = IDX_CODE.exec(titre) || IDX_CODE.exec(Object.keys(a).map(k => a[k]).join(' ')); if (!c) continue;
      const vals = {}; let o; const ro = /<(?:\w+:)?Obs\b([^>]*)\/?>/g;
      while ((o = ro.exec(m[2]))) { const b = attrs(o[1]); if (b.TIME_PERIOD >= IDX_DEBUT && b.OBS_VALUE && b.OBS_VALUE !== 'NaN') vals[b.TIME_PERIOD] = +b.OBS_VALUE; }
      garder(c[1], vals, src, titre);
    }
  };
  const BASE = 'https://bdm.insee.fr/series/sdmx';
  const df = idxGet(BASE + '/dataflow');
  if (df) {
    const flows = []; let m; const re = /<(?:\w+:)?Dataflow\b[^>]*\bid="([^"]+)"/g;
    while ((m = re.exec(df))) if (m[1].indexOf('BT-TP') >= 0 && m[1].indexOf('ANCIENNE') < 0) flows.push(m[1]);
    flows.forEach(f => ['BT', 'TP'].forEach(fam => {
      for (const key of ['M.' + fam + '..INDICE.FE.SO.BRUT.2010.SO', 'M.' + fam + '........']) {
        const x = idxGet(BASE + '/data/' + f + '/' + key + '?startPeriod=' + IDX_DEBUT);
        if (x) { lireSdmx(x, 'Insee ' + f); break; }
      }
    }));
    if (!best.BT01) { const x = idxGet(BASE + '/data/SERIES_BDM/001710986?startPeriod=' + IDX_DEBUT); if (x) lireSdmx(x, 'Insee idbank 001710986'); }
  }
  const DBN = 'https://api.db.nomics.world/v22/series/INSEE';
  let codes = [];
  try { const j = JSON.parse(idxGet(DBN + '?limit=1000&offset=0') || '{}'); codes = ((j.datasets || {}).docs || []).map(d => d.code).filter(c => c.indexOf('BT-TP') >= 0 && c.indexOf('ANCIENNE') < 0); } catch (e) {}
  if (!codes.length) codes = ['INDEX-BT-TP-DIV-IM-2010'];
  codes.forEach(c => {
    let off = 0;
    for (let tour = 0; tour < 10; tour++) {
      let j; try { j = JSON.parse(idxGet(DBN + '/' + c + '?observations=1&limit=500&offset=' + off) || 'null'); } catch (e) { j = null; }
      if (!j) break;
      const docs = (j.series || {}).docs || [];
      docs.forEach(d => {
        const sc = d.series_code || '', name = d.series_name || '';
        if (sc.indexOf('M.') !== 0 || /stopped|arr[êe]t/i.test(name)) return;
        const p = sc.split('.'); const code = p[2] && /^(BT|TP)\d{2}[a-z]?$/i.test(p[2]) ? p[2] : ((IDX_CODE.exec(name) || [])[1]);
        if (!code) return;
        const vals = {}; (d.period || []).forEach((per, i) => { const v = (d.value || [])[i]; if (per >= IDX_DEBUT && v !== null && v !== 'NA' && v !== '') vals[per] = +v; });
        garder(code, vals, 'DBnomics ' + c, name);
      });
      off += docs.length;
      if (!docs.length || off >= ((j.series || {}).num_found || 0)) break;
    }
  });
  if (!best.BT01) { Logger.log('BT01 introuvable : onglet Index non modifié'); return 'échec : BT01 introuvable (Insee et DBnomics injoignables)'; }
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName('Index');
  if (!sh) sh = ss.insertSheet('Index');
  sh.clear();
  const rows = [['code', 'dernier mois', 'dernière valeur', 'source', 'mis à jour', 'json']];
  Object.keys(best).sort().forEach(k => { const b = best[k]; rows.push([k, b.last, b.v[b.last], b.src, new Date(), JSON.stringify(b.v)]); });
  sh.getRange(1, 1, rows.length, 6).setValues(rows);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF'); sh.setFrozenRows(1);
  sh.getRange(rows.length + 2, 1).setValue('Source : Insee (Licence Ouverte Etalab 2.0) – ' + SIGNATURE);
  const r = Object.keys(best).length + ' index enregistrés ; BT01 ' + best.BT01.last + ' = ' + best.BT01.v[best.BT01.last] + ' (' + best.BT01.src + ')';
  Logger.log(r); return r;
}

function lireIndex(auto) {
  const sh = SpreadsheetApp.getActive().getSheetByName('Index');
  const vieux = !sh || sh.getLastRow() < 2 || (Date.now() - new Date(sh.getRange(2, 5).getValue()).getTime()) > 35 * 864e5;
  if (auto && vieux) { try { majIndices(); } catch (e) { Logger.log(e); } }
  const s2 = SpreadsheetApp.getActive().getSheetByName('Index');
  if (!s2 || s2.getLastRow() < 2) return { ok: false, error: 'index pas encore disponibles' };
  const v = s2.getRange(2, 1, s2.getLastRow() - 1, 6).getValues().filter(r => r[0] && r[5]), s = {}, info = {};
  v.forEach(r => { try { s[r[0]] = JSON.parse(r[5]); info[r[0]] = { dernier: r[1], src: r[3] }; } catch (e) {} });
  const maj = v.length ? Utilities.formatDate(new Date(v[0][4]), 'Europe/Paris', 'yyyy-MM-dd') : '';
  return { ok: true, maj: maj, src: 'Insee / DBnomics', s: s, info: info };
}
const VERROU = true;
function appareil(b, qr) {
  if (!VERROU) return null;
  const id = String(b.device || ''); if (!id) return { ok: false, error: 'Téléphone non autorisé (identifiant manquant)' };
  const ss = SpreadsheetApp.getActive(); let sh = ss.getSheetByName('Appareils');
  if (!sh) { sh = ss.insertSheet('Appareils'); sh.getRange(1, 1, 1, 6).setValues([['appareil', 'code', 'utilisateur', 'autorisé', 'première demande', 'dernière connexion']]).setFontWeight('bold'); sh.setFrozenRows(1); }
  const code = id.slice(-6).toUpperCase(), n = sh.getLastRow(), v = n > 1 ? sh.getRange(2, 1, n - 1, 6).getValues() : [];
  const i = v.findIndex(r => String(r[0]) === id), user = (qr ? '[QR intervenant] ' : '') + String(b.user || '');
  if (i < 0) {
    if (qr && QR_AUTO) { sh.appendRow([id, code, user, 'oui', new Date(), new Date()]); return null; }
    sh.appendRow([id, code, user, 'non', new Date(), '']); return { ok: false, error: 'Téléphone non autorisé : donnez le code ' + code + ' à Saïd OUFQIR' };
  }
  const st = String(v[i][3]).toLowerCase().trim(), row = i + 2;
  if (user && user !== v[i][2]) sh.getRange(row, 3).setValue(user);
  if (st === 'oui') { const last = v[i][5] ? new Date(v[i][5]).getTime() : 0; if (Date.now() - last > 6 * 3600e3) sh.getRange(row, 6).setValue(new Date()); return null; }
  if (st.indexOf('bloq') === 0) return { ok: false, error: 'Téléphone bloqué par Saïd OUFQIR : accès retiré' };
  return { ok: false, error: 'Téléphone non autorisé : donnez le code ' + code + ' à Saïd OUFQIR' };
}
// =====================================================================================
// v5.2 — ERBM : QR codes intervenants — conçu et développé par Saïd OUFQIR
// L'intervenant ne voit qu'UN logement, sans locataire, sans prix, sans balance ni concessionnaires.
// Il ne peut que : pointer arrivée / départ, déclarer ses tâches (photo obligatoire pour « terminé »), signaler une découverte.
// =====================================================================================
function qrLire(lid) {
  const sh = feuille('erbm'), nc = NC('erbm'), n = sh.getLastRow();
  if (!lid || n < 2) return null;
  const v = sh.getRange(2, 1, n - 1, nc).getValues(), i = v.findIndex(r => String(r[0]) === 'L:' + lid);
  if (i < 0) return null;
  let d; try { d = lireCellule(v[i][nc - 1]); } catch (x) { return null; }
  if (!d || d.deleted || !d.v) return null;
  return { sh: sh, row: i + 2, nc: nc, d: d };
}
function qrPropre(v) {
  const x = JSON.parse(JSON.stringify(v || {}));
  x.loc = { note: (x.loc && x.loc.note) || '' };
  ['bal', 'cn', 'journal', 'dalux', 'tir'].forEach(k => delete x[k]);
  (x.ft || []).forEach(f => { delete f.p; });
  (x.prov || []).forEach(f => { delete f.p; });
  return x;
}
// v5.3 : les lignes de bon de commande ne stockent que code + quantité ; on ajoute désignation, unité et corps d'état (sans prix)
function qrVue(v) {
  const x = qrPropre(v);
  if (!(x.ft || []).some(f => f.bdc)) return x;
  const sh = feuille('erbm'), nc = NC('erbm'), n = sh.getLastRow(), m = {};
  if (n > 1) sh.getRange(2, 1, n - 1, nc).getValues().forEach(r => { if (String(r[0]).indexOf('B:') !== 0) return; try { (lireCellule(r[nc - 1]).v || []).forEach(b => { if (b && b.c) m[b.c] = b; }); } catch (e) {} });
  x.ft.forEach(f => { const b = m[f.c]; if (f.bdc && b) { f.d = b.d; f.u = b.u; f.lot = f.lot || b.lot; } delete f.p; });
  return x;
}
function qrCfg() {
  const sh = feuille('erbm'), nc = NC('erbm'), n = sh.getLastRow();
  if (n < 2) return {};
  const v = sh.getRange(2, 1, n - 1, nc).getValues(), r = v.find(x => String(x[0]) === 'C:cfg');
  try { return r ? (lireCellule(r[nc - 1]).v || {}) : {}; } catch (x) { return {}; }
}
function qrGet(b) {
  const L = qrLire(String(b.l || ''));
  if (!L) return { ok: false, error: 'Logement introuvable : QR code périmé ou logement supprimé' };
  return { ok: true, now: Date.now(), l: qrVue(finRetire('L:x', L.d).v), u: L.d.updatedAt || 0, cfg: qrCfg() };
}
function qrPut(b) {
  const L = qrLire(String(b.l || ''));
  if (!L) return { ok: false, error: 'Logement introuvable' };
  const d = L.d, v = d.v, o = b.op || {}, now = new Date().toISOString(), jour = now.slice(0, 10);
  const who = String(o.n || '').trim().slice(0, 60), ent = String(o.e || '').trim().slice(0, 60);
  if (!who) return { ok: false, error: 'Nom de l\'intervenant manquant' };
  const journal = t => { v.journal = (v.journal || []).concat([{ d: jour, t: t + ' (' + who + (ent ? ' · ' + ent : '') + ', QR)' }]); };
  const present = () => (v.pt || []).some(p => p.n === who && !p.out && String(p.in || '').slice(0, 10) === jour);
  if (o.op === 'in') {
    if (present()) return { ok: false, error: 'Déjà pointé dans ce logement' };
    v.pt = (v.pt || []).concat([{ id: Utilities.getUuid().slice(0, 12), n: who, e: ent, m: String(o.m || '').slice(0, 40), in: now, gps: o.gps || null }]).slice(-300);
  } else if (o.op === 'out') {
    const pt = v.pt || []; let ok = false;
    for (let i = pt.length - 1; i >= 0; i--) if (pt[i].n === who && !pt[i].out) { pt[i].out = now; pt[i].gpsOut = o.gps || null; ok = true; break; }
    if (!ok) return { ok: false, error: 'Aucune arrivée pointée' };
    v.pt = pt;
  } else if (o.op === 'tk') {
    if (!present()) return { ok: false, error: 'Pointez d\'abord votre arrivée' };
    if (['go', 'ok'].indexOf(o.st) < 0 || !/^[a-z0-9_]{2,20}$/.test(String(o.tid || ''))) return { ok: false, error: 'Déclaration refusée' };
    if (o.st === 'ok' && !o.ph) return { ok: false, error: 'Photo obligatoire pour déclarer « terminé »' };
    v.tk = v.tk || {}; const c = v.tk[o.tid] || { st: 'todo' };
    if (c.st === 'ok' || c.st === 'np') return { ok: false, error: 'Tâche déjà close' };
    v.tk[o.tid] = Object.assign({}, c, { st: o.st, by: who, ent: ent, at: now, upd: jour, ph: o.ph ? (c.ph || []).concat([String(o.ph)]) : (c.ph || []) });
    journal(String(o.lib || o.tid).slice(0, 80) + ' : ' + (o.st === 'ok' ? 'Terminé' : 'En cours'));
  } else if (o.op === 'dec') {
    if (!present()) return { ok: false, error: 'Pointez d\'abord votre arrivée' };
    const x = o.dec || {};
    if (!x.txt || !(x.ph || []).length) return { ok: false, error: 'Constat et photo obligatoires' };
    const dec = { id: String(x.id || Utilities.getUuid()).slice(0, 40), cat: String(x.cat || 'Autre').slice(0, 80), txt: String(x.txt).slice(0, 500), grav: String(x.grav || 'À chiffrer').slice(0, 40), st: 'Ouverte', ph: (x.ph || []).slice(0, 10), date: jour, at: now, by: who + (ent ? ' (' + ent + ')' : '') };
    v.dec = (v.dec || []).concat([dec]);
    journal('Découverte : ' + dec.cat + ' — ' + dec.txt);
  } else return { ok: false, error: 'Opération inconnue' };
  d.v = v; d.updatedAt = (d.updatedAt || 0) + 1; d.by = who + ' (QR)';
  L.sh.getRange(L.row, 1, 1, L.nc).setValues([ligne('erbm', { id: 'L:' + b.l, updatedAt: d.updatedAt, data: d }, Date.now())]);
  return { ok: true, l: qrVue(finRetire('L:x', { v: v }).v), u: d.updatedAt };
}
// fusion : quand l'appli du conducteur renvoie un logement, on garde les pointages / tâches / découvertes saisis entre-temps par QR
function fusionQR(old, r) {
  try {
    const a = (old && old.v) || {}, d = r.data || {}, b = d.v;
    if (!b || d.deleted) return r;
    const avant = JSON.stringify([b.pt, b.tk, b.dec, b.journal]);
    const parId = (x, y, pick) => { const m = {}, ord = []; (x || []).forEach(e => { if (e && e.id) { m[e.id] = e; ord.push(e.id); } }); (y || []).forEach(e => { if (e && e.id) { if (!m[e.id]) ord.push(e.id); m[e.id] = m[e.id] ? pick(m[e.id], e) : e; } }); return ord.map(k => m[k]); };
    b.pt = parId(a.pt, b.pt, (s, n) => n.out ? n : (s.out ? s : n)).sort((x, y) => String(x.in).localeCompare(String(y.in))).slice(-300);
    b.dec = parId(a.dec, b.dec, (s, n) => n);
    const tk = Object.assign({}, a.tk || {}); Object.keys(b.tk || {}).forEach(k => { const s = tk[k], n = b.tk[k]; if (!s || String(n.at || '') >= String(s.at || '')) tk[k] = n; }); b.tk = tk;
    const vu = {}; (b.journal || []).forEach(j => vu[j.d + '|' + j.t] = 1);
    b.journal = (b.journal || []).concat((a.journal || []).filter(j => !vu[j.d + '|' + j.t])).sort((x, y) => String(x.d).localeCompare(String(y.d)));
    if (JSON.stringify([b.pt, b.tk, b.dec, b.journal]) !== avant) { r.updatedAt = (r.updatedAt || 0) + 1; d.updatedAt = r.updatedAt; }
    return r;
  } catch (e) { return r; }
}

// ============================================================================================
// v5.5 — VERROU FINANCIER ERBM (conçu par Saïd OUFQIR)
// Le code n'est jamais stocké en clair : seule son empreinte SHA-256 est gardée dans les propriétés du script.
// Sans le code, un téléphone ne reçoit ni prix, ni balance, ni pénalités, ni insertion, ni pilotage financier,
// et ce qu'il renvoie ne peut pas effacer ces données (elles sont reprises de la version stockée).
// ============================================================================================
const FIN_PRIVE = ['C:ins', 'C:pen', 'C:fin'];
const FIN_TABLEAUX = ['ft', 'bal', 'prov', 'chk'];
const FIN_CHAMPS = ['p', 'pu', 'mt', 'prix', 'montant'];
// Comptes : propriété ERBM_USERS = { empreinte SHA-256 du code : { n: nom, r: 'admin' | 'fin' | 'ope' } }
const RO = { admin: 'Administrateur (tout)', fin: 'Chiffres complets', ope: 'Opérationnel (sans chiffres)' };
function users() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('ERBM_USERS') || '{}'); } catch (x) { return {}; } }
function usersSave(u) { PropertiesService.getScriptProperties().setProperty('ERBM_USERS', JSON.stringify(u)); }
function usersOn() { return Object.keys(users()).length > 0; }
function moi(b) { const u = users()[String(b.finH || '')]; return u ? { n: u.n, r: u.r } : null; }
function finOk(b) { if (!usersOn()) return true; const m = moi(b); return !!m && (m.r === 'admin' || m.r === 'fin'); }   // tant qu'aucun compte n'existe, rien ne change
function acces(b) {
  const U = users(), me = moi(b), op = String(b.op || ''), hx = h => /^[0-9a-f]{64}$/.test(String(h || ''));
  if (op === 'whoami') return { ok: true, moi: me, on: usersOn() };
  if (op === 'init') { if (usersOn()) return { ok: false, error: 'les accès sont déjà créés' }; if (!hx(b.h)) return { ok: false, error: 'code invalide' }; U[b.h] = { n: String(b.n || 'Administrateur').slice(0, 60), r: 'admin' }; usersSave(U); return { ok: true, moi: U[b.h] }; }
  if (op === 'moncode') { if (!me) return { ok: false, error: 'code actuel incorrect' }; if (!hx(b.h) || U[b.h]) return { ok: false, error: 'nouveau code invalide ou déjà utilisé' }; U[b.h] = U[b.finH]; delete U[b.finH]; usersSave(U); return { ok: true }; }
  if (!me || me.r !== 'admin') return { ok: false, error: 'réservé à l\'administrateur' };
  if (op === 'liste') return { ok: true, liste: Object.keys(U).map(h => ({ id: h.slice(0, 10), n: U[h].n, r: U[h].r, moi: h === b.finH })) };
  if (op === 'ajout') { if (!hx(b.h) || U[b.h]) return { ok: false, error: 'code invalide ou déjà utilisé par quelqu\'un' }; if (!RO[b.r]) return { ok: false, error: 'rôle inconnu' }; U[b.h] = { n: String(b.n || '').slice(0, 60), r: b.r }; usersSave(U); return { ok: true }; }
  if (op === 'role' || op === 'suppr') { const h = Object.keys(U).find(x => x.slice(0, 10) === String(b.id || '')); if (!h) return { ok: false, error: 'compte introuvable' }; if (h === b.finH) return { ok: false, error: 'impossible sur votre propre compte' }; if (op === 'suppr') delete U[h]; else { if (!RO[b.r]) return { ok: false, error: 'rôle inconnu' }; U[h].r = b.r; } usersSave(U); return { ok: true }; }
  return { ok: false, error: 'opération inconnue' };
}
function finPrive(id) { id = String(id); return FIN_PRIVE.indexOf(id) >= 0; }
function finEcritInterdite(id) { id = String(id); return FIN_PRIVE.indexOf(id) >= 0 || id.indexOf('B:') === 0; }
function finTexte(t) { return String(t || '').replace(/≈?\s?[\d   .,]+\s?(k€|€)(\s?HT)?/g, '••• €'); }
function finRetire(id, d) {
  d = JSON.parse(JSON.stringify(d)); id = String(id);
  if (id.indexOf('B:') === 0) { d.v = (d.v || []).map(x => { const y = Object.assign({}, x); delete y.p; return y; }); return d; }
  if (id.indexOf('L:') !== 0) return d;
  delete d.montant; const v = d.v || {};
  FIN_TABLEAUX.forEach(k => { if (Array.isArray(v[k])) v[k] = v[k].map(x => { const y = Object.assign({}, x); FIN_CHAMPS.forEach(f => delete y[f]); return y; }); });
  if (v.diag && Array.isArray(v.diag.ana)) v.diag.ana = v.diag.ana.map(a => { const y = Object.assign({}, a); delete y.mt; y.t = finTexte(y.t); return y; });
  (v.dec || []).forEach(x => FIN_CHAMPS.forEach(f => delete x[f]));
  return d;
}
function finGarde(old, r) {
  const o = (old && old.v) || {}, n = (r.data && r.data.v) || {};
  FIN_TABLEAUX.forEach(k => {
    const A = Array.isArray(o[k]) ? o[k] : [];
    if (Array.isArray(n[k])) n[k] = n[k].map((x, i) => { const src = (x && x.id && A.find(y => y && y.id === x.id)) || A[i]; if (!src) return x; const y = Object.assign({}, x); FIN_CHAMPS.forEach(f => { if (y[f] === undefined && src[f] !== undefined) y[f] = src[f]; }); return y; });
  });
  if (o.diag && o.diag.ana && n.diag) n.diag.ana = o.diag.ana;
  (n.dec || []).forEach((x, i) => { const src = (o.dec || []).find(y => y && y.id === x.id) || (o.dec || [])[i]; if (src) FIN_CHAMPS.forEach(f => { if (x[f] === undefined && src[f] !== undefined) x[f] = src[f]; }); });
  if (r.data && old && old.montant !== undefined) r.data.montant = old.montant;
  return r;
}
