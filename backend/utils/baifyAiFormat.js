/**
 * Formato de montos para respuestas de tools de BaiFy AI.
 * @param {number|null|undefined} value
 * @param {string} [currencyLabel]
 */
export function formatMoneyForAi(value, currencyLabel) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    const formatted = new Intl.NumberFormat('es-VE', {
        maximumFractionDigits: 2,
    }).format(Number(value));
    const suffix =
        currencyLabel && !String(currencyLabel).includes('configurada')
            ? ` ${currencyLabel}`
            : ' Bs.';
    return `${formatted}${suffix}`;
}

export function formatIntegerForAi(value) {
    if (value == null || !Number.isFinite(Number(value))) return null;
    return new Intl.NumberFormat('es-VE').format(Number(value));
}
