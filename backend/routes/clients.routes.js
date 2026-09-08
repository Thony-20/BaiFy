import express from 'express';
import {
    listClients,
    getClientByCedula,
    createClient,
    updateClient,
    assignClientCredit,
    getClientCreditProfile,
    getClientsAnalytics,
    getClientAnalytics,
} from '../controllers/client.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', listClients);
router.get('/analytics', getClientsAnalytics);
router.get('/by-cedula', getClientByCedula);
router.get('/:id/analytics', getClientAnalytics);
router.post('/', createClient);
router.patch('/:id', updateClient);
router.post('/:id/credit', assignClientCredit);
router.get('/:id/credit-profile', getClientCreditProfile);

export default router;
