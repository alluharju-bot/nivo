import { useEffect, useMemo, useRef, useState } from 'react';
import { geometryMatrix, type GeometryOperation } from '../model/geometryEditing';
import type { Vec3 } from '../model/project';
import { selectionPivot, planeSelection, transformSelection, maskSelection } from './editing';
import { paintMask } from './sculpt';
import { pointKey } from './topology';
import { readRecovery, saveRecovery, removeRecovery, type RecoveryRecord } from './recovery';
import {
  Box,
  Brush,
  Check,
  Focus,
  Grid2X2,
  Layers,
  LoaderCircle,
  Redo2,
  Scissors,
  Undo2,
  X,
} from 'lucide-react';
import type { Body, Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import type { CadClient } from '../cad/client';
import { parseLength } from '../model/units';
import { meshClosure } from '../exchange/mesh';
import {
  fromBodyMesh,
  meshBounds,
  checkMesh,
  cutLoop,
  mirrorMesh,
  symmetricMesh,
  primitiveMesh,
  sourceStamp,
  subdivideMesh,
  type SurfaceMesh,
} from './mesh';
import { SurfaceStage, mapCanvas, type SurfaceTool } from './SurfaceStage';
import { SurfaceHistory, type SurfaceDraft } from './history';
import { paintMap, padPaintMap, type MapChannel, type SurfaceMaps } from './maps';
import { bakeSource } from './source';
import type { BakeSource, BakeOptions, BakeResult } from './bake';
import type { SurfaceJob } from './worker';
import { loadSurfaceMaps, saveSurfaceDraft } from './persistence';
import { defaultAppearance } from '../model/materials';
import './surface.css';

type Tab = 'mesh' | 'shape' | 'uv' | 'paint' | 'bake';
interface Props {
  body: Body;
  project: Project;
  meshes: BodyMesh[];
  cad: CadClient;
  onClose: () => void;
  onSave: (
    result: ReturnType<typeof saveSurfaceDraft> & { hideOriginal: boolean },
  ) => Promise<boolean>;
}
export default function SurfaceWorkspace(props: Props) {
  const [initial, setInitial] = useState<{
      draft: SurfaceDraft;
      high: SurfaceMesh;
      recovery?: RecoveryRecord;
      warning?: string;
    }>(),
    [error, setError] = useState('');
  const [recoveryChoice, setRecoveryChoice] = useState(false);
  useEffect(() => {
    let current = true;
    void (async () => {
      const mesh =
        props.meshes.find((m) => m.id === props.body.id) ??
        (await props.cad.surfaceMesh(props.body));
      const high = fromBodyMesh(props.body, mesh);
      checkMesh(high);
      const maps = await loadSurfaceMaps(props.body, props.project.assets);
      let recovery: RecoveryRecord | undefined, warning: string | undefined;
      try {
        recovery = await readRecovery(props.project.id, props.body.id);
      } catch (e) {
        warning = (e as Error).message;
      }
      if (current)
        setInitial({
          recovery,
          warning,
          high,
          draft: {
            mesh: high,
            maps,
            atlas: !!props.body.surfaceWorkflow?.uvAtlas,
            baked: !!props.body.surfaceWorkflow?.baked,
            loops: props.body.surfaceWorkflow?.loops,
          },
        });
    })().catch((e: Error) => {
      if (current) setError(e.message);
    });
    return () => {
      current = false;
    };
  }, []);
  if (!initial) return <LoadingSurface error={error} onClose={props.onClose} />;
  if (initial.recovery && !recoveryChoice)
    return (
      <RecoveryPrompt
        record={initial.recovery}
        compatible={initial.recovery.sourceStamp === sourceStamp(props.body)}
        onClose={props.onClose}
        onRestore={() => setRecoveryChoice(true)}
        onDiscard={async () => {
          await removeRecovery(props.project.id, props.body.id);
          setInitial({ ...initial, recovery: undefined });
        }}
      />
    );
  return (
    <WorkspaceReady
      {...props}
      initial={initial.recovery?.draft ?? initial.draft}
      high={initial.high}
      recovered={initial.recovery}
      storageWarning={initial.warning}
    />
  );
}
function RecoveryPrompt({
  record,
  compatible,
  onRestore,
  onDiscard,
  onClose,
}: {
  record: RecoveryRecord;
  compatible: boolean;
  onRestore: () => void;
  onDiscard: () => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [error, setError] = useState('');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="surface-dialog surface-loading"
      aria-label="Palauta keskeneräinen työversio"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2>Keskeneräinen työversio löytyi</h2>
      <p>
        {record.name} · {new Date(record.updatedAt).toLocaleString('fi')}
      </p>
      <p>
        {compatible
          ? 'Voit jatkaa paikallisesti tallennetusta työstä. Projektin alkuperäinen osa säilyy.'
          : 'Lähdeosa on muuttunut työversion tallentamisen jälkeen. Automaattinen palautus on estetty, jotta versiot eivät sekoitu. Sulkeminen säilyttää työversion.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="surface-primary" disabled={!compatible} onClick={onRestore}>
        Palauta työversio
      </button>
      <button onClick={() => void onDiscard().catch((e: Error) => setError(e.message))}>
        Hylkää ja aloita alusta
      </button>
      <button onClick={onClose}>Sulje</button>
    </dialog>
  );
}
function LoadingSurface({ error, onClose }: { error: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="surface-dialog surface-loading"
      aria-label="Verkko ja pinta"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2>Verkko ja pinta</h2>
      <p role={error ? 'alert' : 'status'}>{error || 'Valmistellaan osan työversiota…'}</p>
      <button onClick={onClose}>Sulje</button>
    </dialog>
  );
}
function WorkspaceReady({
  body,
  project,
  cad,
  meshes,
  onClose,
  onSave,
  initial,
  high,
  recovered,
  storageWarning,
}: Props & {
  initial: SurfaceDraft;
  high: SurfaceMesh;
  recovered?: RecoveryRecord;
  storageWarning?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState(initial),
    current = useRef(draft);
  current.current = draft;
  const [history] = useState(() => new SurfaceHistory()),
    [tab, setTab] = useState<Tab>(recovered ? 'shape' : 'mesh');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [dirty, setDirty] = useState(!!recovered),
    [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [label, setLabel] = useState('');
  const worker = useRef<Worker | undefined>(undefined),
    mounted = useRef(true),
    jobToken = useRef(0),
    validationCancel = useRef<(() => void) | undefined>(undefined);
  const bodyStamp = useMemo(() => sourceStamp(body), [body]);
  const bounds = meshBounds(draft.mesh),
    span = Math.max(...bounds.size, 1);
  const [name, setName] = useState(
    recovered?.name ?? (body.surfaceWorkflow ? body.name : `${body.name.slice(0, 100)} · verkko`),
  );
  const [wire, setWire] = useState(false),
    [resetCamera, setResetCamera] = useState(0),
    [hideOriginal, setHideOriginal] = useState(recovered?.hideOriginal ?? true);
  const [operation, setOperation] = useState<GeometryOperation>('move'),
    [transformValues, setTransformValues] = useState(['0', '0', '0']);
  const [checkpointStatus, setCheckpointStatus] = useState(
      storageWarning ?? (recovered ? 'Paikallinen työversio palautettu.' : ''),
    ),
    checkpointEnabled = useRef(true);
  const [confirmed, setConfirmed] = useState(initial);
  const recoveryRecord = useRef<RecoveryRecord | undefined>(undefined);
  recoveryRecord.current = dirty
    ? {
        version: 1,
        projectId: project.id,
        bodyId: body.id,
        sourceStamp: bodyStamp,
        name,
        hideOriginal,
        draft: confirmed,
        updatedAt: Date.now(),
      }
    : undefined;
  const checkpoint = async () => {
    const record = recoveryRecord.current;
    if (!record || !checkpointEnabled.current) return;
    try {
      await saveRecovery(record);
      if (mounted.current && checkpointEnabled.current)
        setCheckpointStatus('Työversio varmistettu tällä laitteella.');
    } catch (e) {
      if (mounted.current) setCheckpointStatus((e as Error).message);
    }
  };
  useEffect(() => {
    if (!dirty) return;
    setCheckpointStatus('Varmistetaan työversiota…');
    const timer = setTimeout(() => void checkpoint(), 750);
    return () => clearTimeout(timer);
  }, [confirmed, dirty, name, hideOriginal]);
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void checkpoint();
    };
    document.addEventListener('visibilitychange', flush);
    const unload = (event: BeforeUnloadEvent) => {
      if (recoveryRecord.current && checkpointEnabled.current) {
        void checkpoint();
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  const [quality, setQuality] = useState('medium'),
    [keep, setKeep] = useState(70);
  const [primitive, setPrimitive] = useState<'circle' | 'sphere' | 'cylinder'>('sphere'),
    [segments, setSegments] = useState(24),
    [radius, setRadius] = useState(String(Math.max(bounds.size[0], bounds.size[1], 1) / 2)),
    [height, setHeight] = useState(String(Math.max(bounds.size[2], 1)));
  const [axis, setAxis] = useState(2),
    [position, setPosition] = useState('50'),
    [loopCount, setLoopCount] = useState(1),
    [mirrorCopy, setMirrorCopy] = useState(false),
    [mirrorPosition, setMirrorPosition] = useState('0');
  const [tool, setTool] = useState<SurfaceTool>('orbit'),
    [brushRadius, setBrushRadius] = useState(String(Math.round(span * 0.15 * 100) / 100)),
    [strength, setStrength] = useState(String(Math.round(span * 0.005 * 1000) / 1000)),
    [pinBoundary, setPinBoundary] = useState(false);
  const [channel, setChannel] = useState<'color' | 'roughness' | 'metalness'>('color'),
    [paintColor, setPaintColor] = useState('#cb724c'),
    [opacity, setOpacity] = useState(0.6),
    [paintValue, setPaintValue] = useState(0.7);
  const [size, setSize] = useState(512),
    [cage, setCage] = useState(String(Math.max(0.1, span * 0.05))),
    [aoDistance, setAoDistance] = useState(String(Math.max(1, span * 0.15))),
    [samples, setSamples] = useState(16);
  const [referenceId, setReferenceId] = useState(
      project.bodies.some((b) => b.id === body.surfaceWorkflow?.sourceId)
        ? body.surfaceWorkflow!.sourceId
        : body.id,
    ),
    [previewMap, setPreviewMap] = useState<MapChannel>('color');
  const [stale, setStale] = useState(false),
    stroke = useRef<SurfaceDraft | undefined>(undefined);
  useEffect(() => {
    const reference = project.bodies.find((b) => b.id === body.surfaceWorkflow?.sourceId);
    setStale(
      !!reference &&
        !!body.surfaceWorkflow &&
        sourceStamp(reference) !== body.surfaceWorkflow.sourceStamp,
    );
  }, [body, project.bodies]);
  const restorePreview = () => {
    const d = current.current;
    setDraft({ ...d, mesh: { ...d.mesh } });
  };
  const validate = (mesh: SurfaceMesh, previous?: SurfaceMesh): Promise<boolean> => {
    checkMesh(mesh);
    const token = ++jobToken.current;
    setBusy(true);
    setLabel('Tarkistetaan verkon eheyttä…');
    setError('');
    return new Promise((resolve) => {
      const task = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      worker.current = task;
      const timer = setTimeout(
        () => finish('Verkon tarkistus ylitti aikarajan. Muutosta ei hyväksytty.'),
        30000,
      );
      const finish = (error?: string) => {
        clearTimeout(timer);
        task.terminate();
        if (worker.current === task) worker.current = undefined;
        if (!mounted.current || token !== jobToken.current) {
          resolve(false);
          return;
        }
        validationCancel.current = undefined;
        setBusy(false);
        if (error) {
          setError(error);
          restorePreview();
        }
        resolve(!error);
      };
      validationCancel.current = () => {
        clearTimeout(timer);
        task.terminate();
        validationCancel.current = undefined;
        resolve(false);
      };
      task.onmessage = (event: MessageEvent<{ error?: string; result?: unknown }>) =>
        finish(event.data.error);
      task.onerror = () => finish('Verkon tarkistus epäonnistui. Muutosta ei hyväksytty.');
      task.postMessage({ kind: 'validate', mesh, previous } satisfies SurfaceJob);
    });
  };
  const commit = (next: SurfaceDraft, message = '') => {
    history.push(current.current);
    current.current = next;
    setDraft(next);
    setConfirmed(next);
    setDirty(true);
    setError('');
    setNotice(message);
  };
  const apply = async (next: SurfaceDraft, message = '', preserve = true) => {
    try {
      checkMesh(next.mesh);
      if (next.mesh.indices !== current.current.mesh.indices && !Object.hasOwn(next, 'loops'))
        next = { ...next, selection: undefined, loops: undefined };
      const changed =
        next.mesh.positions !== current.current.mesh.positions ||
        next.mesh.indices !== current.current.mesh.indices;
      if (changed && !(await validate(next.mesh, preserve ? current.current.mesh : undefined)))
        return;
      commit(next, message);
    } catch (e) {
      setError((e as Error).message);
      restorePreview();
    }
  };
  const chooseOperation = (next: GeometryOperation) => {
    setTool('orbit');
    setOperation(next);
    setTransformValues(next === 'scale' ? ['100', '100', '100'] : ['0', '0', '0']);
  };
  const modifySelection = () => {
    try {
      if (!draft.selection?.length) return;
      const values = transformValues.map((s) =>
        operation === 'move'
          ? parseLength(s || '0', true, true)
          : Number((s || (operation === 'scale' ? '100' : '0')).replace(',', '.')) /
            (operation === 'scale' ? 100 : 1),
      ) as Vec3;
      const matrix = geometryMatrix(operation, values, selectionPivot(draft.mesh, draft.selection));
      const mesh = transformSelection(draft.mesh, draft.selection, matrix);
      void apply(
        { ...draft, mesh, maps: { ...draft.maps, normal: undefined, ao: undefined }, baked: false },
        'Silmukan muutos hyväksytty.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const undo = () => {
    const next = history.undo(current.current);
    if (next) {
      current.current = next;
      setDraft(next);
      setConfirmed(next);
      setDirty(true);
      setError('');
    }
  };
  const redo = () => {
    const next = history.redo(current.current);
    if (next) {
      current.current = next;
      setDraft(next);
      setConfirmed(next);
      setDirty(true);
      setError('');
    }
  };
  const cancelJob = () => {
    jobToken.current++;
    validationCancel.current?.();
    worker.current?.terminate();
    worker.current = undefined;
    setBusy(false);
    restorePreview();
    setNotice('Laskenta peruttu. Työversio säilyi.');
  };
  const tryAction = (action: () => void) => {
    setError('');
    try {
      action();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const close = () => {
    if (busy) return;
    if (dirty) setClosing(true);
    else onClose();
  };
  const live = useRef({
    undo,
    redo,
    close,
    busy,
    tool,
    chooseOperation,
    selection: draft.selection,
  });
  live.current = { undo, redo, close, busy, tool, chooseOperation, selection: draft.selection };
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    const keyboard = (e: KeyboardEvent) => {
      if (!dialog.current?.open) return;
      const text = (e.target as HTMLElement).closest('input,textarea,select,[contenteditable]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !text) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!live.current.busy) (e.shiftKey ? live.current.redo : live.current.undo)();
      }
      if (
        !text &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        live.current.selection?.length &&
        !live.current.busy
      ) {
        const op = ({ m: 'move', r: 'rotate', s: 'scale' } as const)[e.key.toLowerCase() as 'm'];
        if (op) {
          e.preventDefault();
          e.stopImmediatePropagation();
          live.current.chooseOperation(op);
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (live.current.tool !== 'orbit') setTool('orbit');
        else live.current.close();
      }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => {
      mounted.current = false;
      jobToken.current++;
      validationCancel.current?.();
      worker.current?.terminate();
      window.removeEventListener('keydown', keyboard, true);
    };
  }, []);
  useEffect(() => {
    setTool(tab === 'paint' && draft.atlas ? 'paint' : 'orbit');
    setError('');
  }, [tab]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const el = canvas.current!;
    el.width = el.height = 512;
    ctx.fillStyle = '#1a242d';
    ctx.fillRect(0, 0, 512, 512);
    const map = draft.maps[previewMap];
    if (map) ctx.drawImage(mapCanvas(map), 0, 0, 512, 512);
    if (tab === 'uv' && draft.mesh.uv) {
      ctx.strokeStyle = 'rgba(102,235,245,.7)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let i = 0; i < draft.mesh.indices.length; i += 3) {
        draft.mesh.indices.slice(i, i + 3).forEach((id, k) => {
          const x = draft.mesh.uv![id * 2] * 512,
            y = (1 - draft.mesh.uv![id * 2 + 1]) * 512;
          if (!k) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.stroke();
    }
  }, [draft.mesh, draft.maps, previewMap, tab]);
  const sourceForCurrent = async (): Promise<BakeSource> => {
    if (current.current.atlas && current.current.maps.color) {
      const saved = saveSurfaceDraft(body, current.current, name);
      return bakeSource(
        {
          ...saved.body,
          origin: body.origin,
          feature: {
            ...saved.body.feature,
            ...(saved.body.feature.type === 'mesh'
              ? { vertices: current.current.mesh.positions }
              : {}),
          },
        },
        current.current.mesh,
        { ...project.assets, ...saved.assets },
      );
    }
    return bakeSource(
      body.appearance?.atlasMaps
        ? {
            ...body,
            color: '#b8c3c8',
            appearance: defaultAppearance('matte'),
            faceMaterials: undefined,
          }
        : body,
      current.current.mesh,
      project.assets,
    );
  };
  const beginJob = async (kind: 'unwrap' | 'bake' | 'simplify') => {
    setBusy(true);
    setError('');
    setNotice('');
    setProgress(0);
    setLabel('Valmistellaan laskentaa…');
    setTool('orbit');
    const token = ++jobToken.current;
    try {
      let job: SurfaceJob;
      if (kind === 'simplify')
        job = {
          kind,
          mesh: !body.faceMaterials
            ? { ...current.current.mesh, faces: current.current.mesh.faces.map(() => 0) }
            : current.current.mesh,
          keep: keep / 100,
        };
      else {
        const options: BakeOptions = {
          size,
          cage: parseLength(cage, false, false),
          aoDistance: parseLength(aoDistance, false, false),
          samples,
          details: kind === 'bake',
        };
        let source: BakeSource;
        if (kind === 'unwrap') source = await sourceForCurrent();
        else {
          const reference = project.bodies.find((b) => b.id === referenceId);
          if (!reference) throw new Error('Valitse lähdemalli.');
          const data =
            reference.id === body.id
              ? high
              : fromBodyMesh(
                  reference,
                  meshes.find((m) => m.id === reference.id) ?? (await cad.surfaceMesh(reference)),
                );
          source = await bakeSource(reference, data, project.assets);
          // Align independently selected parts in the same world frame.
          if (reference.id !== body.id)
            source = {
              ...source,
              mesh: {
                ...source.mesh,
                positions: source.mesh.positions.map(
                  (n, i) => n + reference.origin[i % 3] - body.origin[i % 3],
                ),
              },
            };
        }
        job = { kind, mesh: current.current.mesh, source, options };
      }
      if (!mounted.current || token !== jobToken.current) return;
      const task = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      worker.current = task;
      task.onmessage = (
        event: MessageEvent<{
          progress?: number;
          label?: string;
          error?: string;
          result?: { mesh: SurfaceMesh } & Partial<BakeResult>;
        }>,
      ) => {
        if (!mounted.current || token !== jobToken.current) return;
        const message = event.data;
        if (message.progress !== undefined) {
          setProgress(message.progress);
          setLabel(message.label ?? 'Lasketaan…');
          return;
        }
        task.terminate();
        worker.current = undefined;
        setBusy(false);
        if (message.error) {
          setError(message.error);
          return;
        }
        if (message.result)
          tryAction(() => {
            const result = message.result!;
            const old = current.current;
            const mapping = new Map<string, number[]>();
            result.mesh.positions.forEach((_, i) => {
              if (i % 3) return;
              const key = pointKey(result.mesh.positions.slice(i, i + 3));
              mapping.set(key, [...(mapping.get(key) ?? []), i / 3]);
            });
            const remap = (ids: number[]) => [
              ...new Set(
                ids.flatMap(
                  (id) => mapping.get(pointKey(old.mesh.positions.slice(id * 3, id * 3 + 3))) ?? [],
                ),
              ),
            ];
            apply(
              {
                mesh: result.mesh,
                maps: result.maps ?? {},
                atlas: kind !== 'simplify',
                baked: kind === 'bake',
                loops: kind === 'simplify' ? undefined : old.loops?.map(remap),
                selection: kind === 'simplify' ? undefined : old.selection && remap(old.selection),
              },
              kind === 'bake'
                ? `Pintakartat valmiit · ${size} × ${size}${result.missed ? ` · ${result.missed} pikseliä ilman lähdeosumaa` : ''}`
                : kind === 'unwrap'
                  ? 'UV-kartta ja nykyiset pintavärit siirretty.'
                  : 'Verkko kevennetty. Luo uusi UV-kartta ennen maalaamista.',
            );
          });
      };
      task.onerror = () => {
        task.terminate();
        if (!mounted.current || token !== jobToken.current) return;
        worker.current = undefined;
        if (mounted.current) {
          setBusy(false);
          setError(
            'Taustalaskentaa ei voitu käynnistää. Lataa sivu uudelleen tallennettuasi projektin.',
          );
        }
      };
      task.postMessage(job);
    } catch (e) {
      if (mounted.current && token === jobToken.current) {
        setBusy(false);
        setError((e as Error).message);
      }
    }
  };
  const remesh = async () => {
    setBusy(true);
    setLabel('Muodostetaan verkkoa CAD-osasta…');
    setError('');
    const token = ++jobToken.current;
    try {
      const q = quality === 'coarse' ? [2, 0.7] : quality === 'medium' ? [0.5, 0.3] : [0.15, 0.1];
      const data = await cad.surfaceMesh(body, q[0], q[1]);
      if (mounted.current && token === jobToken.current)
        await apply(
          { mesh: fromBodyMesh(body, data), maps: {}, atlas: false, baked: false },
          'Uusi verkko luotu alkuperäisestä osasta.',
        );
    } catch (e) {
      if (mounted.current && token === jobToken.current) setError((e as Error).message);
    } finally {
      if (mounted.current && token === jobToken.current) setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setLabel('Tallennetaan työversio…');
    setError('');
    try {
      if (!(await validate(current.current.mesh))) return;
      setBusy(true);
      setLabel('Tallennetaan työversio…');
      const result = saveSurfaceDraft(body, current.current, name);
      if (await onSave({ ...result, hideOriginal })) {
        checkpointEnabled.current = false;
        await removeRecovery(project.id, body.id).catch(() => {});
        onClose();
      } else setError('Työversiota ei tallennettu. Tarkista projektin ilmoitus.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const brush = (() => {
    try {
      const radius = parseLength(brushRadius, false, false),
        amount = tool === 'paint' ? 0 : parseLength(strength, false, false);
      if (amount > radius) throw new Error('Siveltimen voimakkuus saa olla enintään vaikutussäde.');
      return { radius, strength: amount, error: '' };
    } catch (e) {
      return { radius: span * 0.15, strength: span * 0.005, error: (e as Error).message };
    }
  })();
  const brushError = tool !== 'orbit' ? brush.error : '';
  const axes = (
    <div className="surface-axis" aria-label="Työstön akseli">
      {['X', 'Y', 'Z'].map((label, i) => (
        <button key={label} aria-pressed={axis === i} onClick={() => setAxis(i)}>
          {label}
        </button>
      ))}
    </div>
  );
  const numberField = (label: string, value: string, change: (s: string) => void) => (
    <label>
      {label}
      <input
        aria-label={label}
        inputMode="decimal"
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </label>
  );
  const plane =
    tab === 'shape' &&
    !draft.selection?.length &&
    tool === 'orbit' &&
    Number.isFinite(Number(position.replace(',', '.')))
      ? {
          axis,
          coordinate:
            bounds.min[axis] + (bounds.size[axis] * Number(position.replace(',', '.'))) / 100,
        }
      : undefined;
  return (
    <dialog
      ref={dialog}
      className="surface-dialog"
      aria-labelledby="surface-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="surface-header">
        <div>
          <span className="surface-eyebrow">OSAN TYÖVERSIO</span>
          <h2 id="surface-title">Verkko ja pinta</h2>
        </div>
        <input
          aria-label="Työversion nimi"
          value={name}
          maxLength={120}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
        <div className="surface-history">
          <button
            aria-label="Peru työversion muutos"
            disabled={busy || !history.past.length}
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            aria-label="Tee työversion muutos uudelleen"
            disabled={busy || !history.future.length}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
          <button aria-label="Sulje Verkko ja pinta" disabled={busy} onClick={close}>
            <X size={20} />
          </button>
        </div>
      </header>
      <nav className="surface-tabs" aria-label="Verkon ja pinnan työvaiheet">
        {(
          [
            ['mesh', 'Verkko', Box],
            ['shape', 'Muotoile', Scissors],
            ['uv', 'UV-kartta', Grid2X2],
            ['paint', 'Maalaa', Brush],
            ['bake', 'Pintakartat', Layers],
          ] as const
        ).map(([id, title, Icon]) => (
          <button key={id} aria-pressed={tab === id} disabled={busy} onClick={() => setTab(id)}>
            <Icon size={17} />
            {title}
          </button>
        ))}
      </nav>
      <div className="surface-layout">
        <main className="surface-preview">
          <SurfaceStage
            mesh={draft.mesh}
            selection={draft.selection}
            loops={draft.loops}
            transformMode={
              !busy && tab === 'shape' && draft.selection?.length
                ? operation === 'move'
                  ? 'translate'
                  : operation
                : undefined
            }
            onSelectLoop={(index) => {
              const next = { ...draft, selection: draft.loops?.[index] };
              current.current = next;
              setDraft(next);
              setConfirmed(next);
            }}
            onTransformed={(mesh) => {
              void apply(
                {
                  ...current.current,
                  mesh,
                  maps: { ...current.current.maps, normal: undefined, ao: undefined },
                  baked: false,
                },
                'Silmukan muutos hyväksytty.',
              );
            }}
            onMask={(stamps, erase) => {
              const d = current.current,
                next = { ...d, mesh: paintMask(d.mesh, stamps, erase) };
              current.current = next;
              setDraft(next);
            }}
            onCancelStroke={() => {
              const before = stroke.current;
              stroke.current = undefined;
              if (before) {
                current.current = before;
                setDraft({ ...before, mesh: { ...before.mesh } });
              }
            }}
            maps={draft.maps}
            body={body}
            assets={project.assets}
            tool={busy || brushError ? 'orbit' : tool}
            radius={brush.radius}
            strength={brush.strength}
            wire={wire}
            pinBoundary={pinBoundary}
            plane={plane}
            resetCamera={resetCamera}
            onError={setError}
            onStart={() => {
              stroke.current = current.current;
            }}
            onPaint={(stamps) => {
              const d = current.current,
                map = d.maps[channel];
              if (!map) return;
              const color =
                channel === 'color'
                  ? [1, 3, 5].map((i) => parseInt(paintColor.slice(i, i + 2), 16))
                  : [paintValue * 255, paintValue * 255, paintValue * 255];
              const next = {
                ...d,
                maps: { ...d.maps, [channel]: paintMap(d.mesh, map, stamps, color, opacity) },
              };
              current.current = next;
              setDraft(next);
            }}
            onFinish={(mesh) => {
              const before = stroke.current;
              stroke.current = undefined;
              if (!before) return;
              let next = current.current;
              if (mesh)
                next = {
                  ...next,
                  mesh,
                  maps: { ...next.maps, normal: undefined, ao: undefined },
                  baked: false,
                };
              else if (tool === 'paint' && before !== next && next.maps[channel])
                next = {
                  ...next,
                  maps: { ...next.maps, [channel]: padPaintMap(next.mesh, next.maps[channel]!) },
                };
              current.current = before;
              if (mesh || before !== next)
                void apply(
                  next,
                  tool === 'mask'
                    ? 'Suojausmaski päivitetty.'
                    : mesh
                      ? 'Pinta muotoiltu. Laske normal- ja AO-kartat uudelleen tarvittaessa.'
                      : 'Siveltimenveto tallennettu työversioon.',
                );
            }}
          />
          <div className="surface-view-tools">
            <button onClick={() => setResetCamera((n) => n + 1)} title="Sovita osa näkymään">
              <Focus size={17} />
              Sovita
            </button>
            <button aria-pressed={wire} onClick={() => setWire(!wire)}>
              <Grid2X2 size={17} />
              Verkko
            </button>
            <button aria-pressed={tool === 'orbit'} onClick={() => setTool('orbit')}>
              Kamera
            </button>
          </div>
          <div className="surface-stats">
            <span>{(draft.mesh.positions.length / 3).toLocaleString('fi')} pistettä</span>
            <span>{(draft.mesh.indices.length / 3).toLocaleString('fi')} kolmiota</span>
            <span>{draft.atlas ? 'UV valmis' : 'UV luomatta'}</span>
          </div>
          <div className="surface-help">
            {tool === 'orbit'
              ? 'Vedä: kierrä · oikea painike: siirrä · rulla: zoomaa'
              : tool === 'paint'
                ? 'Vedä: maalaa · oikea painike: siirrä · rulla: zoomaa · Esc: kamera'
                : tool === 'mask'
                  ? 'Vedä: suojaa · Shift: poista suojaus · Esc: kamera'
                  : 'Vedä: muotoile · Shift: tasoita · Esc: kamera'}
          </div>
        </main>
        <aside className="surface-controls" aria-label="Verkon ja pinnan asetukset">
          <fieldset disabled={busy}>
            {tab === 'mesh' && (
              <>
                <h3>Verkon tarkkuus</h3>
                <p>
                  Alkuperäinen osa säilyy. Työversio on itsenäinen ja tukee verkon sekä pinnan
                  muokkausta.
                </p>
                {body.feature.type !== 'mesh' ? (
                  <>
                    <label>
                      Tarkkuus
                      <select
                        aria-label="Verkkotarkkuus"
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                      >
                        <option value="coarse">Kevyt</option>
                        <option value="medium">Tasapainoinen</option>
                        <option value="fine">Tarkka</option>
                      </select>
                    </label>
                    <button className="surface-primary" onClick={() => void remesh()}>
                      Luo verkko alkuperäisestä
                    </button>
                  </>
                ) : (
                  <>
                    <label>
                      Säilytä pisteistä · {keep} %
                      <input
                        aria-label="Säilytettävät pisteet"
                        type="range"
                        min="5"
                        max="100"
                        value={keep}
                        onChange={(e) => setKeep(Number(e.target.value))}
                      />
                    </label>
                    <button onClick={() => void beginJob('simplify')}>Kevennä verkkoa</button>
                  </>
                )}
                <p className="surface-note">
                  Uusi verkko korvaa työversion muodon ja pintakartat. Muutoksen voi perua.
                </p>
                <button
                  onClick={() =>
                    tryAction(() =>
                      apply(
                        {
                          ...draft,
                          mesh: subdivideMesh(draft.mesh),
                          loops: undefined,
                          selection: undefined,
                        },
                        'Verkkoa tihennetty muotoilua varten.',
                      ),
                    )
                  }
                >
                  Tihennä verkkoa
                </button>
                <details>
                  <summary>Ympyrä, sylinteri tai pallo</summary>
                  <label>
                    Muoto
                    <select
                      aria-label="Verkon perusmuoto"
                      value={primitive}
                      onChange={(e) => setPrimitive(e.target.value as typeof primitive)}
                    >
                      <option value="circle">Ympyrä</option>
                      <option value="cylinder">Sylinteri</option>
                      <option value="sphere">Pallo</option>
                    </select>
                  </label>
                  {numberField('Säde · mm', radius, setRadius)}
                  {primitive === 'cylinder' && numberField('Korkeus · mm', height, setHeight)}
                  <label>
                    Sivujen määrä
                    <input
                      aria-label="Verkon sivujen määrä"
                      type="number"
                      min="3"
                      max="128"
                      value={segments}
                      onChange={(e) => setSegments(Number(e.target.value))}
                    />
                  </label>
                  <button
                    onClick={() =>
                      tryAction(() => {
                        apply(
                          {
                            mesh: primitiveMesh(
                              primitive,
                              parseLength(radius, false, false),
                              parseLength(height, false, false),
                              segments,
                              bounds.center,
                            ),
                            maps: {},
                            atlas: false,
                            baked: false,
                          },
                          'Työversion perusmuoto vaihdettu.',
                          false,
                        );
                        setResetCamera((n) => n + 1);
                      })
                    }
                  >
                    Vaihda työversio tähän muotoon
                  </button>
                </details>
              </>
            )}
            {tab === 'shape' && (
              <>
                {!!draft.loops?.length && (
                  <>
                    <h3>Silmukan muokkaus</h3>
                    <label>
                      Valinta
                      <select
                        aria-label="Muokattava silmukka"
                        value={draft.loops.findIndex((l) => l === draft.selection)}
                        onChange={(e) => {
                          const i = Number(e.target.value),
                            next = {
                              ...draft,
                              selection: i < 0 ? draft.loops!.flat() : draft.loops![i],
                            };
                          current.current = next;
                          setDraft(next);
                          setConfirmed(next);
                          setTool('orbit');
                        }}
                      >
                        <option value="-1">Kaikki lisätyt silmukat</option>
                        {draft.loops.map((_, i) => (
                          <option key={i} value={i}>
                            Silmukka {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="surface-tool-buttons">
                      {(
                        [
                          ['move', 'Siirrä'],
                          ['rotate', 'Kierrä'],
                          ['scale', 'Skaalaa'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          aria-pressed={operation === id && tool === 'orbit'}
                          onClick={() => chooseOperation(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="surface-transform-fields">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <label key={axis}>
                          {axis} ·{' '}
                          {operation === 'move' ? 'mm' : operation === 'rotate' ? '°' : '%'}
                          <input
                            aria-label={`Silmukan ${axis}`}
                            inputMode="decimal"
                            value={transformValues[i]}
                            onChange={(e) =>
                              setTransformValues((values) =>
                                values.map((v, k) => (i === k ? e.target.value : v)),
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                modifySelection();
                              }
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <button onClick={modifySelection}>Hyväksy silmukan muutos</button>
                    <p className="surface-note">
                      Vedä kahvoista tai anna tarkka mitta. M: siirrä · R: kierrä · S: skaalaa.
                    </p>
                  </>
                )}
                <h3>Muotoilusivellin</h3>
                <div className="surface-tool-buttons">
                  {(
                    [
                      ['raise', 'Nosta'],
                      ['lower', 'Paina'],
                      ['smooth', 'Tasoita'],
                      ['mask', 'Suojaa'],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} aria-pressed={tool === id} onClick={() => setTool(id)}>
                      {label}
                    </button>
                  ))}
                </div>
                {numberField('Siveltimen säde · mm', brushRadius, setBrushRadius)}
                {numberField('Voimakkuus · mm', strength, setStrength)}
                <label className="surface-check">
                  <input
                    type="checkbox"
                    checked={pinBoundary}
                    onChange={(e) => setPinBoundary(e.target.checked)}
                  />
                  Pidä avoimen pinnan reunat paikallaan
                </label>
                <p className="surface-note">
                  Sivellin liikuttaa verkon pisteitä. Tihennä harvaa verkkoa ennen pieniä
                  yksityiskohtia.
                </p>
                <div className="surface-tool-buttons">
                  <button
                    disabled={!draft.selection?.length}
                    onClick={() =>
                      void apply(
                        { ...draft, mesh: maskSelection(draft.mesh, draft.selection!, 1) },
                        'Valinta suojattu.',
                      )
                    }
                  >
                    Suojaa valinta
                  </button>
                  <button
                    disabled={!draft.mesh.mask?.some((n) => n > 0)}
                    onClick={() =>
                      void apply(
                        { ...draft, mesh: { ...draft.mesh, mask: undefined } },
                        'Suojaus poistettu.',
                      )
                    }
                  >
                    Poista suojaus
                  </button>
                </div>
                <p className="surface-note">
                  Violetti alue on suojattu myös maalaukselta. Suojaa-siveltimellä Shift poistaa
                  suojausta.
                </p>
                <h3>Leikkaussilmukka</h3>
                {axes}
                {numberField('Tason paikka · %', position, setPosition)}
                <label>
                  Silmukoita
                  <input
                    aria-label="Silmukoiden määrä"
                    type="number"
                    min="1"
                    max="16"
                    value={loopCount}
                    onChange={(e) => setLoopCount(Number(e.target.value))}
                  />
                </label>
                <button
                  onClick={() =>
                    tryAction(() => {
                      if (!Number.isInteger(loopCount) || loopCount < 1 || loopCount > 16)
                        throw new Error('Anna 1–16 silmukkaa.');
                      const pos = Number(position.replace(',', '.'));
                      if (!Number.isFinite(pos) || pos <= 0 || pos >= 100)
                        throw new Error('Aseta taso 0–100 % väliin.');
                      let mesh = draft.mesh;
                      const coordinates: number[] = [];
                      for (let i = 0; i < loopCount; i++) {
                        const amount = loopCount === 1 ? pos / 100 : (i + 1) / (loopCount + 1);
                        const coordinate = bounds.min[axis] + bounds.size[axis] * amount;
                        coordinates.push(coordinate);
                        mesh = cutLoop(mesh, axis, coordinate);
                      }
                      const loops = coordinates.map((coordinate) =>
                        planeSelection(mesh, axis, coordinate),
                      );
                      chooseOperation('move');
                      void apply(
                        { ...draft, mesh, loops, selection: loops.flat() },
                        'Leikkaussilmukat lisätty. Siirrä, kierrä tai skaalaa oranssia valintaa.',
                      );
                    })
                  }
                >
                  Lisää silmukka{loopCount > 1 ? 't' : ''}
                </button>
                <p className="surface-note">
                  Yksi silmukka käyttää tason paikkaa. Useat jaetaan tasavälein. Leikkaus lisää
                  reunat kolmioverkkoon.
                </p>
                <h3>Peilaa</h3>
                <p className="surface-note">Käyttää yllä valittua akselia.</p>
                {numberField(
                  'Peilaustason siirtymä keskeltä · mm',
                  mirrorPosition,
                  setMirrorPosition,
                )}
                <label className="surface-check">
                  <input
                    type="checkbox"
                    checked={mirrorCopy}
                    onChange={(e) => setMirrorCopy(e.target.checked)}
                  />
                  Lisää erillinen peilikopio
                </label>
                <button
                  onClick={() =>
                    tryAction(() => {
                      const mesh = mirrorMesh(
                        draft.mesh,
                        axis,
                        bounds.center[axis] + parseLength(mirrorPosition, true, true),
                        mirrorCopy,
                      );
                      apply(
                        {
                          ...draft,
                          mesh,
                          atlas: mirrorCopy ? false : draft.atlas,
                          maps: mirrorCopy ? {} : draft.maps,
                          baked: false,
                          loops: undefined,
                          selection: undefined,
                        },
                        mirrorCopy
                          ? 'Peilikopio lisätty verkkoon. Luo UV-kartta uudelleen; puoliskoja ei hitsattu yhteen.'
                          : 'Työversio peilattu.',
                      );
                    })
                  }
                >
                  Peilaa työversio
                </button>
                <button
                  onClick={() =>
                    tryAction(() =>
                      apply(
                        {
                          mesh: symmetricMesh(
                            draft.mesh,
                            axis,
                            bounds.center[axis] + parseLength(mirrorPosition, true, true),
                          ),
                          maps: {},
                          atlas: false,
                          baked: false,
                        },
                        'Positiivinen puolisko peilattu yhtenäiseksi pinnaksi. Luo UV-kartta uudelleen.',
                      ),
                    )
                  }
                >
                  Peilaa puoliskosta yhtenäinen muoto
                </button>
                <p className="surface-note">
                  Puoliskon peilaus säilyttää akselin positiivisen puolen ja korvaa vastakkaisen
                  puolen.
                </p>
              </>
            )}
            {(tab === 'uv' || tab === 'bake') && (
              <>
                <h3>{tab === 'uv' ? 'Automaattinen UV-kartta' : 'Siirrä yksityiskohdat'}</h3>
                <p>
                  {tab === 'uv'
                    ? 'Pinnat avataan tekstuurikartalle. Nykyinen väri, karheus ja metallisuus siirretään mukana.'
                    : 'Lähdemallin yksityiskohdat siirretään työversion normal- ja AO-karttoihin. Väri, karheus ja metallisuus siirretään samalla.'}
                </p>
                <label>
                  Tekstuurikoko
                  <select
                    aria-label="Pintakartan koko"
                    value={size}
                    onChange={(e) => setSize(Number(e.target.value))}
                  >
                    {[128, 256, 512, 1024].map((n) => (
                      <option key={n} value={n}>
                        {n} × {n}
                      </option>
                    ))}
                  </select>
                </label>
                {tab === 'bake' && (
                  <>
                    <label>
                      Lähdemalli
                      <select
                        aria-label="Pintakarttojen lähdemalli"
                        value={referenceId}
                        onChange={(e) => setReferenceId(e.target.value)}
                      >
                        {project.bodies
                          .filter((b) => b.purpose !== 'drawing')
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {stale && (
                      <p className="surface-note">
                        Alkuperäistä osaa on muokattu tämän työversion jälkeen. Tarkista kohdistus.
                      </p>
                    )}
                    {numberField('Pinnan hakumatka · mm', cage, setCage)}
                    {numberField('AO-vaikutusetäisyys · mm', aoDistance, setAoDistance)}
                    <label>
                      AO-näytteet
                      <select value={samples} onChange={(e) => setSamples(Number(e.target.value))}>
                        {[8, 16, 32, 64].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button
                  className="surface-primary"
                  disabled={tab === 'bake' && !draft.atlas}
                  onClick={() => void beginJob(tab === 'uv' ? 'unwrap' : 'bake')}
                >
                  {tab === 'uv' ? 'Luo UV-kartta' : 'Laske pintakartat'}
                </button>
                {tab === 'bake' && !draft.atlas && (
                  <button onClick={() => setTab('uv')}>Avaa UV-kartta ensin</button>
                )}
                <p className="surface-note">
                  {tab === 'uv'
                    ? 'Uusi UV-kartta korvaa aiemmat pintakartat siirtämällä nykyisen ulkonäön uuteen asetteluun.'
                    : 'Laskenta korvaa nykyiset pintakartat. Normal-kartta ei muuta siluettia tai tee läpireikiä.'}
                </p>
              </>
            )}
            {tab === 'paint' && (
              <>
                <h3>Maalaa pintaan</h3>
                {!draft.atlas ? (
                  <>
                    <p>Luo ensin UV-kartta, jotta siveltimen jäljet tallentuvat osan pintaan.</p>
                    <button onClick={() => setTab('uv')}>Luo UV-kartta</button>
                  </>
                ) : (
                  <>
                    <label>
                      Muokattava kanava
                      <select
                        aria-label="Maalauksen kanava"
                        value={channel}
                        onChange={(e) => setChannel(e.target.value as typeof channel)}
                      >
                        <option value="color">Väri</option>
                        <option value="roughness">Karheus</option>
                        <option value="metalness">Metallisuus</option>
                      </select>
                    </label>
                    {channel === 'color' ? (
                      <label>
                        Väri
                        <input
                          aria-label="Siveltimen väri"
                          type="color"
                          value={paintColor}
                          onChange={(e) => setPaintColor(e.target.value)}
                        />
                      </label>
                    ) : (
                      <label>
                        {channel === 'roughness' ? 'Sileä ↔ matta' : 'Ei-metalli ↔ metalli'}
                        <input
                          aria-label="Siveltimen pinta-arvo"
                          type="range"
                          min="0"
                          max="1"
                          step=".01"
                          value={paintValue}
                          onChange={(e) => setPaintValue(Number(e.target.value))}
                        />
                      </label>
                    )}
                    {numberField('Siveltimen säde · mm', brushRadius, setBrushRadius)}
                    <label>
                      Voimakkuus
                      <input
                        aria-label="Maalauksen voimakkuus"
                        type="range"
                        min=".05"
                        max="1"
                        step=".05"
                        value={opacity}
                        onChange={(e) => setOpacity(Number(e.target.value))}
                      />
                    </label>
                    <button aria-pressed={tool === 'paint'} onClick={() => setTool('paint')}>
                      Maalaa malliin
                    </button>
                    <p className="surface-note">
                      Sivellin seuraa pinnan mittakaavaa myös UV-saumojen yli. Yksi veto on yksi
                      peruutettava toiminto.
                    </p>
                  </>
                )}
              </>
            )}
            {['uv', 'paint', 'bake'].includes(tab) && (
              <div className="surface-map-preview">
                <label>
                  Kartan esikatselu
                  <select
                    aria-label="Näytettävä pintakartta"
                    value={previewMap}
                    onChange={(e) => setPreviewMap(e.target.value as MapChannel)}
                  >
                    {(
                      [
                        ['color', 'Väri'],
                        ['normal', 'Normal'],
                        ['ao', 'AO'],
                        ['roughness', 'Karheus'],
                        ['metalness', 'Metallisuus'],
                      ] as const
                    ).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <canvas ref={canvas} aria-label="UV- ja pintakartan esikatselu" />
                <button
                  disabled={!draft.maps[previewMap]}
                  onClick={() => {
                    const map = draft.maps[previewMap];
                    if (!map) return;
                    const a = document.createElement('a');
                    a.download = `${name}-${previewMap}.png`;
                    a.href = mapCanvas(map).toDataURL('image/png');
                    a.click();
                  }}
                >
                  Lataa kartta PNG-kuvana
                </button>
              </div>
            )}
          </fieldset>
        </aside>
      </div>
      <footer className="surface-footer">
        <div>
          {busy ? (
            <div className="surface-progress" role="status">
              <LoaderCircle className="surface-spin" size={16} />
              {label}
              <progress max="1" value={progress} />
              {label !== 'Tallennetaan työversio…' && (
                <button onClick={cancelJob}>Peru laskenta</button>
              )}
            </div>
          ) : error || brushError ? (
            <p role="alert">{error || brushError}</p>
          ) : (
            <p role="status">
              {notice || 'Muokkaa työversiota ja tallenna se lopuksi projektiin.'}
            </p>
          )}
          {checkpointStatus && (
            <p className="surface-recovery-status" aria-live="polite">
              {checkpointStatus}
            </p>
          )}
          {!body.surfaceWorkflow && (
            <label className="surface-check">
              <input
                type="checkbox"
                checked={hideOriginal}
                disabled={busy}
                onChange={(e) => setHideOriginal(e.target.checked)}
              />
              Piilota alkuperäinen tallennettaessa
            </label>
          )}
        </div>
        <button
          className="surface-primary"
          disabled={busy || (!dirty && !!body.surfaceWorkflow)}
          onClick={() => void save()}
        >
          <Check size={17} />
          {body.surfaceWorkflow ? 'Tallenna työversio' : 'Lisää työversio projektiin'}
        </button>
      </footer>
      {closing && (
        <div
          className="surface-close-prompt"
          role="alertdialog"
          aria-label="Tallentamaton työversio"
        >
          <h3>Työversiossa on muutoksia</h3>
          <p>Tallenna muutokset projektiin tai sulje työversio tallentamatta.</p>
          <button onClick={() => setClosing(false)}>Jatka muokkausta</button>
          <button
            onClick={() => {
              checkpointEnabled.current = false;
              void removeRecovery(project.id, body.id)
                .then(onClose)
                .catch((e: Error) => {
                  checkpointEnabled.current = true;
                  setError(e.message);
                  setClosing(false);
                });
            }}
          >
            Hylkää työversio
          </button>
          <button
            onClick={() => {
              const record = recoveryRecord.current;
              if (record)
                void saveRecovery(record)
                  .then(onClose)
                  .catch((e: Error) => {
                    setError(e.message);
                    setClosing(false);
                  });
            }}
          >
            Jätä keskeneräiseksi
          </button>
          <button
            className="surface-primary"
            onClick={() => {
              setClosing(false);
              void save();
            }}
          >
            Tallenna projektiin
          </button>
        </div>
      )}
    </dialog>
  );
}
