import { adminDb } from '../config/firebase.js';

async function inicializarStats() {
    console.log("Iniciando escaneo total de la base de datos...");
    console.log("NOTA: Si tu cuota gratuita de hoy está excedida, este script fallará.");
    console.log("Ejecútalo mañana cuando tu límite diario de 50.000 lecturas se haya reiniciado.\n");

    try {
        const empresasSnapshot = await adminDb.collection('empresas').get();
        for (const empresaDoc of empresasSnapshot.docs) {
            const empresaId = empresaDoc.id;
            console.log(`Procesando empresa: ${empresaId}...`);
            
            const productosSnapshot = await adminDb.collection('productos')
                .where('empresaId', '==', empresaId)
                .get();
            
            let totalValue = 0;
            productosSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const stock = parseInt(data.stock) || 0;
                const valor = parseFloat(data.valor) || 0;
                totalValue += (stock * valor);
            });

            console.log(`- Empresa ${empresaId} tiene ${productosSnapshot.docs.length} productos.`);
            console.log(`- Valor total del inventario: $${totalValue.toFixed(2)}`);

            await adminDb.collection('empresa_stats').doc(empresaId).set({
                totalInventoryValue: totalValue,
                updatedAt: new Date()
            }, { merge: true });

            console.log(`✅ Stats guardados exitosamente para ${empresaId}.\n`);
        }
        console.log("Proceso completado para todas las empresas.");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error durante el escaneo:", error);
        process.exit(1);
    }
}

inicializarStats();
