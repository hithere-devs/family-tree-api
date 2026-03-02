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
       SELECT source_person_id AS ancestor_id
       FROM relationship
       WHERE target_person_id = :startId
         AND relationship_type = 'PARENT'
       UNION
       SELECT r.source_person_id
       FROM relationship r
       INNER JOIN ancestors a ON r.target_person_id = a.ancestor_id
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
        `SELECT id FROM relationship
     WHERE target_person_id = :childId
       AND relationship_type = 'PARENT'`,
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
        `SELECT id FROM relationship
     WHERE source_person_id = :sourceId
       AND target_person_id = :targetId
       AND relationship_type = :type`,
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
 * For spouse relationships: ensures neither person already has a spouse.
 */
export async function assertNoExistingSpouse(personId: string): Promise<void> {
    const row = await queryOne(
        `SELECT id FROM relationship
     WHERE source_person_id = :personId
       AND relationship_type = 'SPOUSE'`,
        { personId },
    );

    if (row) {
        throw new AppError(
            'Person already has a spouse',
            400,
            'ERR_EXISTING_SPOUSE',
        );
    }
}
