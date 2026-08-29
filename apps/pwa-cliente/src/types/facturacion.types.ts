// types/facturacion.types.ts — DTOs de servicio-facturacion (emisión SUNAT)
//
// Sin @org/contracts: servicio-facturacion no tiene dominio ahí todavía y
// esta pantalla es admin-only, autocontenida (mismo criterio que
// cuenta.types.ts/caja.types.ts). `total`/`subtotal`/`igv` llegan como
// Prisma.Decimal → string en los endpoints de listado (no en emitir(), que
// sí normaliza a number en el backend) — se tipan `number | string` y se
// envuelven en Number(...) al renderizar.

export type TipoComprobante = 'BOLETA' | 'FACTURA';
export type TipoNota = 'NOTA_CREDITO' | 'NOTA_DEBITO';
export type EstadoComprobantePago = 'DISPONIBLE' | 'EMITIDO';
export type EstadoComprobante = 'FIRMADO' | 'ENVIADO' | 'ACEPTADO' | 'RECHAZADO' | 'OBSERVADO';

export interface ItemComprobantePago {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface EmpresaComprobanteDto {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccion: string | null;
}

export interface ComprobanteDto {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
  clienteRuc: string | null;
  clienteDni: string | null;
  clienteRazonSocial: string | null;
  clienteNombre: string | null;
  subtotal: number | string;
  igv: number | string;
  total: number | string;
  estado: EstadoComprobante;
  motivoRechazo: string | null;
  createdAt: string;
  empresa: EmpresaComprobanteDto;
}

export interface DocumentoAfectadoDto {
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
}

// Una nota es un Comprobante (tipo NOTA_CREDITO/NOTA_DEBITO), no un
// ComprobantePago — no tiene comprobantePagoId ni items propios.
export interface NotaDto {
  id: string;
  tipo: TipoNota;
  serie: string;
  correlativo: number;
  clienteRuc: string | null;
  clienteDni: string | null;
  clienteRazonSocial: string | null;
  clienteNombre: string | null;
  motivoCodigo: string | null;
  motivoDescripcion: string | null;
  subtotal: number | string;
  igv: number | string;
  total: number | string;
  estado: EstadoComprobante;
  motivoRechazo: string | null;
  createdAt: string;
  comprobanteAfectado: DocumentoAfectadoDto | null;
}

export interface ComprobantePagoDto {
  id: string;
  cuentaId: string;
  sedeId: string;
  mesaId: string;
  total: number | string;
  items: ItemComprobantePago[] | null;
  meseroNombre: string | null;
  estado: EstadoComprobantePago;
  fecha: string;
  comprobante?: ComprobanteDto | null;
}

export interface EmpresaDto {
  id: string;
  slot: number;
  ruc: string;
  /** Sede (servicio-identidad) a la que emite — null si aún no se enlazó. */
  sedeId: string | null;
  razonSocial: string;
  nombreComercial: string | null;
  direccion: string | null;
  ubigeo: string | null;
  codigoEstablecimiento: string;
  solUsuario: string | null;
  activo: boolean;
}

export interface EmitirComprobantePayload {
  tipoComprobante: TipoComprobante;
  empresaRuc: string;
  clienteRuc?: string;
  clienteRazonSocial?: string;
  clienteDni?: string;
  clienteNombre?: string;
}

export interface EmitirComprobanteResultado {
  id: string;
  tipo: TipoComprobante;
  serie: string;
  correlativo: number;
  estado: EstadoComprobante;
  total: number;
}

// Catálogos 09 (nota de crédito) y 10 (nota de débito) SUNAT — códigos
// oficiales, duplicados desde servicio-facturacion/src/sunat/catalogos-notas.ts
// (no comparten libs/contracts, mismo criterio que el resto de este módulo).
// Es un catálogo externo estable, no lógica de negocio propia — bajo riesgo
// de que se desincronicen.
export interface MotivoNota {
  codigo: string;
  descripcion: string;
}

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

export const CATALOGO_MOTIVOS_NOTA_DEBITO: MotivoNota[] = [
  { codigo: '01', descripcion: 'Intereses por mora' },
  { codigo: '02', descripcion: 'Aumento en el valor' },
  { codigo: '03', descripcion: 'Penalidades / otros conceptos' },
];

export interface ItemNotaPayload {
  descripcion: string;
  cantidad: number;
  precioUnitarioConIgv: number;
}

export interface EmitirNotaPayload {
  motivoCodigo: string;
  items: ItemNotaPayload[];
}

export interface EmitirNotaResultado {
  id: string;
  tipo: TipoNota;
  serie: string;
  correlativo: number;
}

// Alta de empresa emisora vía el formulario "Configurar SUNAT" — certificado
// va aparte como archivo (multipart), no en este objeto.
export interface CrearEmpresaPayload {
  ruc: string;
  razonSocial: string;
  sedeId?: string;
  nombreComercial?: string;
  direccion?: string;
  ubigeo?: string;
  codigoEstablecimiento?: string;
  solUsuario: string;
  solClave: string;
  certificadoPass: string;
  certificado: File;
}

// Edición de una empresa ya configurada — todo opcional/parcial, sin RUC (no
// es editable). El certificado solo se reemplaza si se manda uno nuevo, y
// siempre junto con certificadoPass (ver AppService.actualizarEmpresa).
export interface ActualizarEmpresaPayload {
  razonSocial?: string;
  /** '' desvincula la sede actual. */
  sedeId?: string;
  nombreComercial?: string;
  direccion?: string;
  ubigeo?: string;
  codigoEstablecimiento?: string;
  solUsuario?: string;
  solClave?: string;
  certificadoPass?: string;
  certificado?: File;
}
