import { adminDb } from './backend/config/firebase.js';

async function checkSales() {
    const snapshot = await adminDb.collection('ventas').orderBy('createdAt', 'desc').limit(10).get();
    if (snapshot.empty) {
        console.log('No sales found.');
        return;
    }
    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`ID: ${data.id}, Total: ${data.total}, Impuestos: ${data.impuestos}, Tasa: ${data.exchangeRate}, Fecha: ${data.createdAt?.toDate().toISOString()}`);
    });
}

checkSales().catch(console.error);
