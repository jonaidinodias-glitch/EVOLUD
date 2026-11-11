/* Évolud Chantier – index INSEE lus sur le serveur de l'application (mis à jour seul chaque mois)
   Ne contient aucune donnée du chantier. Conçu et développé par Saïd OUFQIR – v5.8.1 */
(function () {
  'use strict';
  var PAGES = ['oidx', 'osit', 'oloc', 'obal', 'bal'];
  function dernier(j) { var b = j && j.s && j.s.BT01; return b ? Object.keys(b).sort().pop() || '' : ''; }
  function charger() {
    try {
      if (typeof api !== 'function' || typeof cfg !== 'function' || !cfg().url) return;
      api({ action: 'idx' }).then(function (j) {
        if (!j || !j.s || !j.s.BT01) return;
        var cur = window.IDX_AUTO;
        if (cur && dernier(cur) > dernier(j)) return;           // on garde la série la plus récente
        window.IDX_AUTO = j;
        var pg = (location.hash.split('/')[1] || '').split('?')[0];
        if (PAGES.indexOf(pg) >= 0 && typeof render === 'function') render();
      }).catch(function () { /* hors ligne ou serveur indisponible : on garde idx.json */ });
    } catch (e) { }
  }
  (window.EVX_READY || Promise.resolve()).then(function () { setTimeout(charger, 2500); });
})();
