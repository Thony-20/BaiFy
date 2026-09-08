/**
 * Compara comprobantes vs métricas de ventas.
 * Regla: Bs cobrados en ticket (inmutable); $/€ = Bs ÷ tasa BCV actual.
 */
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const SALES_COLLECTION = 'ventas';
const ACCOUNTS_COLLECTION = 'cuentas';

const EMPRESA_ID = process.argv[2] || 'tpGXeLloTLZuLgwpoNHR';
const FROM = process.argv[3] || '2026-01-01';
const TO = process.argv[4] || '2026-08-23';

function paymentMethodKeyFromMetodo(methodRaw) {
    const method = String(methodRaw || 'cash-bs').toLowerCase();
    if (method.includes('cash-usd') || method === 'efectivo-usd') return 'cashUsd';
    if (method.includes('mobile') || method.includes('pago-movil') || method.includes('movil')) return 'mobile';
    if (method.includes('card') || method.includes('punto') || method === 'tarjeta') return 'puntoVenta';
    if (method.includes('biopago')) return 'biopago';
    if (method.includes('transfer')) return 'transfer';
    if (method.includes('prestamo') || method.includes('préstamo')) return 'prestamo';
    return 'cashBs';
}

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function getVentaDateStr(data) {
    const fv = data.fechaVenta;
    const saleDate = fv?.toDate ? fv.toDate() : new Date(fv);
    if (!saleDate || Number.isNaN(saleDate.getTime())) return null;
    return saleDate.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
}

function parseBuckets(data) {
    const total = Number(data.total || 0);
    const rate = Number(data.exchangeRate || 0);
    const bucketsUsd = {
        cashBs: 0, cashUsd: 0, mobile: 0, puntoVenta: 0, biopago: 0, transfer: 0, prestamo: 0,
    };
    const bucketsBs = {
        cashBs: 0, cashUsd: 0, mobile: 0, puntoVenta: 0, biopago: 0, transfer: 0, prestamo: 0,
    };
    const metodos = data.metodosPago;
    if (metodos && Array.isArray(metodos) && metodos.length > 0) {
        metodos.forEach((p) => {
            const amountUsd = parseFloat(p.amount || p.monto || 0);
            const key = paymentMethodKeyFromMetodo(p.method || p.metodo);
            bucketsUsd[key] += amountUsd;
            bucketsBs[key] += round2(amountUsd * rate);
        });
    } else {
        bucketsUsd.cashUsd = total;
        bucketsBs.cashUsd = round2(total * rate);
    }
    const recognizedUsd = round2(Math.max(0, total - bucketsUsd.prestamo));
    let recognizedBs = 0;
    Object.entries(bucketsBs).forEach(([key, val]) => {
        if (key !== 'prestamo') recognizedBs += val;
    });
    recognizedBs = round2(recognizedBs);
    return { bucketsUsd, bucketsBs, total, rate, recognizedUsd, recognizedBs };
}

async function fetchBcvRate() {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!res.ok) throw new Error('No se pudo obtener tasa BCV');
    const data = await res.json();
    return round2(Number(data.promedio || data.valor));
}

async function fetchSalesStats(empresaId, from, to) {
    const url = `http://127.0.0.1:3000/api/sales/stats?empresaId=${empresaId}&from=${from}&to=${to}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API stats ${res.status}: ${await res.text()}`);
    return res.json();
}

async function main() {
    console.log('\n=== Comparación Comprobantes vs Métricas ===');
    console.log(`Empresa: ${EMPRESA_ID} | ${FROM} → ${TO}\n`);

    const todayRate = await fetchBcvRate();
    console.log(`Tasa BCV actual: Bs. ${todayRate} / $\n`);

    const startDate = new Date(`${FROM}T00:00:00-04:00`);
    const endDate = new Date(`${TO}T23:59:59-04:00`);

    const ventasSnap = await db.collection(SALES_COLLECTION)
        .where('empresaId', '==', EMPRESA_ID)
        .where('fechaVenta', '>=', startDate)
        .where('fechaVenta', '<=', endDate)
        .get();

    const pmBs = { cashBs: 0, cashUsd: 0, mobile: 0, puntoVenta: 0, biopago: 0, transfer: 0 };
    let sumTotalUsd = 0;
    let sumRecognizedBs = 0;
    let sumPrestamoUsd = 0;
    let sumProfitBs = 0;
    const comprobantes = [];

    ventasSnap.docs.forEach((doc) => {
        const data = doc.data();
        const dateStr = getVentaDateStr(data);
        if (!dateStr || dateStr < FROM || dateStr > TO) return;

        const { bucketsBs, total, rate, recognizedBs, recognizedUsd } = parseBuckets(data);
        let profit = Number(data.profit);
        if (!Number.isFinite(profit)) {
            let cost = 0;
            (data.items || []).forEach((i) => { cost += (Number(i.costo) || 0) * (Number(i.cantidad) || 0); });
            profit = total - cost;
        }
        const share = total > 0.009 ? recognizedUsd / total : 0;
        const recognizedProfitBs = round2(profit * share * rate);

        sumTotalUsd += total;
        sumRecognizedBs += recognizedBs;
        sumPrestamoUsd += parseBuckets(data).bucketsUsd.prestamo;
        sumProfitBs += recognizedProfitBs;

        Object.keys(pmBs).forEach((k) => { pmBs[k] += bucketsBs[k]; });

        comprobantes.push({
            id: data.id || data.controlFiscal || doc.id.slice(0, 8),
            date: dateStr,
            totalUsd: round2(total),
            recognizedBs: round2(recognizedBs),
            recognizedUsdEq: round2(recognizedBs / todayRate),
            rate,
        });
    });

    Object.keys(pmBs).forEach((k) => { pmBs[k] = round2(pmBs[k]); });

    const accountsSnap = await db.collection(ACCOUNTS_COLLECTION)
        .where('empresaId', '==', EMPRESA_ID)
        .where('tipo', '==', 'por_cobrar')
        .get();

    let cxcBs = 0;
    accountsSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.metricsDeferred !== true) return;
        (data.abonos || []).forEach((abono) => {
            if (abono.metricsApplied !== true) return;
            const d = abono.metricsDate;
            if (!d || d < FROM || d > TO) return;
            const tasa = Number(abono.tasaCambio) || 0;
            const montoBs = abono.montoBs != null && abono.montoBs !== ''
                ? Number(abono.montoBs)
                : round2((Number(abono.monto) || 0) * tasa);
            cxcBs += montoBs;
            const key = abono.metricsMethodKey || paymentMethodKeyFromMetodo(abono.metodoPago);
            if (key !== 'prestamo' && pmBs[key] != null) pmBs[key] += montoBs;
        });
    });
    cxcBs = round2(cxcBs);
    sumRecognizedBs = round2(sumRecognizedBs + cxcBs);

    const comprobantesUsdReal = round2(sumRecognizedBs / todayRate);

    console.log(`Comprobantes: ${comprobantes.length}\n`);
    console.log('--- COMPROBANTES (Bs = real, $ = Bs ÷ tasa hoy) ---');
    console.log(`Total facturado USD ref.: $${round2(sumTotalUsd)}`);
    console.log(`Préstamo diferido: $${round2(sumPrestamoUsd)}`);
    console.log(`Bs cobrados reconocidos: Bs. ${sumRecognizedBs}`);
    console.log(`$ REAL (= Bs ÷ ${todayRate}): $${comprobantesUsdReal}`);
    console.log('\nDesglose Bs por método:');
    Object.entries(pmBs).filter(([, v]) => v > 0).forEach(([k, v]) => {
        console.log(`  ${k}: Bs. ${round2(v)} → $${round2(v / todayRate)}`);
    });

    console.log('\n--- MÉTRICAS API ---');
    const stats = await fetchSalesStats(EMPRESA_ID, FROM, TO);
    const apiBs = round2(stats.totalRevenueBs || 0);
    const apiUsd = round2(stats.totalRevenue || 0);
    const sumPmBs = round2(
        Object.values(stats.paymentMethodsBreakdownBs || {}).reduce((s, v) => s + (Number(v) || 0), 0)
    );

    console.log(`totalRevenueBs: Bs. ${apiBs}`);
    console.log(`totalRevenue ($): $${apiUsd}`);
    console.log(`Suma métodos Bs: Bs. ${sumPmBs}`);
    console.log(`Ganancia: Bs. ${round2(stats.grossProfitBs || 0)} → $${round2(stats.grossProfit || 0)}`);
    console.log(`Órdenes: ${stats.totalOrders}`);

    const diffBs = round2(sumRecognizedBs - apiBs);
    const diffUsd = round2(comprobantesUsdReal - apiUsd);

    console.log('\n--- RESULTADO ---');
    console.log(`Δ Bs: ${diffBs} ${Math.abs(diffBs) < 1 ? '✅' : '❌'}`);
    console.log(`Δ $ (Bs÷tasa): $${diffUsd} ${Math.abs(diffUsd) < 0.02 ? '✅' : '❌'}`);

    if (Math.abs(diffBs) >= 1) {
        console.log('\nDetalle comprobantes:');
        comprobantes.forEach((c) => {
            console.log(`  ${c.date} | ${c.id} | Bs. ${c.recognizedBs} | $${c.recognizedUsdEq} | tasa ticket ${c.rate}`);
        });
    }

    process.exit(Math.abs(diffBs) < 1 ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
