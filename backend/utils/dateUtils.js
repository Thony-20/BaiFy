/**
 * Obtiene el inicio del día (00:00:00) en la zona horaria de Venezuela (America/Caracas).
 */
export const getStartOfDayCaracas = (dateRef = new Date()) => {
    let year, month, day;

    if (typeof dateRef === 'string') {
        const match = dateRef.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (match) {
            [year, month, day] = match.slice(1, 4).map(Number);
        }
    }

    if (year === undefined) {
        const d = dateRef instanceof Date ? dateRef : new Date(dateRef);
        if (isNaN(d.getTime())) return new Date();
        
        // Usar Intl para extraer componentes locales de forma segura
        const parts = new Intl.DateTimeFormat('en-GB', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            timeZone: 'America/Caracas'
        }).formatToParts(d);
        
        year = Number(parts.find(p => p.type === 'year').value);
        month = Number(parts.find(p => p.type === 'month').value);
        day = Number(parts.find(p => p.type === 'day').value);
    }
    
    // Medianoche en Caracas es 04:00 UTC (UTC-4)
    return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
};

/**
 * Obtiene el final del día (23:59:59.999) en la zona horaria de Venezuela.
 */
export const getEndOfDayCaracas = (dateRef = new Date()) => {
    let year, month, day;

    if (typeof dateRef === 'string') {
        const match = dateRef.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (match) {
            [year, month, day] = match.slice(1, 4).map(Number);
        }
    }

    if (year === undefined) {
        const d = dateRef instanceof Date ? dateRef : new Date(dateRef);
        if (isNaN(d.getTime())) return new Date();

        const parts = new Intl.DateTimeFormat('en-GB', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            timeZone: 'America/Caracas'
        }).formatToParts(d);
        
        year = Number(parts.find(p => p.type === 'year').value);
        month = Number(parts.find(p => p.type === 'month').value);
        day = Number(parts.find(p => p.type === 'day').value);
    }
    
    // Fin del día en Caracas (UTC-4) -> Siguiente día 03:59:59 UTC
    return new Date(Date.UTC(year, month - 1, day, 23 + 4, 59, 59, 999));
};

/**
 * Normaliza una fecha a la medianoche de Caracas.
 * Útil para guardar fechas de vencimiento.
 */
export const normalizeToCaracasMidnight = (val) => {
    if (!val) return null;
    
    let d;
    if (typeof val === 'string') {
        const cleanVal = val.trim();
        if (!cleanVal) return null;

        // Intentar detectar formato YYYY-MM-DD o variantes con / o .
        let match = cleanVal.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (match) {
            const [_, y, m, d_part] = match.map(Number);
            return new Date(Date.UTC(y, m - 1, d_part, 4, 0, 0, 0));
        }

        // Intentar detectar formato DD-MM-YYYY o variantes con / o .
        match = cleanVal.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
        if (match) {
            let [_, d_part, m, y] = match.map(Number);
            // Si el año es de 2 dígitos, sumamos 2000 (ej. 26 -> 2026)
            if (y < 100) y += 2000;
            return new Date(Date.UTC(y, m - 1, d_part, 4, 0, 0, 0));
        }

        // Caso especial: Números de serie de Excel guardados como texto
        if (/^\d{5,}(\.\d+)?$/.test(cleanVal)) {
            const serial = parseFloat(cleanVal);
            const d_excel = new Date((serial - 25569) * 86400 * 1000);
            return normalizeToCaracasMidnight(d_excel);
        }
    }
 else if (val instanceof Date) {
        d = val;
    } else if (val && val.toDate) { // Firebase Timestamp
        d = val.toDate();
    } else {
        d = new Date(val);
    }

    if (isNaN(d.getTime())) return null;

    // Para cualquier otro objeto Date, forzamos a que sea la medianoche de Caracas (04:00 UTC)
    // del día que representa localmente en Caracas
    const caracasPart = d.toLocaleString("sv-SE", { timeZone: "America/Caracas" }).split(' ')[0];
    const [year, month, day] = caracasPart.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
};
