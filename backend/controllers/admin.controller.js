import { adminDb } from '../config/firebase.js';

/**
 * Calcula la fecha de fin de suscripción (30 días desde ahora)
 */
function getNewSubscriptionEnd() {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    return end;
}

/**
 * Extiende la suscripción 30 días más.
 * Si ya venció, toma como base la fecha actual.
 */
function extendSubscription(currentEnd) {
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();

    let endMs = nowMs; // Por defecto: desde ahora

    if (currentEnd) {
        let parsed;
        if (currentEnd.toDate && typeof currentEnd.toDate === 'function') {
            parsed = currentEnd.toDate().getTime();
        } else if (currentEnd._seconds) {
            parsed = currentEnd._seconds * 1000;
        } else {
            parsed = new Date(currentEnd).getTime();
        }

        // Si aún está vigente, sumar desde la fecha de fin actual
        if (parsed > nowMs) {
            endMs = parsed;
        }
    }

    return new Date(endMs + THIRTY_DAYS_MS);
}

/**
 * Obtener todos los usuarios con estado 'pending', 'upgrade_pending' o 'renewal_pending'
 */
export const getPendingUsers = async (req, res) => {
    try {
        console.log('🔍 getPendingUsers: Iniciando consulta a Firestore');
        const snapshot = await adminDb.collection('usuarios')
            .where('status', 'in', ['pending', 'upgrade_pending', 'renewal_pending'])
            .get();

        // Optimización N+1: Cargar todas las empresas en una sola consulta masiva
        const empresaIds = [...new Set(snapshot.docs.map(doc => doc.data().empresaId).filter(id => id))];
        const empresaMap = new Map();
        
        if (empresaIds.length > 0) {
            const refs = empresaIds.map(id => adminDb.collection('empresas').doc(id));
            const snaps = await adminDb.getAll(...refs);
            snaps.forEach(s => {
                if (s.exists) empresaMap.set(s.id, s.data().nombre || 'N/A');
            });
        }

        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                uid: doc.id, 
                ...data, 
                empresaNombre: data.empresaId ? (empresaMap.get(data.empresaId) || 'N/A') : 'N/A' 
            };
        });

        // Ordenar en memoria por fecha de creación (descendente)
        users.sort((a, b) => {
            const timeA = a.createdAt?._seconds || 0;
            const timeB = b.createdAt?._seconds || 0;
            return timeB - timeA;
        });

        console.log(`✅ getPendingUsers: ${users.length} usuarios encontrados`);
        res.status(200).json(users);
    } catch (error) {
        console.error("❌ Error al obtener usuarios pendientes:", error);
        res.status(500).json({ 
            error: 'Error al obtener la lista de usuarios pendientes',
            details: error.message,
            code: error.code
        });
    }
};

/**
 * Actualizar el estado de un usuario (aprobar o rechazar)
 */
export const updateUserStatus = async (req, res) => {
    const { uid } = req.params;
    const { status } = req.body;

    if (!['active', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }

    try {
        const userRef = adminDb.collection('usuarios').doc(uid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const userData = userDoc.data();
        let updateData = {
            status,
            updatedAt: new Date()
        };

        // ── APROBAR NUEVO USUARIO (pending -> active) ──
        if (status === 'active' && userData.status === 'pending') {
            updateData.subscriptionEndsAt = getNewSubscriptionEnd();
        }

        // ── APROBAR UPGRADE (upgrade_pending -> active) ──
        if (status === 'active' && userData.status === 'upgrade_pending') {
            if (userData.pendingPlanId) {
                updateData.planId = userData.pendingPlanId;
                updateData.pendingPlanId = null;

                // Actualizar también la empresa
                if (userData.empresaId) {
                    await adminDb.collection('empresas').doc(userData.empresaId).update({
                        planId: updateData.planId
                    });
                }
            }
            // Nuevo ciclo de 30 días con el plan nuevo
            updateData.subscriptionEndsAt = getNewSubscriptionEnd();
        }

        // ── APROBAR RENOVACIÓN (renewal_pending -> active) ──
        if (status === 'active' && userData.status === 'renewal_pending') {
            updateData.subscriptionEndsAt = extendSubscription(userData.subscriptionEndsAt);
        }

        // ── RECHAZAR UPGRADE: volver a active sin bloquear ──
        if (status === 'rejected' && userData.status === 'upgrade_pending') {
            updateData.status = 'active'; 
            updateData.pendingPlanId = null;
        }

        // ── RECHAZAR RENOVACIÓN: volver a active sin bloquear ──
        if (status === 'rejected' && userData.status === 'renewal_pending') {
            updateData.status = 'active';
        }

        await userRef.update(updateData);

        res.status(200).json({ message: `Estado del usuario actualizado a ${updateData.status}` });
    } catch (error) {
        console.error("Error al actualizar estado del usuario:", error);
        res.status(500).json({ error: 'Error al actualizar el estado del usuario' });
    }
};

/**
 * Obtener todos los usuarios (para gestión general)
 */
export const getAllUsers = async (req, res) => {
    console.time('getAllUsers');
    try {
        const snapshot = await adminDb.collection('usuarios')
            .orderBy('createdAt', 'desc')
            .get();

        // Optimización N+1: Cargar todas las empresas en una sola consulta masiva
        const empresaIds = [...new Set(snapshot.docs.map(doc => doc.data().empresaId).filter(id => id))];
        const empresaMap = new Map();
        
        if (empresaIds.length > 0) {
            const refs = empresaIds.map(id => adminDb.collection('empresas').doc(id));
            const snaps = await adminDb.getAll(...refs);
            snaps.forEach(s => {
                if (s.exists) empresaMap.set(s.id, s.data().nombre || 'N/A');
            });
        }

        const users = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                uid: doc.id, 
                ...data, 
                empresaNombre: data.empresaId ? (empresaMap.get(data.empresaId) || 'N/A') : 'N/A' 
            };
        });

        res.status(200).json(users);
        console.timeEnd('getAllUsers');
    } catch (error) {
        console.error("Error al obtener todos los usuarios:", error);
        try { console.timeEnd('getAllUsers'); } catch (e) {}
        res.status(500).json({ error: 'Error al obtener la lista de usuarios' });
    }
};
