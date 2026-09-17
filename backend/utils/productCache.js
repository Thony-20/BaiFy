import { statsCache } from './cache.js';
import { clearNotificationsCache } from './notificationCache.js';
import { clearBaifyAiSnapshotCache } from './baifyAiCache.js';

/**
 * Invalida toda la caché de productos de una empresa.
 * @param {string} empresaId
 * @returns {Promise<void>}
 */
export async function clearProductCaches(empresaId) {
    await Promise.all([
        statsCache.clearByPrefix(`products-all-${empresaId}`),
        statsCache.clearByPrefix(`products-search-${empresaId}`),
        statsCache.clearByPrefix(`products-search-hits-${empresaId}`),
        statsCache.clearByPrefix(`dashboard-${empresaId}`),
        statsCache.clearByPrefix(`ranking-${empresaId}`),
        statsCache.clearByPrefix(`products-lowstock-${empresaId}`),
        statsCache.clearByPrefix(`products-expiring-${empresaId}`),
        statsCache.clearByPrefix(`products-expired-${empresaId}`),
        clearNotificationsCache(empresaId),
        clearBaifyAiSnapshotCache(empresaId),
    ]);
}
