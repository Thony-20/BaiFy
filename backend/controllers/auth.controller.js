import { adminDb, adminAuth } from '../config/firebase.js';
import { firebaseClientConfig } from '../config/firebase.js';
import { statsCache } from '../utils/cache.js';

const FIREBASE_API_KEY = firebaseClientConfig.apiKey;
const IDENTITY_TOOLKIT_URL = `https://identitytoolkit.googleapis.com/v1/accounts`;

export const checkEmail = async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: "Falta el email" });

        try {
            await adminAuth.getUserByEmail(email);
            return res.status(200).json({ exists: true });
        } catch (err) {
            if (err.code === 'auth/user-not-found') {
                return res.status(200).json({ exists: false });
            }
            throw err;
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const registerUser = async (req, res) => {
    try {
        const { email, password, empresaNombre, plan, paymentReference } = req.body;

        if (!email || !password || !empresaNombre) {
            return res.status(400).json({ error: "Faltan datos requeridos: email, password o empresaNombre" });
        }

        // 1. Crear usuario en Firebase Auth (REST API para ser stateless)
        const signUpRes = await fetch(`${IDENTITY_TOOLKIT_URL}:signUp?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        const signUpData = await signUpRes.json();

        if (!signUpRes.ok) throw new Error(signUpData.error.message);

        const uid = signUpData.localId;
        const token = signUpData.idToken;

        // 2. Crear documento de empresa en Firestore
        const empresaRef = adminDb.collection('empresas').doc();
        await empresaRef.set({
            nombre: empresaNombre,
            planId: plan || 'free',
            createdAt: new Date()
        });

        // 3. Crear documento de usuario
        const userProfile = {
            email,
            empresaId: empresaRef.id,
            rol: 'admin',
            planId: plan || 'free',
            paymentReference: paymentReference || null,
            status: (plan === 'free' || !plan) ? 'active' : 'pending',
            createdAt: new Date()
        };
        await adminDb.collection('usuarios').doc(uid).set(userProfile);

        res.status(201).json({
            token,
            refreshToken: signUpData.refreshToken,
            profile: { ...userProfile, uid, empresaNombre, paymentReference: undefined }
        });

    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Faltan email o contraseña" });
        }

        // Login con Firebase Auth REST API
        const signInRes = await fetch(`${IDENTITY_TOOLKIT_URL}:signInWithPassword?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });
        const signInData = await signInRes.json();

        if (!signInRes.ok) throw new Error(signInData.error.message);

        const uid = signInData.localId;
        const token = signInData.idToken;

        // Obtener perfil desde Firestore
        const docSnap = await adminDb.collection('usuarios').doc(uid).get();
        let profile = null;
        if (docSnap.exists) {
            profile = { uid, ...docSnap.data() };
            // Convertir Timestamps a ISO strings si es necesario
            if (profile.createdAt && profile.createdAt.toDate) {
                profile.createdAt = profile.createdAt.toDate().toISOString();
            }
            // Obtener nombre de la empresa
            if (profile.empresaId) {
                const empresaSnap = await adminDb.collection('empresas').doc(profile.empresaId).get();
                if (empresaSnap.exists) {
                    const empresaData = empresaSnap.data();
                    profile.empresaNombre = empresaData.nombre || '';
                    profile.expirationAlertThreshold = empresaData.expirationAlertThreshold || 2;
                    profile.lowStockThreshold = empresaData.lowStockThreshold ?? 5;
                    profile.rif = empresaData.rif || '';
                    profile.direccion = empresaData.direccion || '';
                    profile.telefono = empresaData.telefono || '';
                    profile.biopagoCommission = empresaData.biopagoCommission || 0;
                    profile.puntoVentaCommission = empresaData.puntoVentaCommission || 0;
                    profile.fotoEmpresa = empresaData.fotoEmpresa || '';
                }
            }
        }

        res.status(200).json({
            token,
            refreshToken: signInData.refreshToken,
            profile
        });

    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Falta el email" });

        const resetRes = await fetch(`${IDENTITY_TOOLKIT_URL}:sendOobCode?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestType: "PASSWORD_RESET", email })
        });
        const resetData = await resetRes.json();

        if (!resetRes.ok) throw new Error(resetData.error.message);

        res.status(200).json({ message: "Correo de recuperación enviado" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const refreshAuthToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ error: "Falta el refreshToken" });
        }

        const refreshRes = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });
        const refreshData = await refreshRes.json();

        if (!refreshRes.ok) {
            throw new Error(refreshData.error?.message || 'Error al refrescar token');
        }

        // verifyIdToken exige el ID token de Firebase (no el access_token genérico).
        const token = refreshData.id_token || refreshData.access_token;
        if (!token) {
            throw new Error('Respuesta de refresh sin id_token');
        }

        res.status(200).json({
            token,
            refreshToken: refreshData.refresh_token || refreshToken,
        });
    } catch (error) {
        res.status(401).json({ error: error.message });
    }
};

export const requestUpgrade = async (req, res) => {
    try {
        const { planId, paymentReference } = req.body;
        const uid = req.user.uid; // viene del verifyToken

        if (!planId || !paymentReference) {
            return res.status(400).json({ error: "Falta planId o paymentReference" });
        }

        const userDocRef = adminDb.collection('usuarios').doc(uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        await userDocRef.update({
            pendingPlanId: planId,
            paymentReference: paymentReference,
            status: 'upgrade_pending',
            updatedAt: new Date()
        });

        res.status(200).json({
            message: "Solicitud de upgrade enviada correctamente",
            status: 'upgrade_pending'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const requestRenewal = async (req, res) => {
    try {
        const { paymentReference } = req.body;
        const uid = req.user.uid;

        if (!paymentReference) {
            return res.status(400).json({ error: "Falta la referencia de pago" });
        }

        const userDocRef = adminDb.collection('usuarios').doc(uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        await userDocRef.update({
            paymentReference: paymentReference,
            status: 'renewal_pending',
            updatedAt: new Date()
        });

        res.status(200).json({
            message: "Solicitud de renovación enviada correctamente",
            status: 'renewal_pending'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const updateCompanySettings = async (req, res) => {
    try {
        const { empresaId, settings } = req.body;
        if (!empresaId || !settings) {
            return res.status(400).json({ error: "Faltan parámetros empresaId o settings" });
        }

        // Configuraciones permitidas para la empresa
        const allowedSettings = ['expirationAlertThreshold', 'lowStockThreshold', 'rif', 'direccion', 'telefono', 'biopagoCommission', 'puntoVentaCommission', 'fotoEmpresa'];
        const updateData = {};

        allowedSettings.forEach(key => {
            if (settings[key] !== undefined) {
                updateData[key] = settings[key];
            }
        });

        if (settings.fotoEmpresa !== undefined) {
            const fotoEmpresa = settings.fotoEmpresa;
            const maxFotoLength = 500000;
            const isValidDataUrl = typeof fotoEmpresa === 'string'
                && /^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(fotoEmpresa)
                && fotoEmpresa.length <= maxFotoLength;

            if (fotoEmpresa === '' || fotoEmpresa === null) {
                updateData.fotoEmpresa = '';
            } else if (isValidDataUrl) {
                updateData.fotoEmpresa = fotoEmpresa;
            } else {
                return res.status(400).json({ error: 'Foto de empresa inválida o demasiado grande' });
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "No se proporcionaron configuraciones válidas" });
        }

        await adminDb.collection('empresas').doc(empresaId).update(updateData);

        const updatedKeys = Object.keys(updateData);
        const onlyExpirationThreshold =
            updatedKeys.length === 1 && updatedKeys[0] === 'expirationAlertThreshold';
        const onlyLowStockThreshold =
            updatedKeys.length === 1 && updatedKeys[0] === 'lowStockThreshold';

        // Invalidar solo lo necesario para no forzar lecturas caras del dashboard completo
        if (onlyExpirationThreshold) {
            // La caché de expiring ya está keyed por months; no hace falta borrar dashboard
            await statsCache.clearByPrefix(`products-expiring-${empresaId}`);
        } else if (onlyLowStockThreshold) {
            await Promise.all([
                statsCache.clearByPrefix(`dashboard-${empresaId}`),
                statsCache.clearByPrefix(`products-lowstock-${empresaId}`)
            ]);
        } else {
            await Promise.all([
                statsCache.clearByPrefix(`dashboard-${empresaId}`),
                statsCache.clearByPrefix(`products-lowstock-${empresaId}`),
                statsCache.clearByPrefix(`products-expiring-${empresaId}`)
            ]);
        }

        res.status(200).json({ message: "Configuraciones actualizadas correctamente", settings: updateData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
