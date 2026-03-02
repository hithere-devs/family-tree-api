import { Router } from 'express';
import authRoutes from './auth-routes.js';
import personRoutes from './person-routes.js';
import relationshipRoutes from './relationship-routes.js';
import treeRoutes from './tree-routes.js';
import adminRoutes from './admin-routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/persons', personRoutes);
router.use('/relationships', relationshipRoutes);
router.use('/tree', treeRoutes);
router.use('/admin', adminRoutes);

export default router;
