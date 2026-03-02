import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import * as adminService from '../services/admin-service.js';

/* ------------------------------------------------------------------ */
/*  Create user for a person                                           */
/* ------------------------------------------------------------------ */

export async function createUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { username, password, role, personId } = req.body;

        if (!username || !password || !personId) {
            res.status(400).json({
                error: 'username, password, and personId are required',
            });
            return;
        }

        const user = await adminService.createUser({
            username,
            password,
            role: role ?? 'member',
            personId,
        });

        res.status(201).json(user);
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  List all users                                                     */
/* ------------------------------------------------------------------ */

export async function listUsers(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const users = await adminService.listUsers();
        res.json(users);
    } catch (err) {
        next(err);
    }
}
