import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import useAuthStore from '../store/useAuthStore';

/**
 * Componente que protege rutas. Redirige a /login si no hay usuario autenticado.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading, initialized } = useAuthStore();

  if (!initialized || loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        sx={{ background: 'linear-gradient(135deg, #0A0E1A 0%, #121829 100%)' }}
      >
        <CircularProgress size={48} sx={{ color: '#6C63FF' }} />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
