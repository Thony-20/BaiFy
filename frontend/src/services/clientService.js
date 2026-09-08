import { API_URL, getHeaders, apiFetch } from './api';

export async function listClients(empresaId, options = {}) {
  const { search = '', withMetrics = false } = options;
  const query = new URLSearchParams({ empresaId });
  if (search) query.append('search', search);
  if (withMetrics) query.append('withMetrics', 'true');

  const res = await apiFetch(`${API_URL}/clients?${query.toString()}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al listar clientes');
  return data.clients || [];
}

export async function getClientByCedula(empresaId, clienteId) {
  const query = new URLSearchParams({ empresaId, clienteId });
  const res = await apiFetch(`${API_URL}/clients/by-cedula?${query.toString()}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al buscar cliente');
  return data;
}

export async function createClient(payload) {
  const res = await apiFetch(`${API_URL}/clients`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al crear cliente');
  return data;
}

export async function updateClient(id, payload) {
  const res = await apiFetch(`${API_URL}/clients/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al actualizar cliente');
  return data;
}

export async function assignClientCredit(id, payload) {
  const res = await apiFetch(`${API_URL}/clients/${id}/credit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al asignar crédito');
  return data;
}

export async function getClientCreditProfile(id, empresaId) {
  const query = new URLSearchParams({ empresaId });
  const res = await apiFetch(
    `${API_URL}/clients/${id}/credit-profile?${query.toString()}`,
    { headers: getHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al obtener perfil crediticio');
  return data;
}

export async function getClientsAnalytics(empresaId) {
  const query = new URLSearchParams({ empresaId });
  const res = await apiFetch(`${API_URL}/clients/analytics?${query.toString()}`, {
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al cargar clientes');
  return Array.isArray(data.clients) ? data.clients : [];
}

export async function getClientAnalytics(id, empresaId) {
  const query = new URLSearchParams({ empresaId });
  const res = await apiFetch(
    `${API_URL}/clients/${id}/analytics?${query.toString()}`,
    { headers: getHeaders() }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error al cargar el cliente');
  return data;
}
