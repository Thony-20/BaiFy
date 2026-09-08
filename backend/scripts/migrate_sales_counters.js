import { adminDb } from '../config/firebase.js';

async function migrateSalesCounters() {
    console.log("🚀 Iniciando migración de contadores maestro de ventas (unitsSoldTotal)...");
    
    const PRODUCTS_COLLECTION = 'productos';
    const PRODUCT_STATS_COLLECTION = 'metricas_productos_diarias';
    
    try {
        // 1. Obtener todos los productos
        const productsSnap = await adminDb.collection(PRODUCTS_COLLECTION).get();
        console.log(`📦 Procesando ${productsSnap.size} productos...`);
        
        const productSales = {}; // Map de pid -> totalQty
        
        // 2. Obtener TODAS las métricas históricas por producto
        const statsSnap = await adminDb.collection(PRODUCT_STATS_COLLECTION).get();
        console.log(`📊 Sumando ${statsSnap.size} registros diarios de ventas...`);
        
        statsSnap.docs.forEach(doc => {
            const data = doc.data();
            const pid = data.productId;
            const qty = Number(data.unitsSold || 0);
            if (pid) {
                productSales[pid] = (productSales[pid] || 0) + qty;
            }
        });
        
        // 3. Actualizar productos en batches de 500
        let batch = adminDb.batch();
        let count = 0;
        let totalUpdated = 0;
        
        for (const doc of productsSnap.docs) {
            const pid = doc.id;
            const totalQty = productSales[pid] || 0;
            
            batch.update(doc.ref, {
                unitsSoldTotal: totalQty,
                updatedAt: new Date()
            });
            
            count++;
            totalUpdated++;
            
            if (count === 500) {
                await batch.commit();
                batch = adminDb.batch();
                count = 0;
                console.log(`... ${totalUpdated} productos actualizados`);
            }
        }
        
        if (count > 0) {
            await batch.commit();
            console.log(`... ${totalUpdated} productos actualizados`);
        }
        
        console.log("✅ Migración completada exitosamente.");
    } catch (error) {
        console.error("❌ Error en la migración:", error);
    }
}

migrateSalesCounters();
