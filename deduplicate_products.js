const admin = require('./backend/node_modules/firebase-admin');
const serviceAccount = require('./backend/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const empresaId = 'gikleWcAMFab0IKm4QZN'; // ID de la empresa del usuario

async function deduplicate() {
    console.log("Iniciando proceso de deduplicación para empresa:", empresaId);
    
    try {
        const snapshot = await db.collection('productos')
            .where('empresaId', '==', empresaId)
            .get();

        console.log(`Total de productos encontrados: ${snapshot.size}`);

        const groups = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            const nombre = (data.nombre || '').trim().toLowerCase();
            const sku = (data.sku || '').trim().toLowerCase();
            const key = `${nombre}_${sku}`;
            
            if (!groups[key]) groups[key] = [];
            groups[key].push({ id: doc.id, data });
        });

        const batch = db.batch();
        let totalUpdated = 0;
        let totalDeleted = 0;
        let batchesSent = 0;

        for (const key in groups) {
            const docs = groups[key];
            if (docs.length > 1) {
                console.log(`\nFusionando grupo: "${key}" (${docs.length} duplicados)`);
                
                // El "master" será el que tenga el ID determinista si existe, o el primero
                // ID determinista esperado: "nombre_sku"
                const masterIdx = docs.findIndex(d => d.id === key);
                const master = masterIdx !== -1 ? docs[masterIdx] : docs[0];
                
                let mergedStock = 0;
                let bestDate = null;
                let otherData = { ...master.data };

                docs.forEach(doc => {
                    mergedStock += (parseInt(doc.data.stock) || 0);
                    
                    // Priorizar una fecha que no sea null
                    if (doc.data.fechaVencimiento) {
                        if (!bestDate || (doc.data.fechaVencimiento.seconds > bestDate.seconds)) {
                            bestDate = doc.data.fechaVencimiento;
                        }
                    }
                    
                    // Asegurar que no perdemos descripción o ubicación
                    if (!otherData.descripcion && doc.data.descripcion) otherData.descripcion = doc.data.descripcion;
                    if (!otherData.ubicacion && doc.data.ubicacion) otherData.ubicacion = doc.data.ubicacion;
                });

                // Actualizar el master
                const masterRef = db.collection('productos').doc(master.id);
                const updateObj = {
                    ...otherData,
                    stock: mergedStock,
                    fechaVencimiento: bestDate,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                
                batch.set(masterRef, updateObj);
                totalUpdated++;

                // Eliminar los otros
                docs.forEach(doc => {
                    if (doc.id !== master.id) {
                        const delRef = db.collection('productos').doc(doc.id);
                        batch.delete(delRef);
                        totalDeleted++;
                        console.log(`  - Marcado para eliminar: ${doc.id} (Stock era ${doc.data.stock})`);
                    }
                });
            }
        }

        if (totalUpdated > 0 || totalDeleted > 0) {
            await batch.commit();
            console.log(`\nPROCESO COMPLETADO EXITOSAMENTE`);
            console.log(`Productos actualizados/unificados: ${totalUpdated}`);
            console.log(`Registros duplicados eliminados: ${totalDeleted}`);
        } else {
            console.log("\nNo se encontraron duplicados para procesar.");
        }

    } catch (error) {
        console.error("Error durante la deduplicación:", error);
    } finally {
        process.exit(0);
    }
}

deduplicate();
