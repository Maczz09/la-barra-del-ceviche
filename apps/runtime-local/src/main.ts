import { LocalRuntime } from './local-runtime';

const runtime = new LocalRuntime();

async function shutdown(signal: string): Promise<void> {
  process.stdout.write(`RESTOAPP_STOPPING ${signal}\n`);
  await runtime.shutdown();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

runtime.start().catch(async (error) => {
  process.stderr.write(`RESTOAPP_FATAL ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  await runtime.shutdown().catch(() => undefined);
  process.exit(1);
});
