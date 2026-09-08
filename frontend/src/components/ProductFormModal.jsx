import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  MenuItem,
  Typography,
  IconButton,
  Divider,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { PRODUCT_STATES } from '../utils/constants';

const initialFormData = {
  nombre: '',
  sku: '',
  descripcion: '',
  valor: '',
  costo: '',
  stock: '',
  estado: PRODUCT_STATES.ACTIVO,
  ubicacion: '',
  fechaVencimiento: '',
  atributos: {},
};

export default function ProductFormModal({ open, onClose, onSubmit, product, loading }) {
  const [formData, setFormData] = useState(initialFormData);
  const [atributoKey, setAtributoKey] = useState('');
  const [atributoValue, setAtributoValue] = useState('');
  const [errors, setErrors] = useState({});

  const isEditing = Boolean(product);

  useEffect(() => {
    if (product) {
      setFormData({
        nombre: product.nombre || '',
        sku: product.sku || '',
        descripcion: product.descripcion || '',
        valor: product.valor ?? '',
        costo: product.costo ?? '',
        stock: product.stock ?? '',
        estado: product.estado || PRODUCT_STATES.ACTIVO,
        ubicacion: product.ubicacion || '',
        fechaVencimiento: product.fechaVencimiento && !isNaN(new Date(product.fechaVencimiento).getTime())
          ? new Date(product.fechaVencimiento).toISOString().split('T')[0]
          : '',
        atributos: product.atributos || {},
      });
    } else {
      setFormData(initialFormData);
    }
    setErrors({});
    setAtributoKey('');
    setAtributoValue('');
  }, [product, open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const isNumeric = name === 'stock' || name === 'valor' || name === 'costo';

    setFormData((prev) => ({
      ...prev,
      [name]: isNumeric
        ? (value === '' ? '' : Math.max(0, parseFloat(value) || 0))
        : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleAddAtributo = () => {
    if (!atributoKey.trim()) return;
    setFormData((prev) => ({
      ...prev,
      atributos: {
        ...prev.atributos,
        [atributoKey.trim()]: atributoValue.trim(),
      },
    }));
    setAtributoKey('');
    setAtributoValue('');
  };

  const handleRemoveAtributo = (key) => {
    setFormData((prev) => {
      const newAttrs = { ...prev.atributos };
      delete newAttrs[key];
      return { ...prev, atributos: newAttrs };
    });
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.nombre.trim()) newErrors.nombre = 'El nombre es obligatorio';
    if (formData.nombre.length > 120) newErrors.nombre = 'El nombre no puede exceder los 120 caracteres';

    const stockNum = formData.stock === '' ? 0 : parseFloat(formData.stock);
    const valorNum = formData.valor === '' ? 0 : parseFloat(formData.valor);
    const costoNum = formData.costo === '' ? 0 : parseFloat(formData.costo);
 
    if (stockNum < 0) newErrors.stock = 'El stock no puede ser negativo';
    if (valorNum < 0) newErrors.valor = 'El precio no puede ser negativo';
    if (costoNum < 0) newErrors.costo = 'El costo no puede ser negativo';

    if (valorNum > 0 && costoNum > 0 && valorNum < costoNum) {
      newErrors.valor = 'El precio de venta no puede ser menor al costo';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Convert values to numbers for the API
    const submissionData = {
      ...formData,
      sku: formData.sku.trim(),
      valor: formData.valor === '' ? 0 : parseFloat(formData.valor),
      costo: formData.costo === '' ? 0 : parseFloat(formData.costo),
      stock: formData.stock === '' ? 0 : parseFloat(formData.stock),
    };

    // Auto-agregar atributo si hay algo escrito en los campos pero no se le dio al botón '+'
    let finalAtributos = { ...formData.atributos };
    if (atributoKey.trim()) {
      finalAtributos[atributoKey.trim()] = atributoValue.trim();
    }

    onSubmit({ ...submissionData, atributos: finalAtributos });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: (theme) => theme.palette.mode === 'dark' 
            ? 'linear-gradient(180deg, #141A2E 0%, #121829 100%)' 
            : 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)',
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle component="div" sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            {isEditing ? 'Editar Producto' : 'Nuevo Producto'}
          </Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.secondary' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1, pb: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
               <TextField
                label="Nombre del producto"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                error={Boolean(errors.nombre)}
                helperText={errors.nombre || `${formData.nombre.length}/120`}
                required
                fullWidth
                autoFocus
                inputProps={{ maxLength: 120 }}
                sx={{ flex: 2 }}
              />
              <TextField
                label="SKU"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                fullWidth
                sx={{ flex: 1 }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Costo (Unitario)"
                name="costo"
                type="number"
                value={formData.costo}
                onChange={handleChange}
                error={Boolean(errors.costo)}
                helperText={errors.costo}
                fullWidth
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1, color: '#FFB74D', fontWeight: 600 }}>$</Typography>,
                }}
              />
              <TextField
                label="Precio (Venta)"
                name="valor"
                type="number"
                value={formData.valor}
                onChange={handleChange}
                error={Boolean(errors.valor)}
                helperText={errors.valor}
                fullWidth
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1, color: '#00D9A6', fontWeight: 600 }}>$</Typography>,
                }}
              />
              <TextField
                label="Stock"
                name="stock"
                type="number"
                value={formData.stock}
                onChange={handleChange}
                error={Boolean(errors.stock)}
                helperText={errors.stock}
                inputProps={{ min: 0 }}
                fullWidth
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label="Estado"
                name="estado"
                value={formData.estado}
                onChange={handleChange}
                sx={{ flex: 1 }}
              >
                <MenuItem value={PRODUCT_STATES.ACTIVO}>Activo</MenuItem>
                <MenuItem value={PRODUCT_STATES.INACTIVO}>Inactivo</MenuItem>
              </TextField>
              <TextField
                label="Ubicación"
                name="ubicacion"
                value={formData.ubicacion}
                onChange={handleChange}
                placeholder="Ej: Pasillo A, Estante 3..."
                sx={{ flex: 1 }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Fecha de Vencimiento"
                name="fechaVencimiento"
                type="date"
                value={formData.fechaVencimiento}
                onChange={handleChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <Box sx={{ flex: 1 }} />
            </Box>

            <TextField
              label="Descripción"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              multiline
              rows={2}
              fullWidth
            />

            <Divider sx={{ my: 0.5, borderColor: 'divider' }} />

            {/* Atributos Dinámicos */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.secondary', fontWeight: 600 }}>
                Atributos Personalizados
              </Typography>

              {Object.entries(formData.atributos).length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  {Object.entries(formData.atributos).map(([key, value]) => (
                    <Chip
                      key={key}
                      label={`${key}: ${value}`}
                      onDelete={() => handleRemoveAtributo(key)}
                      sx={{
                        backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(108, 99, 255, 0.12)' : 'rgba(108, 99, 255, 0.08)',
                        color: (theme) => theme.palette.mode === 'dark' ? '#B4B0FF' : 'primary.main',
                        border: (theme) => `1px solid ${theme.palette.mode === 'dark' ? 'rgba(108, 99, 255, 0.2)' : 'rgba(108, 99, 255, 0.1)'}`,
                        '& .MuiChip-deleteIcon': { color: '#FF5252', '&:hover': { color: '#FF1744' } },
                      }}
                    />
                  ))}
                </Box>
              )}

              <Box sx={{ mb: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', width: '100%', mb: 0.5 }}>
                  Sugerencias:
                </Typography>
                {['Color', 'Talla', 'Marca', 'Material'].map((sug) => (
                  <Chip
                    key={sug}
                    label={sug}
                    size="small"
                    onClick={() => setAtributoKey(sug)}
                    sx={{
                      fontSize: '0.7rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      '&:hover': { backgroundColor: 'rgba(108, 99, 255, 0.2)' },
                    }}
                  />
                ))}
              </Box>

              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <TextField
                  label="Atributo"
                  size="small"
                  value={atributoKey}
                  onChange={(e) => setAtributoKey(e.target.value)}
                  sx={{ flex: 1 }}
                  placeholder="ej: Color, Talla..."
                />
                <TextField
                  label="Valor"
                  size="small"
                  value={atributoValue}
                  onChange={(e) => setAtributoValue(e.target.value)}
                  sx={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAtributo();
                    }
                  }}
                />
                <IconButton
                  onClick={handleAddAtributo}
                  disabled={!atributoKey.trim()}
                  sx={{
                    mt: 0.2,
                    backgroundColor: 'rgba(108, 99, 255, 0.15)',
                    color: '#3B82F6',
                    '&:hover': { backgroundColor: 'rgba(108, 99, 255, 0.25)' },
                    borderRadius: '8px',
                  }}
                >
                  <AddIcon />
                </IconButton>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={onClose} color="inherit" sx={{ color: 'text.secondary', textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              px: 4,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: '0 4px 14px rgba(108, 99, 255, 0.3)',
            }}
          >
            {loading ? 'Guardando...' : isEditing ? 'Actualizar Producto' : 'Crear Producto'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
