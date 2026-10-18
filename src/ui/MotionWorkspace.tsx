import { useEffect, useMemo, useState } from 'react';
import { Crosshair, MoveRight, RotateCw, X, Plus, Trash2, Check, Play, Undo2 } from 'lucide-react';
import { bounds, uid, type Project, type Vec3 } from '../model/project';
import {
  motionError,
  motionSchema,
  motionWorld,
  setMotionWorld,
  type Motion,
  type MotionHit,
  type MotionPick,
  type MotionPlayback,
  type MotionViewport,
} from '../model/motion';

const axes: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const withMotion = (motions: Motion[] = [], motion: Motion) =>
  motions.some((m) => m.id === motion.id)
    ? motions.map((m) => (m.id === motion.id ? motion : m))
    : [...motions, motion];

export function useMotionWorkspace(
  project: Project,
  selectedIds: string[],
  busy: boolean,
  commit: (project: Project, label: string) => Promise<boolean>,
) {
  const [open, setOpen] = useState(false),
    [activeId, setActiveId] = useState<string>();
  const [draft, setDraft] = useState<Motion>(),
    [picking, setPicking] = useState<MotionPick>();
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState<MotionPlayback>({ serial: 0, targets: {} });
  const reset = () => setPlayback((p) => ({ serial: p.serial + 1, targets: {}, immediate: true }));
  const close = () => {
    setOpen(false);
    setDraft(undefined);
    setPicking(undefined);
    setError('');
    reset();
  };
  useEffect(() => {
    close();
  }, [project.id]);
  useEffect(() => {
    reset();
  }, [project.bodies, project.motions]);
  const all = useMemo(
    () => (draft ? withMotion(project.motions, draft) : (project.motions ?? [])),
    [project.motions, draft],
  );
  const active = all.find((m) => m.id === activeId);
  const anchor = active && project.bodies.find((b) => b.id === active.anchorId);
  const world = active && anchor ? motionWorld(active, anchor) : undefined;
  const change = (patch: Partial<Motion>) => {
    if (!active) return;
    setDraft({ ...active, ...patch });
    setError('');
    reset();
  };
  const activate = (id: string) => {
    if (draft) {
      if (id !== draft.id) setError('Tallenna tai peru nykyinen pivot ennen toisen muokkaamista.');
      return;
    }
    setActiveId(id);
    setDraft(undefined);
    setPicking(undefined);
    setError('');
  };
  const create = (kind: Motion['kind']) => {
    const ids = selectedIds.filter((id) => project.bodies.some((b) => b.id === id));
    const pivotParts = ids.map((id) => project.bodies.find((b) => b.id === id)!);
    const base = pivotParts[0] ?? project.bodies[0];
    if (!base) return;
    const moving = ids.slice(1),
      box = bounds(pivotParts.slice(1).length ? pivotParts.slice(1) : [base]);
    const m: Motion = {
      id: uid(),
      name: `${kind === 'hinge' ? 'Sarana' : 'Liuku'} ${(project.motions?.length ?? 0) + 1}`,
      kind,
      anchorId: base.id,
      movingIds: moving,
      pivot: [0, 0, 0],
      axis: kind === 'hinge' ? [0, 0, 1] : [0, -1, 0],
      amount: kind === 'hinge' ? 90 : 300,
      duration: 1,
      easing: 'smooth',
    };
    setDraft(setMotionWorld(m, base, box.min, m.axis));
    setActiveId(m.id);
    setPicking(ids.length >= 2 ? undefined : 'anchor');
    setError('');
    reset();
  };
  const pick = (mode?: MotionPick) => {
    setPicking(mode);
    reset();
  };
  const onPick = (hit: MotionHit) => {
    if (!active || !picking || busy) return;
    if (picking === 'anchor' && hit.bodyId) {
      const nextAnchor = project.bodies.find((b) => b.id === hit.bodyId)!;
      setDraft(
        setMotionWorld(
          {
            ...active,
            anchorId: hit.bodyId,
            movingIds: active.movingIds.filter((id) => id !== hit.bodyId),
          },
          nextAnchor,
          world?.pivot ?? nextAnchor.origin,
          world?.axis ?? axes[2],
        ),
      );
      setPicking('moving');
      setError('');
      return;
    }
    if (picking === 'moving' && hit.bodyId) {
      if (hit.bodyId === active.anchorId) {
        setError('Ankkuri pysyy paikallaan. Valitse toinen osa liikkumaan.');
        return;
      }
      change({
        movingIds: active.movingIds.includes(hit.bodyId)
          ? active.movingIds.filter((id) => id !== hit.bodyId)
          : [...active.movingIds, hit.bodyId],
      });
      return;
    }
    if (anchor && world && picking === 'pivot') {
      setDraft(setMotionWorld(active, anchor, hit.point, hit.axis ?? world.axis));
      setPicking(undefined);
      setError('');
    } else if (anchor && world && picking === 'axis') {
      const delta = hit.axis ?? (hit.point.map((n, i) => n - world.pivot[i]) as Vec3);
      if (Math.hypot(...delta) < 1e-6) {
        setError('Poimi suunta toisesta pisteestä tai reunasta.');
        return;
      }
      setDraft(setMotionWorld(active, anchor, world.pivot, delta));
      setPicking(undefined);
      setError('');
    }
  };
  const validMotions = useMemo(() => all.filter((m) => motionSchema.safeParse(m).success), [all]);
  const validation = motionError(validMotions, project.bodies);
  const viewport = useMemo<MotionViewport | undefined>(
    () =>
      open
        ? {
            motions: validation ? [] : validMotions,
            bodies: project.bodies,
            activeId,
            picking,
            playback,
            onPick,
            onActive: activate,
          }
        : undefined,
    [open, validation, validMotions, project.bodies, activeId, picking, playback, active, busy],
  );
  const play = (id: string, target: number, immediate = false) => {
    setPicking(undefined);
    setPlayback((p) => ({
      serial: p.serial + 1,
      targets: { ...p.targets, [id]: target },
      immediate,
      onlyId: id,
    }));
  };
  const save = async () => {
    if (!draft) return;
    const parsed = motionSchema.safeParse(draft);
    if (!draft.movingIds.length) {
      setError('Valitse vähintään yksi liikkuva osa.');
      return;
    }
    if (!parsed.success) {
      setError(
        parsed.error.issues.find((i) => i.code === 'custom')?.message ??
          'Anna nimi ja kelvolliset liikkeen mitat.',
      );
      return;
    }
    const motions = withMotion(project.motions, parsed.data);
    const problem = motionError(motions, project.bodies);
    if (problem) {
      setError(problem);
      return;
    }
    if (await commit({ ...project, motions }, 'Pivot ja liike tallennettu.')) {
      setDraft(undefined);
      setPicking(undefined);
      reset();
    }
  };
  const worldChange = (pivot: Vec3, axis: Vec3) => {
    if (active && anchor) {
      setDraft(setMotionWorld(active, anchor, pivot, axis));
      reset();
    }
  };
  const panel = open && (
    <aside className="inspector motion-inspector" aria-label="Pivotit ja animaatiot">
      <div className="motion-heading">
        <div>
          <strong>Pivotit ja animaatiot</strong>
          <small>Suljettu on mallinnettu lähtöasento</small>
        </div>
        <button aria-label="Sulje animaatiot" onClick={close}>
          <X size={18} />
        </button>
      </div>
      <div className="motion-create">
        <button
          disabled={busy || !project.bodies.length || !!draft}
          onClick={() => create('hinge')}
        >
          <Plus size={14} />
          <RotateCw size={15} /> Sarana
        </button>
        <button
          disabled={busy || !project.bodies.length || !!draft}
          onClick={() => create('slide')}
        >
          <MoveRight size={15} /> Liuku
        </button>
      </div>
      {!all.length && (
        <p className="muted">
          Valitse ankkuri ja liikkuvat osat mallista. Ovi tai kansi kiertyy saranan ympäri, laatikko
          liukuu suoraan.
        </p>
      )}
      <div className="motion-list" role="list" aria-label="Liikkeet">
        {all.map((m) => (
          <div key={m.id} role="listitem" className={m.id === activeId ? 'active' : ''}>
            <button
              className="motion-name"
              disabled={!!draft && draft.id !== m.id}
              onClick={() => {
                if (!draft) activate(m.id);
              }}
            >
              {m.kind === 'hinge' ? <RotateCw size={15} /> : <MoveRight size={15} />}
              <span>{m.name || 'Nimetön pivot'}</span>
            </button>
            <button
              aria-label={`${m.name}: ${playback.targets[m.id] ? 'Sulje' : 'Avaa'}`}
              disabled={
                !!validation || !m.movingIds.length || busy || (!!draft && draft.id !== m.id)
              }
              onClick={() => play(m.id, playback.targets[m.id] ? 0 : 1)}
            >
              {playback.targets[m.id] ? 'Sulje' : 'Avaa'}
            </button>
          </div>
        ))}
      </div>
      {!!all.length && (
        <button className="button motion-reset" onClick={reset}>
          <Undo2 size={14} /> Palauta kaikki suljetuiksi
        </button>
      )}
      {active && anchor && world && (
        <div className="motion-fields">
          <label>
            Pivotin nimi
            <input
              aria-label="Pivotin nimi"
              maxLength={120}
              value={active.name}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <small className="motion-id" title={active.id}>
            ID: {active.id}
          </small>
          <label>
            Ankkuri
            <select
              aria-label="Liikkeen ankkuri"
              value={active.anchorId}
              onChange={(e) => {
                const next = project.bodies.find((b) => b.id === e.target.value)!;
                setDraft(
                  setMotionWorld(
                    {
                      ...active,
                      anchorId: next.id,
                      movingIds: active.movingIds.filter((id) => id !== next.id),
                    },
                    next,
                    world.pivot,
                    world.axis,
                  ),
                );
                reset();
              }}
            >
              {project.bodies.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <div className="motion-row">
            <button
              aria-pressed={picking === 'anchor'}
              onClick={() => pick(picking === 'anchor' ? undefined : 'anchor')}
            >
              Poimi ankkuri
            </button>
            <button
              aria-pressed={picking === 'moving'}
              onClick={() => pick(picking === 'moving' ? undefined : 'moving')}
            >
              Poimi liikkuvat osat
            </button>
          </div>
          <label>
            Liikkuvat osat · {active.movingIds.length}
            <select
              aria-label="Lisää liikkuva osa"
              value=""
              onChange={(e) => {
                if (e.target.value) change({ movingIds: [...active.movingIds, e.target.value] });
              }}
            >
              <option value="">Lisää osa…</option>
              {project.bodies
                .filter((b) => b.id !== active.anchorId && !active.movingIds.includes(b.id))
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          <ul className="motion-members">
            {active.movingIds.map((id) => (
              <li key={id}>
                <span title={id}>{project.bodies.find((b) => b.id === id)?.name}</span>
                <button
                  aria-label={`Poista liikkeestä ${project.bodies.find((b) => b.id === id)?.name}`}
                  onClick={() => change({ movingIds: active.movingIds.filter((i) => i !== id) })}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
          <button
            disabled={!selectedIds.some((id) => id !== active.anchorId)}
            onClick={() =>
              change({
                movingIds: [
                  ...new Set([
                    ...active.movingIds,
                    ...selectedIds.filter((id) => id !== active.anchorId),
                  ]),
                ],
              })
            }
          >
            Lisää nykyinen valinta liikkeeseen
          </button>
          <div className="motion-row">
            <button
              aria-pressed={picking === 'pivot'}
              onClick={() => pick(picking === 'pivot' ? undefined : 'pivot')}
            >
              <Crosshair size={14} /> Poimi pivot / reuna
            </button>
            <button
              aria-pressed={picking === 'axis'}
              onClick={() => pick(picking === 'axis' ? undefined : 'axis')}
            >
              Poimi akseli
            </button>
          </div>
          <div className="motion-coordinates">
            {['X', 'Y', 'Z'].map((axis, i) => (
              <label key={axis}>
                Pivot {axis}
                <input
                  aria-label={`Pivot ${axis}`}
                  type="number"
                  step="any"
                  value={Number(world.pivot[i].toFixed(5))}
                  onChange={(e) => {
                    const p = [...world.pivot] as Vec3;
                    p[i] = Number(e.target.value);
                    worldChange(p, world.axis);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="motion-row" role="group" aria-label="Liikkeen akseli">
            {axes.map((axis, i) => (
              <button
                key={i}
                aria-pressed={Math.abs(world.axis[i]) > 0.999999}
                onClick={() => worldChange(world.pivot, axis)}
              >
                {['X', 'Y', 'Z'][i]}
              </button>
            ))}
            <button onClick={() => worldChange(world.pivot, world.axis.map((n) => -n) as Vec3)}>
              Vaihda suunta
            </button>
          </div>
          <label>
            {active.kind === 'hinge' ? 'Auki · kulma (°)' : 'Auki · matka (mm)'}
            <input
              aria-label="Avautumismäärä"
              type="number"
              step="any"
              value={active.amount}
              onChange={(e) => change({ amount: Number(e.target.value) })}
            />
          </label>
          <div className="motion-coordinates">
            <label>
              Kesto (s)
              <input
                aria-label="Liikkeen kesto"
                type="number"
                min="0.1"
                max="30"
                step="0.1"
                value={active.duration}
                onChange={(e) => change({ duration: Number(e.target.value) })}
              />
            </label>
            <label>
              Liike
              <select
                aria-label="Liikkeen ajoitus"
                value={active.easing}
                onChange={(e) => change({ easing: e.target.value as Motion['easing'] })}
              >
                <option value="smooth">Pehmeä</option>
                <option value="linear">Tasainen</option>
              </select>
            </label>
          </div>
          <label>
            Asento · {Math.round((playback.targets[active.id] ?? 0) * 100)} %
            <input
              aria-label="Liikkeen asento"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={playback.targets[active.id] ?? 0}
              disabled={!!validation || !active.movingIds.length}
              onChange={(e) => play(active.id, Number(e.target.value), true)}
            />
          </label>
          <div className="motion-row">
            <button
              disabled={!!validation || !active.movingIds.length}
              onClick={() => play(active.id, 0)}
            >
              Suljettu
            </button>
            <button
              disabled={!!validation || !active.movingIds.length}
              onClick={() => play(active.id, 1)}
            >
              <Play size={14} /> Auki
            </button>
          </div>
          {draft ? (
            <div className="motion-row">
              <button className="button dark" disabled={busy} onClick={() => void save()}>
                <Check size={14} /> Tallenna pivot
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setDraft(undefined);
                  setPicking(undefined);
                  setError('');
                  reset();
                }}
              >
                Peru määritys
              </button>
            </div>
          ) : (
            <button
              className="motion-delete"
              disabled={busy}
              onClick={async () => {
                if (
                  await commit(
                    { ...project, motions: project.motions?.filter((m) => m.id !== active.id) },
                    'Pivot poistettu. Osat säilyvät.',
                  )
                ) {
                  setActiveId(undefined);
                  reset();
                }
              }}
            >
              <Trash2 size={14} /> Poista pivot
            </button>
          )}
        </div>
      )}
      {picking && (
        <p className="motion-pick-hint" role="status">
          {
            {
              anchor: 'Napsauta kiinteää ankkuriosaa.',
              moving: 'Napsauta liikkuvia osia. Uusi napsautus poistaa osan valinnasta.',
              pivot: 'Poimi piste tai suora reuna. Reuna määrittää myös sarana-akselin.',
              axis: 'Poimi suora reuna tai toinen piste pivotista katsottuna.',
            }[picking]
          }
        </p>
      )}
      {(error || validation) && <p role="alert">{error || validation}</p>}
      <p className="muted motion-footnote">
        GLB-vienti sisältää pivotit, osien tunnisteet sekä Avaa- ja Sulje-animaatiot. Esikatselu
        palautuu suljetuksi, kun palaat mallintamaan.
      </p>
    </aside>
  );
  return {
    open,
    close,
    start: () => {
      setOpen(true);
      setActiveId(project.motions?.[0]?.id);
      reset();
    },
    viewport,
    panel,
    active,
    draft,
    picking,
  };
}
