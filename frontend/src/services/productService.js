import { API_URL, getHeaders, apiFetch } from './api';

export async function getProducts(empresaId, options = {}) {
    const { estado, lastDoc, pageSize = 10, search, cursor, signal } = options;
    const query = new URLSearchParams({ empresaId, pageSize });
    if (estado) query.append('estado', estado);
    if (search) query.append('search', search);
    if (cursor) query.append('cursor', cursor);
    else if (lastDoc && lastDoc.id) query.append('lastDocId', lastDoc.id);

    const res = await apiFetch(`${API_URL}/products?${query.toString()}`, {
        headers: getHeaders(),
        signal
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    return {
        products: data.products,
        lastDoc: data.lastDocId ? { id: data.lastDocId } : null,
        nextCursor: data.nextCursor || null,
        hasMore: data.hasMore
    };
}

export async function getProductBySku(empresaId, sku, estado) {
    const query = new URLSearchParams({ empresaId, sku });
    if (estado) query.append('estado', estado);

    const res = await apiFetch(`${API_URL}/products/by-sku?${query.toString()}`, {
        headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) return null;
    return data;
}

export async function getAllProducts(empresaId, options = {}) {
    const { lastDocId, pageSize = 50 } = options;
    const query = new URLSearchParams({ empresaId, pageSize });
    if (lastDocId) query.append('lastDocId', lastDocId);
    const res = await apiFetch(`${API_URL}/products/all?${query.toString()}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getProductById(productId) {
    const res = await apiFetch(`${API_URL}/products/${productId}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) return null;
    return data;
}

export async function createProduct(productData) {
    const res = await apiFetch(`${API_URL}/products`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(productData)
    });
    const data = await res.json();
    if (!res.ok) {
        const error = new Error(data.error);
        if (data.limitReached) error.limitReached = true;
        throw error;
    }
    return data;
}

export async function updateProduct(productId, productData) {
    const res = await apiFetch(`${API_URL}/products/${productId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(productData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function deleteProduct(productId) {
    const res = await apiFetch(`${API_URL}/products/${productId}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
    }
}

export async function bulkImportProducts(empresaId, products) {
    const res = await apiFetch(`${API_URL}/products/bulk-import`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ empresaId, products })
    });
    const data = await res.json();
    if (!res.ok) {
        const error = new Error(data.error);
        if (data.limitReached) error.limitReached = true;
        throw error;
    }
    return data;
}

export async function getLowStockProducts(empresaId, options = {}) {
    const { lastDoc, pageSize = 5 } = options;
    const query = new URLSearchParams({ empresaId, pageSize });
    if (lastDoc && lastDoc.id) query.append('lastDocId', lastDoc.id);

    const res = await apiFetch(`${API_URL}/products/low-stock?${query.toString()}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getExpiringProducts(empresaId, options = {}) {
    const { lastDoc, pageSize = 5, months = 2 } = options;
    const query = new URLSearchParams({ empresaId, pageSize, months });
    if (lastDoc && lastDoc.id) query.append('lastDocId', lastDoc.id);

    const res = await apiFetch(`${API_URL}/products/expiring?${query.toString()}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getExpiredProducts(empresaId, options = {}) {
    const { lastDoc, pageSize = 5 } = options;
    const query = new URLSearchParams({ empresaId, pageSize });
    if (lastDoc && lastDoc.id) query.append('lastDocId', lastDoc.id);

    const res = await apiFetch(`${API_URL}/products/expired?${query.toString()}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}
