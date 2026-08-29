// sunat/catalogos-notas.ts — Catálogos SUNAT 09 (tipo de nota de crédito) y
// 10 (tipo de nota de débito). Códigos oficiales, no inventados — usados para
// validar el motivoCodigo que llega en el DTO y para el desplegable del
// frontend (se exponen tal cual, no se traducen a otro formato).

export interface MotivoNota {
  codigo: string;
  descripcion: string;
}

// Catálogo 09 SUNAT.
export const CATALOGO_MOTIVOS_NOTA_CREDITO: MotivoNota[] = [
  { codigo: '01', descripcion: 'Anulación de la operación' },
  { codigo: '02', descripcion: 'Anulación por error en el RUC' },
  { codigo: '03', descripcion: 'Corrección por error en la descripción' },
  { codigo: '04', descripcion: 'Descuento global' },
  { codigo: '05', descripcion: 'Descuento por ítem' },
  { codigo: '06', descripcion: 'Devolución total' },
  { codigo: '07', descripcion: 'Devolución por ítem' },
  { codigo: '08', descripcion: 'Bonificación' },
  { codigo: '09', descripcion: 'Disminución en el valor' },
  { codigo: '10', descripcion: 'Otros conceptos' },
];

// Catálogo 10 SUNAT.
export const CATALOGO_MOTIVOS_NOTA_DEBITO: MotivoNota[] = [
  { codigo: '01', descripcion: 'Intereses por mora' },
  { codigo: '02', descripcion: 'Aumento en el valor' },
  { codigo: '03', descripcion: 'Penalidades / otros conceptos' },
];

const CODIGOS_NOTA_CREDITO = new Set(CATALOGO_MOTIVOS_NOTA_CREDITO.map((m) => m.codigo));
const CODIGOS_NOTA_DEBITO = new Set(CATALOGO_MOTIVOS_NOTA_DEBITO.map((m) => m.codigo));

export function esMotivoNotaCreditoValido(codigo: string): boolean {
  return CODIGOS_NOTA_CREDITO.has(codigo);
}

export function esMotivoNotaDebitoValido(codigo: string): boolean {
  return CODIGOS_NOTA_DEBITO.has(codigo);
}
