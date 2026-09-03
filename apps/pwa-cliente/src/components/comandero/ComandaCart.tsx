/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// components/comandero/ComandaCart.tsx — Panel de la comanda (líneas + totales + envío).
// Extraído del Comandero en T-22; consume el estado del hook useComanda.

import { Icons } from '../ui/icons';
import { fmt } from '../../utils/format';
import { nombreProductoConTamano } from '../../utils/tamanos';
import { NOTAS_RAPIDAS } from '../../data/notas-cocina.const';
import { appendNotaRapida } from '../../domain/comanda';
import type { useComanda } from '../../hooks/useComanda';

interface ComandaCartProps {
  cmd: ReturnType<typeof useComanda>;
  modoAgregar: boolean;
}

const HINT_CTX_INCOMPLETO: Record<string, string> = {
  SALON: 'Selecciona una mesa',
  DELIVERY: 'Completa cliente y dirección',
  LLEVAR: 'Ingresa el nombre del cliente',
};

export function ComandaCart({ cmd, modoAgregar }: Readonly<ComandaCartProps>) {
  return (
    <aside className="cmd-cart">
      <div className="cmd-cart-h">
        <b>{modoAgregar ? 'Nueva ronda' : 'Comanda'}</b>
        {cmd.totalItems > 0 && <span className="badge badge-accent">{cmd.totalItems} ítems</span>}
        <span className="spacer" />
        {cmd.lines.length > 0 && <button className="btn btn-ghost btn-sm" onClick={cmd.vaciar}>Vaciar</button>}
      </div>

      <div className="cmd-lines">
        {cmd.lines.length === 0 ? (
          <div className="cmd-empty">
            <Icons.Pedidos s={28} />
            <b>{modoAgregar ? 'Agrega una nueva ronda' : 'Comanda vacía'}</b>
            <p>Toca un plato para agregarlo a la comanda.</p>
          </div>
        ) : cmd.lines.map((l) => (
          <div className="cmd-line" key={l.producto.id}>
            <div className="cmd-line-top">
              <div className="cmd-line-main">
                <div className="cmd-line-name">{nombreProductoConTamano(l.producto)}</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 1 }}>{fmt(l.producto.precio)} c/u</div>
              </div>
              <span className="cmd-line-price mono">{fmt(l.producto.precio * l.cantidad)}</span>
            </div>
            <div className="cmd-line-ctrl">
              <div className="stepper sm">
                <button onClick={() => cmd.incLine(l.producto.id, -1)}><Icons.Minus s={13} /></button>
                <span className="qv">{l.cantidad}</span>
                <button onClick={() => cmd.incLine(l.producto.id, 1)}><Icons.Plus s={13} /></button>
              </div>
              <button className={`cmd-note-btn ${l.notas ? 'has' : ''}`} onClick={() => cmd.toggleNote(l.producto.id)} title="Nota"><Icons.Note s={14} /> Nota</button>
              <button className="cmd-del" onClick={() => cmd.delLine(l.producto.id)} title="Quitar"><Icons.Close s={14} /></button>
            </div>
            {(l.noteOpen || l.notas) && (
              <div className="cmd-note-row">
                <div className="input" style={{ height: 32 }}>
                  <input value={l.notas} autoFocus={l.noteOpen} onChange={(e) => cmd.setNota(l.producto.id, e.target.value)} placeholder="Nota para cocina (ej. sin cebolla)" />
                </div>
                <div className="cmd-note-chips">
                  {NOTAS_RAPIDAS.slice(0, 4).map((n) => (
                    <button key={n} className="chip" onClick={() => cmd.setNota(l.producto.id, appendNotaRapida(l.notas, n))}>{n}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="cmd-cart-foot">
        <div className="kv"><span className="k">Subtotal</span><span className="v mono">{fmt(cmd.subtotal)}</span></div>
        <div className="kv"><span className="k">IGV (18%)</span><span className="v mono">{fmt(cmd.igv)}</span></div>
        <div className="kv total"><span className="k">Total</span><span className="v mono">{fmt(cmd.subtotal)}</span></div>
        <button className="btn btn-primary btn-block" style={{ height: 46, fontSize: 15 }} disabled={!cmd.puedeEnviar} onClick={cmd.enviar}>
          {cmd.saving ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icons.Cocina s={17} />}
          {modoAgregar ? ' Agregar a la cuenta' : ' Enviar a cocina'}{cmd.totalItems ? ` · ${cmd.totalItems}` : ''}
        </button>
        {!cmd.ctxValido && cmd.lines.length > 0 && (
          <div className="hint" style={{ textAlign: 'center', color: 'var(--danger-text)', marginTop: 8 }}>
            {HINT_CTX_INCOMPLETO[cmd.canal] ?? HINT_CTX_INCOMPLETO['LLEVAR']}
          </div>
        )}
      </div>
    </aside>
  );
}
