import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/connection.js';
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
        personId: row.person_id,
    };
}
