import { queryOne, queryAll } from '../db/connection.js';
import { AppError, type RelationshipRow } from '../types/index.js';

/**
 * Detects if adding "newParentId as PARENT of childId" would create
 * a cycle in the ancestry graph.
 *
 * A cycle exists if childId is already an ancestor of newParentId.
 */
export async function assertNoCycle(
    newParentId: string,
    childId: string,
): Promise<void> {
    // If child is an ancestor of the new parent → cycle
    const row = await queryOne<{ found: number }>(
        `WITH RECURSIVE ancestors AS (
       SELECT r.source_person_id AS ancestor_id
       FROM relationship r
       INNER JOIN person p ON p.id = r.source_person_id AND p.is_deleted = false
       WHERE r.target_person_id = :startId
         AND r.relationship_type = 'PARENT'
       UNION
       SELECT r.source_person_id
       FROM relationship r
       INNER JOIN ancestors a ON r.target_person_id = a.ancestor_id
       INNER JOIN person p ON p.id = r.source_person_id AND p.is_deleted = false
       WHERE r.relationship_type = 'PARENT'
     )
     SELECT 1 AS found FROM ancestors WHERE ancestor_id = :checkId
     LIMIT 1`,
        { startId: newParentId, checkId: childId },
    );

    if (row) {
        throw new AppError(
            'Adding this parent would create a cycle in the family tree',
            400,
            'ERR_CYCLE_DETECTED',
        );
    }
}

/**
 * Ensures a person does not exceed the maximum number of parents (2).
 */
export async function assertMaxParents(
    childId: string,
    max: number = 2,
): Promise<void> {
    const rows = await queryAll<RelationshipRow>(
        `SELECT r.id FROM relationship r
     INNER JOIN person p ON p.id = r.source_person_id AND p.is_deleted = false
     WHERE r.target_person_id = :childId
       AND r.relationship_type = 'PARENT'`,
        { childId },
    );

    if (rows.length >= max) {
        throw new AppError(
            `Person already has ${max} parent(s). Cannot add more.`,
            400,
            'ERR_MAX_PARENTS',
        );
    }
}

/**
 * Ensures this exact directed relationship does not already exist.
 */
export async function assertNoDuplicate(
    sourceId: string,
    targetId: string,
    type: string,
): Promise<void> {
    const row = await queryOne(
        `SELECT r.id FROM relationship r
     INNER JOIN person sp ON sp.id = r.source_person_id AND sp.is_deleted = false
     INNER JOIN person tp ON tp.id = r.target_person_id AND tp.is_deleted = false
     WHERE r.source_person_id = :sourceId
       AND r.target_person_id = :targetId
       AND r.relationship_type = :type`,
        { sourceId, targetId, type },
    );

    if (row) {
        throw new AppError(
            'This relationship already exists',
            409,
            'ERR_DUPLICATE_RELATIONSHIP',
        );
    }
}

/**
 * Ensures a person does not exceed the maximum number of spouses (default 2).
 */
export async function assertMaxSpouses(
    personId: string,
    max: number = 2,
): Promise<void> {
    const rows = await queryAll<RelationshipRow>(
        `SELECT r.id FROM relationship r
     INNER JOIN person p ON p.id = r.target_person_id AND p.is_deleted = false
     WHERE r.source_person_id = :personId
       AND r.relationship_type = 'SPOUSE'
       AND r.status != 'divorced'`,
        { personId },
    );

    if (rows.length >= max) {
        throw new AppError(
            `Person already has ${max} spouse(s). Cannot add more.`,
            400,
            'ERR_MAX_SPOUSES',
        );
    }
}
