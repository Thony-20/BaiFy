import { adminDb } from '../config/firebase.js';

async function migrateProducts() {
    console.log('🚀 Iniciando migración de campos calculados...');
    const snapshot = await adminDb.collection('productos').get();
    console.log(`Encontrados ${snapshot.size} productos.`);

    let batch = adminDb.batch();
    let count = 0;
    let totalBatches = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const stock = parseFloat(data.stock) || 0;
        const valor = parseFloat(data.valor) || 0;
        const costo = parseFloat(data.costo) || 0;

        batch.update(doc.ref, {
            totalValue: stock * valor,
            totalCostValue: stock * costo
        });

        count++;
        if (count === 500) {
            await batch.commit();
            console.log(`✅ Lote ${++totalBatches} completado (500 productos).`);
            batch = adminDb.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
        console.log(`✅ Lote final completado (${count} productos).`);
    }

    console.log('🎉 Migración finalizada con éxito.');
}

migrateProducts();
