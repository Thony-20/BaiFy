import express from 'express';
import { createSale, getSalesHistory, getSalesStats, deleteSale, getProductRanking } from '../controllers/sale.controller.js';

const router = express.Router();

router.post('/', createSale);
router.get('/history', getSalesHistory);
router.get('/stats', getSalesStats);
router.get('/ranking', getProductRanking);
router.delete('/:id', deleteSale);

export default router;

