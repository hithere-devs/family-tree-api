import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/index.js';

/**
 * Global Express error handler.
 * Catches AppError instances and unknown errors.
 */
export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
): void {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
        });
        return;
    }

    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        code: 'ERR_INTERNAL',
    });
}
