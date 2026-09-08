import { addReads, isMeterEnabled } from './readMeter.js';

/**
 * Instala wrappers en DocumentReference / Query / AggregateQuery
 * para sumar document reads al meter activo.
 *
 * @param {FirebaseFirestore.Firestore} db
 */
export function installFirestoreReadMeter(db) {
    if (!db || db.__baifyReadMeterInstalled) return;
    db.__baifyReadMeterInstalled = true;

    const probeCol = db.collection('__baify_meter_probe__');
    const docProto = Object.getPrototypeOf(probeCol.doc('_'));
    const queryProto = Object.getPrototypeOf(probeCol.where('__probe__', '==', true));
    const aggProto = Object.getPrototypeOf(probeCol.count());

    if (typeof docProto.get === 'function' && !docProto.__baifyGetWrapped) {
        const originalGet = docProto.get;
        docProto.get = async function patchedDocGet(...args) {
            const snap = await originalGet.apply(this, args);
            if (isMeterEnabled()) {
                // Doc inexistente también cuenta como 1 lectura en Firestore
                addReads(1);
            }
            return snap;
        };
        docProto.__baifyGetWrapped = true;
    }

    if (typeof queryProto.get === 'function' && !queryProto.__baifyGetWrapped) {
        const originalGet = queryProto.get;
        queryProto.get = async function patchedQueryGet(...args) {
            const snap = await originalGet.apply(this, args);
            if (isMeterEnabled()) {
                addReads(snap.size);
            }
            return snap;
        };
        queryProto.__baifyGetWrapped = true;
    }

    if (typeof aggProto.get === 'function' && !aggProto.__baifyGetWrapped) {
        const originalGet = aggProto.get;
        aggProto.get = async function patchedAggGet(...args) {
            const snap = await originalGet.apply(this, args);
            if (isMeterEnabled()) {
                const data = typeof snap.data === 'function' ? snap.data() : null;
                const count = data && typeof data.count === 'number' ? data.count : 0;
                // Aggregations: 1 read por cada 1000 index entries matched
                addReads(Math.max(1, Math.ceil(count / 1000)));
            }
            return snap;
        };
        aggProto.__baifyGetWrapped = true;
    }

    if (typeof db.getAll === 'function' && !db.__baifyGetAllWrapped) {
        const originalGetAll = db.getAll.bind(db);
        db.getAll = async function patchedGetAll(...refs) {
            const snaps = await originalGetAll(...refs);
            if (isMeterEnabled()) {
                addReads(Array.isArray(snaps) ? snaps.length : 0);
            }
            return snaps;
        };
        db.__baifyGetAllWrapped = true;
    }
}
