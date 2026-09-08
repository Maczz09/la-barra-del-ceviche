import { Icons } from './icons';

interface Props {
  activo: boolean;
  onActivar: () => Promise<void>;
  onDesactivar: () => Promise<void>;
}

/** Control visible para cumplir la política de audio de Safari/iOS y Chrome. */
export function AlertasSonorasButton({ activo, onActivar, onDesactivar }: Readonly<Props>) {
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${activo ? 'on' : ''}`}
      onClick={() => { void (activo ? onDesactivar() : onActivar()); }}
      title={activo ? 'Desactivar alertas sonoras' : 'Activar y probar alertas sonoras'}
      aria-label={activo ? 'Desactivar alertas sonoras' : 'Activar y probar alertas sonoras'}
    >
      {activo ? <Icons.Volume s={16} /> : <Icons.VolumeX s={16} />}
      {activo ? 'Sonido activo' : 'Activar y probar'}
    </button>
  );
}
