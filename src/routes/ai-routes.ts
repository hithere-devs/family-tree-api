import { Router } from 'express';
import { authMiddleware } from '../middleware/auth-middleware.js';
import * as aiController from '../controllers/ai-controller.js';

const router = Router();

router.use(authMiddleware);

// POST /api/ai/chat — family Q&A with optional person context
router.post('/chat', aiController.chat);

export default router;
