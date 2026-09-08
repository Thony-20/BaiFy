import { adminDb } from '../config/firebase.js';
import { normalizeCedula, computeAccountEstado } from './account.controller.js';
import {
    aggregateClientSales,
    getSaleCedula,
    mergeClientMetrics,
    toDate,
} from '../utils/clientAnalytics.js';
import { buildOpportunityItems } from '../utils/clientOpportunities.js';
import { getEmpresaLoyaltyConfig } from '../utils/loyaltyConfig.js';
import { resolveClientLevel, LOYALTY_LEVELS } from '../utils/loyaltyPoints.js';
import { getStartOfDayCaracas } from '../utils/dateUtils.js';
import { serializeClientForLoyalty } from './client.controller.js';
import { statsCache } from '../utils/cache.js';
import {
    NOTIFICATIONS_CACHE_TTL_SECONDS,
    notificationsCacheKey,
} from '../utils/notificationCache.js';

const CLIENTES_COLLECTION = 'clientes';
const SALES_COLLECTION = 'ventas';
const PRODUCTOS_COLLECTION = 'productos';
const CUENTAS_COLLECTION = 'cuentas';
const EMPRESAS_COLLECTION = 'empresas';

const MAX_PER_GROUP = 8;

const serializeDate = (val) => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    if (typeof val._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
    if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
    return null;
};

const calendarDayKeyCaracas = (date) => {
    const d = toDate(date);
    if (!d) return null;
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
};

const groupSalesByCedula = (docs) => {
    const grouped = new Map();
    docs.forEach((doc) => {
        const sale = { ...doc.data(), firestoreId: doc.id };
        const cedula = normalizeCedula(getSaleCedula(sale));
        if (!cedula) return;
        const current = grouped.get(cedula) || [];
        current.push(sale);
        grouped.set(cedula, current);
    });
    return grouped;
};

const buildClientNotifications = async (empresaId) => {
    const [clientsSnapshot, salesSnapshot, config] = await Promise.all([
        adminDb.collection(CLIENTES_COLLECTION).where('empresaId', '==', empresaId).get(),
        adminDb.collection(SALES_COLLECTION).where('empresaId', '==', empresaId).get(),
        getEmpresaLoyaltyConfig(empresaId),
    ]);

    const salesByCedula = groupSalesByCedula(salesSnapshot.docs);
    const registered = clientsSnapshot.docs.map((doc) => serializeClientForLoyalty(doc.id, doc.data()));
    const known = new Set(registered.map((client) => normalizeCedula(client.clienteId)).filter(Boolean));

    const saleOnly = [...salesByCedula.entries()]
        .filter(([cedula]) => cedula && !known.has(cedula))
        .map(([cedula, sales]) => {
            const latest = sales[0] || {};
            const cliente = latest.cliente && typeof latest.cliente === 'object' ? latest.cliente : {};
            return {
                id: `venta-${cedula}`,
                empresaId,
                clienteId: cedula,
                nombre: String(cliente.nombre || 'Cliente').trim(),
                telefono: String(cliente.telefono || '').replace(/\D/g, ''),
                puntosSaldo: 0,
                nivel: LOYALTY_LEVELS.NUEVO,
            };
        });

    const clients = [...registered, ...saleOnly].map((client) => {
        const cedula = normalizeCedula(client.clienteId);
        const sales = cedula ? (salesByCedula.get(cedula) || []) : [];
        const metrics = mergeClientMetrics(
            aggregateClientSales(sales),
            {
                ultimaCompraAt: client.ultimaCompraAt,
                primeraCompraAt: client.primeraCompraAt,
            }
        );
        return {
            ...client,
            ...metrics,
            productoMasComprado: metrics.topProducts[0] || null,
            nivel: resolveClientLevel({
                totalGastado: metrics.totalGastado,
                comprasCount: metrics.comprasCount,
                primeraCompraAt: metrics.primeraCompraAt,
                config,
            }),
        };
    });

    const { items } = buildOpportunityItems(clients, config);
    const prioritized = items.filter((item) => (
        item.segmento === 'riesgo'
        || item.segmento === 'recompra'
        || item.segmento === 'vip'
        || item.segmento === 'nuevo'
    ));

    return prioritized.slice(0, MAX_PER_GROUP * 2).map((item) => {
        const canOpen = item.clienteDocId && !String(item.clienteDocId).startsWith('venta-');
        const titleBySegment = {
            riesgo: 'Cliente en riesgo',
            recompra: 'Recompra sugerida',
            vip: 'Cliente VIP',
            nuevo: 'Cliente nuevo',
        };
        return {
            id: `client-${item.segmento}-${item.clienteId || item.nombre}`,
            category: 'clientes',
            severity: item.segmento === 'riesgo' ? 'warning' : 'info',
            title: titleBySegment[item.segmento] || 'Oportunidad de cliente',
            message: `${item.nombre} — ${item.mensaje}`,
            href: canOpen ? `/clientes/${item.clienteDocId}` : '/clientes',
            meta: {
                segmento: item.segmento,
                clienteId: item.clienteId,
            },
            createdAt: new Date().toISOString(),
        };
    });
};

const buildInventoryNotifications = async (empresaId) => {
    const empresaSnap = await adminDb.collection(EMPRESAS_COLLECTION).doc(empresaId).get();
    const empresa = empresaSnap.exists ? empresaSnap.data() : {};
    const lowStockThreshold = empresa.lowStockThreshold ?? 5;
    const expirationMonths = empresa.expirationAlertThreshold || 2;

    const todayStart = getStartOfDayCaracas(new Date());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const expirationLimit = new Date(todayStart);
    expirationLimit.setMonth(expirationLimit.getMonth() + expirationMonths);
    expirationLimit.setHours(23, 59, 59, 999);

    const [lowStockSnap, expiringSnap, expiredSnap] = await Promise.all([
        adminDb.collection(PRODUCTOS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('estado', '==', 'activo')
            .where('stock', '<=', lowStockThreshold)
            .orderBy('stock', 'asc')
            .limit(MAX_PER_GROUP)
            .get()
            .catch(() => ({ docs: [] })),
        adminDb.collection(PRODUCTOS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('estado', '==', 'activo')
            .where('fechaVencimiento', '>=', tomorrowStart)
            .where('fechaVencimiento', '<=', expirationLimit)
            .orderBy('fechaVencimiento', 'asc')
            .limit(MAX_PER_GROUP)
            .get()
            .catch(() => ({ docs: [] })),
        adminDb.collection(PRODUCTOS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('fechaVencimiento', '<', tomorrowStart)
            .orderBy('fechaVencimiento', 'desc')
            .limit(MAX_PER_GROUP)
            .get()
            .catch(() => ({ docs: [] })),
    ]);

    const notifications = [];

    lowStockSnap.docs.forEach((doc) => {
        const data = doc.data();
        const stock = Number(data.stock) || 0;
        notifications.push({
            id: `inv-low-${doc.id}`,
            category: 'inventario',
            severity: stock <= 0 ? 'critical' : 'warning',
            title: stock <= 0 ? 'Producto agotado' : 'Stock crítico',
            message: `${data.nombre || 'Producto'} — ${stock} uds. (umbral ≤ ${lowStockThreshold})`,
            href: '/productos',
            meta: { productId: doc.id, stock },
            createdAt: serializeDate(data.updatedAt) || new Date().toISOString(),
        });
    });

    expiringSnap.docs.forEach((doc) => {
        const data = doc.data();
        notifications.push({
            id: `inv-expiring-${doc.id}`,
            category: 'inventario',
            severity: 'warning',
            title: 'Próximo a vencer',
            message: `${data.nombre || 'Producto'} vence el ${calendarDayKeyCaracas(data.fechaVencimiento) || '—'}`,
            href: '/productos',
            meta: { productId: doc.id },
            createdAt: serializeDate(data.fechaVencimiento) || new Date().toISOString(),
        });
    });

    expiredSnap.docs.forEach((doc) => {
        const data = doc.data();
        notifications.push({
            id: `inv-expired-${doc.id}`,
            category: 'inventario',
            severity: 'critical',
            title: 'Producto vencido',
            message: `${data.nombre || 'Producto'} venció el ${calendarDayKeyCaracas(data.fechaVencimiento) || '—'}`,
            href: '/productos',
            meta: { productId: doc.id },
            createdAt: serializeDate(data.fechaVencimiento) || new Date().toISOString(),
        });
    });

    return notifications;
};

const buildAccountNotifications = async (empresaId) => {
    const snapshot = await adminDb.collection(CUENTAS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('tipo', '==', 'por_cobrar')
        .get();

    const now = new Date();
    const todayKey = calendarDayKeyCaracas(now);
    const notifications = [];

    snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const pendiente = Number(data.montoPendiente) || 0;
        if (pendiente <= 0.009) return;

        const estado = computeAccountEstado(
            data.montoTotal,
            data.montoPendiente,
            data.fechaVencimiento,
            now
        );
        const dueKey = calendarDayKeyCaracas(data.fechaVencimiento);
        const nombre = data.clienteNombre || 'Cliente';
        const monto = pendiente.toFixed(2);

        if (estado === 'vencido') {
            notifications.push({
                id: `acc-overdue-${doc.id}`,
                category: 'cuentas',
                severity: 'critical',
                title: 'Cuenta por cobrar vencida',
                message: `${nombre} — $${monto} atrasados`,
                href: '/cuentas',
                meta: { accountId: doc.id, clienteId: data.clienteId },
                createdAt: serializeDate(data.fechaVencimiento) || new Date().toISOString(),
            });
            return;
        }

        if (dueKey && todayKey && dueKey === todayKey) {
            notifications.push({
                id: `acc-due-today-${doc.id}`,
                category: 'cuentas',
                severity: 'warning',
                title: 'Vence hoy',
                message: `${nombre} — $${monto} por cobrar hoy`,
                href: '/cuentas',
                meta: { accountId: doc.id, clienteId: data.clienteId },
                createdAt: serializeDate(data.fechaVencimiento) || new Date().toISOString(),
            });
        }
    });

    return notifications
        .sort((a, b) => {
            const severityOrder = { critical: 0, warning: 1, info: 2 };
            return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
        })
        .slice(0, MAX_PER_GROUP * 2);
};

export const listNotifications = async (req, res) => {
    try {
        const { empresaId } = req.query;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const cacheKey = notificationsCacheKey(empresaId);
        const cached = await statsCache.get(cacheKey);
        const cachedPayload = typeof cached === 'string'
            ? (() => {
                try {
                    return JSON.parse(cached);
                } catch {
                    return null;
                }
            })()
            : cached;
        if (
            cachedPayload
            && typeof cachedPayload === 'object'
            && Array.isArray(cachedPayload.items)
        ) {
            return res.status(200).json(cachedPayload);
        }

        const [clientsResult, inventoryResult, accountsResult] = await Promise.allSettled([
            buildClientNotifications(empresaId),
            buildInventoryNotifications(empresaId),
            buildAccountNotifications(empresaId),
        ]);

        const clients = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
        const inventory = inventoryResult.status === 'fulfilled' ? inventoryResult.value : [];
        const accounts = accountsResult.status === 'fulfilled' ? accountsResult.value : [];

        if (clientsResult.status === 'rejected') {
            console.warn('notifications clients:', clientsResult.reason?.message);
        }
        if (inventoryResult.status === 'rejected') {
            console.warn('notifications inventory:', inventoryResult.reason?.message);
        }
        if (accountsResult.status === 'rejected') {
            console.warn('notifications accounts:', accountsResult.reason?.message);
        }

        const items = [...clients, ...inventory, ...accounts];
        const summary = {
            total: items.length,
            clientes: clients.length,
            inventario: inventory.length,
            cuentas: accounts.length,
            critical: items.filter((item) => item.severity === 'critical').length,
            warning: items.filter((item) => item.severity === 'warning').length,
        };

        const payload = {
            summary,
            items,
            generatedAt: new Date().toISOString(),
        };

        await statsCache.set(cacheKey, payload, NOTIFICATIONS_CACHE_TTL_SECONDS);

        return res.status(200).json(payload);
    } catch (error) {
        console.error('Error listNotifications:', error);
        return res.status(500).json({ error: error.message || 'Error al cargar notificaciones' });
    }
};
