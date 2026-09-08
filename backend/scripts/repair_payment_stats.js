import { adminDb } from '../config/firebase.js';

async function repairPaymentStats() {
    console.log("🚀 Iniciando reparación de estadísticas de métodos de pago...");
    
    const empresaId = 'tpGXeLloTLZuLgwpoNHR'; // Empresa actual
    const daysToRepair = 31;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToRepair);
    
    try {
        // 1. Obtener todas las ventas del periodo
        const salesSnap = await adminDb.collection('ventas')
            .where('empresaId', '==', empresaId)
            .where('fechaVenta', '>=', startDate)
            .get();
        
        console.log(`📊 Procesando ${salesSnap.size} ventas para reconstruir desgloses...`);
        
        const aggregation = {}; // Key: dateStr
        
        salesSnap.docs.forEach(doc => {
            const data = doc.data();
            const dateObj = data.fechaVenta.toDate ? data.fechaVenta.toDate() : new Date(data.fechaVenta);
            const dateStr = dateObj.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
            
            if (!aggregation[dateStr]) {
                aggregation[dateStr] = {
                    cashBs: 0, cashUsd: 0, mobile: 0, puntoVenta: 0, biopago: 0, transfer: 0
                };
            }
            
            const metodos = data.metodosPago || [];
            if (Array.isArray(metodos)) {
                metodos.forEach(p => {
                    const amount = parseFloat(p.amount || p.monto || 0);
                    const method = (p.method || p.metodo || 'cash-bs').toLowerCase();
                    let key = 'cashBs';
                    if (method.includes('cash-usd')) key = 'cashUsd';
                    else if (method.includes('mobile') || method.includes('movil') || method.includes('móvil')) key = 'mobile';
                    else if (method.includes('card') || method.includes('tarjeta') || method.includes('punto')) key = 'puntoVenta';
                    else if (method.includes('biopago')) key = 'biopago';
                    else if (method.includes('transfer')) key = 'transfer';
                    aggregation[dateStr][key] += amount;
                });
            } else {
                // Fallback a cashUsd si no hay desglose
                aggregation[dateStr].cashUsd += (data.total || 0);
            }
        });
        
        // 2. Actualizar metricas_diarias
        const batch = adminDb.batch();
        const dates = Object.keys(aggregation);
        
        for (const dStr of dates) {
            const docId = `${dStr}_${empresaId}`;
            const docRef = adminDb.collection('metricas_diarias').doc(docId);
            batch.set(docRef, {
                paymentMethods: aggregation[dStr]
            }, { merge: true });
        }
        
        await batch.commit();
        console.log(`✅ Reparación completada para ${dates.length} días.`);
        
    } catch (error) {
        console.error("❌ Error en la reparación:", error);
    }
}

repairPaymentStats();
