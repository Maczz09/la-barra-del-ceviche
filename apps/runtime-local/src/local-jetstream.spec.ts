import { durableConsumerName, toLocalSubject } from '@org/shared-rabbitmq';

describe('perfil local JetStream', () => {
  it('mantiene la routing key legible bajo un prefijo privado', () => {
    expect(toLocalSubject('pedido.creado')).toBe('restoapp.pedido.creado');
  });

  it('genera consumidores estables y distintos por servicio', () => {
    const first = durableConsumerName('cocina_queue', 'pedido.creado');
    expect(first).toBe(durableConsumerName('cocina_queue', 'pedido.creado'));
    expect(first).not.toBe(durableConsumerName('reportes_queue', 'pedido.creado'));
    expect(first).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
