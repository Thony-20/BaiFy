import { useState, useEffect, useCallback } from 'react';
import { getAccounts, getAccountStats } from '../services/accountService';
import useAuthStore from '../store/useAuthStore';
import { ACCOUNT_TYPES, ACCOUNTS_PER_PAGE } from '../utils/constants';

/**
 * Hook para listar cuentas por cobrar/pagar con filtros y paginación cursor.
 */
export default function useAccounts(tipo = ACCOUNT_TYPES.POR_COBRAR) {
  const { userProfile } = useAuthStore();
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [history, setHistory] = useState([null]);
  const [filters, setFilters] = useState({
    estado: '',
    search: '',
    fechaDesde: '',
    fechaHasta: '',
  });

  const empresaId = userProfile?.empresaId;

  const fetchStats = useCallback(async () => {
    if (!empresaId || !tipo) return;
    setStatsLoading(true);
    try {
      const data = await getAccountStats(empresaId, tipo);
      setStats(data);
    } catch (err) {
      console.error('Error fetching account stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [empresaId, tipo]);

  const fetchAccounts = useCallback(async (
    currentFilters,
    targetPage = 1,
    lastDocId = null
  ) => {
    if (!empresaId || !tipo) return;
    setLoading(true);
    setError(null);

    try {
      const options = {
        tipo,
        pageSize: ACCOUNTS_PER_PAGE,
        lastDoc: lastDocId ? { id: lastDocId } : null,
      };
      if (currentFilters.estado) options.estado = currentFilters.estado;
      if (currentFilters.search) options.search = currentFilters.search;
      if (currentFilters.fechaDesde) options.fechaDesde = currentFilters.fechaDesde;
      if (currentFilters.fechaHasta) options.fechaHasta = currentFilters.fechaHasta;

      const result = await getAccounts(empresaId, options);
      setAccounts(result.accounts);
      setHasMore(result.hasMore);
      setPage(targetPage);

      if (targetPage === 1) {
        setHistory([null]);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [empresaId, tipo]);

  const nextPage = useCallback(() => {
    if (!hasMore || loading) return;
    const lastAccount = accounts[accounts.length - 1];
    if (lastAccount) {
      setHistory((prev) => [...prev, lastAccount.id]);
      fetchAccounts(filters, page + 1, lastAccount.id);
    }
  }, [hasMore, loading, accounts, page, filters, fetchAccounts]);

  const prevPage = useCallback(() => {
    if (page === 1 || loading) return;
    const prevCursor = history[page - 2];
    setHistory((prev) => prev.slice(0, -1));
    fetchAccounts(filters, page - 1, prevCursor);
  }, [page, loading, history, filters, fetchAccounts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAccounts(filters, 1, null);
    }, filters.search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchAccounts, filters]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const refetch = useCallback(() => {
    fetchAccounts(filters, page, history[page - 1]);
    fetchStats();
  }, [fetchAccounts, fetchStats, filters, page, history]);

  return {
    accounts,
    stats,
    loading,
    statsLoading,
    hasMore,
    page,
    filters,
    error,
    setFilters,
    nextPage,
    prevPage,
    refetch,
  };
}
