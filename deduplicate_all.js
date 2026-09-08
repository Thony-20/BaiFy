const admin = require('./backend/node_modules/firebase-admin');
const serviceAccount = require('./backend/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function deduplicateAll() {
    console.log("Iniciando proceso de deduplicación GLOBAL...");
    
    try {
        const snapshot = await db.collection('productos').get();
        console.log(`Total de productos en toda la DB: ${snapshot.size}`);

        const groups = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            const empresaId = data.empresaId || 'no_empresa';
            const nombre = (data.nombre || '').trim().toLowerCase();
            const sku = (data.sku || '').trim().toLowerCase();
            const key = `${empresaId}:::${nombre}:::${sku}`;
            
            if (!groups[key]) groups[key] = [];
            groups[key].push({ id: doc.id, data });
        });

        let totalUpdated = 0;
        let totalDeleted = 0;

        for (const key in groups) {
            const docs = groups[key];
            if (docs.length > 1) {
                const parts = key.split(':::');
                console.log(`\nFusionando duplicados para Empresa ${parts[0]}: "${parts[1]}" (${docs.length} registros)`);
                
                const master = docs[0]; // Tomamos el primero como master
                
                let mergedStock = 0;
                let bestDate = null;
                let otherData = { ...master.data };

                docs.forEach(doc => {
                    mergedStock += (parseInt(doc.data.stock) || 0);
                    if (doc.data.fechaVencimiento && (!bestDate || (doc.data.fechaVencimiento.seconds > bestDate.seconds))) {
                        bestDate = doc.data.fechaVencimiento;
                    }
                    if (!otherData.descripcion && doc.data.descripcion) otherData.descripcion = doc.data.descripcion;
                    if (!otherData.ubicacion && doc.data.ubicacion) otherData.ubicacion = doc.data.ubicacion;
                });

                const masterRef = db.collection('productos').doc(master.id);
                await masterRef.update({
                    stock: mergedStock,
                    fechaVencimiento: bestDate,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                totalUpdated++;

                for (let i = 1; i < docs.length; i++) {
                    await db.collection('productos').doc(docs[i].id).delete();
                    totalDeleted++;
                    console.log(`  - Eliminado duplicado: ${docs[i].id}`);
                }
            }
        }

        console.log(`\nPROCESO COMPLETADO EXITOAMENTE`);
        console.log(`Grupos unificados: ${totalUpdated}`);
        console.log(`Registros eliminados: ${totalDeleted}`);

    } catch (error) {
        console.error("Error durante la deduplicación:", error);
    } finally {
        process.exit(0);
    }
}

deduplicateAll();
