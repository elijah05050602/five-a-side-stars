/* Goal Rush! service worker: keeps every file of the game so it plays offline after one visit.
   dist/sw.js is written from src/sw-template.js by the build (tools/sw-precache.ts), which fills in
   the list of every built file and a version hashed from all of them: any change is a new cache. */
const VERSION = __VERSION__;
const FILES = __FILES__;
const PAGE = './index.html';
const PAGE_TIMEOUT_MS = 3000;

// Check every file with the server before storing it ('no-cache'), so a stale copy in the browser's
// HTTP cache can never be stored under a new version, while a file the page has just loaded comes
// back as a cheap "not modified" instead of being downloaded twice. addAll stores all or nothing,
// and this worker only takes over once it has all.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES.map((url) => new Request(url, { cache: 'no-cache' }))))
      .then(() => self.skipWaiting()),
  );
});

// Drop older Goal Rush! caches (only ours: other games on the same site keep theirs), then look
// after the pages that are already open.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('goalrush-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // The game only loads files from its own site; anything else is left to the browser.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(req.mode === 'navigate' ? openPage(req) : openFile(event));
});

// The page: from the network when it answers within a few seconds, so a launch on a poor connection
// does not hang, else the copy installed with this version. That copy is never swapped for one from
// the network: a newer deploy's page asks for that deploy's files, which this cache does not have.
function openPage(req) {
  const network = fetch(req);
  const slow = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS));
  return Promise.race([network, slow])
    .then((res) => res || cached(PAGE).then((hit) => hit || network))
    .catch(() => cached(PAGE).then((hit) => hit || Response.error()));
}

// Everything else: this version's copy, or the network for anything not in it (a full 200 is kept).
function openFile(event) {
  const req = event.request;
  return cached(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(caches.open(VERSION).then((cache) => cache.put(req, copy)));
    }
    return res;
  }));
}

// One copy of each file, so the server's Vary header has nothing to choose between.
function cached(req) {
  return caches.open(VERSION).then((cache) => cache.match(req, { ignoreVary: true }));
}
