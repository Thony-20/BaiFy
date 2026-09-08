import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import ProductTable from '../components/ProductTable';
import ProductFormModal from '../components/ProductFormModal';
import ImportExcelModal from '../components/ImportExcelModal';
import StockAdjustDialog from '../components/StockAdjustDialog';
import MovimientosDialog from '../components/MovimientosDialog';
import UpgradePlanModal from '../components/UpgradePlanModal';
import useProducts from '../hooks/useProducts';
import useAuthStore from '../store/useAuthStore';
import { createProduct, updateProduct, deleteProduct } from '../services/productService';
import { adjustStock } from '../services/stockService';
import toast from 'react-hot-toast';

export default function ProductosPage() {
  const { userProfile } = useAuthStore();
  const {
    products,
    loading,
    hasMore,
    page,
    filters,
    error,
    setFilters,
    nextPage,
    prevPage,
    refetch,
  } = useProducts();

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState(null);
  const [movimientosOpen, setMovimientosOpen] = useState(false);
  const [movimientosProduct, setMovimientosProduct] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockTipo, setStockTipo] = useState('incremento');
  const [stockIdempotencyKey, setStockIdempotencyKey] = useState(null);

  // Create / Edit
  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (product) => {
    setEditingProduct(product);
    setFormOpen(true);
  };

  const handleFormSubmit = async (formData) => {
    setFormLoading(true);
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData);
        toast.success('Producto actualizado correctamente');
      } else {
        await createProduct({
          ...formData,
          empresaId: userProfile.empresaId,
        });
        toast.success('Producto creado correctamente');
      }
      setFormOpen(false);
      refetch();
    } catch (error) {
      if (error.limitReached) {
        setFormOpen(false);
        setUpgradeModalOpen(true);
      } else {
        toast.error(error.message || 'Error al guardar el producto');
      }
    } finally {
      setFormLoading(false);
    }
  };

  // Delete
  const handleOpenDelete = (product) => {
    setDeletingProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteProduct(deletingProduct.id);
      toast.success('Producto eliminado');
      setDeleteDialogOpen(false);
      refetch();
    } catch (error) {
      toast.error('Error al eliminar el producto');
    }
  };

  const handleOpenStock = (product, tipo) => {
    setStockProduct(product);
    setStockTipo(tipo || 'incremento');
    setStockIdempotencyKey(crypto.randomUUID());
    setStockDialogOpen(true);
  };

  const handleStockSubmit = async ({ tipo, cantidad, notas }) => {
    setStockLoading(true);
    try {
      await adjustStock(
        stockProduct.id,
        tipo,
        cantidad,
        userProfile.uid,
        userProfile.empresaId,
        notas,
        stockIdempotencyKey
      );
      toast.success(
        tipo === 'incremento'
          ? `Stock incrementado en ${cantidad}`
          : `Stock reducido en ${cantidad}`
      );
      setStockDialogOpen(false);
      setStockIdempotencyKey(null);
      refetch();
    } catch (error) {
      toast.error(error.message || 'Error al ajustar el stock');
    } finally {
      setStockLoading(false);
    }
  };

  // Movimientos
  const handleViewMovimientos = (product) => {
    setMovimientosProduct(product);
    setMovimientosOpen(true);
  };

  const isAuthorized = userProfile?.rol === 'admin' || userProfile?.rol === 'super-admin';

  return (
    <Box sx={{ position: 'relative' }}>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Productos
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Gestiona el inventario de tu empresa
            </Typography>
          </Box>
          {isAuthorized && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setImportModalOpen(true)}
              >
                Importar Excel
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenCreate}
              >
                Nuevo Producto
              </Button>
            </Box>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            Error al cargar productos. Por favor, intenta de nuevo más tarde.
          </Alert>
        )}

        <ProductTable
          products={products}
          loading={loading}
          filters={filters}
          onFilterChange={setFilters}
          onEdit={handleOpenEdit}
          onDelete={handleOpenDelete}
          onStockAdjust={handleOpenStock}
          onViewMovimientos={handleViewMovimientos}
          onNextPage={nextPage}
          onPrevPage={prevPage}
          page={page}
          hasMore={hasMore}
          userRole={userProfile?.rol}
        />

        {/* Create/Edit Modal */}
        <ProductFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSubmit={handleFormSubmit}
          product={editingProduct}
          loading={formLoading}
        />

        {/* Import Excel Modal */}
        <ImportExcelModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImportSuccess={() => {
            setImportModalOpen(false);
            refetch();
          }}
          onLimitReached={() => {
            setImportModalOpen(false);
            setUpgradeModalOpen(true);
          }}
        />

        <UpgradePlanModal
          open={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
          currentPlan={userProfile?.planId}
        />

        {/* Stock Adjust Dialog */}
        <StockAdjustDialog
          open={stockDialogOpen}
          onClose={() => setStockDialogOpen(false)}
          onSubmit={handleStockSubmit}
          product={stockProduct}
          loading={stockLoading}
          initialTipo={stockTipo}
        />

        {/* Movimientos Dialog */}
        <MovimientosDialog
          open={movimientosOpen}
          onClose={() => setMovimientosOpen(false)}
          product={movimientosProduct}
        />

        {/* Delete Confirmation */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          PaperProps={{
            sx: {
              background: (theme) => theme.palette.mode === 'dark' 
                ? 'linear-gradient(180deg, #141A2E 0%, #121829 100%)' 
                : 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)',
              borderRadius: 3,
            },
          }}
        >
          <DialogTitle sx={{ fontWeight: 700 }}>
            Eliminar Producto
          </DialogTitle>
          <DialogContent>
            <Typography>
              ¿Estás seguro de que deseas eliminar{' '}
              <strong>{deletingProduct?.nombre}</strong>?
              Esta acción no se puede deshacer.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              sx={{ color: 'text.secondary' }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              variant="contained"
              sx={{
                backgroundColor: '#FF5252',
                '&:hover': { backgroundColor: '#E04848' },
                boxShadow: '0 4px 14px rgba(255, 82, 82, 0.3)',
              }}
            >
              Eliminar
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
