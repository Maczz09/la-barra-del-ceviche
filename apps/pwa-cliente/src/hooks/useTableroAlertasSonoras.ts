import { useCallback, useEffect, useRef, useState } from 'react';
import {
  actualizacionSonoraDesdeEvento,
  etapasQueIngresan,
  snapshotTablero,
  type SnapshotTablero,
  type TableroSonoro,
} from '../domain/alertasTablero';
import { alertasSonoras, registrarActivacionPorGesto } from '../services/alertasSonoras.service';
import { onPedidoUpdate } from '../services/socket.service';
import type { PedidoVM } from '../types/pedido.types';

interface Options {
  tablero: TableroSonoro;
  /** Espera la primera carga completa: los pedidos antiguos nunca deben sonar. */
  listo: boolean;
}

/** Alertas de columnas para Cocina/KDS y Pedidos. Se activa en el primer toque. */
export function useTableroAlertasSonoras(pedidos: PedidoVM[], { tablero, listo }: Options) {
  const anteriorRef = useRef<SnapshotTablero | null>(null);
  const [activo, setActivo] = useState(() => alertasSonoras.activa());

  const activar = useCallback(async () => {
    // Debe invocarse directamente desde el botón: en iPhone (también Chrome,
    // que usa WebKit) esto programa el primer timbre dentro del gesto humano.
    const habilitado = await alertasSonoras.activarYProbar();
    setActivo(habilitado);
  }, []);

  const desactivar = useCallback(async () => {
    await alertasSonoras.desactivar();
    setActivo(false);
  }, []);

  // Los navegadores móviles solo permiten AudioContext desde un gesto humano.
  // Se cubren eventos de Safari y Chrome; se reintenta hasta que quede activo.
  useEffect(() => {
    if (!alertasSonoras.preferidas() || activo) return;
    return registrarActivacionPorGesto(() => setActivo(true));
  }, [activo, activar]);

  // En el tablero del mesero el socket trae el pedido actualizado antes de
  // que TanStack Query complete el refetch. Sonamos aquí para que EN
  // PREPARACION/LISTO se oigan al instante en su celular o tablet. Al ajustar
  // el snapshot evitamos repetir la misma campanita cuando llega ese refetch.
  useEffect(() => {
    if (tablero !== 'PEDIDOS') return;
    return onPedidoUpdate((evento) => {
      if (evento.pattern !== 'pedido.actualizado' || anteriorRef.current === null) return;
      const actualizacion = actualizacionSonoraDesdeEvento(evento.data);
      if (!actualizacion) return;

      const etapaAnterior = anteriorRef.current.get(actualizacion.id);
      if (etapaAnterior === actualizacion.etapa) return;

      const siguiente = new Map(anteriorRef.current);
      siguiente.set(actualizacion.id, actualizacion.etapa);
      anteriorRef.current = siguiente;
      alertasSonoras.tocar([actualizacion.etapa]);
    });
  }, [tablero]);

  useEffect(() => {
    if (!listo) return;
    const actual = snapshotTablero(tablero, pedidos);
    if (anteriorRef.current === null) {
      anteriorRef.current = actual;
      return;
    }

    const etapas = etapasQueIngresan(anteriorRef.current, actual);
    anteriorRef.current = actual;
    if (etapas.length > 0) alertasSonoras.tocar(etapas);
  }, [pedidos, tablero, listo]);

  return { sonidoActivo: activo, activarSonido: activar, desactivarSonido: desactivar };
}
