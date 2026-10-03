import { useEffect, useMemo, useRef, useState } from 'react';
import { BoxGeometry } from 'three';
import { Maximize, X } from 'lucide-react';
import { cabinetBodies, cabinetDefaults, cabinetPlan, type CabinetOptions } from '../model/cabinet';
import { bodyLocked } from '../model/groups';
import { bounds, type Body, type Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { formatLength, parseLength } from '../model/units';
import { createRenderScene, renderDefaults } from '../render/scene';

/** Instant preview only. Accepting the layout constructs real solids with the CAD worker. */
function previewMeshes(bodies: Body[]): BodyMesh[] {
  return bodies.map((body) => {
    const f = body.feature,
      geometry = new BoxGeometry(f.width, f.depth, f.height);
    geometry.translate(
      ...(body.origin.map((v, i) => v + [f.width, f.depth, f.height][i] / 2) as [
        number,
        number,
        number,
      ]),
    );
    const mesh: BodyMesh = {
      id: body.id,
      vertices: Array.from(geometry.attributes.position.array),
      normals: Array.from(geometry.attributes.normal.array),
      triangles: Array.from(geometry.index!.array),
      volume: f.width * f.depth * f.height,
      edges: [],
      faces: [],
      verticesCAD: [],
      midpointsCAD: [],
      edgesCAD: [],
      boundaries: [],
    };
    geometry.dispose();
    return mesh;
  });
}
function CabinetPreview({ bodies }: { bodies: Body[] }) {
  const host = useRef<HTMLDivElement>(null),
    api = useRef<ReturnType<typeof createRenderScene>>(undefined);
  const [showDoors, setShowDoors] = useState(true);
  const visibleBodies = useMemo(
    () => (showDoors ? bodies : bodies.filter((b) => !b.id.startsWith('cabinet-door-'))),
    [bodies, showDoors],
  );
  const meshes = useMemo(() => previewMeshes(visibleBodies), [visibleBodies]);
  const boundsKey = JSON.stringify(bounds(bodies));
  const [error, setError] = useState('');
  const latest = useRef({
    bodies,
    meshes,
    settings: renderDefaults,
    onPick: () => {},
    onTexture: () => {},
  });
  latest.current = { ...latest.current, bodies: visibleBodies, meshes };
  useEffect(() => {
    try {
      api.current = createRenderScene(host.current!, () => latest.current);
      api.current.sync();
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
      api.current?.dispose();
      api.current = undefined;
    };
  }, []);
  useEffect(() => {
    api.current?.sync();
  }, [meshes]);
  useEffect(() => {
    api.current?.fit();
  }, [boundsKey]);
  return (
    <div className="cabinet-preview">
      <div ref={host} className="cabinet-canvas" />
      <button type="button" className="button outlined" onClick={() => api.current?.fit()}>
        <Maximize size={16} /> Sovita runko
      </button>
      {bodies.some((b) => b.id.startsWith('cabinet-door-')) && (
        <button
          type="button"
          className="button outlined cabinet-door-toggle"
          aria-pressed={!showDoors}
          onClick={() => setShowDoors(!showDoors)}
        >
          {showDoors ? 'Piilota ovet esikatselusta' : 'Näytä ovet'}
        </button>
      )}
      <p>Vedä kiertääksesi · esikatselu ei muuta mallia</p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

type Props = {
  project: Project;
  source?: Body;
  busy: boolean;
  onClose: () => void;
  onCreate: (options: CabinetOptions, replaceId?: string) => Promise<boolean>;
};
type Field =
  | 'width'
  | 'depth'
  | 'height'
  | 'thickness'
  | 'backThickness'
  | 'backInset'
  | 'shelfInset'
  | 'doorGap'
  | 'x'
  | 'y'
  | 'z';
export function CabinetBuilder({ project, source, busy, onClose, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<CabinetOptions>(() => ({
    ...cabinetDefaults,
    ...(source && source.feature.height > 0
      ? {
          width: source.feature.width,
          depth: source.feature.depth,
          height: source.feature.height,
          origin: source.origin,
          name: `${source.name.slice(0, 105)} · runko`,
        }
      : {}),
  }));
  const [values, setValues] = useState<Record<Field, string>>(() => ({
    width: String(options.width),
    depth: String(options.depth),
    height: String(options.height),
    thickness: String(options.thickness),
    backThickness: String(options.backThickness),
    backInset: String(options.backInset),
    shelfInset: String(options.shelfInset),
    doorGap: String(options.doorGap),
    x: String(options.origin[0]),
    y: String(options.origin[1]),
    z: String(options.origin[2]),
  }));
  const [replace, setReplace] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [submitError, setSubmitError] = useState('');
  const blocked = busy || submitting;
  const candidate = useMemo(() => {
    try {
      const n = (key: Field, zero = false) =>
        parseLength(values[key], ['x', 'y', 'z'].includes(key), zero);
      const next = {
        ...options,
        width: n('width'),
        depth: n('depth'),
        height: n('height'),
        thickness: n('thickness'),
        backThickness: options.back === 'none' ? options.backThickness : n('backThickness'),
        backInset: options.back === 'inset' ? n('backInset', true) : 0,
        shelfInset: options.shelves ? n('shelfInset', true) : 0,
        doorGap: options.doors !== 'none' ? n('doorGap', true) : 0,
        origin: [n('x', true), n('y', true), n('z', true)] as [number, number, number],
      };
      const panels = cabinetPlan(next);
      return { next, panels, bodies: cabinetBodies(panels, 'preview', true) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [options, values]);
  const lastPreview = useRef<Body[]>([]);
  if (candidate.bodies) lastPreview.current = candidate.bodies;
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const dimension = (key: Field, label: string) => (
    <label key={key}>
      {label}
      <input
        aria-label={label}
        inputMode="decimal"
        value={values[key]}
        onChange={(e) => setValues({ ...values, [key]: e.target.value })}
      />
    </label>
  );
  const submit = async () => {
    if (!candidate.next || blocked) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      if (await onCreate(candidate.next, replace ? source?.id : undefined)) onClose();
      else setSubmitError('Runkoa ei saatu luotua. Tarkista mitat ja yritä uudelleen.');
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="cabinet-dialog"
      aria-labelledby="cabinet-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!blocked) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">ERILLISET LEVYT · YKSI RYHMÄ</span>
          <h2 id="cabinet-title">Levyrunko</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Sulje levyrunko"
          disabled={blocked}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="cabinet-layout">
          <CabinetPreview bodies={lastPreview.current} />
          <fieldset className="cabinet-fields" disabled={blocked}>
            <label>
              Nimi
              <input
                aria-label="Rungon nimi"
                value={options.name}
                maxLength={120}
                onChange={(e) => setOptions({ ...options, name: e.target.value })}
              />
            </label>
            <div className="cabinet-dimensions">
              {dimension('width', 'Rungon leveys')}
              {dimension('depth', 'Rungon syvyys')}
              {dimension('height', 'Rungon korkeus')}
            </div>
            {dimension('thickness', 'Levyn paksuus')}
            <label>
              Liitos
              <select
                aria-label="Rungon liitos"
                value={options.joints}
                onChange={(e) =>
                  setOptions({ ...options, joints: e.target.value as CabinetOptions['joints'] })
                }
              >
                <option value="sides-full">Kansi ja pohja sivujen välissä</option>
                <option value="caps-full">Sivut kannen ja pohjan välissä</option>
              </select>
            </label>
            <div className="cabinet-dimensions">
              <label>
                Hyllyjä
                <select
                  aria-label="Hyllyjen määrä"
                  value={options.shelves}
                  onChange={(e) => setOptions({ ...options, shelves: Number(e.target.value) })}
                >
                  {Array.from({ length: 21 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              {options.shelves > 0 && dimension('shelfInset', 'Hyllyn etusisennys')}
            </div>
            <label>
              Tausta
              <select
                aria-label="Rungon tausta"
                value={options.back}
                onChange={(e) =>
                  setOptions({ ...options, back: e.target.value as CabinetOptions['back'] })
                }
              >
                <option value="inset">Rungon sisällä</option>
                <option value="overlay">Rungon takana</option>
                <option value="none">Ei taustaa</option>
              </select>
            </label>
            {options.back !== 'none' && (
              <div className="cabinet-dimensions">
                {dimension('backThickness', 'Taustan paksuus')}
                {options.back === 'inset' &&
                  dimension('backInset', 'Taustan sisennys takareunasta')}
              </div>
            )}
            <label>
              Ovet
              <select
                aria-label="Rungon ovet"
                value={options.doors}
                onChange={(e) =>
                  setOptions({ ...options, doors: e.target.value as CabinetOptions['doors'] })
                }
              >
                <option value="none">Ei ovia</option>
                <option value="single">Yksi pintaovi</option>
                <option value="double">Kaksi pintaovea</option>
              </select>
            </label>
            {options.doors !== 'none' && (
              <>
                {dimension('doorGap', 'Ovien reuna- ja keskirako')}
                <p className="muted">
                  Oven paksuus on sama kuin rungon levyillä. Ovet lisätään rungon eteen, syvyys
                  kasvaa levyn paksuuden verran.
                </p>
              </>
            )}
            <details>
              <summary>Sijainti ja osien mitat</summary>
              <div className="cabinet-dimensions">
                {dimension('x', 'Sijainti X')}
                {dimension('y', 'Sijainti Y')}
                {dimension('z', 'Sijainti Z')}
              </div>
              <ul className="cabinet-panel-list">
                {candidate.panels?.map((p) => (
                  <li key={p.key}>
                    <span>{p.name}</span>
                    <span>{p.size.map(formatLength).join(' × ')} mm</span>
                  </li>
                ))}
              </ul>
            </details>
            {source && (
              <label className="cabinet-replace">
                <input
                  type="checkbox"
                  checked={replace}
                  disabled={bodyLocked(source, project.groups)}
                  onChange={(e) => setReplace(e.target.checked)}
                />{' '}
                Korvaa lähtöosa: {source.name}
              </label>
            )}
            {replace && (
              <p className="muted">
                Lähtöosa korvataan levyillä. Sen aiemmat mitta- ja apuviitteet jäävät puuttuviksi.
                Peru palauttaa lähtöosan viitteineen.
              </p>
            )}
            {!replace && source && (
              <p className="muted">
                Lähtöosa säilyy. Uusi runko syntyy yllä olevilla mitoilla ja sijainnilla.
              </p>
            )}
            <p className="muted">
              Kaikki mitat millimetreinä. Hyllyt jakavat vapaan korkeuden tasan. Liitoksia,
              porauksia ja sahausvaroja ei lisätä.
            </p>
          </fieldset>
        </div>
        <footer>
          <div>
            {candidate.error || submitError ? (
              <p role="alert">{candidate.error || submitError}</p>
            ) : (
              <p>
                {candidate.panels?.length} erillistä osaa · hyväksyminen on yksi peruttava muutos
              </p>
            )}
          </div>
          <button type="submit" className="button dark" disabled={blocked || !candidate.next}>
            {blocked ? 'Luodaan runkoa…' : 'Luo levyrunko'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
