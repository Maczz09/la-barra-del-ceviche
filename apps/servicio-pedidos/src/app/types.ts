export interface PedidoItemMapeado {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  stockActual?: number | null;
  area: string;
  notas?: string;
  comensal: number;
}

export interface MesaLocalEntity {
  id: string;
  sedeId: string | null;
  numero: number;
  updatedAt: Date;
}

export interface PedidoEntity {
  id: string;
  mesaId: string;
  sedeId: string;
  numeroMesa: number | null;
  estado: string;
  total: unknown;
  cliente?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  proveedor?: string | null;
  modalidad?: string | null;
  meseroId?: string | null;
  meseroNombre?: string | null;
  cuentaCorrelativo?: string | null;
  createdAt: Date;
  items: PedidoItemEntity[];
}

export interface PedidoItemEntity {
  id: string;
  pedidoId: string;
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: unknown;
  area: string | null;
  notas: string | null;
  estado: string;
  comensal: number;
  meseroId?: string | null;
  meseroNombre?: string | null;
}
