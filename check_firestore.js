const admin = require('./backend/node_modules/firebase-admin');
const serviceAccount = require('./backend/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkProduct() {
    try {
        const querySnapshot = await db.collection('productos')
            .where('nombre', '==', 'Harina Pan Amarilla 1kg')
            .limit(1)
            .get();

        if (querySnapshot.empty) {
            console.log("No se encontró el producto 'Harina Pan Amarilla 1kg'");
            return;
        }

        const doc = querySnapshot.docs[0];
        console.log("ID:", doc.id);
        console.log("Datos del producto:");
        console.log(JSON.stringify(doc.data(), null, 2));

        const data = doc.data();
        console.log("\nInspección de fechaVencimiento:");
        console.log("Valor:", data.fechaVencimiento);
        console.log("Tipo:", typeof data.fechaVencimiento);
        if (data.fechaVencimiento && data.fechaVencimiento.toDate) {
            console.log("Es un Timestamp. Fecha:", data.fechaVencimiento.toDate().toISOString());
        }

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        process.exit(0);
    }
}

checkProduct();
