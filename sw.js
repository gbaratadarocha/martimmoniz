// ================================================
// Service Worker - App de Manutenção
// Suporte offline e cache de recursos
// ================================================

const CACHE_NAME = 'manutencao-v1';
const STATIC_CACHE = 'manutencao-static-v1';
const DYNAMIC_CACHE = 'manutencao-dynamic-v1';

// Recursos para cache no install
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// ============================================
// INSTALL EVENT
// ============================================
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[Service Worker] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Instalado com sucesso');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Erro no install:', error);
            })
    );
});

// ============================================
// ACTIVATE EVENT
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Ativando...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('[Service Worker] Removendo cache antigo:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[Service Worker] Ativado com sucesso');
                return self.clients.claim();
            })
    );
});

// ============================================
// FETCH EVENT
// ============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar requisições para Google Sheets API
    if (url.href.includes('script.google.com') || url.href.includes('docs.google.com')) {
        return;
    }
    
    // Estratégia: Cache First, Network Fallback
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Retornar do cache e atualizar em background
                    updateCache(request);
                    return cachedResponse;
                }
                
                // Não está no cache, buscar da rede
                return fetch(request)
                    .then((networkResponse) => {
                        // Cachear recursos dinamicamente
                        if (request.method === 'GET' && !url.href.includes('chrome-extension')) {
                            return caches.open(DYNAMIC_CACHE)
                                .then((cache) => {
                                    cache.put(request, networkResponse.clone());
                                    return networkResponse;
                                });
                        }
                        return networkResponse;
                    })
                    .catch((error) => {
                        console.error('[Service Worker] Fetch failed:', error);
                        
                        // Retornar página offline se disponível
                        if (request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// ============================================
// BACKGROUND SYNC
// ============================================
self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Background sync:', event.tag);
    
    if (event.tag === 'sync-requests') {
        event.waitUntil(
            syncRequests()
        );
    }
});

// ============================================
// PUSH NOTIFICATIONS (opcional)
// ============================================
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push notification received');
    
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'App de Manutenção';
    const options = {
        body: data.body || 'Novo pedido de manutenção',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: data
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification clicked');
    
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Atualizar cache em background
function updateCache(request) {
    return fetch(request)
        .then((response) => {
            if (response && response.status === 200) {
                return caches.open(DYNAMIC_CACHE)
                    .then((cache) => {
                        cache.put(request, response);
                    });
            }
        })
        .catch(() => {
            // Silenciosamente falhar se não conseguir atualizar
        });
}

// Sincronizar pedidos offline
async function syncRequests() {
    try {
        // Comunicar com a página para processar fila offline
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
            client.postMessage({
                type: 'SYNC_REQUESTS'
            });
        });
    } catch (error) {
        console.error('[Service Worker] Erro ao sincronizar:', error);
    }
}

// ============================================
// MESSAGE HANDLER
// ============================================
self.addEventListener('message', (event) => {
    console.log('[Service Worker] Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});

// ============================================
// LOGGING
// ============================================
console.log('[Service Worker] Registado e pronto');
