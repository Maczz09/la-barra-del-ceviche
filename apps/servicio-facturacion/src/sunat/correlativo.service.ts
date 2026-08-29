import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TipoComprobanteSimple = 'BOLETA' | 'FACTURA';
type TipoNota = 'NOTA_CREDITO' | 'NOTA_DEBITO';
type TipoDocumentoAfectado = 'BOLETA' | 'FACTURA';

// Nombres de columna fijos (no interpolados desde input externo — este mapa
// es el único lugar que decide qué columna tocar, nunca se arma el nombre a
// partir del tipo recibido directamente, para no abrir la puerta a SQL
// injection vía $queryRawUnsafe).
const COLUMNAS_COMPROBANTE: Record<TipoComprobanteSimple, { correlativo: string; serie: string }> = {
  BOLETA: { correlativo: 'correlativoBoleta', serie: 'serieBoleta' },
  FACTURA: { correlativo: 'correlativoFactura', serie: 'serieFactura' },
};

// Catálogo 09/10 SUNAT: una nota de crédito/débito sobre una Factura usa
// serie que empieza con F (FC01/FD01); sobre una Boleta, con B (BC01/BD01) —
// numeraciones independientes entre sí y de boleta/factura.
const COLUMNAS_NOTA: Record<TipoNota, Record<TipoDocumentoAfectado, { correlativo: string; serie: string }>> = {
  NOTA_CREDITO: {
    FACTURA: { correlativo: 'correlativoNotaCreditoFactura', serie: 'serieNotaCreditoFactura' },
    BOLETA: { correlativo: 'correlativoNotaCreditoBoleta', serie: 'serieNotaCreditoBoleta' },
  },
  NOTA_DEBITO: {
    FACTURA: { correlativo: 'correlativoNotaDebitoFactura', serie: 'serieNotaDebitoFactura' },
    BOLETA: { correlativo: 'correlativoNotaDebitoBoleta', serie: 'serieNotaDebitoBoleta' },
  },
};

@Injectable()
export class CorrelativoService {
  constructor(private readonly prisma: PrismaService) {}

  private async incrementar(empresaId: string, columnas: { correlativo: string; serie: string }): Promise<{ serie: string; correlativo: number }> {
    const rows = await this.prisma.$queryRawUnsafe<{ correlativo: number; serie: string }[]>(
      `UPDATE "empresas" SET "${columnas.correlativo}" = "${columnas.correlativo}" + 1
       WHERE id = $1
       RETURNING "${columnas.correlativo}" AS correlativo, "${columnas.serie}" AS serie`,
      empresaId,
    );
    const row = rows[0];
    if (!row) throw new Error(`Empresa ${empresaId} no encontrada al asignar correlativo`);
    return { serie: row.serie, correlativo: Number(row.correlativo) };
  }

  /**
   * Incremento atómico del correlativo de una empresa+tipo. SUNAT exige
   * numeración estrictamente secuencial sin huecos no declarados; un
   * `UPDATE ... RETURNING` evita la carrera leer-luego-escribir bajo cobros
   * concurrentes (equivalente al `SELECT ... FOR UPDATE SKIP LOCKED` del
   * outbox, pero aquí basta un UPDATE de una fila).
   */
  async siguiente(empresaId: string, tipo: TipoComprobanteSimple): Promise<{ serie: string; correlativo: number }> {
    return this.incrementar(empresaId, COLUMNAS_COMPROBANTE[tipo]);
  }

  /** Igual que `siguiente`, pero para notas — la numeración depende también del tipo de documento afectado (ver COLUMNAS_NOTA). */
  async siguienteNota(
    empresaId: string,
    tipo: TipoNota,
    documentoAfectadoTipo: TipoDocumentoAfectado,
  ): Promise<{ serie: string; correlativo: number }> {
    return this.incrementar(empresaId, COLUMNAS_NOTA[tipo][documentoAfectadoTipo]);
  }
}
