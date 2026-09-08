import express from 'express';
import { adjustStock, getMovimientos, getRecentMovimientos, getDashboardStats, recalculateStats } from '../controllers/stock.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken); // Rutas protegidas

router.post('/adjust', adjustStock);
router.get('/history', getMovimientos);
router.get('/recent', getRecentMovimientos);
router.get('/stats', getDashboardStats);
router.get('/recalculate', recalculateStats);
router.post('/recalculate', recalculateStats);

export default router;
