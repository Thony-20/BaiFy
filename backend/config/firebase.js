import fs from 'fs';
import path from 'path';
import { initializeApp as adminInitializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { installFirestoreReadMeter } from '../utils/firestoreMeter.js';

dotenv.config({ quiet: true });

// Inicialización de Firebase Admin para acceso a la base de datos (Firestore)
const serviceAccountPath = path.resolve('./serviceAccountKey.json');
let adminApp;

if (getApps().length > 0) {
    adminApp = getApps()[0];
} else if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    adminApp = adminInitializeApp({
        credential: cert(serviceAccount)
    });
    console.log("✅ Firebase Admin inicializado con 'serviceAccountKey.json'");
} else {
    console.warn("\n⚠️ ADVERTENCIA: No se encontró 'serviceAccountKey.json' en la raíz del backend.");
    console.warn("Firebase Admin intentará usar Application Default Credentials.");
    console.warn("Para obtener acceso total, descarga tu clave de servicio desde Firebase Console e insértala en la carpeta backend.\n");
    adminApp = adminInitializeApp();
    console.log("ℹ️ Firebase Admin inicializado con Default Credentials");
}

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);

installFirestoreReadMeter(adminDb);

// Configuración pública para la API REST de Auth (Identity Toolkit)
const firebaseApiKey = process.env.FIREBASE_API_KEY;
if (!firebaseApiKey) {
    console.warn(
        "⚠️ Falta FIREBASE_API_KEY en backend/.env. Copia backend/.env.example y completa los valores."
    );
}

export const firebaseClientConfig = {
    apiKey: firebaseApiKey || ""
};
