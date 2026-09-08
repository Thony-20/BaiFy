import { statsCache } from './cache.js';

/** TTL corto: las alertas toleran 1–2 min de desfase. */
export const NOTIFICATIONS_CACHE_TTL_SECONDS = 120;

/**
 * @param {string} empresaId
 * @returns {string}
 */
export function notificationsCacheKey(empresaId) {
    return `notifications-${empresaId}`;
}

/**
 * Invalida la caché de notificaciones de una empresa.
 * @param {string} empresaId
 * @returns {Promise<void>}
 */
export async function clearNotificationsCache(empresaId) {
    if (!empresaId) return;
    await statsCache.clearByPrefix(notificationsCacheKey(empresaId));
}
