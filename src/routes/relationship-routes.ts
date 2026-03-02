import { Router } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth-middleware.js';
import * as relationshipController from '../controllers/relationship-controller.js';

const router = Router();

// All relationship routes require authentication
router.use(authMiddleware);

// POST   /api/relationships              — add a relationship
router.post('/', relationshipController.add);

// GET    /api/relationships/person/:personId  — get all relationships for a person
router.get('/person/:personId', relationshipController.getForPerson);

// DELETE /api/relationships/:id          — remove a relationship (admin only)
router.delete('/:id', adminOnly, relationshipController.remove);

export default router;
