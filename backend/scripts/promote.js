import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error("❌ No se encontró 'serviceAccountKey.json' en la raíz del backend.");
    process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const email = process.argv[2];

if (!email) {
    console.log("Uso: node scripts/promote.js rosasanthoni13@gmail.com");
    process.exit(0);
}

async function promote() {
    try {
        console.log(`🔍 Buscando usuario con email: ${email}...`);
        
        const snapshot = await db.collection('usuarios')
            .where('email', '==', email)
            .get();

        if (snapshot.empty) {
            console.log("❌ No se encontró ningún usuario con ese correo.");
            return;
        }

        const userDoc = snapshot.docs[0];
        await userDoc.ref.update({
            rol: 'super-admin',
            status: 'active'
        });

        console.log(`✅ ¡Éxito! El usuario ${email} ahora es SUPER-ADMIN.`);
        console.log(`ID del usuario: ${userDoc.id}`);
        
    } catch (error) {
        console.error("❌ Error al promover usuario:", error);
    } finally {
        process.exit(0);
    }
}

promote();
