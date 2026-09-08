import { adminAuth, adminDb } from '../config/firebase.js';

export const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token de acceso no proporcionado o formato inválido' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        
        // Verifica el token con Firebase Admin
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        
        // Guardamos la información del token en req.user
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error("Error validando el token:", error);
        return res.status(401).json({ error: 'Token expirado o inválido', details: error.message });
    }
};

export const verifyAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            console.log('⚠️ verifyAdmin: No user object in request');
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        console.log(`🔍 verifyAdmin: Verificando permisos de SUPER-ADMIN para UID: ${req.user.uid}`);
        const userDoc = await adminDb.collection('usuarios').doc(req.user.uid).get();
        
        if (!userDoc.exists) {
            console.log(`❌ verifyAdmin: Documento no encontrado para UID: ${req.user.uid}`);
            return res.status(403).json({ error: 'Perfil de usuario no encontrado' });
        }

        const userData = userDoc.data();
        console.log(`👤 verifyAdmin: Rol actual: ${userData.rol}`);
        
        if (userData.rol !== 'super-admin') {
            console.log('🚫 verifyAdmin: Acceso denegado. Se requiere rol super-admin.');
            return res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de Súper Administrador' });
        }

        next();
    } catch (error) {
        console.error("Error verificando rol de administrador:", error);
        return res.status(500).json({ error: 'Error interno del servidor al verificar permisos' });
    }
};
