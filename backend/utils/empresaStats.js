import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../config/firebase.js';

const NUMERIC_FIELDS = [
    'totalInventoryValue',
    'totalCostValue',
    'totalStock',
    'productCount',
    'totalSalesCount',
    'totalSalesAmount'
];

/**
 * Aplica deltas incrementales a empresa_stats (transacción o batch).
 * No lee el catálogo: solo escribe incrementos.
 * @param {FirebaseFirestore.Transaction | FirebaseFirestore.WriteBatch} writer
 * @param {string} empresaId
 * @param {Record<string, number | Date>} delta
 */
export function applyEmpresaStatsDelta(writer, empresaId, delta) {
    const statsUpdate = { updatedAt: new Date() };

    NUMERIC_FIELDS.forEach((field) => {
        const value = Number(delta[field] || 0);
        if (value !== 0) {
            statsUpdate[field] = FieldValue.increment(value);
        }
    });

    if (delta.lastSaleDate) {
        statsUpdate.lastSaleDate = delta.lastSaleDate;
    }

    const hasIncrements = NUMERIC_FIELDS.some((field) => statsUpdate[field] !== undefined);
    if (!hasIncrements && !delta.lastSaleDate) return;

    writer.set(adminDb.collection('empresa_stats').doc(empresaId), statsUpdate, { merge: true });
}
