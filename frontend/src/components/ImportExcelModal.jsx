import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, CircularProgress, Alert, List, ListItem, ListItemText, LinearProgress
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import useAuthStore from '../store/useAuthStore';
import { bulkImportProducts } from '../services/productService';
import toast from 'react-hot-toast';

export default function ImportExcelModal({ open, onClose, onImportSuccess, onLimitReached }) {
  const { userProfile } = useAuthStore();
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      setFile(acceptedFiles[0]);
      setError(null);
      setResults(null);
    }
  });

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      const normalizeKey = (key) => {
        // Eliminar todo lo que no sea letras o números para una comparación pura
        return key.toLowerCase().replace(/[^a-z0-9]/g, '');
      };

      const parseNumeric = (val) => {
        if (typeof val === 'number') return val;
        if (!val || String(val).trim() === '') return NaN;
        // Eliminar símbolos de moneda, espacios y separadores de miles comunes
        let cleaned = String(val)
          .replace(/[^0-9.,-]/g, '')
          .trim();

        // Manejar formato decimal europeo/latino (coma como decimal)
        // Si hay una coma y no hay punto, la convertimos a punto
        if (cleaned.includes(',') && !cleaned.includes('.')) {
          cleaned = cleaned.replace(',', '.');
        } else if (cleaned.includes(',') && cleaned.includes('.')) {
          // Si hay ambos, eliminamos la coma (asumiendo que es separador de miles)
          cleaned = cleaned.replace(/,/g, '');
        }

        return parseFloat(cleaned);
      };

      // 1. Identificar las llaves (headers) reales del JSON
      if (rawJson.length === 0) throw new Error("El archivo Excel está vacío.");

      const allKeys = Object.keys(rawJson[0]);
      const headerMap = {};

      const findKeyFor = (keywords, exclude = []) => {
        const cleanKeywords = keywords.map(kw => kw.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const cleanExclude = exclude.map(kw => kw.toLowerCase().replace(/[^a-z0-9]/g, ''));

        // 1. Priorizar coincidencia EXACTA
        let found = allKeys.find(key => {
          const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanKeywords.includes(cleanKey);
        });

        if (found) return found;

        // 2. Si no hay exacta, buscar por contenido (con exclusión)
        return allKeys.find(key => {
          const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          const isExcluded = cleanExclude.some(ex => cleanKey.includes(ex));
          if (isExcluded) return false;
          return cleanKeywords.some(kw => cleanKey.includes(kw));
        });
      };

      // Mapeo inicial de columnas basado en palabras clave
      headerMap.nombre = findKeyFor(['nombre', 'producto', 'articulo', 'item']);
      headerMap.sku = findKeyFor(['sku', 'codigo', 'referencia', 'ref', 'cod']);
      headerMap.fechaVencimiento = findKeyFor(['vencimiento', 'venc', 'expir', 'vence', 'vto', 'exp', 'caduc', 'limit']);
      headerMap.stock = findKeyFor(['stock', 'cantidad', 'cant', 'existencia', 'unidades']);
      headerMap.valor = findKeyFor(['valor', 'precio', 'venta', 'monto'], ['atributo', 'costo', 'compra']);
      headerMap.costo = findKeyFor(['costo', 'compra', 'adquisicion', 'unitario']);
      headerMap.ubicacion = findKeyFor(['ubicacion', 'estante', 'pasillo', 'bodega', 'almacen']);
      headerMap.descripcion = findKeyFor(['descripcion', 'detalle', 'info', 'obs']);
      headerMap.atributo = findKeyFor(['atributo', 'tipo', 'clase', 'categoria']);
      headerMap.valorAtributo = findKeyFor(['valor_atributo', 'valor1', 'datos']);
      headerMap.estado = findKeyFor(['estado', 'status', 'activo']);

      console.log("Columnas detectadas:", headerMap);

      const parsedProducts = rawJson.map((row) => {
        const getRaw = (id) => row[headerMap[id]] || '';

        const nombre = String(getRaw('nombre')).trim();
        const sku = String(getRaw('sku')).trim();
        const rawFecha = getRaw('fechaVencimiento');
        let fechaVencimiento = '';

        if (rawFecha instanceof Date) {
          fechaVencimiento = isNaN(rawFecha.getTime()) ? '' : rawFecha.toISOString();
        } else if (rawFecha) {
          fechaVencimiento = String(rawFecha).trim();
        }

        const valorRaw = getRaw('valor');
        const costoRaw = getRaw('costo');
        const stockRaw = getRaw('stock');
        const rawEstado = String(getRaw('estado')).toLowerCase();

        let atributosObj = {};
        const attrName = String(getRaw('atributo')).trim();
        const attrVal = String(getRaw('valorAtributo')).trim();
        if (attrName && attrVal) {
          atributosObj[attrName] = attrVal;
        }

        const valor = parseNumeric(valorRaw) || 0;
        const costo = parseNumeric(costoRaw) || 0;

        if (valor > 0 && costo > 0 && valor < costo) {
          throw new Error(`Error en el producto "${nombre || 'sin nombre'}": El precio de venta ($${valor}) no puede ser menor al costo ($${costo}).`);
        }

        return {
          nombre,
          sku,
          descripcion: String(getRaw('descripcion')).trim(),
          stock: Math.floor(parseNumeric(stockRaw)) || 0,
          estado: rawEstado === 'inactivo' ? 'inactivo' : 'activo',
          valor,
          costo,
          ubicacion: String(getRaw('ubicacion')).trim(),
          fechaVencimiento,
          atributos: atributosObj,
        };
      }).filter(p => p.nombre !== '');

      const mergedProductsMap = new Map();
      parsedProducts.forEach(p => {
        const key = `${p.nombre.trim().toLowerCase()}_${(p.sku || '').trim().toLowerCase()}`;

        if (mergedProductsMap.has(key)) {
          const existingProduct = mergedProductsMap.get(key);
          existingProduct.stock += p.stock;
          // Si el producto existente no tiene fecha pero este registro sí, la agregamos
          if (!existingProduct.fechaVencimiento && p.fechaVencimiento) {
            existingProduct.fechaVencimiento = p.fechaVencimiento;
          }
        } else {
          mergedProductsMap.set(key, { ...p });
        }
      });

      const finalParsedProducts = Array.from(mergedProductsMap.values());

      if (finalParsedProducts.length === 0) {
        throw new Error("No se encontraron productos válidos (comprueba que las columnas 'nombre' y 'valor' estén completas).");
      }

      const CHUNK_SIZE = 300;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;

      for (let i = 0; i < finalParsedProducts.length; i += CHUNK_SIZE) {
        const chunk = finalParsedProducts.slice(i, i + CHUNK_SIZE);
        setProcessingProgress(`Procesando ${Math.min(i + CHUNK_SIZE, finalParsedProducts.length)} de ${finalParsedProducts.length}...`);

        const response = await bulkImportProducts(userProfile.empresaId, chunk);

        totalCreated += response.resultados.created || 0;
        totalUpdated += response.resultados.updated || 0;
        totalErrors += response.resultados.errors || 0;
      }

      setProcessingProgress(null);
      setResults({ created: totalCreated, updated: totalUpdated, errors: totalErrors });
      toast.success("Importación completada exitosamente");
      if (onImportSuccess) onImportSuccess();

    } catch (err) {
      if (err.limitReached && onLimitReached) {
        onLimitReached();
      } else {
        setError(err.message || 'Error procesando el archivo');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResults(null);
    setError(null);
    setProcessingProgress(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={!loading ? handleClose : undefined} maxWidth="sm" fullWidth>
      <DialogTitle>Importar Productos (Excel)</DialogTitle>
      <DialogContent>
        {!results ? (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Asegúrate de que el Excel contenga las siguientes columnas:
              <br />
              <b>nombre | sku | ubicacion | descripcion | fecha_vencimiento | stock | estado | atributo | valor_atributo | costo | precio</b>
            </Typography>

            <Box
              {...getRootProps()}
              sx={{
                border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragActive ? 'action.hover' : 'background.paper',
                transition: 'all 0.2s ease',
                mt: 2
              }}
            >
              <input {...getInputProps()} />
              <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              {file ? (
                <Typography variant="h6" color="primary">{file.name}</Typography>
              ) : (
                <Typography color="text.secondary">
                  Arrastra y suelta tu archivo Excel aquí, o haz clic para seleccionar
                </Typography>
              )}
            </Box>

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            {loading && (
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <LinearProgress sx={{ mb: 1 }} />
                {processingProgress && (
                  <Typography variant="caption" color="text.secondary">
                    {processingProgress}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success" sx={{ mb: 2 }}>Proceso completado</Alert>
            <List>
              <ListItem><ListItemText primary="Creados nuevos" secondary={results.created} /></ListItem>
              <ListItem><ListItemText primary="Actualizados" secondary={results.updated} /></ListItem>
              <ListItem><ListItemText primary="Errores" secondary={results.errors} /></ListItem>
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          {results ? 'Cerrar' : 'Cancelar'}
        </Button>
        {!results && (
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={!file || loading}
            startIcon={loading && <CircularProgress size={20} />}
          >
            Procesar Importación
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
