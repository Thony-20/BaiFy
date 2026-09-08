/**
 * Script de migración: Asigna subscriptionEndsAt = ahora + 30 días
 * a todos los usuarios activos que aún no lo tengan.
 * 
 * Uso: node scripts/migrate-subscriptions.js
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar credenciales
const serviceAccountPath = resolve(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function migrate() {
    console.log('🔄 Iniciando migración de suscripciones...\n');

    const snapshot = await db.collection('usuarios')
        .where('status', '==', 'active')
        .get();

    let updated = 0;
    let skipped = 0;

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    for (const doc of snapshot.docs) {
        const data = doc.data();

        // Solo migrar usuarios que NO tengan subscriptionEndsAt
        if (data.subscriptionEndsAt) {
            console.log(`⏭️  ${data.email} — ya tiene fecha de suscripción, omitido.`);
            skipped++;
            continue;
        }

        await doc.ref.update({
            subscriptionEndsAt: thirtyDaysFromNow
        });

        console.log(`✅ ${data.email} — asignado subscriptionEndsAt = ${thirtyDaysFromNow.toISOString()}`);
        updated++;
    }

    console.log(`\n🏁 Migración completada: ${updated} actualizados, ${skipped} omitidos.`);
    process.exit(0);
}

migrate().catch((err) => {
    console.error('❌ Error en la migración:', err);
    process.exit(1);
});
