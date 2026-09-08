import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../config/firebase.js';
import {
    getSaleCedula,
    getSaleDate,
} from '../utils/clientAnalytics.js';

const CLIENTS_COLLECTION = 'clientes';
const SALES_COLLECTION = 'ventas';
const MAX_BATCH_WRITES = 450;

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');
const normalizeName = (value) => String(value || '').trim();
const normalizeCedula = (value) => String(value || '').replace(/\D/g, '');
const keyFor = (empresaId, cedula) => `${empresaId}::${cedula}`;

async function backfillClientsFromSales() {
    console.log('Iniciando backfill de clientes desde ventas...');
    const [salesSnapshot, clientsSnapshot] = await Promise.all([
        adminDb.collection(SALES_COLLECTION).get(),
        adminDb.collection(CLIENTS_COLLECTION).get(),
    ]);
    const clientsByKey = new Map();
    clientsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const cedula = normalizeCedula(data.clienteId);
        if (!data.empresaId || !cedula) return;
        clientsByKey.set(keyFor(data.empresaId, cedula), {
            ref: doc.ref,
            data,
        });
    });

    const grouped = new Map();
    const saleCedulaUpdates = [];
    salesSnapshot.docs.forEach((doc) => {
        const sale = doc.data();
        const empresaId = String(sale.empresaId || '').trim();
        const cedula = getSaleCedula(sale);
        if (!empresaId || !cedula) return;
        const key = keyFor(empresaId, cedula);
        const current = grouped.get(key) || {
            empresaId,
            cedula,
            dates: [],
            nombres: [],
            telefonos: [],
        };
        const date = getSaleDate(sale);
        if (date) current.dates.push(date);
        const nombre = normalizeName(sale.cliente?.nombre);
        const telefono = normalizePhone(sale.cliente?.telefono);
        if (nombre && nombre.toLowerCase() !== 'cliente') current.nombres.push(nombre);
        if (telefono) current.telefonos.push(telefono);
        grouped.set(key, current);
        if (sale.clienteCedula !== cedula) {
            saleCedulaUpdates.push({ ref: doc.ref, cedula });
        }
    });

    let batch = adminDb.batch();
    let pendingWrites = 0;
    let created = 0;
    let updated = 0;
    let salesUpdated = 0;

    const commitIfFull = async () => {
        if (pendingWrites < MAX_BATCH_WRITES) return;
        await batch.commit();
        batch = adminDb.batch();
        pendingWrites = 0;
    };

    for (const group of grouped.values()) {
        group.dates.sort((a, b) => a - b);
        const firstPurchase = group.dates[0] || null;
        const lastPurchase = group.dates[group.dates.length - 1] || null;
        const existing = clientsByKey.get(keyFor(group.empresaId, group.cedula));

        if (!existing) {
            const ref = adminDb.collection(CLIENTS_COLLECTION).doc();
            batch.set(ref, {
                empresaId: group.empresaId,
                clienteId: group.cedula,
                nombre: group.nombres[0] || 'Cliente',
                telefono: group.telefonos[0] || '',
                limiteCredito: 0,
                creditoHabilitado: false,
                creditoEstado: 'sin_asignar',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                primeraCompraAt: firstPurchase,
                ultimaCompraAt: lastPurchase,
                creditoAsignadoAt: null,
            });
            created += 1;
        } else {
            const changes = {
                primeraCompraAt: firstPurchase,
                ultimaCompraAt: lastPurchase,
                updatedAt: FieldValue.serverTimestamp(),
            };
            if (!normalizeName(existing.data.nombre) && group.nombres[0]) {
                changes.nombre = group.nombres[0];
            }
            if (!normalizePhone(existing.data.telefono) && group.telefonos[0]) {
                changes.telefono = group.telefonos[0];
            }
            batch.update(existing.ref, changes);
            updated += 1;
        }
        pendingWrites += 1;
        await commitIfFull();
    }

    for (const update of saleCedulaUpdates) {
        batch.update(update.ref, { clienteCedula: update.cedula });
        pendingWrites += 1;
        salesUpdated += 1;
        await commitIfFull();
    }

    if (pendingWrites > 0) await batch.commit();
    console.log(
        `Backfill completado: ${created} clientes creados, ${updated} actualizados, `
        + `${salesUpdated} ventas normalizadas.`
    );
}

backfillClientsFromSales().catch((error) => {
    console.error('Error en backfill_clients_from_sales:', error);
    process.exitCode = 1;
});
