/**
 * Service Worker for Payload Reader
 * Handles offline caching and background sync
 */

const CACHE_NAME = 'payload-reader-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/style.css',
    '/js/db.js',
    '/js/clock.js',
    '/js/weather.js',
    '/js/feeds.js',
    '/js/ui.js',
    '/js/app.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // For API requests (weather, RSS proxy), try network first
    if (url.hostname === 'api.openweathermap.org' ||
        url.hostname === 'api.allorigins.win') {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // For static assets, try cache first
    event.respondWith(cacheFirst(event.request));
});

// Cache-first strategy
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] Fetch failed:', error);
        // Return offline page if available
        return caches.match('/index.html');
    }
}

// Network-first strategy (for API calls)
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network request failed, checking cache');
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// Background sync for news/weather
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync:', event.tag);

    if (event.tag === 'sync-payload') {
        event.waitUntil(syncPayload());
    }
});

async function syncPayload() {
    console.log('[SW] Syncing payload...');
    // Notify the main app to sync
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({
            type: 'SYNC_REQUESTED'
        });
    });
}

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
    console.log('[SW] Push received');

    const options = {
        body: 'New articles available',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: 'payload-update'
    };

    event.waitUntil(
        self.registration.showNotification('PAYLOAD READER', options)
    );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Focus existing window or open new one
                for (const client of clientList) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (self.clients.openWindow) {
                    return self.clients.openWindow('/');
                }
            })
    );
});

// Message handler for communication with main app
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
