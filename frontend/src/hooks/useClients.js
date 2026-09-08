import { useCallback, useEffect, useState } from 'react';
import { getClientsAnalytics } from '../services/clientService';

export default function useClients(empresaId) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadClients = async () => {
      if (!empresaId) {
        setClients([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const result = await getClientsAnalytics(empresaId);
        if (!cancelled) setClients(result);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || 'No fue posible cargar los clientes');
          setClients([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadClients();
    return () => {
      cancelled = true;
    };
  }, [empresaId, refreshKey]);

  return { clients, loading, error, refetch };
}
