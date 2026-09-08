import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contador de lecturas Firestore / hits de caché por request o corrida de medición.
 * Activo solo si METER_FIRESTORE_READS=1 (o si se fuerza con forceEnable).
 */

const storage = new AsyncLocalStorage();

function envEnabled() {
    return process.env.METER_FIRESTORE_READS === '1';
}

/**
 * @returns {{ reads: number, cacheHits: number, cacheMisses: number } | undefined}
 */
export function getMeter() {
    return storage.getStore();
}

export function isMeterEnabled() {
    const store = storage.getStore();
    if (store) return true;
    return envEnabled();
}

/**
 * @param {number} n
 */
export function addReads(n) {
    const store = storage.getStore();
    if (!store) return;
    const count = Number(n);
    if (!Number.isFinite(count) || count <= 0) return;
    store.reads += count;
}

export function markCacheHit() {
    const store = storage.getStore();
    if (!store) return;
    store.cacheHits += 1;
}

export function markCacheMiss() {
    const store = storage.getStore();
    if (!store) return;
    store.cacheMisses += 1;
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<{ result: T, meter: { reads: number, cacheHits: number, cacheMisses: number } }>}
 */
export async function runWithMeter(fn) {
    const meter = { reads: 0, cacheHits: 0, cacheMisses: 0 };
    const result = await storage.run(meter, fn);
    return { result, meter: { ...meter } };
}

/**
 * Middleware Express: envuelve el request y expone headers X-Baify-* si el meter está activo.
 */
export function firestoreMeterMiddleware(req, res, next) {
    if (!envEnabled()) {
        next();
        return;
    }

    const meter = { reads: 0, cacheHits: 0, cacheMisses: 0 };
    storage.run(meter, () => {
        const originalJson = res.json.bind(res);
        const originalEnd = res.end.bind(res);
        let flushed = false;

        const flushHeaders = () => {
            if (flushed || res.headersSent) return;
            flushed = true;
            res.setHeader('X-Baify-Firestore-Reads', String(meter.reads));
            res.setHeader('X-Baify-Cache-Hits', String(meter.cacheHits));
            res.setHeader('X-Baify-Cache-Misses', String(meter.cacheMisses));
            console.log(
                `[Meter] ${req.method} ${req.originalUrl || req.url} ` +
                `reads=${meter.reads} cacheHits=${meter.cacheHits} cacheMisses=${meter.cacheMisses}`
            );
        };

        res.json = (body) => {
            flushHeaders();
            return originalJson(body);
        };

        res.end = (...args) => {
            flushHeaders();
            return originalEnd(...args);
        };

        next();
    });
}
