// screens/facturacion/EditarEmpresaModal.tsx — Edición de una empresa ya
// configurada: datos de negocio, Clave SOL y/o certificado. El RUC no se
// edita (identifica a la fila, ver ActualizarEmpresaDto en el backend).
// Clave SOL y certificado quedan en blanco por defecto — solo se re-cifran o
// reemplazan si el admin escribe algo.

import { useRef, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { ActualizarEmpresaPayload, EmpresaDto } from '../../types/facturacion.types';
import type { SedeDto } from '../../types/sede.types';

interface Props {
  empresa: EmpresaDto;
  guardando: boolean;
  error: string | null;
  // Sedes libres + la que ya tiene esta empresa (si tiene una) — así se
  // puede mantener la actual o mover a otra libre, pero no a una ocupada.
  sedesDisponibles: SedeDto[];
  onGuardar: (payload: ActualizarEmpresaPayload) => Promise<unknown>;
  onClose: () => void;
}

export function EditarEmpresaModal({ empresa, guardando, error, sedesDisponibles, onGuardar, onClose }: Readonly<Props>) {
  const [razonSocial, setRazonSocial] = useState(empresa.razonSocial);
  const [sedeId, setSedeId] = useState(empresa.sedeId ?? '');
  const [nombreComercial, setNombreComercial] = useState(empresa.nombreComercial ?? '');
  const [direccion, setDireccion] = useState(empresa.direccion ?? '');
  const [ubigeo, setUbigeo] = useState(empresa.ubigeo ?? '');
  const [solUsuario, setSolUsuario] = useState(empresa.solUsuario ?? '');
  const [solClave, setSolClave] = useState('');
  const [certificadoPass, setCertificadoPass] = useState('');
  const [certificado, setCertificado] = useState<File | null>(null);
  const [validacion, setValidacion] = useState<string | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(modalRef, { active: true, onClose });

  const puedeGuardar =
    razonSocial.trim().length >= 3 &&
    (!certificado || certificadoPass.length > 0) &&
    (ubigeo.length === 0 || ubigeo.length === 6);

  const guardar = async () => {
    setValidacion(null);
    if (certificado && certificadoPass.length === 0) {
      setValidacion('Ingresa la contraseña del nuevo certificado');
      return;
    }
    const payload: ActualizarEmpresaPayload = {
      razonSocial: razonSocial.trim(),
      nombreComercial: nombreComercial.trim(),
      direccion: direccion.trim(),
    };
    if (sedeId !== (empresa.sedeId ?? '')) payload.sedeId = sedeId;
    // ubigeo y solUsuario tienen validación de "no vacío" en el backend
    // (6 dígitos / MinLength 1) — a diferencia de nombreComercial/dirección,
    // que sí se pueden vaciar. Si el campo quedó en blanco, se omite (no se
    // toca lo que ya había), en vez de mandar '' y que el backend lo rechace.
    const ubigeoTrim = ubigeo.trim();
    if (ubigeoTrim.length > 0) payload.ubigeo = ubigeoTrim;
    const solUsuarioTrim = solUsuario.trim();
    if (solUsuarioTrim.length > 0) payload.solUsuario = solUsuarioTrim;
    if (solClave.length > 0) payload.solClave = solClave;
    if (certificado) {
      payload.certificado = certificado;
      payload.certificadoPass = certificadoPass;
    }
    try {
      await onGuardar(payload);
    } catch {
      // El error real (contraseña incorrecta del certificado, etc.) ya llega
      // por la prop `error` — acá solo evitamos que el reject rompa el flujo.
    }
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal xwide" ref={modalRef} aria-modal="true" aria-label={`Editar ${empresa.razonSocial}`} style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Editar empresa</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div className="modal-scroll" style={{ padding: '18px 20px' }}>
          <div className="hint" style={{ marginBottom: 16 }}>
            RUC {empresa.ruc} · no editable. Deja en blanco la Clave SOL o el certificado si no quieres cambiarlos.
          </div>

          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Datos de la empresa
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0, flex: '2 1 260px' }}>
              <label htmlFor="edit-emp-razon">Razón social</label>
              <div className="input">
                <input id="edit-emp-razon" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="Como figura en SUNAT" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="edit-emp-comercial">Nombre comercial</label>
              <div className="input">
                <input id="edit-emp-comercial" value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 20 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 220px' }}>
              <label htmlFor="edit-emp-sede">Sede que emite</label>
              <div className="input">
                <select id="edit-emp-sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {sedesDisponibles.map((sede) => (
                    <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 20 }}>
            <div className="field" style={{ marginBottom: 0, flex: '2 1 260px' }}>
              <label htmlFor="edit-emp-direccion">Dirección</label>
              <div className="input">
                <input id="edit-emp-direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 120px' }}>
              <label htmlFor="edit-emp-ubigeo">Ubigeo</label>
              <div className="input">
                <input id="edit-emp-ubigeo" value={ubigeo} onChange={(e) => setUbigeo(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} placeholder="Opcional" />
              </div>
            </div>
          </div>

          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Credenciales SUNAT (Clave SOL)
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="edit-emp-sol-user">Usuario SOL</label>
              <div className="input">
                <input id="edit-emp-sol-user" value={solUsuario} onChange={(e) => setSolUsuario(e.target.value)} autoComplete="off" />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="edit-emp-sol-clave">Clave SOL nueva</label>
              <div className="input">
                <input id="edit-emp-sol-clave" type="password" value={solClave} onChange={(e) => setSolClave(e.target.value)} placeholder="Dejar en blanco = sin cambios" autoComplete="new-password" />
              </div>
            </div>
          </div>

          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Certificado digital
          </div>
          <div className="row wrap" style={{ gap: 12, marginBottom: 8 }}>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="edit-emp-cert-file">Nuevo certificado (.p12 / .pfx)</label>
              <div className="input">
                <input id="edit-emp-cert-file" type="file" accept=".p12,.pfx" onChange={(e) => setCertificado(e.target.files?.[0] ?? null)} />
              </div>
              <span className="hint">Dejar en blanco = mantener el certificado actual.</span>
            </div>
            <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label htmlFor="edit-emp-cert-pass">Contraseña del certificado nuevo</label>
              <div className="input">
                <input id="edit-emp-cert-pass" type="password" value={certificadoPass} onChange={(e) => setCertificadoPass(e.target.value)} disabled={!certificado} autoComplete="new-password" />
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
            {guardando ? <span className="spinner" /> : <Icons.Check s={15} />} Guardar cambios
          </button>
        </div>
      </dialog>
    </div>
  );
}
