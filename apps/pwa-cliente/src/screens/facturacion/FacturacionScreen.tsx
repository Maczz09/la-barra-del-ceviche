// screens/facturacion/FacturacionScreen.tsx — Emisión de boletas/facturas SUNAT (solo ADMIN)
//
// Dos listas: comprobantes de pago DISPONIBLES (cuentas ya cerradas, aún sin
// subir a SUNAT) y EMITIDOS (con su estado real: FIRMADO/ENVIADO mientras
// espera el envío async, ACEPTADO/RECHAZADO/OBSERVADO una vez que SUNAT
// responde — ver useFacturacionQuery para el polling mientras hay pendientes).

import { useMemo, useRef, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { useToast } from '../../components/ui/ToastProvider';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { fmt } from '../../utils/format';
import { rangoDePeriodo } from '../../utils/periodos';
import { useFacturacionQuery } from '../../hooks/queries/useFacturacionQuery';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { abrirComprobanteParaImprimir } from '../../utils/comprobantePrint';
import { ConfigurarEmpresaModal } from './ConfigurarEmpresaModal';
import { EditarEmpresaModal } from './EditarEmpresaModal';
import { CATALOGO_MOTIVOS_NOTA_CREDITO, CATALOGO_MOTIVOS_NOTA_DEBITO } from '../../types/facturacion.types';
import type { ComprobanteDto, ComprobantePagoDto, EmpresaDto, EstadoComprobante, NotaDto, TipoComprobante, TipoNota } from '../../types/facturacion.types';

const ESTADO_BADGE: Record<EstadoComprobante, string> = {
  FIRMADO: 'badge-info',
  ENVIADO: 'badge-info',
  ACEPTADO: 'badge-ok',
  RECHAZADO: 'badge-danger',
  OBSERVADO: 'badge-warn',
};

const ESTADO_LABEL: Record<EstadoComprobante, string> = {
  FIRMADO: 'Firmado · enviando',
  ENVIADO: 'Enviado · esperando CDR',
  ACEPTADO: 'Aceptado por SUNAT',
  RECHAZADO: 'Rechazado',
  OBSERVADO: 'Observado',
};

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// YYYY-MM-DD en hora local del navegador (Lima en este despliegue) — comparable
// lexicográficamente contra los <input type="date"> de los filtros sin líos de UTC.
function fechaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

function enRango(iso: string, desde: string, hasta: string): boolean {
  const f = fechaLocal(iso);
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

type FiltroEstado = '' | 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' | 'OBSERVADO';
type FiltroTipoNota = '' | TipoNota;

type Detalle =
  | { kind: 'comprobante'; data: ComprobanteDto }
  | { kind: 'nota'; data: NotaDto }
  | { kind: 'disponible'; data: ComprobantePagoDto };

export function FacturacionScreen() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const {
    disponibles, emitidos, notas, notasLoading, empresas, empresasLoading, loading, emitiendo, error, success, fetch,
    emitirComprobante, clearFeedback, crearEmpresa, configurandoEmpresa, errorEmpresa, clearFeedbackEmpresa,
    emitiendoNota, errorNota, emitirNotaCredito, emitirNotaDebito, clearFeedbackNota,
    actualizarEmpresa, cambiarEstadoEmpresa, actualizandoEmpresa, errorActualizarEmpresa, clearFeedbackActualizarEmpresa,
  } = useFacturacionQuery();
  const { sedes } = useSedesQuery();

  const [configurarSunat, setConfigurarSunat] = useState(false);
  const [editarEmpresa, setEditarEmpresa] = useState<EmpresaDto | null>(null);

  const sedeNombrePorId = useMemo(() => new Map(sedes.map((s) => [s.id, s.nombre])), [sedes]);
  // Una sede no puede tener dos empresas emisoras — "libre" = ninguna
  // empresa ya la tiene enlazada (o es la propia empresa que se está
  // editando, para no bloquearse a sí misma al reabrir el modal).
  const sedesConEmpresa = useMemo(
    () => new Set(empresas.filter((e) => e.sedeId).map((e) => e.sedeId as string)),
    [empresas],
  );
  const sedesLibresParaCrear = useMemo(
    () => sedes.filter((s) => s.activa && !sedesConEmpresa.has(s.id)),
    [sedes, sedesConEmpresa],
  );
  const sedesDisponiblesParaEditar = useMemo(() => {
    if (!editarEmpresa) return [];
    return sedes.filter((s) => s.activa && (!sedesConEmpresa.has(s.id) || s.id === editarEmpresa.sedeId));
  }, [sedes, sedesConEmpresa, editarEmpresa]);

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoComprobante | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('');
  const [filtroTipoNota, setFiltroTipoNota] = useState<FiltroTipoNota>('');
  const [filtroEstadoNota, setFiltroEstadoNota] = useState<FiltroEstado>('');
  const [detalle, setDetalle] = useState<Detalle | null>(null);

  const aplicarPeriodo = (periodo: 'dia' | 'semana' | 'mes') => {
    const r = rangoDePeriodo(periodo);
    setDesde(r.desde);
    setHasta(r.hasta);
  };

  const disponiblesFiltrados = useMemo(
    () => disponibles.filter((c) => enRango(c.fecha, desde, hasta)),
    [disponibles, desde, hasta],
  );

  const emitidosFiltrados = useMemo(
    () =>
      emitidos.filter((c) => {
        if (!enRango(c.comprobante?.createdAt ?? c.fecha, desde, hasta)) return false;
        if (filtroTipo && c.comprobante?.tipo !== filtroTipo) return false;
        if (!filtroEstado) return true;
        const estado = c.comprobante?.estado;
        if (filtroEstado === 'PENDIENTE') return estado === 'FIRMADO' || estado === 'ENVIADO';
        return estado === filtroEstado;
      }),
    [emitidos, desde, hasta, filtroTipo, filtroEstado],
  );

  const notasFiltradas = useMemo(
    () =>
      notas.filter((n) => {
        if (!enRango(n.createdAt, desde, hasta)) return false;
        if (filtroTipoNota && n.tipo !== filtroTipoNota) return false;
        if (!filtroEstadoNota) return true;
        if (filtroEstadoNota === 'PENDIENTE') return n.estado === 'FIRMADO' || n.estado === 'ENVIADO';
        return n.estado === filtroEstadoNota;
      }),
    [notas, desde, hasta, filtroTipoNota, filtroEstadoNota],
  );

  const [emitir, setEmitir] = useState<ComprobantePagoDto | null>(null);
  const [tipo, setTipo] = useState<TipoComprobante>('BOLETA');
  const [clienteRuc, setClienteRuc] = useState('');
  const [clienteRazonSocial, setClienteRazonSocial] = useState('');
  const [clienteDni, setClienteDni] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const modalRef = useRef<HTMLDialogElement>(null);

  const cerrarModal = () => setEmitir(null);
  useFocusTrap(modalRef, { active: !!emitir, onClose: cerrarModal });

  const [notaPara, setNotaPara] = useState<ComprobanteDto | null>(null);
  const [tipoNota, setTipoNota] = useState<TipoNota>('NOTA_CREDITO');
  const [motivoCodigo, setMotivoCodigo] = useState('');
  const [montoNota, setMontoNota] = useState('');
  const [descripcionNota, setDescripcionNota] = useState('');
  const notaModalRef = useRef<HTMLDialogElement>(null);

  const cerrarNotaModal = () => { setNotaPara(null); clearFeedbackNota(); };
  useFocusTrap(notaModalRef, { active: !!notaPara, onClose: cerrarNotaModal });

  const detalleModalRef = useRef<HTMLDialogElement>(null);
  const cerrarDetalle = () => setDetalle(null);
  useFocusTrap(detalleModalRef, { active: !!detalle, onClose: cerrarDetalle });

  const catalogoNota = tipoNota === 'NOTA_CREDITO' ? CATALOGO_MOTIVOS_NOTA_CREDITO : CATALOGO_MOTIVOS_NOTA_DEBITO;

  const abrirNota = (comprobante: ComprobanteDto) => {
    setNotaPara(comprobante);
    setTipoNota('NOTA_CREDITO');
    setMotivoCodigo(CATALOGO_MOTIVOS_NOTA_CREDITO[0].codigo);
    setMontoNota(String(Number(comprobante.total)));
    setDescripcionNota(CATALOGO_MOTIVOS_NOTA_CREDITO[0].descripcion);
  };

  const cambiarTipoNota = (t: TipoNota) => {
    setTipoNota(t);
    const catalogo = t === 'NOTA_CREDITO' ? CATALOGO_MOTIVOS_NOTA_CREDITO : CATALOGO_MOTIVOS_NOTA_DEBITO;
    setMotivoCodigo(catalogo[0].codigo);
    setDescripcionNota(catalogo[0].descripcion);
  };

  const confirmarNota = async () => {
    if (!notaPara) return;
    const monto = Number(montoNota);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast({ title: 'Monto inválido', msg: 'Ingresa un monto mayor a cero.', icon: 'Alert', kind: 'err' });
      return;
    }
    const payload = {
      motivoCodigo,
      items: [{ descripcion: descripcionNota.trim() || 'Ajuste', cantidad: 1, precioUnitarioConIgv: monto }],
    };
    try {
      if (tipoNota === 'NOTA_CREDITO') {
        await emitirNotaCredito(notaPara.id, payload);
      } else {
        await emitirNotaDebito(notaPara.id, payload);
      }
      toast({
        title: tipoNota === 'NOTA_CREDITO' ? 'Nota de crédito firmada' : 'Nota de débito firmada',
        msg: 'Enviándose a SUNAT — el estado se actualiza solo.',
        icon: 'Check',
        kind: 'ok',
      });
      cerrarNotaModal();
    } catch {
      toast({ title: 'No se pudo emitir la nota', msg: 'Revisa los datos e inténtalo de nuevo.', icon: 'Alert', kind: 'err' });
    }
  };

  // listarEmpresas() ahora devuelve activas e inactivas (para poder
  // reactivarlas/editarlas) — el selector de emisión solo considera activas.
  const empresasActivas = useMemo(() => empresas.filter((e) => e.activo), [empresas]);
  const empresaUnica = empresasActivas.length === 1 ? empresasActivas[0] : null;
  const puedeEmitir = empresasActivas.length > 0;

  const abrirEmision = (c: ComprobantePagoDto) => {
    setEmitir(c);
    setTipo('BOLETA');
    setClienteRuc('');
    setClienteRazonSocial('');
    setClienteDni('');
    setClienteNombre('');
  };

  const confirmarEmision = async () => {
    if (!emitir || !empresaUnica) return;
    if (tipo === 'FACTURA' && clienteRuc.trim().length !== 11) {
      toast({ title: 'RUC inválido', msg: 'La factura electrónica exige un RUC de 11 dígitos.', icon: 'Alert', kind: 'err' });
      return;
    }
    try {
      await emitirComprobante(emitir.cuentaId, {
        tipoComprobante: tipo,
        empresaRuc: empresaUnica.ruc,
        clienteRuc: tipo === 'FACTURA' ? clienteRuc.trim() : undefined,
        clienteRazonSocial: tipo === 'FACTURA' ? clienteRazonSocial.trim() || undefined : undefined,
        clienteDni: tipo === 'BOLETA' ? clienteDni.trim() || undefined : undefined,
        clienteNombre: tipo === 'BOLETA' ? clienteNombre.trim() || undefined : undefined,
      });
      toast({ title: 'Comprobante firmado', msg: 'Enviándose a SUNAT — el estado se actualiza solo.', icon: 'Check', kind: 'ok' });
      cerrarModal();
    } catch {
      toast({ title: 'No se pudo emitir', msg: 'Revisa los datos e inténtalo de nuevo.', icon: 'Alert', kind: 'err' });
    }
  };

  const pendientesSunat = emitidosFiltrados.filter((c) => c.comprobante?.estado === 'FIRMADO' || c.comprobante?.estado === 'ENVIADO').length;
  const aceptados = emitidosFiltrados.filter((c) => c.comprobante?.estado === 'ACEPTADO').length;
  const hayFiltros = !!(desde || hasta || filtroTipo || filtroEstado || filtroTipoNota || filtroEstadoNota);
  const limpiarFiltros = () => {
    setDesde('');
    setHasta('');
    setFiltroTipo('');
    setFiltroEstado('');
    setFiltroTipoNota('');
    setFiltroEstadoNota('');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Facturación</h1>
          <div className="sub">Emisión de boletas y facturas electrónicas SUNAT</div>
        </div>
        <span className="spacer" />
        {!empresasLoading && empresas.length < 2 && (
          <button className="btn btn-soft btn-sm" onClick={() => setConfigurarSunat(true)}>
            <Icons.Sede s={15} /> {empresas.length === 0 ? 'Configurar SUNAT' : 'Agregar otra empresa'}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={fetch} title="Refrescar" aria-label="Refrescar facturación">
          <Icons.Refresh s={16} />
        </button>
      </div>

      {!online && (
        <output className="banner warn module-feedback">
          <Icons.Alert s={17} />
          <span>Sin conexión. La emisión está deshabilitada.</span>
        </output>
      )}

      {!empresasLoading && !puedeEmitir && (
        <div className="banner warn module-feedback" role="alert">
          <Icons.Alert s={17} />
          <span>No hay ninguna empresa con certificado SUNAT configurado todavía — usa "Configurar SUNAT" arriba.</span>
        </div>
      )}

      {(error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`} role="alert">
          {error ? <Icons.Alert s={17} /> : <Icons.Check s={16} />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      {!empresasLoading && empresas.length > 0 && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-h">
            <h3>Empresas configuradas</h3>
            <span className="spacer" />
            <span className="badge badge-info">{empresas.length}</span>
          </div>
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Razón social</th>
                  <th className="col-mobile-hidden">RUC</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th className="cell-action">Editar</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((emp) => (
                  <tr key={emp.id}>
                    <td><strong>{emp.razonSocial}</strong></td>
                    <td className="col-mobile-hidden muted">{emp.ruc}</td>
                    <td className="muted">
                      {emp.sedeId ? (sedeNombrePorId.get(emp.sedeId) ?? '—') : 'Sin asignar'}
                    </td>
                    <td>
                      <button
                        className={`toggle ${emp.activo ? 'on' : ''}`}
                        disabled={actualizandoEmpresa || !online}
                        title={emp.activo ? 'Desactivar empresa' : 'Reactivar empresa'}
                        aria-label={`${emp.activo ? 'Desactivar' : 'Reactivar'} ${emp.razonSocial}`}
                        onClick={() => void cambiarEstadoEmpresa(emp.id, !emp.activo)}
                      >
                        <span className="knob" />
                      </button>
                    </td>
                    <td className="cell-action">
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={!online}
                        onClick={() => setEditarEmpresa(emp)}
                        aria-label={`Editar ${emp.razonSocial}`}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Receipt" tint="accent" label="Disponibles" value={disponiblesFiltrados.length} />
        <StatKpi icon="Clock" tint="warn" label="Esperando SUNAT" value={pendientesSunat} />
        <StatKpi icon="Check" tint="ok" label="Aceptados" value={aceptados} />
      </div>

      <div className="module-toolbar" style={{ marginBottom: 16 }}>
        <fieldset className="filters" aria-label="Periodo rápido">
          <button className="chip" onClick={() => aplicarPeriodo('dia')}>Hoy</button>
          <button className="chip" onClick={() => aplicarPeriodo('semana')}>Esta semana</button>
          <button className="chip" onClick={() => aplicarPeriodo('mes')}>Este mes</button>
        </fieldset>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="fact-desde">Desde</label>
          <div className="input"><input id="fact-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="fact-hasta">Hasta</label>
          <div className="input"><input id="fact-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        </div>
        <span className="spacer" />
        {hayFiltros && (
          <button className="btn btn-ghost btn-sm" onClick={limpiarFiltros}>Limpiar filtros</button>
        )}
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h3>Comprobantes de pago disponibles</h3>
          <span className="spacer" />
          <span className="badge badge-info">{disponiblesFiltrados.length}</span>
        </div>

        {loading && disponiblesFiltrados.length === 0 && (
          <div className="table-wrap table-wrap-flat">
            {[1, 2, 3].map((row) => (
              <div key={row} className="skeleton-row row" style={{ gap: 12 }}>
                <div className="skel" style={{ width: '50%', height: 13 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && disponiblesFiltrados.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Receipt s={24} /></div>
            <h3>{hayFiltros ? 'Nada con este filtro' : 'Sin comprobantes pendientes'}</h3>
            <p>{hayFiltros ? 'Prueba ampliando el rango de fechas.' : 'Aparecen acá apenas se cierra una cuenta en caja.'}</p>
          </div>
        )}

        {!loading && disponiblesFiltrados.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="col-mobile-hidden">Mesero</th>
                  <th className="col-mobile-hidden" style={{ textAlign: 'right' }}>Ítems</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th className="cell-action"></th>
                </tr>
              </thead>
              <tbody>
                {disponiblesFiltrados.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{fechaHora(c.fecha)}</td>
                    <td className="col-mobile-hidden">{c.meseroNombre ?? <span className="muted">Sin datos</span>}</td>
                    <td className="col-mobile-hidden" style={{ textAlign: 'right' }}>{c.items?.length ?? 0}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(Number(c.total))}</td>
                    <td className="cell-action">
                      <div className="row wrap" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        <button
                          className="icon-btn"
                          title="Ver detalle"
                          aria-label="Ver detalle del comprobante de pago"
                          onClick={() => setDetalle({ kind: 'disponible', data: c })}
                        >
                          <Icons.Eye s={16} />
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={!online || !puedeEmitir}
                          onClick={() => abrirEmision(c)}
                        >
                          Emitir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-h">
          <h3>Emitidos recientes</h3>
          <span className="spacer" />
          <span className="badge badge-info">{emitidosFiltrados.length}</span>
        </div>

        <div className="module-toolbar" style={{ padding: '0 16px 12px' }}>
          <fieldset className="filters" aria-label="Filtrar por tipo de comprobante">
            <button className={`chip ${filtroTipo === '' ? 'on' : ''}`} onClick={() => setFiltroTipo('')}>Todos</button>
            <button className={`chip ${filtroTipo === 'BOLETA' ? 'on' : ''}`} onClick={() => setFiltroTipo('BOLETA')}>Boletas</button>
            <button className={`chip ${filtroTipo === 'FACTURA' ? 'on' : ''}`} onClick={() => setFiltroTipo('FACTURA')}>Facturas</button>
          </fieldset>
          <span className="spacer" />
          <fieldset className="filters" aria-label="Filtrar por estado SUNAT">
            <button className={`chip ${filtroEstado === '' ? 'on' : ''}`} onClick={() => setFiltroEstado('')}>Todos</button>
            <button className={`chip ${filtroEstado === 'PENDIENTE' ? 'on' : ''}`} onClick={() => setFiltroEstado('PENDIENTE')}>Pendientes</button>
            <button className={`chip ${filtroEstado === 'ACEPTADO' ? 'on' : ''}`} onClick={() => setFiltroEstado('ACEPTADO')}>Aceptados</button>
            <button className={`chip ${filtroEstado === 'RECHAZADO' ? 'on' : ''}`} onClick={() => setFiltroEstado('RECHAZADO')}>Rechazados</button>
            <button className={`chip ${filtroEstado === 'OBSERVADO' ? 'on' : ''}`} onClick={() => setFiltroEstado('OBSERVADO')}>Observados</button>
          </fieldset>
        </div>

        {!loading && emitidosFiltrados.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Check s={24} /></div>
            <h3>{emitidos.length === 0 ? 'Todavía no emitiste ninguno' : 'Nada con este filtro'}</h3>
            <p>{emitidos.length === 0 ? 'Los comprobantes emitidos y su estado ante SUNAT aparecen acá.' : 'Prueba ampliando el rango de fechas o cambiando el filtro.'}</p>
          </div>
        )}

        {emitidosFiltrados.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Comprobante</th>
                  <th className="col-mobile-hidden">Cliente</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Estado</th>
                  <th className="cell-action"></th>
                </tr>
              </thead>
              <tbody>
                {emitidosFiltrados.map((c) => {
                  const comprobante = c.comprobante;
                  return (
                    <tr key={c.id}>
                      <td><strong>{comprobante ? `${comprobante.tipo === 'FACTURA' ? 'Factura' : 'Boleta'} ${comprobante.serie}-${comprobante.correlativo}` : '—'}</strong></td>
                      <td className="col-mobile-hidden muted">
                        {comprobante?.clienteRazonSocial ?? comprobante?.clienteNombre ?? comprobante?.clienteRuc ?? comprobante?.clienteDni ?? 'Cliente varios'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmt(Number(comprobante?.total ?? c.total))}</td>
                      <td>
                        {comprobante ? (
                          <span className={`badge dot ${ESTADO_BADGE[comprobante.estado]}`} title={comprobante.motivoRechazo ?? undefined}>
                            {ESTADO_LABEL[comprobante.estado]}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="cell-action">
                        {comprobante && (
                          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-ghost"
                              title="Ver detalle"
                              aria-label="Ver detalle del comprobante"
                              onClick={() => setDetalle({ kind: 'comprobante', data: comprobante })}
                            >
                              <Icons.Eye s={15} />
                            </button>
                            {comprobante.estado === 'ACEPTADO' && (
                              <>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  title="Emitir nota de crédito/débito"
                                  aria-label="Emitir nota de crédito o débito"
                                  onClick={() => abrirNota(comprobante)}
                                >
                                  <Icons.Edit s={15} />
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  title="Imprimir comprobante"
                                  aria-label="Imprimir comprobante"
                                  onClick={() => abrirComprobanteParaImprimir({ comprobante, items: c.items ?? [] })}
                                >
                                  <Icons.Print s={15} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-h">
          <h3>Notas de crédito / débito</h3>
          <span className="spacer" />
          <span className="badge badge-info">{notasFiltradas.length}</span>
        </div>

        <div className="module-toolbar" style={{ padding: '0 16px 12px' }}>
          <fieldset className="filters" aria-label="Filtrar por tipo de nota">
            <button className={`chip ${filtroTipoNota === '' ? 'on' : ''}`} onClick={() => setFiltroTipoNota('')}>Todas</button>
            <button className={`chip ${filtroTipoNota === 'NOTA_CREDITO' ? 'on' : ''}`} onClick={() => setFiltroTipoNota('NOTA_CREDITO')}>Crédito</button>
            <button className={`chip ${filtroTipoNota === 'NOTA_DEBITO' ? 'on' : ''}`} onClick={() => setFiltroTipoNota('NOTA_DEBITO')}>Débito</button>
          </fieldset>
          <span className="spacer" />
          <fieldset className="filters" aria-label="Filtrar notas por estado SUNAT">
            <button className={`chip ${filtroEstadoNota === '' ? 'on' : ''}`} onClick={() => setFiltroEstadoNota('')}>Todas</button>
            <button className={`chip ${filtroEstadoNota === 'PENDIENTE' ? 'on' : ''}`} onClick={() => setFiltroEstadoNota('PENDIENTE')}>Sin resolver</button>
            <button className={`chip ${filtroEstadoNota === 'ACEPTADO' ? 'on' : ''}`} onClick={() => setFiltroEstadoNota('ACEPTADO')}>Aceptadas</button>
            <button className={`chip ${filtroEstadoNota === 'RECHAZADO' ? 'on' : ''}`} onClick={() => setFiltroEstadoNota('RECHAZADO')}>Rechazadas</button>
            <button className={`chip ${filtroEstadoNota === 'OBSERVADO' ? 'on' : ''}`} onClick={() => setFiltroEstadoNota('OBSERVADO')}>Observadas</button>
          </fieldset>
        </div>

        {!notasLoading && notasFiltradas.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Edit s={24} /></div>
            <h3>{notas.length === 0 ? 'Todavía no emitiste ninguna' : 'Nada con este filtro'}</h3>
            <p>{notas.length === 0 ? 'Aparecen acá las notas que emitas sobre un comprobante ya aceptado por SUNAT.' : 'Prueba ampliando el rango de fechas o cambiando el filtro.'}</p>
          </div>
        )}

        {notasFiltradas.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Nota</th>
                  <th className="col-mobile-hidden">Sobre</th>
                  <th className="col-mobile-hidden">Motivo</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Estado SUNAT</th>
                  <th className="cell-action"></th>
                </tr>
              </thead>
              <tbody>
                {notasFiltradas.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <strong>{n.tipo === 'NOTA_CREDITO' ? 'NC' : 'ND'} {n.serie}-{n.correlativo}</strong>
                    </td>
                    <td className="col-mobile-hidden muted">
                      {n.comprobanteAfectado
                        ? `${n.comprobanteAfectado.tipo === 'FACTURA' ? 'Factura' : 'Boleta'} ${n.comprobanteAfectado.serie}-${n.comprobanteAfectado.correlativo}`
                        : '—'}
                    </td>
                    <td className="col-mobile-hidden muted">{n.motivoDescripcion ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(Number(n.total))}</td>
                    <td>
                      <span className={`badge dot ${ESTADO_BADGE[n.estado]}`} title={n.motivoRechazo ?? undefined}>
                        {ESTADO_LABEL[n.estado]}
                      </span>
                    </td>
                    <td className="cell-action">
                      <button
                        className="btn btn-sm btn-ghost"
                        title="Ver detalle"
                        aria-label="Ver detalle de la nota"
                        onClick={() => setDetalle({ kind: 'nota', data: n })}
                      >
                        <Icons.Eye s={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {emitir && (
        <div className="modal-wrap">
          <Scrim onClose={cerrarModal} />
          <dialog open className="modal" ref={modalRef} aria-modal="true" aria-label="Emitir comprobante" style={{ position: 'relative', zIndex: 1 }}>
            <div className="panel-h" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 18 }}>Emitir comprobante · {fmt(Number(emitir.total))}</h3>
              <span className="spacer" />
              <button className="icon-btn" onClick={cerrarModal} aria-label="Cerrar"><Icons.Close s={17} /></button>
            </div>
            <div className="modal-scroll" style={{ padding: '18px 20px' }}>
              {empresaUnica && (
                <div className="hint" style={{ marginBottom: 12 }}>
                  Emisor: {empresaUnica.razonSocial} · RUC {empresaUnica.ruc}
                </div>
              )}

              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                {([{ v: 'BOLETA', l: 'Boleta' }, { v: 'FACTURA', l: 'Factura' }] as { v: TipoComprobante; l: string }[]).map((c) => (
                  <button key={c.v} type="button" className={`chip ${tipo === c.v ? 'on' : ''}`} onClick={() => setTipo(c.v)}>
                    {c.l}
                  </button>
                ))}
              </div>

              {tipo === 'FACTURA' ? (
                <>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="fact-ruc">RUC del cliente</label>
                    <div className="input">
                      <input
                        id="fact-ruc"
                        value={clienteRuc}
                        onChange={(e) => setClienteRuc(e.target.value.replace(/\D/g, ''))}
                        inputMode="numeric"
                        maxLength={11}
                        autoFocus
                        placeholder="11 dígitos"
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="fact-razon">Razón social</label>
                    <div className="input">
                      <input id="fact-razon" value={clienteRazonSocial} onChange={(e) => setClienteRazonSocial(e.target.value)} placeholder="Opcional" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="bol-dni">DNI del cliente</label>
                    <div className="input">
                      <input
                        id="bol-dni"
                        value={clienteDni}
                        onChange={(e) => setClienteDni(e.target.value.replace(/\D/g, ''))}
                        inputMode="numeric"
                        maxLength={8}
                        autoFocus
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="bol-nombre">Nombre del cliente</label>
                    <div className="input">
                      <input id="bol-nombre" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Opcional" />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, padding: '14px 20px' }}>
              <button className="btn btn-ghost" onClick={cerrarModal}>Cancelar</button>
              <span className="spacer" />
              <button
                className="btn btn-primary"
                disabled={emitiendo || !empresaUnica || (tipo === 'FACTURA' && clienteRuc.trim().length !== 11)}
                onClick={() => void confirmarEmision()}
              >
                {emitiendo ? <span className="spinner" /> : <Icons.Check s={15} />} Emitir {tipo === 'FACTURA' ? 'factura' : 'boleta'}
              </button>
            </div>
          </dialog>
        </div>
      )}

      {notaPara && (
        <div className="modal-wrap">
          <Scrim onClose={cerrarNotaModal} />
          <dialog open className="modal" ref={notaModalRef} aria-modal="true" aria-label="Emitir nota de crédito o débito" style={{ position: 'relative', zIndex: 1 }}>
            <div className="panel-h" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 18 }}>Nota sobre {notaPara.tipo === 'FACTURA' ? 'factura' : 'boleta'} {notaPara.serie}-{notaPara.correlativo}</h3>
              <span className="spacer" />
              <button className="icon-btn" onClick={cerrarNotaModal} aria-label="Cerrar"><Icons.Close s={17} /></button>
            </div>
            <div className="modal-scroll" style={{ padding: '18px 20px' }}>
              {errorNota && (
                <div className="banner err module-feedback" style={{ marginBottom: 12 }}>
                  <Icons.Alert s={16} />
                  <span>{errorNota}</span>
                </div>
              )}

              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                {([{ v: 'NOTA_CREDITO', l: 'Nota de crédito' }, { v: 'NOTA_DEBITO', l: 'Nota de débito' }] as { v: TipoNota; l: string }[]).map((t) => (
                  <button key={t.v} type="button" className={`chip ${tipoNota === t.v ? 'on' : ''}`} onClick={() => cambiarTipoNota(t.v)}>
                    {t.l}
                  </button>
                ))}
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="nota-motivo">Motivo (catálogo SUNAT)</label>
                <div className="input">
                  <select
                    id="nota-motivo"
                    value={motivoCodigo}
                    onChange={(e) => {
                      setMotivoCodigo(e.target.value);
                      const motivo = catalogoNota.find((m) => m.codigo === e.target.value);
                      if (motivo) setDescripcionNota(motivo.descripcion);
                    }}
                  >
                    {catalogoNota.map((m) => (
                      <option key={m.codigo} value={m.codigo}>{m.codigo} · {m.descripcion}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="nota-descripcion">Descripción del ítem</label>
                <div className="input">
                  <input id="nota-descripcion" value={descripcionNota} onChange={(e) => setDescripcionNota(e.target.value)} />
                </div>
              </div>

              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="nota-monto">Monto (con IGV incluido)</label>
                <div className="input">
                  <input
                    id="nota-monto"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={montoNota}
                    onChange={(e) => setMontoNota(e.target.value)}
                  />
                </div>
                <div className="hint" style={{ marginTop: 4 }}>Comprobante original: {fmt(Number(notaPara.total))}</div>
              </div>
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, padding: '14px 20px' }}>
              <button className="btn btn-ghost" onClick={cerrarNotaModal}>Cancelar</button>
              <span className="spacer" />
              <button className="btn btn-primary" disabled={emitiendoNota} onClick={() => void confirmarNota()}>
                {emitiendoNota ? <span className="spinner" /> : <Icons.Check s={15} />} Emitir {tipoNota === 'NOTA_CREDITO' ? 'nota de crédito' : 'nota de débito'}
              </button>
            </div>
          </dialog>
        </div>
      )}

      {detalle && (
        <div className="modal-wrap">
          <Scrim onClose={cerrarDetalle} />
          <dialog open className="modal" ref={detalleModalRef} aria-modal="true" aria-label="Detalle del comprobante" style={{ position: 'relative', zIndex: 1 }}>
            <div className="panel-h" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 18 }}>
                {detalle.kind === 'nota'
                  ? `${detalle.data.tipo === 'NOTA_CREDITO' ? 'Nota de crédito' : 'Nota de débito'} ${detalle.data.serie}-${detalle.data.correlativo}`
                  : detalle.kind === 'comprobante'
                    ? `${detalle.data.tipo === 'FACTURA' ? 'Factura' : 'Boleta'} ${detalle.data.serie}-${detalle.data.correlativo}`
                    : 'Comprobante de pago'}
              </h3>
              <span className="spacer" />
              <button className="icon-btn" onClick={cerrarDetalle} aria-label="Cerrar detalle"><Icons.Close s={17} /></button>
            </div>
            {detalle.kind === 'disponible' ? (
              <div className="modal-scroll" style={{ padding: '18px 20px', display: 'grid', gap: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Fecha</span>
                  <span>{fechaHora(detalle.data.fecha)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Mesero</span>
                  <span>{detalle.data.meseroNombre ?? 'Sin datos'}</span>
                </div>

                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                {detalle.data.items && detalle.data.items.length > 0 ? (
                  <table className="dt" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th style={{ textAlign: 'right' }}>Cant.</th>
                        <th style={{ textAlign: 'right' }}>P. unit.</th>
                        <th style={{ textAlign: 'right' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.data.items.map((it) => (
                        <tr key={it.productoId}>
                          <td>{it.nombre}</td>
                          <td style={{ textAlign: 'right' }}>{it.cantidad}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(it.precioUnitario)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(it.precioUnitario * it.cantidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="muted">Sin detalle de ítems.</span>
                )}

                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>Total</strong>
                  <strong>{fmt(Number(detalle.data.total))}</strong>
                </div>
              </div>
            ) : (
              <div className="modal-scroll" style={{ padding: '18px 20px', display: 'grid', gap: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Estado SUNAT</span>
                  <span className={`badge dot ${ESTADO_BADGE[detalle.data.estado]}`}>{ESTADO_LABEL[detalle.data.estado]}</span>
                </div>

                {detalle.data.motivoRechazo && (
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">Motivo del rechazo/observación</span>
                    <span>{detalle.data.motivoRechazo}</span>
                  </div>
                )}

                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Fecha</span>
                  <span>{fechaHora(detalle.data.createdAt)}</span>
                </div>

                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Cliente</span>
                  <span>
                    {detalle.data.clienteRazonSocial ?? detalle.data.clienteNombre ?? detalle.data.clienteRuc ?? detalle.data.clienteDni ?? 'Cliente varios'}
                  </span>
                </div>

                {detalle.kind === 'nota' && (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="muted">Documento que corrige</span>
                      <span>
                        {detalle.data.comprobanteAfectado
                          ? `${detalle.data.comprobanteAfectado.tipo === 'FACTURA' ? 'Factura' : 'Boleta'} ${detalle.data.comprobanteAfectado.serie}-${detalle.data.comprobanteAfectado.correlativo}`
                          : '—'}
                      </span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="muted">Motivo (catálogo SUNAT)</span>
                      <span>{detalle.data.motivoCodigo ? `${detalle.data.motivoCodigo} · ${detalle.data.motivoDescripcion}` : '—'}</span>
                    </div>
                  </>
                )}

                <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">Subtotal</span>
                  <span>{fmt(Number(detalle.data.subtotal))}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted">IGV</span>
                  <span>{fmt(Number(detalle.data.igv))}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>Total</strong>
                  <strong>{fmt(Number(detalle.data.total))}</strong>
                </div>
              </div>
            )}
            <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, padding: '14px 20px' }}>
              <button className="btn btn-ghost" onClick={cerrarDetalle}>Cancelar</button>
              <span className="spacer" />
              {detalle.kind === 'disponible' && (
                <button
                  className="btn btn-primary"
                  disabled={!online || !puedeEmitir}
                  onClick={() => {
                    const c = detalle.data;
                    cerrarDetalle();
                    abrirEmision(c);
                  }}
                >
                  <Icons.Check s={15} /> Emitir
                </button>
              )}
              {detalle.kind === 'comprobante' && detalle.data.estado === 'ACEPTADO' && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const c = detalle.data;
                    cerrarDetalle();
                    abrirNota(c);
                  }}
                >
                  <Icons.Edit s={15} /> Emitir nota
                </button>
              )}
            </div>
          </dialog>
        </div>
      )}

      {configurarSunat && (
        <ConfigurarEmpresaModal
          guardando={configurandoEmpresa}
          error={errorEmpresa}
          sedesDisponibles={sedesLibresParaCrear}
          onClose={() => { setConfigurarSunat(false); clearFeedbackEmpresa(); }}
          onGuardar={async (payload) => {
            const empresa = await crearEmpresa(payload);
            toast({ title: 'Empresa configurada', msg: `${empresa.razonSocial} (RUC ${empresa.ruc}) ya puede emitir comprobantes.`, icon: 'Check', kind: 'ok' });
            setConfigurarSunat(false);
            clearFeedbackEmpresa();
            return empresa;
          }}
        />
      )}

      {editarEmpresa && (
        <EditarEmpresaModal
          empresa={editarEmpresa}
          guardando={actualizandoEmpresa}
          error={errorActualizarEmpresa}
          sedesDisponibles={sedesDisponiblesParaEditar}
          onClose={() => { setEditarEmpresa(null); clearFeedbackActualizarEmpresa(); }}
          onGuardar={async (payload) => {
            const empresa = await actualizarEmpresa(editarEmpresa.id, payload);
            toast({ title: 'Empresa actualizada', msg: `${empresa.razonSocial} (RUC ${empresa.ruc}) se guardó correctamente.`, icon: 'Check', kind: 'ok' });
            setEditarEmpresa(null);
            clearFeedbackActualizarEmpresa();
            return empresa;
          }}
        />
      )}
    </div>
  );
}
