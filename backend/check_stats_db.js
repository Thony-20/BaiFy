import { adminDb } from './config/firebase.js';

async function check() {
    const snapshot = await adminDb.collection('metricas_productos_diarias').get();
    console.log(`Total docs in metricas_productos_diarias: ${snapshot.size}`);
    snapshot.docs.forEach(doc => {
        console.log(`Doc ID: ${doc.id} ->`, doc.data());
    });
    process.exit(0);
}

check();
