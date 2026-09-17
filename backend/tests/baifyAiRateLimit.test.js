import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDailyRateKey,
    caracasDateString,
    evaluateDailyCountAfterIncrement,
    evaluateMinuteCountAfterIncrement,
    maxMessagesPerDay,
    maxMessagesPerMinute,
} from '../utils/baifyAiRateLimit.js';

test('límite diario por defecto es 20 mensajes por uid', () => {
    const prev = process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY;
    delete process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY;
    assert.equal(maxMessagesPerDay(), 20);
    if (prev !== undefined) process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY = prev;
});

test('BAIFY_AI_MAX_USER_MESSAGES_PER_DAY sobreescribe el default', () => {
    const prev = process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY;
    process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY = '50';
    assert.equal(maxMessagesPerDay(), 50);
    if (prev !== undefined) process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY = prev;
    else delete process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_DAY;
});

test('clave diaria incluye uid y fecha (zona Caracas)', () => {
    const date = caracasDateString(new Date('2026-09-17T15:00:00.000Z'));
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(buildDailyRateKey('user-abc', date), `baify-ai-daily:user-abc:${date}`);
});

test('permite exactamente dailyMax mensajes y bloquea el siguiente', () => {
    const dailyMax = 20;
    assert.deepEqual(evaluateDailyCountAfterIncrement(19, dailyMax), { ok: true });
    assert.deepEqual(evaluateDailyCountAfterIncrement(20, dailyMax), { ok: true });
    const blocked = evaluateDailyCountAfterIncrement(21, dailyMax);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'BAIFY_AI_DAILY_LIMIT');
});

test('límite por minuto default y evaluación', () => {
    const prev = process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_MIN;
    delete process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_MIN;
    assert.equal(maxMessagesPerMinute(), 4);
    const blocked = evaluateMinuteCountAfterIncrement(5, 4);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'BAIFY_AI_RATE_LIMIT');
    if (prev !== undefined) process.env.BAIFY_AI_MAX_USER_MESSAGES_PER_MIN = prev;
});
