import { adminDb } from '../config/firebase.js';
import { statsCache } from '../utils/cache.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getStartOfDayCaracas, getEndOfDayCaracas } from '../utils/dateUtils.js';
import { applyEmpresaStatsDelta } from '../utils/empresaStats.js';
import {
    assertClienteCedulaNombreUnico,
    normalizeCedula,
} from './account.controller.js';
import {
    recalculateClientPurchaseDates,
    touchClientPurchase,
} from './client.controller.js';
import {
    emptyPaymentMethodBuckets,
    paymentMethodKeyFromMetodo,
    getRecognizedSaleAmounts,
    stripPrestamoFromPaymentBuckets,
    sumRecognizedPaymentMethodsBs,
    shouldApplyCxCPaymentMetrics,
} from '../utils/paymentMethods.js';
import { clearNotificationsCache } from '../utils/notificationCache.js';

const SALES_COLLECTION = 'ventas';
const PRODUCTS_COLLECTION = 'productos';
const DAILY_STATS_COLLECTION = 'metricas_diarias';
const PRODUCT_STATS_COLLECTION = 'metricas_productos_diarias';
const PRODUCT_MONTHLY_STATS_COLLECTION = 'metricas_productos_mensuales';
const STOCK_STATS_COLLECTION = 'metricas_stock_diarias';

async function clearEmpresaSaleCaches(empresaId) {
    await Promise.all([
        statsCache.clearByPrefix(`sales-${empresaId}`),
        statsCache.clearByPrefix(`dashboard-${empresaId}`),
        statsCache.clearByPrefix(`history-${empresaId}`),
        statsCache.clearByPrefix(`ranking-${empresaId}`),
        // Prefijos reales de product.controller (products-all, products-lowstock, etc.)
        statsCache.clearByPrefix(`products-all-${empresaId}`),
        statsCache.clearByPrefix(`products-lowstock-${empresaId}`),
        statsCache.clearByPrefix(`products-expiring-${empresaId}`),
        statsCache.clearByPrefix(`products-expired-${empresaId}`),
        statsCache.clearByPrefix(`products-search-${empresaId}`),
        statsCache.clearByPrefix(`products-search-hits-${empresaId}`),
        clearNotificationsCache(empresaId),
    ]);
}

/** paymentMethodKeyFromMetodo / emptyPaymentMethodBuckets: utils/paymentMethods.js */

function normalizeClienteCedula(cliente) {
    if (!cliente || typeof cliente !== 'object') return null;
    return normalizeCedula(cliente.cedula || cliente.clienteId);
}

function parseFechaAcordada(val) {
    if (val === undefined || val === null || val === '') return null;
    const raw = String(val).trim();
    const day = raw.length >= 10 ? raw.slice(0, 10) : raw;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    return getStartOfDayCaracas(day);
}

/** Fracción de la venta cobrada en efectivo USD (1 si el voucher fue en dólares físicos). */
function cashUsdProfitShare(cashUsdAmount, saleTotal) {
    const total = Number(saleTotal) || 0;
    const cashUsd = Number(cashUsdAmount) || 0;
    if (total <= 0) return cashUsd > 0 ? 1 : 0;
    if (cashUsd >= total - 0.05) return 1;
    return Math.min(1, Math.max(0, cashUsd / total));
}

/**
 * Bolívares por método de pago en un conjunto de ventas: cada línea usa la tasa del propio ticket.
 */
function isPaymentMethodsBsEmpty(pmb) {
    if (pmb == null) return true;
    return sumRecognizedPaymentMethodsBs(pmb) <= 0.009;
}

function parseVentaPaymentBuckets(data) {
    const rate = Number(data.exchangeRate || 0);
    const total = Number(data.total || 0);
    const metodos = data.metodosPago;
    const pmTotals = emptyPaymentMethodBuckets();
    const pmTotalsBs = emptyPaymentMethodBuckets();

    if (metodos && Array.isArray(metodos) && metodos.length > 0) {
        metodos.forEach((p) => {
            const amount = parseFloat(p.amount || p.monto || 0);
            const key = paymentMethodKeyFromMetodo(p.method || p.metodo);
            pmTotals[key] += amount;
            pmTotalsBs[key] += amount * rate;
        });
    } else {
        pmTotals.cashUsd = total;
        pmTotalsBs.cashUsd = total * rate;
    }

    return { pmTotals, pmTotalsBs, rate, total };
}

function emptyDailyMetrics() {
    return {
        revenue: 0,
        revenueBs: 0,
        profit: 0,
        profitBs: 0,
        units: 0,
        orders: 0,
        cashUsd: 0,
        cashUsdBs: 0,
        profitCashUsd: 0,
        profitCashUsdBs: 0,
    };
}

function ensureDailyMetrics(byDate, dateStr) {
    if (!byDate[dateStr]) {
        byDate[dateStr] = emptyDailyMetrics();
    }
    return byDate[dateStr];
}

function getVentaDateStr(data) {
    const fv = data.fechaVenta;
    const saleDate = fv && fv.toDate ? fv.toDate() : (fv ? new Date(fv) : null);
    if (!saleDate || Number.isNaN(saleDate.getTime())) return null;
    return saleDate.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
}

function mergeDailyMetricsMaps(target, source) {
    Object.entries(source || {}).forEach(([dateStr, agg]) => {
        const day = ensureDailyMetrics(target, dateStr);
        day.revenue += Number(agg.revenue || 0);
        day.revenueBs += Number(agg.revenueBs || 0);
        day.profit += Number(agg.profit || 0);
        day.profitBs += Number(agg.profitBs || 0);
        day.units += Number(agg.units || 0);
        day.orders += Number(agg.orders || 0);
        day.cashUsd += Number(agg.cashUsd || 0);
        day.cashUsdBs += Number(agg.cashUsdBs || 0);
        day.profitCashUsd += Number(agg.profitCashUsd || 0);
        day.profitCashUsdBs += Number(agg.profitCashUsdBs || 0);
    });
}

function applyDailyMetricsToHistoryMap(historyMap, dailyByDate, fromStr, toStr) {
    Object.keys(historyMap).forEach((dateStr) => {
        if (dateStr < fromStr || dateStr > toStr) return;
        const agg = dailyByDate[dateStr] || emptyDailyMetrics();
        const revUsd = Number(agg.revenue || 0);
        const revBs = Number(agg.revenueBs || 0);
        historyMap[dateStr].revenue = revUsd;
        historyMap[dateStr].revenueBs = revBs;
        historyMap[dateStr].exchangeRate = revUsd > 0 ? revBs / revUsd : 0;
        historyMap[dateStr].profit = Number(agg.profit || 0);
        historyMap[dateStr].profitBs = Number(agg.profitBs || 0);
        historyMap[dateStr].units = Number(agg.units || 0);
        historyMap[dateStr].orders = Number(agg.orders || 0);
        historyMap[dateStr].cashUsd = Number(agg.cashUsd || 0);
        historyMap[dateStr].cashUsdBs = Number(agg.cashUsdBs || 0);
        historyMap[dateStr].profitCashUsd = Number(agg.profitCashUsd || 0);
        historyMap[dateStr].profitCashUsdBs = Number(agg.profitCashUsdBs || 0);
    });
}

/** Métricas reconocidas desde comprobantes (excluye préstamo diferido). */
function accumulateRecognizedMetricsFromVentasDocs(docs) {
    const pmBsAgg = emptyPaymentMethodBuckets();
    const pmUsdAgg = emptyPaymentMethodBuckets();
    const dailyByDate = {};
    let totalRevenueBs = 0;
    let totalRevenueUsd = 0;
    let totalProfitBs = 0;
    let totalProfitUsd = 0;
    let totalProfitCashUsd = 0;
    let totalProfitCashUsdBs = 0;
    let totalUnits = 0;
    let totalOrders = 0;

    docs.forEach((doc) => {
        const data = doc.data();
        const dateStr = getVentaDateStr(data);
        if (!dateStr) return;

        const { pmTotals, pmTotalsBs, rate, total } = parseVentaPaymentBuckets(data);

        let saleProfit = Number(data.profit);
        if (!Number.isFinite(saleProfit)) {
            let totalCost = 0;
            (data.items || []).forEach((item) => {
                totalCost += (Number(item.costo) || 0) * (Number(item.cantidad) || 0);
            });
            saleProfit = total - totalCost;
        }

        const recognized = getRecognizedSaleAmounts({
            total,
            saleProfit,
            pmTotals,
            pmTotalsBs,
            rate,
        });

        const profitCashUsd = recognized.recognizedProfit
            * cashUsdProfitShare(pmTotals.cashUsd, Math.max(recognized.recognizedUsd, 0.01));
        const profitCashUsdBs = profitCashUsd * rate;

        totalRevenueBs += recognized.recognizedRevenueBs;
        totalRevenueUsd += recognized.recognizedUsd;
        totalProfitBs += recognized.recognizedProfitBs;
        totalProfitUsd += recognized.recognizedProfit;
        totalProfitCashUsd += profitCashUsd;
        totalProfitCashUsdBs += profitCashUsdBs;
        totalUnits += (data.items || []).reduce(
            (sum, item) => sum + (Number(item.cantidad) || 0),
            0
        );
        totalOrders += 1;

        Object.keys(pmBsAgg).forEach((key) => {
            if (key !== 'prestamo') {
                pmBsAgg[key] += Number(pmTotalsBs[key] || 0);
                pmUsdAgg[key] += Number(pmTotals[key] || 0);
            }
        });

        const day = ensureDailyMetrics(dailyByDate, dateStr);
        day.revenue += recognized.recognizedUsd;
        day.revenueBs += recognized.recognizedRevenueBs;
        day.profit += recognized.recognizedProfit;
        day.profitBs += recognized.recognizedProfitBs;
        day.units += (data.items || []).reduce(
            (sum, item) => sum + (Number(item.cantidad) || 0),
            0
        );
        day.orders += 1;
        day.cashUsd += Number(pmTotals.cashUsd || 0);
        day.cashUsdBs += Number(pmTotalsBs.cashUsd || 0);
        day.profitCashUsd += profitCashUsd;
        day.profitCashUsdBs += profitCashUsdBs;
    });

    stripPrestamoFromPaymentBuckets(pmBsAgg);
    stripPrestamoFromPaymentBuckets(pmUsdAgg);

    return {
        pmBsAgg,
        pmUsdAgg,
        dailyByDate,
        totalRevenueBs,
        totalRevenueUsd,
        totalProfitBs,
        totalProfitUsd,
        totalProfitCashUsd,
        totalProfitCashUsdBs,
        totalUnits,
        totalOrders,
    };
}

/** Abonos CxC con métricas aplicadas dentro del rango de fechas. */
function accumulateCxCAbonosMetricsInRange(accountsDocs, fromStr, toStr) {
    const pmBsAgg = emptyPaymentMethodBuckets();
    const pmUsdAgg = emptyPaymentMethodBuckets();
    const dailyByDate = {};
    let totalRevenueBs = 0;
    let totalRevenueUsd = 0;
    let totalProfitBs = 0;
    let totalProfitUsd = 0;
    let totalProfitCashUsd = 0;
    let totalProfitCashUsdBs = 0;

    accountsDocs.forEach((doc) => {
        const data = doc.data();
        if (!shouldApplyCxCPaymentMetrics(data)) return;

        const abonos = Array.isArray(data.abonos) ? data.abonos : [];
        abonos.forEach((abono) => {
            if (abono.metricsApplied !== true) return;

            const metricsDateStr = abono.metricsDate;
            if (!metricsDateStr || metricsDateStr < fromStr || metricsDateStr > toStr) return;

            const amount = Number(abono.monto) || 0;
            if (amount <= 0) return;

            const tasa = Number(abono.tasaCambio) || 0;
            const montoBs = abono.montoBs != null && abono.montoBs !== ''
                ? Number(abono.montoBs)
                : amount * tasa;

            const key = abono.metricsMethodKey || paymentMethodKeyFromMetodo(abono.metodoPago);
            if (key === 'prestamo') return;

            const profitUsd = Number(abono.metricsProfit) || 0;
            const profitBs = tasa > 0 ? profitUsd * tasa : 0;

            pmBsAgg[key] += montoBs;
            pmUsdAgg[key] += amount;
            totalRevenueBs += montoBs;
            totalRevenueUsd += amount;
            totalProfitUsd += profitUsd;
            totalProfitBs += profitBs;

            const day = ensureDailyMetrics(dailyByDate, metricsDateStr);
            day.revenue += amount;
            day.revenueBs += montoBs;
            day.profit += profitUsd;
            day.profitBs += profitBs;

            if (key === 'cashUsd') {
                totalProfitCashUsd += profitUsd;
                totalProfitCashUsdBs += profitBs;
                day.cashUsd += amount;
                day.cashUsdBs += montoBs;
                day.profitCashUsd += profitUsd;
                day.profitCashUsdBs += profitBs;
            }
        });
    });

    stripPrestamoFromPaymentBuckets(pmBsAgg);
    stripPrestamoFromPaymentBuckets(pmUsdAgg);

    return {
        pmBsAgg,
        pmUsdAgg,
        dailyByDate,
        totalRevenueBs,
        totalRevenueUsd,
        totalProfitBs,
        totalProfitUsd,
        totalProfitCashUsd,
        totalProfitCashUsdBs,
    };
}

function mergePaymentBuckets(target, source) {
    Object.keys(target).forEach((key) => {
        target[key] += Number(source[key] || 0);
    });
}

export const createSale = async (req, res) => {
    const {
        empresaId,
        items,
        subtotal,
        descuento: descuentoRaw,
        impuestos,
        total: totalRaw,
        metodosPago,
        exchangeRate,
        cliente = null,
        idempotencyKey,
    } = req.body;

    let descuento = Number(descuentoRaw) || 0;
    let total = Number(totalRaw) || 0;

    if (!empresaId || !items || items.length === 0 || !exchangeRate) {
        return res.status(400).json({ error: "Datos de venta incompletos (Falta tasa de cambio)" });
    }

    const prestamoLines = Array.isArray(metodosPago)
        ? metodosPago.filter((p) => {
            const method = String(p.method || p.metodo || '').toLowerCase();
            return method.includes('prestamo') || method.includes('préstamo');
        })
        : [];
    const prestamoTotal = prestamoLines.reduce(
        (sum, p) => sum + (parseFloat(p.amount || p.monto || 0) || 0),
        0
    );

    if (prestamoTotal > 0.009) {
        const nombreCliente = String(cliente?.nombre || '').trim();
        const cedulaCliente = normalizeClienteCedula(cliente);
        const fechaAcordada = parseFechaAcordada(
            cliente?.fechaVencimiento || cliente?.fechaAcordada
        );
        if (!nombreCliente || nombreCliente.toLowerCase() === 'cliente general') {
            return res.status(400).json({ error: 'Nombre del cliente es requerido para Préstamo' });
        }
        if (!cedulaCliente) {
            return res.status(400).json({ error: 'Cédula de identidad es requerida para Préstamo' });
        }
        if (!fechaAcordada) {
            return res.status(400).json({ error: 'La fecha acordada para el pago es obligatoria para Préstamo' });
        }

        const uniqueness = await assertClienteCedulaNombreUnico({
            empresaId,
            clienteId: cedulaCliente,
            clienteNombre: nombreCliente,
        });
        if (!uniqueness.ok) {
            return res.status(409).json({ error: uniqueness.error });
        }
        if (uniqueness.canonicalNombre) {
            cliente.nombre = uniqueness.canonicalNombre;
        }
    }

    // Cédula obligatoria en todas las ventas
    const cedulaOpt = normalizeClienteCedula(cliente);
    if (!cedulaOpt) {
        return res.status(400).json({
            error: 'Cédula del cliente es obligatoria (mín. 5 dígitos)',
        });
    }

    let clienteNormalizado = {
        ...(cliente && typeof cliente === 'object' ? cliente : {}),
        nombre: String(cliente?.nombre || '').trim() || 'Cliente',
        cedula: cedulaOpt,
        clienteId: cedulaOpt,
    };
    const phone = cliente?.telefono
        ? String(cliente.telefono).replace(/\D/g, '')
        : '';
    if (phone) clienteNormalizado.telefono = phone;
    else delete clienteNormalizado.telefono;

    try {
        // Verificar idempotencia
        if (idempotencyKey) {
            const existingSale = await adminDb.collection(SALES_COLLECTION)
                .where('empresaId', '==', empresaId)
                .where('idempotencyKey', '==', idempotencyKey)
                .limit(1)
                .get();

            if (!existingSale.empty) {
                const saleData = existingSale.docs[0].data();
                return res.status(200).json({
                    message: "Venta ya procesada",
                    saleId: saleData.id,
                    controlFiscal: saleData.controlFiscal,
                    isDuplicate: true
                });
            }
        }

        const saleId = `VENTA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const controlFiscal = `FISCAL-${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;

        await adminDb.runTransaction(async (transaction) => {
            // 1. OBTENER TODAS LAS REFERENCIAS Y SNAPS (LECTURAS PRIMERO)
            const empresaRef = adminDb.collection('empresas').doc(empresaId);
            const productRefs = items.map(item => adminDb.collection(PRODUCTS_COLLECTION).doc(item.productId));

            const [empresaSnap, ...productSnaps] = await Promise.all([
                transaction.get(empresaRef),
                ...productRefs.map(ref => transaction.get(ref))
            ]);

            if (!empresaSnap.exists) throw new Error("Empresa no encontrada");

            // 2. VERIFICACIONES Y CÁLCULOS (LÓGICA INTERMEDIA)
            const updates = [];
            const movements = [];
            let totalValueToRemove = 0;
            let totalCostToRemove = 0;
            const totalUnits = items.reduce((sum, item) => sum + item.cantidad, 0);
            const activeRate = Number(exchangeRate);

            for (let i = 0; i < productSnaps.length; i++) {
                const snap = productSnaps[i];
                if (!snap.exists) throw new Error(`Producto ${items[i].nombre} no encontrado`);

                const productData = snap.data();
                if (productData.stock < items[i].cantidad) {
                    throw new Error(`Stock insuficiente para ${items[i].nombre}. Disponible: ${productData.stock}`);
                }

                totalValueToRemove += (items[i].cantidad * (productData.valor || 0));
                totalCostToRemove += (items[i].cantidad * (productData.costo || 0));

                const newStock = productData.stock - items[i].cantidad;
                const valorProd = parseFloat(productData.valor) || 0;
                const costoProd = parseFloat(productData.costo) || 0;

                // Guardar valores históricos en el item para auditoría
                items[i].costo = costoProd;
                items[i].valorOriginal = valorProd;

                updates.push({
                    ref: productRefs[i],
                    updateData: {
                        stock: newStock,
                        totalValue: newStock * valorProd,
                        totalCostValue: newStock * costoProd,
                        unitsSoldTotal: FieldValue.increment(items[i].cantidad), // Contador maestro para rankings
                        updatedAt: new Date()
                    }
                });

                movements.push({
                    ref: adminDb.collection('movimientos_stock').doc(),
                    data: {
                        productoId: items[i].productId,
                        productoNombre: items[i].nombre || 'Producto',
                        productoSku: items[i].sku || null,
                        empresaId,
                        tipo: 'salida',
                        cantidad: items[i].cantidad,
                        motivo: 'Venta POS',
                        referencia: saleId,
                        fecha: new Date(),
                        stockAnterior: productData.stock,
                        stockNuevo: productData.stock - items[i].cantidad
                    }
                });
            }

            // 3. EJECUTAR TODAS LAS ESCRITURAS (AL FINAL)
            updates.forEach(upd => transaction.update(upd.ref, upd.updateData));
            movements.forEach(mov => transaction.set(mov.ref, mov.data));

            const empresaData = empresaSnap.data();

            const saleDocData = {
                id: saleId,
                controlFiscal,
                empresaId,
                empresaInfo: {
                    nombre: empresaData.nombre,
                    rif: empresaData.rif || '',
                    direccion: empresaData.direccion || '',
                    telefono: empresaData.telefono || ''
                },
                items,
                subtotal,
                descuento,
                impuestos,
                total,
                metodosPago,
                exchangeRate: exchangeRate || 0,
                cliente: clienteNormalizado,
                clienteCedula: cedulaOpt,
                vendedor: {
                    uid: req.user?.uid || 'unknown',
                    nombre: req.user?.nombre || req.user?.email || 'Vendedor'
                },
                fechaVenta: new Date(),
                createdAt: new Date(),
                profit: total - totalCostToRemove,
                idempotencyKey: idempotencyKey || null
            };

            const saleRef = adminDb.collection(SALES_COLLECTION).doc();
            transaction.set(saleRef, saleDocData);

            // 4. Desglose en $ (voucher) y en Bs (monto × tasa del ticket — mismo criterio que las stats por comprobante)
            const saleRate = Number(exchangeRate || activeRate);
            const pmTotals = emptyPaymentMethodBuckets();
            const pmTotalsBs = emptyPaymentMethodBuckets();
            if (metodosPago && Array.isArray(metodosPago)) {
                metodosPago.forEach(p => {
                    const amount = parseFloat(p.amount || p.monto || 0);
                    const key = paymentMethodKeyFromMetodo(p.method || p.metodo);
                    pmTotals[key] += amount;
                    pmTotalsBs[key] += amount * saleRate;
                });
            } else {
                pmTotals.cashUsd = total;
                pmTotalsBs.cashUsd = total * saleRate;
            }

            const saleProfit = total - totalCostToRemove;
            const recognized = getRecognizedSaleAmounts({
                total,
                saleProfit,
                pmTotals,
                pmTotalsBs,
                rate: saleRate,
            });
            // Ganancia atribuible solo a lo cobrado ahora (excluye préstamo)
            const profitCashUsd = recognized.recognizedProfit
                * cashUsdProfitShare(pmTotals.cashUsd, Math.max(recognized.recognizedUsd, 0.01));

            // 4b. Si hay Préstamo, crear cuenta por cobrar vinculada al comprobante
            if (pmTotals.prestamo > 0.009) {
                const cedulaCliente = normalizeClienteCedula(clienteNormalizado);
                const nombreCliente = String(clienteNormalizado?.nombre || '').trim();
                const fechaAcordada = parseFechaAcordada(
                    clienteNormalizado?.fechaVencimiento || clienteNormalizado?.fechaAcordada
                );
                const prestamoBs = Math.round(pmTotals.prestamo * saleRate * 100) / 100;
                const accountRef = adminDb.collection('cuentas').doc();
                transaction.set(accountRef, {
                    empresaId,
                    tipo: 'por_cobrar',
                    clienteId: cedulaCliente,
                    clienteNombre: nombreCliente,
                    proveedorId: null,
                    proveedorNombre: null,
                    montoTotal: Math.round(pmTotals.prestamo * 100) / 100,
                    montoPendiente: Math.round(pmTotals.prestamo * 100) / 100,
                    tasaCambio: saleRate,
                    montoTotalBs: prestamoBs,
                    montoPendienteBs: prestamoBs,
                    // Ganancia diferida: se reconoce en métricas al abonar
                    origenProfit: recognized.origenProfitForPrestamo,
                    // Solo cuentas nuevas: el cobro suma a métricas (evita doble conteo en CxC antiguas)
                    metricsDeferred: true,
                    fechaEmision: new Date(),
                    fechaVencimiento: fechaAcordada,
                    estado: 'pendiente',
                    observaciones: `Préstamo generado desde POS (${saleId})`,
                    ventaId: saleId,
                    abonos: [],
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }

            // 5. Métricas diarias: el préstamo NO suma hasta que se cobre en CxC
            const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
            const dailyStatsRef = adminDb.collection(DAILY_STATS_COLLECTION).doc(`${dateStr}_${empresaId}`);

            transaction.set(dailyStatsRef, {
                date: dateStr,
                empresaId: empresaId,
                revenue: FieldValue.increment(recognized.recognizedUsd),
                revenueBs: FieldValue.increment(recognized.recognizedRevenueBs),
                profit: FieldValue.increment(recognized.recognizedProfit),
                profitBs: FieldValue.increment(recognized.recognizedProfitBs),
                profitCashUsd: FieldValue.increment(profitCashUsd),
                profitCashUsdBs: FieldValue.increment(profitCashUsd * saleRate),
                units: FieldValue.increment(totalUnits),
                orders: FieldValue.increment(1),
                paymentMethods: {
                    cashBs: FieldValue.increment(pmTotals.cashBs),
                    cashUsd: FieldValue.increment(pmTotals.cashUsd),
                    mobile: FieldValue.increment(pmTotals.mobile),
                    puntoVenta: FieldValue.increment(pmTotals.puntoVenta),
                    biopago: FieldValue.increment(pmTotals.biopago),
                    transfer: FieldValue.increment(pmTotals.transfer),
                    // prestamo diferido a cobros de CxC
                    prestamo: FieldValue.increment(0),
                },
                paymentMethodsBs: {
                    cashBs: FieldValue.increment(pmTotalsBs.cashBs),
                    cashUsd: FieldValue.increment(pmTotalsBs.cashUsd),
                    mobile: FieldValue.increment(pmTotalsBs.mobile),
                    puntoVenta: FieldValue.increment(pmTotalsBs.puntoVenta),
                    biopago: FieldValue.increment(pmTotalsBs.biopago),
                    transfer: FieldValue.increment(pmTotalsBs.transfer),
                    prestamo: FieldValue.increment(0),
                }
            }, { merge: true });

            // 6. Actualizar agregadores por producto (Diario y Mensual) y stock global
            const monthStr = dateStr.substring(0, 7); // Formato YYYY-MM
            items.forEach(item => {
                const productStatRef = adminDb.collection(PRODUCT_STATS_COLLECTION).doc(`${dateStr}_${empresaId}_${item.productId}`);
                const productMonthlyRef = adminDb.collection('metricas_productos_mensuales').doc(`${monthStr}_${empresaId}_${item.productId}`);

                // Agregador Diario (para detalles finos)
                transaction.set(productStatRef, {
                    date: dateStr,
                    empresaId: empresaId,
                    productId: item.productId,
                    productName: item.nombre || 'Producto sin nombre',
                    sku: item.sku || '',
                    unitsSold: FieldValue.increment(item.cantidad),
                    revenueBs: FieldValue.increment(item.subtotal * activeRate),
                    stockMoved: FieldValue.increment(item.cantidad)
                }, { merge: true });

                // Agregador Mensual (Súper eficiente para rangos largos)
                transaction.set(productMonthlyRef, {
                    month: monthStr,
                    empresaId: empresaId,
                    productId: item.productId,
                    productName: item.nombre || 'Producto sin nombre',
                    sku: item.sku || '',
                    unitsSold: FieldValue.increment(item.cantidad),
                    revenueBs: FieldValue.increment(item.subtotal * activeRate)
                }, { merge: true });
            });

            // Actualizar salidas globales de stock
            const dailyStockRef = adminDb.collection(STOCK_STATS_COLLECTION).doc(`${dateStr}_${empresaId}`);
            transaction.set(dailyStockRef, {
                date: dateStr,
                empresaId: empresaId,
                entradas: FieldValue.increment(0),
                salidas: FieldValue.increment(totalUnits)
            }, { merge: true });

            applyEmpresaStatsDelta(transaction, empresaId, {
                totalInventoryValue: -totalValueToRemove,
                totalCostValue: -totalCostToRemove,
                totalStock: -totalUnits,
                totalSalesCount: 1,
                totalSalesAmount: recognized.recognizedUsd,
                lastSaleDate: new Date()
            });
        });

        // Limpiar caché de estadísticas, productos e historial de la empresa
        await clearEmpresaSaleCaches(empresaId);

        try {
            await touchClientPurchase(empresaId, clienteNormalizado, new Date());
        } catch (touchErr) {
            console.warn('touchClientPurchase:', touchErr.message);
        }

        res.status(201).json({
            message: "Venta procesada exitosamente",
            saleId,
            controlFiscal,
            fechaVenta: new Date().toISOString(),
        });

    } catch (error) {
        console.error('Error en createSale:', error);
        res.status(500).json({ error: error.message });
    }
};

export const getSalesHistory = async (req, res) => {
    try {
        const { empresaId, from, to, lastDocId, limit = 10, search } = req.query;
        if (!empresaId) return res.status(400).json({ error: "empresaId requerido" });

        // Intentar obtener del caché (solo para la página 1 sin filtros de búsqueda activos)
        const cacheKey = `history-${empresaId}-${from || 'none'}-${to || 'none'}-${limit}`;
        if (!lastDocId && !search) {
            const cachedData = await statsCache.get(cacheKey);
            if (cachedData) {
                console.log(`🚀 [Cache] Sales history hit for ${empresaId}`);
                return res.status(200).json(cachedData);
            }
        }

        // Caso 1: Búsqueda por ID (Inteligente: ignora espacios y maneja guiones)
        if (search && search.trim() !== '') {
            const searchTerm = search.trim();
            // Variaciones: original, sin espacios, con guiones en lugar de espacios
            const searchVariations = [
                searchTerm,
                searchTerm.replace(/\s+/g, ''),
                searchTerm.replace(/\s+/g, '-')
            ];

            // Eliminar duplicados
            const uniqueVariations = [...new Set(searchVariations)];

            // Buscar en Firestore (usando In query para buscar múltiples variaciones)
            const idSnapshot = await adminDb.collection(SALES_COLLECTION)
                .where('id', 'in', uniqueVariations.slice(0, 10)) // Max 10 para 'in'
                .limit(10)
                .get();

            const allSales = idSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    _id: doc.id,
                    ...data,
                    fechaVenta: data.fechaVenta && data.fechaVenta.toDate
                        ? data.fechaVenta.toDate().toISOString()
                        : data.fechaVenta
                };
            });

            // Filtrar por empresaId por seguridad en el código
            const filteredSales = allSales.filter(s => s.empresaId === empresaId);

            return res.status(200).json({
                sales: filteredSales,
                hasMore: false
            });
        }

        // Caso 2: Listado general y filtros por fecha
        let query = adminDb.collection(SALES_COLLECTION)
            .where('empresaId', '==', empresaId);

        if (from) {
            const start = new Date(`${from}T00:00:00-04:00`);
            const endStr = to ? to : from;
            const end = new Date(`${endStr}T23:59:59-04:00`);
            query = query.where('fechaVenta', '>=', start)
                .where('fechaVenta', '<=', end);
        }

        query = query.orderBy('fechaVenta', 'desc');

        if (lastDocId) {
            const lastDoc = await adminDb.collection(SALES_COLLECTION).doc(lastDocId).get();
            if (lastDoc.exists) {
                query = query.startAfter(lastDoc);
            }
        }

        const snapshot = await query.limit(parseInt(limit) + 1).get();

        const sales = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                _id: doc.id,
                ...data,
                fechaVenta: data.fechaVenta && data.fechaVenta.toDate
                    ? data.fechaVenta.toDate().toISOString()
                    : data.fechaVenta
            };
        });

        const hasMore = sales.length > parseInt(limit);
        const results = hasMore ? sales.slice(0, parseInt(limit)) : sales;

        const responseData = {
            sales: results,
            hasMore,
            lastDocId: results.length > 0 ? results[results.length - 1]._id : null
        };

        // Guardar en caché solo la primera página
        if (!lastDocId && !search) {
            await statsCache.set(cacheKey, responseData);
        }

        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getSalesStats = async (req, res) => {
    try {
        const { empresaId, from, to } = req.query;
        if (!empresaId) return res.status(400).json({ error: "empresaId requerido" });


        // Caché: empresaId justo después de sales- para que clearByPrefix(`sales-${empresaId}`) la invalide
        const cacheKey = `sales-${empresaId}-v8-${from || 'month'}-${to || 'today'}`;
        const cachedData = await statsCache.get(cacheKey);
        if (cachedData) {
            console.log(`🚀 [Cache] Sales stats hit for ${empresaId}`);
            return res.status(200).json(cachedData);
        }

        // 0. Tasa BCV solo desde API (sin número inventado ni divisor 1).
        let activeRate = null;
        try {
            const bcvRes = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            if (bcvRes.ok) {
                const bcvData = await bcvRes.json();
                const r = Number((bcvData.promedio || bcvData.valor).toFixed(2));
                if (Number.isFinite(r) && r > 0) activeRate = r;
            }
        } catch (err) {}

        const safeRate =
            typeof activeRate === 'number' && Number.isFinite(activeRate) && activeRate > 0
                ? activeRate
                : null;

        console.time(`getSalesStats-${empresaId}`);

        // 1. CONFIGURAR RANGO (Y BÚSQUEDA PROFUNDA)
        let startDate, endDate;
        if (from && to) {
            startDate = new Date(`${from}T00:00:00-04:00`);
            endDate = new Date(`${to}T23:59:59-04:00`);
        } else {
            // Buscamos un rango mucho más amplio por si acaso
            endDate = new Date();
            startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1); 
        }
        
        const fromStr = startDate.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
        const toStr = endDate.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });

        const historyMap = {};
        let curr = new Date(startDate);
        while (curr <= endDate) {
            const dStr = curr.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
            historyMap[dStr] = { date: dStr, revenue: 0, revenueBs: 0, profit: 0, profitBs: 0, units: 0, orders: 0, exchangeRate: 0, cashUsd: 0, cashUsdBs: 0 };
            curr.setDate(curr.getDate() + 1);
        }

        // Totales siempre desde comprobantes + abonos CxC (fuente de verdad).
        const ventasSnap = await adminDb.collection(SALES_COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('fechaVenta', '>=', startDate)
            .where('fechaVenta', '<=', endDate)
            .get();

        const ventasMetrics = accumulateRecognizedMetricsFromVentasDocs(ventasSnap.docs);

        const accountsSnap = await adminDb.collection('cuentas')
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', 'por_cobrar')
            .get();

        const cxcMetrics = accumulateCxCAbonosMetricsInRange(
            accountsSnap.docs,
            fromStr,
            toStr
        );

        const pmBsAgg = emptyPaymentMethodBuckets();
        mergePaymentBuckets(pmBsAgg, ventasMetrics.pmBsAgg);
        mergePaymentBuckets(pmBsAgg, cxcMetrics.pmBsAgg);
        stripPrestamoFromPaymentBuckets(pmBsAgg);

        const pmUsdAgg = emptyPaymentMethodBuckets();
        mergePaymentBuckets(pmUsdAgg, ventasMetrics.pmUsdAgg);
        mergePaymentBuckets(pmUsdAgg, cxcMetrics.pmUsdAgg);
        stripPrestamoFromPaymentBuckets(pmUsdAgg);

        /** Dólares físicos se mantienen en $; Bs del ticket quedan históricos. */
        const cashUsdActual = Number(pmUsdAgg.cashUsd || 0);
        const cashUsdBsHist = Number(pmBsAgg.cashUsd || 0);
        const totalRevenueBs = ventasMetrics.totalRevenueBs + cxcMetrics.totalRevenueBs;
        const otherRevenueBs = Math.max(0, totalRevenueBs - cashUsdBsHist);

        const totalProfitBs = ventasMetrics.totalProfitBs + cxcMetrics.totalProfitBs;
        const totalProfitCashUsd = Number(ventasMetrics.totalProfitCashUsd || 0)
            + Number(cxcMetrics.totalProfitCashUsd || 0);
        const totalProfitCashUsdBs = Number(ventasMetrics.totalProfitCashUsdBs || 0)
            + Number(cxcMetrics.totalProfitCashUsdBs || 0);
        const otherProfitBs = Math.max(0, totalProfitBs - totalProfitCashUsdBs);
        const totalOrders = ventasMetrics.totalOrders;
        const totalUnitsSold = ventasMetrics.totalUnits;

        const dailyByDate = {};
        mergeDailyMetricsMaps(dailyByDate, ventasMetrics.dailyByDate);
        mergeDailyMetricsMaps(dailyByDate, cxcMetrics.dailyByDate);
        applyDailyMetricsToHistoryMap(historyMap, dailyByDate, fromStr, toStr);

        const totalRevenue = safeRate != null
            ? cashUsdActual + otherRevenueBs / safeRate
            : 0;
        const totalProfit = safeRate != null
            ? totalProfitCashUsd + otherProfitBs / safeRate
            : 0;

        const paymentMethodsBreakdownBs = {
            cashBs: pmBsAgg.cashBs,
            cashUsd: cashUsdBsHist,
            mobile: pmBsAgg.mobile,
            puntoVenta: pmBsAgg.puntoVenta,
            biopago: pmBsAgg.biopago,
            transfer: pmBsAgg.transfer,
            prestamo: 0,
        };

        const paymentMethodsBreakdown = {
            cashBs: safeRate != null ? pmBsAgg.cashBs / safeRate : 0,
            cashUsd: cashUsdActual,
            mobile: safeRate != null ? pmBsAgg.mobile / safeRate : 0,
            puntoVenta: safeRate != null ? pmBsAgg.puntoVenta / safeRate : 0,
            biopago: safeRate != null ? pmBsAgg.biopago / safeRate : 0,
            transfer: safeRate != null ? pmBsAgg.transfer / safeRate : 0,
            prestamo: 0,
        };

        const averageTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

        const history = Object.values(historyMap)
            .sort((a, b) => a.date.localeCompare(b.date));

        const responseData = {
            totalRevenue,
            totalRevenueBs,
            totalUnitsSold,
            grossProfit: totalProfit,
            grossProfitBs: totalProfitBs,
            profitCashUsd: totalProfitCashUsd,
            profitCashUsdBs: totalProfitCashUsdBs,
            totalOrders,
            averageTicket,
            /** Tasa USD usada en esta respuesta (solo API); null si falló la consulta. */
            bcvRateUsd: safeRate,
            paymentMethodsBreakdown,
            paymentMethodsBreakdownBs,
            topProducts: [],
            bottomProducts: [],
            history,
        };

        // Guardar en caché
        await statsCache.set(cacheKey, responseData);

        console.log(`📊 [getSalesStats] Calculated totalUnitsSold: ${totalUnitsSold} for ${empresaId}`);
        console.timeEnd(`getSalesStats-${empresaId}`);
        res.status(200).json(responseData);
    } catch (error) {
        console.error('Error in getSalesStats:', error);
        try { console.timeEnd(`getSalesStats-${req.query.empresaId}`); } catch (e) {}
        res.status(500).json({ error: error.message });
    }
};

export const deleteSale = async (req, res) => {
    const { id } = req.params;
    const { empresaId } = req.query;

    if (!id || !empresaId) {
        return res.status(400).json({ error: "Faltan parámetros requeridos (id, empresaId)" });
    }

    try {
        // 1. OBTENER INFORMACIÓN DE LA VENTA PARA ENCONTRAR SUS MOVIMIENTOS
        const saleRef = adminDb.collection(SALES_COLLECTION).doc(id);
        const saleSnap = await saleRef.get();

        if (!saleSnap.exists) {
            return res.status(404).json({ error: "La factura no existe" });
        }

        const saleData = saleSnap.data();
        if (saleData.empresaId !== empresaId) {
            return res.status(403).json({ error: "No tienes permiso para eliminar esta factura" });
        }

        // El campo 'id' de la venta es el que se usa como 'referencia' en los movimientos
        const saleIdStr = saleData.id;
        const productItems = (saleData.items && Array.isArray(saleData.items)) ? saleData.items : [];

        // 2. MOVIMIENTOS: solo índice simple por referencia (evita índice compuesto referencia+empresaId).
        const movementsSnapshot = await adminDb.collection('movimientos_stock')
            .where('referencia', '==', saleIdStr)
            .get();

        const movementDocsForSale = movementsSnapshot.docs.filter(
            (mDoc) => mDoc.data().empresaId === empresaId
        );

        let restoredUnits = 0;
        let missingProducts = [];

        await adminDb.runTransaction(async (transaction) => {
            // Validar de nuevo dentro de la transacción
            const tSaleSnap = await transaction.get(saleRef);
            if (!tSaleSnap.exists) throw new Error("La factura ya fue eliminada");

            // Resolver productId (histórico: productId o id)
            const productRefs = productItems.map((item) => {
                const pid = item.productId || item.id;
                if (!pid) return null;
                return adminDb.collection(PRODUCTS_COLLECTION).doc(pid);
            });

            const productSnaps = await Promise.all(
                productRefs.map((ref) => (ref ? transaction.get(ref) : Promise.resolve(null)))
            );

            let totalValueToRestore = 0;
            const totalCostToRestore = productItems.reduce(
                (sum, item) => sum + (Number(item.cantidad || 0) * Number(item.costo || 0)),
                0
            );
            const productUpdates = [];
            missingProducts = [];
            restoredUnits = 0;

            for (let i = 0; i < productItems.length; i++) {
                const item = productItems[i];
                const qty = Number(item.cantidad) || 0;
                const snap = productSnaps[i];
                const pid = item.productId || item.id;

                if (!pid || !snap || !snap.exists) {
                    missingProducts.push(item.nombre || pid || `ítem ${i + 1}`);
                    continue;
                }

                const productData = snap.data();
                const valorProd = parseFloat(productData.valor) || 0;
                const costoProd = parseFloat(productData.costo) || 0;
                const currentStock = Number(productData.stock) || 0;
                const newStock = currentStock + qty;

                totalValueToRestore += qty * valorProd;
                restoredUnits += qty;

                productUpdates.push({
                    ref: productRefs[i],
                    updateData: {
                        stock: newStock,
                        totalValue: newStock * valorProd,
                        totalCostValue: newStock * costoProd,
                        unitsSoldTotal: FieldValue.increment(-qty),
                        updatedAt: new Date(),
                    },
                });
            }

            // Escrituras: primero stock, luego métricas y borrados
            productUpdates.forEach((upd) => transaction.update(upd.ref, upd.updateData));
            movementDocsForSale.forEach((mDoc) => transaction.delete(mDoc.ref));

            const saleDateObj = saleData.fechaVenta?.toDate
                ? saleData.fechaVenta.toDate()
                : new Date(saleData.fechaVenta);
            const dateStr = saleDateObj.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
            const dailyStatsRef = adminDb.collection(DAILY_STATS_COLLECTION).doc(`${dateStr}_${empresaId}`);
            const rate = Number(saleData.exchangeRate || 0);

            const totalUnitsRestored = productItems.reduce(
                (sum, i) => sum + (Number(i.cantidad) || 0),
                0
            );
            const saleProfit = saleData.profit !== undefined
                ? saleData.profit
                : (saleData.total - totalCostToRestore);

            const pmToSubtract = emptyPaymentMethodBuckets();
            const pmToSubtractBs = emptyPaymentMethodBuckets();
            if (saleData.metodosPago && Array.isArray(saleData.metodosPago)) {
                saleData.metodosPago.forEach((p) => {
                    const amount = parseFloat(p.amount || p.monto || 0);
                    const key = paymentMethodKeyFromMetodo(p.method || p.metodo);
                    pmToSubtract[key] += amount;
                    pmToSubtractBs[key] += amount * rate;
                });
            } else {
                pmToSubtract.cashUsd = saleData.total;
                pmToSubtractBs.cashUsd = saleData.total * rate;
            }

            // Solo se revirtió en métricas lo cobrado al momento de la venta (sin préstamo)
            const recognized = getRecognizedSaleAmounts({
                total: saleData.total,
                saleProfit,
                pmTotals: pmToSubtract,
                pmTotalsBs: pmToSubtractBs,
                rate,
            });
            const profitCashUsd = recognized.recognizedProfit
                * cashUsdProfitShare(pmToSubtract.cashUsd, Math.max(recognized.recognizedUsd, 0.01));

            transaction.set(dailyStatsRef, {
                revenue: FieldValue.increment(-recognized.recognizedUsd),
                revenueBs: FieldValue.increment(-recognized.recognizedRevenueBs),
                profit: FieldValue.increment(-recognized.recognizedProfit),
                profitBs: FieldValue.increment(-recognized.recognizedProfitBs),
                profitCashUsd: FieldValue.increment(-profitCashUsd),
                profitCashUsdBs: FieldValue.increment(-(profitCashUsd * rate)),
                units: FieldValue.increment(-totalUnitsRestored),
                orders: FieldValue.increment(-1),
                paymentMethods: {
                    cashBs: FieldValue.increment(-pmToSubtract.cashBs),
                    cashUsd: FieldValue.increment(-pmToSubtract.cashUsd),
                    mobile: FieldValue.increment(-pmToSubtract.mobile),
                    puntoVenta: FieldValue.increment(-pmToSubtract.puntoVenta),
                    biopago: FieldValue.increment(-pmToSubtract.biopago),
                    transfer: FieldValue.increment(-pmToSubtract.transfer),
                    prestamo: FieldValue.increment(0),
                },
                paymentMethodsBs: {
                    cashBs: FieldValue.increment(-pmToSubtractBs.cashBs),
                    cashUsd: FieldValue.increment(-pmToSubtractBs.cashUsd),
                    mobile: FieldValue.increment(-pmToSubtractBs.mobile),
                    puntoVenta: FieldValue.increment(-pmToSubtractBs.puntoVenta),
                    biopago: FieldValue.increment(-pmToSubtractBs.biopago),
                    transfer: FieldValue.increment(-pmToSubtractBs.transfer),
                    prestamo: FieldValue.increment(0),
                },
            }, { merge: true });

            const monthStr = dateStr.substring(0, 7);
            productItems.forEach((item) => {
                const pid = item.productId || item.id;
                if (!pid) return;
                const qty = Number(item.cantidad) || 0;
                const subtotal = Number(item.subtotal) || 0;
                const productStatRef = adminDb.collection(PRODUCT_STATS_COLLECTION)
                    .doc(`${dateStr}_${saleData.empresaId}_${pid}`);
                const productMonthlyRef = adminDb.collection('metricas_productos_mensuales')
                    .doc(`${monthStr}_${saleData.empresaId}_${pid}`);

                transaction.set(productStatRef, {
                    unitsSold: FieldValue.increment(-qty),
                    revenueBs: FieldValue.increment(-(subtotal * rate)),
                    stockMoved: FieldValue.increment(-qty),
                }, { merge: true });

                transaction.set(productMonthlyRef, {
                    unitsSold: FieldValue.increment(-qty),
                    revenueBs: FieldValue.increment(-(subtotal * rate)),
                }, { merge: true });
            });

            const dailyStockRef = adminDb.collection(STOCK_STATS_COLLECTION).doc(`${dateStr}_${empresaId}`);
            transaction.set(dailyStockRef, {
                salidas: FieldValue.increment(-totalUnitsRestored),
            }, { merge: true });

            applyEmpresaStatsDelta(transaction, empresaId, {
                totalInventoryValue: totalValueToRestore,
                totalCostValue: totalCostToRestore,
                totalStock: restoredUnits,
                totalSalesCount: -1,
                totalSalesAmount: -recognized.recognizedUsd,
            });

            transaction.delete(saleRef);
        });

        // CxC de préstamo: fuera de la transacción de stock para no bloquear la restauración
        try {
            const linkedAccountsSnap = await adminDb.collection('cuentas')
                .where('ventaId', '==', saleIdStr)
                .get();
            const toDelete = linkedAccountsSnap.docs.filter((doc) => {
                const data = doc.data();
                return data.empresaId === empresaId
                    && data.tipo === 'por_cobrar'
                    && (!Array.isArray(data.abonos) || data.abonos.length === 0);
            });
            await Promise.all(toDelete.map((doc) => doc.ref.delete()));
        } catch (cxcErr) {
            console.warn('deleteSale: no se pudieron limpiar CxC vinculadas:', cxcErr.message);
        }

        await clearEmpresaSaleCaches(empresaId);

        const deletedClientCedula = normalizeClienteCedula(saleData.cliente)
            || normalizeCedula(saleData.clienteCedula);
        if (deletedClientCedula) {
            try {
                await recalculateClientPurchaseDates(empresaId, deletedClientCedula);
            } catch (clientErr) {
                console.warn('deleteSale: no se pudieron recalcular compras del cliente:', clientErr.message);
            }
        }

        const message = missingProducts.length > 0
            ? `Factura eliminada. Stock restaurado (${restoredUnits} u.). Productos no encontrados: ${missingProducts.join(', ')}`
            : `Factura eliminada exitosamente, stock restaurado (${restoredUnits} u.) y movimientos borrados`;

        console.log(`🗑️ [deleteSale] ${saleIdStr} → stock +${restoredUnits}`, {
            missingProducts,
            items: productItems.length,
        });

        res.status(200).json({
            message,
            restoredUnits,
            missingProducts,
        });
    } catch (error) {
        console.error('Error en deleteSale:', error);
        res.status(500).json({ error: error.message });
    }
};

function isFirestoreIndexError(err) {
    return Boolean(err && err.message && err.message.includes('index'));
}

/**
 * Top N de unidades vendidas. Si hay from/to, usa métricas diarias del rango
 * (misma fuente que los comprobantes). Si no, unitsSoldTotal de toda la vida.
 */
export const getProductRanking = async (req, res) => {
    try {
        const { empresaId, limit = 10, from, to } = req.query;
        if (!empresaId) return res.status(400).json({ error: "empresaId requerido" });
        const limitNum = parseInt(limit);

        const cacheKey = from && to
            ? `ranking-${empresaId}-top-${limitNum}-${from}-${to}`
            : `ranking-${empresaId}-top-${limitNum}`;
        const cachedResult = await statsCache.get(cacheKey);
        if (cachedResult) {
            console.log(`🚀 [Cache] Ranking hit for ${empresaId}`);
            return res.status(200).json(cachedResult);
        }

        let topList = [];

        if (from && to) {
            console.log(`📊 [Ranking] Rango ${from}..${to} via metricas_productos_diarias`);
            const rankingSnapshot = await adminDb.collection(PRODUCT_STATS_COLLECTION)
                .where('empresaId', '==', empresaId)
                .where('date', '>=', from)
                .where('date', '<=', to)
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
                    cantidad: 0
                };
                productSoldMap.set(pid, {
                    ...existing,
                    cantidad: existing.cantidad + unitsSold
                });
            });

            topList = Array.from(productSoldMap.values())
                .sort((a, b) => b.cantidad - a.cantidad)
                .slice(0, limitNum);
        } else {
            console.log(`📊 [Ranking] Top products via unitsSoldTotal for ${empresaId}`);
            const snapshot = await adminDb.collection(PRODUCTS_COLLECTION)
                .where('empresaId', '==', empresaId)
                .orderBy('unitsSoldTotal', 'desc')
                .limit(limitNum)
                .get();

            topList = snapshot.docs
                .map((doc) => {
                    const data = doc.data();
                    return {
                        nombre: data.nombre || 'Producto sin nombre',
                        sku: data.sku || '',
                        cantidad: Number(data.unitsSoldTotal || 0)
                    };
                })
                .filter((p) => p.cantidad > 0);
        }

        const response = {
            data: topList,
            total: topList.length,
            page: 1,
            totalPages: 1,
            limit: limitNum
        };

        await statsCache.set(cacheKey, response);
        res.status(200).json(response);
    } catch (error) {
        console.error('Error in getProductRanking:', error);
        if (isFirestoreIndexError(error)) {
            return res.status(412).json({
                error: 'Falta índice compuesto en Firestore para el ranking. Incluido en firestore.indexes.json.',
                isIndexError: true
            });
        }
        res.status(500).json({ error: error.message });
    }
};

const PABILO_API_BASE = 'https://api.pabilo.app/userbankpayment';

function parseCedulaPagador(cedulaPagador) {
    if (!cedulaPagador || typeof cedulaPagador !== 'object') {
        return null;
    }

    const dniType = String(cedulaPagador.dni_type || cedulaPagador.tipo || '').trim().toUpperCase();
    const dniNumber = String(cedulaPagador.dni_number || cedulaPagador.numero || '').replace(/\D/g, '');

    if (!dniType || !dniNumber) {
        return null;
    }

    return { dni_type: dniType, dni_number: dniNumber };
}

export const verifyPaymentMobile = async (req, res) => {
    const {
        empresaId,
        tenantId,
        referencia,
        monto,
        telefonoPagador,
        cedulaPagador,
        bancoOrigen
    } = req.body;

    const effectiveTenantId = empresaId || tenantId;

    if (!effectiveTenantId || !referencia || monto === undefined || monto === null || !telefonoPagador || !cedulaPagador || !bancoOrigen) {
        return res.status(400).json({ error: 'Datos incompletos para verificar pago móvil' });
    }

    const apiKey = process.env.PABILO_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Configuración de Pabilo no disponible' });
    }

    const parsedCedula = parseCedulaPagador(cedulaPagador);
    if (!parsedCedula) {
        return res.status(400).json({ error: 'Cédula del pagador inválida' });
    }

    const bankReference = String(referencia).replace(/\D/g, '');
    const amount = parseFloat(monto);
    const phonePagador = String(telefonoPagador).trim();
    const bankOrigin = String(bancoOrigen).replace(/\D/g, '');

    if (!bankReference || Number.isNaN(amount) || amount <= 0 || !phonePagador || bankOrigin.length !== 4) {
        return res.status(400).json({ error: 'Formato de datos de pago inválido' });
    }

    try {
        const empresaSnap = await adminDb.collection('empresas').doc(effectiveTenantId).get();
        if (!empresaSnap.exists) {
            return res.status(404).json({ error: 'Empresa no encontrada' });
        }

        const empresaData = empresaSnap.data();
        const pabiloUserBankId = empresaData.pabiloUserBankId;

        if (!pabiloUserBankId) {
            return res.status(400).json({ error: 'La empresa no tiene configurado el ID de Pabilo (pabiloUserBankId)' });
        }

        const pabiloBody = {
            bank_reference: bankReference,
            amount,
            dni_pagador: parsedCedula,
            phone_pagador: phonePagador,
            bank_origin: bankOrigin,
            movement_type: 'MOVIL_PAY'
        };

        const pabiloUrl = `${PABILO_API_BASE}/${pabiloUserBankId}/betaserio`;

        const pabiloRes = await fetch(pabiloUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                appKey: apiKey
            },
            body: JSON.stringify(pabiloBody)
        });

        let pabiloData;
        try {
            pabiloData = await pabiloRes.json();
        } catch {
            pabiloData = null;
        }

        if (!pabiloRes.ok) {
            const errorMessage = pabiloData?.message || pabiloData?.error || 'Pago no verificado por Pabilo';
            return res.status(402).json({
                error: errorMessage,
                pabiloResponse: pabiloData
            });
        }

        if (pabiloData?.is_new === false) {
            return res.status(409).json({
                error: 'Referencia duplicada: posible intento de fraude',
                fraud: true,
                pabiloResponse: pabiloData
            });
        }

        if (pabiloData?.status !== 'verified') {
            return res.status(402).json({
                error: 'El pago no pudo ser verificado',
                pabiloResponse: pabiloData
            });
        }

        return res.status(200).json({
            message: 'Pago móvil verificado correctamente',
            verified: true,
            pabiloResponse: pabiloData
        });
    } catch (error) {
        console.error('Error en verifyPaymentMobile:', error);
        return res.status(500).json({ error: error.message });
    }
};

