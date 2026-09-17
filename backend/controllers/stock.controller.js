import { adminDb } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getStartOfDayCaracas, getEndOfDayCaracas } from '../utils/dateUtils.js';
import { statsCache } from '../utils/cache.js';
import { applyEmpresaStatsDelta } from '../utils/empresaStats.js';
import { clearProductCaches } from '../utils/productCache.js';
import { clearBaifyAiSnapshotCache } from '../utils/baifyAiCache.js';

const MOVIMIENTOS_COLLECTION = 'movimientos_stock';
const PRODUCTOS_COLLECTION = 'productos';
const STOCK_STATS_COLLECTION = 'metricas_stock_diarias';
const PRODUCT_STATS_COLLECTION = 'metricas_productos_diarias';
const DAILY_STATS_COLLECTION = 'metricas_diarias';

export const adjustStock = async (req, res) => {
    try {
        const { productoId, tipo, cantidad, usuarioId, empresaId, notas, idempotencyKey } = req.body;
        const cantidadNum = parseInt(cantidad);

        if (isNaN(cantidadNum) || cantidadNum <= 0) {
            return res.status(400).json({ error: 'La cantidad debe ser un número positivo.' });
        }

        // Verificar idempotencia
        if (idempotencyKey) {
            const existingMov = await adminDb.collection(MOVIMIENTOS_COLLECTION)
                .where('empresaId', '==', empresaId)
                .where('idempotencyKey', '==', idempotencyKey)
                .limit(1)
                .get();

            if (!existingMov.empty) {
                const movData = existingMov.docs[0].data();
                return res.status(200).json({
                    message: "Ajuste ya procesado",
                    newStock: movData.stockNuevo,
                    movimientoId: existingMov.docs[0].id,
                    isDuplicate: true
                });
            }
        }


        const productoRef = adminDb.collection(PRODUCTOS_COLLECTION).doc(productoId);

        const result = await adminDb.runTransaction(async (transaction) => {
            const productoDoc = await transaction.get(productoRef);

            if (!productoDoc.exists) {
                throw new Error('El producto no existe.');
            }

            const data = productoDoc.data();
            const currentStock = data.stock || 0;
            const productoValor = parseFloat(data.valor) || 0;
            const productoCosto = parseFloat(data.costo) || 0;
            let newStock;

            if (tipo === 'incremento') {
                newStock = currentStock + cantidadNum;
            } else if (tipo === 'reduccion') {
                newStock = currentStock - cantidadNum;
                if (newStock < 0) {
                    throw new Error(`Stock insuficiente. Stock actual: ${currentStock}`);
                }
            } else {
                throw new Error('Tipo de movimiento inválido.');
            }

            const diffStock = newStock - currentStock;
            const diffValor = diffStock * productoValor;
            const diffCost = diffStock * productoCosto;

            transaction.update(productoRef, {
                stock: newStock,
                totalValue: newStock * productoValor,
                totalCostValue: newStock * productoCosto,
                updatedAt: new Date()
            });

            applyEmpresaStatsDelta(transaction, empresaId, {
                totalInventoryValue: diffValor,
                totalCostValue: diffCost,
                totalStock: diffStock
            });

            const movimientoRef = adminDb.collection(MOVIMIENTOS_COLLECTION).doc();
            transaction.set(movimientoRef, {
                productoId,
                productoNombre: data.nombre || 'Producto', // Denormalización
                productoSku: data.sku || null,
                tipo,
                cantidad: cantidadNum,
                stockAnterior: currentStock,
                stockNuevo: newStock,
                usuarioId,
                empresaId,
                notas: notas || '',
                fecha: new Date(),
                idempotencyKey: idempotencyKey || null
            });

            // --- AGREGADORES EFICIENTES ---
            const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
            
            // 1. Métricas Globales de Stock (Entradas/Salidas)
            const dailyStockRef = adminDb.collection(STOCK_STATS_COLLECTION).doc(`${dateStr}_${empresaId}`);
            transaction.set(dailyStockRef, {
                date: dateStr,
                empresaId: empresaId,
                entradas: FieldValue.increment(tipo === 'incremento' ? cantidadNum : 0),
                salidas: FieldValue.increment(tipo === 'reduccion' ? cantidadNum : 0)
            }, { merge: true });

            // 2. Métricas por Producto (Volumen de movimiento)
            const productStatRef = adminDb.collection(PRODUCT_STATS_COLLECTION).doc(`${dateStr}_${productoId}`);
            transaction.set(productStatRef, {
                date: dateStr,
                empresaId: empresaId,
                productId: productoId,
                productName: data.nombre || 'Producto',
                sku: data.sku || '',
                stockMoved: FieldValue.increment(cantidadNum) // Suma absoluta para el ranking
            }, { merge: true });

            return { newStock, movimientoId: movimientoRef.id };
        });

        await clearProductCaches(empresaId);

        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getMovimientos = async (req, res) => {
    try {
        const { productoId, empresaId, lastDocId } = req.query;
        if (!productoId || !empresaId) return res.status(400).json({ error: "Faltan parámetros: productoId, empresaId" });

        const limit = Math.min(parseInt(req.query.limit) || 30, 50);

        let query = adminDb.collection(MOVIMIENTOS_COLLECTION)
            .where('productoId', '==', productoId)
            .where('empresaId', '==', empresaId)
            .orderBy('fecha', 'desc');

        if (lastDocId) {
            const lastDocSnap = await adminDb.collection(MOVIMIENTOS_COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) {
                query = query.startAfter(lastDocSnap);
            }
        }

        const snapshot = await query.limit(limit + 1).get();
        const docs = snapshot.docs.slice(0, limit);
        const movimientos = docs.map(doc => {
            const data = doc.data();
            if (data.fecha && data.fecha.toDate) data.fecha = data.fecha.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        res.status(200).json({
            movimientos,
            lastDocId: docs.length > 0 ? docs[docs.length - 1].id : null,
            hasMore: snapshot.docs.length > limit
        });
    } catch (error) {
        console.error('Error fetching recent movements:', error);
        const isIndexError = error.message.includes("index");
        res.status(isIndexError ? 412 : 500).json({ error: error.message, isIndexError });
    }
};

export const getRecentMovimientos = async (req, res) => {
    try {
        const { empresaId, limitCount, from, to, lastDocId } = req.query;
        if (!empresaId) return res.status(400).json({ error: "Faltan parámetros: empresaId" });

        const limit = parseInt(limitCount) || 5;
        let query = adminDb.collection(MOVIMIENTOS_COLLECTION)
            .where('empresaId', '==', empresaId);

        if (from) {
            query = query.where('fecha', '>=', getStartOfDayCaracas(from));
        }
        if (to) {
            query = query.where('fecha', '<=', getEndOfDayCaracas(to));
        }

        query = query.orderBy('fecha', 'desc');

        if (lastDocId) {
            const lastDocSnap = await adminDb.collection(MOVIMIENTOS_COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) {
                query = query.startAfter(lastDocSnap);
            }
        }

        const snapshot = await query.limit(limit).get();

        const movimientos = snapshot.docs.map(doc => {
            const data = doc.data();
            if (data.fecha && data.fecha.toDate) data.fecha = data.fecha.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

        res.status(200).json({
            movimientos,
            lastDocId: lastDoc?.id || null,
            hasMore: snapshot.docs.length === limit
        });
    } catch (error) {
        console.error('Error fetching recent movements:', error);
        const isIndexError = error.message.includes("index");
        res.status(isIndexError ? 412 : 500).json({ error: error.message, isIndexError });
    }
};
/**
 * Recálculo completo desde productos. Solo para reparación manual (no usar en ventas ni dashboard).
 */
const sumProductTotalsForEmpresa = async (empresaId) => {
    const productsSnap = await adminDb.collection(PRODUCTOS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .get();

    let totalInventoryValue = 0;
    let totalCostValue = 0;
    let totalStock = 0;
    productsSnap.forEach((doc) => {
        const d = doc.data();
        const stock = parseFloat(String(d.stock ?? 0)) || 0;
        const valor = parseFloat(String(d.valor ?? 0)) || 0;
        const costo = parseFloat(String(d.costo ?? 0)) || 0;
        totalInventoryValue += stock * valor;
        totalCostValue += stock * costo;
        totalStock += stock;
    });
    return {
        totalInventoryValue,
        totalCostValue,
        totalStock,
        productCount: productsSnap.size
    };
};

async function getTopProductsForRange(empresaId, fromStr, toStr) {
    const rankingSnapshot = await adminDb.collection(PRODUCT_STATS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('date', '>=', fromStr)
        .where('date', '<=', toStr)
        .get();

    const productSoldMap = new Map();
    rankingSnapshot.forEach((doc) => {
        const data = doc.data();
        const pid = data.productId;
        const unitsSold = Number(data.unitsSold || 0);
        if (!pid || unitsSold === 0) return;

        const existing = productSoldMap.get(pid) || {
            nombre: data.productName || 'Producto',
            cantidad: 0
        };
        productSoldMap.set(pid, {
            ...existing,
            cantidad: existing.cantidad + unitsSold
        });
    });

    return Array.from(productSoldMap.values())
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);
}

export const getDashboardStats = async (req, res) => {
    try {
        const { empresaId, from, to, expirationLimit, expirationMonths } = req.query;
        if (!empresaId) return res.status(400).json({ error: "Falta empresaId" });

        const monthsKey = expirationMonths != null && expirationMonths !== ''
            ? String(parseInt(expirationMonths, 10) || 2)
            : 'none';

        // Intentar obtener del caché (incluye months para no mezclar umbrales de vencimiento)
        const cacheKey = `dashboard-${empresaId}-${from || 'all'}-${to || 'all'}-m${monthsKey}-${expirationLimit || 'none'}`;
        const cachedData = await statsCache.get(cacheKey);
        if (cachedData) {
            console.log(`🚀 [Cache] Dashboard stats hit for ${empresaId}`);
            return res.status(200).json(cachedData);
        }

        const todayStartCaracas = getStartOfDayCaracas();
        let startDate, endDate;

        if (from) {
            startDate = getStartOfDayCaracas(from);
        } else {
            const d = new Date(todayStartCaracas);
            d.setDate(d.getDate() - 30);
            startDate = d;
        }

        if (to) {
            endDate = getEndOfDayCaracas(to);
        } else {
            endDate = getEndOfDayCaracas(todayStartCaracas);
        }

        // 1. TENDENCIA: solo docs de métricas que existen (no getAll de días vacíos)
        const trendMap = {};
        let curr = new Date(startDate);

        const fmt = new Intl.DateTimeFormat('es-VE', {
            day: '2-digit',
            month: '2-digit',
            timeZone: 'America/Caracas'
        });

        while (curr <= endDate) {
            const dateStrISO = curr.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
            const dateStrUI = fmt.format(curr);
            trendMap[dateStrISO] = { date: dateStrUI, entradas: 0, salidas: 0 };
            curr.setDate(curr.getDate() + 1);
        }

        const fromStr = startDate.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
        const toStr = endDate.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });

        try {
            const stockSnaps = await adminDb.collection(STOCK_STATS_COLLECTION)
                .where('empresaId', '==', empresaId)
                .where('date', '>=', fromStr)
                .where('date', '<=', toStr)
                .get();
            stockSnaps.forEach(snap => {
                const data = snap.data();
                if (trendMap[data.date]) {
                    trendMap[data.date].entradas = data.entradas || 0;
                    trendMap[data.date].salidas = data.salidas || 0;
                }
            });
        } catch (err) {
            if (err.message && err.message.includes('index')) {
                return res.status(412).json({
                    error: 'Falta índice compuesto en metricas_stock_diarias (empresaId + date).',
                    isIndexError: true
                });
            }
            throw err;
        }

        const movementTrend = Object.values(trendMap);

        // 2. TOP PRODUCTOS: unidades vendidas solo en el rango from/to (métricas diarias)
        let topProducts = [];
        try {
            topProducts = await getTopProductsForRange(empresaId, fromStr, toStr);
        } catch (err) {
            if (err.message && err.message.includes('index')) {
                return res.status(412).json({
                    error: 'Falta índice compuesto en metricas_productos_diarias (empresaId + date).',
                    isIndexError: true
                });
            }
            throw err;
        }


        // 3. USO DE AGREGACIONES PARA MÉTRICAS (LO QUE YA ESTABA PERO SIN EL FETCH DE MOVIMIENTOS)
        let metrics = {
            totalProducts: 0,
            activosNormales: 0,
            activosBajos: 0,
            inactivos: 0,
            totalStock: 0,
            lowStockProducts: [],
            expiringProducts: [],
            expiringCount: 0,
            expiredProducts: [],
            expiredCount: 0
        };
        let totalInventoryValue = 0;
        let totalCostValue = 0;

        try {
            // Obtener configuración de la empresa (umbral de stock bajo; vencimiento puede venir por query)
            const empresaSnap = await adminDb.collection('empresas').doc(empresaId).get();
            const parsedMonths = expirationMonths != null && expirationMonths !== ''
                ? parseInt(expirationMonths, 10)
                : NaN;
            const thresholdMonths = !Number.isNaN(parsedMonths) && parsedMonths > 0
                ? parsedMonths
                : (empresaSnap.exists ? (empresaSnap.data().expirationAlertThreshold || 2) : 2);
            const LOW_STOCK_THRESHOLD = empresaSnap.exists ? (empresaSnap.data().lowStockThreshold ?? 5) : 5;

            let expirationLimitDate;
            if (expirationLimit) {
                expirationLimitDate = getEndOfDayCaracas(expirationLimit);
            } else {
                expirationLimitDate = new Date(todayStartCaracas);
                expirationLimitDate.setMonth(expirationLimitDate.getMonth() + thresholdMonths);
                expirationLimitDate.setHours(23, 59, 59, 999);
            }

            const [
                totalSnap,
                activosNormalesSnap,
                activosBajosSnap,
                lowStockDocsObj,
                empresaStatsSnap
            ] = await Promise.all([
                adminDb.collection(PRODUCTOS_COLLECTION).where('empresaId', '==', empresaId).count().get(),
                adminDb.collection(PRODUCTOS_COLLECTION).where('empresaId', '==', empresaId).where('estado', '==', 'activo').where('stock', '>', LOW_STOCK_THRESHOLD).count().get(),
                adminDb.collection(PRODUCTOS_COLLECTION).where('empresaId', '==', empresaId).where('estado', '==', 'activo').where('stock', '<=', LOW_STOCK_THRESHOLD).count().get(),
                adminDb.collection(PRODUCTOS_COLLECTION).where('empresaId', '==', empresaId).where('estado', '==', 'activo').where('stock', '<=', LOW_STOCK_THRESHOLD).orderBy('stock', 'asc').limit(5).get(),
                adminDb.collection('empresa_stats').doc(empresaId).get()
            ]);

            metrics.totalProducts = totalSnap.data().count || 0;
            metrics.activosNormales = activosNormalesSnap.data().count || 0;
            metrics.activosBajos = activosBajosSnap.data().count || 0;
            metrics.inactivos = Math.max(0, metrics.totalProducts - metrics.activosNormales - metrics.activosBajos);
            metrics.lowStockProducts = lowStockDocsObj.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const statsData = empresaStatsSnap.exists ? empresaStatsSnap.data() : {};
            totalInventoryValue = statsData.totalInventoryValue || 0;
            totalCostValue = statsData.totalCostValue || 0;
            metrics.totalStock =
                typeof statsData.totalStock === 'number'
                    ? statsData.totalStock
                    : parseFloat(String(statsData.totalStock ?? 0)) || 0;

            // --- VENCIMIENTOS ---
            const tomorrowStart = new Date(todayStartCaracas);
            tomorrowStart.setDate(tomorrowStart.getDate() + 1);

            const [expiringCountSnap, expiredCountSnap] = await Promise.all([
                adminDb.collection(PRODUCTOS_COLLECTION)
                    .where('empresaId', '==', empresaId)
                    .where('estado', '==', 'activo')
                    .where('fechaVencimiento', '>=', tomorrowStart)
                    .where('fechaVencimiento', '<=', expirationLimitDate)
                    .count().get(),
                adminDb.collection(PRODUCTOS_COLLECTION)
                    .where('empresaId', '==', empresaId)
                    .where('fechaVencimiento', '<', tomorrowStart)
                    .count().get()
            ]);

            metrics.expiringCount = expiringCountSnap.data().count || 0;
            metrics.expiredCount = expiredCountSnap.data().count || 0;
            
            const [expiringSampleSnap, expiredSampleSnap] = await Promise.all([
                adminDb.collection(PRODUCTOS_COLLECTION)
                    .where('empresaId', '==', empresaId)
                    .where('estado', '==', 'activo')
                    .where('fechaVencimiento', '>=', tomorrowStart)
                    .where('fechaVencimiento', '<=', expirationLimitDate)
                    .orderBy('fechaVencimiento', 'asc')
                    .limit(15)
                    .get().catch(e => ({ docs: [] })),
                adminDb.collection(PRODUCTOS_COLLECTION)
                    .where('empresaId', '==', empresaId)
                    .where('fechaVencimiento', '<', tomorrowStart)
                    .orderBy('fechaVencimiento', 'desc')
                    .limit(15)
                    .get().catch(e => ({ docs: [] }))
            ]);

            metrics.expiringProducts = expiringSampleSnap.docs.map(doc => {
                const data = doc.data();
                if (data.fechaVencimiento && data.fechaVencimiento.toDate) data.fechaVencimiento = data.fechaVencimiento.toDate().toISOString();
                return { id: doc.id, ...data };
            });

            metrics.expiredProducts = expiredSampleSnap.docs.map(doc => {
                const data = doc.data();
                if (data.fechaVencimiento && data.fechaVencimiento.toDate) data.fechaVencimiento = data.fechaVencimiento.toDate().toISOString();
                return { id: doc.id, ...data };
            });

        } catch (aggError) {
            console.warn("⚠️ Falló alguna agregación principal:", aggError.message);
            if (aggError.message.includes("index")) {
                return res.status(412).json({
                    error: "Sincronización en proceso. Por favor, intenta de nuevo en unos minutos.",
                    isIndexError: true
                });
            }
        }

        // 4. MOVIMIENTOS RECIENTES (LIMITADO A 100 PARA LA CARGA INICIAL)
        const movSnapshot = await adminDb.collection(MOVIMIENTOS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .orderBy('fecha', 'desc')
            .limit(100)
            .get();
        const movimientos = movSnapshot.docs.map(doc => {
            const data = doc.data();
            if (data.fecha && data.fecha.toDate) data.fecha = data.fecha.toDate().toISOString();
            return { id: doc.id, ...data };
        });

        const distribution = [
            { name: 'Activos', value: metrics.activosNormales, color: '#00D9A6' },
            { name: 'Stock Bajo', value: metrics.activosBajos, color: '#FFB74D' },
            { name: 'Inactivos', value: metrics.inactivos, color: '#FF5252' },
        ];

        const responseData = {
            movementTrend,
            topProducts,
            distribution,
            metrics,
            totalInventoryValue,
            totalCostValue,
            movimientos,
            trends: movementTrend
        };
        await statsCache.set(cacheKey, responseData);

        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error stats:', error);
        // Si hay un error de índice, enviamos un mensaje claro al frontend
        const isIndexError = error.message.includes("index");
        res.status(isIndexError ? 412 : 500).json({
            error: isIndexError ? "Sincronización en proceso" : "Error interno del servidor",
            isIndexError
        });
    }
};

export const recalculateStats = async (req, res) => {
    try {
        const { empresaId } = req.query;
        if (!empresaId) return res.status(400).json({ error: "empresaId requerido" });

        const { totalInventoryValue, totalCostValue, totalStock, productCount } = await sumProductTotalsForEmpresa(empresaId);

        let totalSalesCount = 0;
        let totalSalesAmount = 0;
        const dailySnap = await adminDb.collection(DAILY_STATS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .get();
        dailySnap.forEach((doc) => {
            const data = doc.data();
            totalSalesCount += Number(data.orders || 0);
            totalSalesAmount += Number(data.revenue || 0);
        });

        const now = new Date();
        const statsData = {
            totalInventoryValue,
            totalCostValue,
            totalStock,
            productCount,
            totalSalesCount,
            totalSalesAmount,
            lastFullSync: now,
            needsSync: false,
            updatedAt: now
        };

        await adminDb.collection('empresa_stats').doc(empresaId).set(statsData, { merge: true });
        await statsCache.clearByPrefix(`dashboard-${empresaId}`);
        await clearBaifyAiSnapshotCache(empresaId);

        res.status(200).json({ message: "Sincronización completada", stats: statsData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

