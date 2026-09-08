import express from 'express';
import { getPendingUsers, updateUserStatus, getAllUsers } from '../controllers/admin.controller.js';
import { verifyToken, verifyAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Todas las rutas de administración requieren autenticación y rol de admin
router.use(verifyToken);
router.use(verifyAdmin);

router.get('/users/pending', getPendingUsers);
router.get('/users', getAllUsers);
router.put('/users/:uid/status', updateUserStatus);

export default router;
