import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../config/firebase.js';

/*
 * Cupo mensual de tokens de BayFi AI por EMPRESA según su plan.
 *
 * Se descuentan solo los tokens "reales": entrada NO cacheada + salida (incluye razonamiento).
 * Los tokens leídos del Context Caching de Gemini no cuentan.
 * El mes se cuenta en hora de Caracas y el cupo se renueva el día 1.
 * Documento: baify_ai_token_usage/{empresaId}_{YYYY-MM} → 1 lectura + 1 escritura por mensaje.
 */

const USAGE_COLLECTION = 'baify_ai_token_usage';
const TIME_ZONE = 'America/Caracas';

/** Planes con cupo. Los que no aparecen aquí no tienen límite de tokens (solo el de mensajes). */
export function planTokenLimits() {
    return {
        diamond: Number(process.env.BAIFY_AI_MONTHLY_TOKENS_DIAMOND) || 700_000,
    };
}

export function currentMonthKey(now = new Date()) {
    return now.toLocaleDateString('sv-SE', { timeZone: TIME_ZONE }).slice(0, 7);
}

function nextResetDate(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

const usageDocRef = (empresaId, monthKey) =>
    adminDb.collection(USAGE_COLLECTION).doc(`${empresaId}_${monthKey}`);

/** Tokens que se descuentan del cupo a partir del usage del AI SDK. */
export function billableTokens(totalUsage) {
    if (!totalUsage) return 0;
    const input = totalUsage.inputTokens ?? 0;
    const cached = totalUsage.inputTokenDetails?.cacheReadTokens ?? 0;
    const noCache = totalUsage.inputTokenDetails?.noCacheTokens ?? Math.max(0, input - cached);
    return Math.max(0, noCache) + (totalUsage.outputTokens ?? 0);
}

/**
 * @param {string} empresaId
 * @param {string} planId
 * @returns {Promise<{ limited: boolean, plan: string, month: string, resetsOn: string,
 *   limit: number|null, used: number, remaining: number|null, percent: number|null, exhausted: boolean }>}
 */
export async function getTokenBudgetStatus(empresaId, planId) {
    const plan = planId || 'free';
    const month = currentMonthKey();
    const limit = planTokenLimits()[plan] ?? null;
    const base = { plan, month, resetsOn: nextResetDate(month), limit };

    if (!limit) {
        return { ...base, limited: false, used: 0, remaining: null, percent: null, exhausted: false };
    }

    const snap = await usageDocRef(empresaId, month).get();
    const used = snap.exists ? Number(snap.data().tokens) || 0 : 0;
    return {
        ...base,
        limited: true,
        used,
        remaining: Math.max(0, limit - used),
        percent: Math.min(100, Math.round((used / limit) * 1000) / 10),
        exhausted: used >= limit,
    };
}

/** Suma el consumo de un mensaje (incremento atómico, seguro con varios usuarios a la vez). */
export async function recordTokenUsage(empresaId, tokens) {
    if (!empresaId || !(tokens > 0)) return;
    const month = currentMonthKey();
    await usageDocRef(empresaId, month).set(
        {
            empresaId,
            month,
            tokens: FieldValue.increment(Math.round(tokens)),
            requests: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}

export function tokenLimitExceededResult(status) {
    const limit = new Intl.NumberFormat('es-VE').format(status.limit);
    const [y, m, d] = status.resetsOn.split('-');
    return {
        ok: false,
        status: 429,
        error: `Tu empresa usó los ${limit} tokens mensuales de BayFi AI de tu plan. El cupo se renueva el ${d}/${m}/${y}.`,
        code: 'BAIFY_AI_TOKEN_LIMIT',
    };
}
