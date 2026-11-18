/* Évolud – cache hors ligne · conçu et développé par Saïd OUFQIR */
const C = 'evolud-v5312-logi', IMG = 'evolud-img';
const FILES = ['./', 'index.html', 'boot.js', 'idx.js', 'data.js.enc', 'lib.js.enc', 'plan.js.enc', 'app.js.enc', 'diags.js.enc', 'charge.js.enc', 'mt.js.enc', 'fin.js.enc', 'opr.js.enc', 'cr.js.enc', 'ajout.js.enc', 'v52.js.enc', 'v53.js.enc', 'v54.js.enc', 'v55.js.enc', 'ops.js.enc', 'pen.js.enc', 'etat.js.enc', 'gam.js.enc', 'pano.js.enc', 'vr.js.enc', 'proteg.js.enc', 'm6.js.enc', 'outils.js.enc', 'guide.js', 'scen.js', 'logi.js', 'logistique.html', 'plans.json.enc', 'plans2.json.enc', 'manifest.json', 'icon-192.png', 'icon-512.png'];  // v5.8.0 : fichiers chiffrés
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => Promise.allSettled(FILES.map(f => c.add(f)))).then(() => self.skipWaiting())); });  // v5.31.3 : un fichier manquant ne bloque plus l'installation
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/img/')) { e.respondWith(caches.open(IMG).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok && !res.redirected && res.type === 'basic') c.put(e.request, res.clone()); return res; })))); return; }
  // v5.8.24 : guide d'utilisation – on ajoute tuto.js à la page principale (index.html)
  const page = e.request.mode === 'navigate' || /\/$|index\.html$/.test(u.pathname);
  const appli = /\/$|index\.html$/.test(u.pathname);   // v5.31.3 : scripts ajoutés seulement à l'appli, pas aux autres pages (logistique.html)
  if (page && !appli) { e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok && !r.redirected && r.type === 'basic') { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then(r => r || Response.error()))); return; }
  if (page) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok && !r.redirected && r.type === 'basic') { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return addTuto(r); }
      return caches.match(e.request).then(m => m ? addTuto(m) : r);
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')).then(r => r ? addTuto(r) : Response.error())));
    return;
  }
  // réseau d'abord en revalidant toujours (mise à jour immédiate), cache si hors ligne
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok && !r.redirected && r.type === 'basic') { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; } return caches.match(e.request).then(m => m || r); })  /* v5.7.3 : on ne met jamais en cache une page de connexion, une redirection ou une erreur */.catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

// Insère guide.js, scen.js et logi.js (bouton Logistique) avant </body> (une seule fois chacun)
function addTuto(r) {
  const ct = r.headers.get('content-type') || '';
  if (ct && !ct.includes('html')) return r;
  return r.text().then(t => {
    ['guide.js', 'scen.js', 'logi.js'].forEach(f => { if (!t.includes(f)) t = t.includes('</body>') ? t.replace('</body>', '<script src="' + f + '"></script></body>') : t + '<script src="' + f + '"></script>'; });   // v5.25.9 : + comparatif scénarios
    const h = new Headers(r.headers); h.set('content-type', 'text/html; charset=utf-8'); h.delete('content-length');
    return new Response(t, { status: 200, headers: h });
  });
}
