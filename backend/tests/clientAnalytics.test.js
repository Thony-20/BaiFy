import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACTIVE_CLIENT_DAYS,
    aggregateClientSales,
    buildMonthlySpendingFromPurchases,
    calculatePurchaseFrequencyDays,
    getClientStatus,
    getSaleCedula,
    mergeClientMetrics,
} from '../utils/clientAnalytics.js';

test('devuelve métricas vacías e inactivo sin compras', () => {
    const metrics = aggregateClientSales([], new Date('2026-08-23T12:00:00.000Z'));

    assert.equal(metrics.totalGastado, 0);
    assert.equal(metrics.comprasCount, 0);
    assert.equal(metrics.primeraCompraAt, null);
    assert.equal(metrics.ultimaCompraAt, null);
    assert.equal(metrics.diasDesdeUltimaCompra, null);
    assert.equal(metrics.frecuenciaCompraDias, null);
    assert.equal(metrics.estado, 'inactivo');
    assert.deepEqual(metrics.topProducts, []);
    assert.deepEqual(metrics.paymentMethods, []);
});

test('agrega importes, fechas, productos y métodos de pago', () => {
    const sales = [
        {
            total: 20,
            fechaVenta: new Date('2026-06-01T12:00:00.000Z'),
            items: [
                { productId: 'p1', nombre: 'Café', cantidad: 2, subtotal: 12 },
                { productId: 'p2', nombre: 'Pan', cantidad: 1, subtotal: 8 },
            ],
            metodosPago: [{ method: 'Efectivo USD', amount: 20 }],
        },
        {
            total: 30,
            fechaVenta: new Date('2026-06-11T12:00:00.000Z'),
            items: [
                { productId: 'p1', nombre: 'Café', cantidad: 3, subtotal: 18 },
                { productId: 'p3', nombre: 'Leche', cantidad: 2, subtotal: 12 },
            ],
            metodosPago: [{ method: 'Efectivo USD', amount: 20 }, { method: 'Tarjeta', amount: 10 }],
        },
    ];

    const metrics = aggregateClientSales(sales, new Date('2026-08-23T12:00:00.000Z'));

    assert.equal(metrics.totalGastado, 50);
    assert.equal(metrics.gastoPromedioMensual, 16.67);
    assert.equal(metrics.comprasCount, 2);
    assert.equal(metrics.unidadesCompradas, 8);
    assert.equal(metrics.ticketPromedio, 25);
    assert.equal(metrics.frecuenciaCompraDias, 10);
    assert.equal(metrics.diasDesdeUltimaCompra, 73);
    assert.equal(metrics.estado, 'inactivo');
    assert.equal(metrics.topProducts[0].nombre, 'Café');
    assert.equal(metrics.topProducts[0].cantidad, 5);
    assert.equal(metrics.topProducts[0].monto, 30);
    assert.equal(metrics.metodoPagoFavorito, 'Efectivo USD');
    assert.deepEqual(metrics.gastoMensual, [{ month: '2026-06', total: 50 }]);
});

test('omite fechas e importes desconocidos sin inventarlos', () => {
    const metrics = aggregateClientSales([
        {
            total: 'no disponible',
            items: [{ productId: 'p1', nombre: 'Producto', cantidad: 2 }],
            metodosPago: [{ method: 'Transferencia' }],
        },
    ], new Date('2026-08-23T12:00:00.000Z'));

    assert.equal(metrics.totalGastado, 0);
    assert.equal(metrics.unidadesCompradas, 2);
    assert.equal(metrics.topProducts[0].monto, 0);
    assert.equal(metrics.primeraCompraAt, null);
    assert.equal(metrics.metodoPagoFavorito, 'Transferencia');
});

test('calcula estados con el límite inclusivo de 30 días', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');

    assert.equal(getClientStatus(null, now), 'inactivo');
    assert.equal(getClientStatus('2026-07-24T12:00:00.000Z', now), 'activo');
    assert.equal(getClientStatus('2026-07-23T12:00:00.000Z', now), 'inactivo');
    assert.equal(ACTIVE_CLIENT_DAYS, 30);
});

test('combina métricas de ventas con fechas guardadas en el cliente', () => {
    const now = new Date('2026-08-23T12:00:00.000Z');
    const metrics = mergeClientMetrics(
        aggregateClientSales([], now),
        { ultimaCompraAt: '2026-08-22T12:00:00.000Z', primeraCompraAt: '2026-08-22T12:00:00.000Z' },
        now
    );

    assert.equal(metrics.comprasCount, 0);
    assert.equal(metrics.ultimaCompraAt, '2026-08-22T12:00:00.000Z');
    assert.equal(metrics.diasDesdeUltimaCompra, 1);
    assert.equal(metrics.estado, 'activo');
    assert.equal(ACTIVE_CLIENT_DAYS, 30);
});

test('agrupa gasto mensual usando calendario de Venezuela', () => {
    const monthlySpending = buildMonthlySpendingFromPurchases([
        { total: 10, fechaVenta: '2026-08-01T03:00:00.000Z' },
        { total: 20, fechaVenta: '2026-08-01T03:30:00.000Z' },
    ]);

    assert.deepEqual(monthlySpending, [{ month: '2026-07', total: 30 }]);
});

test('construye gasto mensual desde compras serializadas', () => {
    const monthlySpending = buildMonthlySpendingFromPurchases([
        { total: 25, fechaVenta: '2026-08-22T12:00:00.000Z' },
        { total: 15, fechaVenta: '2026-08-23T12:00:00.000Z' },
        { total: 40, fechaVenta: '2026-07-10T12:00:00.000Z' },
    ]);

    assert.deepEqual(monthlySpending, [
        { month: '2026-07', total: 40 },
        { month: '2026-08', total: 40 },
    ]);
});

test('calcula frecuencia usando días calendario entre visitas únicas', () => {
    const frequency = calculatePurchaseFrequencyDays([
        new Date('2026-06-01T22:00:00.000Z'),
        new Date('2026-06-02T01:00:00.000Z'),
        new Date('2026-06-11T15:00:00.000Z'),
    ]);

    assert.equal(frequency, 10);
});

test('ignora compras repetidas del mismo día al calcular frecuencia', () => {
    const sameDay = new Date('2026-08-20T10:00:00.000Z');
    const frequency = calculatePurchaseFrequencyDays([
        sameDay,
        new Date('2026-08-20T18:00:00.000Z'),
        new Date('2026-08-30T12:00:00.000Z'),
    ]);

    assert.equal(frequency, 10);
});

test('no calcula frecuencia con compras solo en un día', () => {
    const frequency = calculatePurchaseFrequencyDays([
        new Date('2026-08-20T10:00:00.000Z'),
        new Date('2026-08-20T18:00:00.000Z'),
    ]);

    assert.equal(frequency, null);
});

test('prioriza clienteCedula y normaliza sus dígitos', () => {
    assert.equal(getSaleCedula({
        clienteCedula: 'V-12.345.678',
        cliente: { cedula: '99999' },
    }), '12345678');
});
