import { isLoopbackAddress } from './network-info';

describe('seguridad de administración local', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('acepta loopback %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it.each(['192.168.1.4', '10.0.0.2', undefined])('rechaza clientes LAN %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });
});
