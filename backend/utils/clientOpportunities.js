import { CLIENT_TIME_ZONE, toDate } from './clientAnalytics.js';
import { DEFAULT_LOYALTY_CONFIG, normalizeLoyaltyConfig } from './loyaltyPoints.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const OPPORTUNITY_SEGMENTS = {
    RECOMPRA: 'recompra',
    RIESGO: 'riesgo',
    VIP: 'vip',
    NUEVO: 'nuevo',
};

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CLIENT_TIME_ZONE,
    weekday: 'short',
});

const calendarDayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLIENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const addCalendarDays = (isoDay, days) => {
    const date = new Date(`${isoDay}T12:00:00-04:00`);
    date.setTime(date.getTime() + days * DAY_MS);
    return calendarDayFormatter.format(date);
};

const daysBetween = (fromDate, untilDate) => {
    const from = toDate(fromDate);
    const until = toDate(untilDate);
    if (!from || !until) return null;
    return Math.max(0, Math.floor((until - from) / DAY_MS));
};

const buildOpportunityMessage = (segment, client) => {
    const top = client.productoMasComprado || client.topProducts?.[0] || null;
    const productName = top?.nombre || 'productos';
    const times = Math.round(Number(top?.cantidad) || 0);
    const days = client.diasDesdeUltimaCompra;

    switch (segment) {
        case OPPORTUNITY_SEGMENTS.RECOMPRA:
            return times > 0
                ? `Compró ${productName} ${times} ${times === 1 ? 'vez' : 'veces'}. Última compra: hace ${days ?? '—'} días.`
                : `Su intervalo habitual de compra se cumple esta semana. Última compra: hace ${days ?? '—'} días.`;
        case OPPORTUNITY_SEGMENTS.RIESGO:
            return `Cliente habitual sin compras desde hace ${days ?? '—'} días.`;
        case OPPORTUNITY_SEGMENTS.VIP:
            return `Supera el umbral VIP con ${Number(client.comprasCount) || 0} compras y $${Number(client.totalGastado || 0).toFixed(2)} gastados.`;
        case OPPORTUNITY_SEGMENTS.NUEVO:
            return `Primera compra en los últimos 7 días.`;
        default: {
            const _exhaustive = segment;
            return String(_exhaustive || 'Oportunidad detectada');
        }
    }
};

const isRepurchaseThisWeek = (client, now) => {
    const frequency = Number(client.frecuenciaCompraDias);
    const lastPurchase = toDate(client.ultimaCompraAt);
    if (!lastPurchase || !Number.isFinite(frequency) || frequency < 3) return false;

    const expectedNext = new Date(lastPurchase.getTime() + frequency * DAY_MS);
    const todayKey = calendarDayFormatter.format(now);
    const weekEndKey = addCalendarDays(todayKey, 7);
    const expectedKey = calendarDayFormatter.format(expectedNext);
    return expectedKey >= todayKey && expectedKey <= weekEndKey;
};

/**
 * Clasifica un cliente enriquecido (analytics) en segmentos de oportunidad.
 * Un cliente puede aparecer en varios segmentos.
 */
export const classifyClientOpportunities = (client, configInput = {}, now = new Date()) => {
    const config = normalizeLoyaltyConfig({ ...DEFAULT_LOYALTY_CONFIG, ...configInput });
    const current = toDate(now) || new Date();
    const segments = [];

    const daysSinceLast = client.diasDesdeUltimaCompra != null
        ? Number(client.diasDesdeUltimaCompra)
        : daysBetween(client.ultimaCompraAt, current);
    const comprasCount = Number(client.comprasCount) || 0;
    const totalGastado = Number(client.totalGastado) || 0;
    const daysSinceFirst = daysBetween(client.primeraCompraAt, current);

    if (isRepurchaseThisWeek({ ...client, diasDesdeUltimaCompra: daysSinceLast }, current)) {
        segments.push(OPPORTUNITY_SEGMENTS.RECOMPRA);
    }

    if (
        comprasCount >= 2
        && daysSinceLast != null
        && daysSinceLast >= config.riesgoDiasMin
        && daysSinceLast <= config.riesgoDiasMax
    ) {
        segments.push(OPPORTUNITY_SEGMENTS.RIESGO);
    }

    if (totalGastado >= config.vipMinGastado || comprasCount >= config.vipMinCompras) {
        segments.push(OPPORTUNITY_SEGMENTS.VIP);
    }

    if (daysSinceFirst != null && daysSinceFirst <= 7 && comprasCount >= 1) {
        segments.push(OPPORTUNITY_SEGMENTS.NUEVO);
    }

    return segments;
};

export const buildOpportunityItems = (clients = [], configInput = {}, now = new Date()) => {
    const config = normalizeLoyaltyConfig({ ...DEFAULT_LOYALTY_CONFIG, ...configInput });
    const current = toDate(now) || new Date();
    const items = [];

    (Array.isArray(clients) ? clients : []).forEach((client) => {
        const segments = classifyClientOpportunities(client, config, current);
        segments.forEach((segmento) => {
            const top = client.productoMasComprado || client.topProducts?.[0] || null;
            items.push({
                segmento,
                clienteDocId: client.id || null,
                clienteId: client.clienteId || null,
                nombre: client.nombre || 'Cliente',
                telefono: client.telefono || '',
                productoTop: top?.nombre || null,
                vecesProducto: top ? Math.round(Number(top.cantidad) || 0) : 0,
                diasDesdeUltimaCompra: client.diasDesdeUltimaCompra ?? null,
                totalGastado: Number(client.totalGastado) || 0,
                comprasCount: Number(client.comprasCount) || 0,
                frecuenciaCompraDias: client.frecuenciaCompraDias ?? null,
                mensaje: buildOpportunityMessage(segmento, client),
            });
        });
    });

    const order = {
        [OPPORTUNITY_SEGMENTS.RIESGO]: 0,
        [OPPORTUNITY_SEGMENTS.RECOMPRA]: 1,
        [OPPORTUNITY_SEGMENTS.NUEVO]: 2,
        [OPPORTUNITY_SEGMENTS.VIP]: 3,
    };

    items.sort((left, right) => {
        const segmentDiff = (order[left.segmento] ?? 99) - (order[right.segmento] ?? 99);
        if (segmentDiff !== 0) return segmentDiff;
        return String(left.nombre).localeCompare(String(right.nombre), 'es', { sensitivity: 'base' });
    });

    const summary = {
        recompra: 0,
        riesgo: 0,
        vip: 0,
        nuevos: 0,
        total: items.length,
    };

    items.forEach((item) => {
        if (item.segmento === OPPORTUNITY_SEGMENTS.RECOMPRA) summary.recompra += 1;
        if (item.segmento === OPPORTUNITY_SEGMENTS.RIESGO) summary.riesgo += 1;
        if (item.segmento === OPPORTUNITY_SEGMENTS.VIP) summary.vip += 1;
        if (item.segmento === OPPORTUNITY_SEGMENTS.NUEVO) summary.nuevos += 1;
    });

    return { summary, items, weekdayHint: weekdayFormatter.format(current) };
};
