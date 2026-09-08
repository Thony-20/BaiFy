import { adminDb } from './backend/config/firebase.js';

async function analyzeSales() {
    console.log('--- Analizando últimas 20 ventas ---');
    const snapshot = await adminDb.collection('ventas').orderBy('createdAt', 'desc').limit(20).get();
    
    if (snapshot.empty) {
        console.log('No se encontraron ventas.');
        return;
    }

    let countWithTax = 0;
    let totalTaxUSD = 0;
    let totalTaxBs = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        const tax = Number(data.impuestos || 0);
        const rate = Number(data.exchangeRate || 0);
        const taxBs = tax * rate;

        if (tax > 0) countWithTax++;
        totalTaxUSD += tax;
        totalTaxBs += taxBs;

        console.log(`ID: ${data.id} | Fecha: ${data.fechaVenta?.toDate().toISOString().split('T')[0]} | Tax($): ${tax} | Rate: ${rate} | Tax(Bs): ${taxBs.toFixed(2)}`);
    });

    console.log('\n--- Resumen de Muestra ---');
    console.log(`Ventas analizadas: ${snapshot.size}`);
    console.log(`Ventas con IVA > 0: ${countWithTax}`);
    console.log(`Suma IVA ($): ${totalTaxUSD.toFixed(2)}`);
    console.log(`Suma IVA (Bs): ${totalTaxBs.toFixed(2)}`);
}

analyzeSales().catch(err => {
    console.error('ERROR:', err);
});
