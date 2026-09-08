import express from 'express';
import { registerUser, loginUser, resetPassword, refreshAuthToken, requestUpgrade, requestRenewal, checkEmail, updateCompanySettings } from '../controllers/auth.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/reset-password', resetPassword);
router.post('/refresh', refreshAuthToken);
router.get('/check-email', checkEmail);

// Solicitar upgrade de plan
router.post('/upgrade-plan', verifyToken, requestUpgrade);

// Solicitar renovación mensual
router.post('/renew-plan', verifyToken, requestRenewal);

// Actualizar configuraciones de la empresa
router.post('/company-settings', verifyToken, updateCompanySettings);

// Opcional: El logout puede ser un endpoint que simplemente retorna 200,
// ya que con esta arquitectura sin estado, el cliente borra el token localmente.
router.post('/logout', (req, res) => {
    res.status(200).json({ message: 'Sesión cerrada exitosamente' });
});

export default router;

