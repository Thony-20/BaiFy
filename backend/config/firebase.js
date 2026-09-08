import fs from 'fs';
import path from 'path';
import { initializeApp as adminInitializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { installFirestoreReadMeter } from '../utils/firestoreMeter.js';

dotenv.config({ quiet: true });

function parseServiceAccountFromEnv() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        try {
            const decoded = Buffer.from(raw, 'base64').toString('utf8');
            return JSON.parse(decoded);
        } catch {
            console.error(
                '❌ FIREBASE_SERVICE_ACCOUNT no es JSON válido ni Base64 de JSON.'
            );
            return null;
        }
    }
}

function initializeAdminApp() {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    const fromEnv = parseServiceAccountFromEnv();
    if (fromEnv) {
        console.log('✅ Firebase Admin inicializado con FIREBASE_SERVICE_ACCOUNT');
        return adminInitializeApp({
            credential: cert(fromEnv)
        });
    }

    const serviceAccountPath = path.resolve('./serviceAccountKey.json');
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        console.log("✅ Firebase Admin inicializado con 'serviceAccountKey.json'");
        return adminInitializeApp({
            credential: cert(serviceAccount)
        });
    }

    console.warn("\n⚠️ ADVERTENCIA: No hay credenciales de Firebase Admin.");
    console.warn('En Vercel define FIREBASE_SERVICE_ACCOUNT (JSON o Base64).');
    console.warn('En local usa backend/serviceAccountKey.json.\n');
    console.log('ℹ️ Firebase Admin intentará Application Default Credentials');
    return adminInitializeApp();
}

const adminApp = initializeAdminApp();

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);

installFirestoreReadMeter(adminDb);

const firebaseApiKey = process.env.FIREBASE_API_KEY;
if (!firebaseApiKey) {
    console.warn(
        '⚠️ Falta FIREBASE_API_KEY en el entorno. Copia backend/.env.example y completa los valores.'
    );
}

export const firebaseClientConfig = {
    apiKey: firebaseApiKey || ''
};
