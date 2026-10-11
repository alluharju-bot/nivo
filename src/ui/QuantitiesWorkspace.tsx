import { useMemo, useState } from 'react';
import { Download, Pencil } from 'lucide-react';
import type { Body, Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import type { PartType } from '../model/quantitySchema';
import {
  quantityRows,
  type QuantityRow,
  quantityUnits,
  quantityNumber,
  quantitiesCSV,
} from '../model/quantities';
import { downloadFile, safeFilename } from '../storage/projects';
import { PartTypeEditor, QuantityValue, type QuantityChange } from './QuantityProperties';

export function QuantitiesWorkspace({
  project,
  bodies,
  meshes,
  title,
  busy,
  onChange,
  onSelect,
}: {
  project: Project;
  bodies: Body[];
  meshes: BodyMesh[];
  title: string;
  busy: boolean;
  onChange: QuantityChange;
  onSelect: (ids: string[]) => void;
}) {
  const rows = useMemo(() => quantityRows(project, bodies, meshes), [project, bodies, meshes]);
  const [editing, setEditing] = useState<'new' | PartType>();
  const missing = rows.reduce((n, r) => n + r.missing, 0);
  return (
    <section className="quantities-workspace" aria-label="Projektin määrät">
      <div className="quantities-heading">
        <div>
          <h2>{title}</h2>
          <p>{rows.reduce((n, r) => n + r.count, 0)} osaa · myös piilotetut osat mukana</p>
        </div>
        <button
          className="button outlined"
          disabled={busy || !rows.length}
          onClick={() =>
            downloadFile(
              quantitiesCSV(rows),
              `${safeFilename(title)}-maarat.csv`,
              'text/csv;charset=utf-8',
            )
          }
        >
          <Download size={16} />
          Vie määrät CSV
        </button>
      </div>
      {!!missing && (
        <p className="quantity-warning" role="status">
          {missing} osan laskentamitat on tarkistettava. Yhteissummat sisältävät vain vahvistetut
          määrät.
        </p>
      )}
      <table className="quantities-table">
        <thead>
          <tr>
            <th>Tyyppi</th>
            <th>Määrä</th>
            <th>Erittely</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.type?.id ?? ''} data-testid={`quantity-row-${row.type?.id ?? 'untyped'}`}>
              <td>
                <button
                  disabled={busy}
                  onClick={() => onSelect(row.parts.map((p) => p.body.id))}
                  aria-label={`Valitse tyyppi: ${row.name}`}
                >
                  {row.name}
                </button>
                <small>
                  {row.unit === 'area'
                    ? 'Aihioala · aukkoja ei vähennetä'
                    : row.unit === 'length'
                      ? 'Pituus'
                      : 'Kappaleet'}
                </small>
              </td>
              <td>
                <QuantityValue row={row} />
              </td>
              <td>
                <QuantityBreakdown row={row} busy={busy} onSelect={onSelect} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p>
          Rajauksessa ei ole malliosia. Rakentamisen apumuodot ja piirrosviivat eivät kuulu
          määrälaskentaan.
        </p>
      )}
      <details className="quantity-type-library">
        <summary>Projektin osatyypit ({project.partTypes?.length ?? 0})</summary>
        <div className="quantity-type-list">
          {project.partTypes?.map((type) => (
            <button key={type.id} disabled={busy} onClick={() => setEditing(type)}>
              <Pencil size={14} />
              {type.name}
              <small>{quantityUnits[type.unit]}</small>
            </button>
          ))}
        </div>
        <button disabled={busy} onClick={() => setEditing('new')}>
          + Uusi tyyppi
        </button>
        {editing && (
          <PartTypeEditor
            key={editing === 'new' ? 'new' : editing.id}
            project={project}
            type={editing === 'new' ? undefined : editing}
            busy={busy}
            onChange={onChange}
            onClose={() => setEditing(undefined)}
          />
        )}
      </details>
    </section>
  );
}

function QuantityBreakdown({
  row,
  busy,
  onSelect,
}: {
  row: QuantityRow;
  busy: boolean;
  onSelect: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(100);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {row.unit === 'count'
          ? 'Osat'
          : row.unit === 'length'
            ? 'Pituudet ja osat'
            : 'Aihiot ja osat'}
      </summary>
      {open && (
        <>
          {!!row.batches.length && (
            <ul>
              {row.batches.slice(0, limit).map((batch) => (
                <li key={batch.dimensions.join('x')}>
                  {batch.count} × {batch.dimensions.map(quantityNumber).join(' × ')} mm ·{' '}
                  {quantityNumber(batch.total)} {quantityUnits[row.unit]}
                </li>
              ))}
            </ul>
          )}
          <ul className="quantity-part-list">
            {row.parts.slice(0, limit).map((part) => (
              <li key={part.body.id}>
                <button disabled={busy} onClick={() => onSelect([part.body.id])}>
                  {part.body.name}
                </button>
                {part.issue ? (
                  <span className="quantity-issue">{part.issue}</span>
                ) : (
                  row.unit !== 'count' && (
                    <span>
                      {quantityNumber(part.value!)} {quantityUnits[row.unit]}
                      {part.manual ? ' · oma aihio' : ''}
                    </span>
                  )
                )}
              </li>
            ))}
          </ul>
          {Math.max(row.batches.length, row.parts.length) > limit && (
            <button onClick={() => setLimit(limit + 100)}>Näytä lisää erittelyä</button>
          )}
        </>
      )}
    </details>
  );
}
