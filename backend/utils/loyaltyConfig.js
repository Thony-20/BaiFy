import { adminDb } from '../config/firebase.js';
import {
    DEFAULT_LOYALTY_CONFIG,
    normalizeLoyaltyConfig,
} from './loyaltyPoints.js';

const EMPRESAS_COLLECTION = 'empresas';

export const getEmpresaLoyaltyConfig = async (empresaId) => {
    if (!empresaId) return normalizeLoyaltyConfig(DEFAULT_LOYALTY_CONFIG);
    const snap = await adminDb.collection(EMPRESAS_COLLECTION).doc(empresaId).get();
    if (!snap.exists) return normalizeLoyaltyConfig(DEFAULT_LOYALTY_CONFIG);
    return normalizeLoyaltyConfig(snap.data()?.fidelizacion || DEFAULT_LOYALTY_CONFIG);
};
