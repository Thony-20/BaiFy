import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACCUMULATION_MODES,
    applyPointsDelta,
    calculateSalePoints,
    normalizeLoyaltyConfig,
    resolveClientLevel,
    validateBenefitRulePayload,
    validateLoyaltyConfigPayload,
} from '../utils/loyaltyPoints.js';
import {
    buildOpportunityItems,
    classifyClientOpportunities,
    OPPORTUNITY_SEGMENTS,
} from '../utils/clientOpportunities.js';

test('calcula puntos por monto gastado', () => {
    const points = calculateSalePoints({
        activo: true,
        modoAcumulacion: ACCUMULATION_MODES.POR_MONTO,
        puntosPorUnidad: 1,
        montoPorUnidad: 1,
    }, 45.75);
    assert.equal(points, 45);
});

test('calcula puntos fijos por venta', () => {
    const points = calculateSalePoints({
        activo: true,
        modoAcumulacion: ACCUMULATION_MODES.POR_VENTA,
        puntosPorVenta: 10,
    }, 999);
    assert.equal(points, 10);
});

test('no acredita si el programa está inactivo', () => {
    assert.equal(calculateSalePoints({ activo: false, puntosPorVenta: 10, modoAcumulacion: 'por_venta' }, 50), 0);
});

test('aplica delta de puntos sin permitir saldo negativo', () => {
    assert.deepEqual(applyPointsDelta(20, 5), {
        ok: true,
        error: null,
        saldo: 20,
        nextSaldo: 25,
        delta: 5,
    });
    assert.equal(applyPointsDelta(3, -10).ok, false);
});

test('resuelve nivel VIP y nuevo', () => {
    const config = normalizeLoyaltyConfig({ vipMinGastado: 500, vipMinCompras: 10 });
    assert.equal(resolveClientLevel({
        totalGastado: 600,
        comprasCount: 2,
        config,
        now: new Date('2026-08-24T12:00:00.000Z'),
    }), 'vip');
    assert.equal(resolveClientLevel({
        totalGastado: 20,
        comprasCount: 1,
        primeraCompraAt: '2026-08-20T12:00:00.000Z',
        config,
        now: new Date('2026-08-24T12:00:00.000Z'),
    }), 'nuevo');
});

test('valida configuración de riesgo', () => {
    const invalid = validateLoyaltyConfigPayload({ riesgoDiasMin: 40, riesgoDiasMax: 10 });
    assert.equal(invalid.ok, false);
    const valid = validateLoyaltyConfigPayload({ riesgoDiasMin: 15, riesgoDiasMax: 30 });
    assert.equal(valid.ok, true);
});

test('valida regla de beneficio', () => {
    const invalid = validateBenefitRulePayload({ nombre: '', condicionTipo: 'puntos_minimos' });
    assert.equal(invalid.ok, false);
    const valid = validateBenefitRulePayload({
        nombre: '15% a 500 pts',
        condicionTipo: 'puntos_minimos',
        puntosMinimos: 500,
        beneficioTipo: 'porcentaje',
        beneficioValor: 15,
    });
    assert.equal(valid.ok, true);
});

test('clasifica recompra, riesgo, vip y nuevo', () => {
    const now = new Date('2026-08-24T16:00:00.000Z');
    const config = {
        vipMinGastado: 500,
        vipMinCompras: 10,
        riesgoDiasMin: 15,
        riesgoDiasMax: 30,
    };

    const riskClient = {
        nombre: 'Riesgo',
        clienteId: '1',
        comprasCount: 4,
        totalGastado: 100,
        diasDesdeUltimaCompra: 20,
        ultimaCompraAt: '2026-08-04T12:00:00.000Z',
        frecuenciaCompraDias: null,
    };
    assert.ok(classifyClientOpportunities(riskClient, config, now).includes(OPPORTUNITY_SEGMENTS.RIESGO));

    const vipClient = {
        nombre: 'VIP',
        clienteId: '2',
        comprasCount: 12,
        totalGastado: 800,
        diasDesdeUltimaCompra: 2,
        ultimaCompraAt: '2026-08-22T12:00:00.000Z',
    };
    assert.ok(classifyClientOpportunities(vipClient, config, now).includes(OPPORTUNITY_SEGMENTS.VIP));

    const newClient = {
        nombre: 'Nuevo',
        clienteId: '3',
        comprasCount: 1,
        totalGastado: 30,
        primeraCompraAt: '2026-08-20T12:00:00.000Z',
        ultimaCompraAt: '2026-08-20T12:00:00.000Z',
        diasDesdeUltimaCompra: 4,
    };
    assert.ok(classifyClientOpportunities(newClient, config, now).includes(OPPORTUNITY_SEGMENTS.NUEVO));

    const repurchaseClient = {
        nombre: 'Recompra',
        clienteId: '4',
        comprasCount: 5,
        totalGastado: 200,
        frecuenciaCompraDias: 14,
        ultimaCompraAt: '2026-08-14T12:00:00.000Z',
        diasDesdeUltimaCompra: 10,
        productoMasComprado: { nombre: 'Café', cantidad: 3 },
    };
    assert.ok(classifyClientOpportunities(repurchaseClient, config, now).includes(OPPORTUNITY_SEGMENTS.RECOMPRA));

    const built = buildOpportunityItems([riskClient, vipClient, newClient, repurchaseClient], config, now);
    assert.equal(built.summary.riesgo, 1);
    assert.equal(built.summary.vip, 1);
    assert.equal(built.summary.nuevos, 1);
    assert.equal(built.summary.recompra, 1);
    assert.equal(built.summary.total, 4);
});
