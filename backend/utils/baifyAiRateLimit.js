import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../config/firebase.js';
import { isStatsRedisConfigured, statsCache } from './cache.js';

const WINDOW_SECONDS = 60;
/** Cubre el día en Caracas + margen hasta reset. */
const DAILY_WINDOW_SECONDS = 36 * 60 * 60;
const BAIFY_AI_LIMITS_COLLECTION = 'baify_ai_message_limits';

export function maxMessagesPerMinute() {
    const fromEnv = Number(process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_MIN);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
    return 4;
}

export function maxMessagesPerDay() {
    const fromEnv = Number(process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY);
    if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv);
    return 20;
}

export function caracasDateString(now = new Date()) {
    return now.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
}

export function buildDailyRateKey(uid, date = caracasDateString()) {
    return `baify-ai-daily:${uid}:${date}`;
}

function buildMinuteRateKey(uid, nowMs = Date.now()) {
    const bucket = Math.floor(nowMs / 1000 / WINDOW_SECONDS);
    return `baify-ai-rate:${uid}:${bucket}`;
}

function dailyLimitFirestoreDocId(uid, date) {
    return `daily_${uid}_${date}`;
}

function minuteLimitFirestoreDocId(uid, nowMs = Date.now()) {
    const bucket = Math.floor(nowMs / 1000 / WINDOW_SECONDS);
    return `min_${uid}_${bucket}`;
}

/** @returns {{ ok: false, status: number, error: string, code: string } | { ok: true }} */
export function dailyLimitExceededResult(dailyMax) {
    return {
        ok: false,
        status: 429,
        error:
            `Alcanzaste el límite diario de ${dailyMax} mensajes a BayFi AI. ` +
            'Vuelve mañana o pide al administrador que suba el cupo.',
        code: 'BAIFY_AI_DAILY_LIMIT',
    };
}

/** @returns {{ ok: false, status: number, error: string, code: string } | { ok: true }} */
export function minuteLimitExceededResult(minuteMax) {
    return {
        ok: false,
        status: 429,
        error: `Demasiados mensajes a BayFi AI. Espera ~1 minuto (máx. ${minuteMax} mensajes/min por usuario).`,
        code: 'BAIFY_AI_RATE_LIMIT',
    };
}

/**
 * Tras incrementar, valida cupo diario (permite exactamente dailyMax mensajes).
 * @param {number} count
 * @param {number} dailyMax
 */
export function evaluateDailyCountAfterIncrement(count, dailyMax) {
    if (count > dailyMax) return dailyLimitExceededResult(dailyMax);
    return { ok: true };
}

/**
 * @param {number} count
 * @param {number} minuteMax
 */
export function evaluateMinuteCountAfterIncrement(count, minuteMax) {
    if (count > minuteMax) return minuteLimitExceededResult(minuteMax);
    return { ok: true };
}

async function incrementDailyInFirestore(uid, date, dailyMax) {
    const docId = dailyLimitFirestoreDocId(uid, date);
    const ref = adminDb.collection(BAIFY_AI_LIMITS_COLLECTION).doc(docId);

    return adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const current = snap.exists ? Number(snap.data().count) || 0 : 0;
        if (current >= dailyMax) {
            return { count: current + 1, limited: true };
        }
        const next = current + 1;
        transaction.set(
            ref,
            {
                uid,
                kind: 'daily',
                date,
                count: next,
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        return { count: next, limited: false };
    });
}

async function incrementMinuteInFirestore(uid, minuteMax, nowMs) {
    const docId = minuteLimitFirestoreDocId(uid, nowMs);
    const ref = adminDb.collection(BAIFY_AI_LIMITS_COLLECTION).doc(docId);

    return adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const current = snap.exists ? Number(snap.data().count) || 0 : 0;
        if (current >= minuteMax) {
            return { count: current + 1, limited: true };
        }
        const next = current + 1;
        transaction.set(
            ref,
            {
                uid,
                kind: 'minute',
                bucket: Math.floor(nowMs / 1000 / WINDOW_SECONDS),
                count: next,
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        return { count: next, limited: false };
    });
}

async function incrementDaily(uid, date, dailyMax) {
    const redisKey = buildDailyRateKey(uid, date);
    const fromRedis = await statsCache.increment(redisKey, DAILY_WINDOW_SECONDS);
    if (fromRedis != null) {
        return { count: fromRedis, store: 'redis', redisKey };
    }

    const fromFirestore = await incrementDailyInFirestore(uid, date, dailyMax);
    return {
        count: fromFirestore.count,
        store: 'firestore',
        limitedInTransaction: fromFirestore.limited,
    };
}

async function incrementMinute(uid, minuteMax, nowMs) {
    const redisKey = buildMinuteRateKey(uid, nowMs);
    const fromRedis = await statsCache.increment(redisKey, WINDOW_SECONDS);
    if (fromRedis != null) {
        return { count: fromRedis, store: 'redis', redisKey };
    }

    const fromFirestore = await incrementMinuteInFirestore(uid, minuteMax, nowMs);
    return {
        count: fromFirestore.count,
        store: 'firestore',
        limitedInTransaction: fromFirestore.limited,
    };
}

async function rollbackDailyIncrement(uid, date, meta) {
    if (meta.store === 'redis' && meta.redisKey) {
        await statsCache.decrement(meta.redisKey);
        return;
    }
    if (meta.store !== 'firestore' || !meta.limitedInTransaction) {
        const docId = dailyLimitFirestoreDocId(uid, date);
        const ref = adminDb.collection(BAIFY_AI_LIMITS_COLLECTION).doc(docId);
        await adminDb.runTransaction(async (transaction) => {
            const snap = await transaction.get(ref);
            if (!snap.exists) return;
            const current = Number(snap.data().count) || 0;
            if (current <= 0) return;
            transaction.set(ref, { count: current - 1 }, { merge: true });
        });
    }
}

async function rollbackMinuteIncrement(uid, nowMs, meta) {
    if (meta.store === 'redis' && meta.redisKey) {
        await statsCache.decrement(meta.redisKey);
        return;
    }
    if (meta.store !== 'firestore' || !meta.limitedInTransaction) {
        const docId = minuteLimitFirestoreDocId(uid, nowMs);
        const ref = adminDb.collection(BAIFY_AI_LIMITS_COLLECTION).doc(docId);
        await adminDb.runTransaction(async (transaction) => {
            const snap = await transaction.get(ref);
            if (!snap.exists) return;
            const current = Number(snap.data().count) || 0;
            if (current <= 0) return;
            transaction.set(ref, { count: current - 1 }, { merge: true });
        });
    }
}

/**
 * Limita mensajes de chat por usuario Firebase (uid): cupo diario + ráfaga por minuto.
 * Default: 20 mensajes/día por usuario (BAIFY_AI_MAX_USER_MESSAGES_PER_DAY).
 * Usa Redis si está configurado; si no, Firestore (siempre aplica el límite).
 */
export async function assertBaifyAiRateLimit(uid) {
    if (!uid) {
        return {
            ok: false,
            status: 401,
            error: 'Usuario no autenticado',
            code: 'BAIFY_AI_AUTH',
        };
    }

    const dailyMax = maxMessagesPerDay();
    const minuteMax = maxMessagesPerMinute();
    const date = caracasDateString();
    const nowMs = Date.now();

    let dailyMeta;
    try {
        dailyMeta = await incrementDaily(uid, date, dailyMax);
    } catch (error) {
        console.error('[BaifyAi] rate limit daily increment failed:', error);
        return {
            ok: false,
            status: 503,
            error: 'No se pudo verificar el límite diario de BayFi AI. Intenta de nuevo.',
            code: 'BAIFY_AI_LIMIT_STORE',
        };
    }

    if (dailyMeta.limitedInTransaction || dailyMeta.count > dailyMax) {
        if (dailyMeta.store === 'redis' && dailyMeta.count > dailyMax) {
            await statsCache.decrement(dailyMeta.redisKey);
        }
        return dailyLimitExceededResult(dailyMax);
    }

    const dailyCheck = evaluateDailyCountAfterIncrement(dailyMeta.count, dailyMax);
    if (!dailyCheck.ok) {
        await rollbackDailyIncrement(uid, date, dailyMeta);
        return dailyCheck;
    }

    let minuteMeta;
    try {
        minuteMeta = await incrementMinute(uid, minuteMax, nowMs);
    } catch (error) {
        console.error('[BaifyAi] rate limit minute increment failed:', error);
        await rollbackDailyIncrement(uid, date, dailyMeta);
        return {
            ok: false,
            status: 503,
            error: 'No se pudo verificar el límite de ráfaga de BayFi AI. Intenta de nuevo.',
            code: 'BAIFY_AI_LIMIT_STORE',
        };
    }

    if (minuteMeta.limitedInTransaction || minuteMeta.count > minuteMax) {
        if (minuteMeta.store === 'redis' && minuteMeta.count > minuteMax) {
            await statsCache.decrement(minuteMeta.redisKey);
        }
        await rollbackDailyIncrement(uid, date, dailyMeta);
        return minuteLimitExceededResult(minuteMax);
    }

    const minuteCheck = evaluateMinuteCountAfterIncrement(minuteMeta.count, minuteMax);
    if (!minuteCheck.ok) {
        await rollbackMinuteIncrement(uid, nowMs, minuteMeta);
        await rollbackDailyIncrement(uid, date, dailyMeta);
        return minuteCheck;
    }

    if (!isStatsRedisConfigured()) {
        console.warn(
            '[BaifyAi] Upstash no configurado: límite diario aplicado vía Firestore ' +
                `(uid=${uid}, max=${dailyMax}/día).`
        );
    }

    return { ok: true, dailyRemaining: Math.max(0, dailyMax - dailyMeta.count) };
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
