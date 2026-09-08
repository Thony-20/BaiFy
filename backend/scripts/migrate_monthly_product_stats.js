import { adminDb } from '../config/firebase.js';

async function migrateMonthlyProductStats() {
    console.log("🚀 Iniciando migración de estadísticas mensuales de productos...");
    
    const DAILY_STATS_COLLECTION = 'metricas_productos_diarias';
    const MONTHLY_STATS_COLLECTION = 'metricas_productos_mensuales';
    
    try {
        // 1. Obtener todas las métricas diarias
        const dailySnap = await adminDb.collection(DAILY_STATS_COLLECTION).get();
        console.log(`📊 Procesando ${dailySnap.size} registros diarios...`);
        
        const monthlyAggregation = {}; // Key: YYYY-MM_productId
        
        dailySnap.docs.forEach(doc => {
            const data = doc.data();
            const date = data.date;
            if (!date) return;
            
            const monthStr = date.substring(0, 7);
            const productId = data.productId;
            const empresaId = data.empresaId;
            const key = `${monthStr}_${empresaId}_${productId}`;
            
            if (!monthlyAggregation[key]) {
                monthlyAggregation[key] = {
                    month: monthStr,
                    empresaId: data.empresaId,
                    productId: productId,
                    productName: data.productName || 'Producto sin nombre',
                    sku: data.sku || '',
                    unitsSold: 0,
                    revenueBs: 0
                };
            }
            
            monthlyAggregation[key].unitsSold += Number(data.unitsSold || 0);
            monthlyAggregation[key].revenueBs += Number(data.revenueBs || 0);
        });
        
        const keys = Object.keys(monthlyAggregation);
        console.log(`📂 Generando ${keys.length} resúmenes mensuales...`);
        
        // 2. Guardar en batches de 500
        let batch = adminDb.batch();
        let count = 0;
        let totalUpdated = 0;
        
        for (const key of keys) {
            const docRef = adminDb.collection(MONTHLY_STATS_COLLECTION).doc(key);
            batch.set(docRef, monthlyAggregation[key], { merge: true });
            
            count++;
            totalUpdated++;
            
            if (count === 500) {
                await batch.commit();
                batch = adminDb.batch();
                count = 0;
                console.log(`... ${totalUpdated} resúmenes guardados`);
            }
        }
        
        if (count > 0) {
            await batch.commit();
            console.log(`... ${totalUpdated} resúmenes guardados`);
        }
        
        console.log("✅ Migración mensual completada exitosamente.");
    } catch (error) {
        console.error("❌ Error en la migración mensual:", error);
    }
}

migrateMonthlyProductStats();
