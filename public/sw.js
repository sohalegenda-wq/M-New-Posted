/* Public fallback assets only. Never cache API, media, HTML app responses or account data. */
const VERSION = "m2-offline-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(["/offline.html", "/icon.svg"])),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("m2-offline-") && k !== VERSION)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/media/")
  )
    return;
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request).catch(async () => {
        const offline = await caches.match("/offline.html");
        // Workers Assets canonicalizes .html URLs. Rebuild the public fallback
        // so its redirected flag cannot invalidate a navigation response.
        return offline
          ? new Response(offline.body, {
              status: 200,
              headers: offline.headers,
            })
          : new Response("Нет соединения", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
      }),
    );
});
