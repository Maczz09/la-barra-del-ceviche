import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PrismaService } from '../prisma/prisma.service';
import { CorrelativoService } from '../sunat/correlativo.service';
import { CertificadoService } from '../sunat/certificado.service';
import { firmarComprobante } from '../sunat/firma';
import { construirXmlNotaCredito, construirXmlNotaDebito, DatosCliente, ItemComprobante } from '../sunat/ubl.builder';
import { CATALOGO_MOTIVOS_NOTA_CREDITO, CATALOGO_MOTIVOS_NOTA_DEBITO, esMotivoNotaCreditoValido, esMotivoNotaDebitoValido } from '../sunat/catalogos-notas';
import { EmitirNotaDto } from './dto/emitir-nota.dto';

type TipoNota = 'NOTA_CREDITO' | 'NOTA_DEBITO';

interface ComprobanteEmitido {
  id: string;
  tipo: string;
  serie: string;
  correlativo: number;
}

@Injectable()
export class NotasService {
  private readonly logger = new Logger(NotasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativo: CorrelativoService,
    private readonly certificado: CertificadoService,
  ) {}

  async emitirNotaCredito(comprobanteId: string, dto: EmitirNotaDto, usuarioSedeId?: string | null): Promise<ComprobanteEmitido> {
    return this.emitir('NOTA_CREDITO', comprobanteId, dto, usuarioSedeId);
  }

  async emitirNotaDebito(comprobanteId: string, dto: EmitirNotaDto, usuarioSedeId?: string | null): Promise<ComprobanteEmitido> {
    return this.emitir('NOTA_DEBITO', comprobanteId, dto, usuarioSedeId);
  }

  /**
   * Emite una nota de crédito o débito contra un comprobante YA aceptado por
   * SUNAT — mismo flujo de dos fases que EmisionService.emitir: se firma y
   * queda FIRMADO acá; EnvioProcessor la manda a SUNAT por separado (un
   * SUNAT caído no debe bloquear la respuesta de este endpoint).
   */
  private async emitir(tipo: TipoNota, comprobanteId: string, dto: EmitirNotaDto, usuarioSedeId?: string | null): Promise<ComprobanteEmitido> {
    const catalogo = tipo === 'NOTA_CREDITO' ? CATALOGO_MOTIVOS_NOTA_CREDITO : CATALOGO_MOTIVOS_NOTA_DEBITO;
    const motivoValido = tipo === 'NOTA_CREDITO' ? esMotivoNotaCreditoValido(dto.motivoCodigo) : esMotivoNotaDebitoValido(dto.motivoCodigo);
    if (!motivoValido) {
      throw new BadRequestException(`motivoCodigo inválido para ${tipo}. Códigos válidos: ${catalogo.map((m) => m.codigo).join(', ')}`);
    }
    const motivo = catalogo.find((m) => m.codigo === dto.motivoCodigo);
    if (!motivo) throw new BadRequestException('motivoCodigo inválido');

    const afectado = await this.prisma.comprobante.findUnique({
      where: { id: comprobanteId },
      include: { empresa: true },
    });
    if (!afectado) throw new NotFoundException(`Comprobante ${comprobanteId} no encontrado`);
    if (usuarioSedeId) {
      // El comprobante no guarda sedeId directo — lo hereda de su
      // comprobantePago. Un comprobante ya sin comprobantePago (p.ej. otra
      // nota) no se puede notar de nuevo por sedeId, así que se resuelve acá.
      const pago = afectado.comprobantePagoId
        ? await this.prisma.comprobantePago.findUnique({ where: { id: afectado.comprobantePagoId } })
        : null;
      if (pago && pago.sedeId !== usuarioSedeId) {
        throw new NotFoundException(`Comprobante ${comprobanteId} no encontrado`);
      }
    }
    if (afectado.tipo !== 'BOLETA' && afectado.tipo !== 'FACTURA') {
      throw new BadRequestException('Solo se puede emitir una nota contra una boleta o factura, no contra otra nota.');
    }
    if (afectado.estado !== 'ACEPTADO') {
      throw new BadRequestException(`El comprobante ${afectado.serie}-${afectado.correlativo} todavía no fue aceptado por SUNAT (estado: ${afectado.estado}).`);
    }

    const items: ItemComprobante[] = dto.items.map((i) => ({
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precioUnitarioConIgv: i.precioUnitarioConIgv,
    }));

    const documentoAfectadoTipo = afectado.tipo;
    const { serie, correlativo } = await this.correlativo.siguienteNota(afectado.empresaId, tipo, documentoAfectadoTipo);

    const cliente: DatosCliente = afectado.clienteRuc
      ? { tipoDocumento: '6', numeroDocumento: afectado.clienteRuc, nombreORazonSocial: afectado.clienteRazonSocial ?? afectado.clienteRuc }
      : afectado.clienteDni
        ? { tipoDocumento: '1', numeroDocumento: afectado.clienteDni, nombreORazonSocial: afectado.clienteNombre ?? afectado.clienteDni }
        : { tipoDocumento: '0', numeroDocumento: '-', nombreORazonSocial: afectado.clienteNombre ?? 'Cliente varios' };

    const datosBase = {
      serie,
      correlativo,
      fechaEmision: new Date(),
      empresa: {
        ruc: afectado.empresa.ruc,
        razonSocial: afectado.empresa.razonSocial,
        nombreComercial: afectado.empresa.nombreComercial ?? undefined,
        direccion: afectado.empresa.direccion ?? undefined,
        ubigeo: afectado.empresa.ubigeo ?? undefined,
        codigoEstablecimiento: afectado.empresa.codigoEstablecimiento,
      },
      cliente,
      items,
      documentoAfectado: { tipo: documentoAfectadoTipo, serie: afectado.serie, correlativo: afectado.correlativo },
      motivoCodigo: motivo.codigo,
      motivoDescripcion: motivo.descripcion,
    };

    const { xml: xmlSinFirmar, totales } = tipo === 'NOTA_CREDITO' ? construirXmlNotaCredito(datosBase) : construirXmlNotaDebito(datosBase);

    const claves = await this.certificado.clavesParaSlot(afectado.empresa.slot);
    const xmlFirmado = firmarComprobante(xmlSinFirmar, claves);

    const nota = await this.prisma.comprobante.create({
      data: {
        empresaId: afectado.empresaId,
        tipo,
        serie,
        correlativo,
        clienteRuc: afectado.clienteRuc,
        clienteDni: afectado.clienteDni,
        clienteRazonSocial: afectado.clienteRazonSocial,
        clienteNombre: afectado.clienteNombre,
        subtotal: totales.valorVenta,
        igv: totales.igv,
        total: totales.total,
        xmlFirmado,
        estado: 'FIRMADO',
        comprobanteAfectadoId: afectado.id,
        motivoCodigo: motivo.codigo,
        motivoDescripcion: motivo.descripcion,
      },
    });

    this.logger.log({
      operation: 'emitirNota',
      aggregateId: comprobanteId,
      resultingState: 'FIRMADO',
      message: `${tipo} ${serie}-${correlativo} firmada contra ${afectado.tipo} ${afectado.serie}-${afectado.correlativo} (motivo ${motivo.codigo}: ${motivo.descripcion}). Pendiente de envío a SUNAT.`,
    } satisfies OperableLog);

    return { id: nota.id, tipo: nota.tipo, serie: nota.serie, correlativo: nota.correlativo };
  }
}
