import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';
import { getSubtreeLayout } from '../services/tree-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ai-controller');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const MAX_CONTEXT_PEOPLE = 8;

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * POST /api/ai/chat
 * Body: { messages: ChatMessage[], contextPersonIds?: string[] }
 *
 * Answers questions about the family. Selected people (plus their
 * immediate relatives' names) are serialized into the system prompt.
 */
export async function chat(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            res.status(503).json({
                error: 'AI chat is not configured yet (missing OPENAI_API_KEY on the server).',
            });
            return;
        }

        const { messages, contextPersonIds } = req.body as {
            messages?: ChatMessage[];
            contextPersonIds?: string[];
        };

        if (!Array.isArray(messages) || messages.length === 0) {
            res.status(400).json({ error: 'messages array is required' });
            return;
        }

        const trimmedMessages = messages
            .filter(
                (m) =>
                    (m.role === 'user' || m.role === 'assistant') &&
                    typeof m.content === 'string',
            )
            .slice(-12)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

        /* Build family context from the requested people */
        const people = req.user?.personId
            ? await getSubtreeLayout(req.user.personId)
            : {};
        const nameOf = (id: string) => {
            const p = people[id];
            return p ? `${p.firstName} ${p.lastName || ''}`.trim() : 'Unknown';
        };

        const ids = Array.isArray(contextPersonIds)
            ? contextPersonIds.slice(0, MAX_CONTEXT_PEOPLE)
            : [];
        const contextBlocks = ids
            .map((id) => {
                const p = people[id];
                if (!p) return null;
                const lines = [
                    `Name: ${nameOf(id)}`,
                    `Gender: ${p.gender}`,
                    p.isDeceased
                        ? `Deceased${p.deathYear ? ` (${p.deathYear})` : ''}`
                        : 'Living',
                    p.birthDate ? `Birthday: ${p.birthDate}` : null,
                    p.location ? `Lives in: ${p.location}` : null,
                    p.parentIds.length
                        ? `Parents: ${p.parentIds.map(nameOf).join(', ')}`
                        : null,
                    p.spouseIds.length
                        ? `Spouse(s): ${p.spouseIds.map(nameOf).join(', ')}`
                        : null,
                    p.exSpouseIds.length
                        ? `Ex-spouse(s): ${p.exSpouseIds.map(nameOf).join(', ')}`
                        : null,
                    p.childrenIds.length
                        ? `Children: ${p.childrenIds.map(nameOf).join(', ')}`
                        : null,
                ].filter(Boolean);
                return lines.join('\n');
            })
            .filter(Boolean)
            .join('\n\n---\n\n');

        const totalPeople = Object.keys(people).length;
        const systemPrompt = [
            'You are a warm, concise assistant for a private family tree app used by one extended family.',
            `The tree currently has ${totalPeople} people.`,
            'Answer questions about family members using ONLY the context below plus general knowledge about kinship.',
            'If the answer is not in the context, say you do not have that information and suggest attaching the relevant person as context.',
            'Keep answers short. Use UPPERCASE for person names.',
            contextBlocks
                ? `\nSelected family context:\n\n${contextBlocks}`
                : '\nNo people are attached as context.',
        ].join('\n');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        let response: globalThis.Response;
        try {
            response = await fetch(OPENAI_URL, {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: MODEL,
                    temperature: 0.3,
                    max_tokens: 500,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...trimmedMessages,
                    ],
                }),
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            const body = await response.text();
            log.error('OpenAI request failed', { status: response.status, body: body.slice(0, 300) });
            res.status(502).json({ error: 'The AI service could not answer right now.' });
            return;
        }

        const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (!reply) {
            res.status(502).json({ error: 'The AI service returned an empty answer.' });
            return;
        }

        log.info('AI chat answered', {
            userId: req.user?.userId,
            contextCount: ids.length,
            messageCount: trimmedMessages.length,
        });
        res.json({ reply });
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            res.status(504).json({ error: 'The AI service timed out.' });
            return;
        }
        log.error('AI chat failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        next(err);
    }
}
