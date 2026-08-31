import { windowsTaskkillArgs } from './process-supervisor';

describe('apagado de procesos en Windows', () => {
  it('termina el proceso administrado y todo su árbol', () => {
    expect(windowsTaskkillArgs(4321)).toEqual(['/PID', '4321', '/T', '/F']);
  });

  it.each([0, -1, 1.5, Number.NaN])('rechaza un PID inválido: %s', (pid) => {
    expect(() => windowsTaskkillArgs(pid)).toThrow('PID inválido');
  });
});
