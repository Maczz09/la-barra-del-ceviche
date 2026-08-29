// utils/inventarioPdf.ts — T-49. Exporta el inventario a PDF imprimible.
//
// Dos formatos, porque son dos usos distintos:
//  · CUADRE  — con columnas EN BLANCO para anotar a mano lo que se contó en el
//              almacén y firmar. Es el papel que se lleva físicamente.
//  · VALORIZADO — precio × stock con totales. Es el que se archiva.
// Los dos salen en A4 VERTICAL.
//
// jspdf/jspdf-autotable se cargan lazy (import dinámico), igual que en
// reportePdf.ts: solo se descargan cuando el usuario pulsa "Descargar".

import { APP_NAME } from '../config';
import { STOCK_BAJO, computeInventarioKpis, stockNivel } from '../domain/inventario';
import type { ProductoVM } from '../types/inventario.types';

export type FormatoInventarioPdf = 'cuadre' | 'valorizado';

/** Lo mínimo que necesita el cuadre del almacén. Estructural a propósito (no
 *  `InsumoVM`): este módulo no debería depender del dominio de Compras. */
export interface InsumoAlmacenPdf {
  nombre: string;
  unidad: string;
  stockActual: number;
  stockMinimo: number;
}

export interface OpcionesInventarioPdf {
  formato: FormatoInventarioPdf;
  /** Nombre de la sede; va en la cabecera para que dos PDFs de sedes distintas
   *  no se confundan al imprimirlos juntos. */
  sedeNombre?: string | null;
  usuarioNombre?: string | null;
  /** Descripción del filtro aplicado ("Categoría: Abarrotes · Solo stock bajo").
   *  Va impreso para que nadie confunda un PDF parcial con el inventario completo. */
  filtroLabel?: string | null;
  nombreLocal?: string;
}

// jspdf/jspdf-autotable no resuelven tipos de forma consistente en el import()
// dinámico bajo este resolver de eslint (tsc sí los resuelve bien) — se tipan
// acá solo los miembros que de verdad se usan, en vez de `any`.
interface DocPdf {
  setFontSize(size: number): void;
  setTextColor(gris: number): void;
  text(text: string, x: number, y: number): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  splitTextToSize(text: string, ancho: number): string[];
  lastAutoTable?: { finalY: number };
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  save(nombre: string): void;
}
type AutoTableFn = (doc: unknown, options: Record<string, unknown>) => void;

// jsPDF con las fuentes estándar (Helvetica) escribe en WinAnsi/CP1252. Un
// carácter fuera de ese juego —"≤" es el caso típico— no solo sale como basura
// ("d5): además descuadra el espaciado de TODA la línea que lo contiene. Se
// normaliza antes de dibujar cualquier texto.
const REEMPLAZOS: Record<string, string> = {
  '≤': '<=',
  '≥': '>=',
  '−': '-',
  '–': '-',
  '→': '->',
  '←': '<-',
  '…': '...',
  '·': '-',
  '▢': '',
  // CP1252 sí tiene estos en su rango alto, pero su punto de código es > 0xFF:
  // se mapean a ASCII para no depender de cómo los codifique jsPDF.
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
};

/** Ultimo punto de codigo que WinAnsi/CP1252 sabe escribir. */
const MAX_LATIN1 = 0xff;

export function sanitizarTextoPdf(texto: string): string {
  let salida = '';
  for (const caracter of texto) {
    const reemplazo = REEMPLAZOS[caracter];
    if (reemplazo !== undefined) {
      salida += reemplazo;
      continue;
    }
    // Lo que quede fuera de Latin-1 se descarta antes de llegar al PDF: es
    // mejor perder un glifo raro que romper la linea entera.
    if ((caracter.codePointAt(0) ?? 0) <= MAX_LATIN1) salida += caracter;
  }
  return salida;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

/** Fecha y hora en hora de Lima: el cuadre se firma con la hora del local, no
 *  con la del navegador de quien exporta. */
function selloDeTiempo(ahora: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ahora);
}

function fechaArchivo(ahora: Date): string {
  // en-CA da YYYY-MM-DD directo, ya en el huso de Lima.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(ahora);
}

interface Grupo {
  nombre: string;
  productos: ProductoVM[];
}

/** Agrupa por categoría respetando el orden alfabético que ya trae el listado.
 *  "Sin categoría" va al final: es la excepción, no debe abrir el documento. */
export function agruparPorCategoria(productos: ProductoVM[]): Grupo[] {
  const porNombre = new Map<string, ProductoVM[]>();
  for (const p of productos) {
    const clave = p.categoriaNombre ?? 'Sin categoría';
    const grupo = porNombre.get(clave);
    if (grupo) grupo.push(p);
    else porNombre.set(clave, [p]);
  }
  return [...porNombre.entries()]
    .map(([nombre, items]) => ({ nombre, productos: items }))
    .sort((a, b) => {
      if (a.nombre === 'Sin categoría') return 1;
      if (b.nombre === 'Sin categoría') return -1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
}

export function valorizar(productos: ProductoVM[]): number {
  return productos.reduce((suma, p) => suma + p.precio * (p.stockActual ?? 0), 0);
}

function unidadesDe(productos: ProductoVM[]): number {
  return productos.reduce((suma, p) => suma + (p.stockActual ?? 0), 0);
}

function etiquetaNivel(producto: ProductoVM): string {
  const nivel = stockNivel(producto.stockActual);
  if (nivel === 'out') return 'AGOTADO';
  if (nivel === 'low') return 'BAJO';
  return '';
}

const MARGEN_X = 14;
const GRIS_CABECERA: [number, number, number] = [55, 65, 81];
/** Interlineado de las líneas de cabecera, en mm. */
const ALTO_LINEA = 5.5;

/**
 * Única vía de escritura de texto: sanitiza y AJUSTA AL ANCHO de la hoja.
 * Escribir con `doc.text()` a pelo se salía del papel en cuanto la línea crecía
 * (el resumen de KPIs y el label de filtro son de largo variable).
 */
function escribir(doc: DocPdf, texto: string, y: number, x = MARGEN_X): number {
  const anchoUtil = doc.internal.pageSize.getWidth() - MARGEN_X * 2;
  const lineas = doc.splitTextToSize(sanitizarTextoPdf(texto), anchoUtil);
  let cursor = y;
  for (const linea of lineas) {
    doc.text(linea, x, cursor);
    cursor += ALTO_LINEA;
  }
  return cursor;
}

/** Sanitiza cada celda: un nombre de producto con un guion raro o un emoji
 *  rompería el espaciado de su fila igual que en las cabeceras. */
function limpiarFilas(filas: string[][]): string[][] {
  return filas.map((fila) => fila.map(sanitizarTextoPdf));
}

function dibujarCabecera(
  doc: DocPdf,
  titulo: string,
  opciones: OpcionesInventarioPdf,
  productos: ProductoVM[],
  ahora: Date,
): number {
  const nombreLocal = opciones.nombreLocal ?? APP_NAME;
  let y = 18;

  doc.setFontSize(16);
  doc.setTextColor(0);
  y = escribir(doc, `${nombreLocal} - ${titulo}`, y) + 2;

  doc.setFontSize(10);
  doc.setTextColor(100);
  const contexto = [
    opciones.sedeNombre ? `Sede: ${opciones.sedeNombre}` : null,
    `Emitido: ${selloDeTiempo(ahora)}`,
    opciones.usuarioNombre ? `Por: ${opciones.usuarioNombre}` : null,
  ].filter(Boolean);
  y = escribir(doc, contexto.join('  -  '), y);
  y = escribir(doc, `Alcance: ${opciones.filtroLabel?.trim() || 'Todo el inventario'}`, y) + 3;

  const kpis = computeInventarioKpis(productos);
  doc.setTextColor(0);
  doc.setFontSize(11);
  // Dos líneas cortas en vez de una larga: aunque el ajuste de ancho ya evita
  // el desborde, partir a mitad de un "Stock bajo: 3" quedaba ilegible.
  y = escribir(doc, `Productos: ${kpis.total}      Disponibles: ${kpis.disponibles}`, y);
  y = escribir(doc, `Stock bajo (${STOCK_BAJO} o menos): ${kpis.bajo}      Agotados: ${kpis.agotados}`, y);
  return y + 5;
}

/** Firmas al pie de la ÚLTIMA página: quien contó y quien revisó. Solo en el
 *  cuadre — el valorizado no se firma, es un reporte. */
function dibujarFirmas(doc: DocPdf, desdeY: number): void {
  const alto = doc.internal.pageSize.getHeight();
  const ancho = doc.internal.pageSize.getWidth();
  // Si la tabla terminó muy abajo, la firma iría fuera de la hoja: se ancla a
  // una altura fija cerca del pie en ese caso.
  const y = Math.min(desdeY + 18, alto - 24);
  const anchoLinea = (ancho - MARGEN_X * 2 - 20) / 2;

  doc.setTextColor(100);
  doc.setFontSize(10);
  doc.line(MARGEN_X, y, MARGEN_X + anchoLinea, y);
  doc.text(sanitizarTextoPdf('Contó (nombre y firma)'), MARGEN_X, y + 5);

  const x2 = MARGEN_X + anchoLinea + 20;
  doc.line(x2, y, x2 + anchoLinea, y);
  doc.text(sanitizarTextoPdf('Revisó (nombre y firma)'), x2, y + 5);
}

function opcionesDePagina(doc: DocPdf, ahora: Date) {
  return {
    didDrawPage: () => {
      const alto = doc.internal.pageSize.getHeight();
      const ancho = doc.internal.pageSize.getWidth();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(sanitizarTextoPdf(selloDeTiempo(ahora)), MARGEN_X, alto - 8);
      doc.text(sanitizarTextoPdf(`${APP_NAME} - Inventario`), ancho - MARGEN_X - 34, alto - 8);
    },
  };
}

export async function exportarInventarioPdf(
  productos: ProductoVM[],
  opciones: OpcionesInventarioPdf,
): Promise<string> {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const esCuadre = opciones.formato === 'cuadre';
  const ahora = new Date();
  // Vertical (A4 retrato) en los dos formatos: es como se archiva y como se
  // imprime en el local. Las columnas en blanco del cuadre se dimensionan para
  // caber en los ~182mm útiles sin apretar el nombre del producto.
  const doc = new JsPDF() as unknown as DocPdf;
  const tabla = autoTable as unknown as AutoTableFn;

  const titulo = esCuadre ? 'Cuadre físico de inventario' : 'Inventario valorizado';
  let y = dibujarCabecera(doc, titulo, opciones, productos, ahora);

  const grupos = agruparPorCategoria(productos);

  if (grupos.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    escribir(doc, 'No hay productos que coincidan con el filtro aplicado.', y);
  }

  for (const grupo of grupos) {
    doc.setFontSize(12);
    doc.setTextColor(0);
    escribir(doc, `${grupo.nombre}  (${grupo.productos.length})`, y);

    if (esCuadre) {
      tabla(doc, {
        startY: y + 4,
        head: limpiarFilas([['Producto', 'Stock sistema', 'Stock físico', 'Diferencia', 'Observación']]),
        body: limpiarFilas(
          grupo.productos.map((p) => [
            etiquetaNivel(p) ? `${p.nombre}  (${etiquetaNivel(p)})` : p.nombre,
            String(p.stockActual ?? 0),
            '',
            '',
            '',
          ]),
        ),
        foot: limpiarFilas([[`Total ${grupo.nombre}`, String(unidadesDe(grupo.productos)), '', '', '']]),
        margin: { left: MARGEN_X, right: MARGEN_X },
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: GRIS_CABECERA },
        footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' },
        // Las tres columnas en blanco se dejan lo más anchas que permite el
        // retrato: se escriben a mano, con lapicero, parado en el almacén.
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 22, halign: 'right' },
          2: { cellWidth: 26 },
          3: { cellWidth: 24 },
          4: { cellWidth: 34 },
        },
        ...opcionesDePagina(doc, ahora),
      });
    } else {
      tabla(doc, {
        startY: y + 4,
        head: limpiarFilas([['Producto', 'Stock', 'Precio unit.', 'Valor']]),
        body: limpiarFilas(
          grupo.productos.map((p) => [
            p.nombre,
            String(p.stockActual ?? 0),
            formatMoney(p.precio),
            formatMoney(p.precio * (p.stockActual ?? 0)),
          ]),
        ),
        foot: limpiarFilas([[
          `Total ${grupo.nombre}`,
          String(unidadesDe(grupo.productos)),
          '',
          formatMoney(valorizar(grupo.productos)),
        ]]),
        margin: { left: MARGEN_X, right: MARGEN_X },
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: GRIS_CABECERA },
        footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' },
        columnStyles: {
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
        ...opcionesDePagina(doc, ahora),
      });
    }

    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  if (esCuadre) {
    dibujarFirmas(doc, y);
  } else if (grupos.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(0);
    escribir(doc, `Valor total del inventario: ${formatMoney(valorizar(productos))}`, y);
  }

  const nombreArchivo = `inventario-${esCuadre ? 'cuadre' : 'valorizado'}_${fechaArchivo(ahora)}.pdf`;
  doc.save(nombreArchivo);
  return nombreArchivo;
}

/**
 * T-50: el mismo cuadre, pero del almacén de cocina. Cambian las columnas —
 * acá manda la UNIDAD (2.5 kg no es lo mismo que 2.5 unidades) y el mínimo, que
 * es lo que dispara la reposición. Es el papel que se lleva a la despensa antes
 * de usar el modal de conteo físico.
 */
export async function exportarAlmacenPdf(
  insumos: InsumoAlmacenPdf[],
  opciones: Omit<OpcionesInventarioPdf, 'formato'>,
): Promise<string> {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const ahora = new Date();
  const doc = new JsPDF() as unknown as DocPdf;
  const tabla = autoTable as unknown as AutoTableFn;
  const nombreLocal = opciones.nombreLocal ?? APP_NAME;

  let y = 18;
  doc.setFontSize(16);
  doc.setTextColor(0);
  y = escribir(doc, `${nombreLocal} - Cuadre físico del almacén de cocina`, y) + 2;

  doc.setFontSize(10);
  doc.setTextColor(100);
  const contexto = [
    opciones.sedeNombre ? `Sede: ${opciones.sedeNombre}` : null,
    `Emitido: ${selloDeTiempo(ahora)}`,
    opciones.usuarioNombre ? `Por: ${opciones.usuarioNombre}` : null,
  ].filter(Boolean);
  y = escribir(doc, contexto.join('  -  '), y);
  y = escribir(doc, `Alcance: ${opciones.filtroLabel?.trim() || 'Todo el almacén'}`, y) + 3;

  const bajoMinimo = insumos.filter((i) => i.stockActual <= i.stockMinimo).length;
  doc.setTextColor(0);
  doc.setFontSize(11);
  y = escribir(doc, `Insumos: ${insumos.length}      Bajo mínimo: ${bajoMinimo}`, y) + 5;

  if (insumos.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    escribir(doc, 'No hay insumos que coincidan con el filtro aplicado.', y);
  } else {
    tabla(doc, {
      startY: y,
      head: limpiarFilas([['Insumo', 'Unidad', 'Stock sistema', 'Mínimo', 'Stock físico', 'Diferencia', 'Observación']]),
      body: limpiarFilas(
        insumos.map((i) => [
          i.stockActual <= i.stockMinimo ? `${i.nombre}  (BAJO)` : i.nombre,
          i.unidad,
          String(i.stockActual),
          String(i.stockMinimo),
          '',
          '',
          '',
        ]),
      ),
      margin: { left: MARGEN_X, right: MARGEN_X },
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: GRIS_CABECERA },
      // Siete columnas en retrato: todo al mínimo legible y el nombre del
      // insumo se queda con lo que sobra.
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 14 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 24 },
        5: { cellWidth: 22 },
        6: { cellWidth: 26 },
      },
      ...opcionesDePagina(doc, ahora),
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  dibujarFirmas(doc, y);

  const nombreArchivo = `almacen-cocina-cuadre_${fechaArchivo(ahora)}.pdf`;
  doc.save(nombreArchivo);
  return nombreArchivo;
}
