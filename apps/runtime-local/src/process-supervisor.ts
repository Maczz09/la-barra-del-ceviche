import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';

export type ManagedProcessState = 'starting' | 'running' | 'stopped' | 'failed';

export interface ManagedProcessStatus {
  name: string;
  state: ManagedProcessState;
  pid?: number;
  startedAt?: string;
  restarts: number;
  lastExitCode?: number | null;
  lastError?: string;
}

export interface ProcessSpec {
  name: string;
  executable: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  restart?: boolean;
}

interface ManagedProcess {
  spec: ProcessSpec;
  child?: ChildProcessWithoutNullStreams;
  status: ManagedProcessStatus;
  log: WriteStream;
  restartTimer?: NodeJS.Timeout;
}

export class ProcessSupervisor {
  private readonly processes = new Map<string, ManagedProcess>();
  private shuttingDown = false;

  constructor(private readonly logsDirectory: string) {}

  start(spec: ProcessSpec): ManagedProcessStatus {
    const existing = this.processes.get(spec.name);
    if (existing?.child && !existing.child.killed) return existing.status;

    const managed: ManagedProcess = existing ?? {
      spec,
      status: { name: spec.name, state: 'stopped', restarts: 0 },
      log: createWriteStream(join(this.logsDirectory, `${spec.name}.log`), { flags: 'a' }),
    };
    managed.spec = spec;
    managed.status.state = 'starting';
    managed.status.startedAt = new Date().toISOString();
    managed.status.lastError = undefined;
    this.processes.set(spec.name, managed);

    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    managed.child = child;
    managed.status.pid = child.pid;
    managed.status.state = 'running';
    child.stdout.pipe(managed.log, { end: false });
    child.stderr.pipe(managed.log, { end: false });

    // @types/node expone overloads de EventEmitter que el lint type-aware no logra resolver aquí.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    child.on('error', (error: Error) => {
      managed.status.state = 'failed';
      managed.status.lastError = error.message;
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    child.on('exit', (code: number | null) => {
      managed.child = undefined;
      managed.status.pid = undefined;
      managed.status.lastExitCode = code;
      managed.status.state = code === 0 ? 'stopped' : 'failed';
      if (!this.shuttingDown && spec.restart !== false) this.scheduleRestart(managed);
    });
    return managed.status;
  }

  private scheduleRestart(managed: ManagedProcess): void {
    managed.status.restarts += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(managed.status.restarts - 1, 5));
    managed.restartTimer = setTimeout(() => this.start(managed.spec), delay);
    managed.restartTimer.unref();
  }

  async restart(name: string): Promise<void> {
    const managed = this.processes.get(name);
    if (!managed) throw new Error(`Proceso desconocido: ${name}`);
    if (managed.restartTimer) clearTimeout(managed.restartTimer);
    await this.stopOne(managed);
    managed.status.restarts += 1;
    this.start(managed.spec);
  }

  status(): ManagedProcessStatus[] {
    return [...this.processes.values()].map((managed) => ({ ...managed.status }));
  }

  async stopAll(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all([...this.processes.values()].reverse().map((managed) => this.stopOne(managed)));
    for (const managed of this.processes.values()) managed.log.end();
  }

  private async stopOne(managed: ManagedProcess): Promise<void> {
    if (managed.restartTimer) clearTimeout(managed.restartTimer);
    const child = managed.child;
    if (!child || child.killed) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 5_000);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill('SIGTERM');
    });
    managed.status.state = 'stopped';
  }
}
