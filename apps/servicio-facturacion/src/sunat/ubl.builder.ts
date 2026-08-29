import { desglosarIgv, redondear2, DesgloseIgv } from './igv';

export interface ItemComprobante {
  descripcion: string;
  cantidad: number;
  precioUnitarioConIgv: number;
}

export interface DatosEmpresa {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccion?: string;
  ubigeo?: string;
  /** Código de establecimiento SUNAT ("local anexo"). "0000" = domicilio fiscal/matriz. */
  codigoEstablecimiento?: string;
}

/** Catálogo 06 SUNAT (tipo de documento de identidad): 1=DNI, 6=RUC, 0=Sin documento. */
export interface DatosCliente {
  tipoDocumento: '1' | '6' | '0';
  numeroDocumento: string;
  nombreORazonSocial: string;
}

export interface DatosComprobante {
  tipo: 'BOLETA' | 'FACTURA';
  serie: string;
  correlativo: number;
  fechaEmision: Date;
  moneda?: string;
  empresa: DatosEmpresa;
  cliente: DatosCliente;
  items: ItemComprobante[];
}

export interface ComprobanteConstruido {
  xml: string;
  totales: DesgloseIgv;
}

const CODIGO_TIPO_DOC: Record<'BOLETA' | 'FACTURA', string> = {
  FACTURA: '01',
  BOLETA: '03',
};

function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatearFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function signatureBlock(idComprobante: string, empresa: DatosEmpresa): string {
  return `
  <cac:Signature>
    <cbc:ID>${idComprobante}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${escaparXml(empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${empresa.razonSocial}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>`;
}

// Sin PaymentTerms a propósito: a diferencia de Invoice (donde SUNAT lo
// exige — error 3244 sin él), en CreditNote/DebitNote lo rechaza con error
// 3246 ("El tipo de transaccion... no cumple con el formato esperado",
// sobre PaymentTerms/PaymentMeansID) — confirmado contra beta real
// 2026-08-13. Una nota no es una venta con forma de pago propia, es un
// ajuste sobre una venta que ya la tiene.
function accountingPartiesBlock(empresa: DatosEmpresa, cliente: DatosCliente): string {
  return `
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escaparXml(empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${empresa.razonSocial}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>${empresa.ubigeo ? `\n          <cbc:ID>${escaparXml(empresa.ubigeo)}</cbc:ID>` : ''}
          <cbc:AddressTypeCode>${escaparXml(empresa.codigoEstablecimiento ?? '0000')}</cbc:AddressTypeCode>${
            empresa.direccion
              ? `\n          <cac:AddressLine>\n            <cbc:Line><![CDATA[${empresa.direccion}]]></cbc:Line>\n          </cac:AddressLine>`
              : ''
          }
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${cliente.tipoDocumento}">${escaparXml(cliente.numeroDocumento)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${cliente.nombreORazonSocial}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

function taxTotalBlock(moneda: string, totalValorVenta: number, totalIgv: number): string {
  return `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${totalIgv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${totalValorVenta.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${totalIgv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;
}

interface LineaCalculada {
  item: ItemComprobante;
  index: number;
  desglose: DesgloseIgv;
}

function calcularLineas(items: ItemComprobante[]): {
  lineas: LineaCalculada[];
  totalValorVenta: number;
  totalIgv: number;
  totalConIgv: number;
} {
  const lineas = items.map((item, index) => ({
    item,
    index,
    desglose: desglosarIgv(redondear2(item.precioUnitarioConIgv * item.cantidad)),
  }));
  const totalValorVenta = redondear2(lineas.reduce((acc, l) => acc + l.desglose.valorVenta, 0));
  const totalIgv = redondear2(lineas.reduce((acc, l) => acc + l.desglose.igv, 0));
  const totalConIgv = redondear2(totalValorVenta + totalIgv);
  return { lineas, totalValorVenta, totalIgv, totalConIgv };
}

/** Catálogo 01 SUNAT (tipo de documento): la Factura/Boleta que una nota puede afectar. */
const CODIGO_TIPO_DOC_AFECTADO: Record<'BOLETA' | 'FACTURA', string> = {
  FACTURA: '01',
  BOLETA: '03',
};

export interface DocumentoAfectado {
  tipo: 'BOLETA' | 'FACTURA';
  serie: string;
  correlativo: number;
}

export interface DatosNota {
  serie: string;
  correlativo: number;
  fechaEmision: Date;
  moneda?: string;
  empresa: DatosEmpresa;
  cliente: DatosCliente;
  items: ItemComprobante[];
  documentoAfectado: DocumentoAfectado;
  /** Código del catálogo 09 (nota de crédito) o 10 (nota de débito) SUNAT — ver catalogos-notas.ts. */
  motivoCodigo: string;
  motivoDescripcion: string;
}

function discrepancyResponseBlock(documentoAfectado: DocumentoAfectado, motivoCodigo: string, motivoDescripcion: string): string {
  const idAfectado = `${documentoAfectado.serie}-${documentoAfectado.correlativo}`;
  return `
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${idAfectado}</cbc:ReferenceID>
    <cbc:ResponseCode>${escaparXml(motivoCodigo)}</cbc:ResponseCode>
    <cbc:Description><![CDATA[${motivoDescripcion}]]></cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${idAfectado}</cbc:ID>
      <cbc:DocumentTypeCode>${CODIGO_TIPO_DOC_AFECTADO[documentoAfectado.tipo]}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;
}

/**
 * Arma el UBL 2.1 Invoice sin firmar, con el slot vacío
 * `ext:UBLExtensions/ext:UBLExtension/ext:ExtensionContent` donde `firma.ts`
 * inserta el `<ds:Signature>`. Boleta y factura usan el mismo elemento raíz
 * `<Invoice>`, solo cambia `cbc:InvoiceTypeCode` (03/01).
 *
 * Cubre los campos mínimos para que SUNAT valide la estructura y la firma.
 * Antes del primer envío a beta, compara campo a campo contra la Guía de
 * Elaboración de Documentos XML (Factura/Boleta) UBL 2.1 oficial de SUNAT —
 * hay bloques opcionales (percepción, detracción, guías referenciadas, etc.)
 * que este builder no cubre porque no aplican a un restobar sin esos regímenes.
 *
 * Los totales que devuelve son los MISMOS que quedan en el XML (una sola
 * fuente de verdad): quien llama no debe recalcular el desglose de IGV por su
 * cuenta, o el registro en base de datos podría no coincidir con el
 * documento firmado.
 */
export function construirXmlComprobante(datos: DatosComprobante): ComprobanteConstruido {
  if (datos.items.length === 0) {
    throw new Error('Un comprobante SUNAT necesita al menos un ítem');
  }

  const moneda = datos.moneda ?? 'PEN';
  const idComprobante = `${datos.serie}-${datos.correlativo}`;
  const tipoDoc = CODIGO_TIPO_DOC[datos.tipo];

  const lineas = datos.items.map((item, index) => ({
    item,
    index,
    desglose: desglosarIgv(redondear2(item.precioUnitarioConIgv * item.cantidad)),
  }));

  const totalValorVenta = redondear2(lineas.reduce((acc, l) => acc + l.desglose.valorVenta, 0));
  const totalIgv = redondear2(lineas.reduce((acc, l) => acc + l.desglose.igv, 0));
  const totalConIgv = redondear2(totalValorVenta + totalIgv);

  const invoiceLines = lineas
    .map(
      ({ item, index, desglose }) => `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">${item.cantidad}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${moneda}">${item.precioUnitarioConIgv.toFixed(2)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${desglose.igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${desglose.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>18</cbc:Percent>
          <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description><![CDATA[${item.descripcion}]]></cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${idComprobante}</cbc:ID>
  <cbc:IssueDate>${formatearFecha(datos.fechaEmision)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="0101">${tipoDoc}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>${idComprobante}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${escaparXml(datos.empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${datos.empresa.razonSocial}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${escaparXml(datos.empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${datos.empresa.razonSocial}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>${datos.empresa.ubigeo ? `\n          <cbc:ID>${escaparXml(datos.empresa.ubigeo)}</cbc:ID>` : ''}
          <cbc:AddressTypeCode>${escaparXml(datos.empresa.codigoEstablecimiento ?? '0000')}</cbc:AddressTypeCode>${
            datos.empresa.direccion
              ? `\n          <cac:AddressLine>\n            <cbc:Line><![CDATA[${datos.empresa.direccion}]]></cbc:Line>\n          </cac:AddressLine>`
              : ''
          }
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${datos.cliente.tipoDocumento}">${escaparXml(datos.cliente.numeroDocumento)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${datos.cliente.nombreORazonSocial}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
  </cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${totalIgv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${totalValorVenta.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${totalIgv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${totalValorVenta.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${totalConIgv.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${moneda}">${totalConIgv.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${invoiceLines}
</Invoice>`;

  return { xml, totales: { valorVenta: totalValorVenta, igv: totalIgv, total: totalConIgv } };
}

/**
 * Arma el UBL 2.1 CreditNote sin firmar. A diferencia de boleta/factura
 * (mismo `<Invoice>`, distinto InvoiceTypeCode), la nota de crédito usa su
 * propio elemento raíz `<CreditNote>` — el tipo de documento (07 en el
 * catálogo 01) no se repite dentro del XML, ya lo comunica el elemento raíz
 * en sí mismo; sí se usa para el nombre de archivo del envío (ver
 * envio.processor.ts).
 *
 * `cac:DiscrepancyResponse` + `cac:BillingReference` son los bloques que no
 * tiene un Invoice: enlazan la nota con la factura/boleta que corrige
 * (catálogo 09 SUNAT para el motivo).
 */
export function construirXmlNotaCredito(datos: DatosNota): ComprobanteConstruido {
  if (datos.items.length === 0) {
    throw new Error('Una nota de crédito SUNAT necesita al menos un ítem');
  }

  const moneda = datos.moneda ?? 'PEN';
  const idNota = `${datos.serie}-${datos.correlativo}`;
  const { lineas, totalValorVenta, totalIgv, totalConIgv } = calcularLineas(datos.items);

  const creditNoteLines = lineas
    .map(
      ({ item, index, desglose }) => `
  <cac:CreditNoteLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:CreditedQuantity unitCode="NIU">${item.cantidad}</cbc:CreditedQuantity>
    <cbc:LineExtensionAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${moneda}">${item.precioUnitarioConIgv.toFixed(2)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${desglose.igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${desglose.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>18</cbc:Percent>
          <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description><![CDATA[${item.descripcion}]]></cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:CreditNoteLine>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${idNota}</cbc:ID>
  <cbc:IssueDate>${formatearFecha(datos.fechaEmision)}</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>${discrepancyResponseBlock(datos.documentoAfectado, datos.motivoCodigo, datos.motivoDescripcion)}${signatureBlock(idNota, datos.empresa)}${accountingPartiesBlock(datos.empresa, datos.cliente)}${taxTotalBlock(moneda, totalValorVenta, totalIgv)}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${totalValorVenta.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${totalConIgv.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${moneda}">${totalConIgv.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${creditNoteLines}
</CreditNote>`;

  return { xml, totales: { valorVenta: totalValorVenta, igv: totalIgv, total: totalConIgv } };
}

/**
 * Arma el UBL 2.1 DebitNote sin firmar. Mismo patrón que CreditNote (raíz
 * propia, DiscrepancyResponse + BillingReference, catálogo 10 para el
 * motivo), pero el total va en `cac:RequestedMonetaryTotal` (no
 * `LegalMonetaryTotal`) y las líneas son `cac:DebitNoteLine` con
 * `cbc:DebitedQuantity` — nombres de elemento distintos, mismo contenido.
 */
export function construirXmlNotaDebito(datos: DatosNota): ComprobanteConstruido {
  if (datos.items.length === 0) {
    throw new Error('Una nota de débito SUNAT necesita al menos un ítem');
  }

  const moneda = datos.moneda ?? 'PEN';
  const idNota = `${datos.serie}-${datos.correlativo}`;
  const { lineas, totalValorVenta, totalIgv, totalConIgv } = calcularLineas(datos.items);

  const debitNoteLines = lineas
    .map(
      ({ item, index, desglose }) => `
  <cac:DebitNoteLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:DebitedQuantity unitCode="NIU">${item.cantidad}</cbc:DebitedQuantity>
    <cbc:LineExtensionAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${moneda}">${item.precioUnitarioConIgv.toFixed(2)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${desglose.igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${desglose.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>18</cbc:Percent>
          <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>1000</cbc:ID>
            <cbc:Name>IGV</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description><![CDATA[${item.descripcion}]]></cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${moneda}">${desglose.valorVenta.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:DebitNoteLine>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<DebitNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${idNota}</cbc:ID>
  <cbc:IssueDate>${formatearFecha(datos.fechaEmision)}</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>${discrepancyResponseBlock(datos.documentoAfectado, datos.motivoCodigo, datos.motivoDescripcion)}${signatureBlock(idNota, datos.empresa)}${accountingPartiesBlock(datos.empresa, datos.cliente)}${taxTotalBlock(moneda, totalValorVenta, totalIgv)}
  <cac:RequestedMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${totalValorVenta.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${totalConIgv.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${moneda}">${totalConIgv.toFixed(2)}</cbc:PayableAmount>
  </cac:RequestedMonetaryTotal>${debitNoteLines}
</DebitNote>`;

  return { xml, totales: { valorVenta: totalValorVenta, igv: totalIgv, total: totalConIgv } };
}
