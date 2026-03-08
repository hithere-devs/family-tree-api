import type { NextFunction, Request, Response } from 'express';
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

export async function changePassword(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            res.status(400).json({ error: 'Current password and new password are required' });
            return;
        }

        await authService.changePassword(req.user.userId, currentPassword, newPassword);
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        next(err);
    }
}

export async function requestPhoneOtp(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        const { phoneNumber } = req.body;
        const result = await authService.requestPhoneVerificationOtp(
            req.user.userId,
            phoneNumber,
        );
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function verifyPhoneOtp(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }

        const { otp } = req.body;
        const user = await authService.verifyPhoneOtp(req.user.userId, otp);
        res.json({ message: 'Phone verified successfully', user });
    } catch (err) {
        next(err);
    }
}

export async function requestForgotPasswordOtp(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { username, phoneNumber } = req.body;
        const result = await authService.requestPasswordResetOtp(username, phoneNumber);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

export async function resetPasswordWithOtp(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { username, phoneNumber, otp, newPassword } = req.body;
        await authService.resetPasswordWithOtp(
            username,
            phoneNumber,
            otp,
            newPassword,
        );
        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        next(err);
    }
}
