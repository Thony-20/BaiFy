import { API_URL, getHeaders } from './api';

export async function registerUser(email, password, empresaNombre, plan, paymentReference) {
    const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, password, empresaNombre, plan, paymentReference })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al registrar');
    
    // Save token
    localStorage.setItem('token', data.token);
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify({ uid: data.profile.uid, email }));
    localStorage.setItem('profile', JSON.stringify(data.profile));
    
    return { user: { uid: data.profile.uid, email }, profile: data.profile };
}

export async function loginUser(email, password) {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');

    localStorage.setItem('token', data.token);
    if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify({ uid: data.profile.uid, email }));
    localStorage.setItem('profile', JSON.stringify(data.profile));

    return { user: { uid: data.profile.uid, email }, profile: data.profile };
}

export async function logoutUser() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('profile');
}

export async function getUserProfile(uid) {
    const profile = localStorage.getItem('profile');
    return profile ? JSON.parse(profile) : null;
}

export function onAuthChange(callback) {
    // Dummy func para no romper llamadas obsoletas
    return () => {};
}

export async function resetPassword(email) {
    const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al enviar reseteo');
}

export async function checkEmail(email) {
    const res = await fetch(`${API_URL}/auth/check-email?email=${encodeURIComponent(email)}`, {
        method: 'GET',
        headers: getHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al verificar email');
    return data.exists;
}

export async function confirmReset(code, newPassword) {
    throw new Error('Sin implementar');
}

export async function upgradePlan(planId, paymentReference) {
    const res = await fetch(`${API_URL}/auth/upgrade-plan`, {
        method: 'POST',
        headers: getHeaders(), // token jwt va aqui automatically
        body: JSON.stringify({ planId, paymentReference })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al solicitar mejora de plan');
    return data;
}

export async function renewPlan(paymentReference) {
    const res = await fetch(`${API_URL}/auth/renew-plan`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ paymentReference })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al solicitar renovación');
    return data;
}

export async function updateCompanySettings(empresaId, settings) {
    const res = await fetch(`${API_URL}/auth/company-settings`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ empresaId, settings })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al actualizar configuraciones');
    return data;
}

