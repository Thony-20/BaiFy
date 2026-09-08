import { adminDb } from '../config/firebase.js';

async function migrate() {
    console.log('--- Iniciando migración de nombres en movimientos ---');
    
    const movsCollection = adminDb.collection('movimientos_stock');
    const prodsCollection = adminDb.collection('productos');
    
    const snapshot = await movsCollection.get();
    console.log(`Procesando ${snapshot.docs.length} movimientos...`);
    
    let updatedCount = 0;
    const cache = {}; // Cache de nombres de productos para evitar lecturas repetidas

    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.productoNombre && data.productoNombre !== 'Producto') continue;

        const productoId = data.productoId;
        if (!productoId) continue;

        let nombre = 'Producto';
        if (cache[productoId]) {
            nombre = cache[productoId];
        } else {
            try {
                const prodDoc = await prodsCollection.doc(productoId).get();
                if (prodDoc.exists) {
                    nombre = prodDoc.data().nombre || 'Producto';
                    cache[productoId] = nombre;
                }
            } catch (err) {
                console.error(`Error al obtener producto ${productoId}:`, err.message);
            }
        }

        await movsCollection.doc(doc.id).update({ productoNombre: nombre });
        updatedCount++;
    }

    console.log(`✅ Migración completada. Movimientos actualizados: ${updatedCount}`);
}

migrate().catch(err => {
    console.error('❌ Error durante la migración:', err);
    process.exit(1);
});
