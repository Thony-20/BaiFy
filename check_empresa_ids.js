const admin = require('./backend/node_modules/firebase-admin');
const serviceAccount = require('./backend/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkIds() {
    try {
        const querySnapshot = await db.collection('productos')
            .where('nombre', '==', 'Crema Dental Blanqueadora 75ml')
            .get();

        querySnapshot.forEach(doc => {
            console.log(`ID: ${doc.id}, EmpresaId: ${doc.data().empresaId}`);
        });

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        process.exit(0);
    }
}

checkIds();
