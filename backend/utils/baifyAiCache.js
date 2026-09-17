import { adminDb } from '../config/firebase.js';
import { statsCache } from './cache.js';
import { notificationsCacheKey } from './notificationCache.js';

/** Perfil usuario → empresa (nombre, moneda). */
export const BAIFY_AI_TENANT_TTL_SECONDS = 30 * 60;

/** Resumen de métricas para el prompt. */
export const BAIFY_AI_SNAPSHOT_TTL_SECONDS = 10 * 60;

const PRODUCTOS_COLLECTION = 'productos';

const tenantCacheKey = (uid) => `baify-ai-tenant:${uid}`;
const snapshotCacheKey = (empresaId) => `baify-ai-snapshot:${empresaId}`;

/** Solo si falta en empresa_stats: 1 agregación count (máx. cada TTL de snapshot). */
async function resolveProductCount(empresaId, stats) {
    const fromStats = toNumber(stats.productCount);
    if (fromStats != null) return fromStats;

    try {
        const countSnap = await adminDb
            .collection(PRODUCTOS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .count()
            .get();
        return countSnap.data().count ?? 0;
    } catch (error) {
        console.warn('[BaifyAiCache] productCount fallback:', error.message);
        return null;
    }
}

function serializeDate(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    if (typeof val._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
    if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
    return null;
}

function toNumber(val) {
    if (val == null) return null;
    const n = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(n) ? n : null;
}

/**
 * Invalida el snapshot de IA de una empresa (llamar tras ventas, stock, productos, etc.).
 * @param {string} empresaId
 */
export async function clearBaifyAiSnapshotCache(empresaId) {
    if (!empresaId) return;
    await statsCache.clearByPrefix(snapshotCacheKey(empresaId));
    const { clearBaifyAiSalesCache } = await import('./baifyAiSalesMetrics.js');
    await clearBaifyAiSalesCache(empresaId);
}

/**
 * Contexto del comercio autenticado. Cache Redis → si no, 2 lecturas (usuario + empresa).
 * @param {string} uid
 */
export async function resolveBaifyAiTenant(uid) {
    const cached = await statsCache.get(tenantCacheKey(uid));
    if (cached && typeof cached === 'object' && cached.tenantId) {
        return { ...cached, fromCache: true };
    }

    const userSnap = await adminDb.collection('usuarios').doc(uid).get();
    if (!userSnap.exists) {
        return { error: 'Perfil de usuario no encontrado', status: 404 };
    }

    const profile = userSnap.data();
    const empresaId = profile.empresaId;
    if (!empresaId) {
        return { error: 'El usuario no tiene empresa asociada', status: 400 };
    }

    const empresaSnap = await adminDb.collection('empresas').doc(empresaId).get();
    const empresaData = empresaSnap.exists ? empresaSnap.data() : {};

    const tenant = {
        tenantId: empresaId,
        businessName: empresaData.nombre || 'Tu comercio',
        currencyLabel:
            empresaData.moneda ||
            empresaData.currency ||
            profile.moneda ||
            'la moneda configurada en la cuenta',
        rol: profile.rol || null,
        lowStockThreshold: empresaData.lowStockThreshold ?? 5,
        cachedAt: new Date().toISOString(),
    };

    await statsCache.set(tenantCacheKey(uid), tenant, BAIFY_AI_TENANT_TTL_SECONDS);
    return { ...tenant, fromCache: false };
}

/**
 * Snapshot compacto para el system prompt. Cache Redis → si no, 1 lectura empresa_stats
 * (+ alertas solo si ya están en caché de notificaciones, sin disparar queries pesadas).
 * @param {string} empresaId
 */
export async function getBusinessSnapshot(empresaId) {
    const cached = await statsCache.get(snapshotCacheKey(empresaId));
    if (
        cached &&
        typeof cached === 'object' &&
        cached.empresaId === empresaId &&
        cached.stats?.productCount != null
    ) {
        return { snapshot: cached, fromCache: true };
    }

    const statsSnap = await adminDb.collection('empresa_stats').doc(empresaId).get();
    const stats = statsSnap.exists ? statsSnap.data() : {};
    const productCount = await resolveProductCount(empresaId, stats);

    const notifPayload = await statsCache.get(notificationsCacheKey(empresaId));
    const alertsSummary =
        notifPayload &&
        typeof notifPayload === 'object' &&
        notifPayload.summary &&
        typeof notifPayload.summary === 'object'
            ? {
                  total: notifPayload.summary.total ?? null,
                  inventario: notifPayload.summary.inventario ?? null,
                  clientes: notifPayload.summary.clientes ?? null,
                  cuentas: notifPayload.summary.cuentas ?? null,
                  critical: notifPayload.summary.critical ?? null,
                  warning: notifPayload.summary.warning ?? null,
              }
            : null;

    const snapshot = {
        empresaId,
        generatedAt: new Date().toISOString(),
        stats: {
            productCount,
            totalStock: toNumber(stats.totalStock),
            totalInventoryValue: toNumber(stats.totalInventoryValue),
            totalCostValue: toNumber(stats.totalCostValue),
            totalSalesCount: toNumber(stats.totalSalesCount),
            totalSalesAmount: toNumber(stats.totalSalesAmount),
            lastSaleDate: serializeDate(stats.lastSaleDate),
        },
        alerts: alertsSummary,
    };

    await statsCache.set(snapshotCacheKey(empresaId), snapshot, BAIFY_AI_SNAPSHOT_TTL_SECONDS);
    return { snapshot, fromCache: false };
}
