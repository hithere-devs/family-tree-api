import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne, execute } from '../db/connection.js';
import { AppError, type UserRow, type AuthPayload, type UserResponse } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback-secret';
const TOKEN_EXPIRY = '7d';

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/* ------------------------------------------------------------------ */

export async function login(
    username: string,
    password: string,
): Promise<{ token: string; user: UserResponse }> {
    const row = await queryOne<UserRow>(
        `SELECT * FROM app_user WHERE username = :username`,
        { username },
    );

    if (!row) {
        throw new AppError('Invalid username or password', 401, 'ERR_AUTH');
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
        throw new AppError('Invalid username or password', 401, 'ERR_AUTH');
    }

    const payload: AuthPayload = {
        userId: row.id,
        personId: row.person_id,
        role: row.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    return {
        token,
        user: {
            id: row.id,
            username: row.username,
            role: row.role,
            mustChangePassword: row.must_change_password,
            personId: row.person_id,
        },
    };
}

/* ------------------------------------------------------------------ */
/*  Get current authenticated user                                     */
/* ------------------------------------------------------------------ */

export async function getCurrentUser(
    userId: string,
): Promise<UserResponse> {
    const row = await queryOne<UserRow>(
        `SELECT * FROM app_user WHERE id = :userId`,
        { userId },
    );

    if (!row) {
        throw new AppError('User not found', 404, 'ERR_NOT_FOUND');
    }

    return {
        id: row.id,
        username: row.username,
        role: row.role,
        mustChangePassword: row.must_change_password,
        personId: row.person_id,
    };
}

/* ------------------------------------------------------------------ */
/*  Change password                                                    */
/* ------------------------------------------------------------------ */

export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
): Promise<void> {
    const row = await queryOne<UserRow>(
        `SELECT * FROM app_user WHERE id = :userId`,
        { userId },
    );

    if (!row) {
        throw new AppError('User not found', 404, 'ERR_NOT_FOUND');
    }

    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) {
        throw new AppError('Current password is incorrect', 400, 'ERR_BAD_PASSWORD');
    }

    if (newPassword.length < 6) {
        throw new AppError('New password must be at least 6 characters', 400, 'ERR_VALIDATION');
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await execute(
        `UPDATE app_user
         SET password_hash = :newHash,
             must_change_password = false,
             updated_at = NOW()
         WHERE id = :userId`,
        { newHash, userId },
    );
}
