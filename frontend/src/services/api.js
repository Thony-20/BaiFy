export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
    refreshSubscribers.push(cb);
};

const onRefreshed = (token) => {
    refreshSubscribers.forEach((cb) => cb(token));
    refreshSubscribers = [];
};

const clearSessionAndRedirect = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('profile');
    window.location.href = '/login';
};

const retryRequestWithToken = (url, options, token) => {
    const newOptions = { ...options };
    const headers = newOptions.headers || {};
    const headersObj = headers instanceof Headers
        ? Object.fromEntries(headers.entries())
        : { ...headers };

    headersObj.Authorization = `Bearer ${token}`;
    newOptions.headers = headersObj;
    return fetch(url, newOptions);
};

export const apiFetch = async (url, options = {}) => {
    const res = await fetch(url, options);

    if (res.status !== 401) {
        return res;
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
        clearSessionAndRedirect();
        return res;
    }

    if (!isRefreshing) {
        isRefreshing = true;
        try {
            const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });
            const data = await refreshRes.json();

            if (!refreshRes.ok || !data.token) {
                throw new Error('Refresh failed');
            }

            localStorage.setItem('token', data.token);
            if (data.refreshToken) {
                localStorage.setItem('refreshToken', data.refreshToken);
            }

            isRefreshing = false;
            onRefreshed(data.token);
            return retryRequestWithToken(url, options, data.token);
        } catch (error) {
            isRefreshing = false;
            refreshSubscribers = [];
            clearSessionAndRedirect();
            return res;
        }
    }

    return new Promise((resolve) => {
        subscribeTokenRefresh((newToken) => {
            resolve(retryRequestWithToken(url, options, newToken));
        });
    });
};
