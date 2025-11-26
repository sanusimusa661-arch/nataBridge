const CACHE_NAME = 'natabridge-v1';
const STATIC_CACHE = 'natabridge-static-v1';
const DATA_CACHE = 'natabridge-data-v1';

const STATIC_ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/js/db.js',
    '/static/js/api.js',
    '/static/js/auth.js',
    '/static/manifest.json'
];

const API_ROUTES = [
    '/api/mothers',
    '/api/education/modules',
    '/api/education/categories',
    '/api/transport-contacts'
];

self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== STATIC_CACHE && cacheName !== DATA_CACHE) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
        event.respondWith(
            fetch(request.clone())
                .catch(() => {
                    return new Response(JSON.stringify({
                        offline: true,
                        message: 'Request queued for sync'
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }

    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstThenCache(request));
        return;
    }

    event.respondWith(cacheFirstThenNetwork(request));
});

async function cacheFirstThenNetwork(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        return new Response('Offline - Content not available', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

async function networkFirstThenCache(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DATA_CACHE);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return new Response(JSON.stringify({
            offline: true,
            error: 'You are offline and this data is not cached'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-data') {
        event.waitUntil(syncOfflineData());
    }
});

async function syncOfflineData() {
    console.log('[SW] Syncing offline data...');
    
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({
            type: 'SYNC_STARTED'
        });
    });
    
    try {
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETED',
                success: true
            });
        });
    } catch (error) {
        console.error('[SW] Sync failed:', error);
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_FAILED',
                error: error.message
            });
        });
    }
}

self.addEventListener('push', (event) => {
    console.log('[SW] Push notification received');
    
    let data = {
        title: 'NataBridge',
        body: 'You have a new notification',
        icon: '/static/icons/icon-192x192.png',
        badge: '/static/icons/badge-72x72.png'
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        vibrate: [100, 50, 100],
        data: data.data || {},
        actions: data.actions || []
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if ('focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(DATA_CACHE).then((cache) => {
                return cache.addAll(event.data.urls);
            })
        );
    }
});
