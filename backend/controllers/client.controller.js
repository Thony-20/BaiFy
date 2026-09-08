import { adminDb } from '../config/firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizeCedula } from './account.controller.js';
import {
    aggregateClientSales,
    buildMonthlySpendingFromPurchases,
    getSaleCedula,
    getSaleDate,
    mergeClientMetrics,
} from '../utils/clientAnalytics.js';
import { getEmpresaLoyaltyConfig } from '../utils/loyaltyConfig.js';
import { resolveClientLevel } from '../utils/loyaltyPoints.js';
import { clearNotificationsCache } from '../utils/notificationCache.js';

const COLLECTION = 'clientes';
const SALES_COLLECTION = 'ventas';
const ACCOUNTS_COLLECTION = 'cuentas';
const ACCOUNT_TYPE_RECEIVABLE = 'por_cobrar';

/** Factor de sugerencia: 50% del gasto promedio mensual. */
export const CREDIT_SUGGESTION_FACTOR = 0.5;

export const CREDIT_STATES = {
    SIN_ASIGNAR: 'sin_asignar',
    HABILITADO: 'habilitado',
    DENEGADO: 'denegado',
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const serializeDate = (val) => {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().toISOString();
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val;
    if (typeof val._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
    if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
    return null;
};

export const serializeClient = (id, data) => {
    const creditoEstado = data.creditoEstado || (
        data.creditoHabilitado ? CREDIT_STATES.HABILITADO : CREDIT_STATES.SIN_ASIGNAR
    );
    return {
        id,
        ...data,
        limiteCredito: roundMoney(data.limiteCredito),
        creditoHabilitado: Boolean(data.creditoHabilitado) || creditoEstado === CREDIT_STATES.HABILITADO,
        creditoEstado,
        puntosSaldo: Math.max(0, Math.floor(Number(data.puntosSaldo) || 0)),
        puntosHistorico: Math.max(0, Math.floor(Number(data.puntosHistorico) || 0)),
        nivel: data.nivel || 'nuevo',
        createdAt: serializeDate(data.createdAt),
        updatedAt: serializeDate(data.updatedAt),
        primeraCompraAt: serializeDate(data.primeraCompraAt),
        ultimaCompraAt: serializeDate(data.ultimaCompraAt),
        creditoAsignadoAt: serializeDate(data.creditoAsignadoAt),
        puntosVencenAt: serializeDate(data.puntosVencenAt),
        ultimaAcreditacionAt: serializeDate(data.ultimaAcreditacionAt),
    };
};

/** Alias usado por el módulo de fidelización. */
export const serializeClientForLoyalty = serializeClient;

const normalizeTelefono = (val) => {
    if (val === undefined || val === null) return '';
    return String(val).replace(/\D/g, '');
};

const normalizeNombre = (val) => String(val || '').trim();

const buildCredit = (client, used) => {
    const limite = roundMoney(client.limiteCredito);
    const usado = roundMoney(used);
    return {
        limite,
        limiteCredito: limite,
        usado,
        saldoPendiente: usado,
        disponible: roundMoney(Math.max(0, limite - usado)),
    };
};

const fetchClientSales = async (empresaId, cedula) => {
    const normalized = normalizeCedula(cedula);
    if (!empresaId || !normalized) return [];

    const snapshot = await adminDb.collection(SALES_COLLECTION)
        .where('empresaId', '==', empresaId)
        .get();

    return snapshot.docs
        .map((doc) => ({ ...doc.data(), firestoreId: doc.id }))
        .filter((sale) => normalizeCedula(getSaleCedula(sale)) === normalized)
        .sort((left, right) => {
            const rightTime = getSaleDate(right)?.getTime() || 0;
            const leftTime = getSaleDate(left)?.getTime() || 0;
            return rightTime - leftTime;
        });
};

const groupSalesByCedula = (docs) => {
    const grouped = new Map();
    docs.forEach((doc) => {
        const sale = { ...doc.data(), firestoreId: doc.id };
        const cedula = normalizeCedula(getSaleCedula(sale));
        if (!cedula) return;
        const current = grouped.get(cedula) || [];
        current.push(sale);
        grouped.set(cedula, current);
    });
    return grouped;
};

const groupReceivablesByCedula = (docs) => {
    const grouped = new Map();
    docs.forEach((doc) => {
        const account = doc.data();
        if (account.tipo !== ACCOUNT_TYPE_RECEIVABLE) return;
        const cedula = normalizeCedula(account.clienteId);
        if (!cedula) return;
        const pending = Number(account.montoPendiente);
        if (!Number.isFinite(pending) || pending <= 0) return;
        grouped.set(cedula, (grouped.get(cedula) || 0) + pending);
    });
    return grouped;
};

const getClientDocumentCedula = (client) => (
    normalizeCedula(client?.clienteId || client?.cedula)
);

const buildClientFromSale = (cedula, sales, empresaId) => {
    const sortedSales = [...sales].sort((left, right) => {
        const rightTime = getSaleDate(right)?.getTime() || 0;
        const leftTime = getSaleDate(left)?.getTime() || 0;
        return rightTime - leftTime;
    });
    const latestSale = sortedSales[0] || {};
    const cliente = latestSale.cliente && typeof latestSale.cliente === 'object'
        ? latestSale.cliente
        : {};

    return {
        id: `venta-${cedula}`,
        empresaId,
        clienteId: cedula,
        nombre: normalizeNombre(cliente.nombre) || 'Cliente',
        telefono: normalizeTelefono(cliente.telefono),
        limiteCredito: 0,
        creditoHabilitado: false,
        creditoEstado: CREDIT_STATES.SIN_ASIGNAR,
        puntosSaldo: 0,
        puntosHistorico: 0,
        nivel: 'nuevo',
        createdAt: serializeDate(latestSale.createdAt || latestSale.fechaVenta),
        updatedAt: serializeDate(latestSale.updatedAt || latestSale.fechaVenta),
        primeraCompraAt: null,
        ultimaCompraAt: null,
        creditoAsignadoAt: null,
    };
};

const serializePurchase = (sale) => {
    const comprobanteId = sale.id || sale.ventaId || null;
    return {
        id: comprobanteId,
        firestoreId: sale.firestoreId || null,
        ventaId: comprobanteId,
        controlFiscal: sale.controlFiscal || null,
        total: roundMoney(sale.total),
        fechaVenta: serializeDate(sale.fechaVenta || sale.createdAt),
        items: Array.isArray(sale.items) ? sale.items : [],
        metodosPago: Array.isArray(sale.metodosPago) ? sale.metodosPago : [],
    };
};

/** Meses calendario inclusivos entre dos fechas (mínimo 1). */
export const monthsElapsed = (fromDate, toDate = new Date()) => {
    if (!fromDate || Number.isNaN(fromDate.getTime())) return 1;
    const from = fromDate;
    const to = toDate instanceof Date ? toDate : new Date(toDate);
    const months =
        (to.getFullYear() - from.getFullYear()) * 12
        + (to.getMonth() - from.getMonth())
        + 1;
    return Math.max(1, months);
};

/**
 * Busca cliente por cédula dentro de la empresa.
 */
export const findClientByCedula = async (empresaId, clienteId) => {
    const cedula = normalizeCedula(clienteId);
    if (!empresaId || !cedula) return null;

    try {
        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('clienteId', '==', cedula)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return serializeClient(doc.id, doc.data());
    } catch (error) {
        console.warn('findClientByCedula: query indexada falló, filtro en memoria:', error.message);
        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .get();
        const match = snapshot.docs.find(
            (doc) => String(doc.data().clienteId || '') === cedula
        );
        return match ? serializeClient(match.id, match.data()) : null;
    }
};

/**
 * Métricas de crédito: gasto promedio, sugerencia, saldo pendiente.
 */
export const computeClientCreditMetrics = async (empresaId, clienteId) => {
    const cedula = normalizeCedula(clienteId);
    if (!empresaId || !cedula) {
        return {
            totalGastado: 0,
            meses: 1,
            gastoPromedioMensual: 0,
            sugerenciaCredito: 0,
            saldoPendiente: 0,
            ventasCount: 0,
            primeraCompraAt: null,
            ultimaCompraAt: null,
            compras: [],
            cuentasAbiertas: [],
        };
    }

    let salesSnap;
    try {
        salesSnap = await adminDb
            .collection(SALES_COLLECTION)
            .where('empresaId', '==', empresaId)
            .get();
    } catch (error) {
        console.error('computeClientCreditMetrics ventas:', error);
        salesSnap = { docs: [] };
    }

    const compras = [];
    let totalGastado = 0;
    let primera = null;
    let ultima = null;

    salesSnap.docs.forEach((doc) => {
        const data = doc.data();
        const saleCedula = normalizeCedula(
            data.cliente?.cedula || data.cliente?.clienteId
        );
        if (saleCedula !== cedula) return;

        const total = Number(data.total) || 0;
        totalGastado += total;
        const fechaRaw = data.fechaVenta || data.createdAt;
        const fecha = fechaRaw?.toDate
            ? fechaRaw.toDate()
            : fechaRaw
                ? new Date(fechaRaw)
                : null;

        if (fecha && !Number.isNaN(fecha.getTime())) {
            if (!primera || fecha < primera) primera = fecha;
            if (!ultima || fecha > ultima) ultima = fecha;
        }

        compras.push({
            id: doc.id,
            ventaId: data.id || null,
            controlFiscal: data.controlFiscal || null,
            total: roundMoney(total),
            fechaVenta: serializeDate(fechaRaw),
            metodosPago: Array.isArray(data.metodosPago) ? data.metodosPago : [],
        });
    });

    compras.sort((a, b) => {
        const ta = a.fechaVenta ? new Date(a.fechaVenta).getTime() : 0;
        const tb = b.fechaVenta ? new Date(b.fechaVenta).getTime() : 0;
        return tb - ta;
    });

    const meses = monthsElapsed(primera || new Date());
    const gastoPromedioMensual = roundMoney(totalGastado / meses);
    const sugerenciaCredito = roundMoney(gastoPromedioMensual * CREDIT_SUGGESTION_FACTOR);

    let accountsSnap;
    try {
        accountsSnap = await adminDb
            .collection(ACCOUNTS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', ACCOUNT_TYPE_RECEIVABLE)
            .where('clienteId', '==', cedula)
            .get();
    } catch (error) {
        console.warn('computeClientCreditMetrics cuentas: fallback memoria:', error.message);
        const all = await adminDb
            .collection(ACCOUNTS_COLLECTION)
            .where('empresaId', '==', empresaId)
            .where('tipo', '==', ACCOUNT_TYPE_RECEIVABLE)
            .get();
        accountsSnap = {
            docs: all.docs.filter((d) => String(d.data().clienteId || '') === cedula),
        };
    }

    let saldoPendiente = 0;
    const cuentasAbiertas = [];
    accountsSnap.docs.forEach((doc) => {
        const data = doc.data();
        const pendiente = Number(data.montoPendiente) || 0;
        if (pendiente <= 0.009) return;
        saldoPendiente += pendiente;
        cuentasAbiertas.push({
            id: doc.id,
            ventaId: data.ventaId || null,
            montoTotal: roundMoney(data.montoTotal),
            montoPendiente: roundMoney(pendiente),
            fechaEmision: serializeDate(data.fechaEmision),
            fechaVencimiento: serializeDate(data.fechaVencimiento),
        });
    });

    return {
        totalGastado: roundMoney(totalGastado),
        meses,
        gastoPromedioMensual,
        sugerenciaCredito,
        saldoPendiente: roundMoney(saldoPendiente),
        ventasCount: compras.length,
        primeraCompraAt: primera ? primera.toISOString() : null,
        ultimaCompraAt: ultima ? ultima.toISOString() : null,
        compras,
        cuentasAbiertas,
    };
};

/**
 * Crea el cliente si falta y mantiene las marcas cronológicas de compra.
 */
export const touchClientPurchase = async (empresaId, clientePayload, saleDate = new Date()) => {
    const cedula = normalizeCedula(
        clientePayload?.cedula || clientePayload?.clienteId
    );
    if (!empresaId || !cedula) return null;

    const purchaseDate = saleDate instanceof Date ? saleDate : new Date(saleDate);
    if (Number.isNaN(purchaseDate.getTime())) return null;

    const existing = await findClientByCedula(empresaId, cedula);
    if (!existing) {
        const docRef = adminDb.collection(COLLECTION).doc();
        await docRef.set({
            empresaId,
            clienteId: cedula,
            nombre: normalizeNombre(clientePayload?.nombre) || 'Cliente',
            telefono: normalizeTelefono(clientePayload?.telefono),
            limiteCredito: 0,
            creditoHabilitado: false,
            creditoEstado: CREDIT_STATES.SIN_ASIGNAR,
            puntosSaldo: 0,
            puntosHistorico: 0,
            nivel: 'nuevo',
            puntosVencenAt: null,
            ultimaAcreditacionAt: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            primeraCompraAt: purchaseDate,
            ultimaCompraAt: purchaseDate,
            creditoAsignadoAt: null,
        });
        return docRef.id;
    }

    const firstPurchase = existing.primeraCompraAt ? new Date(existing.primeraCompraAt) : null;
    const lastPurchase = existing.ultimaCompraAt ? new Date(existing.ultimaCompraAt) : null;
    const updates = {
        updatedAt: FieldValue.serverTimestamp(),
        primeraCompraAt: !firstPurchase || purchaseDate < firstPurchase
            ? purchaseDate
            : firstPurchase,
        ultimaCompraAt: !lastPurchase || purchaseDate > lastPurchase
            ? purchaseDate
            : lastPurchase,
    };
    if (clientePayload?.telefono && !existing.telefono) {
        updates.telefono = normalizeTelefono(clientePayload.telefono);
    }

    await adminDb.collection(COLLECTION).doc(existing.id).update(updates);
    return existing.id;
};

export const recalculateClientPurchaseDates = async (empresaId, clienteId) => {
    const cedula = normalizeCedula(clienteId);
    if (!empresaId || !cedula) return null;

    const [client, salesSnapshot] = await Promise.all([
        findClientByCedula(empresaId, cedula),
        adminDb.collection(SALES_COLLECTION).where('empresaId', '==', empresaId).get(),
    ]);
    if (!client) return null;

    const dates = salesSnapshot.docs
        .map((doc) => doc.data())
        .filter((sale) => getSaleCedula(sale) === cedula)
        .map(getSaleDate)
        .filter(Boolean)
        .sort((a, b) => a - b);

    await adminDb.collection(COLLECTION).doc(client.id).update({
        primeraCompraAt: dates[0] || null,
        ultimaCompraAt: dates[dates.length - 1] || null,
        updatedAt: FieldValue.serverTimestamp(),
    });

    return {
        primeraCompraAt: dates[0]?.toISOString() || null,
        ultimaCompraAt: dates[dates.length - 1]?.toISOString() || null,
    };
};

export const getClientsAnalytics = async (req, res) => {
    try {
        const { empresaId, search } = req.query;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const [clientsSnapshot, salesSnapshot, loyaltyConfig] = await Promise.all([
            adminDb.collection(COLLECTION).where('empresaId', '==', empresaId).get(),
            adminDb.collection(SALES_COLLECTION).where('empresaId', '==', empresaId).get(),
            getEmpresaLoyaltyConfig(empresaId),
        ]);
        const salesByCedula = groupSalesByCedula(salesSnapshot.docs);
        const query = String(search || '').trim().toLowerCase();
        const queryDigits = query.replace(/\D/g, '');

        const registeredClients = clientsSnapshot.docs.map((doc) => (
            serializeClient(doc.id, doc.data())
        ));
        const knownCedulas = new Set(
            registeredClients
                .map((client) => getClientDocumentCedula(client))
                .filter(Boolean)
        );

        const saleOnlyClients = [...salesByCedula.entries()]
            .filter(([cedula]) => cedula && !knownCedulas.has(cedula))
            .map(([cedula, sales]) => buildClientFromSale(cedula, sales, empresaId));

        const clients = [...registeredClients, ...saleOnlyClients]
            .filter((client) => {
                if (!query) return true;
                return String(client.nombre || '').toLowerCase().includes(query)
                    || String(client.clienteId || '').includes(queryDigits || query)
                    || String(client.telefono || '').includes(queryDigits || query);
            })
            .map((client) => {
                const cedula = getClientDocumentCedula(client);
                const sales = cedula ? (salesByCedula.get(cedula) || []) : [];
                const metrics = mergeClientMetrics(
                    aggregateClientSales(sales),
                    {
                        ultimaCompraAt: client.ultimaCompraAt,
                        primeraCompraAt: client.primeraCompraAt,
                    }
                );
                const nivel = resolveClientLevel({
                    totalGastado: metrics.totalGastado,
                    comprasCount: metrics.comprasCount,
                    primeraCompraAt: metrics.primeraCompraAt,
                    config: loyaltyConfig,
                });
                return {
                    ...client,
                    ...metrics,
                    nivel,
                    productoMasComprado: metrics.topProducts[0] || null,
                };
            })
            .sort((a, b) => String(a.nombre || '').localeCompare(
                String(b.nombre || ''),
                'es',
                { sensitivity: 'base' }
            ));

        return res.status(200).json({ clients });
    } catch (error) {
        console.error('Error getClientsAnalytics:', error);
        return res.status(500).json({ error: error.message || 'Error al obtener analíticas de clientes' });
    }
};

export const getClientAnalytics = async (req, res) => {
    try {
        const { id } = req.params;
        const { empresaId } = req.query;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const clientDoc = await adminDb.collection(COLLECTION).doc(id).get();
        if (!clientDoc.exists) return res.status(404).json({ error: 'Cliente no encontrado' });
        const client = serializeClient(clientDoc.id, clientDoc.data());
        if (client.empresaId !== empresaId) {
            return res.status(403).json({ error: 'Cliente no pertenece a esta empresa' });
        }

        const clientCedula = getClientDocumentCedula(client);

        const [sales, accountsSnapshot] = await Promise.all([
            fetchClientSales(empresaId, clientCedula),
            adminDb.collection(ACCOUNTS_COLLECTION).where('empresaId', '==', empresaId).get(),
        ]);
        const metrics = mergeClientMetrics(
            aggregateClientSales(sales),
            {
                ultimaCompraAt: client.ultimaCompraAt,
                primeraCompraAt: client.primeraCompraAt,
            }
        );
        const receivables = groupReceivablesByCedula(accountsSnapshot.docs);
        const credit = buildCredit(
            client,
            receivables.get(clientCedula) || 0
        );
        const purchases = sales
            .map(serializePurchase)
            .sort((a, b) => (
                new Date(b.fechaVenta || 0).getTime() - new Date(a.fechaVenta || 0).getTime()
            ));
        const {
            gastoMensual: aggregatedMonthlySpending,
            topProducts,
            paymentMethods,
            ...summaryMetrics
        } = metrics;
        const monthlySpending = aggregatedMonthlySpending.length > 0
            ? aggregatedMonthlySpending
            : buildMonthlySpendingFromPurchases(purchases);

        return res.status(200).json({
            client,
            metrics: summaryMetrics,
            purchases,
            monthlySpending,
            topProducts,
            paymentMethods,
            credit,
        });
    } catch (error) {
        console.error('Error getClientAnalytics:', error);
        return res.status(500).json({ error: error.message || 'Error al obtener analítica del cliente' });
    }
};

export const listClients = async (req, res) => {
    try {
        const { empresaId, search, withMetrics } = req.query;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const snapshot = await adminDb
            .collection(COLLECTION)
            .where('empresaId', '==', empresaId)
            .get();

        let clients = snapshot.docs.map((doc) => serializeClient(doc.id, doc.data()));

        const q = String(search || '').trim().toLowerCase();
        if (q) {
            const digits = q.replace(/\D/g, '');
            clients = clients.filter((c) => {
                const nombre = String(c.nombre || '').toLowerCase();
                const telefono = String(c.telefono || '');
                const cedula = String(c.clienteId || '');
                return (
                    nombre.includes(q)
                    || telefono.includes(digits || q)
                    || cedula.includes(digits || q)
                );
            });
        }

        clients.sort((a, b) => {
            const na = String(a.nombre || '').toLowerCase();
            const nb = String(b.nombre || '').toLowerCase();
            return na.localeCompare(nb, 'es');
        });

        if (String(withMetrics) === 'true' || withMetrics === true) {
            const enriched = await Promise.all(
                clients.map(async (client) => {
                    const metrics = await computeClientCreditMetrics(
                        empresaId,
                        client.clienteId
                    );
                    const limiteCredito = roundMoney(client.limiteCredito);
                    return {
                        ...client,
                        totalGastado: metrics.totalGastado,
                        meses: metrics.meses,
                        gastoPromedioMensual: metrics.gastoPromedioMensual,
                        creditoHabilitado: client.creditoHabilitado,
                        creditoEstado: client.creditoEstado,
                        sugerenciaCredito: metrics.sugerenciaCredito,
                        saldoPendiente: metrics.saldoPendiente,
                        disponible: roundMoney(
                            Math.max(0, limiteCredito - metrics.saldoPendiente)
                        ),
                        ventasCount: metrics.ventasCount,
                    };
                })
            );
            return res.status(200).json({ clients: enriched });
        }

        res.status(200).json({ clients });
    } catch (error) {
        console.error('Error listClients:', error);
        res.status(500).json({ error: error.message || 'Error al listar clientes' });
    }
};

export const getClientByCedula = async (req, res) => {
    try {
        const { empresaId, clienteId } = req.query;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const cedula = normalizeCedula(clienteId);
        if (!cedula) {
            return res.status(400).json({ error: 'clienteId inválido (mín. 5 dígitos)' });
        }

        const client = await findClientByCedula(empresaId, cedula);
        if (!client) {
            return res.status(200).json({ exists: false, client: null });
        }

        res.status(200).json({ exists: true, client });
    } catch (error) {
        console.error('Error getClientByCedula:', error);
        res.status(500).json({ error: error.message || 'Error al buscar cliente' });
    }
};

export const createClient = async (req, res) => {
    try {
        const { empresaId, nombre, clienteId, telefono, limiteCredito } = req.body;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const cedula = normalizeCedula(clienteId);
        const name = normalizeNombre(nombre);
        if (!cedula) {
            return res.status(400).json({ error: 'Cédula inválida (mín. 5 dígitos)' });
        }
        if (!name) {
            return res.status(400).json({ error: 'Nombre y apellido son requeridos' });
        }

        const existing = await findClientByCedula(empresaId, cedula);
        if (existing) {
            return res.status(409).json({
                error: `La cédula ${cedula} ya está registrada como "${existing.nombre}"`,
                client: existing,
            });
        }

        const phone = normalizeTelefono(telefono);
        const docRef = adminDb.collection(COLLECTION).doc();
        const payload = {
            empresaId,
            clienteId: cedula,
            nombre: name,
            telefono: phone,
            limiteCredito: roundMoney(limiteCredito),
            creditoHabilitado: false,
            creditoEstado: CREDIT_STATES.SIN_ASIGNAR,
            puntosSaldo: 0,
            puntosHistorico: 0,
            nivel: 'nuevo',
            puntosVencenAt: null,
            ultimaAcreditacionAt: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            primeraCompraAt: null,
            ultimaCompraAt: null,
            creditoAsignadoAt: null,
        };

        await docRef.set(payload);
        const saved = await docRef.get();
        await clearNotificationsCache(empresaId);
        res.status(201).json(serializeClient(docRef.id, saved.data()));
    } catch (error) {
        console.error('Error createClient:', error);
        res.status(500).json({ error: error.message || 'Error al crear cliente' });
    }
};

export const updateClient = async (req, res) => {
    try {
        const { id } = req.params;
        const docRef = adminDb.collection(COLLECTION).doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'Cliente no encontrado' });

        const current = snap.data();
        const updates = { updatedAt: FieldValue.serverTimestamp() };

        if (req.body.nombre !== undefined) {
            const name = normalizeNombre(req.body.nombre);
            if (!name) return res.status(400).json({ error: 'Nombre inválido' });
            updates.nombre = name;
        }
        if (req.body.telefono !== undefined) {
            updates.telefono = normalizeTelefono(req.body.telefono);
        }
        if (req.body.limiteCredito !== undefined) {
            const lim = Number(req.body.limiteCredito);
            if (Number.isNaN(lim) || lim < 0) {
                return res.status(400).json({ error: 'limiteCredito debe ser ≥ 0' });
            }
            updates.limiteCredito = roundMoney(lim);
        }
        if (req.body.creditoEstado !== undefined) {
            const estado = String(req.body.creditoEstado || '').trim();
            const valid = Object.values(CREDIT_STATES);
            if (!valid.includes(estado)) {
                return res.status(400).json({
                    error: `creditoEstado inválido (${valid.join(' | ')})`,
                });
            }
            updates.creditoEstado = estado;
            updates.creditoHabilitado = estado === CREDIT_STATES.HABILITADO;
            if (estado === CREDIT_STATES.HABILITADO) {
                updates.creditoAsignadoAt = FieldValue.serverTimestamp();
            }
            if (estado === CREDIT_STATES.DENEGADO) {
                updates.limiteCredito = 0;
                updates.creditoHabilitado = false;
            }
        }
        if (req.body.creditoHabilitado !== undefined && req.body.creditoEstado === undefined) {
            const enabled = Boolean(req.body.creditoHabilitado);
            updates.creditoHabilitado = enabled;
            updates.creditoEstado = enabled
                ? CREDIT_STATES.HABILITADO
                : CREDIT_STATES.SIN_ASIGNAR;
            if (enabled) updates.creditoAsignadoAt = FieldValue.serverTimestamp();
        }

        await docRef.update(updates);
        const next = await docRef.get();
        await clearNotificationsCache(current.empresaId);
        res.status(200).json(serializeClient(id, next.data()));
    } catch (error) {
        console.error('Error updateClient:', error);
        res.status(500).json({ error: error.message || 'Error al actualizar cliente' });
    }
};

/**
 * Aprobar / editar / denegar crédito asignado.
 * Body: { accion: 'aprobar'|'editar'|'denegar', limiteCredito? }
 */
export const assignClientCredit = async (req, res) => {
    try {
        const { id } = req.params;
        const { accion, limiteCredito } = req.body || {};
        const docRef = adminDb.collection(COLLECTION).doc(id);
        const snap = await docRef.get();
        if (!snap.exists) return res.status(404).json({ error: 'Cliente no encontrado' });

        const current = snap.data();
        const metrics = await computeClientCreditMetrics(
            current.empresaId,
            current.clienteId
        );
        const sugerencia = metrics.sugerenciaCredito;
        const updates = { updatedAt: FieldValue.serverTimestamp() };

        if (accion === 'aprobar') {
            const lim = limiteCredito !== undefined && limiteCredito !== ''
                ? Number(limiteCredito)
                : sugerencia;
            if (Number.isNaN(lim) || lim < 0) {
                return res.status(400).json({ error: 'limiteCredito inválido' });
            }
            updates.limiteCredito = roundMoney(lim);
            updates.creditoHabilitado = true;
            updates.creditoEstado = CREDIT_STATES.HABILITADO;
            updates.creditoAsignadoAt = FieldValue.serverTimestamp();
        } else if (accion === 'editar') {
            const lim = Number(limiteCredito);
            if (Number.isNaN(lim) || lim < 0) {
                return res.status(400).json({ error: 'limiteCredito inválido' });
            }
            updates.limiteCredito = roundMoney(lim);
            updates.creditoHabilitado = lim > 0;
            updates.creditoEstado = lim > 0
                ? CREDIT_STATES.HABILITADO
                : CREDIT_STATES.SIN_ASIGNAR;
            if (lim > 0) updates.creditoAsignadoAt = FieldValue.serverTimestamp();
        } else if (accion === 'denegar') {
            updates.limiteCredito = 0;
            updates.creditoHabilitado = false;
            updates.creditoEstado = CREDIT_STATES.DENEGADO;
        } else {
            return res.status(400).json({
                error: "accion debe ser 'aprobar', 'editar' o 'denegar'",
            });
        }

        await docRef.update(updates);
        const next = await docRef.get();
        const client = serializeClient(id, next.data());
        res.status(200).json({
            client,
            sugerenciaCredito: sugerencia,
            disponible: roundMoney(
                Math.max(0, client.limiteCredito - metrics.saldoPendiente)
            ),
        });
    } catch (error) {
        console.error('Error assignClientCredit:', error);
        res.status(500).json({ error: error.message || 'Error al asignar crédito' });
    }
};

export const getClientCreditProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { empresaId } = req.query;
        if (!empresaId) return res.status(400).json({ error: 'empresaId es requerido' });

        const doc = await adminDb.collection(COLLECTION).doc(id).get();
        if (!doc.exists) return res.status(404).json({ error: 'Cliente no encontrado' });

        const client = serializeClient(doc.id, doc.data());
        if (client.empresaId !== empresaId) {
            return res.status(403).json({ error: 'Cliente no pertenece a esta empresa' });
        }

        const metrics = await computeClientCreditMetrics(empresaId, client.clienteId);
        const limiteCredito = roundMoney(client.limiteCredito);

        res.status(200).json({
            client,
            ...metrics,
            limiteCredito,
            disponible: roundMoney(Math.max(0, limiteCredito - metrics.saldoPendiente)),
            suggestionFactor: CREDIT_SUGGESTION_FACTOR,
        });
    } catch (error) {
        console.error('Error getClientCreditProfile:', error);
        res.status(500).json({ error: error.message || 'Error al obtener perfil crediticio' });
    }
};
