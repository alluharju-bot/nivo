import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import type { BodyMesh } from '../cad/protocol';
import type { Project, Vec3 } from '../model/project';
import type { PartType } from '../model/quantitySchema';
import { bodyLocked } from '../model/groups';
import { parseLength } from '../model/units';
import {
  assignPartType,
  quantityBodies,
  quantityMethods,
  quantityNumber,
  quantityRows,
  quantityUnits,
  removePartType,
  savePartType,
  setQuantityDimensions,
  type QuantityRow,
} from '../model/quantities';

export type QuantityChange = (project: Project, label: string) => Promise<boolean>;
export function QuantityValue({ row }: { row: QuantityRow }) {
  return (
    <span className="quantity-value">
      {row.unit === 'count'
        ? `${row.count} kpl`
        : `${row.count} kpl · ${row.missing ? 'vahvistettu ' : ''}${quantityNumber(row.total)} ${quantityUnits[row.unit]}`}
      {!!row.missing && <small className="quantity-issue">{row.missing} tarkistettavaa</small>}
    </span>
  );
}

export function PartTypeEditor({
  project,
  type,
  busy,
  ids = [],
  meshes = [],
  onChange,
  onClose,
}: {
  project: Project;
  type?: PartType;
  busy: boolean;
  ids?: string[];
  meshes?: BodyMesh[];
  onChange: QuantityChange;
  onClose: () => void;
}) {
  const [name, setName] = useState(type?.name ?? '');
  const [unit, setUnit] = useState<PartType['unit']>(type?.unit ?? 'count');
  const [error, setError] = useState('');
  const count = project.bodies.filter((b) => b.partTypeId === type?.id).length;
  const submit = async () => {
    try {
      setError('');
      let next = savePartType(project, { id: type?.id, name, unit });
      if (!type && ids.length) next = assignPartType(next, ids, next.partTypes!.at(-1)!.id, meshes);
      if (await onChange(next, type ? 'Osatyyppi päivitetty.' : 'Osatyyppi luotu.')) onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <form
      className="part-type-editor"
      aria-label={type ? 'Muokkaa osatyyppiä' : 'Uusi osatyyppi'}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label>
        Tyypin nimi
        <input
          autoFocus
          aria-label="Tyypin nimi"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        Laskentatapa
        <select
          aria-label="Tyypin laskentatapa"
          value={unit}
          onChange={(e) => setUnit(e.target.value as PartType['unit'])}
          disabled={busy}
        >
          <option value="count">Kappaleet · kpl</option>
          <option value="length">Pituus · m</option>
          <option value="area">Aihioala · m²</option>
        </select>
      </label>
      {unit !== 'count' && (
        <p className="muted">
          {unit === 'area'
            ? 'Pituus × leveys yhdeltä puolelta. Aukkoja ei vähennetä.'
            : 'Osan pituus omassa suunnassaan.'}
        </p>
      )}
      {type && (
        <p className="muted">Muutos koskee projektin kaikkia tämän tyypin osia ({count} kpl).</p>
      )}
      <div className="quantity-buttons">
        <button type="submit" className="button dark" disabled={busy || !name.trim()}>
          {type ? 'Tallenna tyyppi' : 'Luo tyyppi'}
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Peruuta
        </button>
      </div>
      {type && (
        <details>
          <summary>Poista tyyppi</summary>
          <p>Poistaa luokituksen {count} osalta. Osat säilyvät.</p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              try {
                if (
                  await onChange(
                    removePartType(project, type.id),
                    'Osatyyppi poistettu. Osat säilytettiin.',
                  )
                )
                  onClose();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Poista tyyppi
          </button>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function QuantityDimensions({
  project,
  row,
  busy,
  onChange,
}: {
  project: Project;
  row: QuantityRow;
  busy: boolean;
  onChange: QuantityChange;
}) {
  const part = row.parts[0];
  const [length, setLength] = useState(
    String(part.dimensions?.[0] ?? part.body.quantityBasis?.dimensions[0] ?? ''),
  );
  const [width, setWidth] = useState(
    String(part.dimensions?.[1] ?? part.body.quantityBasis?.dimensions[1] ?? ''),
  );
  const [error, setError] = useState('');
  return (
    <details className="quantity-dimensions" open={!!part.issue}>
      <summary>Laskennan mitat{part.manual ? ' · oma aihio' : ''}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setError('');
            const dimensions: Vec3 = [
              parseLength(length),
              row.unit === 'area' ? parseLength(width) : (part.dimensions?.[1] ?? 0),
              part.dimensions?.[2] ?? 0,
            ];
            await onChange(
              setQuantityDimensions(project, part.body.id, dimensions),
              'Laskennan aihiomitat vahvistettu.',
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Pituus (mm)
          <input
            aria-label="Laskennan pituus"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            disabled={busy}
            inputMode="decimal"
          />
        </label>
        {row.unit === 'area' && (
          <label>
            Leveys (mm)
            <input
              aria-label="Laskennan leveys"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              disabled={busy}
              inputMode="decimal"
            />
          </label>
        )}
        <button type="submit" disabled={busy}>
          Vahvista aihiomitat
        </button>
        {part.body.quantityBasis?.manual && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void onChange(
                setQuantityDimensions(project, part.body.id),
                'Automaattinen määrälaskenta palautettu.',
              )
            }
          >
            Käytä mallin mittoja
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}

export function QuantityProperties({
  project,
  meshes,
  ids,
  busy,
  onChange,
  onSelect,
}: {
  project: Project;
  meshes: BodyMesh[];
  ids: string[];
  busy: boolean;
  onChange: QuantityChange;
  onSelect: (ids: string[]) => void;
}) {
  const [editing, setEditing] = useState<'new' | PartType>();
  const [error, setError] = useState('');
  const parts = useMemo(() => {
    const selected = new Set(ids);
    return quantityBodies(project.bodies.filter((b) => selected.has(b.id)));
  }, [project.bodies, ids]);
  const rows = useMemo(() => quantityRows(project, parts, meshes), [project, parts, meshes]);
  const typeIds = new Set(parts.map((b) => b.partTypeId ?? ''));
  const common = typeIds.size === 1 ? (parts[0]?.partTypeId ?? '') : '__mixed__';
  const type = project.partTypes?.find((t) => t.id === common);
  const blocked = busy || parts.some((b) => bodyLocked(b, project.groups));
  if (!parts.length) return null;
  return (
    <section className="quantity-properties" aria-label="Tyyppi ja määrät">
      <div className="quantity-type-field">
        <label>
          Tyyppi
          <select
            aria-label="Osan tyyppi"
            value={common}
            disabled={blocked}
            onChange={async (e) => {
              if (e.target.value === '__new__') {
                setEditing('new');
                return;
              }
              try {
                setError('');
                await onChange(
                  assignPartType(
                    project,
                    parts.map((b) => b.id),
                    e.target.value || undefined,
                    meshes,
                  ),
                  'Valittujen osien tyyppi päivitetty.',
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <option value="">Ei tyyppiä</option>
            {common === '__mixed__' && (
              <option value="__mixed__" disabled>
                Useita tyyppejä
              </option>
            )}
            {[...(project.partTypes ?? [])]
              .sort((a, b) => a.name.localeCompare(b.name, 'fi'))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            <option value="__new__">+ Uusi tyyppi…</option>
          </select>
        </label>
        {type && (
          <button
            aria-label="Muokkaa osatyyppiä"
            title="Muokkaa osatyyppiä"
            disabled={busy}
            onClick={() => setEditing(type)}
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      {editing && (
        <PartTypeEditor
          key={editing === 'new' ? 'new' : editing.id}
          project={project}
          type={editing === 'new' ? undefined : editing}
          ids={parts.map((b) => b.id)}
          meshes={meshes}
          busy={blocked}
          onChange={onChange}
          onClose={() => setEditing(undefined)}
        />
      )}
      <div className="quantity-selection-summary" data-testid="selection-quantities">
        {rows.map((row) => (
          <div key={row.type?.id ?? ''}>
            {rows.length > 1 && <span>{row.name}</span>}
            <QuantityValue row={row} />
          </div>
        ))}
      </div>
      {type && (
        <>
          <small className="muted">{quantityMethods[type.unit]}</small>
          <button
            className="quantity-select-all"
            disabled={busy}
            onClick={() =>
              onSelect(
                quantityBodies(project.bodies)
                  .filter((b) => b.partTypeId === type.id)
                  .map((b) => b.id),
              )
            }
          >
            Valitse kaikki samantyyppiset
          </button>
        </>
      )}
      {parts.length === 1 && type && type.unit !== 'count' && (
        <QuantityDimensions
          key={`${parts[0].id}:${type.unit}:${JSON.stringify(parts[0].quantityBasis)}:${rows[0].parts[0].dimensions?.join(',')}`}
          project={project}
          row={rows[0]}
          busy={blocked}
          onChange={onChange}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
