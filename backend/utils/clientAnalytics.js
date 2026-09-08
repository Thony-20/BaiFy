const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_CLIENT_DAYS = 30;

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value.toDate === 'function') {
        const date = value.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (typeof value._seconds === 'number' || typeof value.seconds === 'number') {
        const seconds = Number(value._seconds ?? value.seconds);
        const date = new Date(seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const getSaleDate = (sale) => toDate(sale?.fechaVenta || sale?.createdAt);

export const getSaleCedula = (sale) => {
    const raw = sale?.clienteCedula || sale?.cliente?.cedula || sale?.cliente?.clienteId;
    const digits = String(raw || '').replace(/\D/g, '');
    return digits || null;
};

export const CLIENT_TIME_ZONE = 'America/Caracas';

const calendarDayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLIENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const calendarDayKey = (date) => calendarDayFormatter.format(date);
const monthKey = (date) => calendarDayKey(date).slice(0, 7);

const monthsBetweenCalendarKeys = (fromKey, toKey) => {
    const [fromYear, fromMonth] = fromKey.split('-').map(Number);
    const [toYear, toMonth] = toKey.split('-').map(Number);
    return Math.max(1, (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1);
};

export const buildMonthlySpendingFromPurchases = (purchases = []) => {
    const monthlyTotals = new Map();
    const safePurchases = Array.isArray(purchases) ? purchases : [];

    safePurchases.forEach((purchase) => {
        const date = toDate(purchase?.fechaVenta || purchase?.createdAt);
        if (!date) return;
        const month = monthKey(date);
        const total = Number(purchase?.total) || 0;
        monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + total);
    });

    return [...monthlyTotals.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([month, total]) => ({ month, total: roundMoney(total) }));
};

const dayKeyToDate = (key) => new Date(`${key}T12:00:00-04:00`);

export const calculatePurchaseFrequencyDays = (dates = []) => {
    const uniqueDayKeys = [...new Set(
        dates.filter(Boolean).map(calendarDayKey)
    )].sort();

    if (uniqueDayKeys.length < 2) return null;

    const intervals = uniqueDayKeys.slice(1).map((key, index) => (
        Math.max(0, Math.round((dayKeyToDate(key) - dayKeyToDate(uniqueDayKeys[index])) / DAY_MS))
    ));

    const average = intervals.reduce((sum, days) => sum + days, 0) / intervals.length;
    return Math.round(average);
};

const paymentMethodName = (payment) => (
    String(payment?.method || payment?.metodo || '').trim() || 'Sin especificar'
);

const itemAmount = (item) => {
    const subtotal = Number(item?.subtotal);
    if (Number.isFinite(subtotal)) return subtotal;
    const quantity = Number(item?.cantidad);
    const price = Number(item?.precio ?? item?.valor ?? item?.precioUnitario);
    return Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0;
};

export const getClientStatus = (ultimaCompraAt, now = new Date()) => {
    const lastPurchase = toDate(ultimaCompraAt);
    const currentDate = toDate(now);
    if (!lastPurchase || !currentDate) return 'inactivo';

    const daysSinceLast = Math.max(0, Math.floor((currentDate - lastPurchase) / DAY_MS));
    return daysSinceLast <= ACTIVE_CLIENT_DAYS ? 'activo' : 'inactivo';
};

const toIsoString = (value) => {
    const date = toDate(value);
    return date ? date.toISOString() : null;
};

export const mergeClientMetrics = (metrics, clientDates = {}, now = new Date()) => {
    const currentDate = toDate(now) || new Date();
    const ultimaCompraAt = metrics.ultimaCompraAt
        || toIsoString(clientDates.ultimaCompraAt)
        || null;
    const primeraCompraAt = metrics.primeraCompraAt
        || toIsoString(clientDates.primeraCompraAt)
        || ultimaCompraAt
        || null;
    const ultimaDate = toDate(ultimaCompraAt);
    const diasDesdeUltimaCompra = ultimaDate
        ? Math.max(0, Math.floor((currentDate - ultimaDate) / DAY_MS))
        : metrics.diasDesdeUltimaCompra ?? null;

    return {
        ...metrics,
        primeraCompraAt,
        ultimaCompraAt,
        diasDesdeUltimaCompra,
        estado: getClientStatus(ultimaCompraAt, currentDate),
    };
};

export const aggregateClientSales = (sales = [], now = new Date()) => {
    const safeSales = Array.isArray(sales) ? sales : [];
    const currentDate = toDate(now) || new Date();
    const dates = [];
    const productTotals = new Map();
    const monthlyTotals = new Map();
    const paymentTotals = new Map();
    let totalGastado = 0;
    let unidadesCompradas = 0;

    safeSales.forEach((sale) => {
        const total = Number(sale?.total);
        if (Number.isFinite(total)) totalGastado += total;

        const date = getSaleDate(sale);
        if (date) {
            dates.push(date);
            const month = monthKey(date);
            monthlyTotals.set(month, (monthlyTotals.get(month) || 0) + (Number.isFinite(total) ? total : 0));
        }

        const items = Array.isArray(sale?.items) ? sale.items : [];
        items.forEach((item) => {
            const cantidad = Number(item?.cantidad);
            const safeQuantity = Number.isFinite(cantidad) ? cantidad : 0;
            unidadesCompradas += safeQuantity;
            const productId = String(item?.productId || item?.id || '').trim();
            const nombre = String(item?.nombre || '').trim();
            const key = productId || nombre;
            if (!key) return;
            const current = productTotals.get(key) || {
                productId: productId || null,
                nombre: nombre || null,
                cantidad: 0,
                monto: 0,
            };
            current.cantidad += safeQuantity;
            current.monto += itemAmount(item);
            productTotals.set(key, current);
        });

        const methods = Array.isArray(sale?.metodosPago) ? sale.metodosPago : [];
        methods.forEach((payment) => {
            const method = paymentMethodName(payment);
            const amount = Number(payment?.amount ?? payment?.monto);
            const current = paymentTotals.get(method) || { method, monto: 0, count: 0 };
            if (Number.isFinite(amount)) current.monto += amount;
            current.count += 1;
            paymentTotals.set(method, current);
        });
    });

    dates.sort((a, b) => a - b);
    const primeraCompra = dates[0] || null;
    const ultimaCompra = dates[dates.length - 1] || null;
    const comprasCount = safeSales.length;
    const elapsedMonths = primeraCompra
        ? monthsBetweenCalendarKeys(monthKey(primeraCompra), monthKey(currentDate))
        : 0;
    const frecuenciaCompraDias = calculatePurchaseFrequencyDays(dates);
    const diasDesdeUltimaCompra = ultimaCompra
        ? Math.max(0, Math.floor((currentDate - ultimaCompra) / DAY_MS))
        : null;

    const productsAmount = [...productTotals.values()]
        .reduce((sum, product) => sum + product.monto, 0);
    const topProducts = [...productTotals.values()]
        .sort((a, b) => b.cantidad - a.cantidad || b.monto - a.monto)
        .slice(0, 3)
        .map((product) => ({
            ...product,
            cantidad: Math.round(product.cantidad * 100) / 100,
            monto: roundMoney(product.monto),
            porcentaje: productsAmount > 0
                ? Math.round((product.monto / productsAmount) * 10000) / 100
                : 0,
        }));

    const paymentAmount = [...paymentTotals.values()]
        .reduce((sum, payment) => sum + payment.monto, 0);
    const paymentMethods = [...paymentTotals.values()]
        .sort((a, b) => b.monto - a.monto || b.count - a.count)
        .map((payment) => ({
            method: payment.method,
            monto: roundMoney(payment.monto),
            count: payment.count,
            porcentaje: paymentAmount > 0
                ? Math.round((payment.monto / paymentAmount) * 10000) / 100
                : 0,
        }));

    return {
        totalGastado: roundMoney(totalGastado),
        gastoPromedioMensual: elapsedMonths > 0 ? roundMoney(totalGastado / elapsedMonths) : 0,
        comprasCount,
        unidadesCompradas: Math.round(unidadesCompradas * 100) / 100,
        ticketPromedio: comprasCount > 0 ? roundMoney(totalGastado / comprasCount) : 0,
        frecuenciaCompraDias,
        primeraCompraAt: primeraCompra ? primeraCompra.toISOString() : null,
        ultimaCompraAt: ultimaCompra ? ultimaCompra.toISOString() : null,
        diasDesdeUltimaCompra,
        estado: getClientStatus(ultimaCompra, currentDate),
        topProducts,
        gastoMensual: [...monthlyTotals.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, total]) => ({ month, total: roundMoney(total) })),
        metodoPagoFavorito: paymentMethods[0]?.method || null,
        paymentMethods,
    };
};
