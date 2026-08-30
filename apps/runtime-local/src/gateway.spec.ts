import { resolveServiceProxy } from './gateway';

describe('resolveServiceProxy', () => {
  it('acepta las rutas originales que ya usa la PWA', () => {
    expect(resolveServiceProxy('/identidad/auth/login')).toEqual({
      target: 'http://127.0.0.1:3001',
      path: '/api/auth/login',
    });
  });

  it('conserva las rutas versionadas y los parámetros', () => {
    expect(resolveServiceProxy('/v1/pedidos/pedidos', '?sedeId=abc')).toEqual({
      target: 'http://127.0.0.1:3004',
      path: '/api/pedidos?sedeId=abc',
    });
  });

  it('no confunde recursos estáticos con microservicios', () => {
    expect(resolveServiceProxy('/assets/index.js')).toBeUndefined();
    expect(resolveServiceProxy('/brand/logo-principal.png')).toBeUndefined();
  });
});
