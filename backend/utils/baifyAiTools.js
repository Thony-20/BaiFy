import { adminDb } from '../config/firebase.js';
import { statsCache } from './cache.js';
import { notificationsCacheKey } from './notificationCache.js';
import {
    buildSearchHitsCacheKey,
    fetchSearchHitsFromFirestore,
    MIN_SEARCH_LENGTH,
    normalizeSearchTerm,
    SEARCH_CACHE_TTL_SECONDS,
} from './productSearch.js';
import { z } from 'zod';
import { tool } from 'ai';
import { findClientByCedula, serializeClient } from '../controllers/client.controller.js';
import {
    findSaleByInvoiceIdForAi,
    getAccountAlertsForAi,
    getRecentSalesForAi,
    buildSalesReportPresentation,
    getSalesReportForAi,
    getSalesSummaryForAi,
    getTopSellingProductsForAi,
} from './baifyAiSalesMetrics.js';
import { formatIntegerForAi, formatMoneyForAi } from './baifyAiFormat.js';

const PRODUCTOS_COLLECTION = 'productos';
const CLIENTES_COLLECTION = 'clientes';
const MAX_TOOL_RESULTS = 8;

function maxToolCallsPerRequest() {
    const fromEnv = Number(process.env.BAIFY_AI_MAX_TOOL_CALLS);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.min(4, Math.floor(fromEnv));
    const freeTier = process.env.BAIFY_AI_FREE_TIER !== '0';
    return freeTier ? 2 : 4;
}

function serializeProductDates(data) {
    const serialized = { ...data };
    if (serialized.fechaVencimiento?.toDate) {
        serialized.fechaVencimiento = serialized.fechaVencimiento.toDate().toISOString();
    }
    return serialized;
}

export function pickProductForAi(product) {
    return {
        id: product.id,
        nombre: product.nombre ?? null,
        sku: product.sku ?? null,
        stock: product.stock ?? null,
        precio: product.precio ?? null,
        costo: product.costo ?? null,
        estado: product.estado ?? null,
        fechaVencimiento: product.fechaVencimiento ?? null,
    };
}

export function pickClientForAi(client, currencyLabel) {
    const limite = client.limiteCredito ?? null;
    return {
        id: client.id,
        nombre: client.nombre ?? null,
        clienteId: client.clienteId ?? null,
        telefono: client.telefono ?? null,
        puntosSaldo: client.puntosSaldo ?? null,
        nivel: client.nivel ?? null,
        creditoEstado: client.creditoEstado ?? null,
        limiteCredito: limite,
        limiteCreditoFormatted: formatMoneyForAi(limite, currencyLabel),
        ultimaCompraAt: client.ultimaCompraAt ?? null,
        primeraCompraAt: client.primeraCompraAt ?? null,
    };
}

function withProductMoney(products, currencyLabel) {
    return products.map((p) => ({
        ...p,
        precioFormatted: formatMoneyForAi(p.precio, currencyLabel),
        costoFormatted: formatMoneyForAi(p.costo, currencyLabel),
    }));
}

function withSalesSummaryMoney(summary, currencyLabel) {
    if (summary.error) return summary;
    return {
        ...summary,
        totalRevenueFormatted: formatMoneyForAi(summary.totalRevenueBs, currencyLabel),
        grossProfitFormatted: formatMoneyForAi(summary.grossProfitBs, currencyLabel),
        averageTicketFormatted: formatMoneyForAi(summary.averageTicketBs, currencyLabel),
    };
}

function withSaleMoney(sale, currencyLabel) {
    if (!sale) return sale;
    return {
        ...sale,
        totalFormatted: formatMoneyForAi(sale.total, currencyLabel),
    };
}

/**
 * @param {string} empresaId
 * @param {string} query
 * @param {number} limit
 */
export async function searchProductsForAi(empresaId, query, limit = 5) {
    const searchTerm = String(query || '').trim();
    const safeLimit = Math.min(Math.max(1, limit), MAX_TOOL_RESULTS);

    if (normalizeSearchTerm(searchTerm).length < MIN_SEARCH_LENGTH) {
        return { products: [], message: 'Escribe al menos 2 caracteres para buscar.' };
    }

    const cacheKey = buildSearchHitsCacheKey(empresaId, searchTerm, 'activo');
    const cached = await statsCache.get(cacheKey);

    let products;
    if (cached && Array.isArray(cached.products)) {
        products = cached.products;
    } else {
        const result = await fetchSearchHitsFromFirestore({
            adminDb,
            empresaId,
            search: searchTerm,
            estado: 'activo',
            serializeProductDates,
        });
        products = result.products;
        if (products.length > 0) {
            await statsCache.set(
                cacheKey,
                { products, mayHaveMore: result.mayHaveMore },
                SEARCH_CACHE_TTL_SECONDS
            );
        }
    }

    const sliced = products.slice(0, safeLimit).map(pickProductForAi);
    return {
        products: sliced,
        totalMatches: products.length,
        truncated: products.length > safeLimit,
    };
}

/**
 * @param {string} empresaId
 * @param {number} lowStockThreshold
 * @param {number} limit
 */
export async function listLowStockProductsForAi(empresaId, lowStockThreshold = 5, limit = 8) {
    const safeLimit = Math.min(Math.max(1, limit), MAX_TOOL_RESULTS);
    const cacheKey = `products-lowstock-${empresaId}-${safeLimit}`;

    const cached = await statsCache.get(cacheKey);
    if (cached?.products) {
        return {
            products: cached.products.map(pickProductForAi),
            lowStockThreshold,
            fromCache: true,
        };
    }

    const snapshot = await adminDb
        .collection(PRODUCTOS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('estado', '==', 'activo')
        .where('stock', '<=', lowStockThreshold)
        .orderBy('stock', 'asc')
        .limit(safeLimit)
        .get();

    const products = snapshot.docs.map((doc) =>
        pickProductForAi({ id: doc.id, ...serializeProductDates(doc.data()) })
    );

    const payload = { products, hasMore: snapshot.size >= safeLimit, lastDocId: null };
    await statsCache.set(cacheKey, payload);

    return { products, lowStockThreshold, fromCache: false };
}

/** Alertas de inventario desde caché de notificaciones (0 lecturas Firestore). */
export async function getInventoryAlertsForAi(empresaId, limit = 8) {
    const safeLimit = Math.min(Math.max(1, limit), MAX_TOOL_RESULTS);
    const payload = await statsCache.get(notificationsCacheKey(empresaId));

    if (!payload?.items) {
        return {
            alerts: [],
            message:
                'No hay alertas en caché. Sugiere al usuario abrir el campanita de notificaciones en BayFi para refrescar.',
        };
    }

    const alerts = payload.items
        .filter((item) => item.category === 'inventario')
        .slice(0, safeLimit)
        .map((item) => ({
            severity: item.severity,
            title: item.title,
            message: item.message,
            productId: item.meta?.productId ?? null,
        }));

    return { alerts, summary: payload.summary ?? null };
}

export async function getClientByCedulaForAi(empresaId, cedulaInput, currencyLabel) {
    const client = await findClientByCedula(empresaId, cedulaInput);
    if (!client) {
        return { found: false, client: null };
    }
    return { found: true, client: pickClientForAi(client, currencyLabel) };
}

export async function searchClientsByNameForAi(empresaId, name, limit = 5, currencyLabel) {
    const q = String(name || '').trim();
    const safeLimit = Math.min(Math.max(1, limit), MAX_TOOL_RESULTS);

    if (q.length < 2) {
        return { clients: [], message: 'Nombre demasiado corto (mín. 2 caracteres).' };
    }

    try {
        const snapshot = await adminDb
            .collection(CLIENTES_COLLECTION)
            .where('empresaId', '==', empresaId)
            .orderBy('nombre')
            .startAt(q)
            .endAt(`${q}\uf8ff`)
            .limit(safeLimit)
            .get();

        const clients = snapshot.docs.map((doc) =>
            pickClientForAi(serializeClient(doc.id, doc.data()), currencyLabel)
        );
        return { clients, total: clients.length };
    } catch (error) {
        console.warn('[BaifyAiTools] searchClientsByName:', error.message);
        return {
            clients: [],
            message: 'No pude buscar por nombre. Pide la cédula del cliente.',
        };
    }
}

/**
 * Herramientas Gemini con empresaId fijado en servidor.
 * @param {{ tenantId: string, businessName: string, lowStockThreshold?: number, currencyLabel?: string }} ctx
 */
export function createBaifyAiTools(ctx) {
    const empresaId = ctx.tenantId;
    const lowStockThreshold = ctx.lowStockThreshold ?? 5;
    const currencyLabel = ctx.currencyLabel || 'Bs.';
    let toolCalls = 0;

    const guard = async (fn) => {
        toolCalls += 1;
        if (toolCalls > maxToolCallsPerRequest()) {
            return {
                error: 'Límite de consultas a datos alcanzado en este mensaje. Responde con lo obtenido.',
            };
        }
        return fn();
    };

    return {
        searchProducts: tool({
            description:
                `Busca productos activos de ${ctx.businessName} por nombre o SKU. Usar cuando pregunten por un producto concreto o stock de un ítem.`,
            inputSchema: z.object({
                query: z.string().min(2).describe('Nombre o SKU del producto'),
                limit: z.number().int().min(1).max(MAX_TOOL_RESULTS).optional(),
            }),
            execute: async ({ query, limit }) =>
                guard(async () => {
                    const result = await searchProductsForAi(empresaId, query, limit ?? 5);
                    return { ...result, products: withProductMoney(result.products || [], currencyLabel) };
                }),
        }),

        listLowStockProducts: tool({
            description:
                `Lista productos con stock bajo (≤ umbral) de ${ctx.businessName}. Usar cuando pregunten qué falta en inventario o stock crítico.`,
            inputSchema: z.object({
                limit: z.number().int().min(1).max(MAX_TOOL_RESULTS).optional(),
            }),
            execute: async ({ limit }) =>
                guard(async () => {
                    const result = await listLowStockProductsForAi(
                        empresaId,
                        lowStockThreshold,
                        limit ?? 8
                    );
                    return { ...result, products: withProductMoney(result.products || [], currencyLabel) };
                }),
        }),

        getInventoryAlerts: tool({
            description:
                `Obtiene alertas de inventario (agotado, bajo stock, vencimientos) ya calculadas para ${ctx.businessName}.`,
            inputSchema: z.object({
                limit: z.number().int().min(1).max(MAX_TOOL_RESULTS).optional(),
            }),
            execute: async ({ limit }) =>
                guard(() => getInventoryAlertsForAi(empresaId, limit ?? 8)),
        }),

        getClientByCedula: tool({
            description:
                `Busca un cliente de ${ctx.businessName} por cédula/documento. Usar cuando den un número de identificación.`,
            inputSchema: z.object({
                cedula: z.string().min(5).describe('Cédula o documento del cliente'),
            }),
            execute: async ({ cedula }) =>
                guard(() => getClientByCedulaForAi(empresaId, cedula, currencyLabel)),
        }),

        searchClientsByName: tool({
            description:
                `Busca clientes de ${ctx.businessName} por nombre (prefijo). Usar si mencionan un nombre sin cédula.`,
            inputSchema: z.object({
                name: z.string().min(2).describe('Nombre o parte del nombre'),
                limit: z.number().int().min(1).max(MAX_TOOL_RESULTS).optional(),
            }),
            execute: async ({ name, limit }) =>
                guard(() => searchClientsByNameForAi(empresaId, name, limit ?? 5, currencyLabel)),
        }),

        getSalesReport: tool({
            description:
                `PREFERIR cuando pidan ventas Y top productos juntos. Devuelve resumen del periodo + ranking en una sola consulta (${ctx.businessName}).`,
            inputSchema: z.object({
                period: z.enum(['today', 'week', 'month', 'custom']).optional(),
                from: z.string().optional(),
                to: z.string().optional(),
                topLimit: z.number().int().min(1).max(10).optional(),
            }),
            execute: async ({ period, from, to, topLimit }) =>
                guard(async () => {
                    const safeTop = topLimit ?? 5;
                    const report = await getSalesReportForAi(
                        empresaId,
                        period ?? 'month',
                        from,
                        to,
                        safeTop
                    );
                    if (report.error) return report;
                    const summary = withSalesSummaryMoney(report.summary, currencyLabel);
                    const topProducts = (report.topProducts || []).map((p, index) => ({
                        ...p,
                        rank: index + 1,
                        unidadesFormatted: formatIntegerForAi(p.unidadesVendidas),
                    }));
                    const presentation = buildSalesReportPresentation({
                        from: report.from,
                        to: report.to,
                        summary,
                        topProducts,
                        topRequested: safeTop,
                        currencyLabel,
                        includeTop: true,
                    });
                    return {
                        ...report,
                        summary,
                        topProducts,
                        ...presentation,
                        respondWith:
                            'Copia presentationHint al usuario tal cual (viñetas + lista numerada + negritas). No lo conviertas en párrafo.',
                    };
                }),
        }),

        getSalesSummary: tool({
            description:
                `Solo resumen de ventas de ${ctx.businessName} (usa getSalesReport si también piden top productos).`,
            inputSchema: z.object({
                period: z
                    .enum(['today', 'week', 'month', 'custom'])
                    .optional()
                    .describe('today, week (7d), month (30d) o custom'),
                from: z.string().optional().describe('YYYY-MM-DD si period=custom'),
                to: z.string().optional().describe('YYYY-MM-DD si period=custom'),
            }),
            execute: async ({ period, from, to }) =>
                guard(async () => {
                    const raw = await getSalesSummaryForAi(
                        empresaId,
                        period ?? 'month',
                        from,
                        to
                    );
                    if (raw.error) return raw;
                    const summary = withSalesSummaryMoney(raw, currencyLabel);
                    const presentation = buildSalesReportPresentation({
                        from: raw.from,
                        to: raw.to,
                        summary,
                        currencyLabel,
                        includeTop: false,
                    });
                    return {
                        ...summary,
                        ...presentation,
                        respondWith:
                            'Usa solo la sección Resumen financiero de presentationHint (viñetas y negritas).',
                    };
                }),
        }),

        getTopSellingProducts: tool({
            description:
                `Solo top productos vendidos de ${ctx.businessName} (usa getSalesReport si también piden resumen de ventas).`,
            inputSchema: z.object({
                period: z.enum(['today', 'week', 'month', 'custom']).optional(),
                from: z.string().optional(),
                to: z.string().optional(),
                limit: z.number().int().min(1).max(10).optional(),
            }),
            execute: async ({ period, from, to, limit }) =>
                guard(async () => {
                    const safeLimit = limit ?? 5;
                    const top = await getTopSellingProductsForAi(
                        empresaId,
                        period ?? 'month',
                        from,
                        to,
                        safeLimit
                    );
                    if (top.error) return top;
                    const topProducts = (top.products || []).map((p, index) => ({
                        ...p,
                        rank: index + 1,
                        unidadesFormatted: formatIntegerForAi(p.unidadesVendidas),
                    }));
                    const presentation = buildSalesReportPresentation({
                        from: top.from,
                        to: top.to,
                        summary: {},
                        topProducts,
                        topRequested: safeLimit,
                        currencyLabel,
                        includeTop: true,
                        includeFinancial: false,
                    });
                    return {
                        from: top.from,
                        to: top.to,
                        periodLabel: `${top.from} a ${top.to}`,
                        products: topProducts,
                        topRequested: safeLimit,
                        topReturned: topProducts.length,
                        presentationHint: presentation.presentationHint,
                        topShortfallNote: presentation.topShortfallNote,
                        respondWith:
                            'Responde con **Top productos** en lista numerada (presentationHint), negritas en nombres y unidades; incluye la Nota si aplica.',
                    };
                }),
        }),

        getAccountAlerts: tool({
            description:
                `Alertas de cuentas por cobrar y clientes (desde caché) para ${ctx.businessName}.`,
            inputSchema: z.object({
                limit: z.number().int().min(1).max(MAX_TOOL_RESULTS).optional(),
            }),
            execute: async ({ limit }) =>
                guard(() => getAccountAlertsForAi(empresaId, limit ?? 6)),
        }),

        getRecentSales: tool({
            description:
                `Últimas ventas/comprobantes de ${ctx.businessName} (más recientes primero).`,
            inputSchema: z.object({
                limit: z.number().int().min(1).max(8).optional(),
            }),
            execute: async ({ limit }) =>
                guard(async () => {
                    const result = await getRecentSalesForAi(empresaId, limit ?? 5);
                    return {
                        ...result,
                        sales: (result.sales || []).map((s) => withSaleMoney(s, currencyLabel)),
                    };
                }),
        }),

        findSaleByInvoiceId: tool({
            description:
                `Busca un comprobante/venta de ${ctx.businessName} por su número de factura o ID.`,
            inputSchema: z.object({
                invoiceId: z.string().min(2).describe('Número o ID del comprobante'),
            }),
            execute: async ({ invoiceId }) =>
                guard(async () => {
                    const result = await findSaleByInvoiceIdForAi(empresaId, invoiceId);
                    if (result.sale) {
                        result.sale = withSaleMoney(result.sale, currencyLabel);
                    }
                    return result;
                }),
        }),
    };
}
