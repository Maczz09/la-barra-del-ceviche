import { useCallback, useEffect, useRef, useState } from 'react';
import {
  etapasQueIngresan,
  snapshotTablero,
  type SnapshotTablero,
  type TableroSonoro,
} from '../domain/alertasTablero';
import { alertasSonoras } from '../services/alertasSonoras.service';
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
    setActivo(await alertasSonoras.activar());
  }, []);

  const desactivar = useCallback(async () => {
    await alertasSonoras.desactivar();
    setActivo(false);
  }, []);

  // Los navegadores móviles solo permiten AudioContext desde un gesto humano.
  // El primer toque dentro del tablero lo habilita sin interrumpir su acción.
  useEffect(() => {
    if (!alertasSonoras.preferidas() || activo) return;
    const habilitarConGesto = () => { void activar(); };
    window.addEventListener('pointerdown', habilitarConGesto, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', habilitarConGesto);
  }, [activo, activar]);

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
