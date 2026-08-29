import { construirXmlComprobante, construirXmlNotaCredito, construirXmlNotaDebito, DatosNota } from './ubl.builder';

describe('construirXmlComprobante', () => {
  const base = {
    tipo: 'BOLETA' as const,
    serie: 'B001',
    correlativo: 1,
    fechaEmision: new Date('2026-08-07T12:00:00Z'),
    empresa: { ruc: '20123456789', razonSocial: 'La Barra del Ceviche 1 SAC' },
    cliente: { tipoDocumento: '0' as const, numeroDocumento: '-', nombreORazonSocial: 'Cliente varios' },
    items: [{ descripcion: 'Ceviche mixto', cantidad: 2, precioUnitarioConIgv: 35 }],
  };

  it('deja el slot de firma vacío listo para insertar la firma', () => {
    const { xml } = construirXmlComprobante(base);
    expect(xml).toContain('<ext:ExtensionContent/>');
  });

  it('usa el InvoiceTypeCode correcto por tipo de comprobante', () => {
    expect(construirXmlComprobante(base).xml).toContain('<cbc:InvoiceTypeCode listID="0101">03</cbc:InvoiceTypeCode>');
    expect(construirXmlComprobante({ ...base, tipo: 'FACTURA' }).xml).toContain(
      '<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>',
    );
  });

  it('los totales devueltos coinciden exactamente con el XML (misma fuente)', () => {
    const { xml, totales } = construirXmlComprobante(base);
    expect(xml).toContain(`<cbc:PayableAmount currencyID="PEN">${totales.total.toFixed(2)}</cbc:PayableAmount>`);
    expect(totales.total).toBe(70);
  });

  it('rechaza un comprobante sin ítems', () => {
    expect(() => construirXmlComprobante({ ...base, items: [] })).toThrow();
  });

  // Campos confirmados contra beta real de SUNAT (RUC 20123456786, respuesta
  // ACEPTADA): sin AddressTypeCode, SUNAT rechaza con error 3030 ("código de
  // local anexo"); sin PaymentTerms, rechaza con 3244 ("tipo de transacción").
  it('incluye el código de establecimiento (0000 por defecto) en RegistrationAddress', () => {
    const { xml } = construirXmlComprobante(base);
    expect(xml).toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
  });

  it('usa el código de establecimiento de la empresa si se indica uno distinto', () => {
    const { xml } = construirXmlComprobante({
      ...base,
      empresa: { ...base.empresa, codigoEstablecimiento: '0001' },
    });
    expect(xml).toContain('<cbc:AddressTypeCode>0001</cbc:AddressTypeCode>');
  });

  it('incluye el ubigeo de la empresa dentro de RegistrationAddress cuando está disponible', () => {
    const { xml } = construirXmlComprobante({ ...base, empresa: { ...base.empresa, ubigeo: '150101' } });
    expect(xml).toContain('<cac:RegistrationAddress>\n          <cbc:ID>150101</cbc:ID>');
  });

  it('siempre declara la forma de pago como Contado (no hay ventas al crédito)', () => {
    const { xml } = construirXmlComprobante(base);
    expect(xml).toContain('<cac:PaymentTerms>\n    <cbc:ID>FormaPago</cbc:ID>\n    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>\n  </cac:PaymentTerms>');
  });
});

describe('construirXmlNotaCredito', () => {
  const baseNota: DatosNota = {
    serie: 'FC01',
    correlativo: 1,
    fechaEmision: new Date('2026-08-13T12:00:00Z'),
    empresa: { ruc: '20123456789', razonSocial: 'La Barra del Ceviche 1 SAC' },
    cliente: { tipoDocumento: '6', numeroDocumento: '20111111111', nombreORazonSocial: 'Cliente SAC' },
    items: [{ descripcion: 'Anulación total', cantidad: 1, precioUnitarioConIgv: 70 }],
    documentoAfectado: { tipo: 'FACTURA', serie: 'F001', correlativo: 5 },
    motivoCodigo: '01',
    motivoDescripcion: 'Anulación de la operación',
  };

  it('usa <CreditNote> como raíz con el namespace correcto', () => {
    const { xml } = construirXmlNotaCredito(baseNota);
    expect(xml).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(xml.trim().endsWith('</CreditNote>')).toBe(true);
  });

  it('referencia el documento afectado en DiscrepancyResponse y BillingReference', () => {
    const { xml } = construirXmlNotaCredito(baseNota);
    expect(xml).toContain('<cbc:ReferenceID>F001-5</cbc:ReferenceID>');
    expect(xml).toContain('<cbc:ResponseCode>01</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:Description><![CDATA[Anulación de la operación]]></cbc:Description>');
    expect(xml).toContain('<cbc:ID>F001-5</cbc:ID>\n      <cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
  });

  it('usa DocumentTypeCode 03 cuando el documento afectado es una boleta', () => {
    const { xml } = construirXmlNotaCredito({ ...baseNota, documentoAfectado: { tipo: 'BOLETA', serie: 'B001', correlativo: 9 } });
    expect(xml).toContain('<cbc:ID>B001-9</cbc:ID>\n      <cbc:DocumentTypeCode>03</cbc:DocumentTypeCode>');
  });

  it('usa CreditNoteLine/CreditedQuantity para las líneas, no InvoiceLine', () => {
    const { xml } = construirXmlNotaCredito(baseNota);
    expect(xml).toContain('<cac:CreditNoteLine>');
    expect(xml).toContain('<cbc:CreditedQuantity unitCode="NIU">1</cbc:CreditedQuantity>');
    expect(xml).not.toContain('InvoiceLine');
  });

  it('los totales devueltos coinciden con el XML', () => {
    const { xml, totales } = construirXmlNotaCredito(baseNota);
    expect(xml).toContain(`<cbc:PayableAmount currencyID="PEN">${totales.total.toFixed(2)}</cbc:PayableAmount>`);
    expect(totales.total).toBe(70);
  });

  it('rechaza una nota sin ítems', () => {
    expect(() => construirXmlNotaCredito({ ...baseNota, items: [] })).toThrow();
  });
});

describe('construirXmlNotaDebito', () => {
  const baseNota: DatosNota = {
    serie: 'FD01',
    correlativo: 1,
    fechaEmision: new Date('2026-08-13T12:00:00Z'),
    empresa: { ruc: '20123456789', razonSocial: 'La Barra del Ceviche 1 SAC' },
    cliente: { tipoDocumento: '6', numeroDocumento: '20111111111', nombreORazonSocial: 'Cliente SAC' },
    items: [{ descripcion: 'Intereses por mora', cantidad: 1, precioUnitarioConIgv: 10 }],
    documentoAfectado: { tipo: 'FACTURA', serie: 'F001', correlativo: 5 },
    motivoCodigo: '01',
    motivoDescripcion: 'Intereses por mora',
  };

  it('usa <DebitNote> como raíz con el namespace correcto', () => {
    const { xml } = construirXmlNotaDebito(baseNota);
    expect(xml).toContain('<DebitNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2"');
    expect(xml.trim().endsWith('</DebitNote>')).toBe(true);
  });

  it('usa RequestedMonetaryTotal (no LegalMonetaryTotal) para el total', () => {
    const { xml } = construirXmlNotaDebito(baseNota);
    expect(xml).toContain('<cac:RequestedMonetaryTotal>');
    expect(xml).not.toContain('LegalMonetaryTotal');
  });

  it('usa DebitNoteLine/DebitedQuantity para las líneas', () => {
    const { xml } = construirXmlNotaDebito(baseNota);
    expect(xml).toContain('<cac:DebitNoteLine>');
    expect(xml).toContain('<cbc:DebitedQuantity unitCode="NIU">1</cbc:DebitedQuantity>');
  });

  it('rechaza una nota sin ítems', () => {
    expect(() => construirXmlNotaDebito({ ...baseNota, items: [] })).toThrow();
  });
});
