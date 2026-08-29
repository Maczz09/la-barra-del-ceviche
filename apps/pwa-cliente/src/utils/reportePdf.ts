// utils/reportePdf.ts — Exporta el resumen de reportes a PDF.
// jspdf/jspdf-autotable se cargan lazy (import dinámico) para no engordar
// el bundle principal: solo se descargan cuando el usuario pulsa "Exportar".

import type { RankingProducto, ResumenVM } from '../types/reporte.types';
import { APP_NAME } from '../config';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

// jspdf/jspdf-autotable no resuelven tipos de forma consistente en el import()
// dinámico bajo este resolver de eslint (tsc sí los resuelve bien) — se tipan
// acá solo los miembros que de verdad se usan, en vez de `any`.
interface DocPdf {
  setFontSize(size: number): void;
  text(text: string, x: number, y: number): void;
  lastAutoTable?: { finalY: number };
}
type AutoTableFn = (doc: unknown, options: Record<string, unknown>) => void;

function agregarTablaProductos(doc: DocPdf, autoTable: AutoTableFn, titulo: string, items: RankingProducto, margenX: number, y: number): number {
  if (items.length === 0) return y;
  doc.setFontSize(12);
  doc.text(titulo, margenX, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Producto', 'Cantidad', 'Ingresos']],
    body: items.map((p) => [
      p.nombre,
      String(p.cantidad),
      p.ingresos == null ? '—' : formatMoney(p.ingresos),
    ]),
    margin: { left: margenX, right: margenX },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [55, 65, 81] },
  });
  return (doc.lastAutoTable?.finalY ?? y) + 10;
}

export async function exportarResumenPdf(resumen: ResumenVM, nombreLocal = APP_NAME): Promise<void> {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new JsPDF();
  const margenX = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text(`${nombreLocal} — Reporte de ventas`, margenX, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(resumen.rangoLabel, margenX, y);
  y += 10;

  doc.setTextColor(0);
  doc.setFontSize(11);
  const kpis = [
    ['Ingresos', formatMoney(resumen.ingresosTotales)],
    ['Ventas cerradas', String(resumen.totalVentas)],
    ['Ticket promedio (media)', resumen.ticketPromedioLabel],
    ['Ticket mediana', resumen.estadisticasTicket.medianaLabel],
    ['Moda del ticket', resumen.estadisticasTicket.modaLabel],
  ];
  for (const [label, value] of kpis) {
    doc.text(`${label}: ${value}`, margenX, y);
    y += 6;
  }
  y += 4;

  y = agregarTablaProductos(doc, autoTable, 'Top platos (Carta/Menú)', resumen.topPlatos, margenX, y);
  y = agregarTablaProductos(doc, autoTable, 'Top productos (Inventario)', resumen.topProductos, margenX, y);
  y = agregarTablaProductos(doc, autoTable, 'Productos menos vendidos', resumen.productosMenosVendidos, margenX, y);

  if (resumen.ventasPorHora.length > 0) {
    doc.setFontSize(12);
    doc.text('Ventas por hora', margenX, y);
    autoTable(doc, {
      startY: y + 4,
      head: [['Hora', 'Total']],
      body: resumen.ventasPorHora.map((h) => [h.hora, formatMoney(h.total)]),
      margin: { left: margenX, right: margenX },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [55, 65, 81] },
    });
  }

  const nombreArchivo = `reporte-ventas_${resumen.fecha.slice(0, 10)}.pdf`;
  doc.save(nombreArchivo);
}
