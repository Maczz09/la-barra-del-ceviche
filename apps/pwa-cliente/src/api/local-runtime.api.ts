export interface LocalAddress {
  address: string;
  interface: string;
  mac: string;
}

export interface LocalInfo {
  app: string;
  platform: string;
  url: string;
  ipUrl: string;
  loopbackUrl: string;
  port: number;
  primaryAddress?: LocalAddress;
  addresses: LocalAddress[];
  dhcpReservationRequired: boolean;
  serverId: string;
}

export interface ProcessState {
  name: string;
  state: 'running' | 'stopped' | 'restarting';
  pid?: number;
  restarts: number;
  health?: { ok: boolean; checkedAt: string; error?: string; latencyMs?: number };
}

export interface PrinterSettings {
  enabled: boolean;
  printerName: string;
  paperWidth: 58 | 80;
  copies: number;
}

export interface RuntimeStatus extends LocalInfo {
  startedAt: string;
  uptimeSeconds: number;
  processes: ProcessState[];
  devices: Array<{ address: string; lastSeen: string; requests: number; userAgent?: string }>;
  printer: { config: PrinterSettings; available: string[] };
  printQueue: { pending: number; failed: number; printed: number; recent: PrintJobSummary[] };
  onboardingComplete: boolean;
  dataDirectory: string;
}

export interface PrintJobSummary {
  id: string;
  pedidoId: string;
  status: 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';
  attempts: number;
  updatedAt: string;
  lastError?: string;
}

export interface BackupSummary { name: string; path: string; size: number; createdAt: string }

async function localRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const body = await response.json().catch(() => ({})) as { message?: string } & T;
  if (!response.ok) throw new Error(body.message ?? `Error local HTTP ${response.status}`);
  return body;
}

export const localRuntimeApi = {
  info: () => localRequest<LocalInfo>('/local-info'),
  status: () => localRequest<RuntimeStatus>('/local-admin/status'),
  backups: () => localRequest<BackupSummary[]>('/local-admin/backups'),
  createBackup: () => localRequest<BackupSummary>('/local-admin/backups', { method: 'POST' }),
  restart: (name: string) => localRequest<{ ok: true }>(`/local-admin/processes/${encodeURIComponent(name)}/restart`, { method: 'POST' }),
  savePrinter: (config: PrinterSettings) => localRequest<RuntimeStatus['printer']>('/local-admin/printer', { method: 'PUT', body: JSON.stringify(config) }),
  retryPrint: (id: string) => localRequest<{ ok: true }>(`/local-admin/print/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  onboarding: () => localRequest<{ complete: boolean }>('/local-admin/onboarding'),
  createAdmin: (input: { nombre: string; email: string; password: string }) => localRequest<{ ok: true }>('/local-admin/onboarding', { method: 'POST', body: JSON.stringify(input) }),
};
