import { useState } from 'react';
import { Download, FileInput } from 'lucide-react';
import { SelectionDialog } from './SelectionDialog';
import { freshProject, type Project } from '../model/project';
import { bounds } from '../model/project';
import { bodyVisible } from '../model/transforms';
import { formatLength } from '../model/units';
import type { CadClient } from '../cad/client';
import type { BodyMesh } from '../cad/protocol';
import { importDefaults, importMeshFiles, type ImportOptions } from '../exchange/import';
import { glbExport, stlBinary, type ExportMesh } from '../exchange/export';
import { meshClosure } from '../exchange/mesh';
import { downloadFile, safeFilename } from '../storage/projects';

export function ImportDialog({
  files,
  mode,
  cad,
  onAccept,
  onClose,
}: {
  files: File[];
  mode: 'open' | 'add';
  cad: CadClient;
  onAccept: (project: Project, place: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const file = files.find((f) => /\.(step|stp|stl|glb|gltf)$/i.test(f.name))!;
  const step = /\.(step|stp)$/i.test(file.name);
  const [options, setOptions] = useState<ImportOptions>(importDefaults(file.name));
  const [place, setPlace] = useState(false);
  const [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const accept = async () => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      if (files.reduce((n, f) => n + f.size, 0) > 64 * 1024 * 1024)
        throw new Error('Tuonnin enimmäiskoko on 64 MiB.');
      const project = step
        ? {
            ...freshProject(),
            name: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
            bodies: await cad.importStep(
              await file.arrayBuffer(),
              file.name.replace(/\.[^.]+$/, '').slice(0, 100),
            ),
          }
        : await importMeshFiles(files, options);
      if (await onAccept(project, place)) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <SelectionDialog
      title={mode === 'add' ? 'Lisää malli' : 'Avaa 3D-tiedosto'}
      onClose={() => {
        if (!working) onClose();
      }}
      onAccept={() => void accept()}
    >
      <p className="exchange-filename">{file.name}</p>
      {!step && (
        <div className="exchange-fields">
          <label>
            Tiedoston yksikkö
            <select
              aria-label="Tuonnin yksikkö"
              value={options.unit}
              disabled={working}
              onChange={(e) =>
                setOptions({ ...options, unit: e.target.value as ImportOptions['unit'] })
              }
            >
              <option value="mm">Millimetri</option>
              <option value="cm">Senttimetri</option>
              <option value="m">Metri</option>
              <option value="inch">Tuuma</option>
            </select>
          </label>
          <label>
            Yläsuunta
            <select
              aria-label="Tuonnin yläsuunta"
              value={options.up}
              disabled={working}
              onChange={(e) =>
                setOptions({ ...options, up: e.target.value as ImportOptions['up'] })
              }
            >
              <option value="z">Z ylös</option>
              <option value="y">Y ylös</option>
            </select>
          </label>
        </div>
      )}
      <p className="muted">
        {step
          ? 'Tarkka CAD-geometria. Yksiköt luetaan STEP-tiedostosta.'
          : 'Kolmiomalli: siirrä, kierrä, skaalaa, maalaa ja käytä tartuntana. Tarkkaan pintamuokkaukseen käytä STEP-tiedostoa.'}
      </p>
      {mode === 'add' && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={place}
            disabled={working}
            onChange={(e) => setPlace(e.target.checked)}
          />{' '}
          Siirrä mallin lisäämisen jälkeen
        </label>
      )}
      <div className="dialog-actions">
        <button className="button dark" disabled={working} onClick={() => void accept()}>
          <FileInput size={16} />
          {working ? 'Luetaan mallia…' : mode === 'add' ? 'Lisää malliin' : 'Avaa'}
        </button>
        <button disabled={working} onClick={onClose}>
          Peruuta
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </SelectionDialog>
  );
}

export function ExportDialog({
  project,
  ids,
  meshes,
  cad,
  onClose,
}: {
  project: Project;
  ids: string[];
  meshes: BodyMesh[];
  cad: CadClient;
  onClose: () => void;
}) {
  const [scope, setScope] = useState(ids.length ? 'selection' : 'visible');
  const [format, setFormat] = useState('stl');
  const [tolerance, setTolerance] = useState(0.05),
    [bed, setBed] = useState(true);
  const [allowOpen, setAllowOpen] = useState(false);
  const [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const selected = new Set(ids);
  const bodies = project.bodies.filter(
    (b) =>
      (scope === 'selection' ? selected.has(b.id) : bodyVisible(b, project.groups)) &&
      b.purpose !== 'construction' &&
      b.purpose !== 'drawing',
  );
  const box = bounds(bodies),
    sizes = box.max.map((n, i) => n - box.min[i]);
  const download = async () => {
    setWorking(true);
    setError('');
    try {
      if (!bodies.length) throw new Error('Valitse vähintään yksi malliosa.');
      if (format === 'step') {
        if (bodies.some((b) => b.feature.type === 'mesh'))
          throw new Error(
            'STEP-vienti on tarkalle CAD-geometrialle. Vie kolmiomallit STL- tai GLB-muodossa.',
          );
        downloadFile(
          await cad.exportStep(bodies),
          `${safeFilename(project.name)}.step`,
          'application/step',
        );
      } else if (format === 'glb') {
        downloadFile(
          await glbExport(bodies, meshes, project.assets),
          `${safeFilename(project.name)}.glb`,
          'model/gltf-binary',
        );
      } else {
        const meshIds = new Set(bodies.filter((b) => b.feature.type === 'mesh').map((b) => b.id));
        const cadBodies = bodies.filter((b) => b.feature.type !== 'mesh');
        const data: ExportMesh[] = [
          ...(cadBodies.length ? await cad.printMeshes(cadBodies, tolerance) : []),
          ...meshes.filter((m) => meshIds.has(m.id)),
        ];
        const open = data.filter((m) => !meshClosure(m.vertices, m.triangles).closed);
        if (open.length && !allowOpen)
          throw new Error(
            `${open.length} osan pinta ei ole suljettu: ${open
              .slice(0, 3)
              .map((m) => bodies.find((b) => b.id === m.id)?.name)
              .join(', ')}. Sulje pinnat tai salli avoimien pintojen vienti.`,
          );
        downloadFile(stlBinary(data, bed), `${safeFilename(project.name)}-mm.stl`, 'model/stl');
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <SelectionDialog
      title="Vie 3D-malli"
      onClose={() => {
        if (!working) onClose();
      }}
    >
      <div className="exchange-fields">
        <label>
          Viedään
          <select
            aria-label="Viennin kohde"
            value={scope}
            disabled={working}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="selection" disabled={!ids.length}>
              Valitut osat ({ids.length})
            </option>
            <option value="visible">Näkyvät malliosat</option>
          </select>
        </label>
        <label>
          Tiedostomuoto
          <select
            aria-label="3D-tiedostomuoto"
            value={format}
            disabled={working}
            onChange={(e) => {
              setFormat(e.target.value);
              setError('');
            }}
          >
            <option value="stl">STL · 3D-tulostus</option>
            <option value="step">STEP · CAD</option>
            <option value="glb">GLB · materiaalit ja 3D-esitys</option>
          </select>
        </label>
      </div>
      <p className="export-size">
        {bodies.length} osaa · {sizes.map((n) => formatLength(n)).join(' × ')} mm
      </p>
      {format === 'stl' && (
        <>
          <label>
            Tarkkuus
            <select
              aria-label="STL-tarkkuus"
              value={tolerance}
              disabled={working}
              onChange={(e) => setTolerance(Number(e.target.value))}
            >
              <option value={0.15}>Luonnos · 0,15 mm</option>
              <option value={0.05}>Tarkka · 0,05 mm</option>
              <option value={0.02}>Erittäin tarkka · 0,02 mm</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={bed}
              disabled={working}
              onChange={(e) => setBed(e.target.checked)}
            />{' '}
            Keskitä tulostusalustalle, pohja Z = 0
          </label>
          <details>
            <summary>Lisävalinnat</summary>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={allowOpen}
                disabled={working}
                onChange={(e) => setAllowOpen(e.target.checked)}
              />{' '}
              Salli avoimet pinnat
            </label>
          </details>
          <p className="muted">
            Avaa STL tulostimen viipalointiohjelmassa millimetreinä. Osien keskinäiset paikat
            säilyvät; erillisiä osia ei yhdistetä automaattisesti.
          </p>
        </>
      )}
      {format === 'step' && (
        <p className="muted">Osat säilyvät erillisinä tarkkoina CAD-kappaleina.</p>
      )}
      <div className="dialog-actions">
        <button
          className="button dark"
          disabled={working || !bodies.length}
          onClick={() => void download()}
        >
          <Download size={16} />
          {working ? 'Valmistellaan tiedostoa…' : 'Lataa tiedosto'}
        </button>
        <button disabled={working} onClick={onClose}>
          Sulje
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </SelectionDialog>
  );
}
