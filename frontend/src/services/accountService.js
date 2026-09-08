import { API_URL, getHeaders, apiFetch } from './api';

export async function getAccounts(empresaId, options = {}) {
    const {
        tipo,
        estado,
        search,
        fechaDesde,
        fechaHasta,
        lastDoc,
        pageSize = 7,
    } = options;

    const query = new URLSearchParams({ empresaId, pageSize: String(pageSize) });
    if (tipo) query.append('tipo', tipo);
    if (estado) query.append('estado', estado);
    if (search) query.append('search', search);
    if (fechaDesde) query.append('fechaDesde', fechaDesde);
    if (fechaHasta) query.append('fechaHasta', fechaHasta);
    if (lastDoc?.id) query.append('lastDocId', lastDoc.id);

    const res = await apiFetch(`${API_URL}/accounts?${query.toString()}`, {
        headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    return {
        accounts: data.accounts,
        lastDoc: data.lastDocId ? { id: data.lastDocId } : null,
        hasMore: data.hasMore,
    };
}

export async function getAccountStats(empresaId, tipo) {
    const query = new URLSearchParams({ empresaId, tipo });
    const res = await apiFetch(`${API_URL}/accounts/stats?${query.toString()}`, {
        headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getAccountById(accountId) {
    const res = await apiFetch(`${API_URL}/accounts/${accountId}`, {
        headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function createAccount(accountData) {
    const res = await apiFetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(accountData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function updateAccount(accountId, accountData) {
    const res = await apiFetch(`${API_URL}/accounts/${accountId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(accountData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function deleteAccount(accountId) {
    const res = await apiFetch(`${API_URL}/accounts/${accountId}`, {
        method: 'DELETE',
        headers: getHeaders(),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
    }
}

export async function registerAccountPayment(accountId, paymentData) {
    const res = await apiFetch(`${API_URL}/accounts/${accountId}/payments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(paymentData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

/** Completa tasa/Bs faltantes en cuentas antiguas con la tasa del día. */
export async function backfillAccountRates(empresaId, tasaCambio) {
    const res = await apiFetch(`${API_URL}/accounts/backfill-rates`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ empresaId, tasaCambio }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

/** Sincroniza cobros de préstamos/CxC no reflejados en métricas de ventas. */
export async function backfillCxCPaymentMetrics(empresaId) {
    const res = await apiFetch(`${API_URL}/accounts/backfill-cxc-metrics`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ empresaId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

/** Historial crediticio de un cliente por cédula. */
export async function getClientCreditHistory(empresaId, clienteId) {
    const query = new URLSearchParams({
        empresaId,
        clienteId: String(clienteId || ''),
    });
    const res = await apiFetch(`${API_URL}/accounts/credit-history?${query.toString()}`, {
        headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}
