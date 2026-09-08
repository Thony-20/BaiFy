import { API_URL, getHeaders, apiFetch } from './api';

const ADMIN_API_URL = `${API_URL}/admin`;

/**
 * Obtener usuarios con pagos pendientes
 */
export const getPendingUsers = async () => {
    const res = await apiFetch(`${ADMIN_API_URL}/users/pending`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

/**
 * Obtener todos los usuarios
 */
export const getAllUsers = async () => {
    const res = await apiFetch(`${ADMIN_API_URL}/users`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};

/**
 * Actualizar el estado de un usuario (active, rejected, pending)
 */
export const updateUserStatus = async (uid, status) => {
    const res = await apiFetch(`${ADMIN_API_URL}/users/${uid}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
};
