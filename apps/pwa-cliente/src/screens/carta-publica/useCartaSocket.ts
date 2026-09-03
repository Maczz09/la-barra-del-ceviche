// screens/carta-publica/useCartaSocket.ts — WebSocket de disponibilidad
// para la carta pública/QR (T-XX). SIN autenticación a propósito: se conecta
// a un path de socket.io propio (`/carta-socket.io`, no el del KDS) que
// Kong deja pasar sin JWT — ver apps/servicio-notificaciones/src/app/carta.gateway.ts
// y el carve-out en infra/kong/kong.yml.template.
//
// Con prefijo /v1/: cuando un reverse proxy solo reenvía a Kong lo que cae
// bajo /v1/*, un path sin ese prefijo cae en el catch-all de la PWA y el
// socket nunca conecta. Kong ya
// registra ambas variantes (con y sin /v1/) para este carve-out, así que
// usar la prefijada no rompe nada localmente (sin Caddy de por medio).
//
// Solo dispara `onCambio()` — el screen decide qué hacer (recargar la
// carta), este hook no conoce la forma de los datos de negocio.

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

const BASE_URL = (import.meta as unknown as { env: Record<string, string> }).env['VITE_API_BASE_URL'] ?? 'http://localhost:8000';
const CARTA_SOCKET_PATH = '/v1/notificaciones/carta-socket.io';

export function useCartaSocket(sedeId: string | undefined, onCambio: () => void) {
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  useEffect(() => {
    if (!sedeId) return;

    const socket: Socket = io(BASE_URL, {
      path: CARTA_SOCKET_PATH,
      query: { sedeId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    // Cambiar un tamaño puede emitir un evento por cada plato relacionado.
    // Recargar una sola vez al terminar la ráfaga evita saturar a cada comensal.
    let recargaPendiente: ReturnType<typeof setTimeout> | undefined;
    const programarRecarga = () => {
      clearTimeout(recargaPendiente);
      recargaPendiente = setTimeout(() => {
        recargaPendiente = undefined;
        onCambioRef.current();
      }, 200);
    };
    socket.on('disponibilidad:cambiada', programarRecarga);

    return () => {
      clearTimeout(recargaPendiente);
      socket.off('disponibilidad:cambiada', programarRecarga);
      socket.disconnect();
    };
  }, [sedeId]);
}
