/* Évolud Chantier – Guide d'utilisation intégré · conçu et développé par Saïd OUFQIR
   Module autonome : s'ajoute à l'appli sans toucher aux autres modules.
   - Bouton « ? » flottant (au-dessus de la barre du bas)
   - Guide complet par rubrique, filtrable par rôle + recherche
   - Visite guidée qui met en surbrillance les onglets de la barre du bas
   - Proposé automatiquement à la 1re ouverture
   API : window.EvoludTuto.open(), .open('taches'), .tour(), .reset()
*/
(function () {
  'use strict';
  if (window.EvoludTuto) return;

  var VERSION = 'tuto-2.0';
  var KEY_SEEN = 'evolud_tuto_seen_v1';

  /* ---------- Stockage local sécurisé (peut échouer selon le navigateur) ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sans effet */ } }

  /* ---------- Contenu du guide ---------- */
  // roles : o = ouvrier / équipe, c = chef de chantier, k = conducteur, d = direction
  var SECTIONS = [
    {
      id: 'debut', ico: '🚀', titre: 'Premiers pas', roles: 'ockd',
      blocs: [
        ['Se connecter', [
          'Ouvre le lien d\'installation reçu par mail ou SMS (il contient la clé de l\'appli : ne le transfère à personne).',
          'Saisis ton identifiant et ton code personnel.',
          'Ton rôle (équipe, chef, conducteur, direction) décide de ce que tu vois.'
        ]],
        ['Installer l\'appli sur le téléphone', [
          'iPhone (Safari) : bouton Partager ⬆️ → « Sur l\'écran d\'accueil ».',
          'Android (Chrome) : menu ⋮ → « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».',
          'Ouvre ensuite toujours l\'appli depuis l\'icône Évolud.'
        ]],
        ['Synchronisation', [
          'En haut à droite : « ✓ date heure » = tout est envoyé au serveur.',
          '« 1 en attente » (ou plus) = des saisies ne sont pas encore parties : garde du réseau, elles partiront seules.',
          'Le bouton ⟳ force la synchro tout de suite.',
          'Sans réseau, tu peux continuer à travailler : tout part au retour du réseau.'
        ]]
      ]
    },
    {
      id: 'nav', ico: '🧭', titre: 'Naviguer dans l\'appli', roles: 'ockd',
      blocs: [
        ['La barre du bas', [
          '🏠 Accueil : le tableau de bord du chantier.',
          '🏘️ Logements : la liste des logements, les VTE, les plans.',
          '🛠️ Tâches : les tâches à faire, par équipe.',
          '📤 Gamma : ce qui est prêt à déposer sur Gamma.',
          '💶 Balance : finances, facturable, pénalités.',
          '☰ Plus : tous les autres outils (heures, sécurité, plan de charge, CR, paramètres…).'
        ]],
        ['En haut de l\'écran', [
          '‹ Retour : revient à l\'écran précédent.',
          'Le titre indique où tu es.',
          '⟳ : synchroniser.'
        ]],
        ['Astuce', [
          'Un numéro de logement (UG) souligné est cliquable : il ouvre la fiche du logement.',
          'Les tableaux larges se font glisser vers la gauche pour voir les colonnes cachées.'
        ]]
      ]
    },
    {
      id: 'accueil', ico: '🏠', titre: 'Accueil – tableau de bord', roles: 'ckd',
      blocs: [
        ['📊 État complet du chantier', [
          'Gros bouton bleu en haut de l\'Accueil : tous les indicateurs en un écran.',
          'Avancement (VTE, travaux, VTS par étape et par chantier), montants facturables / facturés / reste à facturer, pénalités, délais dépassés (côté Bouygues et bloqués client), diags, menuiseries à poser, réserves, tâches.',
          'Boutons Excel complet et PDF direction. Aucune saisie : tout est calculé automatiquement.'
        ]],
        ['À quoi ça sert', [
          'Voir en un coup d\'œil l\'avancement : VTE faites, travaux en cours, VTS, retards.',
          'Chaque chiffre ou carte cliquable ouvre la liste des logements concernés.'
        ]]
      ]
    },
    {
      id: 'logements', ico: '🏘️', titre: 'Logements et VTE', roles: 'ckd',
      blocs: [
        ['Trouver un logement', [
          'Onglet Logements → tape l\'UG, l\'adresse ou la cité dans la recherche.',
          'Évolud 1 et Évolud 2 sont séparés : choisis le bon chantier.'
        ]],
        ['Faire une VTE', [
          'Ouvre le logement → VTE.',
          'Touche le plan à l\'endroit voulu pour poser un point : choisis la prestation (trappe, garde-corps, menuiserie…) et l\'intervenant.',
          'Coche les prestations, ajoute une photo à côté de chaque poste si besoin.',
          'Renseigne les quantités réelles relevées sur place.',
          'Prise de cotes menuiseries : ajoute chaque menuiserie (L × H, sens, vitrage, volet, entrée d\'air).',
          'Valide la VTE : la fiche travaux et les tâches sont créées automatiquement.'
        ]],
        ['🌐 Visite 360° des pièces', [
          'Logement ou VTE → bouton « 🌐 Visite 360° des pièces ».',
          'Choisis la pièce, touche « 📷 Ajouter » et prends la photo en mode PANO de l\'appareil photo (tourner lentement sur soi-même), ou une photo grand angle.',
          'Glisse le doigt pour tourner dans la pièce. « ➕ Point de travaux » puis touche l\'endroit : la tâche est créée et affectée.',
          '📍 place la pièce sur le plan. « 📷 Nouveau passage » garde l\'historique daté (avant / pendant / après).',
          '⛶ Plein écran : fonctionne aussi dans le navigateur d\'un casque Meta Quest.'
        ]],
        ['🧊 Maquette 3D, VR et réalité mixte', [
          'Logement → « 🧊 Maquette 3D · 🥽 VR / réalité mixte ».',
          'Importer un scan 3D (iPhone Pro + appli de scan, export GLB sans compression) ou une maquette du bâtiment (Revit, SketchUp… en GLB).',
          '🔄 Vue d\'ensemble / 🚶 Visite à hauteur d\'homme, 📏 Mesurer (2 points), ➕ Point de travaux : touche le mur ou le plafond, la tâche est créée.',
          'Dans le navigateur du casque Meta Quest : « 🥽 Visiter en VR » (joystick gauche pour avancer), « 🥽 Réalité mixte » (maquette posée sur le réel, joystick pour la tourner).',
          '« 🥽 Poser des travaux dans le réel » : gâchette pour poser un point sur le vrai mur ; en sortant du casque, on choisit les travaux de chaque point. Toujours à l\'arrêt, jamais en circulation sur chantier.',
          'Chaque point : priorité P1/P2/P3, coût estimé, description et photo.',
          'Vue Direction 3D sous la maquette : compteurs (points, coût, P1, % terminés), filtres par corps d\'état, liste cliquable qui amène la caméra sur le point, ▶ mode présentation automatique, rapport Excel et JSON.',
          'Formats acceptés : GLB et OBJ. La maquette reste sur l\'appareil qui l\'a importée ; les tâches sont partagées avec toute l\'équipe.'
        ]],
        ['Modifier une VTE déjà validée', [
          'Rouvre la VTE, modifie le poste et appuie sur le bouton d\'enregistrement à côté de ce poste.'
        ]],
        ['Double plafond / attente diag / locataire absent', [
          'Déclare-le tout de suite dans le logement, avec photo ou vidéo.',
          'C\'est ce qui arrête le compteur de pénalités : sans déclaration, le retard est compté contre nous.'
        ]]
      ]
    },
    {
      id: 'taches', ico: '🛠️', titre: 'Tâches et photos', roles: 'ock',
      blocs: [
        ['Voir mes tâches', [
          'Onglet Tâches : la liste des tâches affectées à ton équipe.',
          'Touche une tâche pour voir le logement, l\'emplacement sur le plan et ce qu\'il faut faire.'
        ]],
        ['Photos avant / pendant / après', [
          'Dans la tâche, prends les photos avec les boutons Avant, Pendant, Après.',
          'La position GPS est ajoutée automatiquement : autorise la localisation quand le téléphone le demande.',
          'État des lieux avant travaux : photographie l\'existant pour nous protéger des réclamations.'
        ]],
        ['Terminer une tâche', [
          'Mets la photo « Après », puis marque la tâche comme terminée.',
          'Le chef et le conducteur la voient aussitôt.'
        ]]
      ]
    },
    {
      id: 'gamma', ico: '📤', titre: 'Gamma : mise à jour du jour et dépôt', roles: 'ckd',
      blocs: [
        ['🛡️ Alertes, PV signés, dossier de contestation', [
          'Accueil → bandeau « ⏰ … logements atteignent une date limite sous 7 jours » : liste des actions (démarrer, finir, programmer la VTS), copie ou SMS pour le chef, notifications.',
          'Fiche logement → « 🛡️ Preuves et délais » : PV d\'état des lieux, de passage, de refus d\'accès ou d\'absence, signé sur le téléphone (date, heure, GPS). Un refus ou une absence signé gèle automatiquement les pénalités.',
          '« 📄 Dossier de contestation » (fiche logement ou écran pénalités) : synthèse, arguments, chronologie, périodes neutralisées, calcul et preuves, à imprimer en PDF.'
        ]],
        ['🔄 Mise à jour quotidienne Gamma → Évolud', [
          'Une fois par jour, une seule personne (Saïd, Alex, Thibault ou Marine) ouvre Gamma et touche le favori « 🔄 Gamma → Évolud ».',
          'Le favori lit Gamma (logements, étapes, dates de travaux, RDV VTE, bons de commande) et met à jour l\'appli de toute l\'équipe en 1 à 3 minutes.',
          'Si c\'est déjà fait dans la journée, il l\'indique : inutile de recommencer. L\'Accueil affiche « Gamma à jour… par … ».',
          'Installer son favori : Plus → 🔄 Bouton Gamma → Copier le favori, puis suivre les instructions (Edge ou Safari).'
        ]],
        ['Principe', [
          'L\'onglet Gamma liste les tâches terminées avec leurs photos géolocalisées, prêtes à déposer.',
          'Sur le PC : ouvre Gamma dans Edge et utilise le bouton « Évolud → Gamma » de la barre des favoris.',
          'Les dates de travaux se reportent avec le bouton « Dates → Gamma ».'
        ]]
      ]
    },
    {
      id: 'finances', ico: '💶', titre: 'Finances et pénalités', roles: 'kd',
      blocs: [
        ['Lire les cartes', [
          'Facturable : logements en VTS validée (payés à la VTS).',
          'Reste : montant restant sur les logements VTE faite et VTE à faire.',
          'Rouge – Pénalités imputables : retards comptés contre Bouygues.',
          'Orange – Retards en attente client : retards dus au client (diag, double plafond, locataire), à faire neutraliser.'
        ]],
        ['Comprendre une pénalité', [
          'Sous les cartes : onglets « Imputables » et « Attente client », un logement par ligne.',
          'Démarrage (j) : démarrage des travaux en retard sur le délai du scénario.',
          'Plafond (j) : travaux plus longs que la durée maximale.',
          'Global (j) : délai VTE → VTS dépassé.',
          'Fais glisser le tableau vers la gauche pour voir le montant en €.',
          'Touche la carte rouge ou orange (« 🔍 Pourquoi ce montant ? ») : explication logement par logement, cause (démarrage, travaux, menuiseries, VTS), contrôles diag / double plafond / dates Gamma, export Excel et note direction en PDF.'
        ]],
        ['Faire baisser les pénalités', [
          'Pour chaque logement en tête de liste : y a-t-il eu double plafond, attente de diag ou locataire absent ?',
          'Si oui, déclare l\'arrêt dans le logement : la ligne passe en « Attente client ».',
          'Vérifie que la date de VTS est bien saisie pour les logements terminés.'
        ]]
      ]
    },
    {
      id: 'plus', ico: '☰', titre: 'Menu Plus', roles: 'ockd',
      blocs: [
        ['Ma journée / Heures', [
          'En fin de journée : une ligne par logement et prestation, avec la durée et le nombre de personnes.',
          'Sert à calculer les ratios par tâche et à comparer au budget d\'heures.'
        ]],
        ['Plan de charge (chef, conducteur, direction)', [
          'Propose une date d\'intervention selon l\'effectif et la charge, sans dépasser le délai du scénario.',
          '🟢 dans les temps · 🟠 limite · 🔴 en retard.'
        ]],
        ['Sécurité (chef, conducteur, direction)', [
          'Saisie des écarts EPI (gants, lunettes, casque, jugulaire, masque, escabeau).',
          'Non visible par les ouvriers.'
        ]],
        ['CR de chantier', [
          'Bouton pendant les visites ; CR hebdomadaire envoyé aux sous-traitants avec le planning de la semaine suivante.'
        ]],
        ['Paramètres', [
          'Réglages du chantier, de l\'effectif et de la connexion au serveur.'
        ]]
      ]
    },
    {
      id: 'faq', ico: '❓', titre: 'Problèmes fréquents', roles: 'ockd',
      blocs: [
        ['La photo n\'a pas de position GPS', [
          'Réglages du téléphone → Confidentialité / Localisation → autorise le navigateur (ou l\'appli Évolud).'
        ]],
        ['« en attente » ne disparaît pas', [
          'Vérifie le réseau, puis appuie sur ⟳. Ne désinstalle pas l\'appli tant qu\'il reste des saisies en attente.'
        ]],
        ['Je ne vois pas un écran dont on m\'a parlé', [
          'Il dépend peut-être de ton rôle. Demande à Saïd.'
        ]],
        ['L\'appli ne se met pas à jour', [
          'Ferme-la complètement et rouvre-la : la nouvelle version se charge toute seule.'
        ]]
      ]
    }
  ];

  // Étapes de la visite guidée : on cherche l'onglet par son libellé
  var TOUR = [
    { label: null, titre: 'Bienvenue 👋', txt: 'Petit tour de l\'appli Évolud Chantier en 7 étapes. Tu peux le relancer à tout moment avec le bouton « ? ».' },
    { label: 'Accueil', titre: '🏠 Accueil', txt: 'Le tableau de bord : avancement, retards, chiffres clés. Les cartes sont cliquables.' },
    { label: 'Logements', titre: '🏘️ Logements', txt: 'Recherche d\'un logement, VTE sur plan, prise de cotes, déclaration double plafond / locataire absent.' },
    { label: 'Tâches', titre: '🛠️ Tâches', txt: 'Les tâches de ton équipe. Photos avant / pendant / après, géolocalisées automatiquement.' },
    { label: 'Gamma', titre: '📤 Gamma', txt: 'Les tâches terminées, prêtes à déposer sur Gamma avec leurs photos.' },
    { label: 'Balance', titre: '💶 Balance', txt: 'Finances : facturable, reste à faire, pénalités imputables et retards dus au client.' },
    { label: 'Plus', titre: '☰ Plus', txt: 'Heures, plan de charge, sécurité, CR, paramètres… et ce guide complet à tout moment.' }
  ];

  /* ---------- Styles ---------- */
  var css = [
    '.etu-fab{position:fixed;right:14px;bottom:calc(86px + env(safe-area-inset-bottom));z-index:2147483000;width:50px;height:50px;border-radius:50%;border:0;background:#e8792b;color:#fff;font:700 24px/50px system-ui,-apple-system,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}',
    '.etu-ov{position:fixed;inset:0;z-index:9999;background:#f3f5f8;display:flex;flex-direction:column;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2733}',
    '.etu-hd{background:#1f3a5f;color:#fff;padding:calc(12px + env(safe-area-inset-top)) 14px 12px;display:flex;align-items:center;gap:10px}',
    '.etu-hd h2{flex:1;margin:0;font-size:18px}',
    '.etu-x{background:rgba(255,255,255,.15);border:0;color:#fff;border-radius:10px;padding:8px 12px;font-size:15px;cursor:pointer}',
    '.etu-tools{padding:12px 14px 4px;background:#fff;border-bottom:1px solid #e3e7ee}',
    '.etu-search{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cfd6e0;border-radius:10px;font-size:15px}',
    '.etu-chips{display:flex;gap:6px;overflow-x:auto;padding:10px 0 8px}',
    '.etu-chip{flex:none;border:1px solid #cfd6e0;background:#fff;border-radius:16px;padding:6px 12px;font-size:13px;cursor:pointer;color:#1d2733}',
    '.etu-chip.on{background:#1f3a5f;color:#fff;border-color:#1f3a5f}',
    '.etu-body{flex:1;overflow-y:auto;padding:12px 14px calc(24px + env(safe-area-inset-bottom))}',
    '.etu-tourbtn{width:100%;border:0;border-radius:12px;padding:12px;background:#e8f0fb;color:#1f3a5f;font-weight:700;font-size:15px;margin-bottom:12px;cursor:pointer}',
    '.etu-sec{background:#fff;border-radius:14px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden}',
    '.etu-sec>button{width:100%;text-align:left;border:0;background:none;padding:14px;font-size:16px;font-weight:700;display:flex;gap:10px;align-items:center;color:#1d2733;cursor:pointer}',
    '.etu-sec>button span.t{flex:1}',
    '.etu-sec .arr{transition:transform .2s;color:#8a96a8}',
    '.etu-sec.open .arr{transform:rotate(90deg)}',
    '.etu-cnt{display:none;padding:0 14px 12px}',
    '.etu-sec.open .etu-cnt{display:block}',
    '.etu-cnt h4{margin:10px 0 4px;font-size:14px;color:#1f3a5f}',
    '.etu-cnt ol{margin:0 0 4px;padding-left:20px}',
    '.etu-cnt li{margin:3px 0}',
    '.etu-empty{text-align:center;color:#8a96a8;padding:30px 0}',
    '.etu-sign{text-align:center;color:#8a96a8;font-size:12px;margin-top:16px}',
    'mark.etu-hl{background:#ffe58a;padding:0 1px}',
    /* visite guidée */
    '.etu-shade{position:fixed;inset:0;z-index:10000;background:rgba(10,20,35,.55)}',
    '.etu-spot{position:fixed;z-index:10001;border-radius:12px;box-shadow:0 0 0 4px #ffd34d,0 0 0 9999px rgba(10,20,35,.55);pointer-events:none;transition:all .25s}',
    '.etu-tip{position:fixed;z-index:10002;left:14px;right:14px;max-width:420px;margin:0 auto;background:#fff;border-radius:14px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.3);font:15px/1.45 system-ui,-apple-system,sans-serif;color:#1d2733}',
    '.etu-tip h3{margin:0 0 6px;font-size:17px}',
    '.etu-tip p{margin:0 0 12px}',
    '.etu-tip .row{display:flex;gap:8px;align-items:center}',
    '.etu-tip .dots{flex:1;color:#8a96a8;font-size:13px}',
    '.etu-tip button{border:0;border-radius:10px;padding:9px 14px;font-size:14px;cursor:pointer}',
    '.etu-tip .nx{background:#1f3a5f;color:#fff;font-weight:700}',
    '.etu-tip .sk{background:#eef1f5;color:#1d2733}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('etu-css')) return;
    var s = document.createElement('style');
    s.id = 'etu-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
    // Si la politique de sécurité (CSP) de la page bloque le style ajouté,
    // on passe par une feuille de style construite, non concernée par ce blocage.
    var ok = false;
    try { ok = !!(s.sheet && s.sheet.cssRules.length); } catch (e) { ok = false; }
    if (!ok && window.CSSStyleSheet && 'adoptedStyleSheets' in document) {
      try {
        if (!window.__etuSheet) { window.__etuSheet = new CSSStyleSheet(); window.__etuSheet.replaceSync(css); }
        if (document.adoptedStyleSheets.indexOf(window.__etuSheet) < 0)
          document.adoptedStyleSheets = document.adoptedStyleSheets.concat([window.__etuSheet]);
      } catch (e) { /* sans effet */ }
    }
  }

  /* ---------- Utilitaires ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function highlight(text, q) {
    var t = esc(text);
    if (!q) return t;
    var n = norm(text), i = n.indexOf(q);
    if (i < 0) return t;
    // surligne sur le texte d'origine (même longueur après normalisation pour le français courant)
    return esc(text.slice(0, i)) + '<mark class="etu-hl">' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }

  /* ---------- Guide complet ---------- */
  var ov = null, state = { role: 'tous', q: '', open: {} };
  var ROLES = [['tous', 'Tous'], ['o', 'Équipe / ouvrier'], ['c', 'Chef'], ['k', 'Conducteur'], ['d', 'Direction']];

  function render() {
    var body = ov.querySelector('.etu-body');
    var q = norm(state.q.trim());
    var html = '';
    if (!q) html += '<button class="etu-tourbtn" data-act="tour">▶️ Lancer la visite guidée</button>';
    var count = 0;
    SECTIONS.forEach(function (s) {
      if (state.role !== 'tous' && s.roles.indexOf(state.role) < 0) return;
      var blocs = s.blocs;
      if (q) {
        blocs = s.blocs.map(function (b) {
          var titreOk = norm(b[0]).indexOf(q) >= 0 || norm(s.titre).indexOf(q) >= 0;
          var items = titreOk ? b[1] : b[1].filter(function (li) { return norm(li).indexOf(q) >= 0; });
          return items.length ? [b[0], items] : null;
        }).filter(Boolean);
        if (!blocs.length) return;
      }
      count++;
      var isOpen = q || state.open[s.id];
      html += '<div class="etu-sec' + (isOpen ? ' open' : '') + '" data-id="' + s.id + '">' +
        '<button data-act="toggle"><span>' + s.ico + '</span><span class="t">' + esc(s.titre) + '</span><span class="arr">›</span></button>' +
        '<div class="etu-cnt">' +
        blocs.map(function (b) {
          return '<h4>' + highlight(b[0], q) + '</h4><ol>' +
            b[1].map(function (li) { return '<li>' + highlight(li, q) + '</li>'; }).join('') + '</ol>';
        }).join('') +
        '</div></div>';
    });
    if (!count) html += '<div class="etu-empty">Aucun résultat pour « ' + esc(state.q) + ' ».</div>';
    html += '<div class="etu-sign">Guide Évolud Chantier · conçu et développé par Saïd OUFQIR</div>';
    body.innerHTML = html;
  }

  function open(sectionId) {
    injectCss();
    close();
    state.q = '';
    if (sectionId) state.open[sectionId] = true;
    ov = el('div', 'etu-ov');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Guide d\'utilisation');
    ov.innerHTML =
      '<div class="etu-hd"><h2>📘 Guide d\'utilisation</h2><button class="etu-x" data-act="close">Fermer</button></div>' +
      '<div class="etu-tools"><input class="etu-search" type="search" placeholder="Rechercher (ex. photo, pénalité, VTE…)">' +
      '<div class="etu-chips">' + ROLES.map(function (r) {
        return '<button class="etu-chip' + (state.role === r[0] ? ' on' : '') + '" data-role="' + r[0] + '">' + r[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="etu-body"></div>';
    document.body.appendChild(ov);
    render();
    if (sectionId) {
      var t = ov.querySelector('[data-id="' + sectionId + '"]');
      if (t) t.scrollIntoView({ block: 'start' });
    }
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') return close();
      if (b.dataset.act === 'tour') { close(); return tour(); }
      if (b.dataset.act === 'toggle') {
        var sec = b.parentNode, id = sec.dataset.id;
        state.open[id] = !sec.classList.contains('open');
        sec.classList.toggle('open');
        return;
      }
      if (b.dataset.role) {
        state.role = b.dataset.role;
        ov.querySelectorAll('.etu-chip').forEach(function (c) { c.classList.toggle('on', c.dataset.role === state.role); });
        render();
      }
    });
    ov.querySelector('.etu-search').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  }

  function close() {
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    ov = null;
  }

  /* ---------- Visite guidée ---------- */
  // Trouve l'onglet de la barre du bas dont le texte correspond au libellé
  function findTab(label) {
    if (!label) return null;
    var want = norm(label), best = null, bestY = -1;
    var nodes = document.querySelectorAll('nav a, nav button, footer a, footer button, [class*="nav"] a, [class*="nav"] button, [class*="tab"] a, [class*="tab"] button, a, button');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.closest('.etu-ov, .etu-tip')) continue;
      var txt = norm((n.innerText || n.textContent || '').trim());
      if (!txt || txt.length > 30) continue;
      if (txt === want || txt.split(/\s+/).indexOf(want) >= 0 || txt.replace(/[^a-z]/g, '') === want.replace(/[^a-z]/g, '')) {
        var r = n.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // on garde l'élément le plus bas de l'écran (= barre du bas)
        if (r.top > bestY) { bestY = r.top; best = n; }
      }
    }
    return best;
  }

  var tourEls = null;
  function tour() {
    injectCss();
    endTour();
    var i = 0;
    var shade = el('div', 'etu-shade');
    var spot = el('div', 'etu-spot');
    var tip = el('div', 'etu-tip');
    document.body.appendChild(shade);
    document.body.appendChild(spot);
    document.body.appendChild(tip);
    tourEls = [shade, spot, tip];

    function step() {
      var s = TOUR[i];
      var target = findTab(s.label);
      if (target) {
        var r = target.getBoundingClientRect(), p = 6;
        spot.style.display = 'block';
        shade.style.display = 'none';
        spot.style.left = (r.left - p) + 'px';
        spot.style.top = (r.top - p) + 'px';
        spot.style.width = (r.width + 2 * p) + 'px';
        spot.style.height = (r.height + 2 * p) + 'px';
        // bulle au-dessus de l'onglet si l'onglet est en bas
        if (r.top > window.innerHeight / 2) { tip.style.top = ''; tip.style.bottom = (window.innerHeight - r.top + 18) + 'px'; }
        else { tip.style.bottom = ''; tip.style.top = (r.bottom + 18) + 'px'; }
      } else {
        spot.style.display = 'none';
        shade.style.display = 'block';
        tip.style.bottom = '';
        tip.style.top = '30%';
      }
      var last = i === TOUR.length - 1;
      tip.innerHTML = '<h3>' + esc(s.titre) + '</h3><p>' + esc(s.txt) + '</p>' +
        '<div class="row"><span class="dots">' + (i + 1) + ' / ' + TOUR.length + '</span>' +
        (i > 0 ? '<button class="sk" data-t="prev">‹</button>' : '<button class="sk" data-t="end">Passer</button>') +
        '<button class="nx" data-t="' + (last ? 'guide' : 'next') + '">' + (last ? 'Voir le guide complet' : 'Suivant ›') + '</button></div>';
    }
    tip.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var t = b.dataset.t;
      if (t === 'next') { i++; step(); }
      else if (t === 'prev') { i = Math.max(0, i - 1); step(); }
      else if (t === 'end') { endTour(); }
      else if (t === 'guide') { endTour(); open(); }
    });
    shade.addEventListener('click', endTour);
    window.addEventListener('resize', step);
    tourEls.resize = step;
    lsSet(KEY_SEEN, VERSION);
    step();
  }
  function endTour() {
    if (!tourEls) return;
    window.removeEventListener('resize', tourEls.resize);
    tourEls.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    tourEls = null;
  }

  /* ---------- Bouton « ? » ---------- */
  // place le bouton juste au-dessus de la barre d'onglets, quelle que soit sa hauteur
  function placeFab(b) {
    var t = document.getElementById('tabs') || document.querySelector('nav');
    if (!t) return;
    var r = t.getBoundingClientRect();
    if (r.height) b.style.bottom = Math.max(16, window.innerHeight - r.top + 12) + 'px';
  }
  function addFab() {
    var ex = document.querySelector('.etu-fab');
    if (ex) { placeFab(ex); return; }
    var b = el('button', 'etu-fab', '?');
    b.setAttribute('aria-label', 'Guide d\'utilisation');
    b.title = 'Guide d\'utilisation';
    b.addEventListener('click', function () { open(); });
    document.body.appendChild(b);
    placeFab(b);
  }

  function init() {
    injectCss();
    addFab();
    // L'appli se déchiffre puis redessine la page : on remet le bouton et le style
    // s'ils ont été effacés (vérification toutes les 1,5 s, coût négligeable).
    setInterval(function () {
      if (!document.body) return;
      injectCss();
      addFab();
    }, 1500);
    // 1re ouverture : la visite démarre seulement quand la barre du bas est affichée
    // (donc après la connexion), au plus tard on abandonne après 10 minutes.
    if (lsGet(KEY_SEEN) !== VERSION) {
      var tries = 0;
      var w = setInterval(function () {
        tries++;
        if (findTab('Accueil') && findTab('Plus')) { clearInterval(w); setTimeout(tour, 800); }
        else if (tries > 400) clearInterval(w);
      }, 1500);
    }
  }

  window.EvoludTuto = {
    open: open,
    tour: tour,
    close: function () { close(); endTour(); },
    reset: function () { try { localStorage.removeItem(KEY_SEEN); } catch (e) { } },
    version: VERSION
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
