import { useEffect, useMemo, useState } from 'react';
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
import { LodPanel } from './LodPanel';
import { meshStatistics, triangleCount } from '../model/meshStats';

export function ImportDialog({
  files,
  mode,
  cad,
  onAccept,
  onClose,
  title,
  description,
  initialPlace = false,
}: {
  files: File[];
  mode: 'open' | 'add';
  cad: CadClient;
  onAccept: (project: Project, place: boolean) => Promise<boolean>;
  onClose: () => void;
  title?: string;
  description?: string;
  initialPlace?: boolean;
}) {
  const file = files.find((f) => /\.(step|stp|stl|glb|gltf)$/i.test(f.name))!;
  const step = /\.(step|stp)$/i.test(file.name);
  const [options, setOptions] = useState<ImportOptions>(importDefaults(file.name));
  const [place, setPlace] = useState(initialPlace);
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
      title={title ?? (mode === 'add' ? 'Lisää malli' : 'Avaa 3D-tiedosto')}
      onClose={() => {
        if (!working) onClose();
      }}
      onAccept={() => void accept()}
    >
      <p className="exchange-filename">{file.name}</p>
      {description && <p>{description}</p>}
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
  initialLods = false,
  visibleIds,
}: {
  project: Project;
  ids: string[];
  meshes: BodyMesh[];
  cad: CadClient;
  onClose: () => void;
  initialLods?: boolean;
  visibleIds?: string[];
}) {
  const [scope, setScope] = useState(ids.length ? 'selection' : 'visible');
  const [format, setFormat] = useState(initialLods ? 'glb' : 'stl');
  const [tolerance, setTolerance] = useState(0.05),
    [bed, setBed] = useState(true);
  const [allowOpen, setAllowOpen] = useState(false);
  const [includeMotions, setIncludeMotions] = useState(true);
  const [instances, setInstances] = useState(false),
    [lods, setLods] = useState(initialLods);
  const [working, setWorking] = useState(false),
    [error, setError] = useState('');
  // Disabling the start button can move focus to the page while a worker runs.
  // Escape must still close this cancellable preview, even without dialog focus.
  useEffect(() => {
    if (format !== 'glb' || !lods) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [format, lods, onClose]);
  const bodies = useMemo(() => {
    const allowed = new Set(
      scope === 'selection'
        ? ids
        : (visibleIds ??
            project.bodies.filter((b) => bodyVisible(b, project.groups)).map((b) => b.id)),
    );
    return project.bodies.filter(
      (b) => allowed.has(b.id) && b.purpose !== 'construction' && b.purpose !== 'drawing',
    );
  }, [project.bodies, project.groups, scope, ids, visibleIds]);
  const statistics = useMemo(
    () => ({
      model: meshStatistics(project.bodies, meshes),
      scope: meshStatistics(bodies, meshes),
    }),
    [project.bodies, bodies, meshes],
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
          await glbExport(bodies, meshes, project.assets, {
            instances,
            motions: includeMotions ? project.motions : undefined,
          }),
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
      title={initialLods ? 'Kolmiot ja LOD' : 'Vie 3D-malli'}
      onClose={() => {
        if (!working || (format === 'glb' && lods)) onClose();
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
      <div className="export-triangles" aria-label="Mallin kolmiomäärät">
        <div>
          <span>{scope === 'selection' ? 'Valinta' : 'Näkyvät osat'}</span>
          <strong>
            {triangleCount(statistics.scope.triangles)} <small>kolmiota</small>
          </strong>
        </div>
        <div>
          <span>Koko malli</span>
          <strong>
            {triangleCount(statistics.model.triangles)} <small>kolmiota</small>
          </strong>
        </div>
      </div>
      <p className="muted">
        Nykyinen näyttöverkko. Kopiot lasketaan erikseen; viivat ja apugeometria eivät ole mukana.
        {!!statistics.scope.pending &&
          ` ${statistics.scope.pending} osan geometria vielä valmistuu.`}
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
      {format === 'glb' && (
        <>
          {!!project.motions?.length && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeMotions}
                  disabled={working}
                  onChange={(e) => setIncludeMotions(e.target.checked)}
                />
                Pivotit ja avaus-/sulkemisanimaatiot
              </label>
              <p className="muted">
                Sisällytä ankkuri ja kaikki liikkeen osat vientiin. Liikkuvat osat säilyvät
                erillisinä solmuina myös GPU-instansseja käytettäessä.
              </p>
            </>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={lods}
              disabled={working}
              onChange={(e) => setLods(e.target.checked)}
            />
            Etäisyysversiot · LOD-paketti
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={instances}
              disabled={working}
              onChange={(e) => setInstances(e.target.checked)}
            />
            GPU-instanssit toistuville osille
          </label>
          <p className="muted">
            Materiaalit ja identtiset geometriat jaetaan automaattisesti. Alkuperäinen malli säilyy.
          </p>
          {instances && (
            <p className="muted">
              Edellyttää kohdeohjelman EXT_mesh_gpu_instancing-tukea. Osien nimet säilyvät
              instanssien lisätiedoissa.
            </p>
          )}
          {lods && (
            <LodPanel
              bodies={bodies}
              meshes={meshes}
              project={project}
              instances={instances}
              includeMotions={includeMotions}
              onWorking={setWorking}
              onDownloaded={onClose}
            />
          )}
        </>
      )}
      <div className="dialog-actions">
        {!(format === 'glb' && lods) && (
          <button
            className="button dark"
            disabled={working || !bodies.length}
            onClick={() => void download()}
          >
            <Download size={16} />
            {working ? 'Valmistellaan tiedostoa…' : 'Lataa tiedosto'}
          </button>
        )}
        <button disabled={working && !(format === 'glb' && lods)} onClick={onClose}>
          Sulje
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </SelectionDialog>
  );
}
