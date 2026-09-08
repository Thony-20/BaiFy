import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import { ArrowLeft, Mail } from 'lucide-react';
import { resetPassword } from '../services/authService';
import toast from 'react-hot-toast';
import Aurora from '../components/Aurora';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Ingresa tu correo electrónico');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email);
      setSubmitted(true);
      toast.success('Correo de recuperación enviado');
    } catch (err) {
      const messages = {
        'auth/user-not-found': 'No existe una cuenta con ese email',
        'auth/invalid-email': 'Email inválido',
        'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.',
      };
      setError(messages[err.code] || 'Error al enviar el correo de recuperación');
    } finally {
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

      {/* Card */}
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
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <img
              src="/LOGO1.png"
              alt="Logo"
              style={{ width: 140, height: 'auto', objectFit: 'contain', margin: '0 auto 0.75rem' }}
            />
            <h2
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                color: '#ffffff',
                margin: 0,
                letterSpacing: '-0.5px',
              }}
            >
              {submitted ? '¡Correo enviado!' : 'Recuperar contraseña'}
            </h2>
            <p style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)' }}>
              {submitted
                ? 'Revisa tu bandeja de entrada para continuar'
                : 'Te enviaremos un enlace para restablecer tu contraseña'}
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

          {submitted ? (
            /* Estado: enviado */
            <div style={{ textAlign: 'center' }}>
              {/* Ícono check */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(124,255,103,0.15)',
                  border: '1px solid rgba(124,255,103,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem',
                  fontSize: '1.5rem',
                }}
              >
                ✉️
              </div>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', marginBottom: '1.75rem' }}>
                Si el correo <strong style={{ color: '#fff' }}>{email}</strong> está registrado,
                recibirás instrucciones en breve.
              </p>
              <RouterLink
                to="/login"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.85rem 1rem',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                  letterSpacing: '0.01em',
                }}
              >
                <ArrowLeft size={17} />
                Volver al inicio de sesión
              </RouterLink>
            </div>
          ) : (
            /* Formulario */
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

              {/* Email */}
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  id="forgot_email"
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
                    e.target.style.borderBottomColor = '#ffffff';
                    e.target.nextSibling.style.top = '-0.75rem';
                    e.target.nextSibling.style.fontSize = '0.75rem';
                    e.target.nextSibling.style.color = '#fff';
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
                  htmlFor="forgot_email"
                  style={{
                    position: 'absolute',
                    left: '1.5rem',
                    top: email ? '-0.75rem' : '0.625rem',
                    fontSize: email ? '0.75rem' : '0.875rem',
                    color: email ? '#fff' : 'rgba(255,255,255,0.5)',
                    pointerEvents: 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Mail size={14} />
                  Correo electrónico
                </label>
              </div>

              {/* Botón enviar */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.85rem 1rem',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Enviar enlace'}
              </button>

              {/* Volver al login */}
              <div style={{ textAlign: 'center' }}>
                <RouterLink
                  to="/login"
                  style={{
                    fontSize: '0.8rem',
                    color: 'rgba(255,255,255,0.45)',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
                >
                  <ArrowLeft size={14} />
                  Volver al inicio de sesión
                </RouterLink>
              </div>
            </form>
          )}
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
    </div>
  );
}
