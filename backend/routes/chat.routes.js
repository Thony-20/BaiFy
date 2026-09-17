import express from 'express';
import { chatWithBaifyAi } from '../controllers/chat.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);
router.post('/', chatWithBaifyAi);

export default router;
