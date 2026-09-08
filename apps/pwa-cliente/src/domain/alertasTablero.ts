// domain/alertasTablero.ts — detecta entradas nuevas a las columnas activas
// sin depender de React ni de Web Audio. Así KDS y Pedidos comparten exactamente
// la misma semántica: no se avisa la carga inicial, solo lo que entra o cambia
// de etapa después de que el tablero ya está listo.

import type { PedidoVM } from '../types/pedido.types';

export const ETAPAS_SONORAS = ['PENDIENTE', 'EN_PREPARACION', 'LISTO'] as const;
export type EtapaSonora = (typeof ETAPAS_SONORAS)[number];
export type TableroSonoro = 'PEDIDOS' | 'COCINA';
export type SnapshotTablero = Map<string, EtapaSonora>;

const ETAPAS_SET = new Set<string>(ETAPAS_SONORAS);

function esEtapaSonora(estado: string): estado is EtapaSonora {
  return ETAPAS_SET.has(estado);
}

/** Snapshot visible del tablero comercial: un pedido por columna. */
export function snapshotPedidos(pedidos: PedidoVM[]): SnapshotTablero {
  const snapshot: SnapshotTablero = new Map();
  for (const pedido of pedidos) {
    if (esEtapaSonora(pedido.estado)) snapshot.set(pedido.id, pedido.estado);
  }
  return snapshot;
}

/** Snapshot del KDS: cada ítem de cocina es una entrada de columna independiente. */
export function snapshotCocina(pedidos: PedidoVM[]): SnapshotTablero {
  const snapshot: SnapshotTablero = new Map();
  for (const pedido of pedidos) {
    for (const item of pedido.items) {
      if (item.area === 'COCINA' && esEtapaSonora(item.estado)) {
        snapshot.set(`${pedido.id}:${item.id}`, item.estado);
      }
    }
  }
  return snapshot;
}

export function snapshotTablero(tablero: TableroSonoro, pedidos: PedidoVM[]): SnapshotTablero {
  return tablero === 'COCINA' ? snapshotCocina(pedidos) : snapshotPedidos(pedidos);
}

/**
 * Devuelve como máximo una alerta por columna. Si un pedido entra con tres
 * platos pendientes, se escucha una sola campanita de "Nuevos", no tres.
 */
export function etapasQueIngresan(anterior: SnapshotTablero, actual: SnapshotTablero): EtapaSonora[] {
  const entrantes = new Set<EtapaSonora>();
  for (const [id, etapaActual] of actual) {
    if (anterior.get(id) !== etapaActual) entrantes.add(etapaActual);
  }
  return ETAPAS_SONORAS.filter((etapa) => entrantes.has(etapa));
}
