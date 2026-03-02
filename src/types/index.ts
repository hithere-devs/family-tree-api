import type { Request } from 'express';

/* ------------------------------------------------------------------ */
/*  DB row types (snake_case, matching PostgreSQL columns)              */
/* ------------------------------------------------------------------ */

export interface PersonRow {
    id: string;
    first_name: string;
    last_name: string;
    gender: 'male' | 'female' | 'other';
    is_deceased: boolean;
    birth_date: string | null;
    bio: string | null;
    location: string | null;
    is_deleted: boolean;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

export type RelationshipType = 'PARENT' | 'CHILD' | 'SPOUSE';

export interface RelationshipRow {
    id: string;
    source_person_id: string;
    target_person_id: string;
    relationship_type: RelationshipType;
    status: 'confirmed' | 'pending';
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export type UserRole = 'admin' | 'member';

export interface UserRow {
    id: string;
    username: string;
    password_hash: string;
    role: UserRole;
    person_id: string;
    created_at: string;
    updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  API response types (camelCase for JSON responses)                   */
/* ------------------------------------------------------------------ */

export interface PersonResponse {
    id: string;
    firstName: string;
    lastName: string;
    gender: string;
    isDeceased: boolean;
    birthDate?: string | null;
    bio?: string | null;
    location?: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface TreePerson extends PersonResponse {
    parentIds: string[];
    spouseId: string | null;
    childrenIds: string[];
}

export interface UserResponse {
    id: string;
    username: string;
    role: UserRole;
    personId: string;
}

/* ------------------------------------------------------------------ */
/*  Auth types                                                         */
/* ------------------------------------------------------------------ */

export interface AuthPayload {
    userId: string;
    personId: string;
    role: UserRole;
}

export interface AuthenticatedRequest extends Request {
    user?: AuthPayload;
}

/* ------------------------------------------------------------------ */
/*  Error                                                              */
/* ------------------------------------------------------------------ */

export class AppError extends Error {
    public statusCode: number;
    public code: string;

    constructor(message: string, statusCode: number, code?: string) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code ?? 'ERR_UNKNOWN';
    }
}
