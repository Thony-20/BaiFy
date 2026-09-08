const admin = require('./backend/node_modules/firebase-admin');
const serviceAccount = require('./backend/serviceAccountKey.json');
const XLSX = require('./frontend/node_modules/xlsx');
const { normalizeToCaracasMidnight } = require('./backend/utils/dateUtils');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const empresaId = 'bURAVHzwZ5rhRKtgeh0X'; // ID detectado para el usuario actual
const filePath = 'c:\\Users\\rosas\\OneDrive\\Desktop\\Gestión de Stocks\\frontend\\inventario_301_unicos.xlsx';

async function forceSync() {
    console.log("Iniciando Sincronización Forzada...");
    
    try {
        // 1. Leer Excel
        const workbook = XLSX.readFile(filePath, { cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        console.log(`Excel leído: ${excelData.length} filas.`);

        // 2. Obtener productos actuales de la DB
        const snapshot = await db.collection('productos')
            .where('empresaId', '==', empresaId)
            .get();
        
        console.log(`Productos en DB para empresa ${empresaId}: ${snapshot.size}`);

        const dbProductsMap = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            const key = `${data.nombre.toLowerCase().trim()}_${(data.sku || '').toLowerCase().trim()}`;
            if (!dbProductsMap[key]) dbProductsMap[key] = [];
            dbProductsMap[key].push({ id: doc.id, data });
        });

        // 3. Cruzar datos e Inyectar
        let updatedCount = 0;
        let batch = db.batch();
        let ops = 0;

        for (const row of excelData) {
            const nombre = (row.nombre || '').toLowerCase().trim();
            const sku = (row.sku || '').toLowerCase().trim();
            const key = `${nombre}_${sku}`;
            
            // Buscar la columna de fecha de forma manual y robusta
            let rawFecha = '';
            Object.keys(row).forEach(k => {
                const ck = k.toLowerCase().replace(/[^a-z]/g, '');
                if (ck.includes('venc') || ck.includes('exp') || ck.includes('caduc') || ck.includes('vto')) {
                    rawFecha = row[k];
                }
            });

            const parsedDate = normalizeToCaracasMidnight(rawFecha);

            if (parsedDate && dbProductsMap[key]) {
                // Actualizar TODOS los duplicados que puedan haber quedado con esta fecha
                for (const dbProd of dbProductsMap[key]) {
                    const ref = db.collection('productos').doc(dbProd.id);
                    batch.update(ref, { 
                        fechaVencimiento: parsedDate,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    updatedCount++;
                    ops++;

                    if (ops >= 400) {
                        await batch.commit();
                        batch = db.batch();
                        ops = 0;
                    }
                }
            }
        }

        if (ops > 0) await batch.commit();
        
        console.log(`\nSINCRONIZACIÓN FINALIZADA`);
        console.log(`Total de actualizaciones de fecha realizadas: ${updatedCount}`);

    } catch (error) {
        console.error("Error crtico:", error);
    } finally {
        process.exit(0);
    }
}

forceSync();
