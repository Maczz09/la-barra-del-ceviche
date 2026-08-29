import { PedidoDto, PedidoEstado, EstadoItem, ItemArea } from '@org/contracts';
import { PedidoEntity } from './types';

/** T-40: mapper compartido entre AppService y PedidosSagaService. */
export function mapPedidoToDto(p: PedidoEntity): PedidoDto {
  return {
    id: p.id,
    mesaId: p.mesaId,
    sedeId: p.sedeId,
    numeroMesa: p.numeroMesa ?? undefined,
    estado: p.estado as PedidoEstado,
    total: Number(p.total),
    cliente: p.cliente ?? undefined,
    telefono: p.telefono ?? undefined,
    direccion: p.direccion ?? undefined,
    proveedor: p.proveedor ?? undefined,
    modalidad: p.modalidad ?? undefined,
    meseroId: p.meseroId ?? undefined,
    meseroNombre: p.meseroNombre ?? undefined,
    cuentaCorrelativo: p.cuentaCorrelativo ?? undefined,
    createdAt: p.createdAt.toISOString(),
    items: p.items.map(i => ({
      id: i.id,
      productoId: i.productoId,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      area: (i.area as ItemArea) ?? undefined,
      notas: i.notas ?? undefined,
      estado: i.estado as EstadoItem,
      meseroId: i.meseroId ?? p.meseroId ?? undefined,
      meseroNombre: i.meseroNombre ?? p.meseroNombre ?? undefined,
    }))
  };
}
