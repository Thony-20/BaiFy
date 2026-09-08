import React, { useCallback, useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import { ArrowRight, User, Lock, Eye, EyeOff } from 'lucide-react';
import { loginUser } from '../services/authService';
import useAuthStore from '../store/useAuthStore';
import toast from 'react-hot-toast';

import Aurora from '../components/Aurora';
import InventoryEntryOverlay from '../components/InventoryEntryOverlay';
import { prefetchDashboardData } from '../utils/dashboardPrefetch';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser, setUserProfile } = useAuthStore();

  const handleEntryComplete = useCallback(() => {
    toast.success('¡Bienvenido de vuelta!');
    navigate('/');
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Completa todos los campos');
      return;
    }

    setLoading(true);
    try {
      const { user, profile } = await loginUser(email, password);
      setUser(user);
      setUserProfile(profile);
      setEntryReady(false);
      setEntering(true);
      prefetchDashboardData(profile)
        .catch(() => {
          // Si falla el prefetch, no bloquear la entrada; el dashboard reintentará
        })
        .finally(() => {
          setEntryReady(true);
        });
    } catch (err) {
      const messages = {
        'auth/user-not-found': 'No existe una cuenta con ese email',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-email': 'Email inválido',
        'auth/invalid-credential': 'Credenciales inválidas',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
      };
      setError(messages[err.code] || 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        padding: '1rem',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Aurora background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Aurora
          colorStops={['#7cff67', '#B497CF', '#5227FF']}
          amplitude={0.8}
          blend={0.3}
        />
      </div>

      {/* Login Card */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '380px',
          borderRadius: '1.25rem',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Card content */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '2.5rem 2rem',
            backdropFilter: 'blur(12px)',
            background: 'rgba(10, 8, 30, 0.2)',
          }}
        >
          {/* Logo + Título */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <img
              src="/LOGO1.png"
              alt="BayFi Logo"
              style={{ 
                width: 140, 
                height: 'auto', 
                objectFit: 'contain', 
                margin: '0 auto 0.25rem',
                display: 'block'
              }}
            />
            <p style={{ marginTop: '0.2rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
              Inicia sesión para continuar
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '0.75rem 1rem',
                borderRadius: '0.75rem',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.82rem',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Email */}
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                id="login_email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                required
                autoFocus
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.625rem 0',
                  paddingLeft: '1.5rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderBottomColor = '#3B82F6';
                  e.target.nextSibling.style.top = '-0.75rem';
                  e.target.nextSibling.style.fontSize = '0.75rem';
                  e.target.nextSibling.style.color = '#60A5FA';
                }}
                onBlur={(e) => {
                  e.target.style.borderBottomColor = 'rgba(255,255,255,0.25)';
                  if (!email) {
                    e.target.nextSibling.style.top = '0.625rem';
                    e.target.nextSibling.style.fontSize = '0.875rem';
                    e.target.nextSibling.style.color = 'rgba(255,255,255,0.5)';
                  }
                }}
              />
              <label
                htmlFor="login_email"
                style={{
                  position: 'absolute',
                  left: '1.5rem',
                  top: email ? '-0.75rem' : '0.625rem',
                  fontSize: email ? '0.75rem' : '0.875rem',
                  color: email ? '#60A5FA' : 'rgba(255,255,255,0.5)',
                  pointerEvents: 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <User size={14} />
                Correo electrónico
              </label>
            </div>

            {/* Contraseña */}
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="login_password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                required
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.625rem 2.5rem 0.625rem 1.5rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderBottomColor = '#3B82F6';
                  e.target.nextSibling.style.top = '-0.75rem';
                  e.target.nextSibling.style.fontSize = '0.75rem';
                  e.target.nextSibling.style.color = '#60A5FA';
                }}
                onBlur={(e) => {
                  e.target.style.borderBottomColor = 'rgba(255,255,255,0.25)';
                  if (!password) {
                    e.target.nextSibling.style.top = '0.625rem';
                    e.target.nextSibling.style.fontSize = '0.875rem';
                    e.target.nextSibling.style.color = 'rgba(255,255,255,0.5)';
                  }
                }}
              />
              <label
                htmlFor="login_password"
                style={{
                  position: 'absolute',
                  left: '1.5rem',
                  top: password ? '-0.75rem' : '0.625rem',
                  fontSize: password ? '0.75rem' : '0.875rem',
                  color: password ? '#60A5FA' : 'rgba(255,255,255,0.5)',
                  pointerEvents: 'none',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Lock size={14} />
                Contraseña
              </label>
              {/* Toggle visibilidad */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.4)',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Olvidaste contraseña */}
            <div style={{ marginTop: '-1rem', textAlign: 'center' }}>
              <RouterLink
                to="/forgot-password"
                style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.45)',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.color = '#fff')}
                onMouseLeave={(e) => (e.target.style.color = 'rgba(255,255,255,0.45)')}
              >
                ¿Olvidaste tu contraseña?
              </RouterLink>
            </div>

            {/* Botón submit */}
            <button
              type="submit"
              disabled={loading || entering}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.85rem 1rem',
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                border: 'none',
                borderRadius: '0.75rem',
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: loading || entering ? 'not-allowed' : 'pointer',
                opacity: loading || entering ? 0.7 : 1,
                transition: 'all 0.2s',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => {
                if (!loading && !entering) e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {loading || entering ? (
                <CircularProgress size={20} sx={{ color: '#fff' }} />
              ) : (
                <>
                  Iniciar Sesión
                  <ArrowRight size={18} style={{ transition: 'transform 0.2s' }} />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <p
            style={{
              textAlign: 'center',
              marginTop: '1.75rem',
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            ¿No tienes cuenta?{' '}
              <RouterLink
                to="/register"
                style={{
                  color: '#60A5FA',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => (e.target.style.color = '#93C5FD')}
                onMouseLeave={(e) => (e.target.style.color = '#60A5FA')}
              >
              Regístrate aquí
            </RouterLink>
          </p>
        </div>
      </div>

      {/* Copyright */}
      <span
        style={{
          position: 'absolute',
          bottom: 16,
          right: 24,
          color: 'rgba(255,255,255,0.2)',
          fontSize: '0.62rem',
          zIndex: 10,
        }}
      >
        © {new Date().getFullYear()} Anthoni Rosas. Todos los derechos reservados.
      </span>

      <InventoryEntryOverlay
        open={entering}
        ready={entryReady}
        onComplete={handleEntryComplete}
      />
    </div>
  );
}
