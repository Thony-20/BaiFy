import { createHash } from 'node:crypto';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { buildBaifyAiStaticPrompt, buildBaifyAiSystemPrompt } from '../utils/baifyAiPrompt.js';
import { getBusinessSnapshot, resolveBaifyAiTenant } from '../utils/baifyAiCache.js';
import { createBaifyAiTools } from '../utils/baifyAiTools.js';
import { assertBaifyAiRateLimit, mapGeminiClientError } from '../utils/baifyAiRateLimit.js';
import { baifyAiCachingFetch } from '../utils/baifyAiContextCache.js';
import {
    billableTokens,
    getTokenBudgetStatus,
    recordTokenUsage,
    tokenLimitExceededResult,
} from '../utils/baifyAiTokenBudget.js';
import {
    getCachedResponse,
    responseCacheKey,
    sendCachedResponse,
    storeCachedResponse,
} from '../utils/baifyAiResponseCache.js';

const MAX_MESSAGES = 200;
const MAX_STEPS = 3;
/** Mensajes de la conversación que se reenvían a Gemini (el resto solo vive en el navegador). */
const MAX_HISTORY = Math.max(2, Number(process.env.BAIFY_AI_MAX_HISTORY) || 10);
/** Cuentas nuevas en Google AI: 2.5-flash ya no está; usar 3.6-flash. */
const DEFAULT_MODEL = 'gemini-3.6-flash';

// Provider con Context Caching explícito (ver utils/baifyAiContextCache.js).
const google = createGoogleGenerativeAI({ fetch: baifyAiCachingFetch });

function normalizeMessages(rawMessages) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
        return { error: 'messages debe ser un arreglo no vacío' };
    }
    if (rawMessages.length > MAX_MESSAGES) {
        return { error: `Máximo ${MAX_MESSAGES} mensajes por solicitud` };
    }
    return { messages: rawMessages };
}

/**
 * Recorta el historial para ahorrar tokens: últimos MAX_HISTORY mensajes, empezando por uno
 * del usuario, y sin los resultados de tools de turnos anteriores (el texto final ya los resume).
 */
function trimHistory(messages) {
    let recent = messages.slice(-MAX_HISTORY);
    const firstUser = recent.findIndex((m) => m.role === 'user');
    recent = firstUser > 0 ? recent.slice(firstUser) : recent;

    return recent
        .map((message, index) => {
            const isLast = index === recent.length - 1;
            if (isLast || message.role !== 'assistant' || !Array.isArray(message.parts)) return message;
            return { ...message, parts: message.parts.filter((part) => part.type === 'text') };
        })
        .filter((message) => !Array.isArray(message.parts) || message.parts.length > 0);
}

function logUsage({ uid, empresaId, totalUsage, steps, responseCache }) {
    const input = totalUsage?.inputTokens ?? 0;
    const cached = totalUsage?.inputTokenDetails?.cacheReadTokens ?? 0;
    const output = totalUsage?.outputTokens ?? 0;
    const tools = (steps || []).flatMap((s) => s.toolCalls || []).map((c) => c.toolName);
    console.log(
        `[BaifyAi] uid=${uid} empresa=${empresaId} tokens entrada=${input} (cache=${cached}, ` +
        `${input ? Math.round((cached / input) * 100) : 0}%) salida=${output} pasos=${steps?.length ?? 0}` +
        `${tools.length ? ` tools=${tools.join(',')}` : ''}${responseCache ? ` respCache=${responseCache}` : ''}`
    );
}

export const chatWithBaifyAi = async (req, res) => {
    try {
        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            return res.status(503).json({
                error: 'BayFi AI no está configurado. Falta GOOGLE_GENERATIVE_AI_API_KEY.',
            });
        }

        const uid = req.user?.uid;
        if (!uid) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const rate = await assertBaifyAiRateLimit(uid);
        if (!rate.ok) {
            return res.status(rate.status).json({
                error: rate.error,
                code: rate.code,
            });
        }

        const tenant = await resolveBaifyAiTenant(uid);
        if (tenant.error) {
            return res.status(tenant.status).json({ error: tenant.error });
        }

        // Cupo mensual de tokens por empresa (solo planes con límite, p. ej. Diamante).
        const budget = await getTokenBudgetStatus(tenant.tenantId, tenant.planId);
        if (budget.exhausted) {
            const exceeded = tokenLimitExceededResult(budget);
            return res.status(exceeded.status).json({ error: exceeded.error, code: exceeded.code, usage: budget });
        }

        const { snapshot } = await getBusinessSnapshot(tenant.tenantId);

        const { messages: rawMessages } = req.body || {};
        const normalized = normalizeMessages(rawMessages);
        if (normalized.error) {
            return res.status(400).json({ error: normalized.error });
        }

        const modelId = process.env.GEMINI_MODEL || DEFAULT_MODEL;
        const toolsEnabled = process.env.BAIFY_AI_ENABLE_TOOLS !== '0';
        const freeTier = process.env.BAIFY_AI_FREE_TIER !== '0';
        const maxToolCalls = Number(process.env.BAIFY_AI_MAX_TOOL_CALLS);
        const promptOptions = {
            toolsEnabled,
            freeTier,
            maxToolCalls:
                Number.isFinite(maxToolCalls) && maxToolCalls > 0
                    ? Math.min(4, maxToolCalls)
                    : freeTier
                      ? 2
                      : 4,
        };

        // Primera pregunta repetida → respuesta cacheada de ESTA empresa, 0 tokens.
        const promptVersion = createHash('sha256')
            .update(`${modelId}\n${buildBaifyAiStaticPrompt(promptOptions)}`)
            .digest('hex')
            .slice(0, 12);
        const cacheKey = responseCacheKey({
            empresaId: tenant.tenantId,
            messages: normalized.messages,
            snapshotVersion: snapshot?.generatedAt,
            promptVersion,
        });
        const cachedAnswer = await getCachedResponse(cacheKey);
        if (cachedAnswer) {
            logUsage({ uid, empresaId: tenant.tenantId, responseCache: 'HIT' });
            return sendCachedResponse(res, cachedAnswer.text);
        }

        const system = buildBaifyAiSystemPrompt({
            tenantId: tenant.tenantId,
            businessName: tenant.businessName,
            currencyLabel: tenant.currencyLabel,
            businessSnapshot: snapshot,
            ...promptOptions,
        });

        const modelMessages = await convertToModelMessages(trimHistory(normalized.messages));

        const tools = toolsEnabled
            ? createBaifyAiTools({
                  tenantId: tenant.tenantId,
                  businessName: tenant.businessName,
                  lowStockThreshold: tenant.lowStockThreshold,
                  currencyLabel: tenant.currencyLabel,
              })
            : undefined;

        const result = streamText({
            model: google(modelId),
            system,
            messages: modelMessages,
            ...(toolsEnabled
                ? {
                      tools,
                      stopWhen: stepCountIs(MAX_STEPS),
                      // El último paso no puede llamar tools: así siempre termina con texto
                      // (antes, si el modelo reintentaba una tool, la respuesta quedaba vacía).
                      prepareStep: ({ stepNumber }) =>
                          stepNumber >= MAX_STEPS - 1 ? { toolChoice: 'none' } : undefined,
                  }
                : {}),
            onFinish: async ({ steps, totalUsage, finishReason }) => {
                if (budget.limited) {
                    await recordTokenUsage(tenant.tenantId, billableTokens(totalUsage)).catch((error) => {
                        console.error('[BaifyAi] No se pudo registrar el consumo de tokens:', error.message);
                    });
                }
                logUsage({
                    uid,
                    empresaId: tenant.tenantId,
                    totalUsage,
                    steps,
                    responseCache: cacheKey ? 'MISS' : null,
                });
                if (!cacheKey || finishReason !== 'stop') return;
                // Mismo texto que muestra el chat: todos los pasos unidos.
                const text = steps.map((s) => s.text?.trim()).filter(Boolean).join('\n\n');
                const usedTools = steps.some((s) => (s.toolCalls || []).length > 0);
                await storeCachedResponse(cacheKey, { text, usedTools }).catch((error) => {
                    console.warn('[BaifyAi] No se pudo guardar la respuesta en caché:', error.message);
                });
            },
        });

        result.pipeUIMessageStreamToResponse(res, {
            onError: (streamError) => {
                console.error('Error en stream de BaiFy AI:', streamError);
                const mapped = mapGeminiClientError(streamError);
                return mapped?.error || 'BayFi AI no pudo terminar la respuesta. Intenta de nuevo.';
            },
        });
    } catch (error) {
        console.error('Error en BaiFy AI chat:', error);

        if (res.headersSent) {
            return;
        }

        const mapped = mapGeminiClientError(error);
        if (mapped) {
            if (mapped.retryAfterSeconds) {
                res.setHeader('Retry-After', String(mapped.retryAfterSeconds));
            }
            return res.status(mapped.status).json({
                error: mapped.error,
                code: mapped.code,
                retryAfterSeconds: mapped.retryAfterSeconds,
            });
        }

        return res.status(500).json({
            error: 'Error al procesar el chat con BayFi AI',
            details: error.message,
        });
    }
};

/** GET /api/chat/usage — cupo mensual de tokens de la empresa del usuario autenticado. */
export const getBaifyAiUsage = async (req, res) => {
    try {
        const uid = req.user?.uid;
        if (!uid) return res.status(401).json({ error: 'Usuario no autenticado' });

        const tenant = await resolveBaifyAiTenant(uid);
        if (tenant.error) return res.status(tenant.status).json({ error: tenant.error });

        return res.status(200).json(await getTokenBudgetStatus(tenant.tenantId, tenant.planId));
    } catch (error) {
        console.error('Error obteniendo uso de BaiFy AI:', error);
        return res.status(500).json({ error: 'No se pudo obtener el uso de BayFi AI' });
    }
};
