import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth-service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export async function login(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }

        const result = await authService.login(username, password);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function getMe(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        const user = await authService.getCurrentUser(req.user.userId);
        res.json(user);
    } catch (err) {
        next(err);
    }
}

export function logout(
    _req: Request,
    res: Response,
): void {
    // Stateless JWT — client simply discards the token.
    // This endpoint exists for API completeness.
    res.json({ message: 'Logged out successfully' });
}
