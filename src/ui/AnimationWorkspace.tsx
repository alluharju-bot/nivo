import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Matrix4, Vector3 } from 'three';
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  Copy,
  ClipboardPaste,
  X,
  Crosshair,
  Download,
} from 'lucide-react';
import { uid, type Project, type Vec3 } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { bodyLocked } from '../model/groups';
import {
  animationNodeName,
  degreesRotation,
  ensureAnimationNodes,
  evaluateAnimation,
  nodeBodyIds,
  poseDegrees,
  poseSchema,
  putKey,
  rebaseAnimationPivot,
  transformAnimationNodes,
  type AnimationClip,
  type AnimationData,
  type AnimationKey,
  type Pose,
  type PoseMap,
} from '../model/animation';
import { animationPicking } from '../model/animationPose';
import {
  animationKeyToken,
  selectedAnimationKeys,
  shiftAnimationKeys,
  editAnimationKeys,
  type AnimationKeyRef,
} from '../model/animationKeys';

export interface AnimationViewport {
  data: AnimationData;
  clip?: AnimationClip;
  time: number;
  playing: boolean;
  speed: number;
  matrices: Map<string, Matrix4>;
  bodies: Project['bodies'];
  meshes: BodyMesh[];
  picking: boolean;
  onPick: (point: Vec3) => void;
  onFrame: (time: number) => void;
  onEnd: (time: number) => void;
}
export function useAnimationWorkspace(
  project: Project,
  meshes: BodyMesh[],
  busy: boolean,
  commit: (project: Project, label: string) => Promise<boolean>,
  selectedIds: string[],
  selectedGroupId: string | undefined,
) {
  const [open, setOpen] = useState(false),
    [clipId, setClipId] = useState<string>(),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [drafts, setDrafts] = useState<PoseMap>({}),
    [error, setError] = useState(''),
    [picking, setPicking] = useState(false);
  const [keySelection, setKeySelection] = useState<{
      clipId: string;
      refs: AnimationKeyRef[];
      primary?: AnimationKeyRef;
    }>(),
    [clipboard, setClipboard] = useState<AnimationKey>();
  const timeRef = useRef(0),
    timeOutput = useRef<HTMLOutputElement>(null),
    playhead = useRef<HTMLDivElement>(null),
    scrubber = useRef<HTMLInputElement>(null);
  const data = useMemo(
    () => (open ? ensureAnimationNodes(project) : project.animation),
    [open, project.animation, project.bodies, project.groups],
  );
  const clip = data?.clips.find((c) => c.id === clipId) ?? data?.clips[0];
  const selectedKeys = useMemo(
    () =>
      clip && keySelection?.clipId === clip.id
        ? selectedAnimationKeys(clip, keySelection.refs)
        : [],
    [clip, keySelection],
  );
  const primaryKey =
    selectedKeys.find(
      (e) =>
        animationKeyToken(e) === (keySelection?.primary && animationKeyToken(keySelection.primary)),
    ) ?? selectedKeys[0];
  const selectKeys = (refs: AnimationKeyRef[], primary = refs.at(-1)) =>
    setKeySelection(clip ? { clipId: clip.id, refs, primary } : undefined);
  const clearKeys = () => setKeySelection(undefined);
  const active = selectedGroupId
    ? data?.nodes.find((n) => n.groupId === selectedGroupId)
    : data?.nodes.find((n) => n.bodyId === selectedIds[0]);
  const targets = data
    ? selectedGroupId && active
      ? [active.id]
      : data.nodes.filter((n) => n.bodyId && selectedIds.includes(n.bodyId)).map((n) => n.id)
    : [];
  const evaluation = useMemo(
    () => (data ? evaluateAnimation(data, clip, time, drafts) : undefined),
    [data, clip, time, drafts],
  );
  const posed = useMemo(
    () =>
      open && evaluation
        ? animationPicking(project.bodies, meshes, evaluation.bodyMatrices)
        : { bodies: project.bodies, meshes },
    [open, project.bodies, meshes, evaluation],
  );
  const dirty = Object.keys(drafts).length > 0;
  const reset = (clearKey = true) => {
    setPlaying(false);
    setPicking(false);
    setDrafts({});
    if (clearKey) clearKeys();
  };
  const close = () => {
    reset();
    setOpen(false);
    setTime(0);
    timeRef.current = 0;
    setError('');
  };
  useEffect(() => {
    close();
    setClipId(undefined);
  }, [project.id]);
  useEffect(() => {
    reset(false);
    setTime((t) => Math.min(t, clip?.duration ?? 0));
  }, [project.animation, project.bodies]);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  const seek = (value: number, clearSelection = true) => {
    if (!Number.isFinite(value)) return;
    reset(clearSelection);
    const next = Math.max(0, Math.min(clip?.duration ?? 0, value));
    timeRef.current = next;
    setTime(next);
    setError('');
  };
  const commitData = async (value: AnimationData, label: string) => {
    if (busy) return false;
    const ok = await commit({ ...project, animation: value }, label);
    if (ok) {
      reset(false);
      setError('');
    }
    return ok;
  };
  const saveClip = (value: AnimationClip, label: string) =>
    data &&
    commitData({ ...data, clips: data.clips.map((c) => (c.id === value.id ? value : c)) }, label);
  const shiftKeys = async (
    refs: AnimationKeyRef[],
    delta: number,
    primary: AnimationKeyRef | undefined = primaryKey,
  ) => {
    if (!clip || busy || playing) return;
    try {
      const result = shiftAnimationKeys(clip, refs, delta);
      if (result.clip === clip) return;
      const count = selectedAnimationKeys(clip, refs).length;
      if (await saveClip(result.clip, `Animaation ajoitus muutettu · ${count} avainta`)) {
        const reference = primary && selectedAnimationKeys(result.clip, [primary])[0];
        // The clip can grow beyond its old duration; do not clamp against the stale closure.
        const nextTime = reference?.key.time ?? Math.min(time, result.clip.duration);
        timeRef.current = nextTime;
        setTime(nextTime);
        selectKeys(refs, primary);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const moveKey = (nodeId: string, key: AnimationKey, nextTime: number) =>
    shiftKeys([{ nodeId, keyId: key.id }], nextTime - key.time, { nodeId, keyId: key.id });
  const changeKeyInterpolation = async (interpolation: AnimationKey['interpolation']) => {
    if (!clip || busy || playing) return;
    await saveClip(
      editAnimationKeys(clip, selectedKeys, (key) => ({ ...key, interpolation })),
      'Animaation interpolointi muutettu.',
    );
  };
  const deleteKeys = async () => {
    if (!clip || !selectedKeys.length || busy || playing) return;
    if (
      await saveClip(
        editAnimationKeys(clip, selectedKeys, () => undefined),
        `Animaatioavaimet poistettu · ${selectedKeys.length}`,
      )
    )
      clearKeys();
  };
  const createClip = async () => {
    const next = ensureAnimationNodes(project);
    const c: AnimationClip = {
      id: uid(),
      name: `Animaatio ${next.clips.length + 1}`,
      duration: 3.5,
      loop: false,
      tracks: [],
      markers: [],
    };
    if (await commitData({ ...next, clips: [...next.clips, c] }, 'Animaatioklippi lisätty.')) {
      setClipId(c.id);
      seek(0);
    }
  };
  const guard = (nodeIds: string[]) => {
    if (!data || !nodeIds.length) throw new Error('Valitse ensin animoitava osa tai ryhmä.');
    const ids = new Set(nodeIds.flatMap((id) => nodeBodyIds(data, id)));
    if (project.bodies.some((b) => ids.has(b.id) && bodyLocked(b, project.groups)))
      throw new Error('Vapauta valinnan Hold-lukitus ennen asennon muuttamista.');
  };
  const addKey = async (paste = false) => {
    try {
      if (playing) throw new Error('Tauota toisto ennen avaimen tallentamista.');
      if (!clip || !data || !evaluation) throw new Error('Luo ensin animaatioklippi.');
      guard(targets);
      let next = clip;
      for (const nodeId of targets) {
        const existing = clip.tracks
          .find((t) => t.nodeId === nodeId)
          ?.keys.find((k) => Math.abs(k.time - time) < 1e-6);
        next = putKey(next, nodeId, {
          id: existing?.id ?? uid(),
          time,
          pose: paste && clipboard ? clipboard.pose : evaluation.local.get(nodeId)!,
          interpolation:
            paste && clipboard ? clipboard.interpolation : (existing?.interpolation ?? 'smooth'),
        });
      }
      await saveClip(
        next,
        `${paste ? 'Liitetty' : 'Tallennettu'} animaatioavain · ${time.toFixed(2)} s · ${targets.length} raitaa`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const transform = (ids: string[], delta: Matrix4) => {
    if (!data || !clip) throw new Error('Luo ensin animaatioklippi.');
    const nodeIds =
      active?.groupId &&
      ids.length === nodeBodyIds(data, active.id).length &&
      nodeBodyIds(data, active.id).every((id) => ids.includes(id))
        ? [active.id]
        : data.nodes.filter((n) => n.bodyId && ids.includes(n.bodyId)).map((n) => n.id);
    guard(nodeIds);
    setPlaying(false);
    setDrafts(transformAnimationNodes(data, clip, time, drafts, nodeIds, delta));
    clearKeys();
  };
  const changePose = (pose: Pose) => {
    try {
      if (!active) return;
      guard([active.id]);
      poseSchema.parse(pose);
      setPlaying(false);
      setDrafts((d) => ({ ...d, [active.id]: pose }));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const changePivot = async (point: Vec3) => {
    if (!data || !active || !evaluation) return;
    try {
      guard([active.id]);
      // Picking occurs in the currently evaluated world, rebase in the rest frame.
      const delta = evaluation.world
        .get(active.id)!
        .clone()
        .multiply(evaluation.restWorld.get(active.id)!.clone().invert());
      const restPoint = new Vector3(...point).applyMatrix4(delta.invert()).toArray() as Vec3;
      await commitData(
        rebaseAnimationPivot(data, active.id, restPoint),
        'Animaation pivot asetettu. Avainasennot säilyvät; tarkista väliliike.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const onFrame = (next: number) => {
    timeRef.current = next;
    if (timeOutput.current) timeOutput.current.value = `${next.toFixed(2)} s`;
    if (scrubber.current) scrubber.current.value = String(next);
    if (playhead.current) playhead.current.style.left = `${(100 * next) / (clip?.duration ?? 1)}%`;
  };
  const stop = () => seek(0);
  const pause = () => {
    setPlaying(false);
    setTime(timeRef.current);
  };
  const play = () => {
    if (!clip) return;
    setDrafts({});
    setPicking(false);
    const start =
      speed >= 0 && timeRef.current >= clip.duration
        ? 0
        : speed < 0 && timeRef.current <= 0
          ? clip.duration
          : timeRef.current;
    setTime(start);
    timeRef.current = start;
    setPlaying(true);
  };
  const viewport = useMemo<AnimationViewport | undefined>(
    () =>
      open && data && evaluation
        ? {
            data,
            clip,
            time,
            playing,
            speed,
            matrices: evaluation.bodyMatrices,
            ...posed,
            picking,
            onPick: (point) => void changePivot(point),
            onFrame,
            onEnd: (next) => {
              setPlaying(false);
              setTime(next);
              timeRef.current = next;
            },
          }
        : undefined,
    [open, data, clip, time, playing, speed, posed, picking, evaluation],
  );
  const key = selectedKeys.length === 1 ? selectedKeys[0].key : undefined;
  return {
    open,
    start: () => {
      setOpen(true);
      setError('');
    },
    close,
    data,
    clip,
    active,
    targets,
    time,
    playing,
    speed,
    setSpeed,
    dirty,
    drafts,
    error,
    setError,
    picking,
    setPicking,
    posed,
    evaluation,
    viewport,
    transform,
    changePose,
    seek,
    stop,
    pause,
    play,
    addKey,
    createClip,
    moveKey,
    saveClip,
    commitData,
    key,
    selectedKeys,
    primaryKey,
    selectKeys,
    clearKeys,
    shiftKeys,
    changeKeyInterpolation,
    deleteKeys,
    clipboard,
    setClipboard,
    setClipId,
    timeOutput,
    playhead,
    scrubber,
    discard: () => {
      setDrafts({});
      setError('');
    },
    pivot: (ids: string[]) => {
      const n =
        active && ids.every((id) => nodeBodyIds(data!, active.id).includes(id))
          ? active
          : data?.nodes.find((n) => n.bodyId === ids[0]);
      return n && evaluation
        ? (new Vector3().setFromMatrixPosition(evaluation.world.get(n.id)!).toArray() as Vec3)
        : undefined;
    },
  };
}
type Workspace = ReturnType<typeof useAnimationWorkspace>;
type Actions = {
  onSelect: (ids: string[], groupId?: string) => void;
  onTool: (tool: 'select' | 'move' | 'rotate' | 'scale') => void;
  onLegacy: () => void;
  onResetGesture: () => void;
  tool: string;
  busy: boolean;
  project: Project;
  operation?: ReactNode;
};
function CommitInput({
  value,
  label,
  onCommit,
  type = 'text',
  min,
  max,
  step,
}: {
  value: string | number;
  label: string;
  onCommit: (value: string) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      aria-label={label}
      type={type}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== String(value)) onCommit(text);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}
export function AnimationPanel({ state: s, ...a }: { state: Workspace } & Actions) {
  if (!s.open) return null;
  const pose = s.active && s.evaluation?.local.get(s.active.id),
    rotation = pose && poseDegrees(pose);
  return (
    <aside
      className="inspector animation-inspector"
      aria-label="Animaation ominaisuudet"
      data-testid="animation-panel"
    >
      <header>
        <div>
          <small>ANIMAATIO</small>
          <h2>
            {s.selectedKeys.length > 1
              ? 'Ajoituksen muokkaus'
              : s.active
                ? animationNodeName(s.active, a.project)
                : 'Valitse liikkuva osa'}
          </h2>
        </div>
        <button
          aria-label="Sulje animaatio"
          onClick={() => {
            a.onResetGesture();
            s.close();
          }}
        >
          <X size={18} />
        </button>
      </header>
      <div className="animation-tool-row">
        {(['select', 'move', 'rotate', 'scale'] as const).map((tool, i) => (
          <button
            key={tool}
            aria-pressed={a.tool === tool}
            disabled={s.playing || a.busy}
            onClick={() => a.onTool(tool)}
          >
            {['Valitse', 'Siirrä · M', 'Kierrä · R', 'Skaalaa · L'][i]}
          </button>
        ))}
      </div>
      {s.selectedKeys.length < 2 && a.operation}
      {!s.clip ? (
        <button className="button dark" onClick={() => void s.createClip()} disabled={a.busy}>
          <Plus size={16} /> Luo animaatioklippi
        </button>
      ) : (
        <>
          <label>
            Animoitava osa tai ryhmä
            <select
              aria-label="Animaation kohde"
              value={s.active?.id ?? ''}
              onChange={(e) => {
                const node = s.data?.nodes.find((n) => n.id === e.target.value);
                if (node) {
                  a.onResetGesture();
                  a.onSelect(nodeBodyIds(s.data!, node.id), node.groupId);
                }
              }}
            >
              <option value="">Valitse näkymästä…</option>
              {s.data?.nodes
                .filter((n) => n.bodyId || n.groupId)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.groupId ? '▣ ' : ''}
                    {animationNodeName(n, a.project)}
                  </option>
                ))}
            </select>
          </label>
          {s.active && pose && rotation && s.selectedKeys.length < 2 && (
            <>
              <button
                disabled={s.dirty || a.busy || s.playing}
                aria-pressed={s.picking}
                onClick={() => {
                  a.onResetGesture();
                  s.setPicking(!s.picking);
                }}
              >
                <Crosshair size={15} /> {s.picking ? 'Napsauta pivot-pistettä' : 'Poimi pivot'}
              </button>
              <div className="animation-pose-grid">
                {(['position', 'rotation', 'scale'] as const).map((kind, row) => (
                  <fieldset key={kind}>
                    <legend>{['Sijainti · paikallinen mm', 'Kierto · °', 'Skaala'][row]}</legend>
                    {['X', 'Y', 'Z'].map((axis, i) => (
                      <label key={axis}>
                        {axis}
                        <input
                          aria-label={`Animaatio ${kind} ${axis}`}
                          type="number"
                          step={kind === 'scale' ? '0.01' : 'any'}
                          value={Number(
                            (kind === 'rotation' ? rotation[i] : pose[kind][i]).toFixed(5),
                          )}
                          disabled={s.playing || a.busy}
                          onChange={(e) => {
                            const values = [
                              ...(kind === 'rotation' ? rotation : pose[kind]),
                            ] as Vec3;
                            values[i] = Number(e.target.value);
                            s.changePose({
                              ...pose,
                              [kind]: kind === 'rotation' ? degreesRotation(values) : values,
                            });
                          }}
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
              <button
                className="button dark"
                disabled={a.busy || s.playing}
                onClick={() => {
                  a.onResetGesture();
                  void s.addKey();
                }}
              >
                <Plus size={16} /> Lisää / päivitä avain
              </button>
            </>
          )}
          {s.dirty && (
            <div className="animation-draft" role="status">
              Luonnosasento · lisää avain tallentaaksesi. Ajan vaihto palauttaa tallennetun
              liikkeen.
              <button
                onClick={() => {
                  a.onResetGesture();
                  s.discard();
                }}
              >
                Palauta asento
              </button>
            </div>
          )}
          {s.selectedKeys.length > 1 && (
            <fieldset className="animation-key-editor" disabled={a.busy || s.playing}>
              <legend>
                {s.selectedKeys.length} avainta ·{' '}
                {new Set(s.selectedKeys.map((k) => k.nodeId)).size} raitaa
              </legend>
              <label>
                Siirrä valintaa (s)
                <CommitInput
                  key={s.selectedKeys.map((e) => `${animationKeyToken(e)}:${e.key.time}`).join('|')}
                  label="Valittujen avainten siirtymä"
                  type="number"
                  step="0.01"
                  value={0}
                  onCommit={(text) => void s.shiftKeys(s.selectedKeys, Number(text))}
                />
              </label>
              <label>
                Liike seuraavaan avaimeen
                <select
                  aria-label="Valittujen avainten interpolointi"
                  value={
                    s.selectedKeys.every(
                      (e) => e.key.interpolation === s.selectedKeys[0].key.interpolation,
                    )
                      ? s.selectedKeys[0].key.interpolation
                      : ''
                  }
                  onChange={(e) =>
                    void s.changeKeyInterpolation(e.target.value as AnimationKey['interpolation'])
                  }
                >
                  <option value="" disabled>
                    Useita arvoja
                  </option>
                  <option value="step">Step · välitön</option>
                  <option value="linear">Linear · tasainen</option>
                  <option value="smooth">Smooth · pehmeä</option>
                </select>
              </label>
              <p className="muted">
                Vedä yhtä valittua avainta: kaikki siirtyvät yhtä paljon. Klippi pitenee
                tarvittaessa.
              </p>
              <button onClick={() => void s.deleteKeys()}>
                <Trash2 size={14} /> Poista valitut avaimet
              </button>
              <button onClick={s.clearKeys}>Tyhjennä avainvalinta</button>
            </fieldset>
          )}
          {s.key && (
            <fieldset className="animation-key-editor">
              <legend>Valittu avain · {s.key.time.toFixed(2)} s</legend>
              <label>
                Aika (s)
                <CommitInput
                  label="Avaimen aika"
                  type="number"
                  min={0}
                  max={3600}
                  step="0.01"
                  value={s.key.time}
                  onCommit={(text) => {
                    const t = Number(text);
                    if (Number.isFinite(t) && t >= 0 && t <= 3600)
                      void s.moveKey(s.primaryKey!.nodeId, s.key!, t);
                  }}
                />
              </label>
              <label>
                Liike seuraavaan avaimeen
                <select
                  aria-label="Avaimen interpolointi"
                  value={s.key.interpolation}
                  disabled={a.busy || s.playing}
                  onChange={(e) =>
                    void s.changeKeyInterpolation(e.target.value as AnimationKey['interpolation'])
                  }
                >
                  <option value="step">Step · välitön</option>
                  <option value="linear">Linear · tasainen</option>
                  <option value="smooth">Smooth · pehmeä</option>
                </select>
              </label>
              <div className="animation-tool-row">
                <button onClick={() => s.setClipboard(structuredClone(s.key!))}>
                  <Copy size={14} /> Kopioi avain
                </button>
                <button disabled={a.busy || s.playing} onClick={() => void s.deleteKeys()}>
                  <Trash2 size={14} /> Poista avain
                </button>
              </div>
            </fieldset>
          )}
          {s.clipboard && (
            <button disabled={!s.active || a.busy || s.playing} onClick={() => void s.addKey(true)}>
              <ClipboardPaste size={14} /> Liitä avain tähän aikaan
            </button>
          )}
          <details>
            <summary>Tapahtumamerkit</summary>
            <button
              onClick={() =>
                void s.saveClip(
                  {
                    ...s.clip!,
                    markers: [...s.clip!.markers, { id: uid(), time: s.time, name: 'EVENT' }],
                  },
                  'Tapahtumamerkki lisätty.',
                )
              }
            >
              <Plus size={14} /> Lisää merkki · {s.time.toFixed(2)} s
            </button>
            {s.clip.markers.map((m) => (
              <div className="animation-event" key={m.id}>
                <button onClick={() => s.seek(m.time)}>{m.time.toFixed(2)} s</button>
                <CommitInput
                  value={m.name}
                  label={`Tapahtuma ${m.id}`}
                  onCommit={(name) =>
                    name.trim() &&
                    s.saveClip(
                      {
                        ...s.clip!,
                        markers: s.clip!.markers.map((x) =>
                          x.id === m.id ? { ...x, name: name.trim() } : x,
                        ),
                      },
                      'Tapahtuma nimetty.',
                    )
                  }
                />
                <button
                  aria-label={`Poista tapahtuma ${m.name}`}
                  onClick={() =>
                    void s.saveClip(
                      { ...s.clip!, markers: s.clip!.markers.filter((x) => x.id !== m.id) },
                      'Tapahtumamerkki poistettu.',
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <p className="muted">
              Merkit tallentuvat vientiin. Esikatselu ei suorita pelitapahtumia.
            </p>
          </details>
          <details>
            <summary>Klippi ja vienti</summary>
            <label>
              Nimi
              <CommitInput
                label="Animaation nimi"
                value={s.clip.name}
                onCommit={(name) =>
                  name.trim() && s.saveClip({ ...s.clip!, name: name.trim() }, 'Animaatio nimetty.')
                }
              />
            </label>
            <button
              onClick={() => {
                const blob = new Blob(
                  [
                    JSON.stringify(
                      {
                        format: 'nivo-animation',
                        version: 1,
                        units: 'mm',
                        up: 'Z',
                        animation: s.data,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: 'application/json' },
                );
                const url = URL.createObjectURL(blob),
                  link = document.createElement('a');
                link.href = url;
                link.download = `${a.project.name}.animation.json`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={14} /> Lataa animaatiodata
            </button>
            <p className="muted">
              GLB: Vie malli → GLB → Animaatiot. JSON säilyttää avainvälit ja tapahtumat tarkasti.
            </p>
            <button
              disabled={a.busy}
              onClick={() =>
                s.data &&
                void s.commitData(
                  { ...s.data, clips: s.data.clips.filter((c) => c.id !== s.clip!.id) },
                  'Animaatioklippi poistettu. Malli säilyy.',
                )
              }
            >
              <Trash2 size={14} /> Poista klippi
            </button>
          </details>
        </>
      )}
      <button
        onClick={() => {
          a.onResetGesture();
          s.close();
          a.onLegacy();
        }}
      >
        Sarana / liuku · kahden asennon liike
      </button>
      {s.error && <p role="alert">{s.error}</p>}
      <p className="muted">
        Valitse aika → muokkaa asentoa → lisää avain. Mallin perustila palautuu, kun suljet
        animaation.
      </p>
    </aside>
  );
}
function TimelineKey({
  entry,
  duration,
  selected,
  previewTime,
  invalid,
  disabled,
  activate,
  start,
  preview,
  finish,
  cancel,
}: {
  entry: AnimationKey;
  duration: number;
  selected: boolean;
  previewTime?: number;
  invalid: boolean;
  disabled: boolean;
  activate: (additive: boolean) => void;
  start: (additive: boolean) => boolean;
  preview: (delta: number) => void;
  finish: (delta?: number) => void;
  cancel: () => void;
}) {
  const drag = useRef<
    | { x: number; width: number; duration: number; time: number; delta: number; moved: boolean }
    | undefined
  >(undefined);
  return (
    <button
      className={`animation-key ${selected ? 'selected' : ''} ${entry.interpolation} ${invalid ? 'invalid' : ''}`}
      data-testid={`animation-key-${entry.id}`}
      aria-label={`Avain ${entry.time.toFixed(2)} s · ${entry.interpolation}`}
      aria-pressed={selected}
      disabled={disabled}
      style={{
        left: `${Math.min(100, Math.max(0, (100 * (previewTime ?? entry.time)) / duration))}%`,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (!start(e.shiftKey || e.ctrlKey || e.metaKey)) return;
        const box = e.currentTarget.parentElement!.getBoundingClientRect();
        drag.current = {
          x: e.clientX,
          width: box.width,
          duration,
          time: entry.time,
          delta: 0,
          moved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
        // Snap the grabbed key to hundredths, preserving every other key's offset.
        d.delta =
          Math.round((d.time + ((e.clientX - d.x) / d.width) * d.duration) * 100) / 100 - d.time;
        if (d.moved) preview(d.delta);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const d = drag.current;
        drag.current = undefined;
        if (d) finish(d.moved ? d.delta : undefined);
        else cancel();
      }}
      onPointerCancel={() => {
        drag.current = undefined;
        cancel();
      }}
      onLostPointerCapture={() => {
        drag.current = undefined;
        cancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          activate(e.shiftKey || e.ctrlKey || e.metaKey);
        }
      }}
      title={`${(previewTime ?? entry.time).toFixed(2)} s · ${entry.interpolation} · Shift: lisää/poista valinnasta`}
    >
      ◆
    </button>
  );
}
export function AnimationTimeline({ state: s, ...a }: { state: Workspace } & Actions) {
  const [additiveSelection, setAdditiveSelection] = useState(false);
  const [dragPreview, setDragPreview] = useState<{
    tokens: Set<string>;
    delta: number;
    duration: number;
    invalid: boolean;
  }>();
  const drag = useRef<
    | {
        clip: AnimationClip;
        refs: AnimationKeyRef[];
        primary: AnimationKeyRef;
        toggleOnClick: boolean;
      }
    | undefined
  >(undefined);
  const cancelDrag = () => {
    drag.current = undefined;
    setDragPreview(undefined);
  };
  useEffect(() => {
    cancelDrag();
  }, [s.clip, a.busy, s.playing, s.open]);
  useEffect(() => {
    window.addEventListener('blur', cancelDrag);
    return () => window.removeEventListener('blur', cancelDrag);
  }, []);
  if (!s.open) return null;
  const selectNode = (id: string) => {
    const n = s.data!.nodes.find((n) => n.id === id)!;
    a.onResetGesture();
    a.onSelect(nodeBodyIds(s.data!, id), n.groupId);
  };
  const selectedTokens = new Set(s.selectedKeys.map(animationKeyToken));
  const activateKey = (ref: AnimationKeyRef, additive: boolean, preserve = false) => {
    cancelDrag();
    const selected = selectedTokens.has(animationKeyToken(ref));
    const refs =
      preserve && selected
        ? s.selectedKeys
        : additive || additiveSelection
          ? selected
            ? s.selectedKeys.filter((k) => animationKeyToken(k) !== animationKeyToken(ref))
            : [...s.selectedKeys, ref]
          : [ref];
    const included = refs.some((k) => animationKeyToken(k) === animationKeyToken(ref));
    s.selectKeys(refs, included ? ref : refs.at(-1));
    const key = selectedAnimationKeys(s.clip!, [ref])[0]?.key;
    if (included && key) {
      selectNode(ref.nodeId);
      s.seek(key.time, false);
    }
    return { refs, included };
  };
  const previewMove = (delta: number) => {
    const d = drag.current;
    if (!d || d.clip !== s.clip) return;
    try {
      const result = shiftAnimationKeys(d.clip, d.refs, delta);
      setDragPreview({
        tokens: new Set(d.refs.map(animationKeyToken)),
        delta: result.delta,
        duration: result.clip.duration,
        invalid: false,
      });
    } catch {
      setDragPreview({
        tokens: new Set(d.refs.map(animationKeyToken)),
        delta,
        duration: s.clip!.duration,
        invalid: true,
      });
    }
  };
  const finishMove = (delta?: number) => {
    const d = drag.current;
    cancelDrag();
    if (!d || d.clip !== s.clip) return;
    if (delta === undefined) {
      if (d.toggleOnClick)
        s.selectKeys(d.refs.filter((k) => animationKeyToken(k) !== animationKeyToken(d.primary)));
    } else void s.shiftKeys(d.refs, delta, d.primary);
  };
  const selectTrack = (nodeId: string, additive: boolean) => {
    cancelDrag();
    selectNode(nodeId);
    s.pause();
    const refs = s
      .clip!.tracks.find((t) => t.nodeId === nodeId)!
      .keys.map((k) => ({ nodeId, keyId: k.id }));
    const all = refs.every((ref) => selectedTokens.has(animationKeyToken(ref)));
    const next =
      additive || additiveSelection
        ? all
          ? s.selectedKeys.filter((k) => k.nodeId !== nodeId)
          : [...s.selectedKeys.filter((k) => k.nodeId !== nodeId), ...refs]
        : refs;
    s.selectKeys(next);
  };
  return (
    <section
      className="animation-timeline"
      aria-label="Animaation aikajana"
      data-testid="animation-timeline"
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input,select,textarea')) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelDrag();
          s.clearKeys();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          cancelDrag();
          void s.deleteKeys();
        }
      }}
    >
      <div className="animation-transport">
        <select
          aria-label="Animaatioklippi"
          value={s.clip?.id ?? ''}
          onChange={(e) => {
            a.onResetGesture();
            s.seek(0);
            s.setClipId(e.target.value);
          }}
        >
          <option value="" disabled>
            Valitse animaatio
          </option>
          {s.data?.clips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          aria-label="Uusi animaatioklippi"
          onClick={() => void s.createClip()}
          disabled={a.busy}
        >
          <Plus size={17} />
        </button>
        <button
          aria-label={s.playing ? 'Tauota animaatio' : 'Toista animaatio'}
          disabled={!s.clip || a.busy}
          onClick={() => {
            a.onResetGesture();
            s.playing ? s.pause() : s.play();
          }}
        >
          {s.playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button
          aria-label="Pysäytä animaatio"
          onClick={() => {
            a.onResetGesture();
            s.stop();
          }}
        >
          <Square size={15} />
        </button>
        <output ref={s.timeOutput}>{s.time.toFixed(2)} s</output>
        <label>
          Aika
          <input
            aria-label="Animaation aika"
            type="number"
            min={0}
            max={s.clip?.duration ?? 0}
            step="0.01"
            value={s.time}
            disabled={s.playing}
            onChange={(e) => {
              a.onResetGesture();
              s.seek(Number(e.target.value));
            }}
          />
        </label>
        {s.clip && (
          <>
            <label>
              Kesto
              <CommitInput
                label="Animaation kesto"
                type="number"
                min={0.01}
                max={3600}
                step="0.1"
                value={s.clip.duration}
                onCommit={(text) => {
                  const duration = Number(text);
                  if (
                    duration > 0 &&
                    duration <= 3600 &&
                    s.clip!.tracks.every((t) => t.keys.every((k) => k.time <= duration)) &&
                    s.clip!.markers.every((m) => m.time <= duration)
                  )
                    void s.saveClip({ ...s.clip!, duration }, 'Animaation kesto muutettu.');
                  else s.setError('Keston pitää sisältää kaikki avaimet ja tapahtumat.');
                }}
              />
            </label>
            <label className="animation-loop">
              <input
                type="checkbox"
                aria-label="Animaation toisto silmukkana"
                checked={s.clip.loop}
                onChange={(e) =>
                  void s.saveClip(
                    { ...s.clip!, loop: e.target.checked },
                    'Animaation toisto muutettu.',
                  )
                }
              />{' '}
              Loop
            </label>
          </>
        )}
        <select
          aria-label="Animaation toistonopeus"
          value={s.speed}
          onChange={(e) => {
            s.pause();
            s.setSpeed(Number(e.target.value));
          }}
        >
          {[-2, -1, -0.5, 0.25, 0.5, 1, 2].map((v) => (
            <option key={v} value={v}>
              {v < 0 ? '← ' : ''}
              {Math.abs(v)}×
            </option>
          ))}
        </select>
        <button
          disabled={!s.clip || !s.targets.length || a.busy || s.playing}
          onClick={() => {
            a.onResetGesture();
            void s.addKey();
          }}
        >
          <Plus size={15} /> Avain
        </button>
      </div>
      {s.clip && (
        <>
          <div className="animation-ruler">
            <span className="animation-selection-controls">
              <button
                aria-pressed={additiveSelection}
                onClick={() => setAdditiveSelection((v) => !v)}
                title="Shift tai tämä painike: lisää avaimia ja raitoja valintaan"
              >
                Monivalinta
              </button>
              <span data-testid="animation-selection-count">
                {s.selectedKeys.length === 1
                  ? '1 avain'
                  : s.selectedKeys.length
                    ? `${s.selectedKeys.length} avainta`
                    : 'Shift: lisää'}
              </span>
            </span>
            <input
              ref={s.scrubber}
              aria-label="Kelaa animaatiota"
              type="range"
              min={0}
              max={s.clip.duration}
              step="0.01"
              value={s.time}
              onChange={(e) => {
                a.onResetGesture();
                s.seek(Number(e.target.value));
              }}
            />
          </div>
          {dragPreview && (
            <div
              className={`animation-drag-feedback ${dragPreview.invalid ? 'invalid' : ''}`}
              role="status"
            >
              {dragPreview.invalid
                ? 'Ajassa on jo avain — siirtoa ei tallenneta.'
                : `${dragPreview.delta >= 0 ? '+' : ''}${dragPreview.delta.toFixed(2)} s${dragPreview.duration > s.clip.duration ? ` · klipin kesto ${dragPreview.duration.toFixed(2)} s` : ''}`}
            </div>
          )}
          <div className="animation-tracks">
            <div className="animation-playhead-area">
              <div
                ref={s.playhead}
                className="animation-playhead"
                style={{ left: `${(100 * s.time) / s.clip.duration}%` }}
              />
            </div>
            {s.clip.tracks.map((track) => {
              const node = s.data!.nodes.find((n) => n.id === track.nodeId)!;
              return (
                <div
                  key={track.nodeId}
                  className={`animation-track ${s.active?.id === node.id ? 'active' : ''} ${s.selectedKeys.some((k) => k.nodeId === node.id) ? 'keys-selected' : ''}`}
                  data-node-id={node.id}
                >
                  <button
                    className="animation-track-name"
                    aria-pressed={track.keys.every((key) =>
                      selectedTokens.has(animationKeyToken({ nodeId: node.id, keyId: key.id })),
                    )}
                    disabled={a.busy || s.playing}
                    onClick={(e) => selectTrack(node.id, e.shiftKey || e.ctrlKey || e.metaKey)}
                    title={`${animationNodeName(node, a.project)} · Valitse raidan avaimet · Shift: lisää/poista valinnasta`}
                  >
                    {node.groupId ? '▣ ' : ''}
                    {animationNodeName(node, a.project)}
                  </button>
                  <div
                    className="animation-track-lane"
                    onPointerDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      const box = e.currentTarget.getBoundingClientRect();
                      cancelDrag();
                      a.onResetGesture();
                      s.seek(((e.clientX - box.left) / box.width) * s.clip!.duration);
                    }}
                  >
                    {track.keys.map((key) => (
                      <TimelineKey
                        key={key.id}
                        entry={key}
                        duration={s.clip!.duration}
                        selected={selectedTokens.has(
                          animationKeyToken({ nodeId: node.id, keyId: key.id }),
                        )}
                        previewTime={
                          dragPreview?.tokens.has(
                            animationKeyToken({ nodeId: node.id, keyId: key.id }),
                          )
                            ? key.time + dragPreview.delta
                            : undefined
                        }
                        invalid={
                          !!dragPreview?.invalid &&
                          dragPreview.tokens.has(
                            animationKeyToken({ nodeId: node.id, keyId: key.id }),
                          )
                        }
                        disabled={a.busy || s.playing}
                        activate={(additive) => {
                          activateKey({ nodeId: node.id, keyId: key.id }, additive);
                        }}
                        start={(additive) => {
                          const ref = { nodeId: node.id, keyId: key.id };
                          const { refs, included } = activateKey(ref, additive, true);
                          if (included)
                            drag.current = {
                              clip: s.clip!,
                              refs,
                              primary: ref,
                              toggleOnClick:
                                selectedTokens.has(animationKeyToken(ref)) &&
                                (additive || additiveSelection),
                            };
                          return included;
                        }}
                        preview={previewMove}
                        finish={finishMove}
                        cancel={cancelDrag}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {!s.clip.tracks.length && (
              <p className="animation-empty">Valitse osa tai ryhmä ja lisää ensimmäinen avain.</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
