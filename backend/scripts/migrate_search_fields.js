import { adminDb } from '../config/firebase.js';

async function migrate() {
    console.log('--- Iniciando migración de campos de búsqueda ---');
    
    const collectionRef = adminDb.collection('productos');
    
    // 1. Verificar cantidad total para seguridad de costos
    const countSnapshot = await collectionRef.count().get();
    const total = countSnapshot.data().count;
    
    console.log(`Total de productos a procesar: ${total}`);
    
    // El usuario confirmó que tiene 36k lecturas y dio permiso para proceder
    if (total > 50000) {
        console.warn('⚠️ ADVERTENCIA: Hay más de 50,000 productos. Se requiere permiso explícito para continuar.');
        return;
    }

    const snapshot = await collectionRef.get();
    let updatedCount = 0;
    
    const batchSize = 500;
    let batch = adminDb.batch();
    let currentBatchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const updateData = {};
        
        // Siempre actualizamos para asegurar que tengan los campos nuevos
        updateData.nombre_search = (data.nombre || "").toLowerCase();
        updateData.sku_search = (data.sku || "").toLowerCase();

        batch.update(doc.ref, updateData);
        updatedCount++;
        currentBatchCount++;

        if (currentBatchCount >= batchSize) {
            await batch.commit();
            batch = adminDb.batch();
            currentBatchCount = 0;
            console.log(`Lote de ${batchSize} procesado...`);
        }
    }

    if (currentBatchCount > 0) {
        await batch.commit();
    }

    console.log(`✅ Migración completada. Productos actualizados: ${updatedCount}`);
}

migrate().catch(err => {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
});
