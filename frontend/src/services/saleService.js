import { API_URL, getHeaders, apiFetch } from './api';

export const createSale = async (saleData) => {
    const response = await apiFetch(`${API_URL}/sales`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(saleData)
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al procesar la venta");
    }

    return await response.json();
};

export const getSalesHistory = async (empresaId, options = {}) => {
    const { limit = 10, lastDocId, search, from, to } = options;
    let url = `${API_URL}/sales/history?empresaId=${empresaId}&limit=${limit}`;

    if (lastDocId) url += `&lastDocId=${encodeURIComponent(lastDocId)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (from) url += `&from=${encodeURIComponent(from)}`;
    if (to) url += `&to=${encodeURIComponent(to)}`;

    const response = await apiFetch(url, {
        headers: getHeaders()
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al obtener historial de ventas");
    }

    return await response.json();
};

export const getSalesStats = async (empresaId, from, to) => {
    let url = `${API_URL}/sales/stats?empresaId=${empresaId}`;
    if (from) url += `&from=${from}`;
    if (to) url += `&to=${to}`;

    const response = await apiFetch(url, {
        headers: getHeaders()
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al obtener estadísticas de ventas");
    }

    return await response.json();
};

export const deleteSale = async (empresaId, saleId) => {
    const response = await apiFetch(`${API_URL}/sales/${saleId}?empresaId=${empresaId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al eliminar la factura");
    }

    return await response.json();
};

export const getProductRanking = async (empresaId, options = {}) => {
    const { from, to, type = 'top', page = 1, limit = 10, search = '' } = options;
    let url = `${API_URL}/sales/ranking?empresaId=${empresaId}&type=${type}&page=${page}&limit=${limit}`;
    
    if (from) url += `&from=${from}`;
    if (to) url += `&to=${to}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const response = await apiFetch(url, {
        headers: getHeaders()
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al obtener ranking de productos");
    }

    return await response.json();
};

