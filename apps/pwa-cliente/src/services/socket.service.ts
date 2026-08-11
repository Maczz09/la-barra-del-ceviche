// services/socket.service.ts - Singleton Socket.IO para actualizaciones en tiempo real

import { io, type Socket } from 'socket.io-client';
import { getAuthToken, refreshAccessToken } from '../api/client';
import { queryClient } from '../api/queryClient';
import { MESAS_QUERY_KEY } from '../hooks/queries/useMesasQuery';
import { PEDIDOS_QUERY_KEY } from '../hooks/queries/usePedidosQuery';
import { CUENTAS_QUERY_KEY } from '../hooks/queries/useCuentasQuery';
import { CAJA_QUERY_KEY } from '../hooks/queries/useCajaQuery';
import { pushSocketNotification } from '../hooks/queries/useNotificacionesQuery';

interface NotificacionEvento {
  pattern?: string;
  data?: unknown;
}

const env = (import.meta as unknown as { env: Record<string, string> }).env;
const BASE_URL = env['VITE_API_BASE_URL'] ?? 'http://localhost:8000';
const WS_PATH = env['VITE_WS_PATH'] ?? '/notificaciones/socket.io';

let socket: Socket | null = null;

// Suscriptores a eventos crudos de pedidoUpdate, para pantallas que necesitan
// reaccionar a un patrón específico (ej. toast flotante de "ítem anulado" en
// Cocina) sin acoplarse a la lógica genérica de invalidación de abajo.
type PedidoUpdateListener = (evento: NotificacionEvento) => void;
const pedidoUpdateListeners = new Set<PedidoUpdateListener>();
export function onPedidoUpdate(fn: PedidoUpdateListener): () => void {
  pedidoUpdateListeners.add(fn);
  return () => pedidoUpdateListeners.delete(fn);
}

const pendingInvalidations = new Set<string>();
let invalidationTimer: ReturnType<typeof setTimeout> | null = null;
const INVALIDATION_DEBOUNCE_MS = 300;
let authRetrying = false;

type StoreKey = 'pedidos' | 'mesas' | 'cuentas' | 'caja';

function storesForPattern(pattern?: string) {
  const stores = new Set<StoreKey>();

  if (!pattern || pattern.startsWith('pedido.')) {
    stores.add('pedidos');
    stores.add('mesas');
    stores.add('cuentas');
  }

  if (pattern?.startsWith('cuenta.') || pattern?.startsWith('pago.')) {
    stores.add('mesas');
    stores.add('pedidos');
    stores.add('cuentas');
    stores.add('caja');
  }

  if (pattern?.startsWith('mesa.')) {
    stores.add('mesas');
    stores.add('pedidos');
  }

  return stores;
}

function invalidateStores(stores: Set<StoreKey>) {
  if (stores.has('pedidos')) {
    void queryClient.invalidateQueries({
      queryKey: PEDIDOS_QUERY_KEY,
      exact: false,
      refetchType: 'active',
    });
  }
  if (stores.has('mesas')) {
    void queryClient.invalidateQueries({
      queryKey: MESAS_QUERY_KEY,
      exact: false,
      refetchType: 'active',
    });
  }
  if (stores.has('cuentas')) {
    void queryClient.invalidateQueries({
      queryKey: CUENTAS_QUERY_KEY,
      exact: false,
      refetchType: 'active',
    });
  }
  if (stores.has('caja')) {
    void queryClient.invalidateQueries({
      queryKey: CAJA_QUERY_KEY,
      exact: false,
      refetchType: 'active',
    });
  }
}

function scheduleInvalidate(pattern?: string) {
  pendingInvalidations.add(pattern ?? '*');

  if (invalidationTimer) return;

  invalidationTimer = setTimeout(() => {
    const patterns = [...pendingInvalidations];
    pendingInvalidations.clear();
    invalidationTimer = null;

    const stores = new Set<StoreKey>();
    patterns.forEach((key) => {
      storesForPattern(key === '*' ? undefined : key).forEach((store) =>
        stores.add(store),
      );
    });
    invalidateStores(stores);
  }, INVALIDATION_DEBOUNCE_MS);
}

export const socketService = {
  async connect() {
    if (socket?.connected) return;

    const token = getAuthToken() ?? await refreshAccessToken();

    if (socket) {
      socket.auth = token ? { token } : {};
    } else {
      socket = io(BASE_URL, {
        path: WS_PATH,
        auth: token ? { token } : {},
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
        autoConnect: false,
      });

      socket.on('pedidoUpdate', (evento: NotificacionEvento) => {
        pushSocketNotification(evento);
        scheduleInvalidate(evento?.pattern);
        pedidoUpdateListeners.forEach((fn) => fn(evento));
      });

      socket.on('auth:error', () => {
        if (authRetrying) return;
        authRetrying = true;
        void refreshAccessToken()
          .then((newToken) => {
            if (!newToken || !socket) return;
            socket.auth = { token: newToken };
            socket.connect();
          })
          .finally(() => {
            authRetrying = false;
          });
      });

      // Tras una reconexión pudimos perder eventos mientras el socket estuvo
      // caído; invalida todas las stores para recuperar el estado consistente
      // (no dispara en la conexión inicial, solo en reconexiones reales).
      socket.io.on('reconnect', () => {
        invalidateStores(new Set<StoreKey>(['pedidos', 'mesas', 'cuentas', 'caja']));
      });
    }

    socket.connect();
  },

  disconnect() {
    socket?.disconnect();
  },

  isConnected() {
    return socket?.connected ?? false;
  },
};
