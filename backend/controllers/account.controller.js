import { adminDb } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import {
    getStartOfDayCaracas,
    getEndOfDayCaracas,
    normalizeToCaracasMidnight,
} from '../utils/dateUtils.js';
import { statsCache } from '../utils/cache.js';
import {
    paymentMethodKeyFromMetodo,
    applyCxCCollectionToDailyStats,
    shouldApplyCxCPaymentMetrics,
} from '../utils/paymentMethods.js';
import { applyEmpresaStatsDelta } from '../utils/empresaStats.js';
import { clearNotificationsCache } from '../utils/notificationCache.js';

const COLLECTION = 'cuentas';
const DAILY_STATS_COLLECTION = 'metricas_diarias';
const ACCOUNTS_PER_PAGE = 7;

export const ACCOUNT_TYPES = {
    POR_COBRAR: 'por_cobrar',
    POR_PAGAR: 'por_pagar',
};

export const ACCOUNT_STATES = {
    PENDIENTE: 'pendiente',
    PARCIAL: 'parcial',
    PAGADO: 'pagado',
    VENCIDO: 'vencido',
};

const serializeDate = (val) => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    if (typeof val._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
    if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
    return null;
};

const serializeAccount = (id, data) => {
    const abonos = Array.isArray(data.abonos)
        ? data.abonos.map((a) => ({
            ...a,
            fecha: serializeDate(a.fecha),
            createdAt: serializeDate(a.createdAt),
        }))
        : [];

    return {
        id,
        ...data,
        fechaEmision: serializeDate(data.fechaEmision),
        fechaVencimiento: serializeDate(data.fechaVencimiento),
        createdAt: serializeDate(data.createdAt),
        updatedAt: serializeDate(data.updatedAt),
        abonos,
    };
};

const safeDate = (val) => {
    const date = normalizeToCaracasMidnight(val);
    if (!date) return null;
    const seconds = Math.floor(date.getTime() / 1000);
    if (seconds < -62135596800 || seconds > 253402300799) return null;
    return date;
};

/**
 * Calcula estado según saldo y vencimiento.
 * Pagado tiene prioridad; vencido aplica si hay saldo y la fecha ya pasó.
 */
export const computeAccountEstado = (montoTotal, montoPendiente, fechaVencimiento, now = new Date()) => {
    const pending = Number(montoPendiente) || 0;
    const total = Number(montoTotal) || 0;

    if (pending <= 0.009) return ACCOUNT_STATES.PAGADO;

    const due = safeDate(fechaVencimiento) || (fechaVencimiento instanceof Date ? fechaVencimiento : null);
    if (due) {
        const todayStart = getStartOfDayCaracas(now);
        if (due.getTime() < todayStart.getTime()) {
            return ACCOUNT_STATES.VENCIDO;
        }
    }

    if (pending < total - 0.009) return ACCOUNT_STATES.PARCIAL;
    return ACCOUNT_STATES.PENDIENTE;
};

const parseOptionalId = (val) => {
    if (val === undefined || val === null) return null;
    const trimmed = String(val).trim();
    return trimmed || null;
};

/** Cédula: solo dígitos, mínimo 5. */
export const normalizeCedula = (val) => {
    if (val === undefined || val === null) return null;
    const digits = String(val).replace(/\D/g, '');
    return digits.length >= 5 ? digits : null;
};

const normalizePersonName = (val) => String(val || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/**
 * Busca cuentas por cobrar de una CI en la empresa.
 */
export const findAccountsByClienteId = async (empresaId, clienteId) => {
    try {
        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', ACCOUNT_TYPES.POR_COBRAR)
            .where('clienteId', '==', clienteId)
            .get();

        return snapshot.docs.map((doc) => serializeAccount(doc.id, doc.data()));
    } catch (error) {
        // Fallback si falta el índice compuesto (empresaId + tipo + clienteId)
        console.warn('findAccountsByClienteId: query indexada falló, usando filtro en memoria:', error.message);
        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', ACCOUNT_TYPES.POR_COBRAR)
            .get();

        return snapshot.docs
            .filter((doc) => String(doc.data().clienteId || '') === String(clienteId))
            .map((doc) => serializeAccount(doc.id, doc.data()));
    }
};

/**
 * Una CI solo puede asociarse a un nombre. Misma persona (misma CI + mismo nombre)
 * puede tener varios préstamos; otra persona no puede reutilizar esa CI.
 * @returns {{ ok: true, canonicalNombre: string|null } | { ok: false, error: string, existingNombre: string }}
 */
export const assertClienteCedulaNombreUnico = async ({
    empresaId,
    clienteId,
    clienteNombre,
    excludeAccountId = null,
}) => {
    const accounts = await findAccountsByClienteId(empresaId, clienteId);
    const relevant = excludeAccountId
        ? accounts.filter((a) => a.id !== excludeAccountId)
        : accounts;

    if (relevant.length === 0) {
        return { ok: true, canonicalNombre: null };
    }

    const incoming = normalizePersonName(clienteNombre);
    const existingNombre = relevant.find((a) => a.clienteNombre)?.clienteNombre || '';
    const existingNorm = normalizePersonName(existingNombre);

    if (existingNorm && incoming !== existingNorm) {
        return {
            ok: false,
            error: `La cédula ${clienteId} ya está registrada a nombre de "${existingNombre}". No puede usarse con otro nombre.`,
            existingNombre,
        };
    }

    return { ok: true, canonicalNombre: existingNombre || null };
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Fecha del abono que cerró la cuenta (último abono por fecha). */
const resolvePaidAtDate = (account) => {
    const abonos = Array.isArray(account.abonos) ? account.abonos : [];
    let latest = null;
    abonos.forEach((abono) => {
        const raw = abono.fecha || abono.createdAt;
        if (!raw) return;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return;
        if (!latest || d.getTime() > latest.getTime()) latest = d;
    });
    return latest;
};

/**
 * Desviación en días respecto al vencimiento (solo cuentas pagadas).
 * Negativo = pagó antes; 0 = día acordado; positivo = pagó tarde.
 * @returns {{ promedioDias: number|null, muestra: number }}
 */
const computeDesviacionPromedioPago = (cuentas) => {
    const diffs = [];

    cuentas.forEach((account) => {
        if (account.estado !== ACCOUNT_STATES.PAGADO) return;
        if (!account.fechaVencimiento) return;

        const paidAt = resolvePaidAtDate(account);
        if (!paidAt) return;

        const due = getStartOfDayCaracas(account.fechaVencimiento);
        const paid = getStartOfDayCaracas(paidAt);
        const diff = Math.round((paid.getTime() - due.getTime()) / MS_PER_DAY);
        diffs.push(diff);
    });

    if (diffs.length === 0) {
        return { promedioDias: null, muestra: 0 };
    }

    const sum = diffs.reduce((acc, n) => acc + n, 0);
    const promedioDias = Math.round((sum / diffs.length) * 10) / 10;
    return { promedioDias, muestra: diffs.length };
};

const buildCreditHistoryPayload = (clienteId, accounts) => {
    const now = new Date();
    let montoTotalPrestado = 0;
    let montoPendiente = 0;
    let montoCobrado = 0;
    const resumen = {
        pendiente: 0,
        parcial: 0,
        pagado: 0,
        vencido: 0,
    };

    const cuentas = accounts
        .map((account) => {
            const estado = computeAccountEstado(
                account.montoTotal,
                account.montoPendiente,
                account.fechaVencimiento,
                now
            );
            const total = Number(account.montoTotal) || 0;
            const pending = Number(account.montoPendiente) || 0;
            montoTotalPrestado += total;
            montoPendiente += pending;
            montoCobrado += Math.max(0, roundMoney(total - pending));

            if (Object.prototype.hasOwnProperty.call(resumen, estado)) {
                resumen[estado] += 1;
            }

            return { ...account, estado };
        })
        .sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
        });

    const clienteNombre = cuentas.find((a) => a.clienteNombre)?.clienteNombre || null;
    const { promedioDias, muestra } = computeDesviacionPromedioPago(cuentas);

    return {
        clienteId,
        clienteNombre,
        exists: cuentas.length > 0,
        totalPrestamos: cuentas.length,
        resumen: {
            ...resumen,
            montoTotalPrestado: roundMoney(montoTotalPrestado),
            montoPendiente: roundMoney(montoPendiente),
            montoCobrado: roundMoney(montoCobrado),
            desviacionPromedioPagoDias: promedioDias,
            tiempoPromedioPagoDias: promedioDias,
            prestamosPagadosMuestra: muestra,
        },
        cuentas,
    };
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Tasa de cambio válida (> 0). Obligatoria para fijar Bs al registrar. */
const parseTasaCambio = (val) => {
    const tasa = Number(val);
    if (Number.isNaN(tasa) || tasa <= 0) return null;
    return roundMoney(tasa);
};

const validateAccountPayload = (body, { isUpdate = false } = {}) => {
    const errors = [];

    if (!isUpdate && !body.empresaId) errors.push('empresaId es requerido');
    if (!isUpdate && !body.tipo) errors.push('tipo es requerido');
    if (body.tipo && ![ACCOUNT_TYPES.POR_COBRAR, ACCOUNT_TYPES.POR_PAGAR].includes(body.tipo)) {
        errors.push('tipo debe ser por_cobrar o por_pagar');
    }

    const tipo = body.tipo;
    if (tipo === ACCOUNT_TYPES.POR_COBRAR) {
        if (!isUpdate && !String(body.clienteNombre || '').trim()) {
            errors.push('clienteNombre es requerido');
        }
        if (!isUpdate && !normalizeCedula(body.clienteId)) {
            errors.push('La cédula de identidad es obligatoria (mín. 5 dígitos)');
        }
        if (isUpdate && body.clienteId !== undefined && !normalizeCedula(body.clienteId)) {
            errors.push('La cédula de identidad es obligatoria (mín. 5 dígitos)');
        }
        if (!isUpdate && !String(body.ventaId || '').trim()) {
            errors.push('El ID del comprobante (ventaId) es obligatorio');
        }
        if (isUpdate && body.ventaId !== undefined && !String(body.ventaId || '').trim()) {
            errors.push('El ID del comprobante (ventaId) es obligatorio');
        }
        if (!isUpdate && !String(body.fechaVencimiento || '').trim()) {
            errors.push('La fecha acordada para el pago es obligatoria');
        }
        if (isUpdate && body.fechaVencimiento !== undefined && !String(body.fechaVencimiento || '').trim()) {
            errors.push('La fecha acordada para el pago es obligatoria');
        }
    }
    if (tipo === ACCOUNT_TYPES.POR_PAGAR) {
        if (!isUpdate && !String(body.proveedorNombre || '').trim()) {
            errors.push('proveedorNombre es requerido');
        }
    }

    if (body.montoTotal !== undefined) {
        const monto = Number(body.montoTotal);
        if (Number.isNaN(monto) || monto <= 0) errors.push('montoTotal debe ser mayor a 0');
    } else if (!isUpdate) {
        errors.push('montoTotal es requerido');
    }

    if (body.fechaEmision !== undefined && body.fechaEmision !== '' && !safeDate(body.fechaEmision)) {
        errors.push('fechaEmision inválida');
    }
    if (body.fechaVencimiento !== undefined && body.fechaVencimiento !== '' && !safeDate(body.fechaVencimiento)) {
        errors.push('fechaVencimiento inválida');
    }

    if (body.fechaEmision && body.fechaVencimiento) {
        const emision = safeDate(body.fechaEmision);
        const vencimiento = safeDate(body.fechaVencimiento);
        if (emision && vencimiento && vencimiento.getTime() < emision.getTime()) {
            errors.push('fechaVencimiento no puede ser anterior a fechaEmision');
        }
    }

    return errors;
};

export const getAccounts = async (req, res) => {
    try {
        const {
            empresaId,
            tipo,
            estado,
            search,
            fechaDesde,
            fechaHasta,
            lastDocId,
        } = req.query;
        const pageSize = parseInt(req.query.pageSize, 10) || ACCOUNTS_PER_PAGE;

        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });
        if (!tipo || ![ACCOUNT_TYPES.POR_COBRAR, ACCOUNT_TYPES.POR_PAGAR].includes(tipo)) {
            return res.status(400).json({ error: 'tipo es requerido (por_cobrar | por_pagar)' });
        }

        let query = adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', tipo);

        if (estado && Object.values(ACCOUNT_STATES).includes(estado)) {
            query = query.where('estado', '==', estado);
        }

        query = query.orderBy('createdAt', 'desc');

        // Si hay filtros de fecha o búsqueda, traemos un lote mayor y filtramos en memoria
        const needsClientFilter = Boolean(search || fechaDesde || fechaHasta);
        const fetchLimit = needsClientFilter ? Math.min(pageSize * 15, 300) : pageSize + 1;

        if (lastDocId && !needsClientFilter) {
            const lastDocSnap = await adminDb.collection(COLLECTION).doc(lastDocId).get();
            if (lastDocSnap.exists) {
                query = query.startAfter(lastDocSnap);
            }
        }

        query = query.limit(fetchLimit);
        const snapshot = await query.get();

        let accounts = snapshot.docs.map((doc) => {
            const serialized = serializeAccount(doc.id, doc.data());
            // Recalcular vencido al listar para reflejar el día actual
            const liveEstado = computeAccountEstado(
                serialized.montoTotal,
                serialized.montoPendiente,
                serialized.fechaVencimiento
            );
            return { ...serialized, estado: liveEstado };
        });

        if (fechaDesde) {
            const from = getStartOfDayCaracas(fechaDesde);
            accounts = accounts.filter((a) => {
                if (!a.fechaEmision) return false;
                return new Date(a.fechaEmision).getTime() >= from.getTime();
            });
        }

        if (fechaHasta) {
            const to = getEndOfDayCaracas(fechaHasta);
            accounts = accounts.filter((a) => {
                if (!a.fechaEmision) return false;
                return new Date(a.fechaEmision).getTime() <= to.getTime();
            });
        }

        if (search) {
            const term = search.trim().toLowerCase();
            const termDigits = search.replace(/\D/g, '');
            accounts = accounts.filter((a) => {
                const nombre = (a.clienteNombre || a.proveedorNombre || '').toLowerCase();
                const obs = (a.observaciones || '').toLowerCase();
                const ventaId = (a.ventaId || '').toLowerCase();
                const ci = String(a.clienteId || a.proveedorId || '');
                return nombre.includes(term)
                    || obs.includes(term)
                    || ventaId.includes(term)
                    || (termDigits && ci.includes(termDigits))
                    || ci.toLowerCase().includes(term);
            });
        }

        if (estado) {
            accounts = accounts.filter((a) => a.estado === estado);
        }

        let startIndex = 0;
        if (lastDocId && needsClientFilter) {
            const idx = accounts.findIndex((a) => a.id === lastDocId);
            if (idx !== -1) startIndex = idx + 1;
        }

        const pageSlice = accounts.slice(startIndex, startIndex + pageSize);
        const hasMore = accounts.length > startIndex + pageSize
            || (!needsClientFilter && snapshot.docs.length > pageSize);

        res.status(200).json({
            accounts: pageSlice,
            lastDocId: pageSlice.length > 0 ? pageSlice[pageSlice.length - 1].id : null,
            hasMore,
        });
    } catch (error) {
        console.error('Error getAccounts:', error);
        res.status(500).json({ error: error.message || 'Error al listar cuentas' });
    }
};

export const getAccountStats = async (req, res) => {
    try {
        const { empresaId, tipo } = req.query;

        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });
        if (!tipo || ![ACCOUNT_TYPES.POR_COBRAR, ACCOUNT_TYPES.POR_PAGAR].includes(tipo)) {
            return res.status(400).json({ error: 'tipo es requerido (por_cobrar | por_pagar)' });
        }

        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', tipo)
            .get();

        const now = new Date();
        // Últimos 30 días (incluye hoy)
        const rangeEnd = getEndOfDayCaracas(now);
        const rangeStartDate = new Date(now);
        rangeStartDate.setDate(rangeStartDate.getDate() - 29);
        const rangeStart = getStartOfDayCaracas(rangeStartDate);

        let totalPendiente = 0;
        let totalPendienteBs = 0;
        let totalVencido = 0;
        let totalVencidoBs = 0;
        let vencidosCount = 0;
        let totalMovidoMes = 0;
        let totalMovidoMesBs = 0;

        snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const montoPendiente = Number(data.montoPendiente) || 0;
            const montoTotal = Number(data.montoTotal) || 0;
            const estado = computeAccountEstado(montoTotal, montoPendiente, data.fechaVencimiento, now);

            const pendienteBs = data.montoPendienteBs != null
                ? Number(data.montoPendienteBs)
                : (Number(data.tasaCambio) > 0
                    ? roundMoney(montoPendiente * Number(data.tasaCambio))
                    : 0);

            if (estado !== ACCOUNT_STATES.PAGADO) {
                totalPendiente += montoPendiente;
                totalPendienteBs += pendienteBs || 0;
            }
            if (estado === ACCOUNT_STATES.VENCIDO) {
                totalVencido += montoPendiente;
                totalVencidoBs += pendienteBs || 0;
                vencidosCount += 1;
            }

            const abonos = Array.isArray(data.abonos) ? data.abonos : [];
            abonos.forEach((abono) => {
                const fecha = serializeDate(abono.fecha) || serializeDate(abono.createdAt);
                if (!fecha) return;
                const t = new Date(fecha).getTime();
                if (t >= rangeStart.getTime() && t <= rangeEnd.getTime()) {
                    totalMovidoMes += Number(abono.monto) || 0;
                    if (abono.montoBs != null) {
                        totalMovidoMesBs += Number(abono.montoBs) || 0;
                    } else if (Number(abono.tasaCambio) > 0) {
                        totalMovidoMesBs += roundMoney((Number(abono.monto) || 0) * Number(abono.tasaCambio));
                    }
                }
            });
        });

        res.status(200).json({
            totalPendiente,
            totalPendienteBs: roundMoney(totalPendienteBs),
            totalMovidoMes,
            totalMovidoMesBs: roundMoney(totalMovidoMesBs),
            totalVencido,
            totalVencidoBs: roundMoney(totalVencidoBs),
            vencidosCount,
            totalCuentas: snapshot.size,
        });
    } catch (error) {
        console.error('Error getAccountStats:', error);
        res.status(500).json({ error: error.message || 'Error al obtener estadísticas' });
    }
};

export const getAccountById = async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await adminDb.collection(COLLECTION).doc(id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Cuenta no encontrada' });

        const serialized = serializeAccount(doc.id, doc.data());
        serialized.estado = computeAccountEstado(
            serialized.montoTotal,
            serialized.montoPendiente,
            serialized.fechaVencimiento
        );

        res.status(200).json(serialized);
    } catch (error) {
        console.error('Error getAccountById:', error);
        res.status(500).json({ error: error.message || 'Error al obtener la cuenta' });
    }
};

/**
 * Historial crediticio por cédula: préstamos, estados y montos.
 */
export const getClientCreditHistory = async (req, res) => {
    try {
        const { empresaId, clienteId: rawClienteId } = req.query;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const clienteId = normalizeCedula(rawClienteId);
        if (!clienteId) {
            return res.status(400).json({
                error: 'clienteId inválido (mín. 5 dígitos)',
            });
        }

        const accounts = await findAccountsByClienteId(empresaId, clienteId);
        res.status(200).json(buildCreditHistoryPayload(clienteId, accounts));
    } catch (error) {
        console.error('Error getClientCreditHistory:', error);
        res.status(500).json({ error: error.message || 'Error al obtener historial crediticio' });
    }
};

export const createAccount = async (req, res) => {
    try {
        const errors = validateAccountPayload(req.body);
        if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

        const {
            empresaId,
            tipo,
            clienteId,
            clienteNombre,
            proveedorId,
            proveedorNombre,
            montoTotal,
            fechaEmision,
            fechaVencimiento,
            observaciones,
            ventaId,
            tasaCambio,
        } = req.body;

        const total = Number(montoTotal);
        const tasa = parseTasaCambio(tasaCambio);
        if (!tasa) {
            return res.status(400).json({ error: 'tasaCambio es requerida y debe ser mayor a 0' });
        }

        const totalBs = roundMoney(total * tasa);
        const emision = safeDate(fechaEmision) || getStartOfDayCaracas(new Date());
        const vencimiento = safeDate(fechaVencimiento);

        if (tipo === ACCOUNT_TYPES.POR_COBRAR && !vencimiento) {
            return res.status(400).json({ error: 'La fecha acordada para el pago es obligatoria' });
        }

        let resolvedClienteId = null;
        let resolvedClienteNombre = null;

        if (tipo === ACCOUNT_TYPES.POR_COBRAR) {
            resolvedClienteId = normalizeCedula(clienteId);
            resolvedClienteNombre = String(clienteNombre || '').trim();
            if (!resolvedClienteId) {
                return res.status(400).json({
                    error: 'La cédula de identidad es obligatoria (mín. 5 dígitos)',
                });
            }

            const uniqueness = await assertClienteCedulaNombreUnico({
                empresaId,
                clienteId: resolvedClienteId,
                clienteNombre: resolvedClienteNombre,
            });
            if (!uniqueness.ok) {
                return res.status(409).json({ error: uniqueness.error });
            }
            if (uniqueness.canonicalNombre) {
                resolvedClienteNombre = uniqueness.canonicalNombre;
            }
        }

        const accountData = {
            empresaId,
            tipo,
            clienteId: tipo === ACCOUNT_TYPES.POR_COBRAR ? resolvedClienteId : null,
            clienteNombre: tipo === ACCOUNT_TYPES.POR_COBRAR ? resolvedClienteNombre : null,
            proveedorId: tipo === ACCOUNT_TYPES.POR_PAGAR ? parseOptionalId(proveedorId) : null,
            proveedorNombre: tipo === ACCOUNT_TYPES.POR_PAGAR
                ? String(proveedorNombre || '').trim()
                : null,
            montoTotal: total,
            montoPendiente: total,
            tasaCambio: tasa,
            montoTotalBs: totalBs,
            montoPendienteBs: totalBs,
            fechaEmision: emision,
            fechaVencimiento: vencimiento,
            estado: computeAccountEstado(total, total, vencimiento),
            observaciones: observaciones ? String(observaciones).trim() : '',
            ventaId: tipo === ACCOUNT_TYPES.POR_COBRAR
                ? String(ventaId || '').trim()
                : parseOptionalId(ventaId),
            abonos: [],
            ...(tipo === ACCOUNT_TYPES.POR_COBRAR
                ? { metricsDeferred: true, origenProfit: 0 }
                : {}),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const ref = await adminDb.collection(COLLECTION).add(accountData);
        const created = await ref.get();

        if (tipo === ACCOUNT_TYPES.POR_COBRAR) {
            await clearNotificationsCache(empresaId);
        }

        res.status(201).json(serializeAccount(created.id, created.data()));
    } catch (error) {
        console.error('Error createAccount:', error);
        res.status(500).json({ error: error.message || 'Error al crear la cuenta' });
    }
};

export const updateAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const ref = adminDb.collection(COLLECTION).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Cuenta no encontrada' });

        const current = snap.data();
        const errors = validateAccountPayload(
            { ...req.body, tipo: req.body.tipo || current.tipo, empresaId: current.empresaId },
            { isUpdate: true }
        );
        if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

        const updates = { updatedAt: FieldValue.serverTimestamp() };

        if (req.body.observaciones !== undefined) {
            updates.observaciones = String(req.body.observaciones || '').trim();
        }

        if (current.tipo === ACCOUNT_TYPES.POR_COBRAR) {
            if (req.body.clienteNombre !== undefined) {
                const nombre = String(req.body.clienteNombre || '').trim();
                if (!nombre) return res.status(400).json({ error: 'clienteNombre es requerido' });
                updates.clienteNombre = nombre;
            }
            if (req.body.clienteId !== undefined) {
                const cedula = normalizeCedula(req.body.clienteId);
                if (!cedula) {
                    return res.status(400).json({
                        error: 'La cédula de identidad es obligatoria (mín. 5 dígitos)',
                    });
                }
                updates.clienteId = cedula;
            }

            const nextClienteId = updates.clienteId !== undefined
                ? updates.clienteId
                : current.clienteId;
            const nextClienteNombre = updates.clienteNombre !== undefined
                ? updates.clienteNombre
                : current.clienteNombre;

            if (nextClienteId) {
                const uniqueness = await assertClienteCedulaNombreUnico({
                    empresaId: current.empresaId,
                    clienteId: String(nextClienteId),
                    clienteNombre: nextClienteNombre,
                    excludeAccountId: id,
                });
                if (!uniqueness.ok) {
                    return res.status(409).json({ error: uniqueness.error });
                }
                if (uniqueness.canonicalNombre && updates.clienteNombre !== undefined) {
                    updates.clienteNombre = uniqueness.canonicalNombre;
                }
            }

            if (req.body.ventaId !== undefined) {
                const ventaIdVal = String(req.body.ventaId || '').trim();
                if (!ventaIdVal) {
                    return res.status(400).json({ error: 'El ID del comprobante (ventaId) es obligatorio' });
                }
                updates.ventaId = ventaIdVal;
            }
        }

        if (current.tipo === ACCOUNT_TYPES.POR_PAGAR) {
            if (req.body.proveedorNombre !== undefined) {
                const nombre = String(req.body.proveedorNombre || '').trim();
                if (!nombre) return res.status(400).json({ error: 'proveedorNombre es requerido' });
                updates.proveedorNombre = nombre;
            }
            if (req.body.proveedorId !== undefined) {
                updates.proveedorId = parseOptionalId(req.body.proveedorId);
            }
        }

        if (req.body.fechaEmision !== undefined) {
            const emision = safeDate(req.body.fechaEmision);
            if (!emision) return res.status(400).json({ error: 'fechaEmision inválida' });
            updates.fechaEmision = emision;
        }

        if (req.body.fechaVencimiento !== undefined) {
            if (current.tipo === ACCOUNT_TYPES.POR_COBRAR && !String(req.body.fechaVencimiento || '').trim()) {
                return res.status(400).json({ error: 'La fecha acordada para el pago es obligatoria' });
            }
            updates.fechaVencimiento = req.body.fechaVencimiento
                ? safeDate(req.body.fechaVencimiento)
                : null;
            if (current.tipo === ACCOUNT_TYPES.POR_COBRAR && !updates.fechaVencimiento) {
                return res.status(400).json({ error: 'La fecha acordada para el pago es inválida' });
            }
        }

        // Solo permitir cambiar montoTotal si no hay abonos (re-fija Bs con tasa del momento)
        if (req.body.montoTotal !== undefined) {
            const abonos = Array.isArray(current.abonos) ? current.abonos : [];
            if (abonos.length > 0) {
                return res.status(400).json({
                    error: 'No se puede modificar el monto total si ya hay abonos registrados',
                });
            }
            const total = Number(req.body.montoTotal);
            if (Number.isNaN(total) || total <= 0) {
                return res.status(400).json({ error: 'montoTotal debe ser mayor a 0' });
            }
            const tasa = parseTasaCambio(req.body.tasaCambio) || parseTasaCambio(current.tasaCambio);
            if (!tasa) {
                return res.status(400).json({ error: 'tasaCambio es requerida y debe ser mayor a 0' });
            }
            const totalBs = roundMoney(total * tasa);
            updates.montoTotal = total;
            updates.montoPendiente = total;
            updates.tasaCambio = tasa;
            updates.montoTotalBs = totalBs;
            updates.montoPendienteBs = totalBs;
        } else if (req.body.tasaCambio !== undefined) {
            // Permitir ajustar la tasa solo si aún no hay pagos registrados
            const abonos = Array.isArray(current.abonos) ? current.abonos : [];
            const montoPendiente = Number(current.montoPendiente) || 0;
            const isPaid = current.estado === ACCOUNT_STATES.PAGADO || montoPendiente <= 0.009;
            if (isPaid || abonos.length > 0) {
                return res.status(400).json({
                    error: 'No se puede modificar la tasa después de registrar pagos',
                });
            }
            const tasa = parseTasaCambio(req.body.tasaCambio);
            if (!tasa) {
                return res.status(400).json({ error: 'tasaCambio debe ser mayor a 0' });
            }
            const montoTotal = Number(current.montoTotal) || 0;
            updates.tasaCambio = tasa;
            updates.montoTotalBs = roundMoney(montoTotal * tasa);
            updates.montoPendienteBs = roundMoney(montoPendiente * tasa);
        }

        const nextTotal = updates.montoTotal ?? current.montoTotal;
        const nextPending = updates.montoPendiente ?? current.montoPendiente;
        const nextVencimiento = updates.fechaVencimiento !== undefined
            ? updates.fechaVencimiento
            : current.fechaVencimiento;

        const emisionCheck = updates.fechaEmision || current.fechaEmision;
        if (emisionCheck && nextVencimiento) {
            const e = safeDate(emisionCheck) || (emisionCheck?.toDate ? emisionCheck.toDate() : emisionCheck);
            const v = safeDate(nextVencimiento) || (nextVencimiento?.toDate ? nextVencimiento.toDate() : nextVencimiento);
            if (e && v && v.getTime() < e.getTime()) {
                return res.status(400).json({ error: 'fechaVencimiento no puede ser anterior a fechaEmision' });
            }
        }

        updates.estado = computeAccountEstado(nextTotal, nextPending, nextVencimiento);

        await ref.update(updates);
        const updated = await ref.get();
        if (current.tipo === ACCOUNT_TYPES.POR_COBRAR || updates.tipo === ACCOUNT_TYPES.POR_COBRAR) {
            await clearNotificationsCache(current.empresaId);
        }
        res.status(200).json(serializeAccount(updated.id, updated.data()));
    } catch (error) {
        console.error('Error updateAccount:', error);
        res.status(500).json({ error: error.message || 'Error al actualizar la cuenta' });
    }
};

export const deleteAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const ref = adminDb.collection(COLLECTION).doc(id);
        const snap = await ref.get();
        if (!snap.exists) return res.status(404).json({ error: 'Cuenta no encontrada' });

        const data = snap.data();
        await ref.delete();
        if (data.tipo === ACCOUNT_TYPES.POR_COBRAR) {
            await clearNotificationsCache(data.empresaId);
        }
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleteAccount:', error);
        res.status(500).json({ error: error.message || 'Error al eliminar la cuenta' });
    }
};

/**
 * Registra un abono parcial o total. Actualiza saldo y estado.
 * En cuentas por cobrar, el cobro se reconoce en métricas de ventas
 * (método real del abono) el día del pago.
 */
export const registerPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { monto, fecha, metodoPago, notas, tasaCambio } = req.body;

        const amount = Number(monto);
        if (Number.isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'El monto del abono debe ser mayor a 0' });
        }

        const tasa = parseTasaCambio(tasaCambio);
        if (!tasa) {
            return res.status(400).json({
                error: 'tasaCambio es requerida al registrar el abono (fija el Bs del día)',
            });
        }

        const montoBs = roundMoney(amount * tasa);

        const paymentDate = fecha ? safeDate(fecha) : getStartOfDayCaracas(new Date());
        if (fecha && !paymentDate) {
            return res.status(400).json({ error: 'fecha de abono inválida' });
        }

        const ref = adminDb.collection(COLLECTION).doc(id);

        const result = await adminDb.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) {
                const err = new Error('Cuenta no encontrada');
                err.status = 404;
                throw err;
            }

            const data = snap.data();
            const montoPendiente = Number(data.montoPendiente) || 0;
            const montoTotal = Number(data.montoTotal) || 0;

            if (montoPendiente <= 0) {
                const err = new Error('La cuenta ya está pagada');
                err.status = 400;
                throw err;
            }

            if (amount > montoPendiente + 0.009) {
                const err = new Error(
                    `El abono ($${amount.toFixed(2)}) no puede ser mayor al saldo pendiente ($${montoPendiente.toFixed(2)})`
                );
                err.status = 400;
                throw err;
            }

            const newPending = Math.max(0, roundMoney(montoPendiente - amount));
            const methodKey = paymentMethodKeyFromMetodo(metodoPago);
            if (methodKey === 'prestamo') {
                const err = new Error('El cobro debe registrarse con un método de pago real (no Préstamo)');
                err.status = 400;
                throw err;
            }

            const origenProfit = Number(data.origenProfit) || 0;
            const profitShare = montoTotal > 0.009
                ? roundMoney(origenProfit * (amount / montoTotal))
                : 0;

            const metricsDateStr = paymentDate.toLocaleDateString('sv-SE', {
                timeZone: 'America/Caracas',
            });

            const abono = {
                id: `ABN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                monto: amount,
                montoBs,
                tasaCambio: tasa,
                fecha: paymentDate,
                metodoPago: metodoPago ? String(metodoPago).trim() : '',
                notas: notas ? String(notas).trim() : '',
                createdAt: new Date(),
            };

            const isReceivable = data.tipo === ACCOUNT_TYPES.POR_COBRAR;
            const shouldApplySalesMetrics = shouldApplyCxCPaymentMetrics(data);

            if (shouldApplySalesMetrics) {
                abono.metricsApplied = true;
                abono.metricsDate = metricsDateStr;
                abono.metricsMethodKey = methodKey;
                abono.metricsProfit = profitShare;
            }

            const abonos = Array.isArray(data.abonos) ? [...data.abonos, abono] : [abono];
            const estado = computeAccountEstado(montoTotal, newPending, data.fechaVencimiento);

            const updates = {
                montoPendiente: newPending,
                estado,
                abonos,
                updatedAt: FieldValue.serverTimestamp(),
            };

            if (estado === ACCOUNT_STATES.PAGADO || newPending <= 0.009) {
                const totalBsPagado = roundMoney(
                    abonos.reduce((sum, a) => sum + (Number(a.montoBs) || 0), 0)
                );
                updates.montoPendienteBs = 0;
                updates.montoTotalBs = totalBsPagado;
                updates.tasaCambio = tasa;
                updates.estado = ACCOUNT_STATES.PAGADO;
            }

            tx.update(ref, updates);

            if (shouldApplySalesMetrics) {
                applyCxCCollectionToDailyStats(tx, {
                    adminDb,
                    dailyStatsCollection: DAILY_STATS_COLLECTION,
                    empresaId: data.empresaId,
                    dateStr: metricsDateStr,
                    amountUsd: amount,
                    amountBs: montoBs,
                    methodKey,
                    profitUsd: profitShare,
                    rate: tasa,
                });
                applyEmpresaStatsDelta(tx, data.empresaId, {
                    totalSalesAmount: amount,
                });
            }

            return {
                montoPendiente: newPending,
                estado: updates.estado,
                abono,
                empresaId: data.empresaId,
                shouldApplySalesMetrics,
            };
        });

        if (result.empresaId) {
            const clears = [clearNotificationsCache(result.empresaId)];
            if (result.shouldApplySalesMetrics) {
                clears.push(
                    statsCache.clearByPrefix(`sales-${result.empresaId}`),
                    statsCache.clearByPrefix(`dashboard-${result.empresaId}`),
                    statsCache.clearByPrefix(`history-${result.empresaId}`)
                );
            }
            await Promise.all(clears);
        }

        const updated = await ref.get();
        res.status(200).json({
            ...serializeAccount(updated.id, updated.data()),
            lastAbono: {
                ...result.abono,
                fecha: serializeDate(result.abono.fecha),
                createdAt: serializeDate(result.abono.createdAt),
            },
        });
    } catch (error) {
        console.error('Error registerPayment:', error);
        const status = error.status || 500;
        res.status(status).json({ error: error.message || 'Error al registrar el abono' });
    }
};

/**
 * Reconoce en metricas_diarias los abonos de préstamos/CxC que no aplicaron métricas al cobrar
 * (cuentas antiguas sin metricsDeferred o cobros previos al fix).
 * Idempotente: solo procesa abonos sin metricsApplied.
 */
export const backfillCxCPaymentMetrics = async (req, res) => {
    try {
        const { empresaId } = req.body;
        if (!empresaId) {
            return res.status(400).json({ error: 'empresaId es requerido' });
        }

        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', ACCOUNT_TYPES.POR_COBRAR)
            .get();

        let abonosApplied = 0;
        let accountsUpdated = 0;
        let accountsSkipped = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (!shouldApplyCxCPaymentMetrics(data)) {
                accountsSkipped += 1;
                continue;
            }

            const abonos = Array.isArray(data.abonos) ? [...data.abonos] : [];
            if (abonos.length === 0) continue;

            const montoTotal = Number(data.montoTotal) || 0;
            const origenProfit = Number(data.origenProfit) || 0;
            let abonosChanged = false;

            for (let i = 0; i < abonos.length; i += 1) {
                const abono = abonos[i];
                if (abono.metricsApplied === true) continue;

                const amount = Number(abono.monto) || 0;
                if (amount <= 0) continue;

                const tasa = parseTasaCambio(abono.tasaCambio)
                    || parseTasaCambio(data.tasaCambio);
                if (!tasa) continue;

                const montoBs = abono.montoBs != null && abono.montoBs !== ''
                    ? roundMoney(abono.montoBs)
                    : roundMoney(amount * tasa);

                const methodKey = paymentMethodKeyFromMetodo(abono.metodoPago);
                if (methodKey === 'prestamo') continue;

                const paymentDate = safeDate(abono.fecha)
                    || safeDate(abono.createdAt)
                    || getStartOfDayCaracas(new Date());
                const metricsDateStr = paymentDate.toLocaleDateString('sv-SE', {
                    timeZone: 'America/Caracas',
                });

                const profitShare = montoTotal > 0.009
                    ? roundMoney(origenProfit * (amount / montoTotal))
                    : 0;

                await adminDb.runTransaction(async (tx) => {
                    applyCxCCollectionToDailyStats(tx, {
                        adminDb,
                        dailyStatsCollection: DAILY_STATS_COLLECTION,
                        empresaId,
                        dateStr: metricsDateStr,
                        amountUsd: amount,
                        amountBs: montoBs,
                        methodKey,
                        profitUsd: profitShare,
                        rate: tasa,
                    });
                    applyEmpresaStatsDelta(tx, empresaId, {
                        totalSalesAmount: amount,
                    });
                });

                abonos[i] = {
                    ...abono,
                    metricsApplied: true,
                    metricsDate: metricsDateStr,
                    metricsMethodKey: methodKey,
                    metricsProfit: profitShare,
                };
                abonosChanged = true;
                abonosApplied += 1;
            }

            if (abonosChanged) {
                await doc.ref.update({
                    abonos,
                    updatedAt: FieldValue.serverTimestamp(),
                });
                accountsUpdated += 1;
            }
        }

        await Promise.all([
            statsCache.clearByPrefix(`sales-${empresaId}`),
            statsCache.clearByPrefix(`dashboard-${empresaId}`),
            statsCache.clearByPrefix(`history-${empresaId}`),
        ]);

        res.status(200).json({
            success: true,
            abonosApplied,
            accountsUpdated,
            accountsSkipped,
            totalAccounts: snapshot.size,
        });
    } catch (error) {
        console.error('Error backfillCxCPaymentMetrics:', error);
        res.status(500).json({ error: error.message || 'Error al sincronizar cobros de préstamos' });
    }
};

/**
 * Completa tasas faltantes en abonos antiguos y fija Bs solo en cuentas ya pagadas.
 * Las cuentas abiertas se muestran siempre a tasa actual (no se congelan aquí).
 */
export const backfillAccountRates = async (req, res) => {
    try {
        const { empresaId, tasaCambio } = req.body;
        if (!empresaId) {
            return res.status(400).json({ error: 'empresaId es requerido' });
        }

        const tasaHoy = parseTasaCambio(tasaCambio);
        if (!tasaHoy) {
            return res.status(400).json({ error: 'tasaCambio es requerida y debe ser mayor a 0' });
        }

        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .get();

        let updatedCount = 0;
        let abonosUpdated = 0;
        const batchSize = 400;
        let batch = adminDb.batch();
        let opsInBatch = 0;

        const commitBatch = async () => {
            if (opsInBatch === 0) return;
            await batch.commit();
            batch = adminDb.batch();
            opsInBatch = 0;
        };

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const montoPendiente = Number(data.montoPendiente) || 0;
            const abonos = Array.isArray(data.abonos) ? data.abonos : [];
            const isPaid = data.estado === ACCOUNT_STATES.PAGADO || montoPendiente <= 0.009;

            let abonosChanged = false;
            const nextAbonos = abonos.map((abono) => {
                const abonoTasa = parseTasaCambio(abono.tasaCambio);
                const hasMontoBs = abono.montoBs != null && abono.montoBs !== '';
                if (abonoTasa && hasMontoBs) return abono;

                const tasaAbono = abonoTasa || tasaHoy;
                const montoBs = hasMontoBs
                    ? roundMoney(abono.montoBs)
                    : roundMoney((Number(abono.monto) || 0) * tasaAbono);

                abonosChanged = true;
                abonosUpdated += 1;
                return {
                    ...abono,
                    tasaCambio: tasaAbono,
                    montoBs,
                };
            });

            const updates = {
                updatedAt: FieldValue.serverTimestamp(),
            };
            let shouldUpdate = false;

            if (abonosChanged) {
                updates.abonos = nextAbonos;
                shouldUpdate = true;
            }

            // Solo congelar totales de cuenta cuando ya está pagada
            if (isPaid) {
                const paidBs = roundMoney(
                    nextAbonos.reduce((sum, a) => sum + (Number(a.montoBs) || 0), 0)
                );
                const missingTotalBs = data.montoTotalBs == null || data.montoTotalBs === '';
                const missingPendienteBs = data.montoPendienteBs == null || data.montoPendienteBs === '';
                const missingTasa = !parseTasaCambio(data.tasaCambio);

                if (missingTotalBs || abonosChanged) {
                    updates.montoTotalBs = paidBs > 0
                        ? paidBs
                        : roundMoney((Number(data.montoTotal) || 0) * (parseTasaCambio(data.tasaCambio) || tasaHoy));
                    shouldUpdate = true;
                }
                if (missingPendienteBs || abonosChanged) {
                    updates.montoPendienteBs = 0;
                    shouldUpdate = true;
                }
                if (missingTasa) {
                    const lastAbono = nextAbonos[nextAbonos.length - 1];
                    updates.tasaCambio = parseTasaCambio(lastAbono?.tasaCambio) || tasaHoy;
                    shouldUpdate = true;
                }
            }

            if (!shouldUpdate) continue;

            batch.update(doc.ref, updates);
            opsInBatch += 1;
            updatedCount += 1;

            if (opsInBatch >= batchSize) {
                await commitBatch();
            }
        }

        await commitBatch();

        res.status(200).json({
            success: true,
            updatedCount,
            abonosUpdated,
            tasaCambio: tasaHoy,
            totalCuentas: snapshot.size,
        });
    } catch (error) {
        console.error('Error backfillAccountRates:', error);
        res.status(500).json({ error: error.message || 'Error al actualizar tasas antiguas' });
    }
};
