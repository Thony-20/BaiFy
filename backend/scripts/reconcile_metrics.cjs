const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const SALES_COLLECTION = 'ventas';
const DAILY_STATS_COLLECTION = 'metricas_diarias';

function paymentMethodKeyFromMetodo(methodRaw) {
    const method = (methodRaw || 'cash-bs').toLowerCase();
    if (method.includes('cash-usd')) return 'cashUsd';
    if (method.includes('mobile') || method.includes('movil') || method.includes('móvil')) return 'mobile';
    if (method.includes('card') || method.includes('tarjeta') || method.includes('punto')) return 'puntoVenta';
    if (method.includes('biopago')) return 'biopago';
    if (method.includes('transfer')) return 'transfer';
    return 'cashBs';
}

async function reconcile() {
    console.log('🚀 Iniciando reconciliación y reconstrucción de métricas de ganancia...');
    
    try {
        // 1. Obtener todas las ventas
        const salesSnapshot = await db.collection(SALES_COLLECTION).get();
        console.log(`📋 Total de comprobantes (ventas) encontrados: ${salesSnapshot.size}`);

        const calculatedDailyMetrics = {};
        const activeEmpresaIds = new Set();

        // 2. Procesar cada venta
        for (const doc of salesSnapshot.docs) {
            const data = doc.data();
            const empresaId = data.empresaId;
            if (!empresaId) continue;

            activeEmpresaIds.add(empresaId);

            const rate = Number(data.exchangeRate || 0);
            const total = Number(data.total || 0);

            // Calcular costo e ingresos
            let totalCost = 0;
            const items = data.items || [];
            items.forEach(item => {
                const cost = Number(item.costo || 0);
                const qty = Number(item.cantidad || 0);
                totalCost += cost * qty;
            });

            // Ganancia en dólares y bolívares específicos de la venta
            const profitUSD = total - totalCost;
            const profitBs = profitUSD * rate;

            // Inyectar el campo 'profit' si no está definido o es incorrecto
            if (data.profit === undefined || Math.abs(Number(data.profit) - profitUSD) > 0.01) {
                console.log(`🔧 Actualizando profit en venta ${data.id || doc.id}: profitUSD = $${profitUSD.toFixed(2)}`);
                await doc.ref.update({ profit: profitUSD });
            }

            // Obtener fecha en formato local sv-SE (Caracas)
            const dateObj = data.fechaVenta?.toDate ? data.fechaVenta.toDate() : new Date(data.fechaVenta);
            const dateStr = dateObj.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });

            const groupKey = `${dateStr}_${empresaId}`;

            // Inicializar grupo de métricas para el día si no existe
            if (!calculatedDailyMetrics[groupKey]) {
                calculatedDailyMetrics[groupKey] = {
                    date: dateStr,
                    empresaId: empresaId,
                    revenue: 0,
                    revenueBs: 0,
                    profit: 0,
                    profitBs: 0,
                    units: 0,
                    orders: 0,
                    paymentMethods: { cashBs: 0, cashUsd: 0, mobile: 0, puntoVenta: 0, biopago: 0, transfer: 0 },
                    paymentMethodsBs: { cashBs: 0, cashUsd: 0, mobile: 0, puntoVenta: 0, biopago: 0, transfer: 0 }
                };
            }

            const dayStats = calculatedDailyMetrics[groupKey];
            dayStats.revenue += total;
            dayStats.revenueBs += total * rate;
            dayStats.profit += profitUSD;
            dayStats.profitBs += profitBs;
            dayStats.orders += 1;
            dayStats.units += items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);

            // Métodos de pago
            const metodos = data.metodosPago;
            if (metodos && Array.isArray(metodos) && metodos.length > 0) {
                metodos.forEach(p => {
                    const amount = parseFloat(p.amount || p.monto || 0);
                    const key = paymentMethodKeyFromMetodo(p.method || p.metodo);
                    dayStats.paymentMethods[key] += amount;
                    dayStats.paymentMethodsBs[key] += amount * rate;
                });
            } else {
                dayStats.paymentMethods.cashUsd += total;
                dayStats.paymentMethodsBs.cashUsd += total * rate;
            }
        }

        // 3. Procesar las empresas activas
        for (const empId of activeEmpresaIds) {
            console.log(`\n🏢 Reconciliando empresa: "${empId}"`);

            // Obtener las métricas diarias almacenadas actualmente en Firestore para esta empresa
            const existingMetricsSnap = await db.collection(DAILY_STATS_COLLECTION)
                .where('empresaId', '==', empId)
                .get();

            const existingKeys = new Set();
            existingMetricsSnap.forEach(doc => {
                existingKeys.add(doc.id);
            });

            console.log(`📉 Métricas diarias guardadas actualmente en DB: ${existingKeys.size}`);

            // Actualizar o guardar las métricas recalculadas
            const calculatedKeysForEmp = Object.keys(calculatedDailyMetrics).filter(key => key.endsWith(`_${empId}`));
            
            for (const key of calculatedKeysForEmp) {
                const calculatedData = calculatedDailyMetrics[key];
                console.log(`💾 Guardando métricas reconciliadas para ${calculatedData.date} | Profit: $${calculatedData.profit.toFixed(2)} | ProfitBs: Bs. ${calculatedData.profitBs.toFixed(2)}`);
                
                await db.collection(DAILY_STATS_COLLECTION).doc(key).set(calculatedData);
                existingKeys.delete(key); // Ya procesado y guardado, remover de existentes
            }

            // Eliminar registros huérfanos/fantasma (que no tienen ventas activas)
            for (const ghostKey of existingKeys) {
                console.log(`🗑️ Eliminando documento métrico huérfano (fantasma) en DB: ${ghostKey}`);
                await db.collection(DAILY_STATS_COLLECTION).doc(ghostKey).delete();
            }
        }

        console.log('\n✨ ¡Proceso de reconciliación finalizado con éxito total!');

    } catch (error) {
        console.error('❌ Error crítico durante la reconciliación:', error);
    } finally {
        process.exit(0);
    }
}

reconcile();
