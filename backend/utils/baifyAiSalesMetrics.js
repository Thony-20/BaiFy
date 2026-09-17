import { adminDb } from '../config/firebase.js';
import { statsCache } from './cache.js';
import { notificationsCacheKey } from './notificationCache.js';
import { formatIntegerForAi, formatMoneyForAi } from './baifyAiFormat.js';

const DAILY_STATS_COLLECTION = 'metricas_diarias';
const PRODUCT_STATS_COLLECTION = 'metricas_productos_diarias';
const SALES_COLLECTION = 'ventas';
const BAIFY_AI_SALES_CACHE_TTL = 5 * 60;
const MAX_RANGE_DAYS = 90;
const MAX_TOP_PRODUCTS = 10;

function formatDateCaracas(dateRef = new Date()) {
    return dateRef.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
}

function parseDateOnly(str) {
    const match = String(str || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const d = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00-04:00`);
    return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetweenInclusive(fromStr, toStr) {
    const from = parseDateOnly(fromStr);
    const to = parseDateOnly(toStr);
    if (!from || !to) return null;
    const diff = Math.floor((to - from) / (86400000)) + 1;
    return diff;
}

/**
 * @param {'today'|'week'|'month'|'custom'} period
 * @param {string} [from]
 * @param {string} [to]
 */
export function resolveSalesDateRange(period = 'month', from, to) {
    const todayStr = formatDateCaracas(new Date());

    if (period === 'custom') {
        if (!from || !to) {
            return { error: 'Para period custom indica from y to (YYYY-MM-DD).' };
        }
        const span = daysBetweenInclusive(from, to);
        if (span == null || span < 1) {
            return { error: 'Fechas inválidas. Usa formato YYYY-MM-DD.' };
        }
        if (span > MAX_RANGE_DAYS) {
            return { error: `Rango máximo ${MAX_RANGE_DAYS} días.` };
        }
        return { from, to, period: 'custom' };
    }

    const end = new Date();
    const start = new Date();
    if (period === 'today') {
        return { from: todayStr, to: todayStr, period: 'today' };
    }
    if (period === 'week') {
        start.setDate(start.getDate() - 6);
        return { from: formatDateCaracas(start), to: formatDateCaracas(end), period: 'week' };
    }
    // month default: últimos 30 días
    start.setDate(start.getDate() - 29);
    return { from: formatDateCaracas(start), to: formatDateCaracas(end), period: 'month' };
}

function salesCacheKey(empresaId, from, to) {
    return `baify-ai-sales-${empresaId}-${from}-${to}`;
}

function rankingCacheKey(empresaId, limit, from, to) {
    return `ranking-${empresaId}-top-${limit}-${from}-${to}`;
}

/**
 * Métricas de ventas agregadas desde metricas_diarias (1 doc ≈ 1 lectura por día).
 */
function serializeSaleDate(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    return null;
}

export function pickSaleForAi(sale) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const cliente = sale.cliente && typeof sale.cliente === 'object' ? sale.cliente : {};
    return {
        comprobanteId: sale.id || sale._id || null,
        firestoreId: sale._id || null,
        total: sale.total ?? null,
        moneda: sale.moneda ?? null,
        fechaVenta: serializeSaleDate(sale.fechaVenta),
        clienteNombre: cliente.nombre || sale.clienteNombre || null,
        clienteCedula: cliente.cedula || cliente.clienteId || sale.clienteCedula || null,
        itemsCount: items.length,
        unidades: items.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0),
    };
}

/**
 * Últimas ventas (reutiliza caché history-* del API cuando existe).
 */
export async function getRecentSalesForAi(empresaId, limit = 5) {
    const safeLimit = Math.min(Math.max(1, limit), 8);
    const cacheKey = `history-${empresaId}-none-none-${safeLimit}`;

    const cached = await statsCache.get(cacheKey);
    if (cached?.sales) {
        return {
            sales: cached.sales.map(pickSaleForAi),
            fromCache: true,
        };
    }

    const snapshot = await adminDb
        .collection(SALES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .orderBy('fechaVenta', 'desc')
        .limit(safeLimit)
        .get();

    const sales = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            _id: doc.id,
            ...data,
            fechaVenta: serializeSaleDate(data.fechaVenta),
        };
    });

    const responseData = {
        sales,
        hasMore: false,
        lastDocId: sales.length > 0 ? sales[sales.length - 1]._id : null,
    };
    await statsCache.set(cacheKey, responseData, BAIFY_AI_SALES_CACHE_TTL);

    return { sales: sales.map(pickSaleForAi), fromCache: false };
}

/** Busca comprobante por número/id (máx. 1 query `in`). */
export async function findSaleByInvoiceIdForAi(empresaId, invoiceId) {
    const searchTerm = String(invoiceId || '').trim();
    if (searchTerm.length < 2) {
        return { found: false, message: 'Indica un número de comprobante válido.' };
    }

    const variations = [
        searchTerm,
        searchTerm.replace(/\s+/g, ''),
        searchTerm.replace(/\s+/g, '-'),
    ];
    const uniqueVariations = [...new Set(variations)].slice(0, 10);

    const idSnapshot = await adminDb
        .collection(SALES_COLLECTION)
        .where('id', 'in', uniqueVariations)
        .limit(10)
        .get();

    const match = idSnapshot.docs
        .map((doc) => ({ _id: doc.id, ...doc.data() }))
        .find((s) => s.empresaId === empresaId);

    if (!match) {
        return { found: false, sale: null };
    }

    return {
        found: true,
        sale: pickSaleForAi({
            ...match,
            fechaVenta: serializeSaleDate(match.fechaVenta),
        }),
    };
}

export async function getSalesSummaryForAi(empresaId, period = 'month', from, to) {
    const range = resolveSalesDateRange(period, from, to);
    if (range.error) return { error: range.error };

    const cacheKey = salesCacheKey(empresaId, range.from, range.to);
    const cached = await statsCache.get(cacheKey);
    if (cached) {
        return { ...cached, fromCache: true };
    }

    const snap = await adminDb
        .collection(DAILY_STATS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('date', '>=', range.from)
        .where('date', '<=', range.to)
        .get();

    let revenueBs = 0;
    let profitBs = 0;
    let orders = 0;
    let units = 0;
    let daysWithSales = 0;

    snap.docs.forEach((doc) => {
        const data = doc.data();
        const dayOrders = Number(data.orders || 0);
        if (dayOrders > 0) daysWithSales += 1;
        revenueBs += Number(data.revenueBs || 0);
        profitBs += Number(data.profitBs || 0);
        orders += dayOrders;
        units += Number(data.units || 0);
    });

    const payload = {
        period: range.period,
        from: range.from,
        to: range.to,
        totalOrders: orders,
        totalUnitsSold: units,
        totalRevenueBs: Math.round(revenueBs * 100) / 100,
        grossProfitBs: Math.round(profitBs * 100) / 100,
        averageTicketBs: orders > 0 ? Math.round((revenueBs / orders) * 100) / 100 : 0,
        daysWithSales,
        daysInRange: daysBetweenInclusive(range.from, range.to),
        note: 'Montos en Bs. históricos del periodo (metricas_diarias). No incluye reconversión BCV.',
    };

    await statsCache.set(cacheKey, payload, BAIFY_AI_SALES_CACHE_TTL);
    return { ...payload, fromCache: false };
}

/**
 * Top productos vendidos (reutiliza claves de ranking del API).
 */
export async function getTopSellingProductsForAi(
    empresaId,
    period = 'month',
    from,
    to,
    limit = 5
) {
    const range = resolveSalesDateRange(period, from, to);
    if (range.error) return { error: range.error };

    const safeLimit = Math.min(Math.max(1, limit), MAX_TOP_PRODUCTS);
    const cacheKey = rankingCacheKey(empresaId, safeLimit, range.from, range.to);
    const cached = await statsCache.get(cacheKey);
    if (cached?.data) {
        return {
            from: range.from,
            to: range.to,
            products: cached.data,
            fromCache: true,
        };
    }

    const rankingSnapshot = await adminDb
        .collection(PRODUCT_STATS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('date', '>=', range.from)
        .where('date', '<=', range.to)
        .get();

    const productSoldMap = new Map();
    rankingSnapshot.forEach((doc) => {
        const data = doc.data();
        const pid = data.productId;
        const unitsSold = Number(data.unitsSold || 0);
        if (!pid || unitsSold === 0) return;

        const existing = productSoldMap.get(pid) || {
            nombre: data.productName || 'Producto sin nombre',
            sku: data.sku || '',
            unidadesVendidas: 0,
        };
        productSoldMap.set(pid, {
            ...existing,
            unidadesVendidas: existing.unidadesVendidas + unitsSold,
        });
    });

    const products = Array.from(productSoldMap.values())
        .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)
        .slice(0, safeLimit);

    const response = {
        data: products,
        total: products.length,
        limit: safeLimit,
    };
    await statsCache.set(cacheKey, response, BAIFY_AI_SALES_CACHE_TTL);

    return {
        from: range.from,
        to: range.to,
        products,
        fromCache: false,
    };
}

/** Cuentas por cobrar / alertas financieras desde caché de notificaciones (0 Firestore). */
export async function getAccountAlertsForAi(empresaId, limit = 6) {
    const payload = await statsCache.get(notificationsCacheKey(empresaId));

    if (!payload?.items) {
        return {
            alerts: [],
            message: 'Abre notificaciones en BayFi para refrescar alertas de cuentas.',
        };
    }

    const alerts = payload.items
        .filter((item) => item.category === 'cuentas' || item.category === 'clientes')
        .slice(0, limit)
        .map((item) => ({
            category: item.category,
            severity: item.severity,
            title: item.title,
            message: item.message,
        }));

    return { alerts, summary: payload.summary ?? null };
}

/**
 * Plantilla markdown para reportes de ventas en BaiFy AI.
 * @param {{
 *   from: string,
 *   to: string,
 *   summary: object,
 *   topProducts?: object[],
 *   topRequested?: number,
 *   currencyLabel?: string,
 *   includeTop?: boolean,
 *   includeFinancial?: boolean,
 * }} params
 */
export function buildSalesReportPresentation({
    from,
    to,
    summary,
    topProducts = [],
    topRequested,
    currencyLabel,
    includeTop = true,
    includeFinancial = true,
}) {
    const ingreso =
        summary.totalRevenueFormatted
        ?? formatMoneyForAi(summary.totalRevenueBs, currencyLabel);
    const ventas = formatIntegerForAi(summary.totalOrders);
    const ticket =
        summary.averageTicketFormatted
        ?? formatMoneyForAi(summary.averageTicketBs, currencyLabel);

    const financialBlock = [
        `**Resumen financiero** (${from} a ${to})`,
        `- **Ingreso:** ${ingreso ?? 'no disponible'}`,
        `- **Ventas:** ${ventas ?? '0'}`,
        `- **Ticket promedio:** ${ticket ?? 'no disponible'}`,
    ].join('\n');

    if (!includeTop && includeFinancial) {
        return {
            presentationHint: financialBlock,
            topRequested: topRequested ?? null,
            topReturned: 0,
            topShortfallNote: null,
        };
    }

    const requested = topRequested ?? topProducts.length;
    const returned = topProducts.length;
    const topLines = topProducts.map((p, index) => {
        const units =
            p.unidadesFormatted ?? formatIntegerForAi(p.unidadesVendidas);
        const name = p.nombre || 'Producto sin nombre';
        return `${index + 1}. **${name}** — **${units}** uds.`;
    });

    const topTitle = includeFinancial
        ? '**Top productos**'
        : `**Top productos** (${from} a ${to})`;
    let topBlock = topTitle;
    if (topLines.length === 0) {
        topBlock += '\nSin productos con ventas en el periodo.';
    } else {
        topBlock += `\n${topLines.join('\n')}`;
    }

    let topShortfallNote = null;
    if (requested > returned) {
        if (returned === 0) {
            topShortfallNote =
                `Nota: pediste top ${requested}; no hay productos con ventas registradas en este periodo.`;
        } else {
            topShortfallNote =
                `Nota: pediste top ${requested}; solo **${returned}** producto(s) tuvieron ventas en el periodo.`;
        }
    }

    const blocks = [];
    if (includeFinancial) blocks.push(financialBlock);
    blocks.push(topBlock);
    if (topShortfallNote) blocks.push(topShortfallNote);

    return {
        presentationHint: blocks.join('\n\n'),
        topRequested: requested,
        topReturned: returned,
        topShortfallNote,
    };
}

/** Resumen + top productos en una sola tool (menos pasos = menos cuota Gemini). */
export async function getSalesReportForAi(
    empresaId,
    period = 'month',
    from,
    to,
    topLimit = 5
) {
    const [summary, top] = await Promise.all([
        getSalesSummaryForAi(empresaId, period, from, to),
        getTopSellingProductsForAi(empresaId, period, from, to, topLimit),
    ]);

    if (summary.error) return { error: summary.error };
    if (top.error) return { error: top.error };

    return {
        period: summary.period,
        from: summary.from,
        to: summary.to,
        summary,
        topProducts: top.products,
        topLimitRequested: topLimit,
    };
}

export async function clearBaifyAiSalesCache(empresaId) {
    if (!empresaId) return;
    await Promise.all([
        statsCache.clearByPrefix(`baify-ai-sales-${empresaId}`),
        statsCache.clearByPrefix(`history-${empresaId}`),
    ]);
}
