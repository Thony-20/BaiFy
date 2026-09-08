import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  IconButton,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  AdminPanelSettings as AdminIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { loginUser } from '../services/authService';
import useAuthStore from '../store/useAuthStore';
import toast from 'react-hot-toast';
import StarryBackground from '../components/StarryBackground';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { setUser, setUserProfile } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { user, profile } = await loginUser(email, password);

      // Verificación estricta de rol para el portal administrativo
      if (profile.rol !== 'super-admin') {
        toast.error('Acceso denegado: Se requieren permisos de Súper Administrador');
        setLoading(false);
        return;
      }

      setUser(user);
      setUserProfile(profile);

      toast.success('Acceso concedido al Panel Maestro');
      navigate('/admin');
    } catch (error) {
      toast.error(error.message || 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(circle at center, #1A2035 0%, #0A0E1A 100%)',
      }}
    >
      <StarryBackground />

      <IconButton
        onClick={() => navigate('/login')}
        sx={{ position: 'absolute', top: 20, left: 20, color: '#9AA0B2' }}
      >
        <BackIcon />
        <Typography variant="body2" sx={{ ml: 1 }}>Volver al sistema</Typography>
      </IconButton>

      <Card
        sx={{
          maxWidth: 420,
          width: '90%',
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          borderRadius: '28px',
          border: '1px solid rgba(139, 131, 255, 0.2)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
          zIndex: 1,
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #6C63FF 0%, #4D45C3 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
                boxShadow: '0 8px 16px rgba(108, 99, 255, 0.3)',
              }}
            >
              <AdminIcon sx={{ fontSize: 32, color: '#FFF' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#FFF' }}>
              Panel Maestro
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Acceso restringido para administradores globales
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Correo Administrativo"
              variant="outlined"
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                }
              }}
            />
            <TextField
              fullWidth
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: '#9AA0B2' }}>
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '12px',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                }
              }}
            />

            <Button
              fullWidth
              type="submit"
              variant="contained"
              disabled={loading}
              sx={{
                mt: 4,
                py: 1.5,
                borderRadius: '12px',
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #6C63FF 0%, #4D45C3 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #7B74FF 0%, #5C54D4 100%)',
                }
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Entrar al Panel'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
