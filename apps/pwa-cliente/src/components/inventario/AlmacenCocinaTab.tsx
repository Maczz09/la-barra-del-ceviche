/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/AlmacenCocinaTab.tsx — T-50. El almacén interno: lo que
// se usa para cocinar (arroz, aceite, gas), que NO se vende.
//
// Es un catálogo aparte del de venta, con sus propias categorías y su propio
// stock. Los productos de venta no cruzan acá: el listado pide `soloCocina`, o
// sea insumos sin puente a un producto (`productoId` nulo). Lo que se revende
// tal cual —cervezas, gaseosas— se administra en «Productos de venta».
//
// El dato vive en servicio-compras porque `Insumo` ya tenía unidad, stock
// fraccionario, mínimo y costo; duplicarlo en otra base habría creado dos
// dueños del mismo número físico.

import { useMemo, useState } from 'react';
import { Icons } from '../ui/icons';
import { StatKpi } from '../ui/StatKpi';
import { useInsumosQuery } from '../../hooks/queries/useComprasQuery';
import { useCategoriasInsumoQuery } from '../../hooks/queries/useCategoriasInsumoQuery';
import { useMovimientosInsumoMutation } from '../../hooks/queries/useMovimientosInsumoQuery';
import { useToast } from '../ui/ToastProvider';
import { formatMoney } from '../../mappers/compras.mapper';
import { MovimientoInsumoModal } from './MovimientoInsumoModal';
import { KardexInsumoDrawer } from './KardexInsumoDrawer';
import { ConteoFisicoModal } from './ConteoFisicoModal';
import { InsumoAlmacenDrawer } from './InsumoAlmacenDrawer';
import { CategoriasAlmacenModal } from './CategoriasAlmacenModal';
import { MovimientoInsumoTipo } from '../../types/compras.types';
import type {
  ActualizarInsumoPayload,
  CrearInsumoPayload,
  InsumoVM,
  MovimientoInsumoTipoManual,
} from '../../types/compras.types';

interface Props {
  online: boolean;
  /** Cocina registra sus salidas pero no administra el catálogo ni cierra el
   *  cuadre: aceptar una diferencia contra el sistema es de administración. */
  puedeAdministrar: boolean;
  sedeNombre?: string | null;
  usuarioNombre?: string | null;
}

/** `undefined` = drawer cerrado · `null` = alta nueva · InsumoVM = edición. */
type EdicionInsumo = InsumoVM | null | undefined;

export function AlmacenCocinaTab({ online, puedeAdministrar, sedeNombre, usuarioNombre }: Readonly<Props>) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);

  const { insumos, loading, error, crear, actualizar, eliminar, saving: savingInsumo } = useInsumosQuery({
    soloCocina: true,
    categoriaId: categoriaId || undefined,
    limit: 100,
  });
  const categoriasQuery = useCategoriasInsumoQuery();
  const { registrarMovimiento, registrarConteo, saving: savingMovimiento } = useMovimientosInsumoMutation();

  const [movimientoInsumo, setMovimientoInsumo] = useState<InsumoVM | null>(null);
  const [tipoInicial, setTipoInicial] = useState<MovimientoInsumoTipoManual | undefined>(undefined);
  const [kardexInsumo, setKardexInsumo] = useState<InsumoVM | null>(null);
  const [edicionInsumo, setEdicionInsumo] = useState<EdicionInsumo>(undefined);
  const [conteoAbierto, setConteoAbierto] = useState(false);
  const [categoriasAbierto, setCategoriasAbierto] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const saving = savingInsumo || savingMovimiento;

  const visibles = useMemo(() => {
    const termino = search.trim().toLowerCase();
    return insumos.filter(
      (i) => (!termino || i.nombre.toLowerCase().includes(termino)) && (!soloBajoMinimo || i.bajoMinimo),
    );
  }, [insumos, search, soloBajoMinimo]);

  const kpis = useMemo(
    () => ({
      total: insumos.length,
      bajoMinimo: insumos.filter((i) => i.bajoMinimo).length,
      agotados: insumos.filter((i) => i.stockActual <= 0).length,
      valor: insumos.reduce((suma, i) => suma + i.stockActual * i.costoUnitario, 0),
    }),
    [insumos],
  );

  const avisarError = (titulo: string) => (err: unknown) =>
    toast({ title: titulo, msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });

  const abrirMovimiento = (insumo: InsumoVM, tipo?: MovimientoInsumoTipoManual) => {
    setTipoInicial(tipo);
    setMovimientoInsumo(insumo);
  };

  const guardarMovimiento = async (tipo: MovimientoInsumoTipoManual, cantidad: number, motivo: string) => {
    if (!movimientoInsumo) return;
    try {
      await registrarMovimiento(movimientoInsumo.id, { tipo, cantidad, motivo: motivo || undefined });
      toast({ title: 'Movimiento registrado', msg: `${movimientoInsumo.nombre} · ${cantidad} ${movimientoInsumo.unidad}`, icon: 'Check' });
      setMovimientoInsumo(null);
    } catch (err) {
      avisarError('No se pudo registrar el movimiento')(err);
    }
  };

  const guardarInsumo = async (payload: CrearInsumoPayload) => {
    try {
      const { insumo } = await crear(payload);
      toast({ title: 'Insumo creado', msg: insumo.nombre, icon: 'Check' });
      setEdicionInsumo(undefined);
    } catch (err) {
      avisarError('No se pudo crear el insumo')(err);
    }
  };

  const editarInsumo = async (id: string, payload: ActualizarInsumoPayload) => {
    try {
      await actualizar(id, payload);
      toast({ title: 'Insumo actualizado', msg: '', icon: 'Check' });
      setEdicionInsumo(undefined);
    } catch (err) {
      avisarError('No se pudo actualizar el insumo')(err);
    }
  };

  const borrarInsumo = async (id: string) => {
    try {
      await eliminar(id);
      toast({ title: 'Insumo eliminado', msg: '', icon: 'Check' });
      setEdicionInsumo(undefined);
    } catch (err) {
      avisarError('No se pudo eliminar el insumo')(err);
    }
  };

  const guardarConteo = async (items: { insumoId: string; stockContado: number }[], observacion: string) => {
    try {
      const { resultado } = await registrarConteo({ items, observacion: observacion || undefined });
      toast({
        title: resultado.ajustados === 0 ? 'Todo cuadró' : `${resultado.ajustados} insumos ajustados`,
        msg: resultado.ajustados === 0
          ? `${resultado.insumosContados} insumos contados`
          : `Diferencia valorizada: ${formatMoney(resultado.valorDiferenciaTotal)}`,
        icon: resultado.ajustados === 0 ? 'Check' : 'Alert',
        kind: resultado.ajustados === 0 ? undefined : 'err',
      });
      setConteoAbierto(false);
    } catch (err) {
      avisarError('No se pudo registrar el conteo')(err);
    }
  };

  const descargarPdf = async () => {
    setGenerandoPdf(true);
    try {
      const alcance = [
        categoriaId ? categoriasQuery.categorias.find((c) => c.id === categoriaId)?.nombre : null,
        soloBajoMinimo ? 'Solo bajo mínimo' : null,
      ].filter(Boolean);
      // jspdf/jspdf-autotable no resuelven tipos de forma consistente en el
      // import() dinámico bajo este resolver de eslint (tsc sí los resuelve bien).
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
      const { exportarAlmacenPdf } = await import('../../utils/inventarioPdf');
      await exportarAlmacenPdf(visibles, {
        sedeNombre,
        usuarioNombre,
        filtroLabel: alcance.length > 0 ? alcance.join(' · ') : 'Todo el almacén',
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
    } catch (err) {
      avisarError('No se pudo generar el PDF')(err);
    } finally {
      setGenerandoPdf(false);
    }
  };

  return (
    <div>
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Chef" tint="accent" label="Insumos" value={kpis.total} />
        <StatKpi icon="Alert" tint="warn" label="Bajo mínimo" value={kpis.bajoMinimo} />
        <StatKpi icon="Alert" tint="danger" label="Agotados" value={kpis.agotados} />
        <StatKpi icon="Coins" tint="ok" label="Valor del almacén" value={formatMoney(kpis.valor)} />
      </div>

      <div className="module-toolbar">
        <div className="search-box">
          <Icons.Search s={16} />
          <input
            type="search"
            placeholder="Buscar insumo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar insumos del almacén"
          />
        </div>
        <div className="input toolbar-input">
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            aria-label="Filtrar por categoría de almacén"
          >
            <option value="">Todas las categorías</option>
            {categoriasQuery.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <span className="spacer" />
        <button
          className={`btn btn-sm ${soloBajoMinimo ? 'btn-soft' : 'btn-ghost'}`}
          aria-pressed={soloBajoMinimo}
          onClick={() => setSoloBajoMinimo((v) => !v)}
        >
          <Icons.Alert s={15} /> Bajo mínimo
        </button>
        <button className="btn btn-ghost btn-sm" disabled={generandoPdf || visibles.length === 0} onClick={descargarPdf}>
          {generandoPdf ? <span className="spinner" /> : <Icons.Download s={15} />} PDF
        </button>
        {puedeAdministrar && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setCategoriasAbierto(true)}>
              <Icons.Tag s={15} /> Categorías
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!online || insumos.length === 0}
              onClick={() => setConteoAbierto(true)}
            >
              <Icons.Check s={15} /> Conteo físico
            </button>
            <button className="btn btn-primary btn-sm" disabled={!online} onClick={() => setEdicionInsumo(null)}>
              <Icons.Plus s={15} /> Nuevo insumo
            </button>
          </>
        )}
      </div>

      {(error ?? categoriasQuery.error) && (
        <div className="banner err module-feedback" role="alert">
          <Icons.Alert s={17} />
          <span>{error ?? categoriasQuery.error}</span>
        </div>
      )}

      <section className="panel">
        <div className="panel-h">
          <h3>Almacén de cocina</h3>
          <span className="spacer" />
          <span className="badge badge-info">{visibles.length} insumos</span>
        </div>

        {loading && <div className="muted" style={{ padding: 16 }}>Cargando almacén…</div>}

        {!loading && visibles.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Chef s={24} /></div>
            <h3>Almacén vacío</h3>
            <p>
              {insumos.length === 0
                ? 'Acá va lo que se usa en cocina y no se vende: arroz, aceite, gas, limpieza. Los productos de venta se administran en la otra pestaña.'
                : 'Ningún insumo coincide con el filtro.'}
            </p>
            {insumos.length === 0 && puedeAdministrar && (
              <button className="btn btn-primary" disabled={!online} onClick={() => setEdicionInsumo(null)}>
                <Icons.Plus s={15} /> Crear el primer insumo
              </button>
            )}
          </div>
        )}

        {!loading && visibles.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="col-mobile-hidden">Categoría</th>
                  <th className="num">Stock</th>
                  <th className="num col-mobile-hidden">Mínimo</th>
                  <th className="num col-mobile-hidden">Valor</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((insumo) => (
                  <tr key={insumo.id} className={insumo.bajoMinimo ? 'row-low' : ''}>
                    <td>
                      <strong>{insumo.nombre}</strong>
                      <div className="muted">
                        {insumo.unidad}{insumo.proveedorNombre ? ` · ${insumo.proveedorNombre}` : ''}
                      </div>
                    </td>
                    <td className="col-mobile-hidden">
                      {insumo.categoriaNombre
                        ? <span className="badge badge-muted">{insumo.categoriaNombre}</span>
                        : <span className="muted">Sin categoría</span>}
                    </td>
                    <td className="num">
                      <span className={`badge ${insumo.stockActual <= 0 ? 'badge-danger' : insumo.bajoMinimo ? 'badge-warn' : 'badge-ok'}`}>
                        {insumo.stockActual} {insumo.unidad}
                      </span>
                    </td>
                    <td className="num mono col-mobile-hidden">{insumo.stockMinimo}</td>
                    <td className="num mono col-mobile-hidden">{formatMoney(insumo.stockActual * insumo.costoUnitario)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-soft"
                          disabled={!online || saving}
                          onClick={() => abrirMovimiento(insumo, MovimientoInsumoTipo.EntradaManual)}
                          aria-label={`Agregar stock a ${insumo.nombre}`}
                        >
                          <Icons.Plus s={14} /> Stock
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          disabled={!online || saving}
                          onClick={() => abrirMovimiento(insumo)}
                          aria-label={`Registrar movimiento de ${insumo.nombre}`}
                        >
                          Movimiento
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => setKardexInsumo(insumo)}
                          aria-label={`Ver kardex de ${insumo.nombre}`}
                        >
                          Kardex
                        </button>
                        {puedeAdministrar && (
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={!online || saving}
                            onClick={() => setEdicionInsumo(insumo)}
                            aria-label={`Editar ${insumo.nombre}`}
                          >
                            <Icons.Edit s={14} /> Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {movimientoInsumo && (
        <MovimientoInsumoModal
          insumo={movimientoInsumo}
          saving={savingMovimiento}
          tipoInicial={tipoInicial}
          onClose={() => setMovimientoInsumo(null)}
          onSave={guardarMovimiento}
        />
      )}

      {kardexInsumo && <KardexInsumoDrawer insumo={kardexInsumo} onClose={() => setKardexInsumo(null)} />}

      {edicionInsumo !== undefined && (
        <InsumoAlmacenDrawer
          insumo={edicionInsumo}
          categorias={categoriasQuery.categorias}
          saving={savingInsumo}
          online={online}
          onClose={() => setEdicionInsumo(undefined)}
          onCrear={guardarInsumo}
          onActualizar={editarInsumo}
          onEliminar={borrarInsumo}
        />
      )}

      {categoriasAbierto && (
        <CategoriasAlmacenModal
          categorias={categoriasQuery.categorias}
          loading={categoriasQuery.loading}
          saving={categoriasQuery.saving}
          online={online}
          onClose={() => setCategoriasAbierto(false)}
          onCrear={(nombre, descripcion) => categoriasQuery.crear({ nombre, descripcion })}
          onRenombrar={(id, nombre) => categoriasQuery.actualizar(id, { nombre })}
          onEliminar={(id) => categoriasQuery.eliminar(id)}
        />
      )}

      {conteoAbierto && (
        <ConteoFisicoModal
          insumos={insumos}
          saving={savingMovimiento}
          onClose={() => setConteoAbierto(false)}
          onSave={guardarConteo}
        />
      )}
    </div>
  );
}
