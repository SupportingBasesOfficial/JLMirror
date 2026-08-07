// Service Worker — JLMIRROR PWA
// Handle: push events, notification clicks, cache strategy

const CACHE_NAME = "jlmirror-v2";
const STATIC_ASSETS = ["/", "/manifest.json", "/icon.svg", "/offline"];

// Install — pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => undefined),
  );
  self.skipWaiting();
});

// Activate — limpa caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))),
    ),
  );
  self.clients.claim();
});

// Push event — exibe a notificacao
self.addEventListener("push", (event) => {
  let payload = { title: "JLMIRROR", body: "Nova notificação" };

  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const severity = payload.data?.severity || "info";
  const actions = [];

  // Acoes contextuais baseadas no tipo de notificacao
  if (payload.data?.type === "alert") {
    actions.push({ action: "view", title: "Ver Alerta" });
    actions.push({ action: "acknowledge", title: "Confirmar" });
  } else if (payload.data?.type === "ticket") {
    actions.push({ action: "view", title: "Ver Ticket" });
  } else if (payload.data?.type === "report") {
    actions.push({ action: "download", title: "Baixar Relatório" });
  }

  const options = {
    body: payload.body,
    icon: payload.icon || "/icon.svg",
    badge: payload.badge || "/icon.svg",
    tag: payload.tag || "jlmirror-notification",
    data: payload.data || {},
    requireInteraction: severity === "critical",
    vibrate: severity === "critical" ? [200, 100, 200, 100, 200] : [200, 100, 200],
    actions: actions.length > 0 ? actions : undefined,
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options),
  );
});

// Notification click — abre a app e navega para URL apropriada
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};
  let targetUrl = notificationData.url || "/";

  // Mapeia acoes para URLs
  if (action === "view" && notificationData.entity_id) {
    targetUrl = `/alerts/${notificationData.entity_id}`;
  } else if (action === "acknowledge" && notificationData.entity_id) {
    targetUrl = `/alerts/${notificationData.entity_id}?action=ack`;
  } else if (action === "download" && notificationData.url) {
    targetUrl = notificationData.url;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.postMessage({ type: "notification-click", action, data: notificationData });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});

// Fetch — network-first para API, cache-first para assets, offline fallback para navegacao
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignora requests non-GET
  if (event.request.method !== "GET") return;

  // API requests — network-first, sem cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
        .then((response) => response || new Response('{"error":{"code":"OFFLINE","message":"Sem conexao"}}', {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })),
    );
    return;
  }

  // Navegacao (HTML) — network-first com fallback offline
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/offline"))),
    );
    return;
  }

  // Static assets — cache-first com network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      });
    }),
  );
});

// Message handler — para comunicacao com a pagina
self.addEventListener("message", (event) => { // NOSONAR — origin validada abaixo
  // Valida origin para prevenir mensagens cross-origin maliciosas
  if (event.origin !== self.location.origin) return;
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
