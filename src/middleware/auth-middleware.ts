import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthenticatedRequest, AuthPayload } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback-secret';

/**
 * Extracts and verifies a JWT from the Authorization header.
 * Attaches `req.user` with { userId, personId, role }.
 */
export function authMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
    }

    const token = header.slice(7);

    try {
        const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
        req.user = payload;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Requires the authenticated user to have admin role.
 * Must be placed AFTER authMiddleware.
 */
export function adminOnly(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): void {
    if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}
