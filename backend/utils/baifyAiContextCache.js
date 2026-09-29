import { createHash } from 'node:crypto';
import { statsCache } from './cache.js';
import { BAIFY_AI_SESSION_MARKER } from './baifyAiPrompt.js';

/*
 * Context Caching explícito de Gemini para BayFi AI.
 *
 * La parte fija del system prompt (reglas, FAQ, rutas) y las declaraciones de tools son iguales
 * para todas las empresas, así que se guardan UNA vez en un `cachedContent` de Gemini y cada
 * petición solo envía el contexto de la sesión + la conversación.
 *
 * Restricción de la API: una petición con `cachedContent` NO puede incluir systemInstruction,
 * tools ni toolConfig. Por eso este fetch reescribe el cuerpo que genera @ai-sdk/google:
 *   - quita systemInstruction/tools y pone `cachedContent`,
 *   - mueve el CONTEXTO DE LA SESIÓN (fecha, empresa, snapshot) al inicio del primer mensaje.
 * Si la petición trae toolConfig (último paso con toolChoice 'none') o algo falla, se envía
 * la petición original sin caché: la caché nunca debe romper una respuesta.
 *
 * Variables: BAIFY_AI_CONTEXT_CACHE=0 lo desactiva; BAIFY_AI_CONTEXT_CACHE_TTL (segundos, def. 3600).
 */

const TTL_SECONDS = Math.max(300, Number(process.env.BAIFY_AI_CONTEXT_CACHE_TTL) || 3600);
/** No reutilizar un cache al que le quede menos que esto (evita que expire a mitad de respuesta). */
const MIN_REMAINING_MS = 2 * 60 * 1000;
/** Tras un fallo al crear el cache, esperar antes de reintentar. */
const FAILURE_BACKOFF_MS = 30 * 60 * 1000;

const memory = new Map(); // hash → { name, expiresAt }
const inFlight = new Map(); // hash → Promise<string|null>
let disabledUntil = 0;

const enabled = () => process.env.BAIFY_AI_CONTEXT_CACHE !== '0';
const redisKey = (hash) => `baify-ai-gctx-${hash}`;

function isUsable(entry) {
    return entry && entry.name && entry.expiresAt - Date.now() > MIN_REMAINING_MS;
}

async function createCachedContent({ apiBase, apiKey, model, staticText, tools }) {
    const response = await fetch(`${apiBase}/cachedContents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
            model: `models/${model}`,
            displayName: 'baify-ai-static-prompt',
            systemInstruction: { parts: [{ text: staticText }] },
            ...(tools ? { tools } : {}),
            ttl: `${TTL_SECONDS}s`,
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.name) {
        throw new Error(`HTTP ${response.status}: ${data.error?.message || 'sin nombre de cache'}`);
    }
    const expiresAt = data.expireTime ? Date.parse(data.expireTime) : Date.now() + TTL_SECONDS * 1000;
    console.log(
        `[BaifyAi] Context cache creado ${data.name} (${data.usageMetadata?.totalTokenCount ?? '?'} tokens, TTL ${TTL_SECONDS}s)`
    );
    return { name: data.name, expiresAt };
}

async function getCacheName(params) {
    if (Date.now() < disabledUntil) return null;

    const { hash } = params;
    const local = memory.get(hash);
    if (isUsable(local)) return local.name;

    if (!inFlight.has(hash)) {
        inFlight.set(hash, (async () => {
            try {
                const shared = await statsCache.get(redisKey(hash));
                if (isUsable(shared)) {
                    memory.set(hash, shared);
                    return shared.name;
                }
                const entry = await createCachedContent(params);
                memory.set(hash, entry);
                const redisTtl = Math.floor((entry.expiresAt - Date.now()) / 1000) - 60;
                if (redisTtl > 0) await statsCache.set(redisKey(hash), entry, redisTtl);
                return entry.name;
            } catch (error) {
                disabledUntil = Date.now() + FAILURE_BACKOFF_MS;
                console.warn('[BaifyAi] Context cache no disponible, se usa el prompt completo:', error.message);
                return null;
            } finally {
                inFlight.delete(hash);
            }
        })());
    }
    return inFlight.get(hash);
}

function invalidate(hash) {
    memory.delete(hash);
    statsCache.clearByPrefix(redisKey(hash)).catch(() => {});
}

/**
 * Reescribe el cuerpo de generateContent para usar el cache. Devuelve null si no aplica.
 */
async function buildCachedRequest(url, body, headers) {
    // AUTO es el modo por defecto de Gemini, así que se puede omitir; NONE/ANY (p. ej. el último
    // paso con toolChoice 'none') no caben en una petición con cache → se envía sin cache.
    const callingMode = body.toolConfig?.functionCallingConfig?.mode;
    const toolConfigIsDefault = !body.toolConfig
        || (callingMode === 'AUTO' && Object.keys(body.toolConfig).length === 1);
    if (!enabled() || body.cachedContent || !toolConfigIsDefault) return null;

    const match = String(url).match(/^(.*)\/models\/([^/:]+):(stream)?[gG]enerateContent/);
    if (!match) return null;
    const [, apiBase, model] = match;

    const systemText = (body.systemInstruction?.parts || []).map((part) => part.text || '').join('');
    const markerIndex = systemText.indexOf(BAIFY_AI_SESSION_MARKER);
    if (markerIndex <= 0) return null;

    const staticText = systemText.slice(0, markerIndex);
    const sessionText = systemText.slice(markerIndex);
    const tools = body.tools || null;
    const hash = createHash('sha256')
        .update(`${model}\n${staticText}\n${JSON.stringify(tools)}`)
        .digest('hex')
        .slice(0, 24);

    const apiKey = headers.get('x-goog-api-key') || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const name = await getCacheName({ hash, apiBase, apiKey, model, staticText, tools });
    if (!name) return null;

    // El contexto de sesión va como primera parte del primer mensaje del usuario.
    const contents = Array.isArray(body.contents) ? body.contents.map((c) => ({ ...c })) : [];
    const sessionPart = { text: `${sessionText.trim()}\n\n---\n` };
    if (contents[0]?.role === 'user') {
        contents[0] = { ...contents[0], parts: [sessionPart, ...(contents[0].parts || [])] };
    } else {
        contents.unshift({ role: 'user', parts: [sessionPart] });
    }

    const { systemInstruction, tools: _tools, toolConfig, ...rest } = body;
    return { hash, body: { ...rest, contents, cachedContent: name } };
}

/**
 * fetch para createGoogleGenerativeAI({ fetch }) con Context Caching explícito.
 * @type {typeof fetch}
 */
export async function baifyAiCachingFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!init.body || typeof init.body !== 'string' || !/[gG]enerateContent/.test(url)) {
        return fetch(input, init);
    }

    let cached = null;
    try {
        cached = await buildCachedRequest(url, JSON.parse(init.body), new Headers(init.headers));
    } catch (error) {
        console.warn('[BaifyAi] Context cache: no se pudo preparar la petición:', error.message);
    }
    if (!cached) return fetch(input, init);

    const response = await fetch(input, { ...init, body: JSON.stringify(cached.body) });
    if (response.ok) return response;

    // Cache expirado/borrado o rechazado: se olvida y se repite la petición original.
    const errorText = await response.clone().text().catch(() => '');
    if (response.status === 400 || response.status === 403 || response.status === 404) {
        console.warn(`[BaifyAi] Context cache rechazado (${response.status}), reintento sin cache:`, errorText.slice(0, 160));
        invalidate(cached.hash);
        return fetch(input, init);
    }
    return response;
}
