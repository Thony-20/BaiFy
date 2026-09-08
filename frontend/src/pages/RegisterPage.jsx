import React, { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Business as BusinessIcon,
  Visibility,
  VisibilityOff,
  Star as StarIcon,
  WorkspacePremium as PremiumIcon,
  AutoGraph as AutoIcon,
  FlashOn as FlashIcon,
} from '@mui/icons-material';
import { registerUser, checkEmail } from '../services/authService';
import useAuthStore from '../store/useAuthStore';
import toast from 'react-hot-toast';

import Aurora from '../components/Aurora';
import { FeatureCard } from '../components/FeatureCard';

// Mapping of plan IDs to FeatureCard glow colors
const PLAN_COLOR_MAP = {
  free: 'bronze',
  standard: 'emerald',
  premium: 'violet',
  diamond: 'gold'
};

const PLANS = [
  {
    id: 'free',
    name: 'Bronce',
    price: '0',
    description: 'Esencial para pequeños negocios en crecimiento.',
    features: [
      { text: 'Capacidad: 5 productos', included: true },
      { text: 'Importación de Excel', included: true },
      { text: 'Sistema de ventas adicional', included: false },
      { text: 'Soporte vía WhatsApp', included: false },
      { text: 'Monitoreo y Gráficas', included: false },
      { text: 'Alertas de stock bajo', included: false },
      { text: 'Personalización de opciones', included: false },
      { text: 'Base de datos propia', included: false },
    ]
  },
  {
    id: 'standard',
    name: 'Plata',
    price: '10',
    description: 'Gestión avanzada para inventarios medianos.',
    features: [
      { text: 'Capacidad: 300 productos', included: true },
      { text: 'Importación de Excel', included: true },
      { text: 'Sistema de ventas adicional', included: true },
      { text: 'Soporte vía WhatsApp', included: true },
      { text: 'Monitoreo y Gráficas', included: true },
      { text: 'Alertas de stock bajo', included: true },
      { text: 'Personalización de opciones', included: false },
      { text: 'Base de datos propia', included: false },
    ]
  },
  {
    id: 'premium',
    name: 'Oro',
    price: '18.99',
    description: 'Potencia total para operaciones de gran escala.',
    features: [
      { text: 'Capacidad: 1000 productos', included: true },
      { text: 'Importación de Excel', included: true },
      { text: 'Sistema de ventas adicional', included: true },
      { text: 'Soporte vía WhatsApp', included: true },
      { text: 'Monitoreo y Gráficas', included: true },
      { text: 'Alertas de stock bajo', included: true },
      { text: 'Personalización de opciones', included: true },
      { text: 'Base de datos propia', included: false },
    ]
  },
  {
    id: 'diamond',
    name: 'Diamante',
    price: '30',
    description: 'Soluciones a medida para empresas globales.',
    features: [
      { text: 'Productos Ilimitados', included: true },
      { text: 'Importación de Excel', included: true },
      { text: 'Sistema de ventas adicional', included: true },
      { text: 'Soporte WhatsApp 24/7', included: true },
      { text: 'Monitoreo y Gráficas', included: true },
      { text: 'Alertas de stock bajo', included: true },
      { text: 'Personalización Total', included: true },
      { text: 'Base de datos propia', included: true },
    ]
  }
];

export default function RegisterPage() {
  const [step, setStep] = useState(0); // 0: Plan, 1: Form, 2: Payment
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser, setUserProfile } = useAuthStore();

  const handlePlanSelect = (plan) => {
    setSelectedPlan(plan);
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim() || !empresaNombre.trim()) {
      setError('Completa todos los campos obligatorios');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      // Verificar si el email ya existe antes de proceder
      const emailExists = await checkEmail(email);
      if (emailExists) {
        setError(
          <Typography variant="body2">
            Ya tienes una cuenta activa con este correo. Si olvidaste tu contraseña,{' '}
            <Link component={RouterLink} to="/forgot-password" sx={{ color: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>
              puedes recuperarla aquí
            </Link>.
          </Typography>
        );
        setLoading(false);
        return;
      }

      if (selectedPlan?.price !== '0' && step === 1) {
        setStep(2);
        setLoading(false);
        return;
      }

      const { user, profile } = await registerUser(email, password, empresaNombre, selectedPlan?.id, paymentReference);
      setUser(user);
      setUserProfile(profile);

      if (profile.status === 'pending') {
        toast.success('¡Registro recibido! Tu cuenta está en espera de verificación del pago.');
      } else {
        toast.success('¡Cuenta creada exitosamente!');
      }

      navigate('/');
    } catch (err) {
      const messages = {
        'auth/email-already-in-use': 'Ya existe una cuenta con ese email',
        'auth/weak-password': 'La contraseña es muy débil',
        'auth/invalid-email': 'Email inválido',
      };
      setError(messages[err.code] || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const renderPrice = (price, color) => {
    if (price === '0') return <Typography variant="h3" sx={{ fontWeight: 800, color: '#FFF' }}>$0</Typography>;
    if (price === 'Custom') return <Typography variant="h4" sx={{ fontWeight: 800, color: '#FFF' }}>Varios</Typography>;

    const [main, decimal] = price.includes('.') ? price.split('.') : [price, null];
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', position: 'relative' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mt: 1, mr: 0.5, color: '#9AA0B2' }}>$</Typography>
        <Typography variant="h3" sx={{ fontWeight: 800, color: '#FFF' }}>{main}</Typography>
        {decimal && (
          <Typography variant="h6" sx={{ fontWeight: 700, mt: 1, ml: 0.2, fontSize: '1.2rem', color: color }}>
            .{decimal}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        px: 2,
        py: { xs: 6, md: 4 },
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Aurora background - full screen */}
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Aurora
          colorStops={['#7cff67', '#B497CF', '#5227FF']}
          amplitude={1}
          blend={0.5}
        />
      </Box>

      <Box sx={{
        maxWidth: step === 0 ? 1200 : 440,
        width: '100%',
        zIndex: 1,
        transition: 'max-width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        {step === 0 ? (
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h2" sx={{
                fontWeight: 900,
                mb: 0.5,
                background: 'linear-gradient(to bottom, #FFFFFF 30%, #9AA0B2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-1px',
                fontSize: { xs: '2rem', md: '3rem' }
              }}>
                Elige tu trayectoria
              </Typography>
              <Typography variant="body1" sx={{ color: '#9AA0B2', fontWeight: 400, opacity: 0.8 }}>
                Planes diseñados para escalar junto a tu ambición
              </Typography>
            </Box>

            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              justifyContent: 'center',
              alignItems: { xs: 'center', md: 'stretch' },
              gap: 2,
              px: { xs: 2, md: 2 },
              py: 2,
              overflow: 'visible'
            }}>
              {PLANS.map((plan) => (
                <FeatureCard
                  key={plan.id}
                  title={plan.name}
                  description={plan.description}
                  items={[
                    `$${plan.price}/mes`,
                    ...plan.features
                  ]}
                  buttonText="Comenzar ahora"
                  glowColor={PLAN_COLOR_MAP[plan.id]}
                  onClick={() => handlePlanSelect(plan)}
                />
              ))}
            </Box>

            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" sx={{ color: '#9AA0B2', opacity: 0.7 }}>
                ¿Ya eres parte de BAYFI?{' '}
                <Link component={RouterLink} to="/login" sx={{ color: '#3B82F6', fontWeight: 700, textDecoration: 'none', borderBottom: '1px solid rgba(59, 130, 246, 0.3)', pb: 0.2 }}> Inicia Sesión </Link>
              </Typography>
            </Box>
          </Box>
        ) : step === 1 ? (
          <Card
            sx={{
              background: 'rgba(10, 8, 30, 0.2)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '32px',
              boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
              overflow: 'hidden'
            }}
          >
            <Box sx={{
              height: 6,
              background: `linear-gradient(90deg, ${selectedPlan?.color} 0%, #6C63FF 100%)`
            }} />
            <CardContent sx={{ p: { xs: 3, md: 4 }, pb: { xs: 3, md: 4 } }}>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Button
                  size="small"
                  onClick={() => setStep(0)}
                  sx={{
                    mb: 3,
                    color: '#9AA0B2',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': { background: 'rgba(255,255,255,0.05)' }
                  }}
                >
                  ← Cambiar plan: {selectedPlan?.name}
                </Button>
                <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: '-0.5px' }}>
                  Crea tu cuenta
                </Typography>
                <Typography variant="body1" sx={{ color: '#9AA0B2' }}>
                  Equípate con el plan <strong style={{ color: selectedPlan?.color }}>{selectedPlan?.name}</strong>
                </Typography>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mb: 4, borderRadius: '16px', background: 'rgba(211, 47, 47, 0.1)', color: '#FF8A80', border: '1px solid rgba(211, 47, 47, 0.2)' }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Nombre de tu Empresa"
                    value={empresaNombre}
                    onChange={(e) => setEmpresaNombre(e.target.value)}
                    fullWidth
                    required
                    autoFocus
                    variant="filled"
                    sx={{ '& .MuiFilledInput-root': { borderRadius: '12px', background: 'rgba(255,255,255,0.03)' } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <BusinessIcon sx={{ color: '#9AA0B2', fontSize: 22 }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    label="Correo Electrónico"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                    required
                    variant="filled"
                    sx={{ '& .MuiFilledInput-root': { borderRadius: '12px', background: 'rgba(255,255,255,0.03)' } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailIcon sx={{ color: '#9AA0B2', fontSize: 22 }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    label="Contraseña"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    fullWidth
                    required
                    variant="filled"
                    sx={{ '& .MuiFilledInput-root': { borderRadius: '12px', background: 'rgba(255,255,255,0.03)' } }}
                    helperText="Mínimo 6 caracteres de seguridad"
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockIcon sx={{ color: '#9AA0B2', fontSize: 22 }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            size="small"
                          >
                            {showPassword ? <VisibilityOff sx={{ fontSize: 20 }} /> : <Visibility sx={{ fontSize: 20 }} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    label="Confirmar Contraseña"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    fullWidth
                    required
                    variant="filled"
                    sx={{ '& .MuiFilledInput-root': { borderRadius: '12px', background: 'rgba(255,255,255,0.03)' } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockIcon sx={{ color: '#9AA0B2', fontSize: 22 }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={loading}
                    sx={{
                      py: 2,
                      mt: 2,
                      background: `linear-gradient(135deg, ${selectedPlan?.color || '#3B82F6'} 0%, #1D4ED8 100%)`,
                      boxShadow: `0 12px 24px ${selectedPlan?.color || '#3B82F6'}30`,
                      borderRadius: '16px',
                      fontWeight: 900,
                      fontSize: '1rem',
                      textTransform: 'none',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: `0 15px 30px ${selectedPlan?.color}50`,
                      }
                    }}
                  >
                    {loading ? <CircularProgress size={26} color="inherit" /> : 'Lanzar mi inventario'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card
            sx={{
              background: 'rgba(10, 8, 30, 0.2)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${selectedPlan?.color}40`,
              borderRadius: '32px',
              boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
              overflow: 'hidden'
            }}
          >
            <Box sx={{
              height: 6,
              background: `linear-gradient(90deg, ${selectedPlan?.color} 0%, #6C63FF 100%)`
            }} />
            <CardContent sx={{ p: { xs: 3, md: 4 }, pb: { xs: 3, md: 4 } }}>
              <Box sx={{ textAlign: 'center', mb: 3 }}>
                <Button
                  size="small"
                  onClick={() => setStep(1)}
                  sx={{
                    mb: 3,
                    color: '#9AA0B2',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': { background: 'rgba(255,255,255,0.05)' }
                  }}
                >
                  ← Volver al formulario
                </Button>
                <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: '-0.5px' }}>
                  Pago del Plan {selectedPlan?.name}
                </Typography>
                <Typography variant="body1" sx={{ color: '#9AA0B2' }}>
                  Realiza el pago de <strong>${selectedPlan?.price}</strong> para activar tu cuenta
                </Typography>
              </Box>

              <Box sx={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '20px',
                p: 2,
                mb: 3,
                border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <Typography variant="subtitle2" sx={{ color: selectedPlan?.color, fontWeight: 700, mb: 2, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Datos de Pago Móvil
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Banco:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>0102 (Venezuela)</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Cédula:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>30363552</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Teléfono:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>04123481899</Typography>
                  </Box>
                </Box>
              </Box>

              <form onSubmit={handleSubmit}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    label="Número de Referencia"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    fullWidth
                    required
                    autoFocus
                    variant="filled"
                    placeholder="Ej: 12345678"
                    helperText="Ingresa los últimos 6-8 dígitos de tu comprobante"
                    sx={{ '& .MuiFilledInput-root': { borderRadius: '12px', background: 'rgba(255,255,255,0.03)' } }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={loading}
                    sx={{
                      py: 2,
                      mt: 1,
                      background: `linear-gradient(135deg, ${selectedPlan?.color} 0%, #3D35B3 100%)`,
                      boxShadow: `0 12px 24px ${selectedPlan?.color}30`,
                      borderRadius: '16px',
                      fontWeight: 900,
                      fontSize: '1rem',
                      textTransform: 'none',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: `0 15px 30px ${selectedPlan?.color}50`,
                      }
                    }}
                  >
                    {loading ? <CircularProgress size={26} color="inherit" /> : 'Confirmar y Finalizar Registro'}
                  </Button>
                </Box>
              </form>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* Copyright flotante esquina inferior derecha */}
      <Typography
        variant="caption"
        sx={{
          position: 'absolute',
          bottom: 16,
          left: { xs: 0, md: 'auto' },
          right: { xs: 0, md: 24 },
          textAlign: { xs: 'center', md: 'right' },
          color: '#5A6075',
          fontSize: '0.65rem',
          zIndex: 10
        }}
      >
        &copy; {new Date().getFullYear()} Anthoni Rosas. Todos los derechos reservados.
      </Typography>
    </Box>
  );
}
