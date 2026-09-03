import type { TamanoPlatoDto } from '../../types/inventario.types';

interface Props {
  id: string;
  tamanos: TamanoPlatoDto[];
  value: string;
  onChange: (value: string) => void;
  actual?: TamanoPlatoDto | null;
  loading?: boolean;
  error?: string | null;
}

/** Los tamaños inactivos no se asignan de nuevo, pero se conserva el actual. */
export function TamanoSelect({ id, tamanos, value, onChange, actual, loading = false, error }: Readonly<Props>) {
  const disponibles = tamanos.filter((t) => t.activo || t.id === value);
  if (value && !disponibles.some((t) => t.id === value)) {
    disponibles.push(actual ?? { id: value, nombre: 'Tamaño actual', orden: 0, activo: false });
  }
  disponibles.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <label htmlFor={id}>Tamaño del plato</label>
      <div className="input">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
          <option value="">Sin tamaño</option>
          {disponibles.map((t) => <option key={t.id} value={t.id}>{t.nombre}{!t.activo ? ' (inactivo)' : ''}</option>)}
        </select>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        {loading ? 'Cargando tamaños…' : 'Cada tamaño conserva su propio precio. No escribas el tamaño en el nombre.'}
      </div>
      {error && <div role="status" className="muted" style={{ fontSize: 12 }}>No se pudieron cargar los tamaños. Se conserva el tamaño actual.</div>}
    </div>
  );
}
