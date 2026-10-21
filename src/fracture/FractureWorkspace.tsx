import { useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { Focus, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { Body, Project, Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { fromBodyMesh, meshBounds } from '../surface/mesh';
import { fractureObstacles, fragmentBodies, restPoses } from './project';
import { FractureStage } from './FractureStage';
import { DirectionControl } from './DirectionControl';
import type { FractureReply, FractureRequest, FractureResult, Pose } from './types';
import './fracture.css';

export default function FractureWorkspace({
  source,
  mesh,
  meshes,
  project,
  launchDirection,
  onClose,
  onSave,
}: {
  source: Body;
  mesh: BodyMesh;
  meshes: BodyMesh[];
  project: Project;
  launchDirection?: Vec3;
  onClose: () => void;
  onSave: (bodies: Body[]) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<FractureStage | undefined>(undefined),
    worker = useRef<Worker | undefined>(undefined);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useMemo(() => fromBodyMesh(source, mesh), [source, mesh]);
  const box = useMemo(() => meshBounds(input), [input]);
  const [count, setCount] = useState(24),
    [seed, setSeed] = useState(1),
    [irregularity, setIrregularity] = useState(0.8);
  const [local, setLocal] = useState(false),
    [normal, setNormal] = useState<Vec3>([1, 0, 0]);
  const [end, setEnd] = useState(box.max[0]),
    [depth, setDepth] = useState(Math.max(1, box.size[0] * 0.3));
  const [result, setResult] = useState<FractureResult>(),
    [poses, setPoses] = useState<Pose[]>([]);
  const [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const [progress, setProgress] = useState(0),
    [running, setRunning] = useState(false),
    [started, setStarted] = useState(false);
  const [seconds, setSeconds] = useState(0),
    [keepLoose, setKeepLoose] = useState(true),
    [spread, setSpread] = useState(0.12);
  const [interior, setInterior] = useState('#a49c8e'),
    [ground, setGround] = useState(Math.min(0, box.min[2] + source.origin[2]));
  const [kick, setKick] = useState(0.8);
  const [directed, setDirected] = useState(!!launchDirection),
    [direction, setDirection] = useState<Vec3>(launchDirection ?? [0, 1, 0]),
    [speed, setSpeed] = useState(3),
    [cone, setCone] = useState(20),
    [gravityDirection, setGravityDirection] = useState<Vec3>([0, 0, -1]),
    [gravityStrength, setGravityStrength] = useState(9.81),
    [auxiliaryFloor, setAuxiliaryFloor] = useState(true),
    [pickingDirection, setPickingDirection] = useState(false);
  const [ragged, setRagged] = useState(true);
  const [context, setContext] = useState<ReturnType<typeof fractureObstacles>>([]);
  const [sceneError, setSceneError] = useState('');
  const [atLimit, setAtLimit] = useState(false);
  const pick = useRef<(normal: Vec3, point: Vec3, sourceHit: boolean) => void>(() => {});
  const stopWorker = () => {
    clearTimeout(timeout.current);
    worker.current?.terminate();
    worker.current = undefined;
  };
  const invalidate = () => {
    stopWorker();
    setResult(undefined);
    setPoses([]);
    setBusy(false);
    setRunning(false);
    setStarted(false);
    setSeconds(0);
    setAtLimit(false);
    setError('');
  };
  pick.current = (n, point, sourceHit) => {
    if (busy || running || saving || started) return;
    if (pickingDirection) {
      setDirection(n.map((v) => -v) as Vec3);
      setPickingDirection(false);
      return;
    }
    if (!local || result || !sourceHit) return;
    invalidate();
    setLocal(true);
    setNormal(n);
    setEnd(new Vector3(...n).dot(new Vector3(...point)));
  };
  useEffect(() => {
    dialog.current?.showModal();
    try {
      stage.current = new FractureStage(canvas.current!, source, input, (n, p, sourceHit) =>
        pick.current(n, p, sourceHit),
      );
    } catch {
      setError('Rikkomisen esikatselu tarvitsee toimivan WebGL2-näkymän.');
    }
    try {
      const obstacles = fractureObstacles(source, meshes, project);
      setContext(obstacles);
      // Real floor geometry is authoritative, including basements. No invisible Z=0 collider.
      setAuxiliaryFloor(obstacles.length === 0);
      stage.current?.setObstacles(obstacles);
    } catch (e) {
      setSceneError((e as Error).message);
    }
    return () => {
      stopWorker();
      stage.current?.dispose();
    };
  }, []);
  useEffect(() => {
    stage.current?.show(result, interior);
  }, [result]);
  useEffect(() => stage.current?.setInterior(interior), [result, interior]);
  useEffect(() => {
    if (result) stage.current?.setPoses(poses, result, keepLoose, started ? 0 : spread);
  }, [poses, result, keepLoose, spread, started]);
  useEffect(() => {
    stage.current?.setRegion(local && !result ? { normal, offset: end - depth } : undefined);
  }, [local, normal, end, depth, result]);
  useEffect(() => {
    stage.current?.setGround(auxiliaryFloor ? ground - source.origin[2] : undefined);
  }, [ground, auxiliaryFloor]);
  useEffect(() => {
    stage.current?.setDirections(
      directed ? direction : undefined,
      gravityStrength ? gravityDirection : undefined,
    );
  }, [directed, direction, gravityDirection, gravityStrength]);
  const post = (message: FractureRequest) => worker.current?.postMessage(message);
  const startWorker = () => {
    stopWorker();
    const next = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = next;
    const fail = (message: string) => {
      stopWorker();
      setError(message);
      setBusy(false);
      setRunning(false);
    };
    next.onerror = () =>
      fail('Rikkomisen laskentamoduuli ei käynnistynyt. Päivitä sivu ja yritä uudelleen.');
    next.onmessage = ({ data }: MessageEvent<FractureReply>) => {
      if (worker.current !== next) return;
      if (data.type === 'progress') setProgress(data.value);
      else if (data.type === 'error') fail(data.message);
      else if (data.type === 'result') {
        clearTimeout(timeout.current);
        setBusy(false);
        setResult(data.result);
        setPoses(restPoses(data.result));
      } else {
        clearTimeout(timeout.current);
        setBusy(false);
        setPoses(data.poses);
        setSeconds(data.time);
        setRunning(!data.stopped);
        setAtLimit(!!data.limitReached);
      }
    };
    timeout.current = setTimeout(
      () =>
        fail(
          'Laskenta keskeytettiin 45 sekunnin jälkeen. Kokeile pienempää palamäärää tai yksinkertaisempaa osaa.',
        ),
      45000,
    );
  };
  const generate = (nextSeed = seed) => {
    invalidate();
    setBusy(true);
    setProgress(0);
    setStarted(false);
    setKeepLoose(true);
    startWorker();
    post({
      type: 'fracture',
      mesh: input,
      options: {
        ragged,
        count,
        seed: nextSeed,
        irregularity,
        region: local ? { normal, offset: end - depth } : undefined,
      },
    });
  };
  const simulate = () => {
    if (!result) return;
    setError('');
    if (started && worker.current) {
      post({ type: 'resume' });
      setRunning(true);
      return;
    }
    setStarted(true);
    setKeepLoose(true);
    setBusy(true);
    setRunning(true);
    setPickingDirection(false);
    startWorker();
    post({
      type: 'simulate',
      result,
      obstacles: context,
      ground: auxiliaryFloor ? ground - source.origin[2] : undefined,
      kick: directed ? 0 : kick,
      motion: {
        direction,
        speed: directed ? speed : 0,
        spread: directed ? cone : 0,
        gravity: gravityDirection.map((n) => n * gravityStrength) as Vec3,
      },
      worldOrigin: source.origin,
    });
  };
  const reset = () => {
    stopWorker();
    setRunning(false);
    setBusy(false);
    setStarted(false);
    setSeconds(0);
    setAtLimit(false);
    if (result) setPoses(restPoses(result));
  };
  const save = async () => {
    if (!result) return;
    setSaving(true);
    setError('');
    post({ type: 'pause' });
    setRunning(false);
    try {
      if (await onSave(fragmentBodies(source, result, poses, interior, keepLoose))) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const chooseEnd = (value: string) => {
    invalidate();
    const axis = Number(value[0]),
      sign = value[1] === '+' ? 1 : -1;
    const n: Vec3 = [0, 0, 0];
    n[axis] = sign;
    setNormal(n);
    setEnd(sign > 0 ? box.max[axis] : -box.min[axis]);
    setDepth(Math.max(0.1, box.size[axis] * 0.3));
  };
  return (
    <dialog
      ref={dialog}
      className="fracture-dialog"
      aria-label={launchDirection ? 'Murenna ja heitä' : 'Riko ja pudota'}
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <header>
        <div>
          <strong>{launchDirection ? 'Murenna ja heitä' : 'Riko ja pudota'}</strong>
          <span>{source.name}</span>
        </div>
        <button aria-label="Sulje rikkominen" disabled={saving} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="fracture-layout">
        <div className="fracture-view">
          <canvas ref={canvas} aria-label="Rikkomisen esikatselu" />
          <button
            className="fracture-fit"
            title="Sovita palat näkymään"
            aria-label="Sovita palat näkymään"
            onClick={() => stage.current?.resetCamera()}
          >
            <Focus size={18} />
          </button>
          <div className="fracture-direction-legend">
            {directed && <span className="launch">↗ Heitto</span>}
            {gravityStrength > 0 && <span className="gravity">↓ Painovoima</span>}
            {pickingDirection && <strong>Napsauta pintaa · heitto pinnan sisään</strong>}
          </div>
          <div className="fracture-caption">
            {result
              ? `${result.fragments.filter((p) => !p.fixed).length} irtopalaa${started ? ` · ${seconds.toFixed(1)} s` : ''}`
              : local
                ? 'Poimi rikottava pääty napsauttamalla pintaa. Vedä kiertääksesi näkymää.'
                : 'Valittu osa murennetaan. Vedä kiertääksesi näkymää.'}
          </div>
        </div>
        <aside>
          <details open={!result} className="fracture-settings">
            <summary>
              Mureneminen
              {result ? ` · ${result.fragments.filter((p) => !p.fixed).length} palaa` : ''}
            </summary>
            <fieldset disabled={busy || saving || running}>
              <legend>Rikottava alue</legend>
              <div className="fracture-buttons">
                <button
                  aria-pressed={!local}
                  onClick={() => {
                    invalidate();
                    setLocal(false);
                  }}
                >
                  Koko osa
                </button>
                <button
                  aria-pressed={local}
                  onClick={() => {
                    invalidate();
                    setLocal(true);
                  }}
                >
                  Pääty
                </button>
              </div>
              {local && (
                <>
                  <label>
                    Pääty
                    <select
                      aria-label="Rikottava pääty"
                      value={
                        normal.some((n) => Math.abs(n) === 1)
                          ? `${normal.findIndex((n) => Math.abs(n) === 1)}${normal.find((n) => n !== 0)! > 0 ? '+' : '-'}`
                          : 'picked'
                      }
                      onChange={(e) => chooseEnd(e.target.value)}
                    >
                      <option value="picked" disabled>
                        Poimittu pinta
                      </option>
                      {(['X', 'Y', 'Z'] as const).flatMap((axis, i) =>
                        ['+', '-'].map((sign) => (
                          <option key={axis + sign} value={`${i}${sign}`}>
                            {axis}
                            {sign}
                          </option>
                        )),
                      )}
                    </select>
                  </label>
                  <label>
                    Syvyys (mm)
                    <input
                      aria-label="Rikkomisen syvyys"
                      type="number"
                      min="0.1"
                      max="100000"
                      step="1"
                      value={depth}
                      onChange={(e) => {
                        invalidate();
                        setDepth(Number(e.target.value));
                      }}
                    />
                  </label>
                </>
              )}
              {local && (
                <label className="fracture-check">
                  <input
                    type="checkbox"
                    checked={ragged}
                    onChange={(e) => {
                      invalidate();
                      setRagged(e.target.checked);
                    }}
                  />
                  Rosoinen murtoreuna
                </label>
              )}
              <label>
                Palojen määrä
                <input
                  aria-label="Palojen määrä"
                  type="number"
                  min="2"
                  max="80"
                  value={count}
                  onChange={(e) => {
                    invalidate();
                    setCount(Number(e.target.value));
                  }}
                />
              </label>
              <label>
                Epäsäännöllisyys
                <input
                  aria-label="Epäsäännöllisyys"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={irregularity}
                  onChange={(e) => {
                    invalidate();
                    setIrregularity(Number(e.target.value));
                  }}
                />
              </label>
              <label>
                Murtopinnan väri
                <input
                  type="color"
                  aria-label="Murtopinnan väri"
                  value={interior}
                  onChange={(e) => setInterior(e.target.value)}
                />
              </label>
              <div className="fracture-buttons">
                <button className="fracture-primary" onClick={() => generate()}>
                  Muodosta palat
                </button>
                <button
                  title="Vaihda rikkomiskuvion satunnaislukua"
                  onClick={() => {
                    setSeed(seed + 1);
                    generate(seed + 1);
                  }}
                >
                  Uusi kuvio
                </button>
              </div>
            </fieldset>
          </details>
          {result && (
            <>
              <fieldset disabled={busy || saving || running}>
                <legend>Palat</legend>
                {!started && (
                  <label>
                    Esikatselun levitys
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={spread}
                      onChange={(e) => setSpread(Number(e.target.value))}
                    />
                  </label>
                )}
                <label className="fracture-check">
                  <input
                    type="checkbox"
                    checked={keepLoose}
                    disabled={!result.fragments.some((p) => p.fixed)}
                    onChange={(e) => setKeepLoose(e.target.checked)}
                  />
                  Säilytä irtopalat
                </label>
              </fieldset>
              <fieldset disabled={busy || saving}>
                <legend>Liike</legend>
                <fieldset disabled={started}>
                  <div className="fracture-buttons">
                    <button
                      aria-pressed={!directed}
                      onClick={() => {
                        setDirected(false);
                        setPickingDirection(false);
                      }}
                    >
                      Pudotus
                    </button>
                    <button aria-pressed={directed} onClick={() => setDirected(true)}>
                      Suunnattu heitto
                    </button>
                  </div>
                  {directed ? (
                    <>
                      <DirectionControl
                        label="Heiton suunta"
                        value={direction}
                        onChange={setDirection}
                      />
                      <div className="fracture-buttons">
                        <button
                          aria-pressed={pickingDirection}
                          onClick={() => setPickingDirection(!pickingDirection)}
                        >
                          Poimi pinnasta
                        </button>
                        <button onClick={() => setDirection(direction.map((n) => -n) as Vec3)}>
                          Käännä heitto
                        </button>
                      </div>
                      <label>
                        Nopeus (m/s)
                        <input
                          aria-label="Heiton nopeus"
                          type="number"
                          min="0"
                          max="20"
                          step="0.5"
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Hajonta °
                        <input
                          aria-label="Heiton hajonta"
                          type="number"
                          min="0"
                          max="90"
                          step="5"
                          value={cone}
                          onChange={(e) => setCone(Number(e.target.value))}
                        />
                      </label>
                    </>
                  ) : (
                    <label>
                      Tönäisy (m/s)
                      <input
                        type="number"
                        min="0"
                        max="3"
                        step="0.1"
                        value={kick}
                        onChange={(e) => setKick(Number(e.target.value))}
                      />
                    </label>
                  )}
                  <details className="fracture-gravity">
                    <summary>
                      Painovoima · {gravityStrength === 0 ? 'pois' : `${gravityStrength} m/s²`}
                    </summary>
                    <DirectionControl
                      label="Painovoiman suunta"
                      value={gravityDirection}
                      onChange={setGravityDirection}
                    />
                    <label>
                      Voimakkuus (m/s²)
                      <input
                        aria-label="Painovoiman voimakkuus"
                        type="number"
                        min="0"
                        max="30"
                        step="0.1"
                        value={gravityStrength}
                        onChange={(e) => setGravityStrength(Number(e.target.value))}
                      />
                    </label>
                    <button
                      onClick={() => {
                        setGravityDirection([0, 0, -1]);
                        setGravityStrength(9.81);
                      }}
                    >
                      Normaali painovoima
                    </button>
                  </details>
                  <label className="fracture-check">
                    <input
                      type="checkbox"
                      checked={auxiliaryFloor}
                      onChange={(e) => setAuxiliaryFloor(e.target.checked)}
                    />
                    Apulattia
                  </label>
                  {auxiliaryFloor && (
                    <label>
                      Lattian korkeus Z (mm)
                      <input
                        type="number"
                        min="-100000"
                        max="100000"
                        value={ground}
                        onChange={(e) => setGround(Number(e.target.value))}
                      />
                    </label>
                  )}
                  <small>Näkyvät mallin osat toimivat törmäyspintoina.</small>
                </fieldset>
                <div className="fracture-buttons">
                  <button
                    disabled={!!sceneError || atLimit}
                    onClick={
                      running
                        ? () => {
                            post({ type: 'pause' });
                            // Accept becomes available only after the worker acknowledges
                            // the exact paused pose, never an earlier in-flight frame.
                          }
                        : simulate
                    }
                  >
                    {running ? <Pause size={15} /> : <Play size={15} />}{' '}
                    {running ? 'Tauko' : started ? 'Jatka' : directed ? 'Heitä palat' : 'Pudota'}
                  </button>
                  <button onClick={reset} title="Palauta palat lähtöasentoon">
                    <RotateCcw size={15} /> Palauta
                  </button>
                </div>
              </fieldset>
            </>
          )}
          {busy && (
            <p role="status">
              {started
                ? 'Valmistellaan törmäykset…'
                : `Muodostetaan paloja… ${Math.round(progress * 100)} %`}
            </p>
          )}
          {(error || sceneError) && <p role="alert">{error || sceneError}</p>}
          {atLimit && (
            <p role="status">
              Simulaatio pysähtyi mallinnusalueen rajalle. Hyväksy nykyinen asento tai palauta
              palat.
            </p>
          )}
          <small>
            Alkuperäinen osa säilytetään piilotettuna. Ulkopintojen materiaalit säilyvät mallissa.
            Palat tallennetaan erillisinä kolmiomalleina.
          </small>
          {result && (
            <small>
              Levitys on vain esikatselua. Simulaatiossa käytetään palojen yksinkertaistettuja
              törmäysmuotoja.
            </small>
          )}
        </aside>
      </div>
      <footer>
        <button disabled={saving} onClick={onClose}>
          Peru
        </button>
        <button
          className="fracture-primary"
          disabled={!result || busy || saving || running}
          onClick={() => void save()}
        >
          {saving ? 'Tallennetaan…' : 'Hyväksy nykyinen asento'}
        </button>
      </footer>
    </dialog>
  );
}
