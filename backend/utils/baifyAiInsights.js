import { adminDb } from '../config/firebase.js';
import { statsCache } from './cache.js';
import { ACTIVE_CLIENT_DAYS, getSaleCedula, getSaleDate } from './clientAnalytics.js';
import { computeAccountEstado, normalizeCedula } from '../controllers/account.controller.js';
import { formatIntegerForAi, formatMoneyForAi } from './baifyAiFormat.js';
import { normalizeSearchTerm } from './productSearch.js';

/*
 * Consultas de BayFi AI sobre clientes, cuentas y catálogo — SIEMPRE filtradas por empresaId.
 *
 * Estrategia de lecturas Firestore:
 * - Búsquedas puntuales (teléfono, cédula, nombre, visitas de un día) → consultas indexadas
 *   que leen solo los documentos implicados.
 * - Rankings sobre todo el historial → lectura completa, cacheada en Redis 10 min en formato
 *   compacto. Estas claves NO usan el prefijo baify-ai-sales-* para que una venta no las borre.
 * - Rankings de catálogo → orderBy + limit sobre campos ya guardados (valor, stock, totalValue…).
 */

const SALES_COLLECTION = 'ventas';
const CLIENTES_COLLECTION = 'clientes';
const ACCOUNTS_COLLECTION = 'cuentas';
const PRODUCTS_COLLECTION = 'productos';
/** Montos de ventas/clientes/cuentas/productos se guardan en USD. */
const USD = 'USD';
const CLIENT_DATA_TTL_SECONDS = 10 * 60;
const CATALOG_TTL_SECONDS = 30 * 60;
const ACCOUNTS_TTL_SECONDS = 2 * 60;
/** Upstash rechaza escrituras grandes; por encima de esto no intentamos cachear. */
const MAX_CACHE_BYTES = 900 * 1024;
const MAX_LIST = 10;
/** Firestore: máximo de valores en un filtro `in`. */
const IN_BATCH = 30;
/** Rango máximo para leer visitas por fecha con consulta directa (más largo → dataset completo). */
const MAX_VISIT_RANGE_DAYS = 92;

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const money = (value) => formatMoneyForAi(roundMoney(value), USD);

const chunk = (list, size) => {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
};

async function cacheSetIfFits(key, value, ttl) {
    const size = Buffer.byteLength(JSON.stringify(value));
    if (size > MAX_CACHE_BYTES) {
        console.warn(`[BaifyAiInsights] ${key} ocupa ${Math.round(size / 1024)} KB; no se cachea.`);
        return;
    }
    await statsCache.set(key, value, ttl);
}

const caracasDay = (date) => date.toLocaleDateString('sv-SE', { timeZone: 'America/Caracas' });
const caracasTime = (date) => date.toLocaleTimeString('es-VE', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
});

function toDateValue(val) {
    if (!val) return null;
    const date = typeof val.toDate === 'function' ? val.toDate() : new Date(val);
    return Number.isNaN(date.getTime()) ? null : date;
}

function caracasRangeToDates(from, to) {
    return {
        start: new Date(`${from}T00:00:00-04:00`),
        end: new Date(`${to}T23:59:59.999-04:00`),
    };
}

/** 04123481899, 584123481899, +58 412-348-1899 → 4123481899 */
function normalizePhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('58')) digits = digits.slice(2);
    return digits.replace(/^0+/, '');
}

function phoneMatches(stored, query) {
    const a = normalizePhone(stored);
    if (!a || !query) return false;
    return a === query || (query.length >= 7 && a.endsWith(query));
}

/** Acepta YYYY-MM-DD o DD/MM/YYYY. */
function parseDayInput(value) {
    const str = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

// ─── Mapeo de documentos ────────────────────────────────────────────────────

const SALE_FIELDS = ['id', 'total', 'clienteCedula', 'cliente', 'clienteNombre', 'fechaVenta', 'items'];
const CLIENT_FIELDS = [
    'nombre', 'clienteId', 'cedula', 'telefono', 'nivel', 'puntosSaldo',
    'creditoEstado', 'creditoHabilitado', 'limiteCredito',
];

const itemAmount = (item) => {
    const subtotal = Number(item?.subtotal);
    if (Number.isFinite(subtotal)) return subtotal;
    return (Number(item?.cantidad) || 0) * (Number(item?.precioUnitario ?? item?.precio) || 0);
};

function mapSaleDoc(doc) {
    const sale = doc.data();
    const date = getSaleDate(sale);
    return {
        comprobante: sale.id || doc.id,
        cedula: normalizeCedula(getSaleCedula(sale)) || null,
        nombre: sale.cliente?.nombre || sale.clienteNombre || null,
        telefono: sale.cliente?.telefono || null,
        total: Number(sale.total) || 0,
        dia: date ? caracasDay(date) : null,
        hora: date ? caracasTime(date) : null,
        items: (Array.isArray(sale.items) ? sale.items : []).map((it) => ({
            nombre: it.nombre || '',
            cantidad: Number(it.cantidad) || 0,
            monto: itemAmount(it),
        })),
    };
}

function mapClientDoc(doc) {
    const d = doc.data();
    return {
        id: doc.id,
        cedula: normalizeCedula(d.clienteId || d.cedula) || null,
        nombre: d.nombre || null,
        telefono: d.telefono || null,
        nivel: d.nivel || 'nuevo',
        puntosSaldo: Math.max(0, Math.floor(Number(d.puntosSaldo) || 0)),
        creditoEstado: d.creditoEstado || (d.creditoHabilitado ? 'habilitado' : 'sin_asignar'),
        limiteCredito: Number(d.limiteCredito) || 0,
    };
}

// Formato compacto (arrays) para que quepan más ventas en una entrada de Redis.
const packSale = (s) => [s.comprobante, s.cedula, s.nombre, s.telefono, s.total, s.dia, s.hora,
    s.items.map((it) => [it.nombre, it.cantidad, roundMoney(it.monto)])];
const unpackSale = ([comprobante, cedula, nombre, telefono, total, dia, hora, items]) => ({
    comprobante, cedula, nombre, telefono, total, dia, hora,
    items: items.map(([n, cantidad, monto]) => ({ nombre: n, cantidad, monto })),
});

// ─── Cargadores ─────────────────────────────────────────────────────────────

/** Todos los clientes registrados (lecturas = nº de clientes; caché 10 min). */
async function loadClientList(empresaId) {
    const cacheKey = `baify-ai-clientlist-${empresaId}`;
    const cached = await statsCache.get(cacheKey);
    if (cached) return cached;

    const snap = await adminDb
        .collection(CLIENTES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .select(...CLIENT_FIELDS)
        .get();
    const clients = snap.docs.map(mapClientDoc);
    await cacheSetIfFits(cacheKey, clients, CLIENT_DATA_TTL_SECONDS);
    return clients;
}

/** Todas las ventas (solo para rankings de historial completo; caché 10 min). */
async function loadAllSales(empresaId) {
    const cacheKey = `baify-ai-allsales-${empresaId}`;
    const cached = await statsCache.get(cacheKey);
    if (cached) return cached.map(unpackSale);

    const snap = await adminDb
        .collection(SALES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .select(...SALE_FIELDS)
        .get();
    const sales = snap.docs.map(mapSaleDoc);
    await cacheSetIfFits(cacheKey, sales.map(packSale), CLIENT_DATA_TTL_SECONDS);
    return sales;
}

/** Ventas de un rango de días (lecturas = ventas del rango). */
async function loadSalesInRange(empresaId, from, to) {
    const { start, end } = caracasRangeToDates(from, to);
    const snap = await adminDb
        .collection(SALES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('fechaVenta', '>=', start)
        .where('fechaVenta', '<=', end)
        .select(...SALE_FIELDS)
        .get();
    return snap.docs.map(mapSaleDoc);
}

/** Ventas de clientes concretos (lecturas = compras de esos clientes). */
async function loadSalesForCedulas(empresaId, cedulas) {
    const unique = [...new Set(cedulas.filter(Boolean))];
    const snaps = await Promise.all(unique.map((cedula) => adminDb
        .collection(SALES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('clienteCedula', '==', cedula)
        .select(...SALE_FIELDS)
        .get()));
    return snaps.flatMap((snap) => snap.docs.map(mapSaleDoc));
}

/** Fichas de clientes por cédula (1 lectura por cliente encontrado). */
async function loadClientsByCedulas(empresaId, cedulas) {
    const unique = [...new Set(cedulas.filter(Boolean))];
    const snaps = await Promise.all(chunk(unique, IN_BATCH).map((batch) => adminDb
        .collection(CLIENTES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('clienteId', 'in', batch)
        .select(...CLIENT_FIELDS)
        .get()));
    return snaps.flatMap((snap) => snap.docs.map(mapClientDoc));
}

/** Fichas de clientes por teléfono (el campo se guarda solo con dígitos). */
async function loadClientsByPhone(empresaId, phone) {
    const variants = [...new Set([phone, `0${phone}`, `58${phone}`])];
    const snap = await adminDb
        .collection(CLIENTES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('telefono', 'in', variants)
        .select(...CLIENT_FIELDS)
        .get();
    return snap.docs.map(mapClientDoc);
}

function mapAccountDoc(doc, now) {
    const d = doc.data();
    const due = toDateValue(d.fechaVencimiento);
    return {
        tipo: d.tipo,
        nombre: d.tipo === 'por_pagar' ? d.proveedorNombre : d.clienteNombre,
        cedula: d.clienteId || null,
        montoTotal: Number(d.montoTotal) || 0,
        montoPendiente: Number(d.montoPendiente) || 0,
        fechaVencimiento: due ? caracasDay(due) : null,
        estado: computeAccountEstado(d.montoTotal, d.montoPendiente, due, now),
    };
}

const ACCOUNT_FIELDS = ['tipo', 'clienteNombre', 'clienteId', 'proveedorNombre', 'montoTotal', 'montoPendiente', 'fechaVencimiento'];

/** Todas las cuentas por cobrar/pagar (caché corto: cambian con cada abono). */
async function loadAccounts(empresaId) {
    const cacheKey = `baify-ai-accounts-${empresaId}`;
    const cached = await statsCache.get(cacheKey);
    if (cached) return cached;

    const snap = await adminDb
        .collection(ACCOUNTS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .select(...ACCOUNT_FIELDS)
        .get();
    const now = new Date();
    const accounts = snap.docs.map((doc) => mapAccountDoc(doc, now));
    await cacheSetIfFits(cacheKey, accounts, ACCOUNTS_TTL_SECONDS);
    return accounts;
}

/** Cuentas por cobrar de clientes concretos (índice empresaId + tipo + clienteId). */
async function loadReceivablesForCedulas(empresaId, cedulas) {
    const unique = [...new Set(cedulas.filter(Boolean))];
    if (unique.length === 0) return [];
    const now = new Date();
    const snaps = await Promise.all(chunk(unique, IN_BATCH).map((batch) => adminDb
        .collection(ACCOUNTS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .where('tipo', '==', 'por_cobrar')
        .where('clienteId', 'in', batch)
        .select(...ACCOUNT_FIELDS)
        .get()));
    return snaps.flatMap((snap) => snap.docs.map((doc) => mapAccountDoc(doc, now)));
}

// ─── Clientes ───────────────────────────────────────────────────────────────

/**
 * Elige la consulta más barata según los criterios.
 * @returns {Promise<{ sales: object[], clients: object[], fullHistory: boolean, source: string }>}
 */
async function loadClientDataset(empresaId, q) {
    const needsFullScan = q.productQuery || q.opts.nivel || q.opts.creditoEstado || q.opts.conDeuda
        || q.opts.estado || q.opts.minDiasSinComprar;

    // Visitas de un día o rango corto: solo las ventas de esas fechas.
    if (q.visitFrom && !needsFullScan) {
        const span = (new Date(q.visitTo) - new Date(q.visitFrom)) / 86400000 + 1;
        if (span <= MAX_VISIT_RANGE_DAYS) {
            const sales = await loadSalesInRange(empresaId, q.visitFrom, q.visitTo);
            const clients = await loadClientsByCedulas(empresaId, sales.map((s) => s.cedula));
            return { sales, clients, fullHistory: false, source: 'ventas-del-rango' };
        }
    }

    if (!q.visitFrom && !needsFullScan) {
        // Cédula: ficha + sus ventas (también encuentra clientes solo presentes en ventas).
        if (q.cedulaQuery) {
            const [clients, sales] = await Promise.all([
                loadClientsByCedulas(empresaId, [q.cedulaQuery]),
                loadSalesForCedulas(empresaId, [q.cedulaQuery]),
            ]);
            return { sales, clients, fullHistory: true, source: 'cedula' };
        }
        // Teléfono: ficha por índice; si no está registrado se busca en el historial completo.
        if (q.phoneQuery) {
            const clients = await loadClientsByPhone(empresaId, q.phoneQuery);
            if (clients.length > 0) {
                const sales = await loadSalesForCedulas(empresaId, clients.map((c) => c.cedula));
                return { sales, clients, fullHistory: true, source: 'telefono' };
            }
        }
        // Nombre: lista de clientes (cacheada) + ventas solo de los que coinciden.
        if (q.nameQuery && !q.phoneQuery) {
            const tokens = q.nameQuery.split(/\s+/);
            const clients = (await loadClientList(empresaId))
                .filter((c) => tokens.every((t) => normalizeSearchTerm(c.nombre).includes(t)))
                .slice(0, MAX_LIST);
            if (clients.length > 0) {
                const sales = await loadSalesForCedulas(empresaId, clients.map((c) => c.cedula));
                return { sales, clients, fullHistory: true, source: 'nombre' };
            }
        }
    }

    const [sales, clients] = await Promise.all([loadAllSales(empresaId), loadClientList(empresaId)]);
    return { sales, clients, fullHistory: true, source: 'historial-completo' };
}

/**
 * Consulta general de la sección Clientes (solo empresaId del usuario autenticado):
 * búsqueda por teléfono/cédula/nombre, filtros por fecha de visita, producto, nivel, crédito,
 * deuda o inactividad, y ranking por gasto, compras, unidades, puntos, deuda o última compra.
 * @param {string} empresaId
 * @param {object} opts
 */
export async function queryClientsForAi(empresaId, opts = {}) {
    const limit = Math.min(Math.max(1, opts.limit ?? 5), 20);
    const q = {
        opts,
        phoneQuery: opts.phone ? normalizePhone(opts.phone) : null,
        cedulaQuery: opts.cedula ? normalizeCedula(opts.cedula) : null,
        nameQuery: normalizeSearchTerm(opts.name),
        productQuery: normalizeSearchTerm(opts.product),
        visitFrom: null,
        visitTo: null,
    };

    if (opts.visitDate || opts.visitFrom || opts.visitTo) {
        q.visitFrom = parseDayInput(opts.visitDate || opts.visitFrom);
        q.visitTo = parseDayInput(opts.visitDate || opts.visitTo) || caracasDay(new Date());
        if (!q.visitFrom) {
            return { error: 'Fecha de visita inválida. Usa YYYY-MM-DD o DD/MM/YYYY. No reintentes: pide la fecha al usuario.' };
        }
    }
    if (q.phoneQuery && q.phoneQuery.length < 7) {
        return { error: 'El teléfono debe tener al menos 7 dígitos.' };
    }

    const { sales, clients, fullHistory, source } = await loadClientDataset(empresaId, q);
    const needAllAccounts = opts.conDeuda || opts.sortBy === 'deuda';
    const allAccounts = needAllAccounts ? await loadAccounts(empresaId) : null;

    // Base: clientes registrados + clientes que solo aparecen en ventas.
    const people = new Map();
    clients.forEach((c) => people.set(c.cedula || `id:${c.id}`, { ...c, registrado: true }));
    const stats = new Map();
    const filtering = Boolean(q.visitFrom || q.productQuery);

    sales.forEach((sale) => {
        if (!sale.cedula) return;
        if (!people.has(sale.cedula)) {
            people.set(sale.cedula, {
                id: null, cedula: sale.cedula, nombre: sale.nombre, telefono: sale.telefono,
                nivel: null, puntosSaldo: null, creditoEstado: null, limiteCredito: 0, registrado: false,
            });
        }
        const person = people.get(sale.cedula);
        person.telefono = person.telefono || sale.telefono;
        person.nombre = person.nombre || sale.nombre;

        const s = stats.get(sale.cedula) || {
            gasto: 0, compras: 0, unidades: 0, primeraCompra: null, ultimaCompra: null,
            filtro: { gasto: 0, compras: 0, unidades: 0, visitas: [] },
        };
        s.gasto += sale.total;
        s.compras += 1;
        s.unidades += sale.items.reduce((acc, it) => acc + it.cantidad, 0);
        if (sale.dia && (!s.primeraCompra || sale.dia < s.primeraCompra)) s.primeraCompra = sale.dia;
        if (sale.dia && (!s.ultimaCompra || sale.dia > s.ultimaCompra)) s.ultimaCompra = sale.dia;

        const inDate = !q.visitFrom || (sale.dia && sale.dia >= q.visitFrom && sale.dia <= q.visitTo);
        const items = q.productQuery
            ? sale.items.filter((it) => normalizeSearchTerm(it.nombre).includes(q.productQuery))
            : sale.items;
        if (inDate && items.length > 0) {
            s.filtro.compras += 1;
            s.filtro.gasto += q.productQuery ? items.reduce((acc, it) => acc + it.monto, 0) : sale.total;
            s.filtro.unidades += items.reduce((acc, it) => acc + it.cantidad, 0);
            if (q.visitFrom && s.filtro.visitas.length < 5) {
                s.filtro.visitas.push({ dia: sale.dia, hora: sale.hora, comprobante: sale.comprobante, total: sale.total });
            }
        }
        stats.set(sale.cedula, s);
    });

    const debtFrom = (accounts) => {
        const map = new Map();
        accounts
            .filter((a) => a.tipo === 'por_cobrar' && a.montoPendiente > 0.009)
            .forEach((a) => {
                const key = normalizeCedula(a.cedula) || `n:${normalizeSearchTerm(a.nombre)}`;
                const current = map.get(key) || { pendiente: 0, vencidas: 0 };
                current.pendiente += a.montoPendiente;
                if (a.estado === 'vencido') current.vencidas += 1;
                map.set(key, current);
            });
        return map;
    };
    let debtByKey = allAccounts ? debtFrom(allAccounts) : new Map();
    const debtOf = (p) => debtByKey.get(p.cedula) || debtByKey.get(`n:${normalizeSearchTerm(p.nombre)}`) || null;

    const today = caracasDay(new Date());
    const daysSince = (day) => (day ? Math.round((new Date(today) - new Date(day)) / 86400000) : null);
    // Igual que la pantalla Clientes: meses desde la primera compra hasta hoy, ambos incluidos.
    const monthsActive = (firstDay) => {
        if (!firstDay) return 1;
        const [fy, fm] = firstDay.split('-').map(Number);
        const [ty, tm] = today.split('-').map(Number);
        return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
    };
    const monthlyAvg = (s) => (s ? s.gasto / monthsActive(s.primeraCompra) : 0);

    let rows = [...people.values()].map((p) => {
        const s = stats.get(p.cedula) || null;
        return { p, s, diasSinComprar: daysSince(s?.ultimaCompra) };
    });

    rows = rows.filter(({ p, s, diasSinComprar }) => {
        if (q.phoneQuery && !phoneMatches(p.telefono, q.phoneQuery)) return false;
        if (q.cedulaQuery && p.cedula !== q.cedulaQuery && !String(p.cedula || '').includes(q.cedulaQuery)) return false;
        if (q.nameQuery && !q.nameQuery.split(/\s+/).every((t) => normalizeSearchTerm(p.nombre).includes(t))) return false;
        if (filtering && !(s?.filtro.compras > 0)) return false;
        if (opts.nivel && p.nivel !== opts.nivel) return false;
        if (opts.creditoEstado && p.creditoEstado !== opts.creditoEstado) return false;
        if (opts.conDeuda && !debtOf(p)) return false;
        if (opts.estado === 'activo' && !(diasSinComprar != null && diasSinComprar <= ACTIVE_CLIENT_DAYS)) return false;
        if (opts.estado === 'inactivo' && diasSinComprar != null && diasSinComprar <= ACTIVE_CLIENT_DAYS) return false;
        if (opts.minDiasSinComprar && !(diasSinComprar != null && diasSinComprar >= opts.minDiasSinComprar)) return false;
        return true;
    });

    const sortBy = opts.sortBy || (filtering ? (q.productQuery ? 'unidades' : 'gasto') : 'gasto');
    const m = (r) => (filtering ? r.s?.filtro : r.s) || {};
    const metric = {
        gasto: (r) => m(r).gasto || 0,
        gastoMensual: (r) => monthlyAvg(r.s),
        compras: (r) => m(r).compras || 0,
        unidades: (r) => m(r).unidades || 0,
        puntos: (r) => r.p.puntosSaldo || 0,
        deuda: (r) => debtOf(r.p)?.pendiente || 0,
        ultimaCompra: (r) => (r.s?.ultimaCompra ? new Date(r.s.ultimaCompra).getTime() : 0),
    }[sortBy];
    if (sortBy === 'nombre') {
        rows.sort((a, b) => String(a.p.nombre || '').localeCompare(String(b.p.nombre || ''), 'es'));
    } else if (metric) {
        rows.sort((a, b) => (opts.order === 'asc' ? metric(a) - metric(b) : metric(b) - metric(a)));
    }

    const page = rows.slice(0, limit);
    // Deuda solo de los clientes que se van a mostrar (1 consulta indexada).
    if (!allAccounts) {
        debtByKey = debtFrom(await loadReceivablesForCedulas(empresaId, page.map((r) => r.p.cedula)));
    }

    const list = page.map(({ p, s, diasSinComprar }, index) => {
        const debt = debtOf(p);
        return {
            rank: index + 1,
            nombre: p.nombre || 'Sin nombre',
            cedula: p.cedula,
            telefono: p.telefono || null,
            registradoEnClientes: p.registrado,
            fichaUrl: p.id ? `/clientes/${p.id}` : null,
            nivel: p.nivel,
            puntosSaldo: p.puntosSaldo,
            creditoEstado: p.creditoEstado,
            limiteCreditoFormatted: p.registrado ? money(p.limiteCredito) : null,
            deudaPendienteFormatted: debt ? money(debt.pendiente) : null,
            cuentasVencidas: debt?.vencidas || 0,
            historial: !fullHistory
                ? { nota: 'Historial completo no incluido en esta consulta; búscalo por cédula si lo piden.' }
                : s
                    ? {
                        totalGastadoFormatted: money(s.gasto),
                        gastoPromedioMensualFormatted: money(monthlyAvg(s)),
                        mesesAnalizados: monthsActive(s.primeraCompra),
                        compras: s.compras,
                        ticketPromedioFormatted: money(s.compras ? s.gasto / s.compras : 0),
                        primeraCompra: s.primeraCompra,
                        ultimaCompra: s.ultimaCompra,
                        diasSinComprar,
                    }
                    : { compras: 0, nota: 'Sin compras registradas' },
            ...(filtering && s
                ? {
                    enFiltro: {
                        compras: s.filtro.compras,
                        gastoFormatted: money(s.filtro.gasto),
                        unidades: Math.round(s.filtro.unidades * 100) / 100,
                        ...(q.visitFrom ? { visitas: s.filtro.visitas } : {}),
                    },
                }
                : {}),
        };
    });

    const inScope = (sale) => (!q.visitFrom || (sale.dia >= q.visitFrom && sale.dia <= q.visitTo))
        && (!q.productQuery || sale.items.some((it) => normalizeSearchTerm(it.nombre).includes(q.productQuery)));
    const salesWithoutClient = source === 'historial-completo' || source === 'ventas-del-rango'
        ? sales.filter((sale) => !sale.cedula && inScope(sale)).length
        : 0;

    const notes = [];
    if (rows.length === 0) {
        notes.push('Ningún cliente de esta empresa cumple el criterio. Díselo al usuario tal cual; no sugieras que existe en otra empresa.');
    }
    if (salesWithoutClient > 0 && (filtering || ['gasto', 'compras', 'unidades'].includes(sortBy))) {
        notes.push(`${formatIntegerForAi(salesWithoutClient)} venta(s) sin cliente asociado no aparecen en esta lista.`);
    }

    return {
        criterios: {
            ...(q.phoneQuery ? { telefono: opts.phone } : {}),
            ...(q.cedulaQuery ? { cedula: q.cedulaQuery } : {}),
            ...(q.nameQuery ? { nombre: opts.name } : {}),
            ...(q.visitFrom ? { visitas: q.visitFrom === q.visitTo ? q.visitFrom : `${q.visitFrom} a ${q.visitTo}` } : {}),
            ...(q.productQuery ? { producto: opts.product } : {}),
            ...(opts.nivel ? { nivel: opts.nivel } : {}),
            ...(opts.creditoEstado ? { creditoEstado: opts.creditoEstado } : {}),
            ...(opts.conDeuda ? { conDeuda: true } : {}),
            ...(opts.estado ? { estado: opts.estado } : {}),
            ...(opts.minDiasSinComprar ? { minDiasSinComprar: opts.minDiasSinComprar } : {}),
            ordenadoPor: sortBy,
        },
        totalCoincidencias: rows.length,
        mostrando: list.length,
        clients: list,
        note: notes.join(' ') || null,
    };
}

// ─── Cuentas ────────────────────────────────────────────────────────────────

/**
 * Resumen de cuentas por cobrar / por pagar: saldos, vencidas y principales deudores.
 * @param {string} empresaId
 * @param {{ tipo?: 'por_cobrar'|'por_pagar'|'todas', limit?: number }} opts
 */
export async function getAccountsOverviewForAi(empresaId, opts = {}) {
    const tipoFilter = opts.tipo === 'por_cobrar' || opts.tipo === 'por_pagar' ? opts.tipo : 'todas';
    const limit = Math.min(Math.max(1, opts.limit ?? 5), MAX_LIST);
    const accounts = await loadAccounts(empresaId);

    const buildSection = (tipo) => {
        const open = accounts.filter((a) => a.tipo === tipo && a.montoPendiente > 0.009);
        const vencidas = open.filter((a) => a.estado === 'vencido');
        const byPerson = new Map();
        open.forEach((a) => {
            const key = a.cedula || String(a.nombre || 'Sin nombre').toLowerCase();
            const current = byPerson.get(key) || { nombre: a.nombre || 'Sin nombre', pendiente: 0, cuentas: 0, vencidas: 0 };
            current.pendiente += a.montoPendiente;
            current.cuentas += 1;
            if (a.estado === 'vencido') current.vencidas += 1;
            byPerson.set(key, current);
        });
        const principales = [...byPerson.values()]
            .sort((a, b) => b.pendiente - a.pendiente)
            .slice(0, limit)
            .map((p) => ({ ...p, pendiente: undefined, pendienteFormatted: money(p.pendiente) }));
        const proximas = open
            .filter((a) => a.estado !== 'vencido' && a.fechaVencimiento)
            .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
            .slice(0, 3)
            .map((a) => ({ nombre: a.nombre, fechaVencimiento: a.fechaVencimiento, pendienteFormatted: money(a.montoPendiente) }));
        return {
            cuentasAbiertas: open.length,
            totalPendienteFormatted: money(open.reduce((s, a) => s + a.montoPendiente, 0)),
            cuentasVencidas: vencidas.length,
            totalVencidoFormatted: money(vencidas.reduce((s, a) => s + a.montoPendiente, 0)),
            [tipo === 'por_cobrar' ? 'principalesDeudores' : 'principalesProveedores']: principales,
            proximosVencimientos: proximas,
        };
    };

    const result = {};
    if (tipoFilter !== 'por_pagar') result.porCobrar = buildSection('por_cobrar');
    if (tipoFilter !== 'por_cobrar') result.porPagar = buildSection('por_pagar');
    return result;
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

const PRODUCT_FIELDS = ['nombre', 'sku', 'valor', 'costo', 'stock', 'estado', 'fechaVencimiento', 'totalValue', 'unitsSoldTotal'];

function mapProductDoc(doc) {
    const d = doc.data();
    const venc = toDateValue(d.fechaVencimiento);
    const precio = Number(d.valor) || 0;
    const stock = Number(d.stock) || 0;
    return {
        nombre: d.nombre || 'Sin nombre',
        sku: d.sku || null,
        precio,
        costo: Number(d.costo) || 0,
        stock,
        valorInventario: Number(d.totalValue) || precio * stock,
        vendidosHistorico: Number(d.unitsSoldTotal) || 0,
        estado: d.estado || null,
        fechaVencimiento: venc ? caracasDay(venc) : null,
    };
}

/** Campo Firestore por el que se ordena cada ranking (con índice empresaId + campo). */
const PRODUCT_ORDER_FIELDS = {
    precio: 'valor',
    stock: 'stock',
    valor: 'totalValue',
    vendidos: 'unitsSoldTotal',
};

/** Catálogo completo compacto (solo para margen o si falta un índice; caché 30 min). */
async function loadCatalog(empresaId) {
    const cacheKey = `baify-ai-catalog-${empresaId}`;
    const cached = await statsCache.get(cacheKey);
    if (cached) {
        return cached.map(([nombre, sku, precio, costo, stock, valorInventario, vendidosHistorico, estado, fechaVencimiento]) => ({
            nombre, sku, precio, costo, stock, valorInventario, vendidosHistorico, estado, fechaVencimiento,
        }));
    }
    const snap = await adminDb
        .collection(PRODUCTS_COLLECTION)
        .where('empresaId', '==', empresaId)
        .select(...PRODUCT_FIELDS)
        .get();
    const products = snap.docs.map(mapProductDoc);
    await cacheSetIfFits(
        cacheKey,
        products.map((p) => [p.nombre, p.sku, p.precio, p.costo, p.stock, p.valorInventario, p.vendidosHistorico, p.estado, p.fechaVencimiento]),
        CATALOG_TTL_SECONDS
    );
    return products;
}

async function rankProductsIndexed(empresaId, sortBy, order, limit) {
    const col = adminDb.collection(PRODUCTS_COLLECTION);
    if (sortBy === 'vencimiento') {
        const snap = await col
            .where('empresaId', '==', empresaId)
            .where('estado', '==', 'activo')
            .where('fechaVencimiento', '>=', new Date(`${caracasDay(new Date())}T00:00:00-04:00`))
            .orderBy('fechaVencimiento', 'asc')
            .limit(limit * 3)
            .select(...PRODUCT_FIELDS)
            .get();
        return snap.docs.map(mapProductDoc).filter((p) => p.stock > 0);
    }
    const snap = await col
        .where('empresaId', '==', empresaId)
        .orderBy(PRODUCT_ORDER_FIELDS[sortBy], order)
        .limit(limit + 10)
        .select(...PRODUCT_FIELDS)
        .get();
    return snap.docs.map(mapProductDoc).filter((p) => p.estado !== 'inactivo');
}

/**
 * Ranking del catálogo por precio, stock, valor de inventario, unidades vendidas, margen o vencimiento.
 * Lecturas ≈ limit (orderBy + limit); margen requiere el catálogo completo (cacheado).
 * @param {string} empresaId
 * @param {{ sortBy?: 'precio'|'stock'|'valor'|'vendidos'|'vencimiento'|'margen', order?: 'desc'|'asc', limit?: number }} opts
 */
export async function getProductRankingForAi(empresaId, opts = {}) {
    const sortBy = ['precio', 'stock', 'valor', 'vendidos', 'vencimiento', 'margen'].includes(opts.sortBy)
        ? opts.sortBy
        : 'valor';
    const order = sortBy === 'vencimiento' ? 'asc' : opts.order === 'asc' ? 'asc' : 'desc';
    const limit = Math.min(Math.max(1, opts.limit ?? 5), MAX_LIST);

    let list = null;
    if (sortBy !== 'margen') {
        try {
            list = await rankProductsIndexed(empresaId, sortBy, order, limit);
        } catch (error) {
            // Índice aún no desplegado: se usa el catálogo cacheado.
            console.warn(`[BaifyAiInsights] ranking ${sortBy} sin índice, usando catálogo completo:`, error.message);
        }
    }

    if (!list) {
        const margin = (p) => (p.precio > 0 ? (p.precio - p.costo) / p.precio : 0);
        const field = {
            precio: (p) => p.precio,
            stock: (p) => p.stock,
            valor: (p) => p.valorInventario,
            vendidos: (p) => p.vendidosHistorico,
            margen: margin,
        }[sortBy];
        const active = (await loadCatalog(empresaId)).filter((p) => p.estado !== 'inactivo');
        list = sortBy === 'vencimiento'
            ? active
                .filter((p) => p.fechaVencimiento && p.fechaVencimiento >= caracasDay(new Date()) && p.stock > 0)
                .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
            : active.sort((a, b) => (order === 'asc' ? field(a) - field(b) : field(b) - field(a)));
    }

    return {
        sortBy,
        order,
        products: list.slice(0, limit).map((p, index) => ({
            rank: index + 1,
            nombre: p.nombre,
            sku: p.sku,
            stock: p.stock,
            precioFormatted: money(p.precio),
            costoFormatted: money(p.costo),
            valorInventarioFormatted: money(p.valorInventario),
            vendidosHistorico: p.vendidosHistorico,
            margenPct: p.precio > 0 ? Math.round(((p.precio - p.costo) / p.precio) * 1000) / 10 : null,
            fechaVencimiento: p.fechaVencimiento,
        })),
    };
}
