import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  WorkspacePremium as PremiumIcon,
  AutoGraph as AutoIcon,
  FlashOn as FlashIcon,
  Autorenew as RenewIcon,
  Star as StarIcon,
  Check as CheckIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import useAuthStore from '../store/useAuthStore';
import { upgradePlan, renewPlan } from '../services/authService';

const ALL_PLANS = [
  {
    id: 'free',
    name: 'Bronce',
    price: '0',
    description: 'Ideal para empezar a organizar tu inventario sin compromiso.',
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
    description: 'Nivel recomendado para hacer crecer tu inventario de forma sostenida.',
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
    description: 'El plan estrella. Perfecto para catálogos amplios y ventas constantes.',
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
    description: 'Sin barreras. Inventario ilimitado para empresas sin límites.',
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

import { FeatureCard } from './FeatureCard';

// Mapping of plan IDs to FeatureCard glow colors
const PLAN_COLOR_MAP = {
  free: 'bronze',
  standard: 'emerald',
  premium: 'violet',
  diamond: 'gold'
};

/**
 * Props:
 * - open, onClose, currentPlan
 * - renewalMode: boolean — si true, solo muestra el formulario de pago para renovar el mes actual
 */
export default function UpgradePlanModal({ open, onClose, currentPlan, renewalMode = false }) {
  const [step, setStep] = useState(renewalMode ? 1 : 0); // 0: Select Plan, 1: Payment
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [isRenewal, setIsRenewal] = useState(false); // true cuando se renueva el plan actual
  const [paymentReference, setPaymentReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { userProfile, setUserProfile } = useAuthStore();

  // Datos del plan actual del usuario
  const currentPlanData = ALL_PLANS.find(p => p.id === currentPlan) || ALL_PLANS[0];

  const handlePlanSelect = (plan) => {
    setSelectedPlan(plan);
    setIsRenewal(false);
    setStep(1);
  };

  const handleRenewCurrent = (plan) => {
    setSelectedPlan(plan);
    setIsRenewal(true);
    setStep(1);
  };

  const handleBack = () => {
    if (renewalMode) return;
    setStep(0);
    setIsRenewal(false);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!paymentReference.trim()) {
      setError('Por favor, ingresa el número de referencia');
      return;
    }

    setLoading(true);
    setError('');
    try {
      if (renewalMode || isRenewal) {
        // Renovación: solo enviar referencia de pago
        await renewPlan(paymentReference);
        setUserProfile({
          ...userProfile,
          status: 'renewal_pending',
        });
        toast.success('¡Solicitud de renovación enviada! Seguirás usando la app mientras validamos el pago.');
      } else {
        // Upgrade: cambiar de plan
        await upgradePlan(selectedPlan.id, paymentReference);
        setUserProfile({
          ...userProfile,
          status: 'upgrade_pending',
          pendingPlanId: selectedPlan.id
        });
        toast.success('¡Solicitud de Upgrade enviada! Seguirás usando la app mientras validamos el pago.');
      }

      setTimeout(() => {
        handleReset();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message || 'Error al enviar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(renewalMode ? 1 : 0);
    setSelectedPlan(null);
    setIsRenewal(false);
    setPaymentReference('');
    setError('');
  };

  // Reset cuando cambia el modo
  useEffect(() => {
    if (open) {
      setStep(renewalMode ? 1 : 0);
      setSelectedPlan(null);
      setIsRenewal(false);
      setPaymentReference('');
      setError('');
    }
  }, [open, renewalMode]);

  const activePlan = renewalMode ? currentPlanData : selectedPlan;
  const activePrice = activePlan?.price || '0';
  const showingRenewal = renewalMode || isRenewal;

  // Planes a mostrar: solo los superiores al actual + el actual (para renovar)
  const plansToShow = ALL_PLANS.filter(p => {
    const order = ['free', 'standard', 'premium', 'diamond'];
    const currentIndex = order.indexOf(currentPlan || 'free');
    const planIndex = order.indexOf(p.id);
    return planIndex >= currentIndex; // Mostrar el actual y superiores
  });

  return (
    <Dialog
      open={open}
      onClose={!loading ? onClose : undefined}
      maxWidth={renewalMode ? 'sm' : 'lg'}
      fullWidth
      PaperProps={{
        sx: {
          background: (theme) => theme.palette.mode === 'dark' 
            ? '#0A0E1A' 
            : '#FFFFFF',
          borderRadius: '24px',
          border: (theme) => `1px solid ${theme.palette.divider}`,
          overflow: 'hidden'
        }
      }}
    >
      <Box sx={{ position: 'absolute', right: 24, top: 24, zIndex: 100 }}>
        <IconButton onClick={onClose} disabled={loading} sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ p: { xs: 2.5, sm: 6 } }}>
        {step === 0 && !renewalMode ? (
          <Box>
            <Typography variant="h3" sx={{ fontWeight: 900, textAlign: 'center', mb: 1, color: 'white', letterSpacing: '-0.02em' }}>
              Potencia tu Negocio
            </Typography>
            <Typography variant="body1" textAlign="center" sx={{ color: 'text.secondary', mb: 8, maxWidth: 600, mx: 'auto' }}>
              Elige el plan que mejor se adapte a ti, o renueva tu plan actual por 30 días más.
            </Typography>

            <Box sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              justifyContent: 'center',
              alignItems: { xs: 'center', md: 'stretch' },
              gap: 4,
              px: { xs: 2, md: 4 },
              py: 5,
              overflow: 'visible'
            }}>
              {plansToShow.map((plan) => {
                const isCurrentPlan = (currentPlan || 'free') === plan.id;

                return (
                  <FeatureCard
                    key={plan.id}
                    title={plan.name}
                    description={plan.description}
                    items={[
                      `$${plan.price}/mes`,
                      ...plan.features
                    ]}
                    buttonText={isCurrentPlan ? "Renovar 30 días" : `Mejorar a ${plan.name}`}
                    glowColor={PLAN_COLOR_MAP[plan.id]}
                    isCurrentPlan={isCurrentPlan}
                    onClick={() => isCurrentPlan ? handleRenewCurrent(plan) : handlePlanSelect(plan)}
                  />
                );
              })}
            </Box>
          </Box>
        ) : (
          <Box sx={{ maxWidth: 450, mx: 'auto' }}>
            {!renewalMode && (
              <Button size="small" onClick={handleBack} sx={{ color: 'text.secondary', mb: 2 }}>
                ← Cambiar Plan
              </Button>
            )}

            {showingRenewal ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  <RenewIcon sx={{ color: '#00D9A6', fontSize: 28 }} />
                  <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
                    Renovar Suscripción
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Paga <strong>${currentPlanData.price}</strong> para extender tu plan <strong>{currentPlanData.name}</strong> por 30 días más. Seguirás usando tu app mientras verificamos.
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>
                  Activar Plan {activePlan?.name}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                  Realiza el pago de <strong>${activePrice}</strong>/mes a la siguiente cuenta y envía tu confirmación. Seguirás usando tu app mientras verificamos.
                </Typography>
              </>
            )}

            <Box sx={{ background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: '16px', p: 3, border: (theme) => `1px solid ${theme.palette.divider}`, mb: 4 }}>
              <Typography variant="subtitle2" sx={{ color: (activePlan?.color || '#00D9A6'), fontWeight: 700, mb: 2 }}>DATOS DE PAGO MÓVIL</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Banco:</Typography><Typography variant="body2" color="text.primary" fontWeight={600}>0102 (Venezuela)</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Cédula:</Typography><Typography variant="body2" color="text.primary" fontWeight={600}>30363552</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" color="text.secondary">Teléfono:</Typography><Typography variant="body2" color="text.primary" fontWeight={600}>04123481899</Typography></Box>
              </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                required
                label="Referencia de Pago"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                variant="filled"
                sx={{ mb: 3, '& .MuiFilledInput-root': { borderRadius: '12px', background: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' } }}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
                sx={{
                  py: 1.5, borderRadius: '12px', fontWeight: 800,
                  background: showingRenewal ? '#00D9A6' : (activePlan?.color || '#6C63FF'),
                  '&:hover': { background: showingRenewal ? '#00D9A6' : (activePlan?.color || '#6C63FF'), filter: 'brightness(1.1)' }
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : (showingRenewal ? 'Confirmar Renovación' : 'Confirmar Upgrade')}
              </Button>
            </form>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
