import { adminDb } from '../config/firebase.js';

async function migrateStockStats() {
    console.log("🚀 Iniciando migración de estadísticas de stock...");
    
    const MOVIMIENTOS_COLLECTION = 'movimientos_stock';
    const STOCK_STATS_COLLECTION = 'metricas_stock_diarias';
    const PRODUCT_STATS_COLLECTION = 'metricas_productos_diarias';
    
    try {
        const snapshot = await adminDb.collection(MOVIMIENTOS_COLLECTION).get();
        console.log(`📦 Procesando ${snapshot.size} movimientos...`);
        
        const globalMetrics = {}; // key: `${dateStr}_${empresaId}`
        const productMetrics = {}; // key: `${dateStr}_${productId}`
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!data.fecha || !data.empresaId) return;
            
            const date = data.fecha.toDate ? data.fecha.toDate() : new Date(data.fecha);
            const dateStr = date.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
            
            const gKey = `${dateStr}_${data.empresaId}`;
            if (!globalMetrics[gKey]) {
                globalMetrics[gKey] = {
                    date: dateStr,
                    empresaId: data.empresaId,
                    entradas: 0,
                    salidas: 0
                };
            }
            
            if (data.tipo === 'incremento' || data.tipo === 'entrada') {
                globalMetrics[gKey].entradas += Number(data.cantidad || 0);
            } else {
                globalMetrics[gKey].salidas += Number(data.cantidad || 0);
            }
            
            const pKey = `${dateStr}_${data.productoId}`;
            if (data.productoId) {
                if (!productMetrics[pKey]) {
                    productMetrics[pKey] = {
                        date: dateStr,
                        empresaId: data.empresaId,
                        productId: data.productoId,
                        productName: data.productoNombre || 'Producto',
                        sku: data.productoSku || '',
                        stockMoved: 0
                    };
                }
                productMetrics[pKey].stockMoved += Number(data.cantidad || 0);
            }
        });
        
        console.log(`📊 Generando ${Object.keys(globalMetrics).length} registros globales y ${Object.keys(productMetrics).length} registros por producto...`);
        
        // Guardar en batches de 500
        let batch = adminDb.batch();
        let count = 0;
        
        const allGlobal = Object.entries(globalMetrics);
        for (const [id, data] of allGlobal) {
            const ref = adminDb.collection(STOCK_STATS_COLLECTION).doc(id);
            batch.set(ref, data, { merge: true });
            count++;
            if (count === 500) {
                await batch.commit();
                batch = adminDb.batch();
                count = 0;
                console.log("... lote global enviado");
            }
        }
        if (count > 0) await batch.commit();
        
        batch = adminDb.batch();
        count = 0;
        const allProduct = Object.entries(productMetrics);
        for (const [id, data] of allProduct) {
            const ref = adminDb.collection(PRODUCT_STATS_COLLECTION).doc(id);
            batch.set(ref, data, { merge: true });
            count++;
            if (count === 500) {
                await batch.commit();
                batch = adminDb.batch();
                count = 0;
                console.log("... lote producto enviado");
            }
        }
        if (count > 0) await batch.commit();
        
        console.log("✅ Migración completada exitosamente.");
    } catch (error) {
        console.error("❌ Error en la migración:", error);
    }
}

migrateStockStats();
