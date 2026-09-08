import { FieldValue } from 'firebase-admin/firestore';

export function emptyPaymentMethodBuckets() {
    return {
        cashBs: 0,
        cashUsd: 0,
        mobile: 0,
        puntoVenta: 0,
        biopago: 0,
        transfer: 0,
        prestamo: 0,
    };
}

/** Clasifica método POS / abono al bucket de métricas diarias. */
export function paymentMethodKeyFromMetodo(methodRaw) {
    const method = String(methodRaw || 'cash-bs').toLowerCase();
    if (method.includes('cash-usd') || method === 'efectivo-usd' || method === 'efectivo_usd') {
        return 'cashUsd';
    }
    if (method.includes('mobile') || method.includes('pago-movil') || method.includes('pago_movil')) {
        return 'mobile';
    }
    if (method.includes('card') || method.includes('punto') || method === 'tarjeta') {
        return 'puntoVenta';
    }
    if (method.includes('biopago')) return 'biopago';
    if (method.includes('transfer')) return 'transfer';
    if (method.includes('prestamo') || method.includes('préstamo')) return 'prestamo';
    // "efectivo" genérico (legado de abonos) → efectivo Bs
    if (method === 'efectivo' || method.includes('cash-bs') || method.includes('efectivo-bs')) {
        return 'cashBs';
    }
    if (method === 'otro') return 'transfer';
    return 'cashBs';
}

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Suma buckets de pago reconocidos (excluye préstamo diferido). */
export function sumRecognizedPaymentMethodsBs(buckets) {
    return Object.entries(buckets || {}).reduce((sum, [key, val]) => (
        key === 'prestamo' ? sum : sum + (Number(val) || 0)
    ), 0);
}

/** Elimina préstamo de buckets agregados (legacy / backfill). */
export function stripPrestamoFromPaymentBuckets(buckets) {
    if (!buckets) return;
    buckets.prestamo = 0;
}

/**
 * Cobros de CxC/préstamo que deben sumar a metricas_diarias al abonar.
 * Solo cuentas por cobrar con métricas diferidas (evita doble conteo en CxC legacy).
 */
export function shouldApplyCxCPaymentMetrics(accountData) {
    if (!accountData || accountData.tipo !== 'por_cobrar') {
        return false;
    }
    return accountData.metricsDeferred === true;
}

/**
 * Parte de la venta ya cobrada (excluye préstamo) para métricas.
 */
export function getRecognizedSaleAmounts({
    total,
    saleProfit,
    pmTotals,
    pmTotalsBs,
    rate,
}) {
    const saleTotal = Number(total) || 0;
    const prestamoUsd = Number(pmTotals?.prestamo) || 0;
    const prestamoBs = Number(pmTotalsBs?.prestamo) || 0;
    const recognizedUsd = Math.max(0, roundMoney(saleTotal - prestamoUsd));
    const share = saleTotal > 0.009 ? recognizedUsd / saleTotal : 0;
    const profit = roundMoney((Number(saleProfit) || 0) * share);
    const revenueBs = Math.max(
        0,
        roundMoney(
            Object.entries(pmTotalsBs || {}).reduce((sum, [key, val]) => (
                key === 'prestamo' ? sum : sum + (Number(val) || 0)
            ), 0)
        )
    );
    // Fallback si no hay desglose Bs
    const finalRevenueBs = revenueBs > 0.009
        ? revenueBs
        : roundMoney(recognizedUsd * (Number(rate) || 0));

    return {
        recognizedUsd,
        recognizedRevenueBs: finalRevenueBs,
        recognizedProfit: profit,
        recognizedProfitBs: roundMoney(profit * (Number(rate) || 0)),
        prestamoUsd,
        prestamoBs,
        origenProfitForPrestamo: roundMoney((Number(saleProfit) || 0) * (saleTotal > 0.009 ? prestamoUsd / saleTotal : 0)),
    };
}

/**
 * Incrementa metricas_diarias por un cobro de CxC (sin tocar units/orders).
 */
export function applyCxCCollectionToDailyStats(transaction, {
    adminDb,
    dailyStatsCollection,
    empresaId,
    dateStr,
    amountUsd,
    amountBs,
    methodKey,
    profitUsd = 0,
    rate = 0,
}) {
    const key = methodKey && methodKey !== 'prestamo' ? methodKey : 'transfer';
    const usd = roundMoney(amountUsd);
    const bs = roundMoney(amountBs);
    const profit = roundMoney(profitUsd);
    const profitBs = roundMoney(profit * (Number(rate) || 0));
    const dailyStatsRef = adminDb.collection(dailyStatsCollection).doc(`${dateStr}_${empresaId}`);

    const paymentMethods = emptyPaymentMethodBuckets();
    const paymentMethodsBs = emptyPaymentMethodBuckets();
    paymentMethods[key] = FieldValue.increment(usd);
    paymentMethodsBs[key] = FieldValue.increment(bs);

    const updates = {
        date: dateStr,
        empresaId,
        revenue: FieldValue.increment(usd),
        revenueBs: FieldValue.increment(bs),
        profit: FieldValue.increment(profit),
        profitBs: FieldValue.increment(profitBs),
        paymentMethods,
        paymentMethodsBs,
    };

    if (key === 'cashUsd') {
        updates.profitCashUsd = FieldValue.increment(profit);
        updates.profitCashUsdBs = FieldValue.increment(profitBs);
    }

    transaction.set(dailyStatsRef, updates, { merge: true });
    return key;
}
