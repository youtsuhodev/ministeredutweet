/* Service worker SANS cache (politique « aucun cache »).
   Il ne stocke rien : ni Cache Storage, ni réponses réseau. Il reste présent pour que le navigateur propose
   l'installation de la PWA, et pour afficher une page « hors ligne » générée à la volée quand le réseau tombe. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

/* Supprime tout ce qu'une ancienne version (wouaff-v*, ministere-v*) aurait mis en cache. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#020617" />
  <title>Hors ligne — Ministère du vide</title>
  <style>
    html, body { margin: 0; height: 100%; }
    body { display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; box-sizing: border-box;
      background: #020617; color: #e2e8f0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    main { max-width: 380px; }
    h1 { font-size: 1.6rem; margin: 0 0 8px; }
    p { color: #94a3b8; line-height: 1.5; margin: 0 0 24px; }
    button { background: #00a2f5; color: #fff; border: 0; border-radius: 999px; padding: 12px 28px; font-weight: 700; font-size: 1rem; cursor: pointer; }
    @media (prefers-color-scheme: light) { body { background: #eef2f7; color: #0f172a; } p { color: #475569; } }
  </style>
</head>
<body>
  <main>
    <h1>Tu es hors ligne</h1>
    <p>Le Ministère du vide a besoin d'une connexion pour charger ton fil. Vérifie ton réseau puis réessaie.</p>
    <button type="button" onclick="location.reload()">Réessayer</button>
  </main>
  <script>addEventListener('online', function () { location.reload(); });</script>
</body>
</html>`;

/* Seules les navigations sont gérées : toujours depuis le réseau (cache: 'no-store'), et si le réseau
   est coupé, la page hors-ligne ci-dessus. Tout le reste (scripts, images, API…) passe directement par le navigateur. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  event.respondWith(
    fetch(req, { cache: 'no-store' }).catch(
      () =>
        new Response(OFFLINE_HTML, {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        }),
    ),
  );
});

/* Réception d'une notification push (Web Push). Sur iOS, chaque push DOIT afficher une notification,
   sinon Safari révoque l'abonnement : on n'ignore donc jamais un message, même appli au premier plan. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Ministère du vide';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/assets/pwa/icon-192.png',
    badge: '/assets/pwa/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    renotify: typeof data.tag === 'string' && data.renotify === true,
    data: { url: typeof data.url === 'string' ? data.url : '/' },
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      /* Pastille sur l'icône de l'appli installée (Chrome/Edge bureau, Android, iOS 16.4+). */
      if (typeof data.unread === 'number' && 'setAppBadge' in self.navigator) {
        try {
          await (data.unread > 0 ? self.navigator.setAppBadge(data.unread) : self.navigator.clearAppBadge());
        } catch {
          /* badge non supporté : sans importance */
        }
      }
    })(),
  );
});

/* Le navigateur a renouvelé ou invalidé l'abonnement : on se réabonne avec la même clé serveur. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const key = event.oldSubscription?.options.applicationServerKey;
        if (!key) return;
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        /* le prochain lancement de l'appli resynchronisera l'abonnement */
      }
    })(),
  );
});

/* Clic sur une notification système */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/';
  let url = '/';
  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin === self.location.origin) url = parsed.pathname + parsed.search + parsed.hash;
  } catch {
    url = '/';
  }
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          try {
            if ('navigate' in client) client.navigate(url);
          } catch {
            /* navigation cross-origin ignorée */
          }
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
