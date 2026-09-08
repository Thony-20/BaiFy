import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Badge,
  Chip,
  Alert,
  CircularProgress,
  Paper,
  Tooltip,
  FormControlLabel,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
} from '@mui/material';
import {
  Search as SearchIcon,
  AddShoppingCart as AddIcon,
  Remove as RemoveIcon,
  Add as PlusIcon,
  Delete as DeleteIcon,
  PauseCircleOutline as ParkIcon,
  PlayCircleOutline as ResumeIcon,
  Payments as PayIcon,
  Receipt as ReceiptIcon,
  ClearAll as ClearIcon,
  LocalOffer as DiscountIcon,
  PointOfSale as POSIcon,
  History as HistoryIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import {
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination
} from '@mui/material';
import { getProducts, getProductBySku } from '../services/productService';
import { createSale, getSalesHistory, deleteSale } from '../services/saleService';
import useAuthStore from '../store/useAuthStore';
import toast from 'react-hot-toast';
import POSPaymentModal from '../components/POSPaymentModal';
import POSTicketPreview from '../components/POSTicketPreview';
import useCurrencyStore from '../store/useCurrencyStore';
import { generateSalesReportPDF } from '../utils/reportGenerator';
import {
  CheckCircle as VerifiedIcon,
  FlashOn as LiveIcon,
  Refresh as RefreshIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';

export default function POSPage() {
  const theme = useTheme();
  const { userProfile } = useAuthStore();
  const { getActiveRate, fetchRates } = useCurrencyStore();
  const activeRate = getActiveRate();
  const empresaId = userProfile?.empresaId;

  // Actualizar tasa automáticamente cada 15 minutos mientras el POS esté abierto
  useEffect(() => {
    fetchRates();
    const rateInterval = setInterval(() => {
      console.log('🔄 Actualizando tasa de cambio automáticamente...');
      fetchRates();
    }, 15 * 60 * 1000); // Cada 15 minutos
    return () => clearInterval(rateInterval);
  }, [fetchRates]);

  // Estados de productos
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleProductsCount, setVisibleProductsCount] = useState(5);

  // Estados del carrito
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0); // Porcentaje
  const [discountType, setDiscountType] = useState('percent'); // 'percent' | 'fixed'

  // Estados de tickets en espera (Parking)
  const [parkedTickets, setParkedTickets] = useState([]);

  // Estados de modales
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [lastSaleData, setLastSaleData] = useState(null);
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState(null);
  const [isProcessingSale, setIsProcessingSale] = useState(false);

  // Lógica de Tabs integrada en Sidebar
  const location = useLocation();
  const activeTab = location.pathname.includes('comprobantes') ? 1 : 0;

  // Estados para Historial (Tickets)
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [salesHistory, setSalesHistoryTokens] = useState([null]); // Para paginación Firestore
  const [hasMoreSales, setHasMoreSales] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(''); // fecha exacta del día
  
  // Estados para exportación PDF
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfRangeType, setPdfRangeType] = useState('today'); // 'today' | 'custom'
  const [pdfFrom, setPdfFrom] = useState(new Date().toISOString().split('T')[0]);
  const [pdfTo, setPdfTo] = useState(new Date().toISOString().split('T')[0]);

  // Cargar productos
  const fetchProducts = useCallback(async (search = '') => {
    if (!empresaId) return;
    const trimmed = search.trim();
    if (trimmed === '' || trimmed.length < 2) {
      setProducts([]);
      return;
    }
    setLoadingProducts(true);
    try {
      const data = await getProducts(empresaId, { search: trimmed, pageSize: 10, estado: 'activo' });
      setProducts(data.products || []);
      setVisibleProductsCount(5);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar productos');
    } finally {
      setLoadingProducts(false);
    }
  }, [empresaId]);

  useEffect(() => {
    fetchProducts();
    // Cargar tickets aparcados de localStorage
    const saved = localStorage.getItem(`parked_tickets_${empresaId}`);
    if (saved) setParkedTickets(JSON.parse(saved));
  }, [fetchProducts, empresaId]);

  // Manejo de búsqueda con debounce manual
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchProducts]);

  // Lógica del carrito
  const addToCart = (product) => {
    if (product.stock <= 0) {
      toast.error('Producto sin stock');
      return;
    }

    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.cantidad >= product.stock) {
        toast.error('No hay más stock disponible');
        return;
      }
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, cantidad: item.cantidad + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, cantidad: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(1, item.cantidad + delta);
        if (newQty > item.stock) {
          toast.error('Stock insuficiente');
          return item;
        }
        return { ...item, cantidad: newQty };
      }
      return item;
    }));
  };

  // Cálculos (IVA Incluido en el precio)
  const cartSubtotal = cart.reduce((sum, item) => sum + (item.valor * item.cantidad), 0);
  const discountAmount = discountType === 'percent' ? (cartSubtotal * (discount / 100)) : parseFloat(discount || 0);
  const total = Math.max(0, cartSubtotal - discountAmount);
  const subtotal = total; // No hay IVA, subtotal y total son iguales
  const tax = 0;

  // Parking (Pausar venta)
  const parkTicket = () => {
    if (cart.length === 0) return;
    const newTicket = {
      id: Date.now(),
      items: cart,
      discount,
      discountType,
      applyTax,
      timestamp: new Date().toISOString()
    };
    const updated = [...parkedTickets, newTicket];
    setParkedTickets(updated);
    localStorage.setItem(`parked_tickets_${empresaId}`, JSON.stringify(updated));
    setCart([]);
    setDiscount(0);
    toast.success('Venta puesta en espera');
  };

  const resumeTicket = (ticket) => {
    if (cart.length > 0) {
      toast.error('Limpia el carrito actual antes de retomar una venta');
      return;
    }
    setCart(ticket.items);
    setDiscount(ticket.discount);
    setDiscountType(ticket.discountType);
    const updated = parkedTickets.filter(t => t.id !== ticket.id);
    setParkedTickets(updated);
    localStorage.setItem(`parked_tickets_${empresaId}`, JSON.stringify(updated));
  };

  // Barcode Scanning Logic
  useEffect(() => {
    let lastKeyTime = Date.now();
    let buffer = '';

    const handleKeyDown = (e) => {
      // Evitar capturar si se está escribiendo en un input que no sea el de búsqueda
      if (e.target.tagName === 'INPUT' && e.target.type !== 'text' && !e.target.placeholder?.includes('Buscar')) {
        return;
      }

      const currentTime = Date.now();

      // Si pasa mucho tiempo entre teclas, es escritura manual, no escáner
      if (currentTime - lastKeyTime > 50) {
        buffer = '';
      }

      if (e.key === 'Enter') {
        if (buffer.length > 0) {
          handleBarcodeScan(buffer);
          buffer = '';
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }

      lastKeyTime = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [empresaId]);

  const handleBarcodeScan = async (sku) => {
    const cleanSku = sku.trim();
    if (!cleanSku) return;

    try {
      const product = await getProductBySku(empresaId, cleanSku, 'activo');

      if (product) {
        addToCart(product);
        toast.success(`Escaneado: ${product.nombre}`, { icon: '🏷️' });
        setSearchTerm('');
      } else {
        toast.error(`Producto con SKU "${cleanSku}" no encontrado`);
      }
    } catch (error) {
      console.error(error);
    }
  };


  // Completar venta
  const handleConfirmPayment = async (metodosPago, clienteInfo) => {
    if (isProcessingSale) return;
    setIsProcessingSale(true);
    try {
      const saleData = {
        empresaId,
        idempotencyKey: currentIdempotencyKey,
        items: cart.map(item => ({
          productId: item.id,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precioUnitario: item.valor,
          subtotal: item.valor * item.cantidad
        })),
        subtotal: cartSubtotal,
        descuento: discountAmount,
        impuestos: tax,
        total,
        metodosPago,
        exchangeRate: activeRate,
        cliente: clienteInfo || null,
      };

      const result = await createSale(saleData);
      setLastSaleData({
        ...saleData,
        descuento: Number(discountAmount) || 0,
        total: Math.max(0, (Number(cartSubtotal) || 0) - (Number(discountAmount) || 0)),
        id: result.saleId,
        controlFiscal: result.controlFiscal,
        fechaVenta: result.fechaVenta || new Date().toISOString(),
      });
      setCart([]);
      setDiscount(0);
      setPaymentModalOpen(false);
      setCurrentIdempotencyKey(null); // Limpiar clave tras éxito
      setTicketModalOpen(true);
      toast.success('¡Venta realizada con éxito!');
      fetchProducts(searchTerm); // Refrescar stock
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsProcessingSale(false);
    }
  };

  const fetchSales = useCallback(async (page = 1, lastId = null, search = '', dateFrom = '', dateTo = '') => {
    if (!empresaId) return;
    setLoadingSales(true);
    try {
      const options = {
        limit: 10,
        lastDocId: lastId,
        search: search || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined
      };
      const res = await getSalesHistory(empresaId, options);
      setSales(res.sales || []);
      setHasMoreSales(res.hasMore);
      setSalesPage(page);
      if (page === 1) setSalesHistoryTokens([null]);
    } catch (error) {
      console.error(error);
      toast.error(`Error al cargar historial: ${error.message}`);
    } finally {
      setLoadingSales(false);
    }
  }, [empresaId]);

  // Debounce para el buscador del historial — evita carrera de peticiones al borrar letra por letra
  useEffect(() => {
    if (activeTab !== 1) return;
    const timer = setTimeout(() => {
      // El backend maneja el inicio/fin del día internamente, solo pasamos YYYY-MM-DD
      fetchSales(1, null, invoiceSearch, dateFilter, dateFilter);
    }, 400);
    return () => clearTimeout(timer);
  }, [activeTab, invoiceSearch, dateFilter, fetchSales]);

  const handleNextSales = () => {
    const last = sales[sales.length - 1];
    if (last && hasMoreSales) {
      setSalesHistoryTokens([...salesHistory, last._id]);
      fetchSales(salesPage + 1, last._id, invoiceSearch, dateFilter, dateFilter);
    }
  };

  const handleDownloadReport = () => {
    setPdfModalOpen(true);
  };

  const executeDownloadReport = async () => {
    try {
      setPdfModalOpen(false);
      toast.loading('Obteniendo datos y generando PDF...', { id: 'pdf-report' });
      
      const fromDate = pdfRangeType === 'today' ? new Date().toISOString().split('T')[0] : pdfFrom;
      const toDate = pdfRangeType === 'today' ? new Date().toISOString().split('T')[0] : pdfTo;

      const options = {
        limit: 500, // Límite amplio para el reporte
        from: fromDate,
        to: toDate
      };

      const res = await getSalesHistory(empresaId, options);
      const salesToReport = res.sales || [];

      if (salesToReport.length === 0) {
        toast.error('No hay ventas en el rango seleccionado', { id: 'pdf-report' });
        return;
      }

      const fileName = `Reporte_desde_${fromDate}_hasta_${toDate}.pdf`;
      await generateSalesReportPDF(salesToReport, userProfile, fileName);
      toast.success('Reporte generado correctamente', { id: 'pdf-report' });
    } catch (error) {
      console.error('Error al generar PDF:', error);
      toast.error(`Error al generar reporte: ${error.message}`, { id: 'pdf-report' });
    }
  };

  const handlePrevSales = () => {
    if (salesPage > 1) {
      const prevDocId = salesHistory[salesPage - 2];
      const newHistory = [...salesHistory];
      newHistory.pop();
      setSalesHistoryTokens(newHistory);
      fetchSales(salesPage - 1, prevDocId, invoiceSearch, dateFilter, dateFilter);
    }
  };

  const viewInvoice = (sale) => {
    setLastSaleData(sale);
    setTicketModalOpen(true);
  };

  const handleDeleteSale = async (sale) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar el comprobante ${sale.id}? Esta acción restaurará el stock de los productos (si aún existen) y es irreversible.`)) {
      return;
    }

    try {
      setLoadingSales(true);
      const result = await deleteSale(empresaId, sale._id);
      const restored = result?.restoredUnits;
      toast.success(
        typeof restored === 'number'
          ? `Comprobante eliminado. Stock restaurado: ${restored} u.`
          : 'Comprobante eliminado correctamente'
      );
      if (Array.isArray(result?.missingProducts) && result.missingProducts.length > 0) {
        toast.error(`No se pudo restaurar stock de: ${result.missingProducts.join(', ')}`);
      }
      setInvoiceSearch('');
      fetchSales(1, null, '', dateFilter, dateFilter);
      // Refrescar listado POS si hay búsqueda activa
      if (searchTerm.trim()) {
        fetchProducts(searchTerm);
      }
    } catch (error) {
      console.error(error);
      toast.error(`Error al eliminar ticket: ${error.message}`);
    } finally {
      setLoadingSales(false);
    }
  };

  return (
    <Box sx={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      bgcolor: theme.palette.mode === 'dark' ? 'rgba(15, 23, 42, 0.4)' : 'transparent',
      borderRadius: '24px',
      overflow: 'hidden',
      border: `1px solid ${theme.palette.divider}`,
      backdropFilter: 'blur(10px)',
      position: 'relative'
    }}>
      {/* --- NAVBAR INTERNO DEL POS --- */}
      <Box sx={{
        height: 64,
        minHeight: 64,
        display: 'flex',
        alignItems: 'center',
        px: 3,
        bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'rgba(255, 255, 255, 0.5)',
        borderBottom: `1px solid ${theme.palette.divider}`,
        zIndex: 10,
        gap: 3
      }}>
        {/* Info reducida */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 150 }}>
          <POSIcon sx={{ color: '#3B82F6' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}>
            {activeTab === 0 ? 'Punto de Venta' : 'Historial'}
          </Typography>
        </Box>

        {/* Barra de Búsqueda Centrada */}
        {activeTab === 0 && (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <TextField
              placeholder="Buscar productos (nombre o SKU)..."
              variant="outlined"
              size="small"
              fullWidth
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && products.length > 0) {
                  // Si hay un producto con el SKU exacto al buscado, añadirlo
                  const exactMatch = products.find(p => p.sku?.toLowerCase() === searchTerm.toLowerCase());
                  if (exactMatch) {
                    addToCart(exactMatch);
                    setSearchTerm('');
                  }
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#3B82F6', fontSize: 20 }} />
                  </InputAdornment>
                ),
                sx: {
                  borderRadius: '12px',
                  maxWidth: 500,
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff',
                }
              }}
            />
          </Box>
        )}

        {/* Tasa y Acciones */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {activeTab === 0 && (
            <Tooltip title={`Actualizado: ${useCurrencyStore.getState().lastExchangeRefresh ? new Date(useCurrencyStore.getState().lastExchangeRefresh).toLocaleTimeString() : 'Recién'}`}>
              <Chip
                icon={<LiveIcon style={{ fontSize: '14px', color: '#22C55E' }} />}
                label={`Tasa: ${activeRate} Bs.`}
                size="small"
                sx={{
                  fontWeight: 800,
                  borderRadius: '8px',
                  bgcolor: 'rgba(34, 197, 94, 0.1)',
                  color: '#22C55E',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  px: 0.5
                }}
              />
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {activeTab === 0 ? (
          <>
            {/* CATÁLOGO */}
            <Box sx={{
              flex: 1,
              p: 2,
              overflowY: 'auto',
              bgcolor: theme.palette.mode === 'dark' ? 'transparent' : 'rgba(255,255,255,0.3)'
            }}>
              {loadingProducts ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>
              ) : searchTerm.trim() === '' ? (
                <Box sx={{ textAlign: 'center', mt: 8, opacity: 0.5 }}>
                  <SearchIcon sx={{ fontSize: 60, mb: 2 }} />
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>Listo para vender</Typography>
                  <Typography variant="body2">Busca un producto para comenzar</Typography>
                </Box>
              ) : products.length === 0 ? (
                <Alert severity="info">No se encontraron resultados</Alert>
              ) : (
                <Grid container spacing={2}>
                  {products.slice(0, visibleProductsCount).map((product) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={product.id}>
                      <Card
                        onClick={() => addToCart(product)}
                        sx={{
                          borderRadius: '16px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                          opacity: product.stock <= 0 ? 0.6 : 1
                        }}
                      >
                        <CardContent sx={{ p: 2 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5, lineHeight: 1.2, height: '2.4em', overflow: 'hidden' }}>
                            {product.nombre}
                          </Typography>
                          {product.sku && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 1 }}>
                              SKU: {product.sku}
                            </Typography>
                          )}
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                            <Typography variant="h6" color="primary" sx={{ fontWeight: 900 }}>
                              ${product.valor.toFixed(2)}
                            </Typography>
                            <Chip label={product.stock} size="small" variant="outlined" />
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                  
                  {/* Botón Cargar Más */}
                  {products.length > visibleProductsCount && (
                    <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                      <Button 
                        variant="outlined" 
                        onClick={() => setVisibleProductsCount(prev => prev + 5)}
                        sx={{ borderRadius: '12px', fontWeight: 800, textTransform: 'none' }}
                      >
                        Cargar más resultados ({products.length - visibleProductsCount} restantes)
                      </Button>
                    </Grid>
                  )}
                </Grid>
              )}
            </Box>

            {/* CARRITO (SIDEBAR DERECHO) */}
            <Box sx={{
              width: { md: 350, lg: 400 },
              height: '100%',
              borderLeft: `1px solid ${theme.palette.divider}`,
              display: 'flex',
              flexDirection: 'column',
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff',
              overflow: 'hidden'
            }}>
              <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>Carrito ({cart.length})</Typography>
                <IconButton size="small" onClick={() => setCart([])}><ClearIcon fontSize="small" /></IconButton>
              </Box>

              <Box sx={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0, // Fuerza el scroll interno en flexbox
                p: 2,
                scrollbarWidth: 'thin',
                '&::-webkit-scrollbar': { width: '6px' },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.1)', borderRadius: '10px' }
              }}>
                {cart.map((item) => (
                  <Box key={item.id} sx={{ mb: 2, p: 1.5, borderRadius: '12px', border: `1px solid ${theme.palette.divider}`, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 800,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          overflowWrap: 'anywhere',
                          lineHeight: 1.2,
                          flex: 1,
                          mr: 1
                        }}
                      >
                        {item.nombre}
                      </Typography>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removeFromCart(item.id)}
                        sx={{ mt: -0.5, mr: -0.5, opacity: 0.6, '&:hover': { opacity: 1 } }}
                      >
                        <DeleteIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: theme.palette.mode === 'dark' ? '#000' : '#fff', borderRadius: '8px', border: `1px solid ${theme.palette.divider}`, p: 0.2 }}>
                        <IconButton size="small" onClick={() => updateQuantity(item.id, -1)}><RemoveIcon sx={{ fontSize: 16 }} /></IconButton>
                        <Typography variant="body2" sx={{ fontWeight: 800, minWidth: 20, textAlign: 'center' }}>{item.cantidad}</Typography>
                        <IconButton size="small" onClick={() => updateQuantity(item.id, 1)}><PlusIcon sx={{ fontSize: 16 }} /></IconButton>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 900, color: '#3B82F6' }}>
                        ${(item.valor * item.cantidad).toFixed(2)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              <Box sx={{ p: 2, borderTop: `1px solid ${theme.palette.divider}`, bgcolor: 'action.hover' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Subtotal</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>${cartSubtotal.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Box>
                    <Typography variant="caption" color="primary" sx={{ fontWeight: 900 }}>TOTAL</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 900 }}>${total.toFixed(2)}</Typography>
                  </Box>
                  <Typography variant="subtitle1" color="text.secondary" sx={{ fontWeight: 700 }}>
                    Bs. {(total * activeRate).toLocaleString()}
                  </Typography>
                </Box>
                <Button
                  fullWidth
                  variant="contained"
                  disabled={cart.length === 0}
                  onClick={() => { setCurrentIdempotencyKey(crypto.randomUUID()); setPaymentModalOpen(true); }}
                  sx={{ mt: 2, py: 1.5, borderRadius: '12px', fontWeight: 900 }}
                >
                  COBRAR
                </Button>
              </Box>
            </Box>
          </>
        ) : (
          /* COMPROBANTES */
          <Box sx={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Encabezado e filtros */}
            <Box sx={{ flexShrink: 0, mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>Historial de Ventas</Typography>
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<PdfIcon />}
                  onClick={handleDownloadReport}
                  sx={{ borderRadius: '10px', fontWeight: 700, textTransform: 'none' }}
                >
                  Exportar PDF
                </Button>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Buscador por ID */}
                <TextField
                  placeholder="Buscar por ID de comprobante..."
                  size="small"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ color: '#3B82F6', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                    sx: { borderRadius: '12px', bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' }
                  }}
                  sx={{ flex: 1, minWidth: 200 }}
                />
                {/* Filtro por fecha exacta */}
                <TextField
                  label="Fecha"
                  type="date"
                  size="small"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{ sx: { borderRadius: '12px', bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                  sx={{ minWidth: 160 }}
                />
              </Box>
            </Box>

            <Paper
              elevation={1}
              sx={{
                flex: 1,
                minHeight: 0,
                width: '100%',
                borderRadius: '16px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Table size="small" sx={{ width: '100%', tableLayout: 'fixed', flexShrink: 0 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, width: '25%' }}>ID</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: '25%' }}>Fecha</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: '25%' }}>Total</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 800, width: '25%' }}>Acciones</TableCell>
                  </TableRow>
                </TableHead>
              </Table>
              <TableContainer
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                }}
              >
                <Table size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
                  <TableBody>
                    {sales.map((sale) => (
                      <TableRow key={sale._id}>
                        <TableCell sx={{ fontWeight: 700, width: '25%' }}>{sale.id}</TableCell>
                        <TableCell align="center" sx={{ width: '25%' }}>
                          {new Date(sale.fechaVenta).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 800, width: '25%' }}>
                          ${sale.total.toFixed(2)}
                        </TableCell>
                        <TableCell align="center" sx={{ width: '25%' }}>
                          <IconButton size="small" onClick={() => viewInvoice(sale)} sx={{ mr: 1 }}>
                            <ReceiptIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDeleteSale(sale)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* Paginación */}
            <Box sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              mt: 2,
              gap: 2,
              flexShrink: 0,
            }}>
              <Button
                size="small"
                disabled={salesPage === 1 || loadingSales}
                onClick={handlePrevSales}
                sx={{
                  color: theme.palette.text.secondary,
                  minWidth: 100,
                  '&:disabled': { opacity: 0.3 }
                }}
              >
                Anterior
              </Button>
              <Typography variant="body2" sx={{
                fontWeight: 700,
                minWidth: 100,
                textAlign: 'center',
                color: theme.palette.primary.light
              }}>
                Página {salesPage}
              </Typography>
              <Button
                size="small"
                disabled={!hasMoreSales || loadingSales}
                onClick={handleNextSales}
                sx={{
                  color: '#3B82F6',
                  fontWeight: 800,
                  minWidth: 100,
                  '&:disabled': { opacity: 0.3 }
                }}
              >
                Siguiente
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Floating Tickets */}
      {parkedTickets.length > 0 && (
        <Box sx={{ position: 'absolute', bottom: 16, left: 16, zIndex: 20, display: 'flex', gap: 1 }}>
          {parkedTickets.map(t => (
            <Chip
              key={t.id}
              label={`Venta #${t.id.toString().slice(-4)}`}
              onClick={() => resumeTicket(t)}
              sx={{ fontWeight: 800, bgcolor: 'background.paper', boxShadow: 2 }}
            />
          ))}
        </Box>
      )}

      {/* Modales */}
      <POSPaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        total={total}
        onConfirm={handleConfirmPayment}
        loading={isProcessingSale}
        exchangeRate={activeRate}
        empresaId={empresaId}
      />
      <POSTicketPreview
        open={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        saleData={lastSaleData}
        empresaInfo={userProfile}
      />

      {/* Modal Configuración Exportación PDF */}
      <Dialog 
        open={pdfModalOpen} 
        onClose={() => setPdfModalOpen(false)}
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 900 }}>Configurar Reporte PDF</DialogTitle>
        <DialogContent>
          <FormControl component="fieldset" sx={{ mt: 1, width: '100%' }}>
            <FormLabel component="legend" sx={{ fontWeight: 700, mb: 1 }}>Rango de comprobantes</FormLabel>
            <RadioGroup
              value={pdfRangeType}
              onChange={(e) => setPdfRangeType(e.target.value)}
            >
              <FormControlLabel value="today" control={<Radio />} label="Solo hoy" />
              <FormControlLabel value="custom" control={<Radio />} label="Rango personalizado" />
            </RadioGroup>
          </FormControl>

          {pdfRangeType === 'custom' && (
            <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
              <TextField
                label="Desde"
                type="date"
                size="small"
                fullWidth
                value={pdfFrom}
                onChange={(e) => setPdfFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Hasta"
                type="date"
                size="small"
                fullWidth
                value={pdfTo}
                onChange={(e) => setPdfTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setPdfModalOpen(false)} sx={{ fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={executeDownloadReport}
            startIcon={<PdfIcon />}
            sx={{ borderRadius: '10px', fontWeight: 700, px: 3 }}
          >
            Generar Reporte
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
