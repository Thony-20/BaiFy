import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

// Cargar service account (ajustado a la raíz del backend)
const serviceAccount = JSON.parse(
  await readFile(new URL('../serviceAccountKey.json', import.meta.url))
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const SALES_COLLECTION = 'ventas';
const DAILY_STATS_COLLECTION = 'metricas_diarias';

async function migrate() {
    console.log('🚀 Iniciando migración a Resúmenes Diarios...');
    
    const salesSnapshot = await db.collection(SALES_COLLECTION).get();
    console.log(`Encontradas ${salesSnapshot.size} ventas.`);

    const dailyData = {}; // key: YYYY-MM-DD_empresaId

    for (const doc of salesSnapshot.docs) {
        const sale = doc.data();
        const empresaId = sale.empresaId;
        if (!empresaId) continue;

        const saleDateObj = sale.fechaVenta?.toDate ? sale.fechaVenta.toDate() : new Date(sale.fechaVenta);
        const dateStr = saleDateObj.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
        const key = `${dateStr}_${empresaId}`;

        if (!dailyData[key]) {
            dailyData[key] = {
                date: dateStr,
                empresaId: empresaId,
                revenue: 0,
                revenueBs: 0,
                profit: 0,
                profitBs: 0,
                units: 0,
                orders: 0
            };
        }

        const rate = Number(sale.exchangeRate || 36.5);
        let saleRevenueUSD = 0;
        
        // Calcular ingresos
        if (sale.metodosPago && Array.isArray(sale.metodosPago)) {
            sale.metodosPago.forEach(p => {
                saleRevenueUSD += parseFloat(p.amount || p.monto || 0);
            });
        } else {
            saleRevenueUSD = Number(sale.total || 0);
        }

        // Calcular unidades
        let saleUnits = 0;
        let saleCOGSUSD = 0;
        if (sale.items && Array.isArray(sale.items)) {
            sale.items.forEach(item => {
                const qty = Number(item.cantidad || 0);
                saleUnits += qty;
                const cost = Number(item.costo || 0);
                saleCOGSUSD += (qty * cost);
            });
        }

        const saleSubtotalUSD = Number(sale.subtotal || 0);
        const saleProfitUSD = saleSubtotalUSD - saleCOGSUSD;

        dailyData[key].revenue += saleRevenueUSD;
        dailyData[key].revenueBs += (saleRevenueUSD * rate);
        dailyData[key].profit += saleProfitUSD;
        dailyData[key].profitBs += (saleProfitUSD * rate);
        dailyData[key].units += saleUnits;
        dailyData[key].orders += 1;
    }

    console.log(`Generados ${Object.keys(dailyData).length} resúmenes diarios.`);

    // Guardar en Firestore en lotes (Batches)
    let batch = db.batch();
    let count = 0;

    for (const [key, data] of Object.entries(dailyData)) {
        const ref = db.collection(DAILY_STATS_COLLECTION).doc(key);
        batch.set(ref, data, { merge: true });
        count++;

        if (count >= 400) {
            await batch.commit();
            batch = db.batch();
            count = 0;
            console.log('Batch procesado...');
        }
    }

    if (count > 0) {
        await batch.commit();
    }

    console.log('✅ Migración completada con éxito.');
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Error en migración:', err);
    process.exit(1);
});
