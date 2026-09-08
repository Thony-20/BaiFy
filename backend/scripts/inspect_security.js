import { adminDb } from '../config/firebase.js';

async function inspectCompanyProducts(empresaId) {
    console.log(`🔍 Inspeccionando productos para empresa: ${empresaId}`);
    try {
        const snap = await adminDb.collection('productos')
            .where('empresaId', '==', empresaId)
            .limit(100)
            .get();
        
        console.log(`📦 Encontrados ${snap.size} productos (muestra de 100)`);
        snap.docs.forEach(doc => {
            const data = doc.data();
            console.log(`- ID: ${doc.id} | Nombre: ${data.nombre} | SKU: ${data.sku} | Ventas: ${data.unitsSoldTotal}`);
        });
    } catch (e) {
        console.error(e);
    }
}

inspectCompanyProducts('tpGXeLloTLZuLgwpoNHR');
