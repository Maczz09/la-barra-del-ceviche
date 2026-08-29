import { CorrelativoService } from './correlativo.service';

describe('CorrelativoService', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  let service: CorrelativoService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CorrelativoService(prisma as any);
  });

  it('siguiente() incrementa la columna de boleta y devuelve serie+correlativo', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ correlativo: 5, serie: 'B001' }]);
    const r = await service.siguiente('e-1', 'BOLETA');
    expect(r).toEqual({ serie: 'B001', correlativo: 5 });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"correlativoBoleta"'), 'e-1');
  });

  it('siguiente() incrementa la columna de factura', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ correlativo: 2, serie: 'F001' }]);
    const r = await service.siguiente('e-1', 'FACTURA');
    expect(r).toEqual({ serie: 'F001', correlativo: 2 });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"correlativoFactura"'), 'e-1');
  });

  it('siguiente() lanza si la empresa no existe', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    await expect(service.siguiente('no-existe', 'BOLETA')).rejects.toThrow('no encontrada');
  });

  it('siguienteNota() usa la columna FC01 para nota de crédito sobre una factura', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ correlativo: 1, serie: 'FC01' }]);
    const r = await service.siguienteNota('e-1', 'NOTA_CREDITO', 'FACTURA');
    expect(r).toEqual({ serie: 'FC01', correlativo: 1 });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"correlativoNotaCreditoFactura"'), 'e-1');
  });

  it('siguienteNota() usa la columna BC01 para nota de crédito sobre una boleta', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ correlativo: 1, serie: 'BC01' }]);
    await service.siguienteNota('e-1', 'NOTA_CREDITO', 'BOLETA');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"correlativoNotaCreditoBoleta"'), 'e-1');
  });

  it('siguienteNota() usa la columna FD01/BD01 para nota de débito', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ correlativo: 1, serie: 'FD01' }]);
    await service.siguienteNota('e-1', 'NOTA_DEBITO', 'FACTURA');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"correlativoNotaDebitoFactura"'), 'e-1');

    prisma.$queryRawUnsafe.mockResolvedValue([{ correlativo: 1, serie: 'BD01' }]);
    await service.siguienteNota('e-1', 'NOTA_DEBITO', 'BOLETA');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('"correlativoNotaDebitoBoleta"'), 'e-1');
  });

  it('las 4 numeraciones de nota son columnas distintas entre sí (sin colisión)', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ correlativo: 1, serie: 'x' }]);
    await service.siguienteNota('e-1', 'NOTA_CREDITO', 'FACTURA');
    await service.siguienteNota('e-1', 'NOTA_CREDITO', 'BOLETA');
    await service.siguienteNota('e-1', 'NOTA_DEBITO', 'FACTURA');
    await service.siguienteNota('e-1', 'NOTA_DEBITO', 'BOLETA');
    const columnasUsadas = prisma.$queryRawUnsafe.mock.calls.map((call) => (call[0] as string).match(/"correlativo\w+"/)?.[0]);
    expect(new Set(columnasUsadas).size).toBe(4);
  });
});
