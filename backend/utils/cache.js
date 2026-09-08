/**
 * Caché distribuida con Upstash Redis (REST) para lecturas pesadas
 * (dashboard, rankings, listados, low-stock). Fallback seguro si no hay env.
 *
 * Variables: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * TTL por defecto: 60 minutos (igual que SimpleCache anterior).
 */

import { Redis } from '@upstash/redis';
import { markCacheHit, markCacheMiss } from './readMeter.js';

const DEFAULT_TTL_SECONDS = 60 * 60;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token
    ? new Redis({ url, token })
    : null;

if (!redis) {
    console.warn(
        '⚠️ [Cache] Upstash no configurado (faltan UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). ' +
        'Las lecturas irán directo a Firestore.'
    );
}

/**
 * @param {string} key
 * @returns {Promise<unknown|null>}
 */
async function get(key) {
    if (!redis) {
        markCacheMiss();
        return null;
    }
    try {
        const value = await redis.get(key);
        if (value == null) {
            markCacheMiss();
            return null;
        }
        markCacheHit();
        return value;
    } catch (error) {
        console.warn(`[Cache] get falló (${key}):`, error.message);
        markCacheMiss();
        return null;
    }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {number} [ttlSeconds]
 * @returns {Promise<void>}
 */
async function set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
    if (!redis) return;
    try {
        await redis.set(key, value, { ex: ttlSeconds });
    } catch (error) {
        console.warn(`[Cache] set falló (${key}):`, error.message);
    }
}

/**
 * Elimina todas las claves que empiezan por el prefijo (SCAN + DEL).
 * @param {string} prefix
 * @returns {Promise<void>}
 */
async function clearByPrefix(prefix) {
    if (!redis) return;
    try {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await redis.scan(cursor, {
                match: `${prefix}*`,
                count: 100
            });
            cursor = String(nextCursor);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== '0');
    } catch (error) {
        console.warn(`[Cache] clearByPrefix falló (${prefix}):`, error.message);
    }
}

export const statsCache = {
    get,
    set,
    clearByPrefix
};
