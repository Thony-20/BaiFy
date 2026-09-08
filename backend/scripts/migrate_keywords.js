import { adminDb } from '../config/firebase.js';

const generateSearchKeywords = (nombre, sku = '') => {
    const text = `${nombre} ${sku}`;
    if (!text.trim()) return [];
    const normalized = text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    
    const words = normalized.split(/[^a-z0-9]+/).filter(w => w.length >= 2);
    return Array.from(new Set(words));
};

async function migrateKeywords() {
    console.log("🚀 Iniciando migración de palabras clave (Nombre + SKU)...");
    
    try {
        const snapshot = await adminDb.collection('productos').get();
        console.log(`📊 Procesando ${snapshot.size} productos...`);
        
        let batch = adminDb.batch();
        let count = 0;
        let total = 0;
        
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const keywords = generateSearchKeywords(data.nombre || '', data.sku || '');
            
            batch.update(doc.ref, { keywords });
            count++;
            total++;
            
            if (count === 500) {
                await batch.commit();
                batch = adminDb.batch();
                count = 0;
                console.log(`... ${total} actualizados`);
            }
        }
        
        if (count > 0) {
            await batch.commit();
        }
        
        console.log(`✅ Migración completada. ${total} productos actualizados.`);
    } catch (error) {
        console.error("❌ Error en migración:", error);
    }
}

migrateKeywords();
