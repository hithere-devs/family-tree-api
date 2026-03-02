import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import * as treeService from '../services/tree-service.js';

/* ------------------------------------------------------------------ */
/*  Get subtree centered on a person                                   */
/* ------------------------------------------------------------------ */

export async function getSubtree(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const tree = await treeService.getSubtree(req.params.personId as string);
        res.json({ people: tree });
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  Get ancestors (recursive)                                          */
/* ------------------------------------------------------------------ */

export async function getAncestors(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const ancestors = await treeService.getAncestors(req.params.personId as string);
        res.json(ancestors);
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  Get descendants (recursive)                                        */
/* ------------------------------------------------------------------ */

export async function getDescendants(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const descendants = await treeService.getDescendants(req.params.personId as string);
        res.json(descendants);
    } catch (err) {
        next(err);
    }
}
