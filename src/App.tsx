import { flushSync } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowDownToLine,
  Eraser,
  ArrowLeftRight,
  ArrowUpFromLine,
  Box,
  Check,
  CircleHelp,
  Camera,
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
  Minimize,
  MoreHorizontal,
  Settings2,
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
  SquareDashed,
  Trash2,
  Undo2,
  X,
  XCircle,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';
import {
  bodyLocked,
  groupAncestors,
  groupBodies,
  reparentGroup,
  dissolveGroup,
  translateSelection,
} from './model/groups';
import { useEdgeDetailPreview } from './ui/useEdgeDetailPreview';
import { EdgeDetailPanel } from './ui/EdgeDetailPanel';
import type { EdgeDetailTarget } from './cad/protocol';
import { GroupActions } from './ui/GroupActions';
import { Viewport, type CameraCommand, type Tool } from './viewport/Viewport';
import { RenderStage } from './render/RenderStage';
import { renderDefaults } from './render/scene';
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
import { addBodyDimensions } from './model/dimensions';
import { downloadFile, safeFilename } from './storage/projects';
import type { DrawingView, FaceTarget, FaceSpan } from './cad/protocol';
import {
  extrusionDistance,
  distanceToSize,
  transferExtrusionValue,
  inputNumber,
  type ExtrusionMode,
} from './model/extrusion';
import { ObjectTree } from './ui/ObjectTree';
import { ObjectActions } from './ui/ObjectActions';
import {
  bodyVisible,
  moveToOrigin,
  bodiesCenter,
  rotationAngle,
  applyRotation,
  requireMovable,
  type Rotation,
} from './model/transforms';
import { RotationPanel } from './ui/RotationPanel';
import { useOffsetOutline } from './ui/useOffsetOutline';
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
  guideMeasurement,
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
import type { BoundaryTarget } from './cad/protocol';

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
  { id: 'rectangle', label: 'Suorakulmio', icon: <Square />, shortcut: 'S' },
  { id: 'circle', label: 'Ympyrä', icon: <Circle />, shortcut: 'C' },
  { id: 'rotate', label: 'Kierrä', icon: <RotateCw />, shortcut: 'R' },
  { id: 'detail', label: 'Reunat', icon: <SquareDashed />, shortcut: 'F' },
  { id: 'offset', label: 'Offset', icon: <SquareDashed />, shortcut: 'O' },
  { id: 'extrude', label: 'Push / pull', icon: <ArrowUpFromLine />, shortcut: 'E' },
  { id: 'move', label: 'Siirrä', icon: <Move3D />, shortcut: 'M' },
  { id: 'pen', label: 'Kynä', icon: <Pencil />, shortcut: 'K' },
  { id: 'erase', label: 'Poista rajaus', icon: <Eraser />, shortcut: 'U' },
  { id: 'boolean', label: 'Muotoile', icon: <Scissors />, shortcut: 'B' },
  { id: 'measure', label: 'Mittatyökalu', icon: <Ruler />, shortcut: 'T' },
  { id: 'navigate', label: 'Navigoi', icon: <Hand />, shortcut: 'H' },
];
const instructions: Record<Tool, string> = {
  detail:
    'F · Valitse reunat, anna säde tai viisteen koko ja tarkista esikatselu. Enter hyväksyy, Esc peruu.',
  erase:
    'U · Osoita pintojen välistä jakoviivaa. Korostetut tasopinnat yhdistyvät klikkauksella. Kulmat ja aukot säilyvät.',
  rotate:
    'R · Poimi kiertopiste tai reuna. Vedä rengasta tai anna kulma. X/Y/Z valitsee akselin; Shift porrastaa 15°. Esc päättää työkalun.',
  offset:
    'O · Osoita pintaa ja liikuta hiirtä tai vedä pinnasta. Kirjoita tarkka mitta. Klikkaus, vapautus tai Enter hyväksyy. Esc peruu.',
  select:
    'Klikkaus valitsee osan, tuplaklikkaus avaa sen muokattavaksi. E/O muokkaa osoitettua pintaa. Shift+klikkaus lisää valintaan.',
  rectangle:
    'Klikkaa alkukulmaa, siirrä osoitinta ja klikkaa vastakulmaa. Myös veto tai numerosarja X → Tab → Y toimii. Enter hyväksyy.',
  circle:
    'C · Klikkaa keskipistettä ja sitten reunaa tai vedä säde. Kirjoita halkaisija, Tab vaihtaa kenttää. Enter hyväksyy.',
  boolean: 'Valitse kohteet ja työstökappaleet. Vaihda keskenään kääntää leikkauksen suunnan.',
  extrude:
    'E · Vedä vapaasti. Pidä Shift pohjassa poimiaksesi tavoitepinnan. Kirjoitettu mitta ohittaa tartunnan. Enter tai klikkaus hyväksyy.',
  move: 'Vedä tartuntapisteestä tai kirjoita siirtymä. Ctrl vedon aikana tekee kopion; alkuperäinen jää paikalleen. Esc peruu.',
  pen: 'X/Y/Z lukitsee akselin. Shift lukitsee suunnan; poimi pituus toisesta pisteestä. Sama akselinäppäin vapauttaa lukon. Esc päättää työkalun.',
  measure:
    'Vedä verteksistä tai reunasta. X/Y/Z lukitsee siirtosuunnan. Esc päättää työkalun. R kiertää 45°, Shift+R vapaasti.',
  navigate: 'Vedä yhdellä sormella kiertääksesi. Kahdella sormella panoroit ja zoomaat.',
};
type Fields = {
  remaining: string;
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
  remaining: '0',
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
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [measureMode, setMeasureMode] = useState<'guide' | 'free'>('guide');
  const [measureMenu, setMeasureMenu] = useState(false);
  const [reference, setReference] = useState<ReferencePoint>();
  const [pickReference, setPickReference] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [rotationDraft, setRotationDraft] = useState<Omit<Rotation, 'angle'>>();
  const rotationRef = useRef<Omit<Rotation, 'angle'> | undefined>(undefined);
  const [popup, setPopup] = useState<[number, number]>();
  const [penPoints, setPenPoints] = useState<Vec3[]>([]);
  const penRef = useRef<Vec3[]>([]);
  const [penHover, setPenHover] = useState<Vec3>();
  const [penConstraint, setPenConstraint] = useState<Vec3>();
  const constraintRef = useRef<Vec3 | undefined>(undefined);
  const [faceTarget, setFaceTarget] = useState<FaceTarget>();
  const faceRef = useRef<FaceTarget | undefined>(undefined);
  const [faceSpan, setFaceSpan] = useState<FaceSpan>();
  const spanRef = useRef<FaceSpan | undefined>(undefined);
  const spanRequest = useRef(0);
  const [spanError, setSpanError] = useState('');
  const [spanLoading, setSpanLoading] = useState(false);
  const [extrusionMode, setExtrusionMode] = useState<ExtrusionMode>('height');
  const extrusionModeRef = useRef<ExtrusionMode>('height');
  const dragDirection = useRef(1);
  const [selectedGuideId, setSelectedGuideId] = useState<string>();
  const [freeRotate, setFreeRotate] = useState(false);
  const [shapeFrame, setShapeFrame] = useState<SketchFrame>();
  const shapeFrameRef = useRef<SketchFrame | undefined>(undefined);
  const [sketchTarget, setSketchTarget] = useState<FaceTarget>();
  const sketchTargetRef = useRef<FaceTarget | undefined>(undefined);
  const [detailTarget, setDetailTarget] = useState<EdgeDetailTarget>();
  const [detailOperation, setDetailOperation] = useState<'fillet' | 'chamfer'>('fillet');
  const [surfaceMode, setSurfaceMode] = useState<'new' | 'region'>('new');
  const [editingBodyId, setEditingBodyId] = useState<string>();
  const [editNotice, setEditNotice] = useState<{ x?: number; y?: number }>();
  const gestureActive = useRef(false);
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
  const [copyMove, setCopyMove] = useState(false);
  const copyMoveRef = useRef(false);
  const pickedFaceRef = useRef<{ bodyId: string; face: FaceRef } | undefined>(undefined);
  const hoveredFaceRef = useRef<FaceTarget | undefined>(undefined);
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
  const [renderOpen, setRenderOpen] = useState(false);
  const [mode, setMode] = useState<'model' | 'drawing'>('model');
  const [fields, setFields] = useState<Fields>(defaults);
  const fieldsRef = useRef(fields);
  const constructionLine =
    shapePurpose === 'construction' &&
    (() => {
      try {
        return parseLength(fields.thickness, true, true) === 0;
      } catch {
        return false;
      }
    })();
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
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('#header-controls, .header-menu-toggle'))
        setHeaderMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHeaderMenuOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [headerMenuOpen]);
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setHeaderMenuOpen(false);
    } catch {
      editor.setError('Selain ei sallinut koko näytön tilaa tässä ikkunassa.');
    }
  };
  const [tab, setTab] = useState<'objects' | 'dimensions' | 'guides'>('objects');
  const fileInput = useRef<HTMLInputElement>(null);
  const body = project.bodies.find((b) => b.id === selected);
  const selectedGroup = project.groups.find((g) => g.id === selectedGroupId);
  const editingBody = project.bodies.find((b) => b.id === editingBodyId);
  const selectedGuide = project.guides.find((g) => g.id === selectedGuideId);
  const [awaitingStart, setAwaitingStart] = useState(false);
  const visibleBodies = useMemo(
    () =>
      project.bodies
        .filter((b) => bodyVisible(b, project.groups))
        .map((b) => ({ ...b, locked: bodyLocked(b, project.groups) })),
    [project.bodies, project.groups],
  );
  const renderBodies = useMemo(
    () => visibleBodies.filter((b) => b.purpose === 'model' || b.purpose === 'component'),
    [visibleBodies],
  );
  const visibleMeshes = useMemo(
    () => editor.meshes.filter((m) => visibleBodies.some((b) => b.id === m.id)),
    [editor.meshes, visibleBodies],
  );
  const editing =
    !awaitingStart &&
    [
      'rectangle',
      'circle',
      'extrude',
      'offset',
      'detail',
      'move',
      'measure',
      'pen',
      'rotate',
    ].includes(tool);
  const offsetDistance = (() => {
    try {
      return parseLength(fields.offset);
    } catch {
      return NaN;
    }
  })();
  const offsetPreview = useOffsetOutline(
    editor.cad,
    tool === 'offset' && editing && !busy
      ? project.bodies.find((b) => b.id === faceTarget?.bodyId)
      : undefined,
    faceTarget?.face,
    offsetDistance,
  );
  const detailSource = project.bodies.find((b) => b.id === detailTarget?.bodyId);
  const detailPreview = useEdgeDetailPreview(
    editor.cad,
    tool === 'detail' && detailSource && !bodyLocked(detailSource, project.groups) && !busy
      ? detailSource
      : undefined,
    detailTarget?.indices ?? [],
    detailOperation,
    offsetDistance,
  );
  const changeCopyMove = (copy: boolean) => {
    copyMoveRef.current = copy;
    setCopyMove(copy);
  };
  const writeFields = (patch: Partial<Fields>) => {
    fieldsRef.current = { ...fieldsRef.current, ...patch };
    setFields(fieldsRef.current);
  };
  const extrusionValue = () => {
    if (extrusionModeRef.current === 'remaining') {
      if (!spanRef.current) throw new Error('Odota vastapinnan mittausta.');
      return distanceToSize(
        fieldsRef.current.remaining,
        spanRef.current.depth,
        spanRef.current.solid,
        dragDirection.current,
      );
    }
    return extrusionDistance(fieldsRef.current.height, dragDirection.current);
  };
  const measureTarget = (target: FaceTarget, picked = false) => {
    const request = ++spanRequest.current;
    spanRef.current = undefined;
    setFaceSpan(undefined);
    setSpanError('');
    setSpanLoading(true);
    extrusionModeRef.current = 'height';
    setExtrusionMode('height');
    dragDirection.current = 1;
    const source = project.bodies.find((b) => b.id === target.bodyId)!;
    void editor.cad
      .faceSpan(source, target.face, picked ? target.point : undefined)
      .then((span) => {
        if (request !== spanRequest.current) return;
        spanRef.current = span;
        setFaceSpan(span);
        setSpanLoading(false);
      })
      .catch((e: Error) => {
        if (request !== spanRequest.current) return;
        setSpanLoading(false);
        setSpanError(e.message);
      });
  };
  const activateExtrusion = (key: string, transfer = false) => {
    if (key !== 'height' && key !== 'remaining') return;
    if (key === extrusionModeRef.current || (key === 'remaining' && !spanRef.current)) return;
    const old = extrusionModeRef.current;
    let value: string;
    if (transfer && lockRef.current.has(old))
      value = transferExtrusionValue(fieldsRef.current[old], key);
    else {
      try {
        const distance = extrusionValue();
        value =
          key === 'height'
            ? `${distance >= 0 ? '+' : ''}${inputNumber(distance)}`
            : inputNumber(
                spanRef.current!.solid
                  ? Math.max(0, spanRef.current!.depth + distance)
                  : Math.abs(distance),
              );
      } catch {
        value = key === 'height' ? '0' : inputNumber(spanRef.current?.depth ?? 0);
      }
    }
    const wasLocked = lockRef.current.has(old);
    lockRef.current.delete(old);
    if (wasLocked) lockRef.current.add(key);
    extrusionModeRef.current = key;
    setExtrusionMode(key);
    setLocked(new Set(lockRef.current));
    writeFields({ [key]: value });
  };
  const field = (key: string, value: string) => {
    gestureActive.current = true;
    if (tool === 'extrude' && (key === 'height' || key === 'remaining')) {
      if (key === 'height' && /^[+-]/.test(value.trim())) {
        try {
          const distance = parseLength(value, true, true);
          if (Math.abs(distance) > 1e-8) dragDirection.current = Math.sign(distance);
        } catch {}
      }
      extrusionModeRef.current = key;
      setExtrusionMode(key);
      lockRef.current.delete(key === 'height' ? 'remaining' : 'height');
    }
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
    gestureActive.current = false;
    setDetailTarget(undefined);
    copyMoveRef.current = false;
    setCopyMove(false);
    rotationRef.current = undefined;
    setRotationDraft(undefined);
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
    spanRequest.current++;
    spanRef.current = undefined;
    setFaceSpan(undefined);
    setSpanError('');
    setSpanLoading(false);
    extrusionModeRef.current = 'height';
    setExtrusionMode('height');
    dragDirection.current = 1;
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
  const explainEditContext = (position?: { x: number; y: number }) => {
    setEditNotice(position ?? {});
    editor.setMessage('Muokkaat yhtä osaa. Valitse Lopeta muokkaus, jotta voit valita muita osia.');
  };
  const select = (id?: string, face?: FaceRef, additive = false, force = false) => {
    if (editingBodyId && id && id !== editingBodyId && !force) {
      explainEditContext();
      return;
    }
    if (tool === 'boolean' && !force) {
      if (id) toggleBoolean(id);
      return;
    }
    const extend = !force && (additive || multiSelect || !!selectedGroupId);
    const ids = id
      ? extend
        ? selectedIds.includes(id)
          ? selectedIds.filter((v) => v !== id)
          : [...selectedIds, id]
        : [id]
      : additive
        ? selectedIds
        : [];
    setSelected(ids.includes(id!) ? id : ids[0]);
    setSelectedIds(ids);
    if (!extend || !id) setSelectedGroupId(undefined);
    pickedFaceRef.current = id && face ? { bodyId: id, face } : undefined;
    setSelectedFace(force ? face : undefined);
    setAwaitingStart(true);
    setMeasureMenu(false);
    resetGesture();
    if (tool === 'rotate' && id && !force) startRotation([id]);
  };
  const finishOperation = (id?: string, face?: FaceRef) => {
    if (editingBodyId && id && id !== editingBodyId) {
      id = editingBodyId;
      face = undefined;
    }
    select(id, face, false, true);
    setDraftId(uid());
    writeFields({
      ...defaults,
      ...(tool === 'circle' ? { width: '100', depth: '60' } : {}),
      ...(['offset', 'detail'].includes(tool) ? { offset: fieldsRef.current.offset } : {}),
    });
    setShapeName('');
    if (tool === 'boolean') {
      setBooleanTargets([]);
      setBooleanTools([]);
      setBooleanActive('targets');
    }
  };
  const openBodyEdit = (id: string) => {
    if (busy) return;
    const target = project.bodies.find((b) => b.id === id);
    if (!target || bodyLocked(target, project.groups) || !bodyVisible(target, project.groups)) {
      editor.setMessage('Vapauta ja näytä osa ennen muokkaamista.');
      return;
    }
    if (editingBodyId && editingBodyId !== id) {
      editor.setMessage('Päätä nykyisen osan muokkaus ensin.');
      return;
    }
    select(id, undefined, false, true);
    setTool('select');
    setEditingBodyId(id);
    setEditNotice(undefined);
    hoveredFaceRef.current = undefined;
    setSurfaceMode('region');
    setPanelOpen(true);
    editor.setError('');
    editor.setMessage(`Muokataan: ${target.name}. Piirrot jakavat tämän osan pintaa.`);
  };
  const closeBodyEdit = () => {
    if (busy) return;
    resetGesture();
    hoveredFaceRef.current = undefined;
    setTool('select');
    setAwaitingStart(true);
    setSelected(editingBodyId);
    setSelectedIds(editingBodyId ? [editingBodyId] : []);
    setSelectedFace(undefined);
    setEditingBodyId(undefined);
    setEditNotice(undefined);
    setSurfaceMode('new');
    editor.setError('');
    editor.setMessage('Osan muokkaus päätetty. Piirtäminen luo uuden osan.');
  };
  const eraseBoundary = async (target: BoundaryTarget) => {
    if (busy || committing.current) return;
    const source = project.bodies.find((b) => b.id === target.bodyId);
    if (
      !source ||
      bodyLocked(source, project.groups) ||
      (editingBodyId && source.id !== editingBodyId)
    )
      return;
    committing.current = true;
    try {
      if (
        await editor.transact(async () => {
          const next = await editor.cad.removeBoundary(source, target.faces);
          return { ...project, bodies: project.bodies.map((b) => (b.id === source.id ? next : b)) };
        }, 'Rajaus poistettu. Tasopinnat yhdistetty; kappaleen mitat ja materiaali säilyivät.')
      )
        finishOperation(source.id);
    } finally {
      committing.current = false;
    }
  };
  const fit = () => setCameraCommand({ id: performance.now(), type: 'fit' });
  const changeView = (next: View) => {
    setView(next);
    setProjection(next === 'iso' ? 'perspective' : 'orthographic');
    setCameraCommand({ id: performance.now(), type: 'view', view: next });
  };
  const changeRotation = (patch: Partial<Rotation>) => {
    if (!rotationRef.current) return;
    rotationRef.current = { ...rotationRef.current, ...patch };
    setRotationDraft(rotationRef.current);
  };
  const startRotation = (ids: string[]) => {
    const parts = project.bodies.filter((b) => ids.includes(b.id));
    try {
      requireMovable(parts, project.groups);
      rotationRef.current = { ids, pivot: bodiesCenter(parts), axis: [0, 0, 1] };
      setRotationDraft(rotationRef.current);
      setAwaitingStart(false);
      writeFields({ angle: '0' });
    } catch (error) {
      editor.setError((error as Error).message);
    }
  };
  const begin = (next: Tool) => {
    if (busy) return;
    if (editingBodyId && next === 'boolean') {
      editor.setMessage('Päätä osan muokkaus ennen usean kappaleen Cut/Join-toimintoa.');
      return;
    }
    if (next === 'measure' && tool === 'measure') {
      setMeasureMenu(!measureMenu);
      return;
    }
    resetGesture();
    setAwaitingStart(false);
    setTool(next);
    if (!['select', 'move', 'rotate'].includes(next)) setSelectedGroupId(undefined);
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
    if (next === 'detail') {
      setPanelOpen(true);
      writeFields({ ...defaults, offset: '2' });
      if (body && !bodyLocked(body, project.groups))
        setDetailTarget({ bodyId: body.id, indices: [] });
      return;
    }
    if (next === 'measure') setMeasureMode('guide');
    if (
      ['rectangle', 'circle', 'extrude', 'offset', 'move', 'measure', 'pen', 'rotate'].includes(
        next,
      )
    ) {
      setPanelOpen(true);
      setDraftId(uid());
      writeFields({ ...defaults });
      if (next === 'circle') writeFields({ width: '100', depth: '60' });
      if (['rectangle', 'circle', 'pen'].includes(next))
        setShapeName(
          `${next === 'rectangle' ? 'Levy' : next === 'circle' ? 'Ympyrä' : 'Kynämuoto'} ${project.bodies.length + 1}`,
        );
      if (next === 'offset') writeFields({ offset: '18' });
      const hovered = hoveredFaceRef.current;
      const faceBody = project.bodies.find((b) => b.id === hovered?.bodyId) ?? body;
      if (
        (next === 'extrude' || (next === 'offset' && hovered)) &&
        faceBody &&
        !bodyLocked(faceBody, project.groups) &&
        (!editingBodyId || faceBody.id === editingBodyId)
      ) {
        const mesh = editor.meshes.find((m) => m.id === faceBody.id);
        const face =
          mesh?.faces.find(
            (f) =>
              f.ref ===
              (hovered?.face ??
                selectedFace ??
                (pickedFaceRef.current?.bodyId === faceBody.id
                  ? pickedFaceRef.current.face
                  : undefined)),
          ) ??
          mesh?.faces.find((f) => f.normal[2] > 0.9) ??
          mesh?.faces[0];
        if (face) {
          const target = {
            bodyId: faceBody.id,
            face: face.ref,
            normal: face.normal,
            point: hovered?.point ?? face.center,
          };
          setSelected(faceBody.id);
          setSelectedIds([faceBody.id]);
          setSelectedFace(face.ref);
          faceRef.current = target;
          setFaceTarget(target);
          writeFields({ height: '0' });
          if (next === 'extrude') measureTarget(target, !!hovered);
        }
      }
      if (next === 'rectangle' || next === 'circle' || next === 'pen') {
        setSelected(undefined);
        setSelectedIds([]);
        setSelectedFace(undefined);
      }
    }
    if (next === 'rotate' && body) startRotation(selectedIds.length ? selectedIds : [body.id]);
  };
  const makePreview = (): Body | undefined => {
    const fields = fieldsRef.current;
    if (!editing || ['measure', 'pen', 'extrude', 'offset', 'detail', 'rotate'].includes(tool))
      return;
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
    requireMovable(
      project.bodies.filter((b) => (selectedIds.length ? selectedIds : [body.id]).includes(b.id)),
      project.groups,
    );
    if (bodyLocked(body, project.groups))
      throw new Error('Kappale on kiinnitetty paikalleen. Vapauta se G-näppäimellä.');
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
    awaitingStart,
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
      return extrusionValue();
    } catch {
      return 0;
    }
  }, [fields.height, fields.remaining, extrusionMode, faceSpan]);
  const finalSize = faceSpan
    ? faceSpan.solid
      ? Math.max(0, faceSpan.depth + faceDistance)
      : Math.abs(faceDistance)
    : undefined;

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
    const target =
      editingBodyId && surfaceMode === 'region' && shapePurpose === 'model'
        ? sketchTargetRef.current
        : undefined;
    const source = project.bodies.find((b) => b.id === target?.bodyId),
      distance = parseLength(fieldsRef.current.thickness, true, true);
    if (
      editingBodyId &&
      surfaceMode === 'region' &&
      shapePurpose === 'model' &&
      (!source || source.id !== editingBodyId)
    )
      throw new Error('Aloita muokattavan osan tasopinnalta tai valitse piirtotavaksi Uusi osa.');
    let selectedRegion: FaceRef | undefined;
    if (target && source && bodyLocked(source, project.groups) && surfaceMode === 'region')
      throw new Error(
        'Kappale on kiinnitetty. Valitse Uusi osa tai vapauta kappale G-näppäimellä.',
      );
    if (target && source && !bodyLocked(source, project.groups)) {
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
      if (committed) finishOperation(source.id, distance ? undefined : selectedRegion);
    } else if (
      await editor.transact(
        { ...project, bodies: [...project.bodies, candidate] },
        candidate.purpose === 'construction' && !featureIsSolid(candidate.feature)
          ? 'Rakennusviiva valmis. Osan pinta säilyi; viivan pisteet tarjoavat tartunnat.'
          : 'Muoto valmis. Voit muokata pintaa E:llä tai käyttää kappaletta Cut/Join-työkalussa.',
      )
    )
      finishOperation(candidate.id);
  };
  const applyBooleanOperation = async () => {
    const targets = project.bodies.filter((b) => booleanTargets.includes(b.id)),
      tools = project.bodies.filter((b) => booleanTools.includes(b.id));
    let nextSelected: string | undefined;
    const success = await editor.transact(
      async () => {
        requireMovable(targets, project.groups);
        if (booleanOperation === 'join' || !keepTools) requireMovable(tools, project.groups);
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
    if (success) finishOperation(nextSelected);
  };
  const apply = async (forceClose = false) => {
    if (committing.current || busy) return;
    try {
      if (['extrude', 'offset'].includes(tool) && faceRef.current)
        requireMovable(
          project.bodies.filter((b) => b.id === faceRef.current!.bodyId),
          project.groups,
        );
      if (tool === 'detail') {
        if (!detailSource || !detailTarget?.indices.length) {
          editor.setMessage('Valitse ensin käsiteltävät reunat.');
          return;
        }
        requireMovable([detailSource], project.groups);
        committing.current = true;
        if (
          await editor.transact(
            async () => {
              const result = await editor.cad.edgeDetail(
                detailSource,
                detailTarget.indices,
                detailOperation,
                parseLength(fieldsRef.current.offset),
              );
              return {
                ...project,
                bodies: project.bodies.map((b) => (b.id === result.body.id ? result.body : b)),
              };
            },
            detailOperation === 'fillet' ? 'Reunat pyöristetty.' : 'Reunat viistetty.',
          )
        )
          finishOperation(detailSource.id);
      } else if (tool === 'rotate') {
        const draft = rotationRef.current;
        if (!draft) {
          editor.setMessage('Valitse ensin kierrettävä kappale.');
          return;
        }
        const rotation = { ...draft, angle: rotationAngle(fieldsRef.current.angle) };
        const parts = project.bodies.filter((b) => draft.ids.includes(b.id));
        requireMovable(parts, project.groups);
        committing.current = true;
        const success =
          Math.abs(rotation.angle % 360) < 1e-9 ||
          (await editor.transact(async () => {
            const results = await editor.cad.rotate(
              parts,
              rotation.pivot,
              rotation.axis,
              rotation.angle,
            );
            return applyRotation(project, results, rotation);
          }, 'Valinta kierretty.'));
        if (success) {
          finishOperation(draft.ids[0]);
          setSelectedIds(draft.ids);
          setSelectedGroupId(selectedGroupId);
        }
      } else if (tool === 'boolean') {
        committing.current = true;
        await applyBooleanOperation();
      } else if (tool === 'offset') {
        const target = faceRef.current,
          source = project.bodies.find((b) => b.id === target?.bodyId);
        if (!target || !source || (editingBodyId && source.id !== editingBodyId)) {
          editor.setMessage('Valitse sisennettävä pinta.');
          return;
        }
        const distance = parseLength(fieldsRef.current.offset);
        committing.current = true;
        let region: FaceRef | undefined;
        if (
          await editor.transact(async () => {
            requireMovable([source], project.groups);
            const result = await editor.cad.offset(source, target.face, distance);
            region = result.face;
            return {
              ...project,
              bodies: project.bodies.map((b) => (b.id === source.id ? result.body : b)),
            };
          }, 'Sisennys valmis. E: työnnä aluetta sisään tai leikkaa läpi.')
        ) {
          hoveredFaceRef.current = undefined;
          finishOperation(source.id, region);
        }
      } else if (tool === 'extrude') {
        const target = faceRef.current,
          source = project.bodies.find((b) => b.id === target?.bodyId);
        if (!target || !source || (editingBodyId && source.id !== editingBodyId)) {
          editor.setMessage('Osoita pintaa ja aloita veto.');
          return;
        }
        const distance = extrusionValue();
        if (Math.abs(distance) < 1e-8) {
          editor.setMessage('Mitta on jo haluttu. Kappale säilyi ennallaan.');
          finishOperation(source.id);
          return;
        }
        committing.current = true;
        if (
          await editor.transact(async () => {
            const next = await editor.cad.pushPull(source, target.face, distance);
            return { ...project, bodies: project.bodies.map((b) => (b.id === next.id ? next : b)) };
          }, 'Pintaa muokattu.')
        )
          finishOperation(source.id);
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
          finishOperation();
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
        const source = project.bodies.find((b) => b.id === candidate.id)!;
        const result = translateSelection(
          project,
          selectedIds.length ? selectedIds : [source.id],
          sub(candidate.origin, source.origin),
          copyMoveRef.current,
          selectedGroupId,
        );
        if (
          await editor.transact(
            result.project,
            copyMoveRef.current
              ? 'Valinnan kopio sijoitettu. Alkuperäiset säilyivät paikallaan.'
              : 'Valitut osat siirretty.',
          )
        ) {
          finishOperation(result.ids[0]);
          setSelectedIds(result.ids);
          setSelectedGroupId(result.groupId);
        }
      }
    } catch (e) {
      editor.setError((e as Error).message);
    } finally {
      committing.current = false;
    }
  };
  const cancel = () => {
    const hadGesture = gestureActive.current || !!faceRef.current || !!rotationRef.current || busy;
    if (busy) editor.cancel();
    resetGesture();
    setTool('select');
    setSelectedGroupId(undefined);
    setMultiSelect(false);
    pickedFaceRef.current = undefined;
    setAwaitingStart(false);
    setSelected(undefined);
    setSelectedIds([]);
    setSelectedFace(undefined);
    setMeasureMenu(false);
    editor.setError('');
    if (editingBodyId) {
      if (!hadGesture) {
        setEditingBodyId(undefined);
        setSurfaceMode('new');
        editor.setMessage('Osan muokkaus päätetty. Piirtäminen luo uuden osan.');
      }
      setSelected(editingBodyId);
      setSelectedIds([editingBodyId]);
    }
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
    gestureActive.current = true;
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
      if (!lockRef.current.has('height') && !lockRef.current.has('remaining')) {
        if (Math.abs(event.distance) > 0.01) dragDirection.current = Math.sign(event.distance);
        extrusionModeRef.current = 'height';
        setExtrusionMode('height');
        writeFields({ height: `${event.distance >= 0 ? '+' : ''}${inputNumber(event.distance)}` });
      }
    } else if (event.type === 'offset') {
      if (!lockRef.current.has('offset')) writeFields({ offset: inputNumber(event.distance) });
    } else if (event.type === 'move') {
      const source = project.bodies.find((b) => b.id === event.bodyId) ?? body;
      if (!source) return;
      for (const [i, key] of ['x', 'y', 'z'].entries())
        if (!lockRef.current.has(key))
          patch[key as 'x' | 'y' | 'z'] = String(
            Math.round((event.origin[i] - source.origin[i]) * 100) / 100,
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
  const selectGuide = (id: string) => {
    if (busy) return;
    resetGesture();
    setTool('select');
    setSelected(undefined);
    setSelectedIds([]);
    setSelectedFace(undefined);
    setSelectedGuideId(id);
    setAwaitingStart(true);
    setTab('guides');
    editor.setMessage('Viiva valittu. Valitse toiminto viivan valikosta.');
  };
  const removeGuide = async (id: string) => {
    if (busy) return;
    if (
      await editor.transact(
        { ...project, guides: project.guides.filter((g) => g.id !== id) },
        'Viiva poistettu. Peru palauttaa sen.',
      )
    ) {
      resetGesture();
      setAwaitingStart(true);
    }
  };
  const editGuide = (guide: Guide) => {
    resetGesture();
    setTool('measure');
    setAwaitingStart(false);
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
  const rotation = useMemo(() => {
    if (!rotationDraft || awaitingStart) return;
    try {
      return { ...rotationDraft, angle: rotationAngle(fields.angle) };
    } catch {
      return { ...rotationDraft, angle: 0 };
    }
  }, [rotationDraft, fields.angle, awaitingStart]);
  const numericFields: NumericField[] =
    tool === 'detail'
      ? [
          {
            key: 'offset',
            label: detailOperation === 'fillet' ? 'Säde' : 'Viisteen koko',
            value: fields.offset,
            unit: 'mm',
            testId: 'detail-size',
          },
        ]
      : tool === 'offset'
        ? faceTarget
          ? [
              {
                key: 'offset',
                label: 'Sisennys',
                value: fields.offset,
                unit: 'mm',
                testId: 'offset-input',
              },
            ]
          : []
        : tool === 'rotate'
          ? [
              {
                key: 'angle',
                label: 'Kiertokulma',
                value: fields.angle,
                unit: '°',
                testId: 'rotation-angle',
                signed: true,
              },
            ]
          : tool === 'circle'
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
                        value:
                          extrusionMode === 'height'
                            ? fields.height
                            : `${faceDistance >= 0 ? '+' : ''}${inputNumber(faceDistance)}`,
                        unit: 'mm',
                        testId: 'height-input',
                        signed: true,
                      },
                      ...(faceSpan
                        ? [
                            {
                              key: 'remaining',
                              label: 'Toteutuva kokonaismitta',
                              value:
                                extrusionMode === 'remaining'
                                  ? fields.remaining
                                  : inputNumber(finalSize!),
                              unit: 'mm',
                              testId: 'remaining-input',
                            },
                          ]
                        : []),
                    ]
                  : []
                : tool === 'measure'
                  ? [
                      {
                        key: guideDraft?.offset ? 'offset' : 'length',
                        label: guideDraft?.offset ? 'Etäisyys lähtökohdasta' : 'Pituus',
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
  const copyBody = () => {
    if (!selectedIds.length && !body) return;
    begin('move');
    changeCopyMove(true);
    editor.setMessage(
      'Kopioi valinta: tartu osan kulmaan tai anna siirtymä. Enter hyväksyy, Esc peruu.',
    );
  };
  const patchBodies = async (ids: string[], patch: Partial<Body>) => {
    if (busy) return;
    const success = await editor.transact(
      {
        ...project,
        bodies: project.bodies.map((b) => (ids.includes(b.id) ? { ...b, ...patch } : b)),
      },
      patch.locked === true
        ? 'Kappale kiinnitetty paikalleen. G vapauttaa.'
        : patch.locked === false
          ? 'Kiinnitys vapautettu.'
          : 'Kappaleen tiedot päivitetty.',
    );
    if (success && (patch.locked !== undefined || patch.hidden !== undefined)) {
      resetGesture();
      setAwaitingStart(true);
    }
  };
  const holdSelected = () => {
    if (selectedGroup) {
      if (groupAncestors(project.groups, selectedGroup.parentId).some((g) => g.locked)) {
        editor.setError('Vapauta ensin ylemmän ryhmän Hold.');
        return;
      }
      void patchGroup(selectedGroup.id, { locked: !selectedGroup.locked });
      return;
    }
    const ids = selectedIds.length ? selectedIds : selected ? [selected] : [];
    if (
      ids.some((id) => {
        const b = project.bodies.find((b) => b.id === id);
        return b && groupAncestors(project.groups, b.groupId).some((g) => g.locked);
      })
    ) {
      editor.setError('Vapauta ensin osan ylemmän ryhmän Hold.');
      return;
    }
    if (ids.length)
      void patchBodies(ids, {
        locked: !project.bodies.filter((b) => ids.includes(b.id)).every((b) => b.locked),
      });
  };
  const originSelected = async (reference: 'min' | 'center') => {
    try {
      const ids = selectedIds.length ? selectedIds : selected ? [selected] : [];
      if (
        await editor.transact(moveToOrigin(project, ids, reference), 'Valinta siirretty origoon.')
      ) {
        resetGesture();
        setAwaitingStart(true);
        fit();
      }
    } catch (error) {
      editor.setError((error as Error).message);
    }
  };
  const patchGroup = async (id: string, patch: Partial<import('./model/project').BodyGroup>) => {
    if (busy) return;
    try {
      const next = 'parentId' in patch ? reparentGroup(project, id, patch.parentId) : project;
      if (
        await editor.transact(
          { ...next, groups: next.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) },
          'Ryhmän tiedot päivitetty.',
        )
      ) {
        resetGesture();
        setAwaitingStart(true);
      }
    } catch (e) {
      editor.setError((e as Error).message);
    }
  };
  const createGroup = async (parentId?: string) => {
    if (busy) return;
    const group = {
      id: uid(),
      name: `Ryhmä ${project.groups.length + 1}`,
      hidden: false,
      parentId,
    };
    await editor.transact(
      {
        ...project,
        groups: [...project.groups, group],
        bodies: project.bodies.map((b) =>
          selectedIds.includes(b.id) ? { ...b, groupId: group.id } : b,
        ),
      },
      'Ryhmä luotu. Voit nimetä sen listassa.',
    );
  };
  const removeGroup = async (id: string) => {
    if (
      await editor.transact(
        dissolveGroup(project, id),
        'Ryhmä purettu. Osat ja alaryhmät säilyivät.',
      )
    )
      setSelectedGroupId(undefined);
  };
  const newProject = async () => {
    if (
      await editor.transact(
        freshProject(),
        'Uusi projekti. Aiemman työn saat takaisin Peru-toiminnolla.',
      )
    ) {
      setEditingBodyId(undefined);
      setSurfaceMode('new');
      finishOperation();
      setMode('model');
      setRenderOpen(false);
    }
  };
  const example = async () => {
    if (
      await editor.transact(
        cabinetProject(),
        'Esimerkkikaappi avattu. Jokainen levy on erillinen muokattava kappale.',
      )
    ) {
      setEditingBodyId(undefined);
      setSurfaceMode('new');
      finishOperation();
      setMode('model');
      setRenderOpen(false);
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
        setEditingBodyId(undefined);
        setSurfaceMode('new');
        finishOperation();
        setMode('model');
        setRenderOpen(false);
        changeView('iso');
      }
    } catch (e) {
      editor.setError((e as Error).message);
    }
    if (fileInput.current) fileInput.current.value = '';
  };
  const openRender = () => {
    resetGesture();
    setEditingBodyId(undefined);
    setSurfaceMode('new');
    setTool('navigate');
    setRenderOpen(true);
  };
  const closeRender = () => {
    resetGesture();
    setRenderOpen(false);
    setMode('model');
    setTool('select');
  };
  const openDrawing = () => {
    setRenderOpen(false);
    resetGesture();
    setEditingBodyId(undefined);
    setSurfaceMode('new');
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
    const next = addBodyDimensions(project, [body.id], [axis]);
    if (await editor.transact(next, 'Malliin liittyvä mitta lisätty.'))
      setScale((current) => Math.max(current, recommendedScale(next, drawingView)));
  };
  const dimensionSelection = async () => {
    const ids = selectedIds.length ? selectedIds : body ? [body.id] : [];
    const next = addBodyDimensions(project, ids);
    if (next.dimensions.length === project.dimensions.length) {
      editor.setMessage('Valinnan kokonaismitat on jo lisätty.');
      setTab('dimensions');
      return;
    }
    if (await editor.transact(next, 'Kokonaismitat lisätty 3D-näkymään ja mittakuvaan.')) {
      setTab('dimensions');
      if (mode === 'drawing')
        setScale((current) => Math.max(current, recommendedScale(next, drawingView)));
    }
  };
  const onSheet = useCallback((sheet?: Sheet) => setSheet(sheet), []);

  useEffect(() => {
    if (!editNotice) return;
    const timer = window.setTimeout(() => setEditNotice(undefined), 5000);
    return () => window.clearTimeout(timer);
  }, [editNotice]);
  useEffect(() => setEditNotice(undefined), [editingBodyId, tool]);
  useEffect(() => {
    if (selectedGroupId && !selectedGroup) setSelectedGroupId(undefined);
  }, [selectedGroupId, selectedGroup]);
  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => project.bodies.some((b) => b.id === id)));
    if (selected && !project.bodies.some((b) => b.id === selected)) {
      setSelected(undefined);
      setSelectedFace(undefined);
    }
  }, [project.bodies, selected]);
  useEffect(() => {
    if (
      editingBodyId &&
      (!editingBody ||
        bodyLocked(editingBody, project.groups) ||
        !bodyVisible(editingBody, project.groups))
    ) {
      setEditingBodyId(undefined);
      setSurfaceMode('new');
      resetGesture();
      setTool('select');
    }
  }, [editingBodyId, editingBody, project.groups]);
  // Commands must observe the same busy/history state as the committed UI, including
  // a redo pressed immediately after undo renders the new object list.
  useLayoutEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (renderOpen) {
          closeRender();
          return;
        }
        cancel();
        return;
      }
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
      if (busy) return;
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        resetGesture();
        setAwaitingStart(true);
        if (event.shiftKey) void editor.redo();
        else void editor.undo();
        return;
      }
      if (renderOpen) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        awaitingStart &&
        numericFields.length &&
        /^[\d.,+\-]$/.test(event.key) &&
        ['rectangle', 'circle', 'move', 'pen'].includes(tool)
      ) {
        event.preventDefault();
        flushSync(() => {
          setAwaitingStart(false);
          field(numericFields[0].key, event.key);
        });
        const input = document.querySelector<HTMLInputElement>(
          `[data-testid="${numericFields[0].testId}"]`,
        );
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
        return;
      }
      if (key === 'enter' && (editing || tool === 'boolean')) {
        event.preventDefault();
        void apply();
      }
      if (key === 'r' && ((tool === 'measure' && guideRef.current) || selectedGuideId)) {
        event.preventDefault();
        rotateGuide(event.shiftKey);
        return;
      }
      if (key === 'g') {
        event.preventDefault();
        holdSelected();
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
        if (selectedGuideId) void removeGuide(selectedGuideId);
        else void removeBody();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => {
    if (tool === 'measure' && axis && guideRef.current && !guideRef.current.offset) {
      const draft = guideRef.current;
      draft.direction = axisVector(axis);
      draft.plane = planeForDirection(draft.direction, draft.plane);
      lockRef.current.delete('angle');
      writeFields({ angle: String(angleBetween([0, 0, 0], draft.direction, draft.plane, true)) });
      setGuideDraft({ ...draft });
    }
  }, [axis, tool]);

  const objectTree = (
    <ObjectTree
      bodies={project.bodies}
      groups={project.groups}
      selected={selectedIds}
      busy={busy}
      onSelect={(id, additive) => select(id, undefined, additive)}
      onSelectGroup={(id) => {
        if (editingBodyId) {
          editor.setMessage('Päätä osan muokkaus ennen ryhmän valintaa.');
          return;
        }
        const ids = groupBodies(project, id).map((b) => b.id);
        if (tool === 'boolean') {
          ids.forEach((id) => toggleBoolean(id));
          return;
        }
        select(ids[0], undefined, false, true);
        setSelectedIds(ids);
        setSelectedGroupId(id);
        setMultiSelect(true);
        if (tool === 'rotate') startRotation(ids);
      }}
      onBody={(id, patch) => void patchBodies([id], patch)}
      onGroup={(id, patch) => void patchGroup(id, patch)}
      selectedGroupId={selectedGroupId}
      onNewGroup={() => void createGroup()}
      onRemoveGroup={(id) => void removeGroup(id)}
    />
  );
  const objectActions = body && !selectedGroup && mode === 'model' && (
    <ObjectActions
      body={{ ...body, locked: bodyLocked(body, project.groups) }}
      groups={project.groups}
      count={selectedIds.length}
      mixedColor={project.bodies.some(
        (b) => selectedIds.includes(b.id) && b.color.toLowerCase() !== body.color.toLowerCase(),
      )}
      busy={busy}
      onChange={(patch) => void patchBodies([body.id], patch)}
      onColor={(color) => void patchBodies(selectedIds.length ? selectedIds : [body.id], { color })}
      onGroup={(groupId) =>
        void patchBodies(selectedIds.length ? selectedIds : [body.id], { groupId })
      }
      onOrigin={(reference) => void originSelected(reference)}
      onRotate={() => begin('rotate')}
      onHold={holdSelected}
      editing={!!editingBodyId}
      onEdit={() => openBodyEdit(body.id)}
    />
  );
  const numericInput = editing && numericFields.length > 0 && (
    <DynamicInput
      fields={numericFields}
      position={popup}
      onPositionChange={setPopup}
      docked={panelOpen}
      locked={locked}
      onChange={field}
      activeKey={tool === 'extrude' ? extrusionMode : undefined}
      onActivate={tool === 'extrude' ? activateExtrusion : undefined}
      onAccept={() => void apply()}
      onCancel={cancel}
      busy={busy}
      title={
        tool === 'detail'
          ? 'Viimeistele reunat'
          : tool === 'offset'
            ? 'Offset · sisennys'
            : tool === 'rotate'
              ? 'Kierrä'
              : tool === 'rectangle'
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
                        ? copyMove
                          ? 'Siirrä kopio'
                          : 'Siirrä'
                        : 'Push / pull'
      }
    />
  );

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
        <div className="mode-switch" aria-label="Työtila">
          <button aria-pressed={!renderOpen && mode === 'model'} onClick={closeRender}>
            <Box size={16} />
            Malli
          </button>
          <button
            aria-pressed={!renderOpen && mode === 'drawing'}
            disabled={!project.bodies.length || busy}
            onClick={openDrawing}
          >
            <Ruler size={16} />
            Mittakuva
          </button>
          <button aria-pressed={renderOpen} disabled={!ready || busy} onClick={openRender}>
            <Camera size={16} />
            Renderöi
          </button>
        </div>

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
        <button
          className="icon-button header-menu-toggle"
          aria-label="Lisää toimintoja"
          aria-expanded={headerMenuOpen}
          aria-controls="header-controls"
          onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
        >
          <MoreHorizontal />
        </button>
        <div id="header-controls" className={`header-controls ${headerMenuOpen ? 'is-open' : ''}`}>
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
              className="icon-button download-project"
              aria-label="Tallenna tiedosto"
              title="Tallenna tiedosto"
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
            </button>
          </div>
          <div className="history-controls">
            <IconButton
              label="Peru"
              disabled={busy || !editor.canUndo}
              onClick={() => {
                resetGesture();
                setAwaitingStart(true);
                void editor.undo();
              }}
            >
              <Undo2 />
            </IconButton>
            <IconButton
              label="Palauta"
              disabled={busy || !editor.canRedo}
              onClick={() => {
                resetGesture();
                setAwaitingStart(true);
                void editor.redo();
              }}
            >
              <Redo2 />
            </IconButton>
            <span className="vertical-rule" />
            <details className="viewport-settings">
              <summary aria-label="Asetukset" title="Asetukset">
                <Settings2 />
              </summary>
              <div className="viewport-settings-panel">
                <label>
                  Akselien tyyli
                  <select
                    aria-label="Akselien tyyli"
                    value={project.settings.axisStyle}
                    disabled={busy}
                    onChange={(e) =>
                      void editor.transact(
                        {
                          ...project,
                          settings: {
                            ...project.settings,
                            axisStyle: e.target.value as 'subtle' | 'strong',
                          },
                        },
                        'Akselien tyyli päivitetty.',
                      )
                    }
                  >
                    <option value="subtle">Hillitty</option>
                    <option value="strong">Korostettu</option>
                  </select>
                </label>
                <label>
                  <CommitCheckbox
                    label="Näytä akselien nimet ja origon teksti"
                    disabled={busy}
                    checked={project.settings.axisLabels}
                    onChange={(axisLabels) =>
                      editor.transact(
                        { ...project, settings: { ...project.settings, axisLabels } },
                        'Akselitekstien näkyvyys päivitetty.',
                      )
                    }
                  />
                  Akselien nimet ja origo
                </label>
                <label>
                  Mitat 3D-näkymässä
                  <select
                    aria-label="Mitat 3D-näkymässä"
                    disabled={busy}
                    value={project.settings.dimensionDisplay}
                    onChange={(e) =>
                      void editor.transact(
                        {
                          ...project,
                          settings: {
                            ...project.settings,
                            dimensionDisplay: e.target.value as 'all' | 'selected' | 'hidden',
                          },
                        },
                        'Mittojen näkyvyys päivitetty.',
                      )
                    }
                  >
                    <option value="all">Kaikki lisätyt mitat</option>
                    <option value="selected">Vain valinnan mitat</option>
                    <option value="hidden">Piilota 3D-mitat</option>
                  </select>
                </label>
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
              </div>
            </details>
            <IconButton
              label={panelOpen ? 'Piilota ominaisuudet' : 'Näytä ominaisuudet'}
              aria-pressed={panelOpen}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </IconButton>
            <IconButton
              label={fullscreen ? 'Poistu koko näytöstä' : 'Siirry koko näyttöön'}
              disabled={!document.fullscreenEnabled}
              aria-pressed={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize /> : <Maximize />}
            </IconButton>
            <IconButton label="Käyttöohje" onClick={() => setHelp(true)}>
              <CircleHelp />
            </IconButton>
          </div>
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

      <div className={`workspace ${panelOpen ? 'panel-open' : ''}`} hidden={renderOpen}>
        <aside className="tool-rail" aria-label="Mallinnustyökalut">
          {tools.map((t) => (
            <button
              key={t.id}
              className={`tool-button ${mode === 'model' && tool === t.id ? 'active' : ''}`}
              aria-label={t.label}
              aria-pressed={mode === 'model' && tool === t.id}
              disabled={busy}
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

        <main className={`canvas-area ${editingBody && mode === 'model' ? 'is-editing' : ''}`}>
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
                <IconButton
                  label="Näytä origo"
                  onClick={() => setCameraCommand({ id: performance.now(), type: 'origin' })}
                >
                  <Crosshair />
                </IconButton>
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
            {editingBody && (
              <div className="edit-context" data-testid="edit-context" data-notice={!!editNotice}>
                <Pencil size={19} aria-hidden="true" />
                <div className="edit-context-copy" role="status">
                  <div className="edit-context-title">
                    <span>Muokkaustila</span>
                    <strong title={editingBody.name}>{editingBody.name}</strong>
                  </div>
                  <p>
                    {editNotice
                      ? 'Lopeta muokkaus, jotta voit valita muita osia.'
                      : 'Muut osat ovat viitteitä. V: tuplaklikkaa tyhjää tilaa poistuaksesi.'}
                  </p>
                </div>
                <button
                  onClick={closeBodyEdit}
                  disabled={busy}
                  title="Lopeta muokkaus · Esc peruu ensin keskeneräisen toiminnon"
                >
                  <Check size={16} aria-hidden="true" /> Lopeta muokkaus
                </button>
              </div>
            )}
            {editingBody && editNotice?.x !== undefined && editNotice.y !== undefined && (
              <div
                className="edit-context-hint"
                data-testid="edit-context-hint"
                role="status"
                style={{
                  left: `clamp(8px, ${editNotice.x + 16}px, calc(100% - 280px))`,
                  top: `clamp(145px, ${editNotice.y + 16}px, calc(100% - 100px))`,
                }}
              >
                <strong>{editingBody.name} on muokkaustilassa</strong>
                <span>Lopeta muokkaus yläpalkista, jotta voit valita muita osia.</span>
              </div>
            )}
            {!editingBody && faceTarget && ['extrude', 'offset'].includes(tool) && (
              <div className="operation-context" role="status">
                {tool === 'extrude' ? 'Push / pull' : 'Offset'}:{' '}
                {project.bodies.find((b) => b.id === faceTarget.bodyId)?.name}
              </div>
            )}
            <Viewport
              detailTarget={detailTarget}
              detailPreview={tool === 'detail' ? detailPreview.result : undefined}
              onDetailEdge={(id, index) => {
                if (editingBodyId && id !== editingBodyId) {
                  explainEditContext();
                  return;
                }
                const source = project.bodies.find((b) => b.id === id);
                if (!source || bodyLocked(source, project.groups)) return;
                setDetailTarget((old) => ({
                  bodyId: id,
                  indices:
                    old?.bodyId === id
                      ? old.indices.includes(index)
                        ? old.indices.filter((i) => i !== index)
                        : [...old.indices, index]
                      : [index],
                }));
                setSelected(id);
                setSelectedIds([id]);
                setSelectedGroupId(undefined);
                setAwaitingStart(false);
                gestureActive.current = true;
              }}
              editingBodyId={editingBodyId}
              onEditBody={openBodyEdit}
              onCloseBodyEdit={closeBodyEdit}
              onEditBlocked={explainEditContext}
              onRemoveBoundary={(target) => void eraseBoundary(target)}
              onRemoveGuide={(id) => void removeGuide(id)}
              bodies={visibleBodies}
              meshes={visibleMeshes}
              selected={selected}
              selectedIds={selectedIds}
              selectedGroupId={selectedGroupId}
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
              radialShape={shapeKind}
              sketchFrame={shapeFrame}
              sketchTarget={sketchTarget}
              booleanTargets={booleanTargets}
              booleanTools={booleanTools}
              pickDepth={pickDepth}
              onDepthPicked={(distance) => {
                field('height', `${distance >= 0 ? '+' : ''}${inputNumber(distance)}`);
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
              extrusionLocked={locked.has('height') || locked.has('remaining')}
              dimensions={project.dimensions}
              dimensionDisplay={project.settings.dimensionDisplay}
              copyMove={copyMove}
              onCopyMove={changeCopyMove}
              offsetDistance={offsetDistance}
              offsetOutline={offsetPreview.lines}
              offsetPreviewDistance={offsetPreview.distance}
              faceSpan={faceSpan}
              guideXray={project.settings.guideXray}
              axisStyle={project.settings.axisStyle}
              axisLabels={project.settings.axisLabels}
              selectedGuideId={selectedGuideId}
              freeRotate={freeRotate}
              onFaceHover={(target) => {
                hoveredFaceRef.current = target;
              }}
              onFaceTarget={(target) => {
                if (editingBodyId && target.bodyId !== editingBodyId) return;
                faceRef.current = target;
                setFaceTarget(target);
                setSelected(target.bodyId);
                setSelectedIds([target.bodyId]);
                setSelectedFace(target.face);
                clearLocks();
                writeFields({ height: '0' });
                if (tool === 'extrude') measureTarget(target, true);
              }}
              onSelectGuide={selectGuide}
              onAxis={(next) => {
                setAxis(next);
                if (next) setFreeRotate(false);
              }}
              onConstraint={(direction) => {
                constraintRef.current = direction;
                setPenConstraint(direction);
                lockRef.current.delete('length');
              }}
              onAccept={() => void apply()}
              onPenHover={penMove}
              onReference={setReference}
              onReferencePicked={() => setPickReference(false)}
              rotation={rotation}
              onRotationPick={(pivot, axis, bodyId) => {
                if (bodyId) {
                  setSelected(bodyId);
                  setSelectedIds([bodyId]);
                  setSelectedFace(undefined);
                  startRotation([bodyId]);
                } else changeRotation({ pivot, ...(axis ? { axis } : {}), picking: undefined });
                setAwaitingStart(false);
              }}
              onRotationAngle={(angle) => {
                if (!lockRef.current.has('angle')) writeFields({ angle: inputNumber(angle) });
              }}
              onRotationAxis={(axis) => changeRotation({ axis, picking: undefined })}
              onStart={() => {
                gestureActive.current = true;
                setAwaitingStart(false);
              }}
              onMoveTarget={(id) => {
                setSelected(id);
                if (!selectedIds.includes(id)) {
                  setSelectedIds([id]);
                  setSelectedGroupId(undefined);
                }
                setSelectedFace(undefined);
              }}
            />
            {!panelOpen && numericInput}
            {tool === 'select' && selectedGuide && (
              <div className="guide-actions" role="toolbar" aria-label="Viivan toiminnot">
                <span>
                  <Ruler size={16} />
                  {selectedGuide.mode === 'guide' ? 'Apuviiva' : 'Mittaviiva'}
                </span>
                <button disabled={busy} onClick={() => editGuide(selectedGuide)}>
                  <Pencil size={15} /> Muokkaa
                </button>
                <button disabled={busy} onClick={() => rotateGuide()} title="Kierrä 45° · R">
                  <RotateCw size={15} /> Kierrä
                </button>
                <button
                  disabled={busy}
                  aria-pressed={!!selectedGuide.xray}
                  onClick={() =>
                    void editor.transact(
                      {
                        ...project,
                        guides: project.guides.map((g) =>
                          g.id === selectedGuide.id ? { ...g, xray: !g.xray } : g,
                        ),
                      },
                      'Viivan x-ray muutettu.',
                    )
                  }
                >
                  X-ray
                </button>
                <button disabled={busy} onClick={() => void removeGuide(selectedGuide.id)}>
                  <Trash2 size={15} /> Poista
                </button>
              </div>
            )}
            {['rectangle', 'circle', 'pen'].includes(tool) && (
              <div
                className="guide-actions shape-mode-actions"
                role="toolbar"
                aria-label="Muodon toiminnot"
              >
                <button
                  disabled={busy}
                  aria-pressed={!constructionLine}
                  onClick={() => setShapePurpose('model')}
                >
                  <Square size={15} />
                  Kappale
                </button>
                <button
                  disabled={busy}
                  aria-pressed={constructionLine}
                  onClick={() => {
                    setShapePurpose('construction');
                    field('thickness', '0');
                  }}
                >
                  <Ruler size={15} />
                  Mittaus/rakennusviiva
                </button>
              </div>
            )}
            {tool === 'measure' && measureMenu && (
              <div className="measure-mode-menu" role="menu" aria-label="Mittatyökalun tila">
                <button
                  role="menuitemradio"
                  aria-checked={measureMode === 'guide'}
                  onClick={() => {
                    resetGesture();
                    setAwaitingStart(false);
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
                    setAwaitingStart(false);
                    setMeasureMode('free');
                    setMeasureMenu(false);
                  }}
                >
                  Vapaa mittaviiva<small>Piirrä suora viiva mistä tahansa</small>
                </button>
              </div>
            )}
            {editing && !['extrude', 'offset', 'rotate', 'detail'].includes(tool) && (
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
                  <button
                    onClick={() => {
                      setAxis(undefined);
                      constraintRef.current = undefined;
                      setPenConstraint(undefined);
                      setEpoch((e) => e + 1);
                    }}
                    aria-label="Vapauta suuntalukko"
                  >
                    {axis ? `${axis.toUpperCase()}-akseli` : 'Suunta lukittu'} · Vapauta{' '}
                    <X size={14} />
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
            {numericInput}
            {tool === 'detail' ? (
              <EdgeDetailPanel
                operation={detailOperation}
                onOperation={setDetailOperation}
                count={detailTarget?.indices.length ?? 0}
                bodyName={detailSource?.name}
                busy={busy}
                loading={detailPreview.loading}
                error={detailPreview.error}
                onAccept={() => void apply()}
                onCancel={cancel}
                all={() => {
                  if (detailSource) {
                    setDetailTarget({
                      bodyId: detailSource.id,
                      indices:
                        editor.meshes
                          .find((m) => m.id === detailSource.id)
                          ?.detailEdges?.map((e) => e.index) ?? [],
                    });
                    setAwaitingStart(false);
                    gestureActive.current = true;
                  }
                }}
                clear={() => setDetailTarget((old) => (old ? { ...old, indices: [] } : undefined))}
              />
            ) : tool === 'rotate' && editing ? (
              <RotationPanel
                rotation={rotation}
                busy={busy}
                onChange={changeRotation}
                onCenter={() =>
                  rotationRef.current &&
                  changeRotation({
                    pivot: bodiesCenter(
                      project.bodies.filter((b) => rotationRef.current!.ids.includes(b.id)),
                    ),
                    picking: undefined,
                  })
                }
                onError={editor.setError}
              />
            ) : tool === 'boolean' ? (
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
                      {tool === 'offset'
                        ? 'Offset · sisennys'
                        : tool === 'rotate'
                          ? 'Kierrä kappaletta'
                          : tool === 'rectangle'
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
                  {tool === 'offset'
                    ? 'Liikuta hiirtä sisennyksen säätämiseksi tai kirjoita tarkka mitta. Klikkaus, vedon päättäminen tai Enter hyväksyy. E tekee syvennyksen tai läpireiän.'
                    : tool === 'rectangle'
                      ? 'Mitat millimetreinä. Voit kirjoittaa myös esimerkiksi 2,4 m.'
                      : tool === 'circle'
                        ? 'Aseta keskipiste ja vedä muoto. Tarkat halkaisijat voit kirjoittaa.'
                        : tool === 'extrude'
                          ? 'E · Vedä pintaa vapaasti. Pidä Shift pohjassa ja osoita tavoitepintaa: sininen korostus näyttää kohteen. Vapauta Shift jatkaaksesi vapaata vetoa samasta mitasta. Voit myös kirjoittaa mitan.'
                          : tool === 'pen'
                            ? 'Aseta verteksit. Shift lukitsee suunnan; napsauta toista pistettä poimiaksesi pituuden. Sulje tasomainen muoto ensimmäiseen pisteeseen.'
                            : tool === 'measure'
                              ? measureMode === 'guide'
                                ? 'Aloita verteksistä tai vedä reunasta sen suuntainen apuviiva. Piirtäminen ja siirtäminen tarttuvat viivaan.'
                                : 'Valitse kaksi pistettä nähdäksesi niiden etäisyyden.'
                              : 'Anna siirtymä nykyisestä sijainnista tai vedä kappaletta näkymässä.'}
                </p>
                <div className="tool-fields">
                  {tool === 'offset' && offsetPreview.error && (
                    <p role="status" className="muted">
                      {offsetPreview.error}
                    </p>
                  )}
                  {tool === 'move' && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        aria-label="Siirrä kopio"
                        checked={copyMove}
                        onChange={(e) => changeCopyMove(e.target.checked)}
                      />
                      Siirrä kopio · Ctrl vedon aikana
                    </label>
                  )}
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
                      constructionLine={constructionLine}
                      onPurpose={setShapePurpose}
                      name={shapeName}
                      onName={setShapeName}
                      surfaceMode={surfaceMode}
                      onSurfaceMode={setSurfaceMode}
                      editingBodyName={editingBody?.name}
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
                      <div className="extrusion-readout" data-testid="extrusion-readout">
                        {faceSpan ? (
                          <>
                            <span>
                              Nykyinen mitta <strong>{formatLength(faceSpan.depth)} mm</strong>
                            </span>
                            <span>
                              Toteutuva kokonaismitta <strong>{formatLength(finalSize!)} mm</strong>
                            </span>
                            <span>
                              Siirtymä{' '}
                              <strong>
                                {faceDistance > 0 ? '+' : ''}
                                {formatLength(faceDistance)} mm
                              </strong>
                            </span>
                          </>
                        ) : (
                          <span>{spanLoading ? 'Mitataan vastapintaa…' : spanError}</span>
                        )}
                      </div>
                      <p className="muted">
                        Tab vaihtaa siirtymän ja toteutuvan kokonaismitan välillä ja säilyttää
                        kirjoittamasi luvun. Miinus työntää sisään, plus vetää ulos. Ilman
                        etumerkkiä luku seuraa vedon suuntaa.
                      </p>
                      <p className="muted">
                        Vihreä mittaviiva näyttää toteutuvan kokonaismitan tässä kohdassa,
                        kohtisuoraan valittua pintaa vastaan. Nolla avaa rajatun alueen läpi. Voit
                        myös vetää pinnan vastapinnan ohi tai valita Leikkaa läpi.
                      </p>
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
                          extrusionModeRef.current = 'height';
                          setExtrusionMode('height');
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
                        X/Y/Z lukitsee siirtosuunnan; sama näppäin vapauttaa. Esc päättää työkalun.
                        Shift+R käynnistää vapaan kierron; osoita suunta ja hyväksy.
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
                            onClick={() => {
                              setAxis(axis === a ? undefined : a);
                              setFreeRotate(false);
                            }}
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
                    <h2>{selectedGroup?.name ?? body?.name ?? 'Kokonaisuus'}</h2>
                  </div>
                  <Box size={21} />
                </div>
                {body && !selectedGroup ? (
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
                    <button
                      className="button outlined full"
                      disabled={
                        busy ||
                        !project.bodies.some(
                          (b) =>
                            (selectedIds.length ? selectedIds.includes(b.id) : b.id === body.id) &&
                            b.purpose !== 'construction',
                        )
                      }
                      onClick={() => void dimensionSelection()}
                    >
                      <Ruler size={16} /> Lisää kokonaismitat
                    </button>
                    {objectActions}
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
                    {selectedGroup
                      ? 'Ryhmän valintaa voi rajata napsauttamalla osia.'
                      : project.bodies.length
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

                {selectedGroup && mode === 'model' && (
                  <GroupActions
                    group={selectedGroup}
                    groups={project.groups}
                    count={selectedIds.length}
                    total={groupBodies(project, selectedGroup.id).length}
                    busy={busy}
                    onChange={(patch) => void patchGroup(selectedGroup.id, patch)}
                    onMove={() => begin('move')}
                    onCopy={copyBody}
                    onFit={fit}
                    onSubgroup={() => void createGroup(selectedGroup.id)}
                  />
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
                    objectTree
                  ) : tab === 'guides' ? (
                    <div className="guide-list">
                      {project.guides.map((g) => {
                        const points = guideMeasurement(project.bodies, g);
                        return (
                          <div
                            key={g.id}
                            className={
                              !points ? 'broken' : selectedGuideId === g.id ? 'selected' : ''
                            }
                          >
                            <button onClick={() => selectGuide(g.id)}>
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
                  <span>v0.8.1</span>
                </div>
              </>
            )}
            {(editing || tool === 'boolean') && objectActions}
            {(editing || tool === 'boolean') && objectTree}
          </aside>
        )}
      </div>

      {renderOpen && (
        <RenderStage
          bodies={renderBodies}
          meshes={visibleMeshes}
          selectedIds={selectedIds}
          settings={project.settings.render ?? renderDefaults}
          name={project.name}
          busy={busy}
          error={editor.error}
          onClose={closeRender}
          onMaterial={(ids, material) =>
            void editor.transact(
              {
                ...project,
                bodies: project.bodies.map((b) => (ids.includes(b.id) ? { ...b, material } : b)),
              },
              'Materiaali päivitetty.',
            )
          }
          onColor={(ids, color) =>
            void editor.transact(
              {
                ...project,
                bodies: project.bodies.map((b) => (ids.includes(b.id) ? { ...b, color } : b)),
              },
              'Osaväri päivitetty.',
            )
          }
          onSettings={(render) =>
            editor.transact(
              { ...project, settings: { ...project.settings, render } },
              'Renderöinnin asetukset tallennettu.',
            )
          }
        />
      )}
      <footer className="status-bar">
        <div>
          <span className="status-icon">
            {busy ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />}
          </span>
          <span role="status">
            {renderOpen
              ? 'Renderöinti · materiaalit ja valo · Esc palaa malliin'
              : editing || tool === 'navigate' || tool === 'boolean'
                ? instructions[tool]
                : editor.message}
          </span>
        </div>
        <span className="status-right">
          {renderOpen ? 'Esityskuva' : mode === 'model' ? 'Z ylöspäin' : 'A4 · Ortografinen'}
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
                tasopinnalta käyttääksesi sitä piirtotasona. Klikkaa alkupistettä, siirrä osoitinta
                ja klikkaa loppupistettä. Muotovalikosta löytyvät myös ellipsi ja säännöllinen
                monikulmio. Myös veto tai Enter hyväksyy.
              </li>
              <li>
                <strong>Muotoile.</strong> Paina E, osoita pintaa ja vedä. Positiivinen siirtymä
                vetää pintaa ulos ja negatiivinen työntää sisään. Leikkaa läpi tekee aukon, ja Poimi
                syvyys pinnasta määrää syvyyden toisesta pinnasta.
              </li>
              <li>
                <strong>Mitoita.</strong> Valitse osa ja paina Lisää kokonaismitat. Avaa Mittakuva
                ja vie SVG.
              </li>
            </ol>
            <p>
              <strong>Uusi osa vai pinnan muokkaus:</strong> normaalisti piirto tekee uuden osan,
              myös toisen kappaleen pinnalle. Valitse-työkalulla (V) tuplaklikkaa osaa tai valitse
              Muokkaa osaa: Muokkaustila-palkki kertoo kohteen, muut osat himmenevät viitteiksi ja
              piirto jakaa vain avattua osaa. Lopeta muokkaus sulkee muokkaustilan. Myös
              Valitse-työkalun tuplaklikkaus tyhjään tilaan sulkee sen; yksittäinen napsautus tai
              kameran liikuttaminen ei poistu muokkaustilasta. Esc peruu ensin keskeneräisen
              toiminnon, seuraava Esc sulkee muokkaustilan. E/O toimii suoraan myös normaalitilassa.
            </p>
            <p>
              <strong>Poista rajaus (U):</strong> osoita samantasoisten pintojen jakoviivaa ja
              klikkaa. Korostetut alueet yhdistyvät yhdeksi pinnaksi, myös vanhassa tallennetussa
              mallissa. Kulmia, syvennyksiä ja aukkoja ei poisteta. Peru palauttaa rajauksen.
            </p>
            <p>
              <strong>Historia:</strong> selaintallennus säilyttää viimeisimmät
              Peru/Palauta-askeleet sivun päivityksen yli, enintään 20 askelta yhteensä ja 8 Mt.
              Projektitiedosto sisältää nykyisen mallin; muokkaustila avataan aina erikseen.
            </p>
            <p>
              <strong>Tarkat mitat:</strong> aloita kirjoittamalla numero. Tab siirtyy seuraavaan
              kenttään. Kirjoitettu mitta säilyy hiiren liikkuessa.
            </p>
            <p>
              <strong>Push/pullin toteutuva kokonaismitta:</strong> siirtymä −150 lyhentää osaa 150
              mm. Tab siirtää saman luvun Toteutuva kokonaismitta -kenttään: osan mitaksi jää 150
              mm. Voit myös napsauttaa kenttää ja kirjoittaa esimerkiksi 550. Vihreä mittaviiva
              näyttää mitan vastapinnasta valitussa kohdassa. Ilman etumerkkiä siirtymä seuraa vedon
              suuntaa; + vetää ulos ja − työntää sisään. Toteutuva kokonaismitta 0 avaa rajatun
              alueen vastapinnan läpi.
            </p>
            <p>
              <strong>Pintaan kohdistus:</strong> E → klikkaa lähtöpintaa → pidä Shift pohjassa ja
              osoita tavoitepintaa → klikkaa hyväksyäksesi. Myös vedon vapautus Shift pohjassa
              tavoitepinnan päällä hyväksyy. Ilman Shiftiä veto on vapaa. Lähtöpinta ei kelpaa
              tavoitteeksi. Shiftin vapautus jatkaa saavutetusta mitasta ilman hyppyä. Kosketuksella
              käytä Poimi syvyys pinnasta -painiketta. Sininen korostus ja vihjeteksti näyttävät
              kohteen. Yhdensuuntaiset tasopinnat osuvat samalle tasolle; vinosta tasopinnasta
              poimitaan osoitetun pisteen taso lähdepinnan normaalin suunnassa. Kirjoitettu mitta
              ohittaa tartunnan. Esc peruu.
            </p>
            <p>
              <strong>Mitat ja värit:</strong> valitse osa tai useita osia ja paina Lisää
              kokonaismitat. Mallin X/Y/Z-suuntaiset ulkomitat näkyvät 3D-näkymässä ja Mittakuvassa
              sekä SVG-viennissä. Ne seuraavat osan muutoksia. Mitat-listasta voit poistaa
              yksittäisen mitan, ja asetuksista valita 3D-mittojen näkyvyyden. Väripaletti vaihtaa
              valittujen osien värin; oman värin hyväksyt valitsimen vieressä olevasta painikkeesta.
            </p>
            <p>
              <strong>Offset (O):</strong> osoita vapaata pintaa ja paina O tai valitse työkalu ja
              vedä pinnasta. Liikuta hiirtä tai syötä esimerkiksi 18 mm. Sininen viiva näyttää
              sisennyksen. Klikkaus, vedon vapautus tai Enter hyväksyy. E työntää uutta aluetta
              sisään. Toteutuva kokonaismitta 18 jättää 18 mm takaseinän; Leikkaa läpi tekee aukon.
            </p>
            <p>
              <strong>Valitse ja kopioi:</strong> yksi klikkaus valitsee koko kappaleen. M siirtää
              tartuntapisteestä. Pidä Ctrl (tai Alt) pohjassa vedon aikana ja vapauta hiiri: kopio
              asettuu uuteen paikkaan ja alkuperäinen jää paikalleen. Voit myös valita Siirrä kopio
              ja kirjoittaa siirtymän. Esc peruu keskeneräisen siirron.
            </p>
            <p>
              <strong>Koko näyttö:</strong> yläpalkin Siirry koko näyttöön -painike piilottaa
              selaimen palkit. Palaa samalla painikkeella tai Escillä. Kapeassa ikkunassa tiedostot,
              historia ja asetukset löytyvät Lisää toimintoja -painikkeesta.
            </p>
            <p>
              <strong>Kierrä (R):</strong> valitse kappale ja poimi kiertopiste tai reuna. Vedä
              rengasta tai kirjoita kulma. X/Y/Z vaihtaa akselin ja Shift porrastaa 15°.
              Suorakulmion pikanäppäin on S. G kiinnittää tai vapauttaa kappaleen. Sivupaneelista
              voit siirtää valinnan origoon, nimetä, piilottaa ja ryhmitellä osia.
            </p>
            <p>
              <strong>Apuviivat:</strong> mittatyökalun ensimmäinen painallus valitsee apuviivan,
              toinen avaa tilavalinnan. Reunasta vedetty viiva pysyy reunan suuntaisena. R kiertää
              45°, Shift+R sallii vapaan kierron. X/Y/Z lukitsee akselin ja sama näppäin vapauttaa.
              Esc päättää työkalun. Voit myös kirjoittaa asteluvun. X-ray valitaan Viivat-listasta
              tai kaikille asetuksista.
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
              tasomainen. Push/pull ja Offset tukevat tasopintoja. Linkitetyt komponentit ja
              materiaalit tulevat myöhemmin.
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
