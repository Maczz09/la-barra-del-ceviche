import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { RuntimePaths } from './runtime-paths';

export interface PrinterConfig {
  enabled: boolean;
  printerName: string;
  copies: number;
  paperWidth: 58 | 80;
}

export interface RuntimeConfig {
  version: 1;
  dbUser: string;
  dbPassword: string;
  serviceJwtSecret: string;
  jwtPrivateKey: string;
  jwtPublicKey: string;
  facturacionEncryptionKey: string;
  printer: PrinterConfig;
  createdAt: string;
}

const DEFAULT_PRINTER: PrinterConfig = {
  enabled: false,
  printerName: '',
  copies: 1,
  paperWidth: 80,
};

export function createRuntimeConfig(): RuntimeConfig {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return {
    version: 1,
    dbUser: 'restoapp',
    dbPassword: randomBytes(32).toString('base64url'),
    serviceJwtSecret: randomBytes(48).toString('base64url'),
    jwtPrivateKey: privateKey,
    jwtPublicKey: publicKey,
    facturacionEncryptionKey: randomBytes(32).toString('hex'),
    printer: DEFAULT_PRINTER,
    createdAt: new Date().toISOString(),
  };
}

export function loadOrCreateRuntimeConfig(paths: RuntimePaths): RuntimeConfig {
  if (existsSync(paths.configFile)) {
    const parsed = JSON.parse(readFileSync(paths.configFile, 'utf8')) as RuntimeConfig;
    return { ...parsed, printer: { ...DEFAULT_PRINTER, ...parsed.printer } };
  }
  const config = createRuntimeConfig();
  saveRuntimeConfig(paths, config);
  return config;
}

export function saveRuntimeConfig(paths: RuntimePaths, config: RuntimeConfig): void {
  writeFileSync(paths.configFile, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try { chmodSync(paths.configFile, 0o600); } catch { /* Windows aplica ACL del perfil */ }
}
