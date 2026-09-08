import { adminDb } from '../config/firebase.js';

async function findCatalogOwner() {
    console.log(`🔍 Buscando al dueño de los 9,000 productos...`);
    try {
        const snap = await adminDb.collection('productos').limit(1).get();
        if (!snap.empty) {
            const data = snap.docs[0].data();
            const ownerId = data.empresaId;
            const countSnap = await adminDb.collection('productos')
                .where('empresaId', '==', ownerId)
                .count()
                .get();
            
            console.log(`🏢 La empresa '${ownerId}' es la dueña de ${countSnap.data().count} productos.`);
            console.log(`👤 Ejemplo de producto de esa empresa: ${data.nombre}`);
        }
    } catch (e) {
        console.error(e);
    }
}

findCatalogOwner();
