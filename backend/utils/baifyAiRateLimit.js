import { statsCache } from './cache.js';

const WINDOW_SECONDS = 60;
/** Cubre el día en Caracas + margen hasta reset. */
const DAILY_WINDOW_SECONDS = 36 * 60 * 60;

function maxMessagesPerMinute() {
    const fromEnv = Number(process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_MIN);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
    return 4;
}

function maxMessagesPerDay() {
    const fromEnv = Number(process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
    return 20;
}

function dailyRateKey(uid) {
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
    return `baify-ai-daily:${uid}:${date}`;
}

/**
 * Limita mensajes de chat por usuario (cuota diaria + ráfaga por minuto).
 * Cada mensaje del usuario puede disparar varias llamadas API si hay tools.
 */
export async function assertBaifyAiRateLimit(uid) {
    if (!uid) return { ok: true };

    const dailyMax = maxMessagesPerDay();
    const dailyKey = dailyRateKey(uid);
    const dailyRaw = await statsCache.get(dailyKey);
    const dailyCount = typeof dailyRaw === 'number' ? dailyRaw : Number(dailyRaw) || 0;

    if (dailyCount >= dailyMax) {
        return {
            ok: false,
            status: 429,
            error:
                `Alcanzaste el límite diario de ${dailyMax} mensajes a BayFi AI. ` +
                'Vuelve mañana o pide al administrador que suba el cupo.',
            code: 'BAIFY_AI_DAILY_LIMIT',
        };
    }

    const minuteKey = `baify-ai-rate:${uid}`;
    const minuteRaw = await statsCache.get(minuteKey);
    const minuteCount = typeof minuteRaw === 'number' ? minuteRaw : Number(minuteRaw) || 0;
    const minuteMax = maxMessagesPerMinute();

    if (minuteCount >= minuteMax) {
        return {
            ok: false,
            status: 429,
            error: `Demasiados mensajes a BayFi AI. Espera ~1 minuto (máx. ${minuteMax} mensajes/min por usuario).`,
            code: 'BAIFY_AI_RATE_LIMIT',
        };
    }

    await statsCache.set(dailyKey, dailyCount + 1, DAILY_WINDOW_SECONDS);
    await statsCache.set(minuteKey, minuteCount + 1, WINDOW_SECONDS);
    return { ok: true };
}

export function mapGeminiQuotaError(error) {
    const message = error?.message || String(error || '');
    if (/quota|429|rate.limit|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(message)) {
        const retryMatch = message.match(/retry in ([\d.]+)s/i);
        const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : 60;
        return {
            status: 429,
            code: 'GEMINI_QUOTA',
            error:
                'Se alcanzó la cuota gratuita de Gemini para este modelo. Espera un minuto e intenta de nuevo, ' +
                'activa facturación en Google AI Studio, o usa un modelo con más cuota (GEMINI_MODEL en .env).',
            retryAfterSeconds: retrySeconds,
        };
    }
    return null;
}

export function mapGeminiConnectionError(error) {
    const message = error?.message || String(error || '');
    if (
        /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|Cannot connect to API|fetch failed|network/i.test(
            message
        )
    ) {
        return {
            status: 503,
            code: 'GEMINI_NETWORK',
            error:
                'No se pudo conectar con Google Gemini (red interrumpida). Revisa internet, desactiva VPN/proxy, ' +
                'espera un momento e intenta de nuevo.',
        };
    }
    return null;
}

/** @returns {{ status: number, code: string, error: string, retryAfterSeconds?: number } | null} */
export function mapGeminiClientError(error) {
    return mapGeminiQuotaError(error) || mapGeminiConnectionError(error);
}
