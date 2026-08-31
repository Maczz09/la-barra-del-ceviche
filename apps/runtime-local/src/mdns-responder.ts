import multicastDns from 'multicast-dns';
import { primaryLanAddress } from './network-info';

export const LOCAL_HOSTNAME = 'la-barra-del-ceviche.local';

export class MdnsResponder {
  private server?: ReturnType<typeof multicastDns>;

  start(): void {
    this.server = multicastDns();
    this.server.on('query', (query) => {
      const requested = query.questions.some((question) =>
        question.name.toLowerCase() === LOCAL_HOSTNAME && question.type === 'A');
      if (!requested) return;
      const primary = primaryLanAddress();
      if (!primary) return;
      this.server?.respond({
        answers: [{
          name: LOCAL_HOSTNAME, type: 'A' as const, class: 'IN' as const, ttl: 120, data: primary.address,
        }],
      });
    });
    this.server.on('error', () => undefined);
  }

  close(): void {
    this.server?.destroy();
    this.server = undefined;
  }
}
