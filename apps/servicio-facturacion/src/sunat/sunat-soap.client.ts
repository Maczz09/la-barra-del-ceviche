import { Injectable, Logger } from '@nestjs/common';
import * as soap from 'soap';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';

export interface EnvioResultado {
  ticket?: string;
  cdrBase64?: string;
}

// WSDL de billService empaquetado localmente (no se fetchea en vivo): el
// stack HTTP de `soap` (axios) recibe 401 de la pasarela de SUNAT al pedir
// el import interno `billService?ns1.wsdl`, aunque la MISMA url responde 200
// con curl o con `https.get` de Node — verificado a mano contra beta. El
// contrato (operaciones, tipos) es estático y no cambia entre beta/producción,
// así que se versiona una copia (`wsdl/billService.wsdl` + su import
// `billService-ns1.wsdl` + `billService.xsd2.xsd`) y solo el endpoint real de
// envío (`SUNAT_WSDL_URL`, sin el `?wsdl`) se toma del entorno.
const WSDL_LOCAL = join(__dirname, 'wsdl/billService.wsdl');

/**
 * Cliente SOAP para el `billService` de SUNAT (sendBill / sendSummary /
 * getStatus). Operaciones y nombres de parámetro (`fileName`, `contentFile`,
 * `ticket`, `applicationResponse`) verificados contra el WSDL/XSD real de
 * beta (homologación) — confirmado que coinciden con lo que ya mandábamos.
 */
@Injectable()
export class SunatSoapClient {
  private readonly logger = new Logger(SunatSoapClient.name);
  private readonly clientesPorRuc = new Map<string, soap.Client>();

  private async obtenerCliente(ruc: string, solUsuario: string, solClave: string): Promise<soap.Client> {
    const existente = this.clientesPorRuc.get(ruc);
    if (existente) return existente;

    const wsdlUrl = process.env['SUNAT_WSDL_URL'];
    if (!wsdlUrl) throw new Error('SUNAT_WSDL_URL no configurado');

    const client = await soap.createClientAsync(WSDL_LOCAL);
    client.setEndpoint(wsdlUrl.replace(/\?wsdl\s*$/i, ''));
    // Usuario SOL de SUNAT: se autentica como RUC + usuarioSOL en el campo
    // Username de WS-Security (convención del servicio, no un estándar WSS).
    client.setSecurity(new soap.WSSecurity(`${ruc}${solUsuario}`, solClave, { hasTimeStamp: false }));
    this.clientesPorRuc.set(ruc, client);
    return client;
  }

  private zipear(nombreArchivo: string, xml: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = new PassThrough();
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', reject);
      archive.pipe(stream);
      archive.append(xml, { name: `${nombreArchivo}.xml` });
      void archive.finalize();
    });
  }

  /** sendBill: envío individual (factura, nota, y boleta si no usas resumen). CDR en la misma respuesta. */
  async enviarComprobante(params: {
    ruc: string;
    solUsuario: string;
    solClave: string;
    nombreArchivo: string;
    xmlFirmado: string;
  }): Promise<EnvioResultado> {
    const client = await this.obtenerCliente(params.ruc, params.solUsuario, params.solClave);
    const zip = await this.zipear(params.nombreArchivo, params.xmlFirmado);
    const [result] = (await (client as unknown as { sendBillAsync: (args: unknown) => Promise<unknown[]> }).sendBillAsync({
      fileName: `${params.nombreArchivo}.zip`,
      // xs:base64Binary: `soap` no serializa Buffers solo — hay que mandar el string ya codificado.
      contentFile: zip.toString('base64'),
    })) as [{ applicationResponse?: string } | undefined];
    this.logger.log(`sendBill ${params.nombreArchivo}: respuesta recibida`);
    return { cdrBase64: result?.applicationResponse };
  }

  /** sendSummary: resumen diario de boletas. Devuelve un ticket; el CDR llega después vía getStatus. */
  async enviarResumen(params: {
    ruc: string;
    solUsuario: string;
    solClave: string;
    nombreArchivo: string;
    xmlResumen: string;
  }): Promise<EnvioResultado> {
    const client = await this.obtenerCliente(params.ruc, params.solUsuario, params.solClave);
    const zip = await this.zipear(params.nombreArchivo, params.xmlResumen);
    const [result] = (await (client as unknown as { sendSummaryAsync: (args: unknown) => Promise<unknown[]> }).sendSummaryAsync({
      fileName: `${params.nombreArchivo}.zip`,
      contentFile: zip.toString('base64'),
    })) as [{ ticket?: string } | undefined];
    return { ticket: result?.ticket };
  }

  async consultarEstado(params: { ruc: string; solUsuario: string; solClave: string; ticket: string }): Promise<EnvioResultado> {
    const client = await this.obtenerCliente(params.ruc, params.solUsuario, params.solClave);
    const [result] = (await (client as unknown as { getStatusAsync: (args: unknown) => Promise<unknown[]> }).getStatusAsync({
      ticket: params.ticket,
    })) as [{ statusCode?: string; content?: string } | undefined];
    return { cdrBase64: result?.statusCode === '0' ? result?.content : undefined };
  }
}
