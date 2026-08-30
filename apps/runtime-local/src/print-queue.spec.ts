import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurablePrintQueue, buildEscPosTicket } from './print-queue';
import type { RuntimePaths } from './runtime-paths';

function paths(): RuntimePaths {
  const root = mkdtempSync(join(tmpdir(), 'restoapp-print-'));
  return { data: root, printQueueFile: join(root, 'queue.json') } as RuntimePaths;
}

const printer = { enabled: true, printerName: 'POS-80', copies: 1, paperWidth: 80 as const };
const ticket = {
  pedidoId: 'pedido-12345678', numeroMesa: 4, meseroNombre: 'Ana',
  items: [
    { nombre: 'Ceviche clásico', cantidad: 2, area: 'COCINA', notas: 'Sin ají' },
    { nombre: 'Gaseosa', cantidad: 1, area: 'BAR' },
    { nombre: 'Cerveza directa', cantidad: 1, area: 'DIRECTO' },
  ],
};

describe('cola durable de impresión', () => {
  it('deduplica por eventId y persiste antes de entregar', () => {
    const runtimePaths = paths();
    const queue = new DurablePrintQueue(runtimePaths);
    expect(queue.enqueue('evt-1', ticket, printer)).not.toBeNull();
    expect(queue.enqueue('evt-1', ticket, printer)).toBeNull();
    expect(readFileSync(runtimePaths.printQueueFile, 'utf8')).toContain('evt-1');
    const job = queue.takeNext(printer);
    expect(job?.status).toBe('PRINTING');
    queue.complete(job!.id);
    expect(queue.summary().printed).toBe(1);
  });

  it('reintenta un fallo sin duplicar el trabajo', () => {
    const queue = new DurablePrintQueue(paths());
    const job = queue.enqueue('evt-2', ticket, printer)!;
    queue.takeNext(printer);
    queue.fail(job.id, 'sin papel');
    expect(queue.takeNext(printer)).toBeNull();
    queue.retry(job.id);
    expect(queue.takeNext(printer)?.attempts).toBe(2);
  });

  it('genera ESC/POS solo con ítems de cocina', () => {
    const raw = buildEscPosTicket(ticket, 80).toString('latin1');
    expect(raw).toContain('Ceviche clásico');
    expect(raw).toContain('Sin ají');
    expect(raw).not.toContain('Gaseosa');
    expect(raw).not.toContain('Cerveza directa');
  });
});
