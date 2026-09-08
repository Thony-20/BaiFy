import { adminDb } from '../config/firebase.js';

async function initAllStats() {
    console.log('--- Iniciando Sincronización Global de Estadísticas ---');
    
    try {
        const empresasSnap = await adminDb.collection('empresas').get();
        console.log(`Encontradas ${empresasSnap.size} empresas.`);

        for (const empDoc of empresasSnap.docs) {
            const empresaId = empDoc.id;
            const empresaNombre = empDoc.data().nombre || empresaId;
            console.log(`\nProcesando: ${empresaNombre} (${empresaId})...`);

            // 1. Calcular Inventario (Valor y Costo)
            const productsSnap = await adminDb.collection('productos')
                .where('empresaId', '==', empresaId)
                .get();
            
            let totalInventoryValue = 0;
            let totalCostValue = 0;
            let totalStock = 0;

            productsSnap.forEach(pDoc => {
                const p = pDoc.data();
                const s = parseFloat(p.stock) || 0;
                totalInventoryValue += (s * (parseFloat(p.valor) || 0));
                totalCostValue += (s * (parseFloat(p.costo) || 0));
                totalStock += s;
            });

            // 2. Calcular Ventas (Cantidad y Monto Total)
            const salesSnap = await adminDb.collection('ventas')
                .where('empresaId', '==', empresaId)
                .get();
            
            let totalSalesCount = salesSnap.size;
            let totalSalesAmount = 0;
            let lastSaleDate = null;

            salesSnap.forEach(sDoc => {
                const s = sDoc.data();
                totalSalesAmount += (parseFloat(s.total) || 0);
                
                const fecha = s.fechaVenta?.toDate ? s.fechaVenta.toDate() : (s.fechaVenta ? new Date(s.fechaVenta) : null);
                if (fecha && (!lastSaleDate || fecha > lastSaleDate)) {
                    lastSaleDate = fecha;
                }
            });

            // 3. Guardar en empresa_stats
            const statsData = {
                totalInventoryValue,
                totalCostValue,
                totalStock,
                totalSalesCount,
                totalSalesAmount,
                updatedAt: new Date()
            };
            if (lastSaleDate) statsData.lastSaleDate = lastSaleDate;

            await adminDb.collection('empresa_stats').doc(empresaId).set(statsData, { merge: true });
            console.log(`✅ Completado: ${productsSnap.size} productos, ${totalSalesCount} ventas.`);
        }

        console.log('\n--- Sincronización Global Finalizada Exitosamente ---');
    } catch (error) {
        console.error('❌ Error durante la sincronización:', error);
    }
}

initAllStats();
