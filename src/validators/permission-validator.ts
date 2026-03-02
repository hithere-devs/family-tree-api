import { queryAll } from '../db/connection.js';
import { AppError, type AuthPayload, type RelationshipRow } from '../types/index.js';

/**
 * Checks whether the authenticated user can edit the target person.
 * Throws AppError(403) if not allowed.
 *
 * Rules:
 *  - Admin can edit anyone
 *  - User can edit self
 *  - User can edit spouse
 *  - User can edit direct children
 *  - Everything else is forbidden
 */
export async function assertCanEdit(
    user: AuthPayload,
    targetPersonId: string,
): Promise<void> {
    // Admin bypass
    if (user.role === 'admin') return;

    const myPersonId = user.personId;

    // Self
    if (myPersonId === targetPersonId) return;

    // Check relationships from me → target
    const rels = await queryAll<RelationshipRow>(
        `SELECT relationship_type FROM relationship
     WHERE source_person_id = :myId
       AND target_person_id = :targetId`,
        { myId: myPersonId, targetId: targetPersonId },
    );

    const types = new Set(rels.map((r) => r.relationship_type));

    // Spouse
    if (types.has('SPOUSE')) return;

    // Parent of target → target is my child → allowed
    if (types.has('PARENT')) return;

    throw new AppError(
        'You do not have permission to edit this person',
        403,
        'ERR_FORBIDDEN',
    );
}
