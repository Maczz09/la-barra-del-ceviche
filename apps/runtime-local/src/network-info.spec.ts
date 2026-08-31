import { isLoopbackAddress, selectPrimaryLanAddress } from './network-info';

describe('seguridad de administración local', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('acepta loopback %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(true);
  });

  it.each(['192.168.1.4', '10.0.0.2', undefined])('rechaza clientes LAN %s', (address) => {
    expect(isLoopbackAddress(address)).toBe(false);
  });
});

describe('selección de interfaz LAN', () => {
  it('prefiere la interfaz física aunque una virtual también use 192.168', () => {
    expect(selectPrimaryLanAddress([
      { name: 'Ethernet 4 (VirtualBox)', address: '192.168.56.1', mac: 'virtual' },
      { name: 'vEthernet (WSL)', address: '172.29.96.1', mac: 'wsl' },
      { name: 'Ethernet', address: '192.168.100.5', mac: 'fisica' },
    ])?.address).toBe('192.168.100.5');
  });
});
