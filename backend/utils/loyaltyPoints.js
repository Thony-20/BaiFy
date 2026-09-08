export const LOYALTY_LEVELS = {
    NUEVO: 'nuevo',
    REGULAR: 'regular',
    VIP: 'vip',
};

export const POINTS_MOVEMENT_TYPES = {
    VENTA: 'venta',
    CANJE: 'canje',
    AJUSTE: 'ajuste',
    BENEFICIO: 'beneficio',
    VENCIMIENTO: 'vencimiento',
    REVERSA_VENTA: 'reversa_venta',
};

export const ACCUMULATION_MODES = {
    POR_MONTO: 'por_monto',
    POR_VENTA: 'por_venta',
};

export const DEFAULT_LOYALTY_CONFIG = {
    activo: false,
    modoAcumulacion: ACCUMULATION_MODES.POR_MONTO,
    puntosPorUnidad: 1,
    montoPorUnidad: 1,
    puntosPorVenta: 10,
    puntosCanje: 100,
    valorCanjeUsd: 1,
    vencimientoActivo: false,
    vencimientoDias: 365,
    vipMinGastado: 500,
    vipMinCompras: 10,
    riesgoDiasMin: 15,
    riesgoDiasMax: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toFiniteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

export const normalizeLoyaltyConfig = (raw = {}) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const modo = String(source.modoAcumulacion || DEFAULT_LOYALTY_CONFIG.modoAcumulacion);
    const modoAcumulacion = Object.values(ACCUMULATION_MODES).includes(modo)
        ? modo
        : ACCUMULATION_MODES.POR_MONTO;

    return {
        activo: Boolean(source.activo ?? DEFAULT_LOYALTY_CONFIG.activo),
        modoAcumulacion,
        puntosPorUnidad: Math.max(0, toFiniteNumber(source.puntosPorUnidad, DEFAULT_LOYALTY_CONFIG.puntosPorUnidad)),
        montoPorUnidad: Math.max(0.01, toFiniteNumber(source.montoPorUnidad, DEFAULT_LOYALTY_CONFIG.montoPorUnidad)),
        puntosPorVenta: Math.max(0, Math.floor(toFiniteNumber(source.puntosPorVenta, DEFAULT_LOYALTY_CONFIG.puntosPorVenta))),
        puntosCanje: Math.max(1, Math.floor(toFiniteNumber(source.puntosCanje, DEFAULT_LOYALTY_CONFIG.puntosCanje))),
        valorCanjeUsd: Math.max(0.01, toFiniteNumber(source.valorCanjeUsd, DEFAULT_LOYALTY_CONFIG.valorCanjeUsd)),
        vencimientoActivo: Boolean(source.vencimientoActivo ?? DEFAULT_LOYALTY_CONFIG.vencimientoActivo),
        vencimientoDias: Math.max(1, Math.floor(toFiniteNumber(source.vencimientoDias, DEFAULT_LOYALTY_CONFIG.vencimientoDias))),
        vipMinGastado: Math.max(0, toFiniteNumber(source.vipMinGastado, DEFAULT_LOYALTY_CONFIG.vipMinGastado)),
        vipMinCompras: Math.max(0, Math.floor(toFiniteNumber(source.vipMinCompras, DEFAULT_LOYALTY_CONFIG.vipMinCompras))),
        riesgoDiasMin: Math.max(1, Math.floor(toFiniteNumber(source.riesgoDiasMin, DEFAULT_LOYALTY_CONFIG.riesgoDiasMin))),
        riesgoDiasMax: Math.max(1, Math.floor(toFiniteNumber(source.riesgoDiasMax, DEFAULT_LOYALTY_CONFIG.riesgoDiasMax))),
    };
};

export const validateLoyaltyConfigPayload = (raw = {}) => {
    const config = normalizeLoyaltyConfig(raw);
    if (config.riesgoDiasMin > config.riesgoDiasMax) {
        return { ok: false, error: 'riesgoDiasMin no puede ser mayor que riesgoDiasMax', config: null };
    }
    return { ok: true, error: null, config };
};

export const calculateSalePoints = (configInput, totalUsd) => {
    const config = normalizeLoyaltyConfig(configInput);
    if (!config.activo) return 0;

    if (config.modoAcumulacion === ACCUMULATION_MODES.POR_VENTA) {
        return config.puntosPorVenta;
    }

    const total = toFiniteNumber(totalUsd, 0);
    if (total <= 0 || config.montoPorUnidad <= 0) return 0;
    return Math.floor(total / config.montoPorUnidad) * config.puntosPorUnidad;
};

export const computePointsExpirationDate = (configInput, fromDate = new Date()) => {
    const config = normalizeLoyaltyConfig(configInput);
    if (!config.vencimientoActivo) return null;
    const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
    if (Number.isNaN(base.getTime())) return null;
    return new Date(base.getTime() + config.vencimientoDias * DAY_MS);
};

export const resolveClientLevel = ({
    totalGastado = 0,
    comprasCount = 0,
    primeraCompraAt = null,
    config: configInput = {},
    now = new Date(),
} = {}) => {
    const config = normalizeLoyaltyConfig(configInput);
    const spend = toFiniteNumber(totalGastado, 0);
    const purchases = Math.floor(toFiniteNumber(comprasCount, 0));

    if (spend >= config.vipMinGastado || purchases >= config.vipMinCompras) {
        return LOYALTY_LEVELS.VIP;
    }

    const firstPurchase = primeraCompraAt ? new Date(primeraCompraAt) : null;
    if (firstPurchase && !Number.isNaN(firstPurchase.getTime())) {
        const daysSinceFirst = Math.floor((now - firstPurchase) / DAY_MS);
        if (daysSinceFirst <= 7) return LOYALTY_LEVELS.NUEVO;
    }

    if (purchases === 0) return LOYALTY_LEVELS.NUEVO;
    return LOYALTY_LEVELS.REGULAR;
};

export const applyPointsDelta = (currentSaldo, delta) => {
    const saldo = Math.max(0, Math.floor(toFiniteNumber(currentSaldo, 0)));
    const change = Math.floor(toFiniteNumber(delta, 0));
    const next = saldo + change;
    if (next < 0) {
        return { ok: false, error: 'El saldo de puntos no puede quedar negativo', saldo, nextSaldo: saldo };
    }
    return { ok: true, error: null, saldo, nextSaldo: next, delta: change };
};

export const BENEFIT_CONDITION_TYPES = {
    PUNTOS_MINIMOS: 'puntos_minimos',
    SEGMENTO: 'segmento',
    SEGMENTO_Y_DIA: 'segmento_y_dia',
};

export const BENEFIT_TYPES = {
    PORCENTAJE: 'porcentaje',
    MONTO_FIJO: 'monto_fijo',
    MULTIPLICADOR_PUNTOS: 'multiplicador_puntos',
    NXM: 'nxm',
};

export const BENEFIT_SEGMENTS = {
    TODOS: 'todos',
    NUEVO: 'nuevo',
    REGULAR: 'regular',
    VIP: 'vip',
};

export const BENEFIT_USAGE = {
    SIGUIENTE_COMPRA: 'siguiente_compra',
    SIEMPRE: 'siempre_que_cumpla',
};

export const normalizeBenefitRule = (raw = {}) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const condicionTipo = Object.values(BENEFIT_CONDITION_TYPES).includes(source.condicionTipo)
        ? source.condicionTipo
        : BENEFIT_CONDITION_TYPES.PUNTOS_MINIMOS;
    const beneficioTipo = Object.values(BENEFIT_TYPES).includes(source.beneficioTipo)
        ? source.beneficioTipo
        : BENEFIT_TYPES.PORCENTAJE;
    const segmento = Object.values(BENEFIT_SEGMENTS).includes(source.segmento)
        ? source.segmento
        : BENEFIT_SEGMENTS.TODOS;
    const uso = Object.values(BENEFIT_USAGE).includes(source.uso)
        ? source.uso
        : BENEFIT_USAGE.SIEMPRE;

    const diasSemana = Array.isArray(source.diasSemana)
        ? source.diasSemana
            .map((day) => Math.floor(Number(day)))
            .filter((day) => day >= 0 && day <= 6)
        : null;

    return {
        nombre: String(source.nombre || '').trim(),
        activa: source.activa !== false,
        prioridad: Math.floor(toFiniteNumber(source.prioridad, 0)),
        condicionTipo,
        puntosMinimos: source.puntosMinimos == null
            ? null
            : Math.max(0, Math.floor(toFiniteNumber(source.puntosMinimos, 0))),
        segmento,
        diasSemana: diasSemana && diasSemana.length > 0 ? [...new Set(diasSemana)].sort((a, b) => a - b) : null,
        beneficioTipo,
        beneficioValor: toFiniteNumber(source.beneficioValor, 0),
        beneficioExtra: source.beneficioExtra && typeof source.beneficioExtra === 'object'
            ? source.beneficioExtra
            : null,
        uso,
    };
};

export const validateBenefitRulePayload = (raw = {}) => {
    const rule = normalizeBenefitRule(raw);
    if (!rule.nombre) {
        return { ok: false, error: 'El nombre de la regla es requerido', rule: null };
    }
    if (rule.condicionTipo === BENEFIT_CONDITION_TYPES.PUNTOS_MINIMOS && rule.puntosMinimos == null) {
        return { ok: false, error: 'puntosMinimos es requerido para esta condición', rule: null };
    }
    if (
        (rule.condicionTipo === BENEFIT_CONDITION_TYPES.SEGMENTO
            || rule.condicionTipo === BENEFIT_CONDITION_TYPES.SEGMENTO_Y_DIA)
        && !rule.segmento
    ) {
        return { ok: false, error: 'segmento es requerido para esta condición', rule: null };
    }
    if (rule.condicionTipo === BENEFIT_CONDITION_TYPES.SEGMENTO_Y_DIA && (!rule.diasSemana || rule.diasSemana.length === 0)) {
        return { ok: false, error: 'diasSemana es requerido para esta condición', rule: null };
    }
    if (rule.beneficioValor < 0) {
        return { ok: false, error: 'beneficioValor debe ser ≥ 0', rule: null };
    }
    return { ok: true, error: null, rule };
};
