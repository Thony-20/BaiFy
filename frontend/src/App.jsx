import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Toaster } from 'react-hot-toast';
import { getTheme } from './theme';
import useAuth from './hooks/useAuth';
import useAuthStore from './store/useAuthStore';
import useThemeStore from './store/useThemeStore';

import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProductosPage from './pages/ProductosPage';
import VentasMetricasPage from './pages/VentasMetricasPage';
import POSPage from './pages/POSPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminPage from './pages/AdminPage';
import AdminLoginPage from './pages/AdminLoginPage';
import SettingsPage from './pages/SettingsPage';
import CuentasPage from './pages/CuentasPage';
import ClientesPage from './pages/ClientesPage';
import ClienteDetallePage from './pages/ClienteDetallePage';

export default function App() {
  const { mode } = useThemeStore();
  const location = useLocation();
  
  // Lista de rutas que siempre deben mostrarse en modo oscuro (Login, Registro, etc.)
  const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/admin/login'];
  const isAuthRoute = authRoutes.includes(location.pathname);
  
  // El modo efectivo es 'dark' para rutas de autenticación, de lo contrario usamos la preferencia del usuario
  const effectiveMode = isAuthRoute ? 'dark' : mode;
  
  const theme = React.useMemo(() => getTheme(effectiveMode), [effectiveMode]);

  // Inicializa la escucha de autenticación
  useAuth();

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: effectiveMode === 'dark' ? '#1A2035' : '#FFFFFF',
            color: effectiveMode === 'dark' ? '#E8EAED' : '#1A1C1E',
            border: effectiveMode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            borderRadius: '10px',
            fontSize: '0.9rem',
            boxShadow: effectiveMode === 'dark' ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
          },
          success: {
            iconTheme: { primary: '#00D9A6', secondary: effectiveMode === 'dark' ? '#1A2035' : '#FFFFFF' },
          },
          error: {
            iconTheme: { primary: '#FF5252', secondary: effectiveMode === 'dark' ? '#1A2035' : '#FFFFFF' },
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/productos"
          element={
            <ProtectedRoute>
              <Layout>
                <ProductosPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ventas/metricas"
          element={
            <ProtectedRoute>
              <Layout>
                <VentasMetricasPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ventas/pos"
          element={
            <ProtectedRoute>
              <Layout>
                <POSPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ventas/pos/comprobantes"
          element={
            <ProtectedRoute>
              <Layout>
                <POSPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <SuperAdminRoute>
                <Layout>
                  <AdminPage />
                </Layout>
              </SuperAdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <SettingsPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/cuentas"
          element={
            <ProtectedRoute>
              <Layout>
                <CuentasPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes"
          element={
            <ProtectedRoute>
              <Layout>
                <ClientesPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes/:id"
          element={
            <ProtectedRoute>
              <Layout>
                <ClienteDetallePage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

/**
 * Componente que protege rutas de Súper Administrador
 */
function SuperAdminRoute({ children }) {
  const { userProfile } = useAuthStore();

  if (userProfile?.rol !== 'super-admin') {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
