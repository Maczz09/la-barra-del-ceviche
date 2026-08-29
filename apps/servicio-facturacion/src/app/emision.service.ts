import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { PedidoSnapshotItem } from '@org/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CorrelativoService } from '../sunat/correlativo.service';
import { CertificadoService } from '../sunat/certificado.service';
import { firmarComprobante } from '../sunat/firma';
import { construirXmlComprobante, ItemComprobante, DatosCliente } from '../sunat/ubl.builder';
import { EmitirComprobanteDto } from './dto/emitir-comprobante.dto';

@Injectable()
export class EmisionService {
  private readonly logger = new Logger(EmisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativo: CorrelativoService,
    private readonly certificado: CertificadoService,
  ) {}

  /**
   * Caja/admin elige un comprobante de pago (cuenta ya cerrada) y decide si
   * sube como BOLETA o FACTURA. Construye el UBL, lo firma (XMLDSig) y lo
   * deja en estado FIRMADO — el envío real a SUNAT lo hace EnvioProcessor por
   * separado (así un SUNAT caído no bloquea la respuesta de este endpoint).
   */
  async emitir(cuentaId: string, dto: EmitirComprobanteDto, usuarioSedeId?: string | null): Promise<{
    id: string;
    tipo: string;
    serie: string;
    correlativo: number;
    estado: string;
    total: number;
  }> {
    if (dto.tipoComprobante === 'FACTURA' && !dto.clienteRuc) {
      throw new BadRequestException('La factura electrónica exige el RUC del cliente.');
    }

    const comprobantePago = await this.prisma.comprobantePago.findUnique({ where: { cuentaId } });
    if (!comprobantePago || (usuarioSedeId && comprobantePago.sedeId !== usuarioSedeId)) {
      throw new NotFoundException(`No hay comprobante de pago para la cuenta ${cuentaId}`);
    }
    if (comprobantePago.estado !== 'DISPONIBLE') {
      throw new BadRequestException(`El comprobante de pago de la cuenta ${cuentaId} ya fue emitido.`);
    }

    const empresa = await this.prisma.empresa.findUnique({ where: { ruc: dto.empresaRuc } });
    if (!empresa || !empresa.activo) {
      throw new NotFoundException(`Empresa con RUC ${dto.empresaRuc} no está configurada`);
    }

    const itemsSnapshot = (Array.isArray(comprobantePago.items) ? comprobantePago.items : []) as unknown as PedidoSnapshotItem[];
    const items: ItemComprobante[] = itemsSnapshot.map((item) => ({
      descripcion: item.nombre ?? item.productoId,
      cantidad: Number(item.cantidad),
      precioUnitarioConIgv: Number(item.precioUnitario),
    }));
    if (items.length === 0) {
      throw new BadRequestException('El comprobante de pago no tiene ítems detallados; no se puede facturar.');
    }

    // El correlativo se asigna recién aquí (no antes de validar todo lo
    // demás): un correlativo SUNAT consumido y luego descartado por un error
    // de validación es un hueco en la numeración que hay que declarar de baja.
    const { serie, correlativo } = await this.correlativo.siguiente(empresa.id, dto.tipoComprobante);

    const { xml: xmlSinFirmar, totales } = construirXmlComprobante({
      tipo: dto.tipoComprobante,
      serie,
      correlativo,
      fechaEmision: new Date(),
      empresa: {
        ruc: empresa.ruc,
        razonSocial: empresa.razonSocial,
        nombreComercial: empresa.nombreComercial ?? undefined,
        direccion: empresa.direccion ?? undefined,
        ubigeo: empresa.ubigeo ?? undefined,
        codigoEstablecimiento: empresa.codigoEstablecimiento,
      },
      cliente: this.datosCliente(dto),
      items,
    });

    const claves = await this.certificado.clavesParaSlot(empresa.slot);
    const xmlFirmado = firmarComprobante(xmlSinFirmar, claves);

    const [comprobante] = await this.prisma.$transaction([
      this.prisma.comprobante.create({
        data: {
          comprobantePagoId: comprobantePago.id,
          empresaId: empresa.id,
          tipo: dto.tipoComprobante,
          serie,
          correlativo,
          clienteRuc: dto.clienteRuc ?? null,
          clienteDni: dto.clienteDni ?? null,
          clienteRazonSocial: dto.clienteRazonSocial ?? null,
          clienteNombre: dto.clienteNombre ?? null,
          subtotal: totales.valorVenta,
          igv: totales.igv,
          total: totales.total,
          xmlFirmado,
          estado: 'FIRMADO',
        },
      }),
      this.prisma.comprobantePago.update({
        where: { id: comprobantePago.id },
        data: { estado: 'EMITIDO' },
      }),
    ]);

    this.logger.log({
      operation: 'emitirComprobante',
      aggregateId: cuentaId,
      resultingState: 'FIRMADO',
      message: `${dto.tipoComprobante} ${serie}-${correlativo} firmada para RUC ${empresa.ruc}. Pendiente de envío a SUNAT.`,
    } satisfies OperableLog);

    return {
      id: comprobante.id,
      tipo: comprobante.tipo,
      serie: comprobante.serie,
      correlativo: comprobante.correlativo,
      estado: comprobante.estado,
      total: Number(comprobante.total),
    };
  }

  private datosCliente(dto: EmitirComprobanteDto): DatosCliente {
    if (dto.tipoComprobante === 'FACTURA') {
      return {
        tipoDocumento: '6',
        numeroDocumento: dto.clienteRuc as string,
        nombreORazonSocial: dto.clienteRazonSocial ?? (dto.clienteRuc as string),
      };
    }
    if (dto.clienteDni) {
      return { tipoDocumento: '1', numeroDocumento: dto.clienteDni, nombreORazonSocial: dto.clienteNombre ?? dto.clienteDni };
    }
    return { tipoDocumento: '0', numeroDocumento: '-', nombreORazonSocial: dto.clienteNombre ?? 'Cliente varios' };
  }
}
