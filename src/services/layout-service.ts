/**
 * Server-side layout engine for the family tree.
 *
 * Ported from the client-side `computeTreeLayout()` with key optimizations:
 *   - Topological sort replaces O(n²) iterative fixup (Phase 1.5)
 *   - Hamiltonian DFS capped at cluster size ≤ 8
 *   - Sweep-line O(v log v) for vertical nudge detection
 *   - Stores results in DB so frontend only fetches pre-positioned nodes
 */

import { queryAll, queryOne, execute } from '../db/connection.js';
import type { PersonRow, RelationshipRow } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('layout-service');

/* ------------------------------------------------------------------ */
/*  Constants — must match frontend PersonNode dimensions              */
/* ------------------------------------------------------------------ */

const H_GAP = 320;
const V_GAP = 600;
const COUPLE_GAP = 200;
const MIN_VERT_GAP = 80;
const NODE_H = 140;
/** Horizontal gap between disconnected family components */
const COMPONENT_GAP = 1500;

/* ------------------------------------------------------------------ */
/*  Internal types                                                     */
/* ------------------------------------------------------------------ */

interface LayoutPerson {
    id: string;
    gender: string;
    parentIds: string[];
    childrenIds: string[];
    spouseIds: string[];
    exSpouseIds: string[];
}

interface NodePosition {
    personId: string;
    x: number;
    y: number;
}

/* ------------------------------------------------------------------ */
/*  Data loading                                                       */
/* ------------------------------------------------------------------ */

async function loadAllPeople(): Promise<{
    people: Record<string, LayoutPerson>;
    allIds: string[];
}> {
    // 1. Every non-deleted person — disconnected islands included, so
    //    nobody is left without layout coordinates.
    const rows = await queryAll<{ id: string; gender: string }>(
        `SELECT id, gender FROM person WHERE is_deleted = false`,
    );

    if (rows.length === 0) return { people: {}, allIds: [] };

    const allIds = rows.map((r) => r.id);

    // 2. All relationships between non-deleted people
    const rels = await queryAll<RelationshipRow>(
        `SELECT r.* FROM relationship r
         INNER JOIN person ps ON ps.id = r.source_person_id AND ps.is_deleted = false
         INNER JOIN person pt ON pt.id = r.target_person_id AND pt.is_deleted = false`,
    );

    // 3. Build lookup
    const genderMap = new Map(rows.map((r) => [r.id, r.gender]));
    const people: Record<string, LayoutPerson> = {};

    for (const id of allIds) {
        people[id] = {
            id,
            gender: genderMap.get(id) || 'other',
            parentIds: [],
            childrenIds: [],
            spouseIds: [],
            exSpouseIds: [],
        };
    }

    for (const r of rels) {
        const p = people[r.source_person_id];
        if (!p) continue;
        switch (r.relationship_type) {
            case 'CHILD':
                p.parentIds.push(r.target_person_id);
                break;
            case 'PARENT':
                p.childrenIds.push(r.target_person_id);
                break;
            case 'SPOUSE':
                if (r.status === 'divorced') {
                    p.exSpouseIds.push(r.target_person_id);
                } else {
                    p.spouseIds.push(r.target_person_id);
                }
                break;
        }
    }

    return { people, allIds };
}

/* ------------------------------------------------------------------ */
/*  Connected components + deterministic packing                       */
/* ------------------------------------------------------------------ */

function connectedComponents(
    people: Record<string, LayoutPerson>,
): string[][] {
    const unseen = new Set(Object.keys(people));
    const components: string[][] = [];

    while (unseen.size > 0) {
        const start = [...unseen].sort()[0];
        const queue = [start];
        const component: string[] = [];
        unseen.delete(start);

        while (queue.length > 0) {
            const id = queue.shift()!;
            component.push(id);
            const person = people[id];
            const neighbours = [
                ...person.parentIds,
                ...person.childrenIds,
                ...person.spouseIds,
                ...person.exSpouseIds,
            ];
            for (const neighbour of neighbours) {
                if (!unseen.has(neighbour)) continue;
                unseen.delete(neighbour);
                queue.push(neighbour);
            }
        }

        components.push(component.sort());
    }

    return components;
}

/**
 * Deterministic component root: a person with no parents (top
 * generation), ties broken by id. Keeps the layout stable no matter
 * which user triggered the recompute.
 */
function chooseComponentRoot(
    component: string[],
    people: Record<string, LayoutPerson>,
): string {
    const roots = component
        .filter((id) => people[id].parentIds.length === 0)
        .sort();
    return roots[0] ?? component[0];
}

function pickPeople(
    ids: string[],
    people: Record<string, LayoutPerson>,
): Record<string, LayoutPerson> {
    return Object.fromEntries(ids.map((id) => [id, people[id]]));
}

/**
 * Lay out every connected component and pack them side by side:
 * the largest component (the main family) sits first with its root
 * at the origin, smaller islands follow to the right.
 */
function packComponentLayouts(
    people: Record<string, LayoutPerson>,
): NodePosition[] {
    const components = connectedComponents(people);
    components.sort(
        (a, b) => b.length - a.length || a[0].localeCompare(b[0]),
    );

    const packed: NodePosition[] = [];
    let nextX = 0;

    for (let index = 0; index < components.length; index++) {
        const ids = components[index];
        const rootId = chooseComponentRoot(ids, people);
        const positions = computeLayout(pickPeople(ids, people), rootId);
        if (positions.length === 0) continue;

        let minX = Infinity;
        let maxX = -Infinity;
        for (const position of positions) {
            if (position.x < minX) minX = position.x;
            if (position.x > maxX) maxX = position.x;
        }

        const shiftX = index === 0 ? 0 : nextX - minX;
        nextX = maxX + shiftX + COMPONENT_GAP;

        for (const position of positions) {
            packed.push({
                personId: position.personId,
                x: position.x + shiftX,
                y: position.y,
            });
        }
    }

    return packed;
}

/* ------------------------------------------------------------------ */
/*  Generation assignment (optimized — topological sort for fixup)     */
/* ------------------------------------------------------------------ */

function assignGenerations(
    people: Record<string, LayoutPerson>,
    centerId: string,
): Map<string, number> {
    const gen = new Map<string, number>();

    // Phase 1 — parent/child BFS (no spouse hops)
    const pcQueue: string[] = [centerId];
    gen.set(centerId, 0);

    while (pcQueue.length > 0) {
        const id = pcQueue.shift()!;
        const person = people[id];
        if (!person) continue;
        const g = gen.get(id)!;

        for (const pid of person.parentIds) {
            if (!people[pid] || gen.has(pid)) continue;
            gen.set(pid, g - 1);
            pcQueue.push(pid);
        }
        for (const cid of person.childrenIds) {
            if (!people[cid] || gen.has(cid)) continue;
            gen.set(cid, g + 1);
            pcQueue.push(cid);
        }
    }

    // Phase 1.5 — topological fixup (replaces O(n²) while loop)
    //
    // Build a parent→child DAG among assigned nodes, then process in
    // topological order. Each child's gen = max(parent.gen) + 1 if it
    // was incorrectly placed at the same level or above a parent.
    //
    // This is O(n + edges) instead of O(n²).
    const inDegree = new Map<string, number>();
    const childrenOf = new Map<string, string[]>();

    for (const [id] of gen) {
        inDegree.set(id, 0);
        childrenOf.set(id, []);
    }

    for (const [id] of gen) {
        const person = people[id];
        if (!person) continue;
        for (const pid of person.parentIds) {
            if (!gen.has(pid)) continue;
            childrenOf.get(pid)!.push(id);
            inDegree.set(id, (inDegree.get(id) || 0) + 1);
        }
    }

    // Kahn's algorithm: start from nodes with no parents in the set
    const topoQueue: string[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) topoQueue.push(id);
    }

    while (topoQueue.length > 0) {
        const id = topoQueue.shift()!;
        const g = gen.get(id)!;

        for (const cid of childrenOf.get(id) || []) {
            const cg = gen.get(cid)!;
            if (cg <= g) {
                gen.set(cid, g + 1);
            }
            const newDeg = (inDegree.get(cid) || 1) - 1;
            inDegree.set(cid, newDeg);
            if (newDeg === 0) topoQueue.push(cid);
        }
    }

    // Phase 2 — spouse assignment for people only reachable via spouse edges
    const spouseQueue: string[] = [...gen.keys()];
    while (spouseQueue.length > 0) {
        const id = spouseQueue.shift()!;
        const person = people[id];
        if (!person) continue;
        const g = gen.get(id)!;
        const allSpouses = [...person.spouseIds, ...person.exSpouseIds];

        for (const sid of allSpouses) {
            if (people[sid] && !gen.has(sid)) {
                gen.set(sid, g);
                spouseQueue.push(sid);
                // Transitively assign parents/children of this newly placed person
                const subQueue = [sid];
                while (subQueue.length > 0) {
                    const subId = subQueue.shift()!;
                    const subPerson = people[subId];
                    if (!subPerson) continue;
                    const sg = gen.get(subId)!;
                    for (const pid of subPerson.parentIds) {
                        if (!people[pid] || gen.has(pid)) continue;
                        gen.set(pid, sg - 1);
                        subQueue.push(pid);
                        spouseQueue.push(pid);
                    }
                    for (const cid of subPerson.childrenIds) {
                        if (!people[cid] || gen.has(cid)) continue;
                        gen.set(cid, sg + 1);
                        subQueue.push(cid);
                        spouseQueue.push(cid);
                    }
                }
            }
        }
    }

    // Phase 3 — reconcile cross-generation spouse pairs
    const reconciled = new Set<string>();
    for (const [id, g] of gen) {
        const person = people[id];
        if (!person) continue;
        const allSpouses = [...person.spouseIds, ...person.exSpouseIds];
        for (const sid of allSpouses) {
            const pairKey = [id, sid].sort().join(',');
            if (reconciled.has(pairKey)) continue;
            reconciled.add(pairKey);
            const sg = gen.get(sid);
            if (sg === undefined || sg === g) continue;
            const deeperGen = Math.max(g, sg);
            if (g < sg) {
                gen.set(id, deeperGen);
            } else {
                gen.set(sid, deeperGen);
            }
        }
    }

    return gen;
}

/* ------------------------------------------------------------------ */
/*  Row layout — place units within a generation row                   */
/* ------------------------------------------------------------------ */

function layoutRow(
    ids: string[],
    y: number,
    people: Record<string, LayoutPerson>,
    posMap: Map<string, { x: number; y: number }>,
    hintMap: Map<string, { x: number; y: number }>,
    positions: NodePosition[],
) {
    const getPos = (id: string) => posMap.get(id) || hintMap.get(id);

    const avgXOf = (relIds: string[]): number | null => {
        const xs = relIds
            .map((rid) => getPos(rid))
            .filter(Boolean)
            .map((p) => p!.x);
        return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };

    const avgRelX = (id: string) => {
        const p = people[id];
        return p ? avgXOf([...p.parentIds, ...p.childrenIds]) : null;
    };

    /* ---- build spouse-cluster units ---- */

    const placed = new Set<string>();
    const idsSet = new Set(ids);
    const units: string[][] = [];

    for (const id of ids) {
        if (placed.has(id)) continue;
        placed.add(id);

        const cluster = new Set<string>([id]);
        const spouseQueue = [id];
        while (spouseQueue.length > 0) {
            const curr = spouseQueue.shift()!;
            const p = people[curr];
            if (!p) continue;
            const allSpouses = [...p.spouseIds, ...p.exSpouseIds];
            for (const sid of allSpouses) {
                if (idsSet.has(sid) && !cluster.has(sid)) {
                    cluster.add(sid);
                    placed.add(sid);
                    spouseQueue.push(sid);
                }
            }
        }

        const members = [...cluster];

        if (members.length === 1) {
            units.push(members);
        } else if (members.length === 2) {
            const [a, b] = members;
            const rxA = avgRelX(a);
            const rxB = avgRelX(b);
            if (rxA !== null && rxB !== null && rxA !== rxB) {
                units.push(rxA <= rxB ? [a, b] : [b, a]);
            } else {
                if ((people[a]?.gender ?? '') <= (people[b]?.gender ?? '')) {
                    units.push([a, b]);
                } else {
                    units.push([b, a]);
                }
            }
        } else if (members.length <= 8) {
            // Hamiltonian path search — capped at 8 members
            const adjMap = new Map<string, Set<string>>();
            for (const uid of members) adjMap.set(uid, new Set());
            for (const uid of members) {
                const allSp = [...(people[uid]?.spouseIds || []), ...(people[uid]?.exSpouseIds || [])];
                for (const sid of allSp) {
                    if (cluster.has(sid)) {
                        adjMap.get(uid)!.add(sid);
                        adjMap.get(sid)!.add(uid);
                    }
                }
            }

            const chain = findChain(members, adjMap);
            if (chain) {
                const firstHintX = avgRelX(chain[0]);
                const lastHintX = avgRelX(chain[chain.length - 1]);
                if (firstHintX !== null && lastHintX !== null && firstHintX > lastHintX) {
                    chain.reverse();
                }
                units.push(chain);
            } else {
                units.push(hubAndSpoke(members, adjMap, people, avgRelX));
            }
        } else {
            // >8 members — skip Hamiltonian, go directly to hub-and-spoke
            const adjMap = new Map<string, Set<string>>();
            for (const uid of members) adjMap.set(uid, new Set());
            for (const uid of members) {
                const allSp = [...(people[uid]?.spouseIds || []), ...(people[uid]?.exSpouseIds || [])];
                for (const sid of allSp) {
                    if (cluster.has(sid)) {
                        adjMap.get(uid)!.add(sid);
                        adjMap.get(sid)!.add(uid);
                    }
                }
            }
            units.push(hubAndSpoke(members, adjMap, people, avgRelX));
        }
    }

    /* ---- compute ideal center-X for each unit ---- */

    const idealXs = units.map((unit) => {
        const xs: number[] = [];
        for (const uid of unit) {
            const rx = avgRelX(uid);
            if (rx !== null) xs.push(rx);
        }
        return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    });

    /* ---- group units by parent family so siblings stay together ---- */

    const unitFamilyKeys: string[] = units.map((unit) => {
        const parentSets = new Set<string>();
        for (const uid of unit) {
            const p = people[uid];
            if (p && p.parentIds.length > 0) {
                parentSets.add([...p.parentIds].sort().join(','));
            }
        }
        if (parentSets.size === 1) return [...parentSets][0];
        return `__indep_${unit[0]}`;
    });

    const familyGroupMap = new Map<string, number[]>();
    for (let i = 0; i < units.length; i++) {
        const key = unitFamilyKeys[i];
        if (!familyGroupMap.has(key)) familyGroupMap.set(key, []);
        familyGroupMap.get(key)!.push(i);
    }

    const familyGroups = [...familyGroupMap.entries()].map(([_key, indices]) => {
        indices.sort((a, b) => idealXs[a] - idealXs[b]);
        const groupIdealX =
            indices.reduce((s, i) => s + idealXs[i], 0) / indices.length;
        return { indices, groupIdealX };
    });

    familyGroups.sort((a, b) => a.groupIdealX - b.groupIdealX);

    const order = familyGroups.flatMap((g) => g.indices);
    const sortedUnits = order.map((i) => units[i]);
    const sortedIdealXs = order.map((i) => idealXs[i]);

    /* ---- place units, resolve overlaps left-to-right ---- */

    const unitWidths = sortedUnits.map((u) => (u.length - 1) * COUPLE_GAP);
    const unitCenters: number[] = [];

    for (let i = 0; i < sortedUnits.length; i++) {
        let cx = sortedIdealXs[i];
        if (i > 0) {
            const prevRight = unitCenters[i - 1] + unitWidths[i - 1] / 2;
            const minCx = prevRight + H_GAP + unitWidths[i] / 2;
            if (cx < minCx) cx = minCx;
        }
        unitCenters.push(cx);
    }

    /* ---- assign positions ---- */

    for (let i = 0; i < sortedUnits.length; i++) {
        const unit = sortedUnits[i];
        const cx = unitCenters[i];
        const startX = cx - ((unit.length - 1) * COUPLE_GAP) / 2;

        for (let j = 0; j < unit.length; j++) {
            const x = startX + j * COUPLE_GAP;
            posMap.set(unit[j], { x, y });
            positions.push({ personId: unit[j], x, y });
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Hamiltonian path (DFS, starts from leaves)                         */
/* ------------------------------------------------------------------ */

function findChain(
    members: string[],
    adjMap: Map<string, Set<string>>,
): string[] | null {
    const leaves = members.filter((m) => (adjMap.get(m)?.size ?? 0) === 1);
    const starts = leaves.length > 0 ? leaves : members;

    for (const start of starts) {
        const visited = new Set<string>([start]);
        const path = [start];

        function dfs(): boolean {
            if (path.length === members.length) return true;
            const curr = path[path.length - 1];
            for (const nb of adjMap.get(curr) || []) {
                if (!visited.has(nb)) {
                    visited.add(nb);
                    path.push(nb);
                    if (dfs()) return true;
                    path.pop();
                    visited.delete(nb);
                }
            }
            return false;
        }

        if (dfs()) return path;
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Hub-and-spoke fallback for non-chain spouse graphs                 */
/* ------------------------------------------------------------------ */

function hubAndSpoke(
    members: string[],
    adjMap: Map<string, Set<string>>,
    people: Record<string, LayoutPerson>,
    avgRelX: (id: string) => number | null,
): string[] {
    let hubId = members[0];
    let maxConn = 0;
    for (const uid of members) {
        const conn = adjMap.get(uid)?.size ?? 0;
        if (conn > maxConn) {
            maxConn = conn;
            hubId = uid;
        }
    }

    const spouses = members.filter((uid) => uid !== hubId);
    spouses.sort((a, b) => {
        const rxA = avgRelX(a);
        const rxB = avgRelX(b);
        if (rxA !== null && rxB !== null && rxA !== rxB) return rxA - rxB;
        return (people[a]?.gender ?? '').localeCompare(people[b]?.gender ?? '');
    });

    const leftCount = Math.floor(spouses.length / 2);
    const left = spouses.slice(0, leftCount);
    const right = spouses.slice(leftCount);
    return [...left, hubId, ...right];
}

/* ------------------------------------------------------------------ */
/*  Post-layout: nudge units with overlapping vertical connectors      */
/*  Uses sorted sweep approach — O(v log v)                            */
/* ------------------------------------------------------------------ */

interface VerticalLine {
    x: number;
    familyKey: string;
    memberIds: string[];
    yTop: number;
    yBot: number;
}

function nudgeOverlappingVerticals(
    people: Record<string, LayoutPerson>,
    posMap: Map<string, { x: number; y: number }>,
    positions: NodePosition[],
) {
    const familyMap = new Map<string, { parentIds: string[]; childIds: string[] }>();
    for (const person of Object.values(people)) {
        if (person.parentIds.length > 0 && posMap.has(person.id)) {
            const key = [...person.parentIds].sort().join(',');
            if (!familyMap.has(key)) {
                familyMap.set(key, { parentIds: [...person.parentIds].sort(), childIds: [] });
            }
            familyMap.get(key)!.childIds.push(person.id);
        }
    }

    const verticals: VerticalLine[] = [];

    for (const [familyKey, family] of familyMap) {
        const parentPositions = family.parentIds
            .filter((pid) => posMap.has(pid))
            .map((pid) => ({ id: pid, ...posMap.get(pid)! }));
        if (parentPositions.length === 0) continue;

        const childPositions = family.childIds
            .filter((cid) => posMap.has(cid))
            .map((cid) => ({ id: cid, ...posMap.get(cid)! }));
        if (childPositions.length === 0) continue;

        const parentBottomY = parentPositions[0].y;
        const childTopY = Math.min(...childPositions.map((c) => c.y));
        const junctionX =
            parentPositions.reduce((s, p) => s + p.x, 0) / parentPositions.length;
        const allMemberIds = [...family.parentIds, ...family.childIds].filter(
            (id) => posMap.has(id),
        );

        verticals.push({
            x: junctionX,
            familyKey,
            memberIds: allMemberIds,
            yTop: parentBottomY,
            yBot: childTopY,
        });

        for (const child of childPositions) {
            verticals.push({
                x: child.x,
                familyKey,
                memberIds: allMemberIds,
                yTop: parentBottomY,
                yBot: childTopY,
            });
        }
    }

    // Sort by X — only check adjacent pairs (sweep-line approach)
    verticals.sort((a, b) => a.x - b.x);

    const familyNudge = new Map<string, number>();

    for (let i = 0; i < verticals.length - 1; i++) {
        const a = verticals[i];
        const b = verticals[i + 1];
        if (a.familyKey === b.familyKey) continue;

        const gap = Math.abs(b.x - a.x);
        if (gap >= MIN_VERT_GAP) continue;

        const yOverlap = a.yTop < b.yBot && b.yTop < a.yBot;
        if (!yOverlap) continue;

        const needed = MIN_VERT_GAP - gap;
        const halfNudge = Math.ceil(needed / 2);

        if (a.x <= b.x) {
            familyNudge.set(a.familyKey, (familyNudge.get(a.familyKey) ?? 0) - halfNudge);
            familyNudge.set(b.familyKey, (familyNudge.get(b.familyKey) ?? 0) + halfNudge);
        } else {
            familyNudge.set(b.familyKey, (familyNudge.get(b.familyKey) ?? 0) - halfNudge);
            familyNudge.set(a.familyKey, (familyNudge.get(a.familyKey) ?? 0) + halfNudge);
        }
    }

    if (familyNudge.size === 0) return;

    const personNudge = new Map<string, number>();
    for (const [familyKey, nudge] of familyNudge) {
        if (nudge === 0) continue;
        const family = familyMap.get(familyKey);
        if (!family) continue;
        for (const cid of family.childIds) {
            const existing = personNudge.get(cid) ?? 0;
            if (Math.abs(nudge) > Math.abs(existing)) {
                personNudge.set(cid, nudge);
            }
        }
    }

    for (const pos of positions) {
        const nudge = personNudge.get(pos.personId);
        if (nudge) {
            pos.x += nudge;
            const mapEntry = posMap.get(pos.personId);
            if (mapEntry) mapEntry.x += nudge;
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Main layout computation                                            */
/* ------------------------------------------------------------------ */

function computeLayout(
    people: Record<string, LayoutPerson>,
    centerId: string,
): NodePosition[] {
    if (!people[centerId]) return [];

    // Step 1: assign generations
    const gen = assignGenerations(people, centerId);

    // Step 2: group by generation
    const rows = new Map<number, string[]>();
    for (const [id, g] of gen) {
        if (!rows.has(g)) rows.set(g, []);
        rows.get(g)!.push(id);
    }

    // Step 3: processing order — outward from center
    const sortedGens = [...rows.keys()].sort((a, b) => {
        const da = Math.abs(a),
            db = Math.abs(b);
        return da !== db ? da - db : a - b;
    });

    // Step 4 & 5: two-pass layout
    let posMap = new Map<string, { x: number; y: number }>();
    let positions: NodePosition[] = [];

    for (let pass = 0; pass < 2; pass++) {
        const hintMap =
            pass > 0
                ? new Map(posMap)
                : new Map<string, { x: number; y: number }>();
        posMap = new Map();
        positions = [];

        for (const g of sortedGens) {
            layoutRow(rows.get(g)!, g * V_GAP, people, posMap, hintMap, positions);
        }
    }

    // Step 5.5: nudge overlapping verticals
    nudgeOverlappingVerticals(people, posMap, positions);

    // Step 6: shift so center is at (0, 0)
    const centerPos = posMap.get(centerId);
    if (centerPos) {
        const dx = -centerPos.x;
        const dy = -centerPos.y;
        for (const pos of positions) {
            pos.x += dx;
            pos.y += dy;
        }
    }

    return positions;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

interface RecomputeResult {
    nodeCount: number;
    durationMs: number;
}

async function doRecompute(): Promise<RecomputeResult> {
    const start = Date.now();

    const { people } = await loadAllPeople();

    if (Object.keys(people).length === 0) {
        log.warn('No people found for layout');
        return { nodeCount: 0, durationMs: Date.now() - start };
    }

    const positions = packComponentLayouts(people);

    // Batch-update positions in DB
    // Build a single UPDATE using unnest for efficiency
    if (positions.length > 0) {
        const ids: string[] = [];
        const xs: number[] = [];
        const ys: number[] = [];

        for (const pos of positions) {
            ids.push(pos.personId);
            xs.push(Math.round(pos.x * 100) / 100);
            ys.push(Math.round(pos.y * 100) / 100);
        }

        await execute(
            `UPDATE person
             SET layout_x = data.x, layout_y = data.y, updated_at = NOW()
             FROM (
                SELECT unnest(ARRAY[${ids.map((_, i) => `:id${i}`).join(',')}]::uuid[]) AS pid,
                       unnest(ARRAY[${xs.map((_, i) => `:x${i}`).join(',')}]::float8[]) AS x,
                       unnest(ARRAY[${ys.map((_, i) => `:y${i}`).join(',')}]::float8[]) AS y
             ) AS data
             WHERE person.id = data.pid`,
            {
                ...Object.fromEntries(ids.map((id, i) => [`id${i}`, id])),
                ...Object.fromEntries(xs.map((x, i) => [`x${i}`, x])),
                ...Object.fromEntries(ys.map((y, i) => [`y${i}`, y])),
            },
        );
    }

    const durationMs = Date.now() - start;
    log.info('Layout recomputed', {
        nodeCount: positions.length,
        durationMs,
    });
    return { nodeCount: positions.length, durationMs };
}

/* Coalescing latch — concurrent writes share one recompute; if data
 * changed while a pass was running, one more pass runs before the
 * shared promise resolves. */
let _inFlight: Promise<RecomputeResult> | null = null;
let _rerunRequested = false;

/**
 * Recompute layout for ALL non-deleted people (every connected
 * component, islands included) and store results in the `layout_x`,
 * `layout_y` columns of the `person` table. The layout is
 * deterministic regardless of which person/user triggered it.
 */
export async function recomputeLayout(_centerId?: string): Promise<RecomputeResult> {
    if (_inFlight) {
        _rerunRequested = true;
        return _inFlight;
    }

    _inFlight = (async () => {
        let result: RecomputeResult;
        do {
            _rerunRequested = false;
            result = await doRecompute();
        } while (_rerunRequested);
        return result;
    })().finally(() => {
        _inFlight = null;
    });

    return _inFlight;
}

/* ------------------------------------------------------------------ */
/*  Viewport query — return nodes within a bounding box                */
/* ------------------------------------------------------------------ */

export interface ViewportNode {
    id: string;
    x: number;
    y: number;
    firstName: string;
    lastName: string;
    gender: string;
    isDeceased: boolean;
}

export interface ViewportEdge {
    sourceId: string;
    targetId: string;
    type: 'PARENT' | 'CHILD' | 'SPOUSE';
    status: string;
}

export interface ViewportResult {
    nodes: ViewportNode[];
    totalNodes: number;
    totalPeople: number;
}

export async function getTreeViewport(params: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    zoom: number;
}): Promise<ViewportResult> {
    const { minX, maxX, minY, maxY } = params;

    // Expand margin based on zoom to pre-fetch nodes near viewport edges
    const margin = 400 / Math.max(params.zoom, 0.05);
    const qMinX = minX - margin;
    const qMaxX = maxX + margin;
    const qMinY = minY - margin;
    const qMaxY = maxY + margin;

    // Count total laid-out nodes and total people
    const countRow = await queryOne<{ laid_out: string; total: string }>(
        `SELECT
             COUNT(*) FILTER (WHERE layout_x IS NOT NULL) AS laid_out,
             COUNT(*) AS total
         FROM person WHERE is_deleted = false`,
    );
    const totalNodes = parseInt(countRow?.laid_out || '0', 10);
    const totalPeople = parseInt(countRow?.total || '0', 10);

    // Fetch nodes within viewport
    const nodes = await queryAll<{
        id: string;
        layout_x: number;
        layout_y: number;
        first_name: string;
        last_name: string;
        gender: string;
        is_deceased: boolean;
    }>(
        `SELECT id, layout_x, layout_y, first_name, last_name, gender, is_deceased
         FROM person
         WHERE layout_x IS NOT NULL
           AND layout_y IS NOT NULL
           AND is_deleted = false
           AND layout_x BETWEEN :qMinX AND :qMaxX
           AND layout_y BETWEEN :qMinY AND :qMaxY`,
        { qMinX, qMaxX, qMinY, qMaxY },
    );

    const viewportNodes: ViewportNode[] = nodes.map((n) => ({
        id: n.id,
        x: n.layout_x,
        y: n.layout_y,
        firstName: n.first_name,
        lastName: n.last_name,
        gender: n.gender,
        isDeceased: n.is_deceased,
    }));

    return { nodes: viewportNodes, totalNodes, totalPeople };
}

/* ------------------------------------------------------------------ */
/*  Get ALL edges (loaded once on mount, not per-viewport)             */
/* ------------------------------------------------------------------ */

export async function getAllEdges(): Promise<ViewportEdge[]> {
    // The renderer only draws PARENT and SPOUSE edges (CHILD rows are
    // the mirror of PARENT rows) — skip the redundant half of the payload.
    const edges = await queryAll<RelationshipRow>(
        `SELECT r.* FROM relationship r
         JOIN person p1 ON p1.id = r.source_person_id AND p1.is_deleted = false
         JOIN person p2 ON p2.id = r.target_person_id AND p2.is_deleted = false
         WHERE r.relationship_type IN ('PARENT', 'SPOUSE')`,
    );
    return edges.map((e) => ({
        sourceId: e.source_person_id,
        targetId: e.target_person_id,
        type: e.relationship_type,
        status: e.status,
    }));
}
