import { adminDb } from '../config/firebase.js';

async function deleteCorruptedMonthlyStats() {
    console.log("🧹 Iniciando limpieza de datos corruptos (metricas_productos_mensuales)...");
    
    const collectionRef = adminDb.collection('metricas_productos_mensuales');
    
    try {
        const snapshot = await collectionRef.get();
        console.log(`🗑️ Borrando ${snapshot.size} documentos...`);
        
        let batch = adminDb.batch();
        let count = 0;
        
        for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
            count++;
            
            if (count === 500) {
                await batch.commit();
                batch = adminDb.batch();
                count = 0;
            }
        }
        
        if (count > 0) {
            await batch.commit();
        }
        
        console.log("✅ Limpieza completada.");
    } catch (error) {
        console.error("❌ Error en la limpieza:", error);
    }
}

deleteCorruptedMonthlyStats();
