/* Évolud – cache hors ligne · conçu et développé par Saïd OUFQIR */
const C = 'evolud-v5814', IMG = 'evolud-img';
const FILES = ['./', 'index.html', 'boot.js', 'idx.js', 'data.js.enc', 'lib.js.enc', 'plan.js.enc', 'app.js.enc', 'diags.js.enc', 'charge.js.enc', 'mt.js.enc', 'fin.js.enc', 'opr.js.enc', 'cr.js.enc', 'ajout.js.enc', 'v52.js.enc', 'v53.js.enc', 'v54.js.enc', 'v55.js.enc', 'ops.js.enc', 'plans.json.enc', 'plans2.json.enc', 'manifest.json', 'icon-192.png', 'icon-512.png'];  // v5.8.0 : fichiers chiffrés
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/img/')) { e.respondWith(caches.open(IMG).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok && !res.redirected && res.type === 'basic') c.put(e.request, res.clone()); return res; })))); return; }
  // réseau d'abord en revalidant toujours (mise à jour immédiate), cache si hors ligne
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok && !r.redirected && r.type === 'basic') { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; } return caches.match(e.request).then(m => m || r); })  /* v5.7.3 : on ne met jamais en cache une page de connexion, une redirection ou une erreur */.catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
