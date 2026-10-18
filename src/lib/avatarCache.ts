/**
 * Persistent Avatar Cache Layer using IndexedDB + In-Memory Fast Lookup
 * Prevents image flickering and redundant network requests when scrolling.
 */

const DB_NAME = 'CustomerAvatarCacheDB';
const DB_VERSION = 1;
const STORE_NAME = 'avatars';
const MAX_CACHED_ITEMS = 600;

interface CachedAvatarRecord {
  key: string;
  dataUrl: string;
  url?: string;
  userKey?: string;
  updatedAt: number;
}

// In-Memory synchronous cache for 0ms instantaneous render on scroll
const memoryCache = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let isPreloaded = false;

/**
 * Initialize IndexedDB instance safely
 */
export function getAvatarDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('by_userKey', 'userKey', { unique: false });
          store.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        resolve(db);
        // Pre-warm memory cache with recent avatars
        if (!isPreloaded) {
          preloadRecentAvatars(db);
        }
      };

      request.onerror = (err) => {
        console.warn('[AvatarCache] IndexedDB open error:', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('[AvatarCache] IndexedDB init exception:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Preload recent cached avatars from IndexedDB into synchronous memory map
 */
async function preloadRecentAvatars(db: IDBDatabase) {
  if (isPreloaded) return;
  isPreloaded = true;

  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('by_updatedAt');
    const request = index.openCursor(null, 'prev');

    let count = 0;
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && count < 300) {
        const record = cursor.value as CachedAvatarRecord;
        if (record && record.dataUrl) {
          if (record.key) memoryCache.set(record.key, record.dataUrl);
          if (record.url) memoryCache.set(record.url, record.dataUrl);
          if (record.userKey) memoryCache.set(record.userKey, record.dataUrl);
        }
        count++;
        cursor.continue();
      }
    };
  } catch (err) {
    console.warn('[AvatarCache] Preload warning:', err);
  }
}

/**
 * Instantaneous synchronous lookup from memory cache
 */
export function getAvatarFromMemory(url?: string | null, userKey?: string | null): string | null {
  if (url && memoryCache.has(url)) {
    return memoryCache.get(url)!;
  }
  if (userKey) {
    const rawKey = userKey.toLowerCase().trim();
    if (memoryCache.has(rawKey)) return memoryCache.get(rawKey)!;
    const cleanUser = rawKey.includes(':') ? rawKey.split(':')[1] : rawKey;
    if (memoryCache.has(cleanUser)) return memoryCache.get(cleanUser)!;
    for (const p of ['tiktok', 'facebook', 'shopee', 'all']) {
      const scoped = `${p}:${cleanUser}`;
      if (memoryCache.has(scoped)) return memoryCache.get(scoped)!;
    }
  }
  return null;
}

/**
 * Asynchronously retrieve avatar from Memory or IndexedDB
 */
export async function getAvatarFromCache(url?: string | null, userKey?: string | null): Promise<string | null> {
  // 1. Check synchronous in-memory cache first
  const mem = getAvatarFromMemory(url, userKey);
  if (mem) return mem;

  const db = await getAvatarDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const checkUrl = () => {
        if (!url) return checkUser();
        const req = store.get(url);
        req.onsuccess = () => {
          if (req.result && req.result.dataUrl) {
            memoryCache.set(url, req.result.dataUrl);
            if (userKey) memoryCache.set(userKey, req.result.dataUrl);
            resolve(req.result.dataUrl);
          } else {
            checkUser();
          }
        };
        req.onerror = () => checkUser();
      };

      const checkUser = () => {
        if (!userKey) return resolve(null);
        const cleanUser = userKey.includes(':') ? userKey.split(':')[1] : userKey;
        const req = store.get(userKey);
        req.onsuccess = () => {
          if (req.result && req.result.dataUrl) {
            memoryCache.set(userKey, req.result.dataUrl);
            memoryCache.set(cleanUser, req.result.dataUrl);
            if (url) memoryCache.set(url, req.result.dataUrl);
            resolve(req.result.dataUrl);
          } else {
            const req2 = store.get(cleanUser);
            req2.onsuccess = () => {
              if (req2.result && req2.result.dataUrl) {
                memoryCache.set(cleanUser, req2.result.dataUrl);
                memoryCache.set(userKey, req2.result.dataUrl);
                if (url) memoryCache.set(url, req2.result.dataUrl);
                resolve(req2.result.dataUrl);
              } else {
                resolve(null);
              }
            };
            req2.onerror = () => resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      };

      checkUrl();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Save an avatar DataURL into both Memory and IndexedDB
 */
export async function saveAvatarToCache(dataUrl: string, url?: string | null, userKey?: string | null): Promise<void> {
  if (!dataUrl) return;

  const cleanUser = userKey ? (userKey.includes(':') ? userKey.split(':')[1] : userKey).toLowerCase().trim() : '';

  // 1. Immediately store in memory cache
  if (url) memoryCache.set(url, dataUrl);
  if (userKey) memoryCache.set(userKey.toLowerCase().trim(), dataUrl);
  if (cleanUser) {
    memoryCache.set(cleanUser, dataUrl);
    ['tiktok', 'facebook', 'shopee', 'all'].forEach(p => memoryCache.set(`${p}:${cleanUser}`, dataUrl));
  }

  const db = await getAvatarDB();
  if (!db) return;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const now = Date.now();

    if (url) {
      store.put({ key: url, dataUrl, url, userKey: cleanUser || userKey || undefined, updatedAt: now });
    }

    if (userKey) {
      store.put({ key: userKey.toLowerCase().trim(), dataUrl, url: url || undefined, userKey: userKey.toLowerCase().trim(), updatedAt: now });
    }

    if (cleanUser) {
      store.put({ key: cleanUser, dataUrl, url: url || undefined, userKey: cleanUser, updatedAt: now });
    }

    // Prune if database grows excessively large
    pruneOldAvatars(db);
  } catch (err) {
    console.warn('[AvatarCache] Save to IndexedDB warning:', err);
  }
}

/**
 * Cache an avatar from a remote URL by fetching and converting to DataURL
 */
const inFlightRequests = new Map<string, Promise<string | null>>();

export function cacheRemoteAvatar(url: string, userKey?: string | null): Promise<string | null> {
  if (!url || typeof window === 'undefined') return Promise.resolve(null);

  // If already in memory cache, return immediately
  const cached = getAvatarFromMemory(url, userKey);
  if (cached) return Promise.resolve(cached);

  // Deduplicate in-flight requests for the same URL
  const inFlightKey = url;
  if (inFlightRequests.has(inFlightKey)) {
    return inFlightRequests.get(inFlightKey)!;
  }

  const promise = (async () => {
    try {
      // First check IndexedDB before hitting the network
      const fromDb = await getAvatarFromCache(url, userKey);
      if (fromDb) return fromDb;

      // Fetch with timeout
      let blob: Blob | null = null;
      try {
        const resp = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(4000) });
        if (resp.ok) {
          blob = await resp.blob();
        }
      } catch {
        // Direct fetch failed (likely CORS or hotlink protection) -> fallback through server proxy
        try {
          const cleanName = userKey ? (userKey.includes(':') ? userKey.split(':')[1] : userKey) : '';
          const proxyUrl = `/api/proxy-avatar?url=${encodeURIComponent(url)}&name=${encodeURIComponent(cleanName)}`;
          const proxyResp = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
          if (proxyResp.ok) {
            blob = await proxyResp.blob();
          }
        } catch {}
      }

      if (!blob || blob.size === 0) return null;

      // Convert Blob to Base64 DataURL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('Failed to convert to dataUrl'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob!);
      });

      // Save to IndexedDB and memory
      await saveAvatarToCache(dataUrl, url, userKey);
      return dataUrl;
    } catch (err) {
      console.warn('[AvatarCache] Failed to cache remote avatar:', url, err);
      return null;
    } finally {
      inFlightRequests.delete(inFlightKey);
    }
  })();

  inFlightRequests.set(inFlightKey, promise);
  return promise;
}

/**
 * Periodically prune oldest records if count exceeds threshold
 */
let lastPruneTime = 0;
function pruneOldAvatars(db: IDBDatabase) {
  const now = Date.now();
  if (now - lastPruneTime < 300000) return; // Only prune at most once every 5 minutes
  lastPruneTime = now;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();

    countReq.onsuccess = () => {
      if (countReq.result > MAX_CACHED_ITEMS) {
        const toDeleteCount = countReq.result - MAX_CACHED_ITEMS + 50;
        const index = store.index('by_updatedAt');
        const cursorReq = index.openCursor(null, 'next'); // oldest first
        let deleted = 0;

        cursorReq.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleted < toDeleteCount) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    };
  } catch {}
}

// Automatically start initializing DB when module is imported
if (typeof window !== 'undefined') {
  getAvatarDB();
}
