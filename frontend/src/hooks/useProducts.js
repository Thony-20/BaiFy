import { useState, useEffect, useCallback, useRef } from 'react';
import { getProducts } from '../services/productService';
import useAuthStore from '../store/useAuthStore';

const MIN_SEARCH_LENGTH = 2;

/**
 * Hook para cargar y gestionar productos de la empresa actual.
 * Soporta filtros por estado y búsqueda server-side.
 */
export default function useProducts() {
  const { userProfile } = useAuthStore();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [history, setHistory] = useState([null]);
  const [filters, setFilters] = useState({ estado: '', search: '' });
  const abortRef = useRef(null);

  const empresaId = userProfile?.empresaId;

  const fetchProducts = useCallback(async (estadoFilter, searchFilter, targetPage = 1, paginationToken = null) => {
    if (!empresaId) return;

    if (searchFilter && searchFilter.trim().length > 0 && searchFilter.trim().length < MIN_SEARCH_LENGTH) {
      setProducts([]);
      setHasMore(false);
      setNextCursor(null);
      setPage(1);
      setHistory([null]);
      setLoading(false);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const options = {
        pageSize: 5,
        signal: controller.signal
      };

      if (estadoFilter) options.estado = estadoFilter;

      if (searchFilter) {
        options.search = searchFilter;
        if (paginationToken) options.cursor = paginationToken;
      } else if (paginationToken) {
        options.lastDoc = { id: paginationToken };
      }

      const result = await getProducts(empresaId, options);
      if (abortRef.current !== controller) return;

      setProducts(result.products);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
      setPage(targetPage);

      if (targetPage === 1) {
        setHistory([null]);
      }
    } catch (err) {
      if (err.name === 'AbortError' || abortRef.current !== controller) return;
      console.error('Error fetching products:', err);
      setError(err.message);
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [empresaId]);

  const nextPage = useCallback(() => {
    if (!hasMore || loading) return;

    if (filters.search) {
      if (!nextCursor) return;
      setHistory((prev) => [...prev, nextCursor]);
      fetchProducts(filters.estado, filters.search, page + 1, nextCursor);
      return;
    }

    const lastProduct = products[products.length - 1];
    if (lastProduct) {
      setHistory((prev) => [...prev, lastProduct.id]);
      fetchProducts(filters.estado, filters.search, page + 1, lastProduct.id);
    }
  }, [hasMore, loading, filters, nextCursor, products, page, fetchProducts]);

  const prevPage = useCallback(() => {
    if (page === 1 || loading) return;
    const prevToken = history[page - 2];
    setHistory((prev) => prev.slice(0, -1));
    fetchProducts(filters.estado, filters.search, page - 1, prevToken);
  }, [page, loading, history, filters, fetchProducts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(filters.estado, filters.search, 1, null);
    }, filters.search ? 500 : 0);

    return () => clearTimeout(timer);
  }, [fetchProducts, filters.estado, filters.search]);

  useEffect(() => () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const refetch = useCallback(() => {
    fetchProducts(filters.estado, filters.search, page, history[page - 1]);
  }, [fetchProducts, filters.estado, filters.search, page, history]);

  return {
    products,
    loading,
    error,
    hasMore,
    page,
    filters,
    setFilters,
    nextPage,
    prevPage,
    refetch,
  };
}
