import express from 'express';
import {
    getAccounts,
    getAccountStats,
    getAccountById,
    getClientCreditHistory,
    createAccount,
    updateAccount,
    deleteAccount,
    registerPayment,
    backfillAccountRates,
    backfillCxCPaymentMetrics,
} from '../controllers/account.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getAccounts);
router.get('/stats', getAccountStats);
router.get('/credit-history', getClientCreditHistory);
router.post('/backfill-rates', backfillAccountRates);
router.post('/backfill-cxc-metrics', backfillCxCPaymentMetrics);
router.get('/:id', getAccountById);
router.post('/', createAccount);
router.put('/:id', updateAccount);
router.delete('/:id', deleteAccount);
router.post('/:id/payments', registerPayment);

export default router;
