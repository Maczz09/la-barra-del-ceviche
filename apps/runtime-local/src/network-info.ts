import { networkInterfaces } from 'node:os';

export interface NetworkAddress {
  readonly name: string;
  readonly address: string;
  readonly mac: string;
}

export function listPrivateIpv4(): NetworkAddress[] {
  const result: NetworkAddress[] = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal || address.address.startsWith('169.254.')) continue;
      result.push({ name, address: address.address, mac: address.mac });
    }
  }
  return result.sort((a, b) => scoreAddress(b.address) - scoreAddress(a.address));
}

function scoreAddress(address: string): number {
  if (address.startsWith('192.168.')) return 3;
  if (address.startsWith('10.')) return 2;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 1;
  return 0;
}

export function primaryLanAddress(): NetworkAddress | null {
  return listPrivateIpv4()[0] ?? null;
}

export function localServerUrl(port: number): string {
  const primary = primaryLanAddress();
  return `http://${primary?.address ?? '127.0.0.1'}:${port}`;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
