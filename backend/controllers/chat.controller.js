import { google } from '@ai-sdk/google';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { buildBaifyAiSystemPrompt } from '../utils/baifyAiPrompt.js';
import { getBusinessSnapshot, resolveBaifyAiTenant } from '../utils/baifyAiCache.js';
import { createBaifyAiTools } from '../utils/baifyAiTools.js';
import { assertBaifyAiRateLimit, mapGeminiClientError } from '../utils/baifyAiRateLimit.js';

const MAX_MESSAGES = 40;
/** Cuentas nuevas en Google AI: 2.5-flash ya no está; usar 3.6-flash. */
const DEFAULT_MODEL = 'gemini-3.6-flash';

function normalizeMessages(rawMessages) {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
        return { error: 'messages debe ser un arreglo no vacío' };
    }
    if (rawMessages.length > MAX_MESSAGES) {
        return { error: `Máximo ${MAX_MESSAGES} mensajes por solicitud` };
    }
    return { messages: rawMessages };
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
        const system = buildBaifyAiSystemPrompt({
            tenantId: tenant.tenantId,
            businessName: tenant.businessName,
            currencyLabel: tenant.currencyLabel,
            businessSnapshot: snapshot,
            toolsEnabled,
            freeTier,
            maxToolCalls:
                Number.isFinite(maxToolCalls) && maxToolCalls > 0
                    ? Math.min(4, maxToolCalls)
                    : freeTier
                      ? 2
                      : 4,
        });

        const modelMessages = await convertToModelMessages(normalized.messages);

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
                      stopWhen: stepCountIs(3),
                      onStepFinish: ({ toolCalls }) => {
                          if (process.env.BAIFY_AI_DEBUG !== '1' || !toolCalls?.length) return;
                          console.log(
                              `[BaifyAi] uid=${uid} empresa=${tenant.tenantId} tools:`,
                              toolCalls.map((call) => call.toolName).join(', ')
                          );
                      },
                  }
                : {}),
        });

        result.pipeUIMessageStreamToResponse(res);
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
