// screens/caja/HistorialCajaScreen.tsx — Historial de turnos/cierres de caja (solo ADMIN/SISTEMA).
// Lista de turnos pasados + detalle de un cierre (arqueo, resumen por método).

import { useMemo, useRef, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { useToast } from '../../components/ui/ToastProvider';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { fmt } from '../../utils/format';
import { abrirTicketParaImprimir } from '../../utils/ticketPrint';
import { abrirZTicketParaImprimir } from '../../utils/zTicketPrint';
import { METODO_META, METODOS_ORDEN, estadoCuadre } from './cajaMeta';
import { useHistorialCajaQuery, useTurnoDetalleQuery } from '../../hooks/queries/useHistorialCajaQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import * as cuentasApi from '../../api/cuentas.api';
import { mapCuenta } from '../../mappers/cuenta.mapper';
import type { TurnoCajaEstado, TransaccionDto, CajaResumenDto } from '../../types/caja.types';

function fechaHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function HistorialCajaScreen() {
  const [estado, setEstado] = useState<TurnoCajaEstado | ''>('CERRADA');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [imprimiendoId, setImprimiendoId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const { toast } = useToast();
  const { sede } = useSedeActualQuery();

  const { turnos, nextCursor, loading, loadingMore, error, fetch, fetchMore } = useHistorialCajaQuery({
    estado: estado || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  });
  const { detalle, loading: loadingDetalle } = useTurnoDetalleQuery(turnoId);
  const cerrarModal = () => setTurnoId(null);
  useFocusTrap(modalRef, { active: !!turnoId, onClose: cerrarModal });

  // La Transacción no guarda los ítems (viven en la Cuenta, servicio-cuentas)
  // — para reimprimir un cobro ya cerrado hay que ir a buscarlos. La propina
  // de un cobro pasado no queda registrada aparte en la Transaccion, así que
  // el total reimpreso no la desglosa por separado (ya está incluida en el
  // monto cobrado en su momento).
  const verImprimirTicket = async (v: TransaccionDto) => {
    setImprimiendoId(v.id);
    try {
      const cuentaDto = await cuentasApi.getById(v.cuentaId);
      const cuenta = mapCuenta(cuentaDto);
      const items = cuenta.pedidos.flatMap((p) =>
        p.items.map((it) => ({ productoId: it.productoId, nombre: it.nombre, cantidad: it.cantidad, precioUnitario: it.precioUnitario })),
      );
      abrirTicketParaImprimir({
        ticket: {
          id: v.id,
          cuentaId: v.cuentaId,
          mesaId: v.mesaId ?? cuenta.mesaId,
          items,
          subtotal: v.monto + v.descuento,
          descuento: v.descuento,
          total: v.monto,
          fecha: v.createdAt,
        },
        transaccion: {
          id: v.id,
          cuentaId: v.cuentaId,
          monto: v.monto,
          descuento: v.descuento,
          metodo: v.metodo,
          cajeroNombre: v.cajeroNombre,
          tipoComprobante: v.tipoComprobante === 'FACTURA' ? 'FACTURA' : 'BOLETA',
          clienteDocumento: v.clienteDocumento,
          createdAt: v.createdAt,
        },
        mesaNumero: v.mesaNumero ?? undefined,
        propina: 0,
        sede,
      });
    } catch {
      toast({ title: 'No se pudo abrir el comprobante', msg: 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    } finally {
      setImprimiendoId(null);
    }
  };

  // Reimprime el cierre Z de un turno ya cerrado, mismo formato que el botón
  // "Imprimir" del cierre en curso (ver CierreDrawer.tsx) — requiere el
  // arqueo del turno (solo existe una vez cerrado).
  const imprimirCierreZ = (d: CajaResumenDto) => {
    if (!d.arqueo) return;
    abrirZTicketParaImprimir({
      k: { porMetodo: d.porMetodo, totalVentas: d.totalVentas, totalEgresos: d.totalEgresos, propinas: d.propinas, comprobantes: d.comprobantes },
      esperado: d.arqueo.efectivoEsperado,
      contado: d.arqueo.efectivoContado,
      descuadre: d.arqueo.diferencia,
      estado: estadoCuadre(d.arqueo.diferencia),
      cajeroNombre: d.turno?.cajeroNombre ?? 'Cajero',
      fecha: d.turno?.cerradoAt ?? new Date().toISOString(),
      sede,
    });
  };

  const kpis = useMemo(() => {
    const cerradas = turnos.filter((t) => t.estado === 'CERRADA').length;
    return { total: turnos.length, cerradas, abiertas: turnos.length - cerradas };
  }, [turnos]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Historial de caja</h1>
          <div className="sub">Turnos y cierres pasados, con arqueo a detalle</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => void fetch()} title="Refrescar" aria-label="Refrescar historial">
          <Icons.Refresh s={16} />
        </button>
      </div>

      {error && (
        <div className="banner err module-feedback" role="alert">
          <Icons.Alert s={17} />
          <span>{error}</span>
        </div>
      )}

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Caja" tint="accent" label="En esta vista" value={kpis.total} />
        <StatKpi icon="Lock" tint="ok" label="Cerradas" value={kpis.cerradas} />
        <StatKpi icon="Clock" tint="warn" label="Abiertas" value={kpis.abiertas} />
      </div>

      <div className="module-toolbar" style={{ marginBottom: 16 }}>
        <fieldset className="filters" aria-label="Filtrar por estado">
          <button className={`chip ${estado === '' ? 'on' : ''}`} onClick={() => setEstado('')}>Todos</button>
          <button className={`chip ${estado === 'CERRADA' ? 'on' : ''}`} onClick={() => setEstado('CERRADA')}>Cerradas</button>
          <button className={`chip ${estado === 'ABIERTA' ? 'on' : ''}`} onClick={() => setEstado('ABIERTA')}>Abiertas</button>
        </fieldset>
        <span className="spacer" />
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="hist-desde">Desde</label>
          <div className="input"><input id="hist-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="hist-hasta">Hasta</label>
          <div className="input"><input id="hist-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-h">
          <h3>Turnos</h3>
          <span className="spacer" />
          <span className="badge badge-info">{turnos.length}</span>
        </div>

        {loading && turnos.length === 0 && (
          <div className="table-wrap table-wrap-flat">
            {[1, 2, 3].map((row) => (
              <div key={row} className="skeleton-row row" style={{ gap: 12 }}>
                <div className="skel" style={{ width: '60%', height: 13 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && turnos.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Caja s={24} /></div>
            <h3>Sin turnos</h3>
            <p>No hay turnos que coincidan con el filtro seleccionado.</p>
          </div>
        )}

        {!loading && turnos.length > 0 && (
          <>
            <div className="table-wrap table-wrap-flat">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Caja</th>
                    <th>Cajero</th>
                    <th className="col-mobile-hidden">Abierto</th>
                    <th className="col-mobile-hidden">Cerrado</th>
                    <th>Estado</th>
                    <th className="cell-action"></th>
                  </tr>
                </thead>
                <tbody>
                  {turnos.map((turno) => (
                    <tr key={turno.id} style={{ cursor: 'pointer' }} onClick={() => setTurnoId(turno.id)}>
                      <td><strong>{turno.cajaNombre}</strong></td>
                      <td>{turno.cajeroNombre ?? '—'}</td>
                      <td className="col-mobile-hidden muted">{fechaHora(turno.abiertoAt)}</td>
                      <td className="col-mobile-hidden muted">{fechaHora(turno.cerradoAt)}</td>
                      <td><span className={`badge dot ${turno.estado === 'CERRADA' ? 'badge-muted' : 'badge-ok'}`}>{turno.estado}</span></td>
                      <td className="cell-action"><span className="muted" style={{ fontSize: 12 }}>Ver detalle</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextCursor && (
              <div className="row center" style={{ padding: '12px' }}>
                <button className="btn btn-ghost btn-sm" disabled={loadingMore} onClick={() => void fetchMore()}>
                  {loadingMore ? <span className="spinner" /> : null}
                  Cargar más
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {turnoId && (
        <div className="modal-wrap">
          <Scrim onClose={cerrarModal} />
          <dialog
            open
            className="modal xwide"
            ref={modalRef}
            aria-modal="true"
            aria-label="Detalle del turno"
            style={{ position: 'relative', zIndex: 1 }}
          >
            <div className="panel-h" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 18 }}>{detalle?.turno?.cajaNombre ?? 'Detalle del turno'}</h3>
              <span className="spacer" />
              {detalle?.arqueo && (
                <button className="btn btn-ghost btn-sm" onClick={() => imprimirCierreZ(detalle)} aria-label="Imprimir cierre Z de este turno">
                  <Icons.Print s={15} /> Imprimir cierre Z
                </button>
              )}
              <button className="icon-btn" onClick={cerrarModal} aria-label="Cerrar detalle del turno"><Icons.Close s={17} /></button>
            </div>
            <div className="modal-scroll" style={{ padding: '18px 20px' }}>
              {loadingDetalle && <div className="skel" style={{ height: 120 }} />}
              {!loadingDetalle && detalle && (
                <>
                  <div className="row wrap" style={{ gap: 16, marginBottom: 16 }}>
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>Cajero</div>
                      <strong>{detalle.turno?.cajeroNombre ?? '—'}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>Abierto</div>
                      <strong>{fechaHora(detalle.turno?.abiertoAt ?? null)}</strong>
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 12 }}>Cerrado</div>
                      <strong>{fechaHora(detalle.turno?.cerradoAt ?? null)}</strong>
                    </div>
                  </div>

                  <div className="grid-stats" style={{ marginBottom: 16 }}>
                    <StatKpi icon="Trend" tint="accent" label="Ventas del turno" value={fmt(detalle.totalVentas)} />
                    <StatKpi icon="Coins" tint="ok" label="Propinas" value={fmt(detalle.propinas)} />
                    <StatKpi icon="Cash" tint="info" label="Efectivo esperado" value={fmt(detalle.efectivoEsperado)} />
                    {/* IGV incluido en el precio (18%), no un cargo aparte — mismo criterio que la boleta interna y el reporte Z. */}
                    <StatKpi icon="Receipt" tint="warn" label="IGV del turno" value={fmt(detalle.totalVentas - detalle.totalVentas / 1.18)} />
                  </div>

                  {detalle.arqueo && (
                    <div className="panel" style={{ marginBottom: 16 }}>
                      <div className="panel-h"><h3>Arqueo</h3></div>
                      <div className="row wrap" style={{ gap: 16, padding: '0 16px 16px' }}>
                        <div><div className="muted" style={{ fontSize: 12 }}>Esperado</div><strong>{fmt(detalle.arqueo.efectivoEsperado)}</strong></div>
                        <div><div className="muted" style={{ fontSize: 12 }}>Contado</div><strong>{fmt(detalle.arqueo.efectivoContado)}</strong></div>
                        <div>
                          <div className="muted" style={{ fontSize: 12 }}>Diferencia</div>
                          <strong style={{ color: detalle.arqueo.diferencia === 0 ? undefined : detalle.arqueo.diferencia > 0 ? 'var(--warn-text)' : 'var(--danger-text)' }}>
                            {detalle.arqueo.diferencia > 0 ? '+' : ''}{fmt(detalle.arqueo.diferencia)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="panel" style={{ marginBottom: 16 }}>
                    <div className="panel-h"><h3>Ventas por método</h3></div>
                    <div className="table-wrap table-wrap-flat">
                      <table className="dt">
                        <thead><tr><th>Método</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                        <tbody>
                          {METODOS_ORDEN.map((metodo) => (
                            <tr key={metodo}>
                              <td>{METODO_META[metodo].label}</td>
                              <td style={{ textAlign: 'right' }}>{fmt(detalle.porMetodo[metodo] ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-h"><h3>Ventas del turno (auditoría)</h3></div>
                    {(!detalle.ventasDetalle || detalle.ventasDetalle.length === 0) ? (
                      <div className="muted" style={{ padding: '0 16px 16px', fontSize: 13 }}>Sin ventas registradas en este turno.</div>
                    ) : (
                      <div className="table-wrap table-wrap-flat">
                        <table className="dt">
                          <thead>
                            <tr>
                              <th>Hora</th>
                              <th className="col-mobile-hidden">Mesa</th>
                              <th>Método</th>
                              <th style={{ textAlign: 'right' }}>Monto</th>
                              <th>Mesero</th>
                              <th>Cobrado por</th>
                              <th className="cell-action"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {detalle.ventasDetalle.map((v) => (
                              <tr key={v.id}>
                                <td className="muted">{fechaHora(v.createdAt)}</td>
                                <td className="col-mobile-hidden muted">
                                  {v.mesaNumero ? `Mesa ${v.mesaNumero}` : (v.mesaId ?? '—')}
                                  {v.mesaUnidaCon && <span className="pill-soft" style={{ marginLeft: 6, fontSize: 11 }}>unida con Mesa {v.mesaUnidaCon}</span>}
                                </td>
                                <td>{METODO_META[v.metodo]?.label ?? v.metodo}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(v.monto)}</td>
                                <td>{v.meseroNombre ?? <span className="muted">Sin datos</span>}</td>
                                <td>{v.cajeroNombre ?? <span className="muted">Sin datos</span>}</td>
                                <td className="cell-action">
                                  <button
                                    className="btn btn-sm btn-ghost"
                                    disabled={imprimiendoId === v.id}
                                    onClick={() => void verImprimirTicket(v)}
                                    aria-label={`Imprimir comprobante de ${fechaHora(v.createdAt)}`}
                                  >
                                    {imprimiendoId === v.id ? <span className="spinner" /> : <Icons.Print s={14} />}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
}
