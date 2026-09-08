import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Genera un reporte PDF de las ventas proporcionadas.
 * @param {Array} sales - Lista de ventas a incluir.
 * @param {Object} empresaInfo - Información de la empresa (nombre, etc).
 */
export const generateSalesReportPDF = async (sales, empresaInfo, customFilename) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  // Usar el nombre de la empresa del perfil o fallback
  const nombreEmpresa = empresaInfo?.empresaNombre || empresaInfo?.nombre || 'Mi Empresa';
  
  // 1. Agregar Logo
  try {
    const logoUrl = '/LOGO1.png';
    const img = new Image();
    img.src = logoUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; // Continuar aunque el logo falle
    });
    if (img.complete && img.naturalWidth > 0) {
      doc.addImage(img, 'PNG', 14, 10, 30, 15);
    }
  } catch (e) {
    console.error('Error loading logo for PDF:', e);
  }

  // 2. Título y Encabezado
  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.text('REPORTE DE VENTAS - BAYFI', 50, 18);
  
  doc.setFontSize(10);
  doc.text(`Empresa: ${nombreEmpresa}`, 50, 24);
  doc.text(`Fecha de Reporte: ${new Date().toLocaleString()}`, 230, 24);
  
  doc.setLineWidth(0.5);
  doc.line(14, 28, 283, 28);

  // 3. Preparar Datos de la Tabla
  const tableColumn = [
    'FECHA', 
    'PRODUCTOS', 
    'PAGO MOVIL', 
    'TRANSF.', 
    'BIOPAGO', 
    'EFEC. BS', 
    'EFEC. USD', 
    'TARJETA', 
    'DOLAR BCV', 
    'REF.', 
    'TOTAL USD'
  ];
  
  const tableRows = [];
  
  let totals = {
    total: 0,
    mobile: 0,
    transfer: 0,
    biopago: 0,
    cashBs: 0,
    cashUsd: 0,
    card: 0,
    prestamo: 0,
  };

  sales.forEach(sale => {
    const rawRate = sale.exchangeRate;
    const rate =
      typeof rawRate === 'number' && Number.isFinite(rawRate) && rawRate > 0 ? rawRate : null;
    
    const getAmount = (methodId) => {
      const p = (sale.metodosPago || []).find(m => m.method === methodId);
      return p ? parseFloat(p.amount) : 0;
    };

    const mobile = getAmount('mobile');
    const transfer = getAmount('transfer');
    const biopago = getAmount('biopago');
    const cashBs = getAmount('cash-bs');
    const cashUsd = getAmount('cash-usd');
    const card = getAmount('card');
    const prestamo = getAmount('prestamo');

    totals.total += (sale.total || 0);
    totals.mobile += mobile;
    totals.transfer += transfer;
    totals.biopago += biopago;
    totals.cashBs += cashBs;
    totals.cashUsd += cashUsd;
    totals.card += card;
    totals.prestamo += prestamo;

    // Manejo robusto de fechas
    let dateStr = 'N/A';
    try {
      if (sale.createdAt?.seconds) {
        dateStr = new Date(sale.createdAt.seconds * 1000).toLocaleDateString();
      } else if (sale.createdAt?._seconds) {
        dateStr = new Date(sale.createdAt._seconds * 1000).toLocaleDateString();
      } else {
        dateStr = new Date(sale.createdAt).toLocaleDateString();
      }
    } catch(e) {}

    const rowData = [
      dateStr,
      (sale.items || []).map(i => `${i.nombre} (x${i.cantidad})`).join(', ').substring(0, 30) + (sale.items?.length > 1 ? '...' : ''),
      `$${mobile.toFixed(2)}`,
      `$${transfer.toFixed(2)}`,
      `$${biopago.toFixed(2)}`,
      `$${cashBs.toFixed(2)}`,
      `$${cashUsd.toFixed(2)}`,
      `$${card.toFixed(2)}`,
      rate !== null ? rate.toFixed(2) : '—',
      sale.id || 'N/A',
      `$${(sale.total || 0).toFixed(2)}`
    ];
    tableRows.push(rowData);
  });

  // 4. Generar Tabla usando autoTable directamente (más compatible con Vite)
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillStyle: 'F', fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 25 }, // Fecha
      1: { cellWidth: 'auto' }, // Productos
      2: { fontStyle: 'bold', halign: 'right', cellWidth: 22 }, // Pago Movil
      3: { fontStyle: 'bold', halign: 'right', cellWidth: 22 }, // Transf
      4: { fontStyle: 'bold', halign: 'right', cellWidth: 22 }, // Biopago
      5: { fontStyle: 'bold', halign: 'right', cellWidth: 22 }, // Efec Bs
      6: { fontStyle: 'bold', halign: 'right', cellWidth: 22 }, // Efec Usd
      7: { fontStyle: 'bold', halign: 'right', cellWidth: 22 }, // Tarjeta
      8: { halign: 'center', cellWidth: 15 }, // Dolar BCV
      9: { halign: 'center', cellWidth: 35 }, // Ref (Más ancho para ID completo)
      10: { fontStyle: 'bold', halign: 'right', fillColor: [240, 247, 255], cellWidth: 25 } // Total USD
    }
  });

  // 5. Resumen Final
  const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 10 : 70;
  
  doc.setLineWidth(0.5);
  doc.line(14, finalY, 283, finalY);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DE TOTALES', 14, finalY + 10);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const summaryLeft = 14;
  const summaryRight = 100;
  const rowHeight = 6;
  
  let currentY = finalY + 18;
  
  doc.text('Total recaudado:', summaryLeft, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.total || 0).toFixed(2)}`, summaryLeft + 35, currentY);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Total Pago Móvil:', summaryRight, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.mobile || 0).toFixed(2)}`, summaryRight + 35, currentY);
  
  currentY += rowHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('Total Efectivo USD:', summaryLeft, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.cashUsd || 0).toFixed(2)}`, summaryLeft + 35, currentY);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Total Transferencia:', summaryRight, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.transfer || 0).toFixed(2)}`, summaryRight + 35, currentY);
  
  currentY += rowHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('Total Efectivo BS:', summaryLeft, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.cashBs || 0).toFixed(2)}`, summaryLeft + 35, currentY);
  
  doc.setFont('helvetica', 'normal');
  doc.text('Total Biopago:', summaryRight, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.biopago || 0).toFixed(2)}`, summaryRight + 35, currentY);
  
  currentY += rowHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('Total Tarjeta:', summaryRight, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.card || 0).toFixed(2)}`, summaryRight + 35, currentY);

  currentY += rowHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('Total Préstamo:', summaryLeft, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${(totals.prestamo || 0).toFixed(2)}`, summaryLeft + 35, currentY);

  // Pie de página
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Generado por Sistema de Gestión BAYFI - Todos los derechos reservados.', 14, 200);

  // 6. Guardar
  const fileName = customFilename || `Reporte_Ventas_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
};
