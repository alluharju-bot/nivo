import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Box,
  Check,
  CircleHelp,
  Circle,
  Scissors,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Hand,
  Layers2,
  Maximize,
  MousePointer2,
  Move3D,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  Ruler,
  Pencil,
  Merge,
  Crosshair,
  RotateCw,
  Square,
  Trash2,
  Undo2,
  X,
  XCircle,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';
import { Viewport, type CameraCommand, type Tool } from './viewport/Viewport';
import { DrawingPanel } from './drawing/DrawingPanel';
import { recommendedScale, type Sheet } from './drawing/svg';
import { useEditor } from './useEditor';
import {
  cabinetProject,
  dimensionValue,
  freshProject,
  makeBody,
  makePolygonBody,
  makeProfileBody,
  mergeBodies,
  parseProject,
  featureIsSolid,
  uid,
  type Anchor,
  type Guide,
  type WorkPlane,
  type Axis,
  type Body,
  type FaceRef,
  type Vec3,
  type View,
} from './model/project';
import { formatLength, parseLength } from './model/units';
import { downloadFile, safeFilename } from './storage/projects';
import type { DrawingView, FaceTarget } from './cad/protocol';
import { DynamicInput, type NumericField } from './ui/DynamicInput';
import { CommitCheckbox } from './ui/CommitCheckbox';
import { BooleanPanel, ShapeProperties, type Operation } from './ui/ModelingPanel';
import { applyBoolean, type BooleanOperation } from './model/operations';
import {
  sketchFrame as createSketchFrame,
  toUV,
  fromUV,
  frameV,
  cross,
  type SketchFrame,
  type Profile,
} from './model/sketch';
import {
  angleBetween,
  guidePoints,
  guideVector,
  guideDirection,
  parseAngle,
  resolveAnchor,
} from './model/guides';
import {
  add,
  sub,
  scale as scaleVector,
  unit,
  dot,
  axisVector,
  planeForDirection,
} from './model/geometry';
import type { ReferencePoint } from './model/snap';
import type { Gesture } from './viewport/types';

const faceNames: Record<FaceRef, string> = {
  'x:min': 'Vasen pinta',
  'x:max': 'Oikea pinta',
  'y:min': 'Etupinta',
  'y:max': 'Takapinta',
  'z:min': 'Alapinta',
  'z:max': 'Yläpinta',
};
const tools: { id: Tool; label: string; icon: ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Valitse', icon: <MousePointer2 />, shortcut: 'V' },
  { id: 'rectangle', label: 'Suorakulmio', icon: <Square />, shortcut: 'R' },
  { id: 'circle', label: 'Ympyrä', icon: <Circle />, shortcut: 'C' },
  { id: 'extrude', label: 'Push / pull', icon: <ArrowUpFromLine />, shortcut: 'E' },
  { id: 'move', label: 'Siirrä', icon: <Move3D />, shortcut: 'M' },
  { id: 'pen', label: 'Kynä', icon: <Pencil />, shortcut: 'K' },
  { id: 'boolean', label: 'Muotoile', icon: <Scissors />, shortcut: 'B' },
  { id: 'measure', label: 'Mittatyökalu', icon: <Ruler />, shortcut: 'T' },
  { id: 'navigate', label: 'Navigoi', icon: <Hand />, shortcut: 'H' },
];
const instructions: Record<Tool, string> = {
  select: 'Napauta kappaletta tai pintaa. Kahdella sormella voit panoroida ja zoomata.',
  rectangle:
    'Vedä tai kirjoita X ja Tab → Y. Enter tai hiiren vapautus hyväksyy. Shift lukitsee haetun viitepisteen.',
  circle:
    'C · Valitse keskipiste ja vedä säde. Kirjoita halkaisija, Tab vaihtaa kenttää. Enter hyväksyy.',
  boolean: 'Valitse kohteet ja työstökappaleet. Vaihda keskenään kääntää leikkauksen suunnan.',
  extrude:
    'E · Osoita pintaa ja vedä normaalin suuntaan. Positiivinen lisää, negatiivinen poistaa. Enter hyväksyy.',
  move: 'Vedä kappaletta tai anna siirtymä. Hyväksy uusi sijainti.',
  pen: 'X/Y/Z lukitsee akselin. Shift lukitsee suunnan; poimi pituus toisesta pisteestä. Esc vapauttaa lukon.',
  measure:
    'Vedä verteksistä tai reunasta. X/Y/Z lukitsee akselin, Esc vapauttaa. R kiertää 45°, Shift+R vapaasti.',
  navigate: 'Vedä yhdellä sormella kiertääksesi. Kahdella sormella panoroit ja zoomaat.',
};
type Fields = {
  thickness: string;
  width: string;
  depth: string;
  height: string;
  x: string;
  y: string;
  z: string;
  length: string;
  angle: string;
  offset: string;
};
const defaults: Fields = {
  thickness: '0',
  width: '600',
  depth: '400',
  height: '18',
  x: '0',
  y: '0',
  z: '0',
  length: '100',
  angle: '0',
  offset: '0',
};

function IconButton({
  children,
  label,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      className={`icon-button ${props.className ?? ''}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
export default function App() {
  const editor = useEditor();
  const { project, busy, ready } = editor;
  const [selected, setSelected] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [measureMode, setMeasureMode] = useState<'guide' | 'free'>('guide');
  const [measureMenu, setMeasureMenu] = useState(false);
  const [reference, setReference] = useState<ReferencePoint>();
  const [pickReference, setPickReference] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [popup, setPopup] = useState<[number, number]>([24, 120]);
  const [penPoints, setPenPoints] = useState<Vec3[]>([]);
  const penRef = useRef<Vec3[]>([]);
  const [penHover, setPenHover] = useState<Vec3>();
  const [penConstraint, setPenConstraint] = useState<Vec3>();
  const constraintRef = useRef<Vec3 | undefined>(undefined);
  const [faceTarget, setFaceTarget] = useState<FaceTarget>();
  const faceRef = useRef<FaceTarget | undefined>(undefined);
  const [selectedGuideId, setSelectedGuideId] = useState<string>();
  const [freeRotate, setFreeRotate] = useState(false);
  const [shapeFrame, setShapeFrame] = useState<SketchFrame>();
  const shapeFrameRef = useRef<SketchFrame | undefined>(undefined);
  const [sketchTarget, setSketchTarget] = useState<FaceTarget>();
  const sketchTargetRef = useRef<FaceTarget | undefined>(undefined);
  const [drawOnSurface, setDrawOnSurface] = useState(true);
  const [shapeKind, setShapeKind] = useState<'circle' | 'ellipse' | 'polygon'>('circle');
  const [shapeSides, setShapeSides] = useState(6);
  const [shapePurpose, setShapePurpose] = useState<Body['purpose']>('model');
  const [shapeName, setShapeName] = useState('');
  const [booleanOperation, setBooleanOperation] = useState<BooleanOperation>('cut');
  const [booleanTargets, setBooleanTargets] = useState<string[]>([]);
  const [booleanTools, setBooleanTools] = useState<string[]>([]);
  const [booleanActive, setBooleanActive] = useState<'targets' | 'tools'>('targets');
  const [keepTools, setKeepTools] = useState(true);
  const [pickDepth, setPickDepth] = useState(false);
  const hoverRef = useRef<Vec3 | undefined>(undefined);
  const [guideDraft, setGuideDraft] = useState<{
    anchor: Anchor;
    plane: WorkPlane;
    endAnchor?: Anchor;
    id?: string;
    direction?: Vec3;
    offset?: Vec3;
    xray?: boolean;
    edgeLength?: number;
  }>();
  const guideRef = useRef<typeof guideDraft>(undefined);
  const lockRef = useRef(new Set<string>());
  const [locked, setLocked] = useState(new Set<string>());
  const committing = useRef(false);
  const [selectedFace, setSelectedFace] = useState<FaceRef>();
  const [tool, setTool] = useState<Tool>('select');
  const [mode, setMode] = useState<'model' | 'drawing'>('model');
  const [fields, setFields] = useState<Fields>(defaults);
  const fieldsRef = useRef(fields);
  const [draftId, setDraftId] = useState<string>(uid);
  const [axis, setAxis] = useState<Axis>();
  const [gridSnap, setGridSnap] = useState(true);
  const [snapLabel, setSnapLabel] = useState('Ruudukko · 10 mm');
  const [projection, setProjection] = useState<'perspective' | 'orthographic'>('perspective');
  const [view, setView] = useState<View>('iso');
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>();
  const [drawingView, setDrawingView] = useState<DrawingView>('front');
  const [scale, setScale] = useState(5);
  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState<Sheet>();
  const [panelOpen, setPanelOpen] = useState(true);
  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<'objects' | 'dimensions' | 'guides'>('objects');
  const fileInput = useRef<HTMLInputElement>(null);
  const body = project.bodies.find((b) => b.id === selected);
  const editing = ['rectangle', 'circle', 'extrude', 'move', 'measure', 'pen'].includes(tool);
  const writeFields = (patch: Partial<Fields>) => {
    fieldsRef.current = { ...fieldsRef.current, ...patch };
    setFields(fieldsRef.current);
  };
  const field = (key: string, value: string) => {
    if (key === 'thickness') {
      writeFields({ thickness: value });
      return;
    }
    lockRef.current.add(key);
    setLocked(new Set(lockRef.current));
    writeFields({ [key]: value });
    if (tool === 'pen') penMove(hoverRef.current ?? penRef.current.at(-1));
    if (tool === 'measure' && guideRef.current) {
      guideRef.current = { ...guideRef.current, endAnchor: undefined };
      if (key === 'angle') {
        try {
          guideRef.current.direction = guideDirection(guideRef.current.plane, parseAngle(value));
          setAxis(undefined);
        } catch {}
      }
      setGuideDraft(guideRef.current);
    }
  };
  const clearLocks = () => {
    lockRef.current.clear();
    setLocked(new Set());
  };
  const resetGesture = () => {
    setEpoch((e) => e + 1);
    guideRef.current = undefined;
    setGuideDraft(undefined);
    penRef.current = [];
    setPenPoints([]);
    hoverRef.current = undefined;
    setPenHover(undefined);
    clearLocks();
    setReference(undefined);
    setPickReference(false);
    faceRef.current = undefined;
    setFaceTarget(undefined);
    setSelectedGuideId(undefined);
    setFreeRotate(false);
    constraintRef.current = undefined;
    setPenConstraint(undefined);
    setAxis(undefined);
    shapeFrameRef.current = undefined;
    setShapeFrame(undefined);
    sketchTargetRef.current = undefined;
    setSketchTarget(undefined);
    setPickDepth(false);
  };
  const toggleBoolean = (id: string, group: 'targets' | 'tools' = booleanActive) => {
    if (!featureIsSolid(project.bodies.find((b) => b.id === id)!.feature)) {
      editor.setMessage('Anna luonnokselle ensin paksuus.');
      return;
    }
    const change = (ids: string[]) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
    if (group === 'targets') {
      setBooleanTargets(change);
      setBooleanTools((ids) => ids.filter((v) => v !== id));
    } else {
      setBooleanTools(change);
      setBooleanTargets((ids) => ids.filter((v) => v !== id));
    }
  };
  const select = (id?: string, face?: FaceRef, additive = false, force = false) => {
    if (tool === 'boolean' && !force) {
      if (id) toggleBoolean(id);
      return;
    }
    setSelected(id);
    setSelectedFace(face);
    setTool('select');
    setMeasureMenu(false);
    setSelectedIds((previous) =>
      id
        ? additive || multiSelect
          ? previous.includes(id)
            ? previous.filter((v) => v !== id)
            : [...previous, id]
          : [id]
        : additive
          ? previous
          : [],
    );
    resetGesture();
  };
  const fit = () => setCameraCommand({ id: performance.now(), type: 'fit' });
  const changeView = (next: View) => {
    setView(next);
    setProjection(next === 'iso' ? 'perspective' : 'orthographic');
    setCameraCommand({ id: performance.now(), type: 'view', view: next });
  };
  const begin = (next: Tool) => {
    if (busy) return;
    if (next === 'measure' && tool === 'measure') {
      setMeasureMenu(!measureMenu);
      return;
    }
    if (next === 'move' && !body) {
      editor.setMessage('Valitse ensin kappale.');
      return;
    }
    resetGesture();
    setTool(next);
    setMode('model');
    setMeasureMenu(false);
    editor.setError('');
    if (next === 'boolean') {
      setPanelOpen(true);
      setBooleanTargets(
        selectedIds.filter((id) =>
          featureIsSolid(project.bodies.find((b) => b.id === id)!.feature),
        ),
      );
      setBooleanTools([]);
      setBooleanActive('targets');
      return;
    }
    if (next === 'measure') setMeasureMode('guide');
    if (['rectangle', 'circle', 'extrude', 'move', 'measure', 'pen'].includes(next)) {
      setPanelOpen(true);
      setDraftId(uid());
      writeFields({ ...defaults });
      if (next === 'circle') writeFields({ width: '100', depth: '60' });
      if (['rectangle', 'circle', 'pen'].includes(next))
        setShapeName(
          `${next === 'rectangle' ? 'Levy' : next === 'circle' ? 'Ympyrä' : 'Kynämuoto'} ${project.bodies.length + 1}`,
        );
      if (next === 'extrude' && body) {
        const mesh = editor.meshes.find((m) => m.id === body.id);
        const face =
          mesh?.faces.find((f) => f.ref === selectedFace) ??
          mesh?.faces.find((f) => f.normal[2] > 0.9) ??
          mesh?.faces[0];
        if (face) {
          const target = {
            bodyId: body.id,
            face: face.ref,
            normal: face.normal,
            point: face.center,
          };
          faceRef.current = target;
          setFaceTarget(target);
        }
      }
      if (next === 'rectangle' || next === 'circle' || next === 'pen') {
        setSelected(undefined);
        setSelectedIds([]);
        setSelectedFace(undefined);
      }
    }
  };
  const makePreview = (): Body | undefined => {
    const fields = fieldsRef.current;
    if (!editing || ['measure', 'pen', 'extrude'].includes(tool)) return;
    if (tool === 'rectangle' || tool === 'circle') {
      const frame =
        shapeFrameRef.current ??
        createSketchFrame([
          parseLength(fields.x, true, true),
          parseLength(fields.y, true, true),
          parseLength(fields.z, true, true),
        ]);
      const width = parseLength(fields.width),
        depth = parseLength(fields.depth),
        distance = parseLength(fields.thickness, true, true);
      if (tool === 'circle') {
        const profile: Profile =
          shapeKind === 'circle'
            ? { kind: 'circle', radius: width / 2 }
            : shapeKind === 'ellipse'
              ? { kind: 'ellipse', radiusX: width / 2, radiusY: depth / 2 }
              : {
                  kind: 'polygon',
                  points: Array.from({ length: shapeSides }, (_, i) => [
                    (width / 2) * Math.cos((i / shapeSides) * Math.PI * 2),
                    (width / 2) * Math.sin((i / shapeSides) * Math.PI * 2),
                  ]),
                };
        return {
          ...makeProfileBody(profile, frame, distance, shapeName || 'Muoto', shapePurpose),
          id: draftId,
        };
      }
      if (frame.normal[2] < 0.999999 || Math.abs(frame.u[0] - 1) > 1e-6 || distance < 0)
        return {
          ...makeProfileBody(
            { kind: 'rectangle', width, depth },
            frame,
            distance,
            shapeName || 'Levy',
            shapePurpose,
          ),
          id: draftId,
        };
      return {
        ...makeBody(
          width,
          depth,
          distance,
          frame.origin,
          shapeName || `Levy ${project.bodies.length + 1}`,
        ),
        id: draftId,
        purpose: shapePurpose,
      };
    }
    if (!body) return;
    return {
      ...body,
      origin: body.origin.map(
        (n, i) => n + parseLength(fields[(['x', 'y', 'z'] as const)[i]], true, true),
      ) as Vec3,
    };
  };
  const preview = useMemo(() => {
    try {
      return makePreview();
    } catch {
      return undefined;
    }
  }, [
    tool,
    fields,
    body,
    draftId,
    project.bodies.length,
    shapeFrame,
    shapeKind,
    shapeSides,
    shapePurpose,
    shapeName,
  ]);
  const faceDistance = useMemo(() => {
    try {
      return parseLength(fields.height, true, true);
    } catch {
      return 0;
    }
  }, [fields.height]);

  const makeGuide = (): Guide | undefined => {
    const draft = guideRef.current;
    if (!draft) return;
    return {
      id: draft.id ?? draftId,
      anchor: draft.anchor,
      plane: draft.plane,
      endAnchor: draft.endAnchor,
      mode: measureMode,
      length: parseLength(fieldsRef.current.length),
      angle: parseAngle(fieldsRef.current.angle),
      direction: draft.direction,
      offset: draft.offset
        ? scaleVector(unit(draft.offset), parseLength(fieldsRef.current.offset, true, true))
        : undefined,
      xray: draft.xray,
    };
  };
  const guidePreview = useMemo(() => {
    try {
      return makeGuide();
    } catch {
      return undefined;
    }
  }, [guideDraft, fields, measureMode, draftId]);
  const precisePenPoint = (point: Vec3): Vec3 => {
    const start = penRef.current.at(-1);
    if (!start) return point;
    if (constraintRef.current && lockRef.current.has('length'))
      return add(
        start,
        scaleVector(constraintRef.current, parseLength(fieldsRef.current.length, true, true)),
      );
    return point.map((n, i) => {
      const key = (['x', 'y', 'z'] as const)[i];
      return lockRef.current.has(key)
        ? start[i] + parseLength(fieldsRef.current[key], true, true)
        : n;
    }) as Vec3;
  };
  const changeOperation = (operation: Operation) => {
    if (operation === 'new') {
      begin('rectangle');
      return;
    }
    if (tool !== 'boolean') begin('boolean');
    setBooleanOperation(operation);
  };
  const commitShape = async (candidate: Body) => {
    const target = drawOnSurface && shapePurpose === 'model' ? sketchTargetRef.current : undefined;
    const source = project.bodies.find((b) => b.id === target?.bodyId),
      distance = parseLength(fieldsRef.current.thickness, true, true);
    let selectedRegion: FaceRef | undefined;
    if (target && source) {
      let flat = candidate;
      if (candidate.feature.type === 'profile-extrusion')
        flat = makeProfileBody(
          candidate.feature.profile,
          {
            ...candidate.feature.frame,
            origin: add(candidate.origin, candidate.feature.frame.origin),
          },
          0,
          candidate.name,
        );
      else if (candidate.feature.type === 'rectangle-extrusion')
        flat = { ...candidate, feature: { ...candidate.feature, height: 0 } };
      const committed = await editor.transact(
        async () => {
          const split = await editor.cad.split(source, target.face, flat);
          selectedRegion = split.face;
          const next = distance
            ? await editor.cad.pushPull(split.body, split.face, distance)
            : split.body;
          return { ...project, bodies: project.bodies.map((b) => (b.id === source.id ? next : b)) };
        },
        distance
          ? 'Pintaan tehty muotoilu.'
          : 'Pinta jaettu. Rajattu alue on valittu; paina E muokataksesi sitä.',
      );
      if (committed) select(source.id, distance ? undefined : selectedRegion, false, true);
    } else if (
      await editor.transact(
        { ...project, bodies: [...project.bodies, candidate] },
        'Muoto valmis. Voit muokata pintaa E:llä tai käyttää kappaletta Cut/Join-työkalussa.',
      )
    )
      select(candidate.id, undefined, false, true);
  };
  const applyBooleanOperation = async () => {
    const targets = project.bodies.filter((b) => booleanTargets.includes(b.id)),
      tools = project.bodies.filter((b) => booleanTools.includes(b.id));
    let nextSelected: string | undefined;
    const success = await editor.transact(
      async () => {
        const results = await editor.cad.boolean(targets, tools, booleanOperation);
        nextSelected = results[0]?.id;
        if (
          booleanOperation === 'cut' &&
          results.length === targets.length &&
          results.every(
            (b) =>
              JSON.stringify(b.feature) ===
              JSON.stringify(targets.find((t) => t.id === b.id)?.feature),
          )
        )
          throw new Error('Työstökappaleet eivät leikkaa kohteita. Tarkista sijainnit.');
        return applyBoolean(
          project,
          booleanTargets,
          booleanTools,
          results,
          booleanOperation,
          keepTools,
        );
      },
      booleanOperation === 'cut' ? 'Leikkaus valmis.' : 'Kappaleet yhdistetty.',
    );
    if (success) select(nextSelected, undefined, false, true);
  };
  const apply = async (forceClose = false) => {
    if (committing.current || busy) return;
    try {
      if (tool === 'boolean') {
        committing.current = true;
        await applyBooleanOperation();
      } else if (tool === 'extrude') {
        const target = faceRef.current,
          source = project.bodies.find((b) => b.id === target?.bodyId);
        if (!target || !source) {
          editor.setMessage('Osoita pintaa ja aloita veto.');
          return;
        }
        const distance = parseLength(fieldsRef.current.height, true);
        committing.current = true;
        if (
          await editor.transact(async () => {
            const next = await editor.cad.pushPull(source, target.face, distance);
            return { ...project, bodies: project.bodies.map((b) => (b.id === next.id ? next : b)) };
          }, 'Pintaa muokattu.')
        )
          select(source.id);
      } else if (tool === 'pen') {
        if (!forceClose && lockRef.current.size && hoverRef.current) {
          const point = precisePenPoint(hoverRef.current);
          penRef.current = [...penRef.current, point];
          setPenPoints(penRef.current);
          clearLocks();
          writeFields({ x: '0', y: '0', z: '0' });
          editor.setError('');
          return;
        }
        let candidate = {
          ...makePolygonBody(penRef.current, shapeName || `Kynämuoto ${project.bodies.length + 1}`),
          purpose: shapePurpose,
        };
        const distance = parseLength(fieldsRef.current.thickness, true, true),
          frame = shapeFrameRef.current;
        if (
          sketchTargetRef.current &&
          frame &&
          penRef.current.some((p) => Math.abs(dot(sub(p, frame.origin), frame.normal)) > 1e-5)
        )
          throw new Error('Pintaan piirretyn muodon pisteiden tulee pysyä piirtotasossa.');
        if (distance) {
          const points = penRef.current,
            start = points[0],
            normal = points
              .slice(2)
              .map((p) => cross(sub(points[1], start), sub(p, start)))
              .find((n) => Math.hypot(...n) > 1e-8)!;
          const plane = sketchTargetRef.current && frame ? frame : createSketchFrame(start, normal);
          candidate = makeProfileBody(
            { kind: 'polygon', points: points.map((p) => toUV(p, plane)) },
            plane,
            distance,
            candidate.name,
            shapePurpose,
          );
        }
        committing.current = true;
        await commitShape(candidate);
      } else if (tool === 'measure') {
        const candidate = makeGuide();
        if (!candidate) {
          editor.setMessage(
            measureMode === 'guide'
              ? 'Valitse ensin kappaleen verteksi tai reuna.'
              : 'Valitse mittaviivan alkupiste.',
          );
          return;
        }
        committing.current = true;
        if (
          await editor.transact(
            {
              ...project,
              guides: [...project.guides.filter((g) => g.id !== candidate.id), candidate],
            },
            measureMode === 'guide'
              ? 'Apuviiva lisätty. Piirtäminen ja siirtäminen tarttuvat siihen.'
              : 'Mittaviiva lisätty.',
          )
        ) {
          select();
          setSelectedGuideId(candidate.id);
          setTab('guides');
        }
      } else {
        const candidate = makePreview();
        if (!candidate) return;
        committing.current = true;
        if (tool === 'rectangle' || tool === 'circle') {
          await commitShape(candidate);
          return;
        }
        const next = {
          ...project,
          bodies: project.bodies.map((b) => (b.id === candidate.id ? candidate : b)),
        };
        if (await editor.transact(next, 'Muokkaus valmis.')) select(candidate.id);
      }
    } catch (e) {
      editor.setError((e as Error).message);
    } finally {
      committing.current = false;
    }
  };
  const cancel = () => {
    if (axis || penConstraint) {
      setAxis(undefined);
      constraintRef.current = undefined;
      setPenConstraint(undefined);
      setEpoch((e) => e + 1);
      return;
    }
    if (busy) editor.cancel();
    resetGesture();
    setTool('select');
    setMeasureMenu(false);
    editor.setError('');
  };
  const rotateGuide = (free = false) => {
    if (!guideRef.current && selectedGuideId) {
      const guide = project.guides.find((g) => g.id === selectedGuideId);
      if (guide) editGuide(guide);
    }
    if (!guideRef.current) return;
    if (free) {
      setAxis(undefined);
      lockRef.current.delete('angle');
      setLocked(new Set(lockRef.current));
      setFreeRotate((v) => !v);
      return;
    }
    try {
      field('angle', String((parseAngle(fieldsRef.current.angle) + 45) % 360));
      const draft = guideRef.current;
      draft.direction = guideDirection(draft.plane, parseAngle(fieldsRef.current.angle));
      setGuideDraft({ ...draft });
    } catch (e) {
      editor.setError((e as Error).message);
    }
  };
  const penMove = (point?: Vec3) => {
    if (point && penRef.current.length) {
      const start = penRef.current.at(-1)!;
      const next = [...point] as Vec3;
      for (const [i, key] of ['x', 'y', 'z'].entries()) {
        if (lockRef.current.has(key)) {
          try {
            next[i] = start[i] + parseLength(fieldsRef.current[key as 'x' | 'y' | 'z'], true, true);
          } catch {}
        } else writeFields({ [key]: String(Math.round((point[i] - start[i]) * 100) / 100) });
      }
      point = next;
      if (constraintRef.current && !lockRef.current.has('length'))
        writeFields({
          length: String(Math.round(dot(sub(point, start), constraintRef.current) * 100) / 100),
        });
      if (constraintRef.current && lockRef.current.has('length'))
        try {
          point = precisePenPoint(point);
        } catch {}
    }
    hoverRef.current = point;
    setPenHover(point);
  };
  const gesture = (event: Gesture) => {
    const patch: Partial<Fields> = {};
    if (event.type === 'profile') {
      if (!lockRef.current.has('width')) patch.width = String(Math.round(event.width * 100) / 100);
      if (!lockRef.current.has('depth')) patch.depth = String(Math.round(event.depth * 100) / 100);
      let frame = event.frame;
      if (tool === 'rectangle' && event.start && event.end) {
        const relative = { ...frame, origin: event.start },
          delta = toUV(event.end, relative);
        let w = event.width,
          d = event.depth;
        try {
          if (lockRef.current.has('width')) w = parseLength(fieldsRef.current.width);
          if (lockRef.current.has('depth')) d = parseLength(fieldsRef.current.depth);
        } catch {
          return;
        }
        frame = {
          ...frame,
          origin: fromUV([delta[0] < 0 ? -w : 0, delta[1] < 0 ? -d : 0], relative),
        };
      }
      shapeFrameRef.current = frame;
      setShapeFrame(frame);
      patch.x = String(frame.origin[0]);
      patch.y = String(frame.origin[1]);
      patch.z = String(frame.origin[2]);
      writeFields(patch);
    } else if (event.type === 'rectangle') {
      if (!lockRef.current.has('width')) patch.width = String(event.width);
      if (!lockRef.current.has('depth')) patch.depth = String(event.depth);
      const origin = [...event.origin];
      if (event.start)
        for (const [i, key] of ['width', 'depth'].entries()) {
          if (lockRef.current.has(key) && origin[i] < event.start[i])
            try {
              origin[i] = event.start[i] - parseLength(fieldsRef.current[key as 'width' | 'depth']);
            } catch {}
        }
      patch.x = String(origin[0]);
      patch.y = String(origin[1]);
      writeFields(patch);
    } else if (event.type === 'extrude') {
      if (!lockRef.current.has('height')) writeFields({ height: String(event.distance) });
    } else if (event.type === 'move' && body) {
      for (const [i, key] of ['x', 'y', 'z'].entries())
        if (!lockRef.current.has(key))
          patch[key as 'x' | 'y' | 'z'] = String(
            Math.round((event.origin[i] - body.origin[i]) * 100) / 100,
          );
      writeFields(patch);
    } else if (event.type === 'measure') {
      const start = resolveAnchor(project.bodies, event.anchor);
      if (!start) return;
      const length = Math.hypot(...event.end.map((n, i) => n - start[i]));
      if (length >= 0.1) {
        if (!lockRef.current.has('length'))
          patch.length = String(Math.round((event.edgeLength ?? length) * 100) / 100);
        if (!lockRef.current.has('angle'))
          patch.angle = String(
            Math.round(angleBetween(start, event.end, event.plane, true) * 100) / 100,
          );
      }
      if (event.direction && !lockRef.current.has('angle'))
        patch.angle = String(
          Math.round(angleBetween([0, 0, 0], event.direction, event.plane, true) * 100) / 100,
        );
      if (event.offset && !lockRef.current.has('offset'))
        patch.offset = String(Math.round(Math.hypot(...event.offset) * 100) / 100);
      writeFields(patch);
      guideRef.current = {
        anchor: event.anchor,
        plane: event.plane,
        id: guideRef.current?.id,
        endAnchor: measureMode === 'free' && !lockRef.current.size ? event.endAnchor : undefined,
        direction: lockRef.current.has('angle') ? guideRef.current?.direction : event.direction,
        offset: event.offset ?? guideRef.current?.offset,
        xray: guideRef.current?.xray,
        edgeLength: event.edgeLength,
      };
      setGuideDraft(guideRef.current);
    } else if (event.type === 'pen') {
      if (event.close) {
        void apply(true);
        return;
      }
      try {
        penMove(precisePenPoint(event.point));
      } catch (e) {
        editor.setError((e as Error).message);
        return;
      }
      penRef.current = [...penRef.current, hoverRef.current ?? event.point];
      setPenPoints(penRef.current);
      clearLocks();
      writeFields({ x: '0', y: '0', z: '0' });
      editor.setError('');
    }
  };
  const mergeSelected = async () => {
    try {
      const candidate = mergeBodies(project.bodies.filter((b) => selectedIds.includes(b.id)));
      if (
        await editor.transact(
          {
            ...project,
            bodies: [...project.bodies.filter((b) => !selectedIds.includes(b.id)), candidate],
          },
          'Valitut osat yhdistetty yhdeksi objektiksi. Peru palauttaa erilliset osat.',
        )
      )
        select(candidate.id);
    } catch (e) {
      editor.setError((e as Error).message);
    }
  };
  const editGuide = (guide: Guide) => {
    resetGesture();
    setTool('measure');
    setMode('model');
    setMeasureMode(guide.mode);
    setDraftId(guide.id);
    setSelectedGuideId(guide.id);
    guideRef.current = {
      anchor: guide.anchor,
      plane: guide.plane,
      endAnchor: guide.endAnchor,
      id: guide.id,
      direction: guide.direction,
      offset: guide.offset,
      xray: guide.xray,
    };
    setGuideDraft(guideRef.current);
    writeFields({
      ...defaults,
      length: String(guide.length),
      angle: String(guide.angle),
      offset: String(Math.hypot(...(guide.offset ?? [0, 0, 0]))),
    });
  };
  const numericFields: NumericField[] =
    tool === 'circle'
      ? [
          {
            key: 'width',
            label: shapeKind === 'ellipse' ? 'Halkaisija · X' : 'Halkaisija',
            value: fields.width,
            unit: 'mm',
            testId: 'diameter-input',
          },
          ...(shapeKind === 'ellipse'
            ? [
                {
                  key: 'depth',
                  label: 'Halkaisija · Y',
                  value: fields.depth,
                  unit: 'mm',
                  testId: 'ellipse-depth',
                },
              ]
            : []),
        ]
      : tool === 'rectangle'
        ? [
            {
              key: 'width',
              label: 'Leveys · X',
              value: fields.width,
              unit: 'mm',
              testId: 'width-input',
            },
            {
              key: 'depth',
              label: 'Syvyys · Y',
              value: fields.depth,
              unit: 'mm',
              testId: 'depth-input',
            },
          ]
        : tool === 'extrude'
          ? faceTarget
            ? [
                {
                  key: 'height',
                  label: 'Pinnan siirtymä',
                  value: fields.height,
                  unit: 'mm',
                  testId: 'height-input',
                  signed: true,
                },
              ]
            : []
          : tool === 'measure'
            ? [
                {
                  key: guideDraft?.offset ? 'offset' : 'length',
                  label: guideDraft?.offset ? 'Etäisyys reunasta' : 'Pituus',
                  value: guideDraft?.offset ? fields.offset : fields.length,
                  unit: 'mm',
                  testId: 'guide-length',
                },
                {
                  key: 'angle',
                  label: 'Kulma',
                  value: fields.angle,
                  unit: '°',
                  testId: 'guide-angle',
                },
              ]
            : tool === 'pen' && penConstraint
              ? [
                  {
                    key: 'length',
                    label: 'Pituus lukitulla suunnalla',
                    value: fields.length,
                    unit: 'mm',
                    testId: 'pen-length',
                    signed: true,
                  },
                ]
              : ['x', 'y', 'z'].map((key) => ({
                  key,
                  label: `Siirtymä · ${key.toUpperCase()}`,
                  value: fields[key as 'x' | 'y' | 'z'],
                  unit: 'mm',
                  testId: `move-${key}`,
                  signed: true,
                }));
  const removeBody = async () => {
    if (!body) return;
    if (
      await editor.transact(
        { ...project, bodies: project.bodies.filter((b) => b.id !== body.id) },
        'Kappale poistettu. Voit perua poiston.',
      )
    )
      select();
  };
  const copyBody = async () => {
    if (!body) return;
    const copy = {
      ...body,
      id: uid(),
      name: `${body.name.slice(0, 110)} kopio`,
      origin: [body.origin[0] + body.feature.width + 50, body.origin[1], body.origin[2]] as Vec3,
    };
    if (
      await editor.transact(
        { ...project, bodies: [...project.bodies, copy] },
        'Itsenäinen kopio lisätty.',
      )
    )
      select(copy.id);
  };
  const newProject = async () => {
    if (
      await editor.transact(
        freshProject(),
        'Uusi projekti. Aiemman työn saat takaisin Peru-toiminnolla.',
      )
    ) {
      select();
      setMode('model');
    }
  };
  const example = async () => {
    if (
      await editor.transact(
        cabinetProject(),
        'Esimerkkikaappi avattu. Jokainen levy on erillinen muokattava kappale.',
      )
    ) {
      select();
      setMode('model');
      changeView('iso');
    }
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 10_000_000)
        throw new Error('Projektitiedosto on liian suuri (enintään 10 Mt).');
      const loaded = parseProject(await file.text());
      if (await editor.transact(loaded, 'Projekti avattu.')) {
        select();
        setMode('model');
        changeView('iso');
      }
    } catch (e) {
      editor.setError((e as Error).message);
    }
    if (fileInput.current) fileInput.current.value = '';
  };
  const openDrawing = () => {
    setTool('select');
    setMode('drawing');
    setTab('dimensions');
    setScale(recommendedScale(project, drawingView));
  };
  const addDimension = async (axis: Axis) => {
    if (!body) return;
    if (project.dimensions.some((d) => d.bodyId === body.id && d.axis === axis)) {
      editor.setMessage('Tämä mitta on jo lisätty.');
      return;
    }
    await editor.transact(
      {
        ...project,
        dimensions: [
          ...project.dimensions,
          { id: uid(), bodyId: body.id, axis, from: 'min', to: 'max' },
        ],
      },
      'Malliin liittyvä mitta lisätty.',
    );
  };
  const onSheet = useCallback((sheet?: Sheet) => setSheet(sheet), []);

  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => project.bodies.some((b) => b.id === id)));
    if (selected && !project.bodies.some((b) => b.id === selected)) {
      setSelected(undefined);
      setSelectedFace(undefined);
    }
  }, [project.bodies, selected]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        downloadFile(
          JSON.stringify(project, null, 2),
          `${safeFilename(project.name)}.nivo`,
          'application/json',
        );
        return;
      }
      if (key === 'escape') {
        cancel();
        return;
      }
      if (busy) return;
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        setTool('select');
        if (event.shiftKey) void editor.redo();
        else void editor.undo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (key === 'enter' && (editing || tool === 'boolean')) {
        event.preventDefault();
        void apply();
      }
      if (key === 'r' && (tool === 'measure' || selectedGuideId)) {
        event.preventDefault();
        rotateGuide(event.shiftKey);
        return;
      }
      if (key === 'backspace' && tool === 'pen') {
        event.preventDefault();
        penRef.current = penRef.current.slice(0, -1);
        setPenPoints(penRef.current);
        return;
      }
      const chosen = tools.find((t) => t.shortcut.toLowerCase() === key);
      if (chosen) begin(chosen.id);
      if (tool === 'move' && ['x', 'y', 'z'].includes(key))
        setAxis(axis === key ? undefined : (key as Axis));
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        void removeBody();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => {
    if (tool === 'measure' && axis && guideRef.current) {
      const draft = guideRef.current;
      draft.direction = axisVector(axis);
      draft.plane = planeForDirection(draft.direction, draft.plane);
      lockRef.current.delete('angle');
      writeFields({ angle: String(angleBetween([0, 0, 0], draft.direction, draft.plane, true)) });
      setGuideDraft({ ...draft });
    }
  }, [axis, tool]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setHelp(true);
          }}
          aria-label="Tietoa Nivosta"
        >
          <img src="/nivo.svg" alt="" />
          <span>
            nivo<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-divider" />
        <div className="project-heading">
          <input
            aria-label="Projektin nimi"
            key={project.id + project.name}
            defaultValue={project.name}
            maxLength={120}
            disabled={busy}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== project.name)
                void editor.transact({ ...project, name }, 'Projekti nimetty.');
              else e.target.value = project.name;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <span className="save-status">
            <span
              className={
                editor.saveStatus.includes('epäonnistui') ? 'status-dot error' : 'status-dot'
              }
            />
            {editor.saveStatus || 'Valmistellaan…'}
          </span>
        </div>
        <div className="header-actions">
          <IconButton label="Uusi projekti" disabled={busy} onClick={() => void newProject()}>
            <FilePlus2 />
          </IconButton>
          <IconButton
            label="Avaa projektitiedosto"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen />
          </IconButton>
          <button
            className="button dark download-project"
            disabled={!ready || busy}
            onClick={() =>
              downloadFile(
                JSON.stringify(project, null, 2),
                `${safeFilename(project.name)}.nivo`,
                'application/json',
              )
            }
          >
            <Download size={17} />
            <span>Tallenna tiedosto</span>
          </button>
          <IconButton label="Käyttöohje" onClick={() => setHelp(true)}>
            <CircleHelp />
          </IconButton>
        </div>
        <input
          ref={fileInput}
          data-testid="project-file"
          type="file"
          accept=".nivo,.json,application/json"
          hidden
          onChange={(e) => void importProject(e.target.files?.[0])}
        />
      </header>

      <div className="workspace-bar">
        <div className="mode-switch" aria-label="Työtila">
          <button aria-pressed={mode === 'model'} onClick={() => setMode('model')}>
            <Box size={16} />
            Malli
          </button>
          <button
            aria-pressed={mode === 'drawing'}
            disabled={!project.bodies.length || busy}
            onClick={openDrawing}
          >
            <Ruler size={16} />
            Mittakuva
          </button>
        </div>
        <div className="bar-center">
          <span className="tiny-dot" />
          OMA TYÖTILA <span className="bar-separator">/</span>
          <span>{mode === 'model' ? '3D-suunnittelu' : 'Tekninen piirustus'}</span>
        </div>
        <div className="history-controls">
          <IconButton
            label="Peru"
            disabled={busy || !editor.canUndo}
            onClick={() => {
              setTool('select');
              void editor.undo();
            }}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label="Palauta"
            disabled={busy || !editor.canRedo}
            onClick={() => {
              setTool('select');
              void editor.redo();
            }}
          >
            <Redo2 />
          </IconButton>
          <span className="vertical-rule" />
          <details className="viewport-settings">
            <summary>Asetukset</summary>
            <label>
              <CommitCheckbox
                label="Kaikki apuviivat x-ray"
                disabled={busy}
                checked={project.settings.guideXray}
                onChange={(checked) =>
                  editor.transact(
                    { ...project, settings: { ...project.settings, guideXray: checked } },
                    'Apuviivojen näkyvyys muutettu.',
                  )
                }
              />
              Kaikki apuviivat x-ray
            </label>
          </details>
          <IconButton
            label={panelOpen ? 'Piilota ominaisuudet' : 'Näytä ominaisuudet'}
            aria-pressed={panelOpen}
            onClick={() => setPanelOpen(!panelOpen)}
          >
            {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </IconButton>
        </div>
      </div>

      <div className={`workspace ${panelOpen ? 'panel-open' : ''}`}>
        <aside className="tool-rail" aria-label="Mallinnustyökalut">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`tool-button ${mode === 'model' && tool === t.id ? 'active' : ''}`}
              aria-label={t.label}
              aria-pressed={mode === 'model' && tool === t.id}
              disabled={busy || (t.id === 'move' && !body)}
              onClick={() => begin(t.id)}
              title={`${t.label} (${t.shortcut})`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
          <div className="rail-divider" />
          <button
            className={`tool-button ${mode === 'drawing' ? 'active' : ''}`}
            aria-label="Luo mittakuva"
            disabled={!project.bodies.length || busy}
            onClick={openDrawing}
          >
            <Ruler />
            <span>Mitoita</span>
          </button>
          <div className="rail-spacer" />
          <span className="rail-unit">mm</span>
        </aside>

        <main className="canvas-area">
          <div className="canvas-topbar">
            <div className="view-tabs" aria-label="Näkymät">
              {mode === 'model'
                ? (
                    [
                      ['iso', '3D'],
                      ['front', 'Edestä'],
                      ['right', 'Sivulta'],
                      ['top', 'Ylhäältä'],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} aria-pressed={view === id} onClick={() => changeView(id)}>
                      {label}
                    </button>
                  ))
                : (
                    [
                      ['front', 'Etukuva'],
                      ['right', 'Sivukuva'],
                      ['top', 'Yläkuva'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      aria-pressed={drawingView === id}
                      onClick={() => {
                        setDrawingView(id);
                        setScale(recommendedScale(project, id));
                      }}
                    >
                      {label}
                    </button>
                  ))}
            </div>
            {mode === 'model' ? (
              <div className="view-actions">
                <button
                  className="projection-button"
                  onClick={() => {
                    const next = projection === 'perspective' ? 'orthographic' : 'perspective';
                    setProjection(next);
                    setCameraCommand({
                      id: performance.now(),
                      type: 'projection',
                      projection: next,
                    });
                  }}
                >
                  {projection === 'perspective' ? 'Perspektiivi' : 'Rinnakkaisprojektio'}
                  <ArrowLeftRight size={14} />
                </button>
                <IconButton label="Sovita näkymään" onClick={fit}>
                  <Maximize />
                </IconButton>
              </div>
            ) : (
              <div className="view-actions">
                <label className="scale-select">
                  Mittakaava
                  <select
                    aria-label="Mittakaava"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                  >
                    {[1, 2, 5, 10, 20, 50, 100, 500, 1000].map((s) => (
                      <option key={s} value={s}>
                        1:{s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="model-stage" hidden={mode !== 'model'}>
            <Viewport
              bodies={project.bodies}
              meshes={editor.meshes}
              selected={selected}
              selectedIds={selectedIds}
              selectedFace={selectedFace}
              tool={tool}
              preview={preview}
              axis={axis}
              gridSnap={gridSnap}
              busy={busy}
              command={cameraCommand}
              guides={project.guides}
              guidePreview={tool === 'measure' ? guidePreview : undefined}
              measureMode={measureMode}
              penPoints={penPoints}
              penHover={penHover}
              reference={reference}
              pickReference={pickReference}
              epoch={epoch}
              onSelect={select}
              drawOnSurface={drawOnSurface}
              radialShape={shapeKind}
              sketchFrame={shapeFrame}
              sketchTarget={sketchTarget}
              booleanTargets={booleanTargets}
              booleanTools={booleanTools}
              pickDepth={pickDepth}
              onDepthPicked={(distance) => {
                writeFields({ height: String(Math.round(distance * 100) / 100) });
                lockRef.current.add('height');
                setLocked(new Set(lockRef.current));
                setPickDepth(false);
              }}
              onSketchPlane={(frame, target) => {
                shapeFrameRef.current = frame;
                setShapeFrame(frame);
                sketchTargetRef.current = target;
                setSketchTarget(target);
              }}
              onSnap={setSnapLabel}
              onGesture={gesture}
              faceTarget={faceTarget}
              faceDistance={faceDistance}
              guideXray={project.settings.guideXray}
              selectedGuideId={selectedGuideId}
              freeRotate={freeRotate}
              onFaceTarget={(target) => {
                faceRef.current = target;
                setFaceTarget(target);
                setSelected(target.bodyId);
                setSelectedIds([target.bodyId]);
                setSelectedFace(target.face);
                clearLocks();
                writeFields({ height: '0' });
              }}
              onSelectGuide={(id) => {
                const g = project.guides.find((g) => g.id === id);
                if (g) editGuide(g);
              }}
              onAxis={setAxis}
              onConstraint={(direction) => {
                constraintRef.current = direction;
                setPenConstraint(direction);
                lockRef.current.delete('length');
              }}
              onAccept={() => void apply()}
              onPenHover={penMove}
              onReference={setReference}
              onReferencePicked={() => setPickReference(false)}
              onPopup={setPopup}
            />
            {editing && numericFields.length > 0 && (
              <DynamicInput
                fields={numericFields}
                position={popup}
                locked={locked}
                onChange={field}
                onAccept={() => void apply()}
                onCancel={cancel}
                busy={busy}
                title={
                  tool === 'rectangle'
                    ? 'Suorakulmio'
                    : tool === 'circle'
                      ? shapeKind === 'circle'
                        ? 'Ympyrä'
                        : shapeKind === 'ellipse'
                          ? 'Ellipsi'
                          : 'Monikulmio'
                      : tool === 'measure'
                        ? measureMode === 'guide'
                          ? 'Apuviiva'
                          : 'Vapaa mittaviiva'
                        : tool === 'pen'
                          ? 'Kynä · seuraava piste'
                          : tool === 'move'
                            ? 'Siirrä'
                            : 'Push / pull'
                }
              />
            )}
            {tool === 'measure' && measureMenu && (
              <div className="measure-mode-menu" role="menu" aria-label="Mittatyökalun tila">
                <button
                  role="menuitemradio"
                  aria-checked={measureMode === 'guide'}
                  onClick={() => {
                    resetGesture();
                    setMeasureMode('guide');
                    setMeasureMenu(false);
                  }}
                >
                  Apuviiva<small>Verteksistä tai reunasta lähtevä tartuntalinja</small>
                </button>
                <button
                  role="menuitemradio"
                  aria-checked={measureMode === 'free'}
                  onClick={() => {
                    resetGesture();
                    setMeasureMode('free');
                    setMeasureMenu(false);
                  }}
                >
                  Vapaa mittaviiva<small>Piirrä suora viiva mistä tahansa</small>
                </button>
              </div>
            )}
            {editing && tool !== 'extrude' && (
              <div className="reference-bar">
                <button
                  aria-pressed={pickReference}
                  onClick={() => setPickReference(!pickReference)}
                >
                  <Crosshair size={15} />
                  {pickReference ? 'Napauta viitepistettä' : 'Poimi viite'}
                </button>
                {reference && (
                  <button data-testid="reference-lock" onClick={() => setReference(undefined)}>
                    Viite: {reference.label} <X size={14} />
                  </button>
                )}
                {(axis || penConstraint) && (
                  <button onClick={cancel} aria-label="Vapauta suuntalukko">
                    {axis ? `${axis.toUpperCase()}-akseli` : 'Suunta lukittu'} · Esc <X size={14} />
                  </button>
                )}
              </div>
            )}
            {!project.bodies.length && !editing && (
              <div className="welcome">
                <span className="eyebrow">TILAA AJATUKSILLE</span>
                <h1>
                  Ideasta
                  <br />
                  <em>muotoon.</em>
                </h1>
                <p>
                  Piirrä ensimmäinen levy.
                  <br />
                  Tarkat mitat, selkeä kokonaisuus.
                </p>
                <button className="button dark" disabled={busy} onClick={() => begin('rectangle')}>
                  <Plus size={18} />
                  Piirrä suorakulmio
                </button>
                <button className="welcome-example" disabled={busy} onClick={() => void example()}>
                  Tai avaa esimerkkikaappi <span>↗</span>
                </button>
                <div className="welcome-meta">
                  <span>01 — Piirrä</span>
                  <span>02 — Muotoile</span>
                  <span>03 — Mitoita</span>
                </div>
              </div>
            )}
            <div className="canvas-corner">
              <span className="axis-chip x">X</span>
              <span className="axis-chip y">Y</span>
              <span className="axis-chip z">Z</span>
              <span>Millimetrit</span>
            </div>
            <div className="canvas-bottom-actions">
              <button
                aria-pressed={gridSnap}
                onClick={() => {
                  setGridSnap(!gridSnap);
                  setSnapLabel(!gridSnap ? 'Ruudukko · 10 mm' : 'Geometriatartunnat');
                }}
              >
                <Grid2X2 size={15} />
                {gridSnap ? 'Tartunta 10 mm' : 'Ruudukko pois'}
              </button>
            </div>
          </div>
          {mode === 'drawing' && (
            <DrawingPanel
              project={project}
              cad={editor.cad}
              view={drawingView}
              scale={scale}
              hidden={hidden}
              onSheet={onSheet}
            />
          )}

          {busy && (
            <div className="busy-badge" role="status">
              <LoaderCircle className="spin" size={16} />
              {ready ? 'Lasketaan geometriaa' : 'Avataan työtilaa'}
              <button onClick={editor.cancel}>Peru</button>
            </div>
          )}
          {editor.error && (
            <div className="error-toast" role="alert">
              <XCircle size={18} />
              <span>{editor.error}</span>
              <IconButton label="Sulje virheilmoitus" onClick={() => editor.setError('')}>
                <X size={16} />
              </IconButton>
            </div>
          )}
        </main>

        {panelOpen && (
          <aside className="inspector" aria-label="Ominaisuudet">
            {tool === 'boolean' ? (
              <BooleanPanel
                bodies={project.bodies}
                operation={booleanOperation}
                onOperation={changeOperation}
                targets={booleanTargets}
                tools={booleanTools}
                active={booleanActive}
                onActive={setBooleanActive}
                onToggle={toggleBoolean}
                onSwap={() => {
                  setBooleanTargets(booleanTools);
                  setBooleanTools(booleanTargets);
                }}
                keepTools={keepTools}
                onKeepTools={setKeepTools}
                onAccept={() => void apply()}
                onCancel={() => {
                  setTool('select');
                  resetGesture();
                }}
                busy={busy}
              />
            ) : editing ? (
              <>
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">TYÖKALU</span>
                    <h2>
                      {tool === 'rectangle'
                        ? 'Suorakulmio'
                        : tool === 'circle'
                          ? shapeKind === 'circle'
                            ? 'Ympyrä'
                            : shapeKind === 'ellipse'
                              ? 'Ellipsi'
                              : 'Monikulmio'
                          : tool === 'extrude'
                            ? 'Push / pull'
                            : tool === 'measure'
                              ? 'Mittatyökalu'
                              : tool === 'pen'
                                ? 'Kynä'
                                : 'Siirrä kappaletta'}
                    </h2>
                  </div>
                  <span className="step-number">{tool === 'rectangle' ? '01' : '02'}</span>
                </div>
                <p className="panel-description">
                  {tool === 'rectangle'
                    ? 'Mitat millimetreinä. Voit kirjoittaa myös esimerkiksi 2,4 m.'
                    : tool === 'circle'
                      ? 'Aseta keskipiste ja vedä muoto. Tarkat halkaisijat voit kirjoittaa.'
                      : tool === 'extrude'
                        ? 'E · Osoita pintaa: korostettu pinta liikkuu vetämällä normaalinsa suuntaan. Voit myös kirjoittaa siirtymän.'
                        : tool === 'pen'
                          ? 'Aseta verteksit. Shift lukitsee suunnan; napsauta toista pistettä poimiaksesi pituuden. Sulje tasomainen muoto ensimmäiseen pisteeseen.'
                          : tool === 'measure'
                            ? measureMode === 'guide'
                              ? 'Aloita verteksistä tai vedä reunasta sen suuntainen apuviiva. Piirtäminen ja siirtäminen tarttuvat viivaan.'
                              : 'Valitse kaksi pistettä nähdäksesi niiden etäisyyden.'
                            : 'Anna siirtymä nykyisestä sijainnista tai vedä kappaletta näkymässä.'}
                </p>
                <div className="tool-fields">
                  {['rectangle', 'circle', 'pen'].includes(tool) && (
                    <ShapeProperties
                      tool={tool as 'rectangle' | 'circle' | 'pen'}
                      kind={shapeKind}
                      onKind={setShapeKind}
                      width={fields.width}
                      depth={fields.depth}
                      thickness={fields.thickness}
                      onField={field}
                      purpose={shapePurpose}
                      onPurpose={setShapePurpose}
                      name={shapeName}
                      onName={setShapeName}
                      attach={drawOnSurface}
                      onAttach={setDrawOnSurface}
                      sides={shapeSides}
                      onSides={setShapeSides}
                      onOperation={changeOperation}
                      frameLabel={
                        sketchTarget
                          ? `Pinta: ${project.bodies.find((b) => b.id === sketchTarget.bodyId)?.name}`
                          : 'Valitse piste työtasolta tai kappaleen pinnalta'
                      }
                      onAccept={() => void apply(tool === 'pen')}
                    />
                  )}
                  {tool === 'extrude' && faceTarget && (
                    <div className="shape-properties">
                      <button
                        className="button outlined full"
                        aria-pressed={pickDepth}
                        onClick={() => setPickDepth(!pickDepth)}
                      >
                        {pickDepth ? 'Osoita päättävää pintaa' : 'Poimi syvyys pinnasta'}
                      </button>
                      <button
                        className="button dark full"
                        onClick={() => {
                          const target = project.bodies.find((b) => b.id === faceTarget.bodyId)!;
                          writeFields({
                            height: String(
                              -Math.hypot(
                                target.feature.width,
                                target.feature.depth,
                                target.feature.height,
                              ) - 1,
                            ),
                          });
                          void apply();
                        }}
                      >
                        Leikkaa läpi
                      </button>
                    </div>
                  )}
                  <p className="muted">
                    Kirjoita numero aloittaaksesi ensimmäisestä kentästä. Tab siirtyy seuraavaan.
                    Enter tai vedon päättäminen hyväksyy osan.
                  </p>
                  {tool === 'measure' && (
                    <>
                      <button
                        className="button outlined"
                        onClick={() => setMeasureMenu(!measureMenu)}
                      >
                        {measureMode === 'guide' ? 'Apuviiva' : 'Vapaa mittaviiva'} · Vaihda tilaa
                      </button>
                      <button
                        className="button outlined"
                        onClick={() => rotateGuide()}
                        disabled={!guideDraft}
                      >
                        <RotateCw size={16} />
                        Kierrä 45° · R
                      </button>
                      <p className="muted">
                        X/Y/Z lukitsee akselin. Esc vapauttaa. Shift+R käynnistää vapaan kierron;
                        osoita suunta ja hyväksy.
                      </p>
                      <button
                        className="button outlined"
                        aria-pressed={freeRotate}
                        disabled={!guideDraft}
                        onClick={() => rotateGuide(true)}
                      >
                        Vapaa kierto · Shift+R
                      </button>
                      {guideDraft && (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={!!guideDraft.xray}
                            onChange={(e) => {
                              guideRef.current = { ...guideRef.current!, xray: e.target.checked };
                              setGuideDraft(guideRef.current);
                            }}
                          />
                          Tämä apuviiva x-ray
                        </label>
                      )}
                    </>
                  )}
                  {tool === 'pen' && (
                    <>
                      <p className="muted">
                        {penPoints.length} verteksiä. Palaa ensimmäiseen verteksiin sulkeaksesi
                        muodon.
                      </p>
                      <button
                        className="button outlined"
                        disabled={penPoints.length < 3 || busy}
                        onClick={() => void apply(true)}
                      >
                        Sulje muoto
                      </button>
                      <button
                        className="button subtle"
                        disabled={!penPoints.length}
                        onClick={() => {
                          penRef.current = penRef.current.slice(0, -1);
                          setPenPoints(penRef.current);
                        }}
                      >
                        Poista viimeinen verteksi
                      </button>
                    </>
                  )}
                  {['move', 'pen', 'measure'].includes(tool) && (
                    <>
                      <span className="field-caption">Lukitse vetosuunta</span>
                      <div className="axis-locks">
                        {(['x', 'y', 'z'] as const).map((a) => (
                          <button
                            key={a}
                            aria-label={`Lukitse ${a.toUpperCase()}-akseli`}
                            aria-pressed={axis === a}
                            onClick={() => setAxis(axis === a ? undefined : a)}
                          >
                            {a.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {['rectangle', 'pen', 'move'].includes(tool) && (
                    <p className="muted">
                      {tool === 'pen' && penPoints.length
                        ? 'Shift lukitsee piirtosuunnan pituuden poimimista varten. Erillisen viitepisteen saat Poimi viite -painikkeesta.'
                        : 'Hae kappaleen piste kohdistimella ja pidä Shift pohjassa: viitepisteen suuntalinjat ohjaavat piirtämistä ja siirtoa. Kosketuksella käytä Poimi viite -painiketta.'}
                    </p>
                  )}
                </div>
                <div className="tool-tip">
                  <span className="tiny-dot" />
                  {snapLabel}
                </div>
              </>
            ) : (
              <>
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">{body ? 'VALINTA' : 'PROJEKTI'}</span>
                    <h2>{body ? body.name : 'Kokonaisuus'}</h2>
                  </div>
                  <Box size={21} />
                </div>
                {body ? (
                  <div className="selection-info">
                    <span className="selection-tag">
                      {featureIsSolid(body.feature) ? 'CAD-kappale' : 'Tasoluonnos'}
                      {selectedFace ? ` · ${faceNames[selectedFace] ?? 'Valittu pinta'}` : ''}
                    </span>
                    <div className="dimensions-grid">
                      <div>
                        <span>Leveys</span>
                        <strong>
                          {formatLength(body.feature.width)}
                          <small>mm</small>
                        </strong>
                      </div>
                      <div>
                        <span>Syvyys</span>
                        <strong>
                          {formatLength(body.feature.depth)}
                          <small>mm</small>
                        </strong>
                      </div>
                      <div>
                        <span>Korkeus · Z</span>
                        <strong data-testid="selected-height">
                          {formatLength(body.feature.height)}
                          <small>mm</small>
                        </strong>
                      </div>
                    </div>
                    <p className="origin-readout">
                      X {formatLength(body.origin[0])} · Y {formatLength(body.origin[1])} · Z{' '}
                      {formatLength(body.origin[2])}
                    </p>
                    {mode === 'model' && (
                      <>
                        <button
                          className="button outlined full"
                          disabled={busy}
                          onClick={() => begin('boolean')}
                        >
                          <Scissors size={17} />
                          Cut / Join
                        </button>
                        <button
                          className="button outlined full"
                          disabled={busy}
                          onClick={() => begin('extrude')}
                        >
                          <ArrowUpFromLine size={17} />
                          {featureIsSolid(body.feature) ? 'Muokkaa pintaa' : 'Anna paksuus'}
                        </button>
                        <div className="selection-actions">
                          <IconButton
                            label="Siirrä valittua"
                            disabled={busy}
                            onClick={() => begin('move')}
                          >
                            <Move3D />
                          </IconButton>
                          <IconButton
                            label="Kopioi kappale"
                            disabled={busy}
                            onClick={() => void copyBody()}
                          >
                            <Copy />
                          </IconButton>
                          <IconButton
                            label="Poista kappale"
                            disabled={busy}
                            onClick={() => void removeBody()}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="panel-description">
                    {project.bodies.length
                      ? 'Valitse kappale näkymästä tai alla olevasta listasta.'
                      : 'Jokainen hyvä suunnitelma alkaa yhdestä muodosta.'}
                  </p>
                )}

                {mode === 'drawing' && (
                  <div className="drawing-options">
                    <h3>Lisää mitta</h3>
                    <p className="muted">
                      {body ? `Valittu: ${body.name}` : 'Valitse ensin kappale listasta.'}
                    </p>
                    <div className="dimension-buttons">
                      <button
                        className="button outlined"
                        disabled={!body || busy || body.purpose === 'construction'}
                        onClick={() => void addDimension(drawingView === 'right' ? 'y' : 'x')}
                      >
                        <ArrowLeftRight size={16} />
                        {drawingView === 'right' ? 'Syvyys' : 'Leveys'}
                      </button>
                      <button
                        className="button outlined"
                        disabled={
                          !body ||
                          busy ||
                          body.purpose === 'construction' ||
                          (drawingView !== 'top' && !body?.feature.height)
                        }
                        onClick={() => void addDimension(drawingView === 'top' ? 'y' : 'z')}
                      >
                        <Ruler size={16} />
                        {drawingView === 'top' ? 'Syvyys' : 'Korkeus'}
                      </button>
                    </div>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={hidden}
                        onChange={(e) => setHidden(e.target.checked)}
                      />
                      Näytä piiloviivat
                    </label>
                    <button
                      className="button dark full"
                      disabled={!sheet?.fits || !!sheet.orphanCount || busy}
                      onClick={() =>
                        sheet &&
                        downloadFile(
                          sheet.svg,
                          `${safeFilename(project.name)}-${drawingView}.svg`,
                          'image/svg+xml',
                        )
                      }
                    >
                      <ArrowDownToLine size={17} />
                      Vie SVG-mittakuva
                    </button>
                    <p className="export-note">
                      A4 vaaka · vektorigrafiikka
                      <br />
                      Tulosta 100 % koossa.
                    </p>
                  </div>
                )}

                <div className="object-panel">
                  <div className="multi-actions">
                    <button aria-pressed={multiSelect} onClick={() => setMultiSelect(!multiSelect)}>
                      Monivalinta
                    </button>
                    <button
                      aria-label="Yhdistä valitut"
                      disabled={
                        busy ||
                        selectedIds.length < 2 ||
                        project.bodies
                          .filter((b) => selectedIds.includes(b.id))
                          .some((b) => !featureIsSolid(b.feature))
                      }
                      onClick={() => void mergeSelected()}
                    >
                      <Merge size={15} />
                      Yhdistä {selectedIds.length > 1 ? `(${selectedIds.length})` : ''}
                    </button>
                  </div>
                  <div className="panel-tabs">
                    <button aria-pressed={tab === 'objects'} onClick={() => setTab('objects')}>
                      Kappaleet <span>{project.bodies.length}</span>
                    </button>
                    <button
                      aria-pressed={tab === 'dimensions'}
                      onClick={() => setTab('dimensions')}
                    >
                      Mitat <span>{project.dimensions.length}</span>
                    </button>
                    <button aria-pressed={tab === 'guides'} onClick={() => setTab('guides')}>
                      Viivat <span>{project.guides.length}</span>
                    </button>
                  </div>
                  {tab === 'objects' ? (
                    <div className="object-list">
                      {project.bodies.length ? (
                        project.bodies.map((b) => (
                          <button
                            key={b.id}
                            data-testid={`body-${b.id}`}
                            className={selectedIds.includes(b.id) ? 'selected' : ''}
                            onClick={(e) =>
                              select(b.id, undefined, e.shiftKey || e.ctrlKey || e.metaKey)
                            }
                          >
                            <Box size={16} />
                            <span>{b.name}</span>
                            <small>
                              {b.purpose === 'construction'
                                ? 'Apu'
                                : b.purpose === 'drawing'
                                  ? 'Piirros'
                                  : b.purpose === 'component'
                                    ? 'Osa'
                                    : b.feature.type === 'union'
                                      ? '∪'
                                      : featureIsSolid(b.feature)
                                        ? '3D'
                                        : '2D'}
                            </small>
                          </button>
                        ))
                      ) : (
                        <div className="empty-list">
                          <Layers2 size={26} />
                          <p>
                            Tyhjä kangas.
                            <br />
                            Sinun seuraava ideasi.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : tab === 'guides' ? (
                    <div className="guide-list">
                      {project.guides.map((g) => {
                        const points = guidePoints(project.bodies, g);
                        return (
                          <div
                            key={g.id}
                            className={
                              !points ? 'broken' : selectedGuideId === g.id ? 'selected' : ''
                            }
                          >
                            <button onClick={() => editGuide(g)}>
                              <Ruler size={15} />
                              <span>
                                {points
                                  ? `${g.mode === 'guide' ? 'Apuviiva' : 'Mittaviiva'} · ${formatLength(Math.hypot(...points[1].map((n, i) => n - points[0][i])))} mm`
                                  : 'Viite puuttuu'}
                                <small>
                                  {formatLength(g.angle)}° · {g.plane}
                                </small>
                              </span>
                            </button>
                            <label className="guide-xray" title="Näytä tämä viiva kappaleiden läpi">
                              <CommitCheckbox
                                label="Viivan x-ray"
                                disabled={busy}
                                checked={!!g.xray}
                                onChange={(checked) =>
                                  editor.transact(
                                    {
                                      ...project,
                                      guides: project.guides.map((line) =>
                                        line.id === g.id ? { ...line, xray: checked } : line,
                                      ),
                                    },
                                    'Viivan x-ray muutettu.',
                                  )
                                }
                              />
                              X-ray
                            </label>
                            <IconButton
                              label="Poista viiva"
                              disabled={busy}
                              onClick={() =>
                                void editor.transact(
                                  {
                                    ...project,
                                    guides: project.guides.filter((line) => line.id !== g.id),
                                  },
                                  'Viiva poistettu.',
                                )
                              }
                            >
                              <X size={15} />
                            </IconButton>
                          </div>
                        );
                      })}
                      {!project.guides.length && (
                        <p className="empty-list">
                          Mittatyökalulla voit luoda mitta- ja apuviivoja.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="dimension-list">
                      {project.dimensions.length ? (
                        project.dimensions.map((d) => {
                          const value = dimensionValue(project, d);
                          return (
                            <div key={d.id} className={value === null ? 'broken' : ''}>
                              <button onClick={() => select(d.bodyId)}>
                                <Ruler size={15} />
                                <span>
                                  {value === null
                                    ? 'Viite puuttuu'
                                    : `${d.axis.toUpperCase()} · ${formatLength(value)} mm`}
                                  <small>
                                    {project.bodies.find((b) => b.id === d.bodyId)?.name ??
                                      'Poistettu kappale'}
                                  </small>
                                </span>
                              </button>
                              <IconButton
                                label="Poista mitta"
                                disabled={busy}
                                onClick={() =>
                                  void editor.transact(
                                    {
                                      ...project,
                                      dimensions: project.dimensions.filter((m) => m.id !== d.id),
                                    },
                                    'Mitta poistettu.',
                                  )
                                }
                              >
                                <X size={15} />
                              </IconButton>
                            </div>
                          );
                        })
                      ) : (
                        <div className="empty-list">
                          <Ruler size={26} />
                          <p>
                            Lisää ensimmäinen mitta
                            <br />
                            Mittakuva-työtilassa.
                          </p>
                        </div>
                      )}
                      {mode === 'drawing' && (
                        <button className="button subtle full" onClick={() => setTab('objects')}>
                          <Box size={16} />
                          Valitse kappale
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="panel-footer">
                  <span className="tiny-dot" />
                  <span>
                    {project.bodies.length} kappaletta · {project.dimensions.length} mittaa
                  </span>
                  <span>v0.4</span>
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      <footer className="status-bar">
        <div>
          <span className="status-icon">
            {busy ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />}
          </span>
          <span role="status">
            {editing || tool === 'navigate' || tool === 'boolean'
              ? instructions[tool]
              : editor.message}
          </span>
        </div>
        <span className="status-right">
          {mode === 'model' ? 'Z ylöspäin' : 'A4 · Ortografinen'}
          <span className="status-divider" />1 yksikkö = 1 mm
        </span>
      </footer>

      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton label="Sulje ohje" className="modal-close" onClick={() => setHelp(false)}>
              <X />
            </IconButton>
            <span className="eyebrow">TERVETULOA NIVOON</span>
            <h2 id="help-title">
              Pienestä muodosta
              <br />
              valmiiksi suunnitelmaksi.
            </h2>
            <ol>
              <li>
                <strong>Piirrä.</strong> Valitse Suorakulmio, Ympyrä (C) tai Kynä. Aloita kappaleen
                tasopinnalta piirtääksesi siihen muokattavan alueen. Muotovalikosta löytyvät myös
                ellipsi ja säännöllinen monikulmio. Enter tai vedon päättäminen hyväksyy.
              </li>
              <li>
                <strong>Muotoile.</strong> Paina E, osoita pintaa ja vedä. Positiivinen siirtymä
                vetää pintaa ulos ja negatiivinen työntää sisään. Leikkaa läpi tekee aukon, ja Poimi
                syvyys pinnasta määrää syvyyden toisesta pinnasta.
              </li>
              <li>
                <strong>Mitoita.</strong> Avaa Mittakuva, valitse kappale ja lisää mitat. Vie SVG.
              </li>
            </ol>
            <p>
              <strong>Tarkat mitat:</strong> aloita kirjoittamalla numero. Tab siirtyy seuraavaan
              kenttään. Kirjoitettu mitta säilyy hiiren liikkuessa.
            </p>
            <p>
              <strong>Apuviivat:</strong> mittatyökalun ensimmäinen painallus valitsee apuviivan,
              toinen avaa tilavalinnan. Reunasta vedetty viiva pysyy reunan suuntaisena. R kiertää
              45°, Shift+R sallii vapaan kierron. X/Y/Z lukitsee akselin ja Esc vapauttaa. Voit myös
              kirjoittaa asteluvun. X-ray valitaan Viivat-listasta tai kaikille asetuksista.
            </p>
            <p>
              <strong>Hae viite:</strong> vie kohdistin kappaleen keskipisteen, reunan keskipisteen
              tai verteksin päälle ja pidä Shift pohjassa. Viitteestä lähtevät suuntalinjat ohjaavat
              piirtämistä ja siirtoa. Kesken kynän viivan Shift lukitsee viivan suunnan: voit poimia
              pituuden aiemmasta pisteestä. Kosketuksella käytä Poimi viite- ja akselipainikkeita.
            </p>
            <p>
              <strong>Cut / Join (B):</strong> valitse ensin Kohteet, sitten Työstökappaleet.
              Molempiin voi poimia useita osia näkymästä tai listasta. Cut vähentää työstökappaleet
              kohteista, Join yhdistää ne. Vaihda keskenään kääntää leikkauksen. Säilytä
              työstökappaleet jättää leikkurit jatkokäyttöön. Peru palauttaa lähteet.
            </p>
            <p>
              <strong>Muodon ominaisuudet:</strong> anna nimi, mitat ja paksuus. Kappaleen lisäksi
              voit tehdä rakentamisen apumuodon, piirroksen tai nimetyn itsenäisen osan.
              Apumuotoihin voi tarttua, mutta ne eivät tule mittakuvaan.
            </p>
            <p>
              <strong>Kosketus:</strong> napautus valitsee, yksi sormi käyttää työkalua. Kaksi
              sormea panoroi ja zoomaa. Navigoi-työkalulla yksi sormi kiertää.
            </p>
            <p>
              <strong>Hiiri:</strong> oikea painike kiertää, keskipainike panoroi ja rulla zoomaa.
              Navigoi-työkalulla myös vasen painike kiertää.
            </p>
            <p>
              <strong>Säilytä työsi:</strong> automaattitallennus palauttaa työn tässä selaimessa.
              Lataa lisäksi .nivo-projektitiedosto omalle laitteellesi.
            </p>
            <p className="muted">
              Piirtäminen tukee myös vinoja tasopintoja. Suljettavan kynämuodon tulee olla
              tasomainen. Push/pull tukee tasopintoja. Kappaleiden vapaa kierto, linkitetyt
              komponentit ja materiaalit tulevat myöhemmin.
            </p>
            <a href="https://github.com/alluharju-bot/nivo" target="_blank" rel="noreferrer">
              Avoin lähdekoodi ↗
            </a>
            <a
              className="license-link"
              href="/licenses/NOTICE.txt"
              target="_blank"
              rel="noreferrer"
            >
              Kirjastot ja lisenssit ↗
            </a>
          </section>
        </div>
      )}
    </div>
  );
}
