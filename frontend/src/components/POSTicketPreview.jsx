import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
} from '@mui/material';
import { Print as PrintIcon, Close as CloseIcon, Receipt as ReceiptIcon } from '@mui/icons-material';

export default function POSTicketPreview({ open, onClose, saleData, empresaInfo }) {
  if (!saleData) return null;

  const bcvRate =
    typeof saleData.exchangeRate === 'number' &&
    Number.isFinite(saleData.exchangeRate) &&
    saleData.exchangeRate > 0
      ? saleData.exchangeRate
      : null;

  const handlePrint = () => {
    const printContent = document.getElementById('printable-ticket');
    const win = window.open('', '', 'height=600,width=400');
    win.document.write('<html><head><title>Ticket de Venta</title>');
    win.document.write(`<base href="${window.location.origin}/">`);
    win.document.write('<style>body{font-family: monospace; padding: 20px; font-size: 12px;} .center{text-align: center;} .right{text-align: right;} .bold{font-weight: bold;} hr{border: 0; border-top: 1px dashed #000; margin: 10px 0;} table{width: 100%;} .qr{width: 100px; height: 100px; margin: 10px auto; background: #eee; display: flex; align-items: center; justify-content: center; border: 1px solid #ccc;} img{max-width: 100%; height: auto; display: block; margin: 0 auto;}</style>');
    win.document.write('</head><body>');
    win.document.write(printContent.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => {
        win.print();
        win.close();
    }, 250);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogContent id="printable-ticket" sx={{ p: 4, background: '#fff', color: '#000' }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <img
            src={empresaInfo?.fotoEmpresa || '/LOGO1.png'}
            alt={empresaInfo?.empresaNombre || 'Empresa'}
            style={{ width: '120px', maxWidth: '100%', maxHeight: '120px', objectFit: 'contain', marginBottom: '8px' }}
          />
          <Typography variant="h6" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
            {empresaInfo?.empresaNombre || empresaInfo?.nombre || 'STOCKLY'}
          </Typography>
        </Box>

        <Divider sx={{ my: 1, borderStyle: 'dashed' }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold' }}>
            TICKET: {saleData.id}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>
            FECHA: {saleData.fechaVenta ? new Date(saleData.fechaVenta).toLocaleString() : new Date().toLocaleString()}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>
            CAJERO: {empresaInfo?.userName || 'Administrador'}
          </Typography>
          {(() => {
            const cedula =
              saleData.cliente?.cedula
              || saleData.cliente?.clienteId
              || null;
            const nombre = String(saleData.cliente?.nombre || '').trim();
            const isGeneral = !nombre || nombre.toLowerCase() === 'cliente general';
            const isGenericPlaceholder = !nombre || nombre.toLowerCase() === 'cliente';

            if (!cedula && (isGeneral || !nombre)) return null;

            if (cedula && nombre && !isGeneral && !isGenericPlaceholder) {
              return (
                <>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    CLIENTE: {nombre}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block' }}>
                    CÉDULA: {cedula}
                  </Typography>
                </>
              );
            }

            if (cedula) {
              return (
                <Typography variant="caption" sx={{ display: 'block' }}>
                  CÉDULA: {cedula}
                </Typography>
              );
            }

            return (
              <Typography variant="caption" sx={{ display: 'block' }}>
                CLIENTE: {nombre}
              </Typography>
            );
          })()}
        </Box>

        <Divider sx={{ my: 1, borderStyle: 'dashed' }} />

        <table style={{ width: '100%', fontSize: '0.75rem' }}>
          <thead>
            <tr>
              <th align="left">DESC</th>
              <th align="center">CANT</th>
              <th align="right">SUB</th>
            </tr>
          </thead>
          <tbody>
            {saleData.items.map((item, i) => (
              <tr key={i}>
                <td style={{ paddingRight: '10px', wordBreak: 'break-word' }}>{item.nombre}</td>
                <td align="center">x{item.cantidad}</td>
                <td align="right">${(item.cantidad * item.precioUnitario).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Divider sx={{ my: 1, borderStyle: 'dashed' }} />

        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="caption" sx={{ display: 'block' }}>Subtotal: ${saleData.subtotal.toFixed(2)}</Typography>
          {saleData.descuento > 0 && (
            <Typography variant="caption" sx={{ display: 'block' }}>Descuento: -${saleData.descuento.toFixed(2)}</Typography>
          )}

          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mt: 0.5 }}>TOTAL USD: ${saleData.total.toFixed(2)}</Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#3B82F6' }}>
            TOTAL BS:{' '}
            {bcvRate != null
              ? `Bs. ${((saleData.total || 0) * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '— (sin tasa BCV en la venta)'}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', fontSize: '0.6rem', mt: 0.5, fontStyle: 'italic' }}>
            Tasa BCV: {bcvRate != null ? `${bcvRate.toFixed(2)} Bs/$` : '—'}
          </Typography>
        </Box>

        <Divider sx={{ my: 1, borderStyle: 'dashed' }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>FORMA DE PAGO:</Typography>
          {saleData.metodosPago.map((m, i) => (
            <Typography key={i} variant="caption" sx={{ display: 'block' }}>
              - {m.label}: ${m.amount}
              {bcvRate != null
                ? ` (Bs. ${(parseFloat(m.amount) * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                : ''}
            </Typography>
          ))}
        </Box>

        <Box sx={{ textAlign: 'center', mt: 3, pt: 2, borderTop: '1px solid #eee' }}>
          <img src="/LOGO1.png" alt="BAYFI" style={{ width: '80px', opacity: 0.5, marginBottom: '8px' }} />
          <Typography variant="caption" sx={{ fontStyle: 'italic', display: 'block', fontSize: '0.6rem', mt: 1, lineHeight: 1.2 }}>
            COMPROBANTE NO VÁLIDO COMO FACTURA. Este documento no representa una factura fiscal según las normativas vigentes del SENIAT. Su propósito es únicamente el registro administrativo interno.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, background: '#f5f5f5' }}>
        <Button startIcon={<CloseIcon />} onClick={onClose} color="inherit">Cerrar</Button>
        <Button startIcon={<PrintIcon />} variant="contained" onClick={handlePrint} sx={{ background: '#3B82F6' }}>
          Imprimir
        </Button>
      </DialogActions>
    </Dialog>
  );
}
