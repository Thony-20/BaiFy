import { API_URL, getHeaders, apiFetch } from './api';

export async function adjustStock(productoId, tipo, cantidad, usuarioId, empresaId, notas = '', idempotencyKey = null) {
    const res = await apiFetch(`${API_URL}/stock/adjust`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ productoId, tipo, cantidad, usuarioId, empresaId, notas, idempotencyKey })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getMovimientos(productoId, empresaId, options = {}) {
    const { lastDocId, limit = 30 } = options;
    const query = new URLSearchParams({ productoId, empresaId, limit });
    if (lastDocId) query.append('lastDocId', lastDocId);
    const res = await apiFetch(`${API_URL}/stock/history?${query.toString()}`, {
        headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getRecentMovimientos(empresaId, options = {}) {
    const { limitCount = 5, from, to, lastDocId } = options;
    const query = new URLSearchParams({ empresaId, limitCount });
    if (from) query.append('from', from);
    if (to) query.append('to', to);
    if (lastDocId) query.append('lastDocId', lastDocId);

    const res = await apiFetch(`${API_URL}/stock/recent?${query.toString()}`, {
        headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}
export async function getDashboardStats(empresaId, from, to, expirationLimit, expirationMonths) {
    let url = `${API_URL}/stock/stats?empresaId=${empresaId}`;
    if (from) url += `&from=${from}`;
    if (to) url += `&to=${to}`;
    if (expirationLimit) url += `&expirationLimit=${expirationLimit}`;
    if (expirationMonths != null && expirationMonths !== '') {
        url += `&expirationMonths=${expirationMonths}`;
    }
    
    const res = await apiFetch(url, {
        headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function recalculateStats(empresaId) {
    const res = await apiFetch(`${API_URL}/stock/recalculate?empresaId=${empresaId}`, {
        headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}
