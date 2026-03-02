import { Router } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth-middleware.js';
import * as personController from '../controllers/person-controller.js';

const router = Router();

// All person routes require authentication
router.use(authMiddleware);

// GET    /api/persons          — list all people
router.get('/', personController.list);

// GET    /api/persons/:id      — get single person
router.get('/:id', personController.getById);

// POST   /api/persons          — create person (admin only)
router.post('/', adminOnly, personController.create);

// PUT    /api/persons/:id      — update person (permission-checked in controller)
router.put('/:id', personController.update);

// DELETE /api/persons/:id      — soft-delete (admin only)
router.delete('/:id', adminOnly, personController.remove);

export default router;
