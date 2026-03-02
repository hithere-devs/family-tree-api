import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, RelationshipType } from '../types/index.js';
import * as relationshipService from '../services/relationship-service.js';

const VALID_TYPES = new Set<string>(['PARENT', 'CHILD', 'SPOUSE']);

/* ------------------------------------------------------------------ */
/*  Add relationship                                                   */
/* ------------------------------------------------------------------ */

export async function add(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { sourcePersonId, targetPersonId, relationshipType } = req.body;

        if (!sourcePersonId || !targetPersonId || !relationshipType) {
            res.status(400).json({
                error: 'sourcePersonId, targetPersonId, and relationshipType are required',
            });
            return;
        }

        if (!VALID_TYPES.has(relationshipType)) {
            res.status(400).json({
                error: `relationshipType must be one of: ${[...VALID_TYPES].join(', ')}`,
            });
            return;
        }

        const result = await relationshipService.addRelationship({
            sourcePersonId,
            targetPersonId,
            relationshipType: relationshipType as RelationshipType,
            createdBy: req.user!.userId,
        });

        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  Remove relationship (admin only — enforced at route level)         */
/* ------------------------------------------------------------------ */

export async function remove(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        await relationshipService.removeRelationship(req.params.id as string);
        res.json({ message: 'Relationship removed' });
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  Get relationships for a person                                     */
/* ------------------------------------------------------------------ */

export async function getForPerson(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const relationships = await relationshipService.getRelationshipsForPerson(
            req.params.personId as string,
        );
        res.json(relationships);
    } catch (err) {
        next(err);
    }
}
