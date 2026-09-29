import { createHash } from 'node:crypto';
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai';
import { statsCache } from './cache.js';

/*
 * Caché de respuestas de BayFi AI para preguntas repetidas (0 tokens de Gemini en un acierto).
 *
 * Seguridad multi-tenant: la clave SIEMPRE incluye el empresaId; nunca se comparte entre empresas.
 * Frescura: la clave usa el prefijo baify-ai-sales-{empresaId}-, que se borra con cada venta,
 * movimiento de stock o abono (clearBaifyAiSnapshotCache). Además incluye la fecha y la versión
 * del snapshot, y expira sola (TTL corto si la respuesta consultó datos en vivo).
 * Solo aplica a la PRIMERA pregunta de una conversación (sin historial que cambie la respuesta).
 */

const DATA_TTL_SECONDS = 10 * 60; // la respuesta usó tools (datos en vivo)
const STATIC_TTL_SECONDS = 6 * 60 * 60; // guía de uso / snapshot
const MIN_QUESTION_CHARS = 4;
const MAX_ANSWER_CHARS = 6000;

const enabled = () => process.env.BAIFY_AI_RESPONSE_CACHE !== '0';

export function normalizeQuestion(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[¿?¡!.,;:"'()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function uiText(message) {
    return (message?.parts || [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
}

/**
 * Devuelve la clave de caché si el request es cacheable (primera pregunta), o null.
 * @param {{ empresaId: string, messages: object[], snapshotVersion?: string, promptVersion: string }} params
 */
export function responseCacheKey({ empresaId, messages, snapshotVersion, promptVersion }) {
    if (!enabled() || !empresaId || messages.length !== 1 || messages[0]?.role !== 'user') return null;
    const question = normalizeQuestion(uiText(messages[0]));
    if (question.length < MIN_QUESTION_CHARS) return null;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
    const hash = createHash('sha256')
        .update(`${question}\n${today}\n${snapshotVersion || ''}\n${promptVersion}`)
        .digest('hex')
        .slice(0, 24);
    return `baify-ai-sales-${empresaId}-resp-${hash}`;
}

export async function getCachedResponse(key) {
    if (!key) return null;
    const cached = await statsCache.get(key);
    return cached?.text ? cached : null;
}

export async function storeCachedResponse(key, { text, usedTools }) {
    if (!key || !text || text.length > MAX_ANSWER_CHARS) return;
    await statsCache.set(key, { text, usedTools }, usedTools ? DATA_TTL_SECONDS : STATIC_TTL_SECONDS);
}

/** Responde con el mismo protocolo de stream que useChat espera, sin llamar a Gemini. */
export function sendCachedResponse(res, text) {
    const stream = createUIMessageStream({
        execute: ({ writer }) => {
            const id = 'cached-text';
            writer.write({ type: 'text-start', id });
            writer.write({ type: 'text-delta', id, delta: text });
            writer.write({ type: 'text-end', id });
        },
    });
    pipeUIMessageStreamToResponse({ response: res, stream, headers: { 'X-Baify-Cache': 'HIT' } });
}
