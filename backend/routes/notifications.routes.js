import express from 'express';
import { listNotifications } from '../controllers/notification.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.get('/', listNotifications);

export default router;
