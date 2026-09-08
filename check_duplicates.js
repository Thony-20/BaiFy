const admin = require('./backend/node_modules/firebase-admin');
const serviceAccount = require('./backend/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkDuplicates() {
    try {
        const querySnapshot = await db.collection('productos')
            .where('nombre', '==', 'Crema Dental Blanqueadora 75ml')
            .get();

        console.log(`Se encontraron ${querySnapshot.size} productos con el nombre 'Crema Dental Blanqueadora 75ml'`);

        querySnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`\nID: ${doc.id}`);
            console.log(`SKU: ${data.sku}`);
            console.log(`Fecha Vencimiento: ${data.fechaVencimiento ? (data.fechaVencimiento.toDate ? data.fechaVencimiento.toDate().toISOString() : data.fechaVencimiento) : 'null'}`);
            console.log(`Stock: ${data.stock}`);
            console.log(`CreatedAt: ${data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : 'null'}`);
        });

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        process.exit(0);
    }
}

checkDuplicates();
