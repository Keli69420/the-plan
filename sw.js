// Makes the app open with no signal. Newest version first, saved copy after 1.5 s.
// Only the page's own encrypted files and fonts pass through here. Logs and GitHub calls never do.
const CACHE = "the-plan-v1";
const SHELL = ["./", "./index.html", "./boot.js", "./app.enc", "./vault.json", "./manifest.webmanifest", "./icon.svg", "./icon-180.png"];
const TIMEOUT_MS = 1500;
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
async function newestFirst(e) {
  const cache = await caches.open(CACHE);
  const url = new URL(e.request.url);
  url.search = "";
  const network = fetch(url.href, { cache: "no-cache" }).then((res) => { if (res.ok) cache.put(url.href, res.clone()); return res; });
  e.waitUntil(network.catch(() => {}));
  const saved = await cache.match(url.href);
  if (!saved) return network;
  const fallback = new Promise((resolve) => setTimeout(() => resolve(saved), TIMEOUT_MS));
  return Promise.race([network.catch(() => saved), fallback]);
}
async function fontsFromCache(e) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(e.request);
  if (saved) return saved;
  const res = await fetch(e.request);
  if (res.ok || res.type === "opaque") cache.put(e.request, res.clone());
  return res;
}
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || e.request.headers.has("authorization")) return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) e.respondWith(newestFirst(e));
  else if (FONT_HOSTS.includes(url.hostname)) e.respondWith(fontsFromCache(e));
});
