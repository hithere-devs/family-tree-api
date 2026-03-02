import { Router } from 'express';
import * as authController from '../controllers/auth-controller.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

const router = Router();

// POST /api/auth/login
router.post('/login', authController.login);

// POST /api/auth/logout
router.post('/logout', authController.logout);

// GET /api/auth/me  (requires token)
router.get('/me', authMiddleware, authController.getMe);

export default router;
