import type { NextFunction, Response } from 'express';
import * as personService from '../services/person-service.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { assertCanEdit } from '../validators/permission-validator.js';

export async function create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const {
            firstName,
            lastName,
            gender,
            isDeceased,
            birthDate,
            deathYear,
            bio,
            phoneNumber,
            socialLinks,
            location,
        } = req.body;

        if (!firstName) {
            res.status(400).json({ error: 'firstName is required' });
            return;
        }

        const person = await personService.createPerson({
            firstName,
            lastName,
            gender,
            isDeceased,
            birthDate,
            deathYear,
            bio,
            phoneNumber,
            socialLinks,
            location,
            createdBy: req.user!.userId,
        });

        res.status(201).json(person);
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  Get person by ID                                                   */
/* ------------------------------------------------------------------ */

export async function getById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const person = await personService.getPersonById(req.params.id as string);
        res.json(person);
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  List all people                                                    */
/* ------------------------------------------------------------------ */

export async function list(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const people = await personService.listPeople();
        res.json(people);
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  Update person (permission-checked)                                 */
/* ------------------------------------------------------------------ */

export async function update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const personId = req.params.id as string;
        await assertCanEdit(req.user!, personId);

        const person = await personService.updatePerson(personId, {
            ...req.body,
            updatedBy: req.user!.userId,
        });

        res.json(person);
    } catch (err) {
        next(err);
    }
}

/* ------------------------------------------------------------------ */
/*  Soft delete (admin only)                                           */
/* ------------------------------------------------------------------ */

export async function remove(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        await personService.softDeletePerson(req.params.id as string);
        res.json({ message: 'Person deleted' });
    } catch (err) {
        next(err);
    }
}
