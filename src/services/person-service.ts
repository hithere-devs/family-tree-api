import { queryOne, queryAll, execute } from '../db/connection.js';
import {
    AppError,
    type PersonRow,
    type PersonResponse,
} from '../types/index.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toResponse(row: PersonRow): PersonResponse {
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        gender: row.gender,
        isDeceased: row.is_deceased,
        birthDate: row.birth_date,
        bio: row.bio,
        location: row.location,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

export async function createPerson(data: {
    firstName: string;
    lastName?: string;
    gender?: string;
    isDeceased?: boolean;
    birthDate?: string;
    bio?: string;
    location?: string;
    createdBy: string;
}): Promise<PersonResponse> {
    const row = await queryOne<PersonRow>(
        `INSERT INTO person (first_name, last_name, gender, is_deceased, birth_date, bio, location, created_by, updated_by)
     VALUES (:firstName, :lastName, :gender, :isDeceased, :birthDate, :bio, :location, :createdBy, :createdBy)
     RETURNING *`,
        {
            firstName: data.firstName,
            lastName: data.lastName ?? '',
            gender: data.gender ?? 'other',
            isDeceased: data.isDeceased ?? false,
            birthDate: data.birthDate ?? null,
            bio: data.bio ?? null,
            location: data.location ?? null,
            createdBy: data.createdBy,
        },
    );

    if (!row) throw new AppError('Failed to create person', 500);
    return toResponse(row);
}

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

export async function getPersonById(id: string): Promise<PersonResponse> {
    const row = await queryOne<PersonRow>(
        `SELECT * FROM person WHERE id = :id AND is_deleted = false`,
        { id },
    );

    if (!row) throw new AppError('Person not found', 404, 'ERR_NOT_FOUND');
    return toResponse(row);
}

export async function listPeople(): Promise<PersonResponse[]> {
    const rows = await queryAll<PersonRow>(
        `SELECT * FROM person WHERE is_deleted = false ORDER BY created_at`,
    );
    return rows.map(toResponse);
}

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

export async function updatePerson(
    id: string,
    data: {
        firstName?: string;
        lastName?: string;
        gender?: string;
        isDeceased?: boolean;
        birthDate?: string;
        bio?: string;
        location?: string;
        updatedBy: string;
    },
): Promise<PersonResponse> {
    // Ensure person exists
    const existing = await queryOne<PersonRow>(
        `SELECT * FROM person WHERE id = :id AND is_deleted = false`,
        { id },
    );

    if (!existing) throw new AppError('Person not found', 404, 'ERR_NOT_FOUND');

    const row = await queryOne<PersonRow>(
        `UPDATE person SET
       first_name  = :firstName,
       last_name   = :lastName,
       gender      = :gender,
       is_deceased = :isDeceased,
       birth_date  = :birthDate,
       bio         = :bio,
       location    = :location,
       updated_by  = :updatedBy,
       updated_at  = NOW()
     WHERE id = :id AND is_deleted = false
     RETURNING *`,
        {
            id,
            firstName: data.firstName ?? existing.first_name,
            lastName: data.lastName ?? existing.last_name,
            gender: data.gender ?? existing.gender,
            isDeceased: data.isDeceased ?? existing.is_deceased,
            birthDate: data.birthDate !== undefined ? data.birthDate : existing.birth_date,
            bio: data.bio !== undefined ? data.bio : existing.bio,
            location: data.location !== undefined ? data.location : existing.location,
            updatedBy: data.updatedBy,
        },
    );

    if (!row) throw new AppError('Failed to update person', 500);
    return toResponse(row);
}

/* ------------------------------------------------------------------ */
/*  Soft delete                                                        */
/* ------------------------------------------------------------------ */

export async function softDeletePerson(id: string): Promise<void> {
    await execute(
        `UPDATE person SET is_deleted = true, updated_at = NOW()
     WHERE id = :id`,
        { id },
    );
}
