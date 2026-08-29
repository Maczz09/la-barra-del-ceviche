// screens/facturacion/ConfigurarEmpresaModal.tsx — Alta de la empresa emisora
// (RUC + credenciales SUNAT) desde la UI, en vez de sembrarla a mano con
// prisma studio + secretos de infraestructura (ver CONTEXTO.md del servicio).
// El certificado y las claves se cifran en el servidor antes de guardarse
// (CredencialesCryptoService) — acá solo se arma el multipart y se muestran
// los errores que el backend ya valida (RUC duplicado, .p12/contraseña
// inválidos, etc.).

import { useRef, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { CrearEmpresaPayload } from '../../types/facturacion.types';
import type { SedeDto } from '../../types/sede.types';

interface Props {
  guardando: boolean;
  error: string | null;
  // Solo sedes que todavía no tienen otra empresa enlazada — una sede no
  // puede emitir con dos empresas distintas (ver AppService.crearEmpresa).
  sedesDisponibles: SedeDto[];
  onGuardar: (payload: CrearEmpresaPayload) => Promise<unknown>;
  onClose: () => void;
}

const initialForm = {
  ruc: '',
  razonSocial: '',
  sedeId: '',
  nombreComercial: '',
  direccion: '',
  ubigeo: '',
  solUsuario: '',
  solClave: '',
  certificadoPass: '',
};

export function ConfigurarEmpresaModal({ guardando, error, sedesDisponibles, onGuardar, onClose }: Readonly<Props>) {
  const [form, setForm] = useState(initialForm);
  const [certificado, setCertificado] = useState<File | null>(null);
  const [validacion, setValidacion] = useState<string | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(modalRef, { active: true, onClose });

  const set = <K extends keyof typeof form>(campo: K, valor: string) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const puedeGuardar =
    form.ruc.length === 11 && form.razonSocial.trim().length >= 3 &&
    form.solUsuario.trim().length > 0 && form.solClave.length > 0 &&
    form.certificadoPass.length > 0 && certificado != null;

  const guardar = async () => {
    setValidacion(null);
    if (!certificado) {
      setValidacion('Sube el archivo del certificado (.p12 o .pfx)');
      return;
    }
    if (form.ruc.length !== 11) {
      setValidacion('El RUC debe tener 11 dígitos');
      return;
    }
    try {
      await onGuardar({
        ruc: form.ruc,
        razonSocial: form.razonSocial.trim(),
        sedeId: form.sedeId || undefined,
        nombreComercial: form.nombreComercial.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        ubigeo: form.ubigeo.trim() || undefined,
        solUsuario: form.solUsuario.trim(),
        solClave: form.solClave,
        certificadoPass: form.certificadoPass,
        certificado,
      });
    } catch {
      // El error real (RUC duplicado, certificado inválido, etc.) ya llega
      // por la prop `error` — acá solo evitamos que el reject rompa el flujo.
    }
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal xwide" ref={modalRef} aria-modal="true" aria-label="Configurar SUNAT" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Configurar facturación electrónica</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div className="modal-scroll" style={{ padding: '18px 20px' }}>
          <div className="hint" style={{ marginBottom: 16 }}>
            Datos de la empresa emisora y las credenciales que SUNAT te dio al tramitar la facturación electrónica.
            Todo se guarda cifrado — nadie, ni el equipo técnico, puede leerlo directamente de la base de datos.
          </div>

          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Datos de la empresa
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 160px' }}>
              <label htmlFor="emp-ruc">RUC</label>
              <div className="input">
                <input id="emp-ruc" value={form.ruc} onChange={(e) => set('ruc', e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} placeholder="11 dígitos" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '2 1 260px' }}>
              <label htmlFor="emp-razon">Razón social</label>
              <div className="input">
                <input id="emp-razon" value={form.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} placeholder="Como figura en SUNAT" />
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 220px' }}>
              <label htmlFor="emp-sede">Sede que emite</label>
              <div className="input">
                <select id="emp-sede" value={form.sedeId} onChange={(e) => set('sedeId', e.target.value)}>
                  <option value="">Sin asignar (configurar después)</option>
                  {sedesDisponibles.map((sede) => (
                    <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                  ))}
                </select>
              </div>
              {sedesDisponibles.length === 0 && (
                <span className="hint">Todas las sedes ya tienen una empresa emisora enlazada.</span>
              )}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 20 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="emp-comercial">Nombre comercial</label>
              <div className="input">
                <input id="emp-comercial" value={form.nombreComercial} onChange={(e) => set('nombreComercial', e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '2 1 260px' }}>
              <label htmlFor="emp-direccion">Dirección</label>
              <div className="input">
                <input id="emp-direccion" value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 120px' }}>
              <label htmlFor="emp-ubigeo">Ubigeo</label>
              <div className="input">
                <input id="emp-ubigeo" value={form.ubigeo} onChange={(e) => set('ubigeo', e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} placeholder="Opcional" />
              </div>
            </div>
          </div>

          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Credenciales SUNAT (Clave SOL)
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="emp-sol-user">Usuario SOL</label>
              <div className="input">
                <input id="emp-sol-user" value={form.solUsuario} onChange={(e) => set('solUsuario', e.target.value)} placeholder="Ej. MODDATOS" autoComplete="off" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="emp-sol-clave">Clave SOL</label>
              <div className="input">
                <input id="emp-sol-clave" type="password" value={form.solClave} onChange={(e) => set('solClave', e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          </div>

          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Certificado digital
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 8 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="emp-cert-pass">Contraseña del certificado</label>
              <div className="input">
                <input id="emp-cert-pass" type="password" value={form.certificadoPass} onChange={(e) => set('certificadoPass', e.target.value)} autoComplete="new-password" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="emp-cert-file">Archivo del certificado (.p12 / .pfx)</label>
              <div className="input">
                <input id="emp-cert-file" type="file" accept=".p12,.pfx" onChange={(e) => setCertificado(e.target.files?.[0] ?? null)} />
              </div>
            </div>
          </div>
          {certificado && <div className="hint" style={{ marginBottom: 8 }}>Archivo elegido: {certificado.name}</div>}

          {(validacion ?? error) && (
            <div className="banner err module-feedback" role="alert" style={{ marginTop: 8 }}>
              <Icons.Alert s={16} />
              <span>{validacion ?? error}</span>
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, padding: '14px 20px' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={!puedeGuardar || guardando} onClick={() => void guardar()}>
            {guardando ? <span className="spinner" /> : <Icons.Check s={15} />} Guardar y activar
          </button>
        </div>
      </dialog>
    </div>
  );
}
