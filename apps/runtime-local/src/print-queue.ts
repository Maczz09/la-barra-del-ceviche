import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { RuntimePaths } from './runtime-paths';
import type { PrinterConfig } from './runtime-config';

export type PrintJobStatus = 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED';

export interface KitchenTicketItem {
  nombre: string;
  cantidad: number;
  notas?: string | null;
  area?: string;
}

export interface KitchenTicket {
  pedidoId: string;
  numeroMesa?: number | null;
  canal?: string;
  meseroNombre?: string | null;
  createdAt?: string;
  items: KitchenTicketItem[];
}

export interface PrintJob {
  id: string;
  eventId: string;
  pedidoId: string;
  status: PrintJobStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  nextAttemptAt?: string;
  printerName?: string;
  copies: number;
  payloadBase64: string;
}

interface QueueFile { version: 1; jobs: PrintJob[] }

export class DurablePrintQueue {
  private queue: QueueFile;

  constructor(private readonly paths: RuntimePaths) {
    this.queue = this.load();
    for (const job of this.queue.jobs) {
      if (job.status === 'PRINTING') job.status = 'PENDING';
    }
    this.persist();
  }

  enqueue(eventId: string, ticket: KitchenTicket, printer: PrinterConfig): PrintJob | null {
    if (this.queue.jobs.some((job) => job.eventId === eventId)) return null;
    const now = new Date().toISOString();
    const job: PrintJob = {
      id: randomUUID(), eventId, pedidoId: ticket.pedidoId,
      status: 'PENDING', attempts: 0, createdAt: now, updatedAt: now,
      printerName: printer.printerName,
      copies: printer.copies,
      payloadBase64: buildEscPosTicket(ticket, printer.paperWidth).toString('base64'),
    };
    this.queue.jobs.push(job);
    this.persist();
    return job;
  }

  takeNext(printer: PrinterConfig): PrintJob | null {
    if (!printer.enabled || !printer.printerName) return null;
    const now = Date.now();
    const job = this.queue.jobs.find((candidate) => candidate.status === 'PENDING'
      || (candidate.status === 'FAILED' && Date.parse(candidate.nextAttemptAt ?? '1970-01-01') <= now));
    if (!job || job.attempts >= 10) return null;
    job.status = 'PRINTING';
    job.attempts += 1;
    job.updatedAt = new Date().toISOString();
    job.printerName = printer.printerName;
    job.copies = printer.copies;
    job.nextAttemptAt = undefined;
    this.persist();
    return { ...job };
  }

  complete(id: string): void { this.update(id, 'PRINTED'); }
  fail(id: string, error: string): void {
    const job = this.find(id);
    job.nextAttemptAt = new Date(Date.now() + Math.min(60_000, 2 ** Math.max(job.attempts, 1) * 1_000)).toISOString();
    this.updateJob(job, 'FAILED', error);
  }
  retry(id: string): void {
    const job = this.find(id);
    job.nextAttemptAt = undefined;
    this.updateJob(job, 'PENDING');
  }

  summary() {
    return {
      pending: this.queue.jobs.filter((job) => job.status === 'PENDING').length,
      failed: this.queue.jobs.filter((job) => job.status === 'FAILED').length,
      printed: this.queue.jobs.filter((job) => job.status === 'PRINTED').length,
      recent: this.queue.jobs.slice(-20).reverse().map((job) => ({ ...job, payloadBase64: undefined })),
    };
  }

  private update(id: string, status: PrintJobStatus, error?: string): void {
    this.updateJob(this.find(id), status, error);
  }

  private find(id: string): PrintJob {
    const job = this.queue.jobs.find((candidate) => candidate.id === id);
    if (!job) throw new Error(`Trabajo de impresión desconocido: ${id}`);
    return job;
  }

  private updateJob(job: PrintJob, status: PrintJobStatus, error?: string): void {
    job.status = status;
    job.updatedAt = new Date().toISOString();
    job.lastError = error;
    this.persist();
  }

  private load(): QueueFile {
    if (!existsSync(this.paths.printQueueFile)) return { version: 1, jobs: [] };
    return JSON.parse(readFileSync(this.paths.printQueueFile, 'utf8')) as QueueFile;
  }

  private persist(): void {
    const temp = `${this.paths.printQueueFile}.tmp`;
    writeFileSync(temp, `${JSON.stringify(this.queue, null, 2)}\n`, 'utf8');
    renameSync(temp, this.paths.printQueueFile);
  }
}

export function buildEscPosTicket(ticket: KitchenTicket, paperWidth: 58 | 80): Buffer {
  const columns = paperWidth === 58 ? 32 : 48;
  const line = '-'.repeat(columns);
  const visibleItems = ticket.items.filter((item) => !item.area || item.area === 'COCINA');
  const lines = [
    '\x1b@',
    '\x1ba\x01',
    '\x1bE\x01LA BARRA DEL CEVICHE\x1bE\x00',
    'COMANDA DE COCINA',
    line,
    `Mesa: ${ticket.numeroMesa ?? ticket.canal ?? 'Sin mesa'}`,
    ticket.meseroNombre ? `Mesero: ${ticket.meseroNombre}` : '',
    ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('es-PE') : '',
    line,
    '\x1ba\x00',
    ...visibleItems.flatMap((item) => [
      `${item.cantidad} x ${item.nombre}`.slice(0, columns),
      item.notas ? `  NOTA: ${item.notas}`.slice(0, columns) : '',
    ]),
    line,
    `Pedido ${ticket.pedidoId.slice(0, 8)}`,
    '\n\n\n',
    '\x1dV\x00',
  ].filter(Boolean);
  return Buffer.from(`${lines.join('\n')}\n`, 'latin1');
}
