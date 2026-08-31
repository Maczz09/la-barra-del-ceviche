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
  return result.sort((a, b) => scoreAddress(b) - scoreAddress(a));
}

function scoreAddress(value: NetworkAddress): number {
  const addressScore = value.address.startsWith('192.168.')
    ? 30
    : value.address.startsWith('10.')
      ? 20
      : /^172\.(1[6-9]|2\d|3[01])\./.test(value.address) ? 10 : 0;
  // VirtualBox, Docker, Hyper-V y WSL suelen crear adaptadores privados que
  // el celular no puede alcanzar. Nunca deben ganar sobre Ethernet/Wi-Fi real.
  const virtual = /virtual|vethernet|wsl|docker|vmware|hyper-v/i.test(value.name);
  return addressScore - (virtual ? 100 : 0);
}

export function selectPrimaryLanAddress(addresses: readonly NetworkAddress[]): NetworkAddress | null {
  return [...addresses].sort((a, b) => scoreAddress(b) - scoreAddress(a))[0] ?? null;
}

export function primaryLanAddress(): NetworkAddress | null {
  return selectPrimaryLanAddress(listPrivateIpv4());
}

export function localServerUrl(port: number): string {
  const primary = primaryLanAddress();
  return `http://${primary?.address ?? '127.0.0.1'}:${port}`;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}
