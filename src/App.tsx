import { applySplitResult } from './model/splitReferences';
import { colorPreviewTargets, type ColorPreview } from './model/colorPreview';
import { linkSplitCopies } from './model/linkedSplit';
import { displayLabels, displayModes, setModelDisplay, type DisplayMode } from './model/display';
import { DisplayControls } from './ui/DisplayControls';
import { selectionDescription } from './model/activity';
import { bezierInstruction } from './model/bezier';
import { ThroughShapesPanel } from './ui/ThroughShapesPanel';
import { CurvePointsPanel } from './ui/CurvePointsPanel';
import { upsertGuide } from './model/guideMerge';
import { GuidePointMenu } from './ui/GuidePointMenu';
import { guideEndAnchor, moveGuideEndpoint, type GuideEndpoint } from './model/guideEditing';
import { SheetWorkspace } from './drawing/SheetWorkspace';
import { SelectionDialog } from './ui/SelectionDialog';
import { SectionDrawing } from './drawing/SectionDrawing';
import { ActivityHistory } from './ui/ActivityHistory';
import { useActivityHistory } from './ui/useActivityHistory';
import type { Activity, OperationContext, SelectionContext } from './model/activity';
import { useWorkspaceViews } from './ui/WorkspaceViews';
import { ModelMaterials, type MaterialChange } from './ui/MaterialSurface';
import { isPointDimension, dimensionEnvelope, type PointDimension } from './model/project';
import { PaintPanel } from './ui/PaintPanel';
import { TexturePanel } from './ui/TexturePanel';
import {
  hasTexture,
  placeMaterial,
  varyTextures,
  type TextureVariation,
} from './model/textureVariation';
import { ContextActions, type QuickAction } from './ui/ContextActions';
import { CommandSearch } from './ui/CommandSearch';
import type { Command } from './ui/commands';
import { ToolContext } from './ui/ToolContext';
import { RepeatAction } from './ui/RepeatAction';
import { repeatTranslation } from './model/repeat';
import { OverlapPicker, type PickCandidate } from './ui/OverlapPicker';
import { defaultAppearance, type TexturePlacement } from './model/materials';
import { CabinetBuilder } from './ui/CabinetBuilder';
import { insertCabinet } from './model/cabinet';
import { useRenderJob } from './render/useRenderJob';
import { RenderJobCard } from './ui/RenderJobCard';
import { dimensionBodyIds } from './model/dimensions';
import { flushSync } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ScanLine,
  ImagePlus,
  Focus,
  ArrowDownToLine,
  Eraser,
  Paintbrush,
  ArrowLeftRight,
  ArrowUpFromLine,
  Box,
  Check,
  CircleHelp,
  Camera,
  Circle,
  Scissors,
  Slice,
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Hand,
  Layers2,
  Link2,
  LockKeyhole,
  Maximize,
  Minimize,
  MoreHorizontal,
  Settings2,
  Search,
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
  groupContains,
  groupBodies,
  groupPath,
  reparentGroup,
  dissolveGroup,
  translateSelection,
  moveInTree,
  type TreeMove,
} from './model/groups';
import { useEdgeDetailPreview } from './ui/useEdgeDetailPreview';
import { EdgeDetailPanel } from './ui/EdgeDetailPanel';
import type { EdgeDetailTarget, SplitResult } from './cad/protocol';
import { GroupActions } from './ui/GroupActions';
import { Viewport, type CameraCommand, type Tool } from './viewport/Viewport';
import { RenderStage } from './render/RenderStage';
import { renderDefaults } from './render/scene';
import { DrawingWorkspace } from './drawing/DrawingWorkspace';
import { ToolRail } from './ui/ToolRail';
import { ModelBrowser } from './ui/ModelBrowser';
import { InlineName } from './ui/InlineName';
import type { ToolDock } from './ui/ToolRail';
import { removeSelection, selectionUnit, inAssembly } from './model/selection';
import { asComponent, uniqueComponents } from './model/components';
import { PartsWorkspace } from './ui/PartsWorkspace';
import { useEditor } from './useEditor';
import {
  bounds,
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
import type { FaceTarget, FaceSpan } from './cad/protocol';
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
import { penTravelDirection, penPointAtLength } from './model/penInput';
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
  guidePlaneNormal,
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
  { id: 'knife', label: 'Veitsi', icon: <Slice />, shortcut: 'N' },
  { id: 'paint', label: 'Maalipensseli', icon: <Paintbrush />, shortcut: 'P' },
  { id: 'select', label: 'Valitse', icon: <MousePointer2 />, shortcut: 'V' },
  { id: 'rectangle', label: 'Suorakulmio', icon: <Square />, shortcut: 'S' },
  { id: 'circle', label: 'Ympyrä', icon: <Circle />, shortcut: 'C' },
  { id: 'rotate', label: 'Kierrä', icon: <RotateCw />, shortcut: 'R' },
  { id: 'detail', label: 'Reunat', icon: <SquareDashed />, shortcut: 'F' },
  { id: 'offset', label: 'Offset', icon: <SquareDashed />, shortcut: 'O' },
  {
    id: 'extrude',
    label: 'Push / pull',
    icon: <ArrowUpFromLine />,
    shortcut: 'E',
  },
  { id: 'move', label: 'Siirrä', icon: <Move3D />, shortcut: 'M' },
  { id: 'pen', label: 'Kynä', icon: <Pencil />, shortcut: 'K' },
  { id: 'erase', label: 'Kumita', icon: <Eraser />, shortcut: 'U' },
  { id: 'boolean', label: 'Muotoile', icon: <Scissors />, shortcut: 'B' },
  { id: 'measure', label: 'Mittatyökalu', icon: <Ruler />, shortcut: 'T' },
  { id: 'navigate', label: 'Navigoi', icon: <Hand />, shortcut: 'H' },
];
const toolOrder: Tool[] = [
  'select',
  'extrude',
  'pen',
  'erase',
  'move',
  'rotate',
  'offset',
  'detail',
  'paint',
  'boolean',
  'knife',
  'measure',
  'navigate',
  'rectangle',
  'circle',
];
tools.sort((a, b) => toolOrder.indexOf(a.id) - toolOrder.indexOf(b.id));
const instructions: Record<Tool, string> = {
  knife:
    'Piirrä leikkaus nykyisestä näkymästä. Molemmat puolet säilyvät. Esc peruu reitin; seuraava Esc päättää työkalun.',
  paint:
    'P · Valitse materiaali ja napsauta osia maalataksesi. Kohdevalinta kertoo, maalataanko koko valinta. Esc päättää.',
  detail:
    'F · Napsauta reunat tai vedä reunasta säätääksesi kokoa. Kirjoita tarkka mitta. Vapautus tai Enter hyväksyy, Esc peruu.',
  erase:
    'U · Osoita pintojen välistä jakoviivaa. Korostetut tasopinnat yhdistyvät klikkauksella. Kulmat ja aukot säilyvät.',
  rotate:
    'R · Poimi kiertopiste tai reuna. Vedä rengasta tai anna kulma. X/Y/Z valitsee akselin; veto tarttuu 5° välein. Shift kiertää vapaasti. Esc peruu toiminnon; seuraava Esc päättää työkalun.',
  offset:
    'O · Osoita pintaa ja liikuta hiirtä tai vedä pinnasta. Kirjoita tarkka mitta. Klikkaus, vapautus tai Enter hyväksyy. Esc peruu.',
  select:
    'Klikkaus valitsee osan. Veto vasemmalta oikealle valitsee kokonaan sisällä olevat osat, oikealta vasemmalle kaikki alueeseen osuvat. Shift lisää valintaan. M siirtää; tuplaklikkaus avaa osan.',
  rectangle:
    'Klikkaa alkukulmaa, siirrä osoitinta ja klikkaa vastakulmaa. X/Y/Z vaihtaa piirtotasoa. Myös veto tai numerosarja → Tab toimii. Enter hyväksyy.',
  circle:
    'C · Klikkaa keskipistettä ja sitten reunaa tai vedä säde. Kirjoita halkaisija, Tab vaihtaa kenttää. Enter hyväksyy.',
  boolean: 'Valitse kohteet ja työstökappaleet. Vaihda keskenään kääntää leikkauksen suunnan.',
  extrude:
    'E · Shift poimii tavoitemitan pisteestä, reunasta, apuviivasta tai pinnasta. Kirjoitettu mitta ohittaa tartunnan. Enter tai klikkaus hyväksyy.',
  move: 'Korostus näyttää siirrettävät osat. Vedä valitusta osasta; Shift-klikkaus muuttaa valintaa. Tyhjästä veto valitsee laatikolla. X/Y/Z lukitsee akselin, Ctrl vaihtaa kopioinnin.',
  pen: 'Osoita suunta ja kirjoita viivan pituus. + jatkaa osoitettuun suuntaan, − vastakkaiseen. Enter lisää pisteen. Tab vie X/Y/Z-siirtymiin. Shift lukitsee suunnan ja poimii viitepituuden.',
  measure:
    'Vedä verteksistä tai reunasta. X/Y/Z lukitsee siirtosuunnan. Esc peruu toiminnon; seuraava Esc päättää työkalun. R aloittaa hiirellä kierron 22,5° välein, Shift+R vapaasti.',
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
  const liveProject = useRef({ project, busy });
  liveProject.current = { project, busy };
  const [selected, setSelected] = useState<string>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveHovered, setMoveHovered] = useState<string>();
  const [selectionHovered, setSelectionHovered] = useState<string>();
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [isolated, setIsolated] = useState<{ projectId: string; excluded: Set<string> }>();
  const [drawingSheetOpen, setDrawingSheetOpen] = useState(false);
  const [drawingSectionId, setDrawingSectionId] = useState<string>();
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const [measureMode, setMeasureMode] = useState<'guide' | 'free' | 'dimension'>('guide');
  const [measureStart, setMeasureStart] = useState<Pick<Guide, 'anchor' | 'plane'>>();
  const [dimensionDraft, setDimensionDraft] = useState<PointDimension>();
  const [measureMenu, setMeasureMenu] = useState(false);
  const [guidePointEdit, setGuidePointEdit] = useState<GuideEndpoint>();
  const [guidePointMenu, setGuidePointMenu] = useState<{
    x: number;
    y: number;
    targets: GuideEndpoint[];
  }>();
  const [reference, setReference] = useState<ReferencePoint>();
  const [pickReference, setPickReference] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [rotationDraft, setRotationDraft] = useState<Omit<Rotation, 'angle'>>();
  const rotationRef = useRef<Omit<Rotation, 'angle'> | undefined>(undefined);
  const [popup, setPopup] = useState<[number, number]>();
  const [knifeMode, setKnifeMode] = useState<'line' | 'polyline' | 'curve' | 'free'>('line');
  const [knifeUnique, setKnifeUnique] = useState(false);
  const [knifeCommand, setKnifeCommand] = useState<{ id: number; action: 'finish' | 'clear' }>();
  const [penMode, setPenMode] = useState<'line' | 'bezier'>('line');
  const [bezierStyle, setBezierStyle] = useState<'smooth' | 'bezier'>('smooth');
  const [loftOpen, setLoftOpen] = useState(false);
  const [loftIds, setLoftIds] = useState<string[]>([]);
  const [loftPreview, setLoftPreview] = useState<import('./cad/protocol').EdgeDetailResult>();
  const [penPoints, setPenPoints] = useState<Vec3[]>([]);
  const penRef = useRef<Vec3[]>([]);
  const penSplitRequest = useRef(0);
  const [penHover, setPenHover] = useState<Vec3>();
  const [penConstraint, setPenConstraint] = useState<Vec3>();
  const constraintRef = useRef<Vec3 | undefined>(undefined);
  const penPointerRef = useRef<Vec3 | undefined>(undefined);
  const penDirectionRef = useRef<Vec3 | undefined>(undefined);
  const penLengthDirectionRef = useRef<Vec3 | undefined>(undefined);
  const [penInputAxis, setPenInputAxis] = useState<Axis>('x');
  const [constraintReset, setConstraintReset] = useState(0);
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
  const [selectedGuideIds, setSelectedGuideIds] = useState<string[]>([]);
  const selectedGuideId = selectedGuideIds.length === 1 ? selectedGuideIds[0] : undefined;
  const setSelectedGuideId = (id?: string) => setSelectedGuideIds(id ? [id] : []);
  const selectedGuideSet = useMemo(() => new Set(selectedGuideIds), [selectedGuideIds]);
  const [freeRotate, setFreeRotate] = useState(false);
  const [guideRotationStep, setGuideRotationStep] = useState(22.5);
  const [shapeFrame, setShapeFrame] = useState<SketchFrame>();
  const shapeFrameRef = useRef<SketchFrame | undefined>(undefined);
  const [sketchTarget, setSketchTarget] = useState<FaceTarget>();
  const sketchTargetRef = useRef<FaceTarget | undefined>(undefined);
  const [detailTarget, setDetailTarget] = useState<EdgeDetailTarget>();
  const detailDragBefore = useRef<
    | {
        target?: EdgeDetailTarget;
        size: string;
        locked: boolean;
        selected?: string;
        selectedIds: string[];
        awaiting: boolean;
      }
    | undefined
  >(undefined);
  const [detailOperation, setDetailOperation] = useState<'fillet' | 'chamfer'>('fillet');
  const [surfaceMode, setSurfaceMode] = useState<'new' | 'region'>('new');
  const [editingBodyId, setEditingBodyId] = useState<string>();
  const [editNotice, setEditNotice] = useState<{ x?: number; y?: number }>();
  const gestureActive = useRef(false);
  const [shapeKind, setShapeKind] = useState<'circle' | 'ellipse' | 'polygon' | 'sphere'>('circle');
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
  const [moveInputAxis, setMoveInputAxis] = useState<Axis>();
  const [repeatStep, setRepeatStep] = useState<{
    revision: number;
    ids: string[];
    groupId?: string;
    offset: Vec3;
    copy: boolean;
  }>();
  const [repeatCount, setRepeatCount] = useState('1');
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
  const [partsOpen, setPartsOpen] = useState(false);
  const [groupMove, setGroupMove] = useState<TreeMove>();
  const [groupDestination, setGroupDestination] = useState('');
  const [openingDraft, setOpeningDraft] = useState<{
    profile: Body;
    bodies: Body[];
    affected: string[];
    included: string[];
    revision: number;
    keep: boolean;
    unique?: boolean;
  }>();
  const [openingBusy, setOpeningBusy] = useState(false);
  const [surfaceSplitDraft, setSurfaceSplitDraft] = useState<{
    profile: Body;
    results: SplitResult[];
    included: string[];
    revision: number;
    unique?: boolean;
  }>();
  const openingRequest = useRef(0);
  const [actionMenu, setActionMenu] = useState<{
    x: number;
    y: number;
    candidates?: PickCandidate[];
  }>();
  const [commandOpen, setCommandOpen] = useState(false);
  const [pickOthers, setPickOthers] = useState(false);
  const [pickList, setPickList] = useState<{ x: number; y: number; candidates: PickCandidate[] }>();
  const [pickHovered, setPickHovered] = useState<string>();
  const [brush, setBrush] = useState({
    appearance: defaultAppearance('paint-solid'),
    color: '#ffffff',
  });
  const [paintAll, setPaintAll] = useState(true);
  const [paintLinked, setPaintLinked] = useState(true);
  const [paintMode, setPaintMode] = useState<'paint' | 'texture'>('paint');
  const [textureDraft, setTextureDraft] = useState<{ id: string; texture: TexturePlacement }>();
  const textureDraftRef = useRef<typeof textureDraft>(undefined);
  const [openedAssembly, setOpenedAssembly] = useState<string>();
  const [mode, setMode] = useState<'model' | 'drawing'>('model');
  const colorContext = `${selectedIds.join(',')}:${selected}:${tool}:${mode}:${renderOpen}:${editingBodyId}:${openedAssembly}`;
  const [colorDraft, setColorDraft] = useState<{
    value: ColorPreview;
    project: typeof project;
    context: string;
  }>();
  const colorPreview =
    colorDraft?.project === project && colorDraft.context === colorContext
      ? colorDraft.value
      : undefined;
  useEffect(() => {
    setColorDraft((draft) =>
      draft && (draft.project !== project || draft.context !== colorContext) ? undefined : draft,
    );
  }, [project, colorContext]);
  const previewColor = (ids: string[], color?: string) => {
    setColorDraft(
      color
        ? {
            value: { ids: colorPreviewTargets(project.bodies, project.groups, ids), color },
            project,
            context: colorContext,
          }
        : undefined,
    );
  };
  const actionContext: SelectionContext = {
    ids: loftOpen ? loftIds : selectedIds,
    guideIds: loftOpen ? [] : selectedGuideIds,
    primary: loftOpen ? loftIds[0] : selected,
    groupId: loftOpen ? undefined : selectedGroupId,
    editingBodyId,
    openedAssembly,
  };
  editor.setActionContext(actionContext);
  const activityHistory = useActivityHistory(project.id, ready, editor.activity);
  useEffect(() => setMoveHovered(undefined), [tool, selectedIds]);
  const [dock, setDock] = useState<ToolDock>(() => {
    const saved = localStorage.getItem('nivo-tool-dock');
    return ['left', 'right', 'top', 'bottom'].includes(saved ?? '') ? (saved as ToolDock) : 'left';
  });
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const renderJob = useRenderJob();
  const changeDisplay = (value: DisplayMode) => {
    if (busy) return;
    const next = setModelDisplay(project, value, selectedIds);
    if (next !== project)
      void editor.transact(
        next,
        `${displayLabels[value]} · ${selectedIds.length ? `${selectedIds.length} valittua osaa` : 'koko näkymä'}.`,
      );
  };
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
  useEffect(() => {
    setSnapLabel(gridSnap ? `Ruudukko · ${project.settings.gridStep ?? 10} mm` : 'Vapaa tartunta');
  }, [gridSnap, project.settings.gridStep]);
  const [projection, setProjection] = useState<'perspective' | 'orthographic'>('perspective');
  const [view, setView] = useState<View>();
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>();
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
  const inspectorDetails = useRef<HTMLDivElement>(null);
  const body = project.bodies.find((b) => b.id === selected);
  const selectedGroup = project.groups.find((g) => g.id === selectedGroupId);
  const editingBody = project.bodies.find((b) => b.id === editingBodyId);
  const selectionBox = useMemo(
    () => bounds(project.bodies.filter((b) => selectedIdSet.has(b.id))),
    [project.bodies, selectedIds],
  );
  const scopeIds = useMemo(
    () => (openedAssembly ? groupBodies(project, openedAssembly).map((b) => b.id) : undefined),
    [project.bodies, project.groups, openedAssembly],
  );
  const selectionSize = selectionBox.max.map((n, i) => n - selectionBox.min[i]);
  const selectedGuide = project.guides.find((g) => g.id === selectedGuideId);
  const [awaitingStart, setAwaitingStart] = useState(false);
  const visibleBodies = useMemo(
    () =>
      project.bodies
        .filter(
          (b) =>
            bodyVisible(b, project.groups) &&
            (isolated?.projectId !== project.id || !isolated.excluded.has(b.id)),
        )
        .map((b) => ({
          ...b,
          locked: bodyLocked(b, project.groups) || !inAssembly(project, b.id, openedAssembly),
        })),
    [project.bodies, project.groups, openedAssembly, isolated, project.id],
  );
  const textureBody =
    tool === 'paint' && paintMode === 'texture' && !renderOpen
      ? visibleBodies.find(
          (b) =>
            b.id === selected &&
            !b.locked &&
            hasTexture(b) &&
            (!editingBodyId || b.id === editingBodyId),
        )
      : undefined;
  const activeTexture = textureBody
    ? {
        id: textureBody.id,
        texture:
          textureDraft?.id === textureBody.id
            ? textureDraft.texture
            : (textureBody.appearance ?? defaultAppearance(textureBody.material)).texture,
      }
    : undefined;
  useEffect(() => {
    textureDraftRef.current = undefined;
    setTextureDraft(undefined);
  }, [project, selected, paintMode, tool, renderOpen]);
  const previewTexture = (texture: TexturePlacement) => {
    if (!textureBody || busy) return;
    const draft = { id: textureBody.id, texture };
    textureDraftRef.current = draft;
    setTextureDraft(draft);
  };
  const commitTexture = () => {
    const draft = textureDraftRef.current;
    if (!draft || busy || !textureBody || textureBody.id !== draft.id) return;
    textureDraftRef.current = undefined;
    const appearance = textureBody.appearance ?? defaultAppearance(textureBody.material);
    if (JSON.stringify(appearance.texture) === JSON.stringify(draft.texture)) return;
    void editor.transact(
      {
        ...project,
        bodies: project.bodies.map((b) =>
          b.id === draft.id
            ? { ...b, localTexture: true, appearance: { ...appearance, texture: draft.texture } }
            : b,
        ),
      },
      `Tekstuurin sijoittelu · ${textureBody.name}.`,
    );
  };
  const textureSelection = project.bodies.filter((b) => selectedIdSet.has(b.id) && hasTexture(b));
  const textureSelectionBlocked = textureSelection.some(
    (b) =>
      bodyLocked(b, project.groups) ||
      !inAssembly(project, b.id, openedAssembly) ||
      (!!editingBodyId && b.id !== editingBodyId),
  );
  const varySelectedTextures = (options: TextureVariation) => {
    if (busy || textureSelectionBlocked) return;
    try {
      const next = varyTextures(
        project,
        selectedIds,
        options,
        crypto.getRandomValues(new Uint32Array(1))[0],
        editor.meshes,
      );
      void editor.transact(next, `Tekstuurien vaihtelu · ${textureSelection.length} osaa.`);
    } catch (error) {
      editor.setError((error as Error).message);
    }
  };
  const visibleDimensions = useMemo(() => {
    if (project.settings.measurementsHidden) return [];
    const ids = new Set(visibleBodies.map((body) => body.id));
    return project.dimensions.filter((d) =>
      dimensionBodyIds(d, project).every((id) => ids.has(id)),
    );
  }, [project.dimensions, visibleBodies, project.settings.measurementsHidden]);
  const visibleGuides = useMemo(
    () => (project.settings.measurementsHidden ? [] : project.guides),
    [project.guides, project.settings.measurementsHidden],
  );
  const toggleMeasurements = async () => {
    const measurementsHidden = !project.settings.measurementsHidden;
    if (
      await editor.transact(
        { ...project, settings: { ...project.settings, measurementsHidden } },
        measurementsHidden
          ? 'Kaikki mittaviivat ja apuviivat piilotettu.'
          : 'Mittaviivat ja apuviivat näkyvät.',
      )
    ) {
      setSelectedGuideId(undefined);
      setSelectedGuideIds([]);
      setGuidePointMenu(undefined);
    }
  };
  const renderBodies = useMemo(() => {
    const visible = new Set(visibleBodies.map((b) => b.id));
    return project.bodies
      .filter((b) => visible.has(b.id) && (b.purpose === 'model' || b.purpose === 'component'))
      .map((b) => ({ ...b, locked: bodyLocked(b, project.groups) }));
  }, [visibleBodies, project.bodies, project.groups]);
  const visibleMeshes = useMemo(() => {
    const ids = new Set(visibleBodies.map((body) => body.id));
    return editor.meshes.filter((mesh) => ids.has(mesh.id));
  }, [editor.meshes, visibleBodies]);
  useLayoutEffect(() => {
    const toolbar = document.querySelector<HTMLElement>('.canvas-topbar');
    const host = toolbar?.closest<HTMLElement>('.canvas-area');
    if (!toolbar || !host) return;
    const positionOverlays = () =>
      host.style.setProperty(
        '--view-toolbar-bottom',
        `${toolbar.offsetTop + toolbar.offsetHeight}px`,
      );
    positionOverlays();
    const observer = new ResizeObserver(positionOverlays);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [mode, editingBodyId, openedAssembly]);
  const moveHoveredIds = useMemo(() => {
    if (tool !== 'move' || !moveHovered) return [];
    const target = visibleBodies.find((b) => b.id === moveHovered);
    if (!target || target.locked) return [];
    return selectedIds.length
      ? selectedIdSet.has(moveHovered)
        ? selectedIds
        : []
      : selectionUnit(project, moveHovered, openedAssembly).ids;
  }, [tool, moveHovered, visibleBodies, selectedIds, project.groups, openedAssembly]);
  const selectionHoveredIds = useMemo(() => {
    if (
      tool !== 'select' ||
      !selectionHovered ||
      (editingBodyId && selectionHovered !== editingBodyId) ||
      !inAssembly(project, selectionHovered, openedAssembly)
    )
      return [];
    const visible = new Set(visibleBodies.map((b) => b.id));
    return selectionUnit(project, selectionHovered, openedAssembly).ids.filter((id) =>
      visible.has(id),
    );
  }, [tool, selectionHovered, visibleBodies, project, editingBodyId, openedAssembly]);
  const workspace = useWorkspaceViews(
    project,
    visibleBodies,
    editor.cad,
    busy,
    editor.transact,
    editor.setError,
    (command) => {
      setCameraCommand(command);
      if (command.type === 'frame') {
        setProjection('orthographic');
        const n = command.frame!.normal;
        setView(Math.abs(n[2]) > 0.9 ? 'top' : Math.abs(n[0]) > 0.9 ? 'right' : 'front');
      }
    },
    (id) => {
      setDrawingSheetOpen(false);
      setDrawingSectionId(id);
      setMode('drawing');
    },
  );
  const isolateSelection = () => {
    const ids = new Set(selectedIds);
    setIsolated({
      projectId: project.id,
      excluded: new Set(project.bodies.filter((b) => !ids.has(b.id)).map((b) => b.id)),
    });
  };
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
  useLayoutEffect(() => {
    if (inspectorDetails.current) inspectorDetails.current.scrollTop = 0;
  }, [tool, editing, selected, selectedGroupId]);
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
  const changeAppearance = (
    ids: string[],
    ...[appearance, color, asset]: Parameters<MaterialChange>
  ) => {
    // Image decoding can finish after another edit or opening a different project.
    const current = liveProject.current;
    if (
      current.busy ||
      current.project.id !== project.id ||
      !current.project.bodies.some((b) => ids.includes(b.id))
    ) {
      editor.setError(
        'Materiaalin kohde muuttui tai sitä muokataan. Valitse osa ja kokeile uudelleen.',
      );
      return Promise.resolve(false);
    }
    return editor.transact(
      {
        ...current.project,
        assets: asset
          ? { ...current.project.assets, [asset.id]: asset.asset }
          : current.project.assets,
        bodies: current.project.bodies.map((b) => {
          if (!ids.includes(b.id)) return b;
          const old = b.appearance ?? defaultAppearance(b.material);
          const textureOnly =
            color === undefined &&
            JSON.stringify({ ...old, texture: undefined }) ===
              JSON.stringify({ ...appearance, texture: undefined }) &&
            JSON.stringify(old.texture) !== JSON.stringify(appearance.texture);
          return {
            ...b,
            appearance: placeMaterial(
              b,
              appearance,
              editor.meshes.find((m) => m.id === b.id),
            ),
            color: color ?? b.color,
            localTexture: textureOnly ? true : b.localTexture,
          };
        }),
      },
      'Materiaali ja tekstuuri tallennettu.',
    );
  };
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
    // An intentional dimension edit is a numeric start; merely choosing the tool is not.
    if (awaitingStart && ['rectangle', 'circle'].includes(tool) && ['width', 'depth'].includes(key))
      setAwaitingStart(false);
    if (tool === 'detail' && key === 'offset') editor.setError('');
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
    if (tool === 'pen' && key === 'length' && !lockRef.current.has(key)) {
      penLengthDirectionRef.current = penDirectionRef.current;
      for (const axis of ['x', 'y', 'z']) lockRef.current.delete(axis);
    }
    if (tool === 'pen' && ['x', 'y', 'z'].includes(key) && lockRef.current.has('length')) {
      penPointerRef.current = hoverRef.current;
      lockRef.current.delete('length');
      penLengthDirectionRef.current = undefined;
    }
    lockRef.current.add(key);
    setLocked(new Set(lockRef.current));
    writeFields({ [key]: value });
    if (tool === 'pen') penMove(penPointerRef.current ?? penRef.current.at(-1));
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
    penPointerRef.current = undefined;
    penDirectionRef.current = undefined;
    penLengthDirectionRef.current = undefined;
    setPenInputAxis('x');
  };
  const resetGesture = () => {
    openingRequest.current++;
    setOpeningBusy(false);
    setOpeningDraft(undefined);
    setSurfaceSplitDraft(undefined);
    setGroupMove(undefined);
    setPickOthers(false);
    setPickList(undefined);
    setPickHovered(undefined);
    gestureActive.current = false;
    setDimensionDraft(undefined);
    setDetailTarget(undefined);
    detailDragBefore.current = undefined;
    copyMoveRef.current = false;
    setMoveInputAxis(undefined);
    setCopyMove(false);
    rotationRef.current = undefined;
    setRotationDraft(undefined);
    setEpoch((e) => e + 1);
    guideRef.current = undefined;
    setGuideDraft(undefined);
    setMeasureStart(undefined);
    setGuidePointEdit(undefined);
    setGuidePointMenu(undefined);
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
    editor.setMessage(
      openedAssembly && !editingBodyId
        ? 'Kokoonpano on avoinna. Sulje kokoonpano valitaksesi ulkopuolisia osia.'
        : 'Muokkaat yhtä osaa. Valitse Lopeta muokkaus, jotta voit valita muita osia.',
    );
  };
  const select = (id?: string, face?: FaceRef, additive = false, force = false) => {
    if (loftOpen && !force) {
      if (id) {
        const candidate = project.bodies.find((b) => b.id === id);
        if (candidate && !featureIsSolid(candidate.feature))
          setLoftIds((ids) =>
            ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
          );
        else editor.setMessage('Valitse viiva tai tasomuoto pintatyökalun profiiliksi.');
      }
      return;
    }
    if (id && !force && !inAssembly(project, id, openedAssembly)) {
      editor.setMessage('Sulje avoin kokoonpano valitaksesi sen ulkopuolisia osia.');
      return;
    }
    if (editingBodyId && id && id !== editingBodyId && !force) {
      explainEditContext();
      return;
    }
    if (tool === 'boolean' && !force) {
      if (id) toggleBoolean(id);
      return;
    }
    const extend =
      !force &&
      (additive || multiSelect || (!!selectedGroupId && selectedGroup?.kind !== 'assembly'));
    const unit =
      id && !force
        ? selectionUnit(project, id, openedAssembly)
        : { ids: id ? [id] : [], groupId: undefined };
    if (!extend && selectedIds.length + selectedGuideIds.length > 1)
      activityHistory.prepare(actionContext);
    const ids = id
      ? extend
        ? unit.ids.every((key) => selectedIdSet.has(key))
          ? selectedIds.filter((key) => !unit.ids.includes(key))
          : [...new Set([...selectedIds, ...unit.ids])]
        : unit.ids
      : additive
        ? selectedIds
        : [];
    setSelected(ids.includes(id!) ? id : ids[0]);
    setSelectedIds(ids);
    setSelectedGroupId(
      extend && selectedGroup && selectedGroup.kind !== 'assembly'
        ? selectedGroupId
        : !extend
          ? unit.groupId
          : undefined,
    );
    pickedFaceRef.current = id && face ? { bodyId: id, face } : undefined;
    setSelectedFace(force ? face : undefined);
    setAwaitingStart(true);
    setMeasureMenu(false);
    resetGesture();
    if (extend) setSelectedGuideIds(selectedGuideIds);
    if (tool === 'rotate' && id && !force) startRotation(ids);
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
  const openAssembly = (id: string) => {
    const group = project.groups.find((g) => g.id === id);
    if (
      busy ||
      editingBodyId ||
      !group ||
      groupAncestors(project.groups, id).some((g) => g.locked || g.hidden)
    )
      return;
    resetGesture();
    setTool('select');
    setOpenedAssembly(id);
    setSelectedGroupId(undefined);
    setSelectedIds([]);
    setSelected(undefined);
    setMultiSelect(false);
    setEditNotice(undefined);
    editor.setMessage(`Muokkaa osia: ${group.name}. Voit valita kokoonpanon osat erikseen.`);
  };
  const openBodyEdit = (id: string) => {
    if (busy) return;
    const target = project.bodies.find((b) => b.id === id);
    const unit = selectionUnit(project, id, openedAssembly);
    if (!target || bodyLocked(target, project.groups) || !bodyVisible(target, project.groups)) {
      editor.setMessage('Vapauta ja näytä osa ennen muokkaamista.');
      return;
    }
    if (unit.groupId && !editingBodyId) {
      openAssembly(unit.groupId);
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
    if (!editingBodyId && openedAssembly)
      setOpenedAssembly(
        groupAncestors(project.groups, openedAssembly)
          .slice(1)
          .find((g) => g.kind === 'assembly')?.id,
      );
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
          return {
            ...project,
            bodies: project.bodies.map((b) => (b.id === source.id ? next : b)),
          };
        }, 'Rajaus poistettu. Tasopinnat yhdistetty; kappaleen mitat ja materiaali säilyivät.')
      )
        finishOperation(source.id);
    } finally {
      committing.current = false;
    }
  };
  const fit = () => setCameraCommand({ id: performance.now(), type: 'fit' });
  const changeView = (next: View, fit = false) => {
    setView(next);
    setProjection(next === 'iso' ? 'perspective' : 'orthographic');
    setCameraCommand({ id: performance.now(), type: 'view', view: next, fit });
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
      rotationRef.current = {
        ids,
        pivot: bodiesCenter(parts),
        axis: [0, 0, 1],
      };
      setRotationDraft(rotationRef.current);
      setAwaitingStart(false);
      writeFields({ angle: '0' });
    } catch (error) {
      editor.setError((error as Error).message);
    }
  };
  const begin = (next: Tool) => {
    if (busy) return;
    setLoftOpen(false);
    setLoftPreview(undefined);
    if (next !== 'select' && next !== 'navigate') activityHistory.prepare(actionContext);
    setPartsOpen(false);
    if (editingBodyId && next === 'boolean') {
      editor.setMessage('Päätä osan muokkaus ennen usean kappaleen Cut/Join-toimintoa.');
      return;
    }
    if (next === 'measure' && tool === 'measure') return;
    resetGesture();
    setAwaitingStart(['rectangle', 'circle'].includes(next));
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
      writeFields({
        ...defaults,
        offset: String(body?.edgeTreatment?.size ?? 2),
      });
      setDetailOperation(body?.edgeTreatment?.operation ?? 'fillet');
      if (body && !bodyLocked(body, project.groups))
        setDetailTarget({
          bodyId: body.id,
          indices: body.edgeTreatment?.indices ?? [],
        });
      return;
    }
    if (next === 'knife' || next === 'paint') {
      if (next === 'knife') setKnifeUnique(false);
      setPanelOpen(true);
      return;
    }
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
        (!editingBodyId || faceBody.id === editingBodyId) &&
        inAssembly(project, faceBody.id, openedAssembly)
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
          shapeKind === 'circle' || shapeKind === 'sphere'
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
      if (
        shapePurpose === 'construction' ||
        frame.normal[2] < 0.999999 ||
        Math.abs(frame.u[0] - 1) > 1e-6 ||
        distance < 0
      )
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
      project.bodies.filter((b) =>
        selectedIds.length ? selectedIdSet.has(b.id) : b.id === body.id,
      ),
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
    if (!draft || measureMode === 'dimension') return;
    const guide: Guide = {
      id: draft.id ?? draftId,
      anchor: draft.anchor,
      plane: draft.plane,
      endAnchor: draft.endAnchor,
      mode: measureMode,
      length: parseLength(fieldsRef.current.length),
      angle: parseAngle(fieldsRef.current.angle),
      direction: draft.direction,
      xray: draft.xray,
    };
    if (draft.offset) {
      // Typing an offset immediately after picking an edge must work even
      // while the pointer is still exactly on that edge (zero-length offset).
      const direction =
        Math.hypot(...draft.offset) > 1e-8
          ? unit(draft.offset)
          : axis
            ? axisVector(axis)
            : unit(cross(guidePlaneNormal(guide), guideVector(guide)));
      guide.offset = scaleVector(direction, parseLength(fieldsRef.current.offset, true, true));
    }
    return guide;
  };
  const guidePreview = useMemo(() => {
    try {
      return makeGuide();
    } catch {
      return undefined;
    }
  }, [guideDraft, fields, measureMode, draftId, axis]);
  const precisePenPoint = (point: Vec3): Vec3 => {
    const start = penRef.current.at(-1);
    if (!start) return point;
    if (lockRef.current.has('length'))
      return penPointAtLength(
        start,
        penLengthDirectionRef.current,
        parseLength(fieldsRef.current.length, true, true),
      );
    return point.map((value, i) => {
      const key = (['x', 'y', 'z'] as const)[i];
      return lockRef.current.has(key)
        ? start[i] + parseLength(fieldsRef.current[key], true, true)
        : value;
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
    candidate = { ...candidate, groupId: candidate.groupId ?? openedAssembly };
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
          return {
            ...project,
            bodies: project.bodies.map((b) => (b.id === source.id ? next : b)),
          };
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
  const commitDimension = async (dimension: PointDimension) => {
    if (busy) return;
    if (
      await editor.transact(
        {
          ...project,
          bodies: project.bodies.map((b) => {
            const anchors = [dimension.start, dimension.end].filter(
              (a) => 'bodyId' in a && a.bodyId === b.id && a.key.startsWith('reference:'),
            );
            return anchors.length
              ? {
                  ...b,
                  vertexRefs: {
                    ...b.vertexRefs,
                    ...Object.fromEntries(
                      anchors.map((a) => ('bodyId' in a ? [a.key, a.local] : [])),
                    ),
                  },
                }
              : b;
          }),
          dimensions: [...project.dimensions.filter((d) => d.id !== dimension.id), dimension],
        },
        'Dimensio tallennettu.',
      )
    ) {
      setDimensionDraft(undefined);
      resetGesture();
      setAwaitingStart(false);
    }
  };
  const penSurface = () => {
    const target = sketchTargetRef.current;
    const source = project.bodies.find((b) => b.id === target?.bodyId);
    if (
      !target ||
      !source ||
      shapePurpose !== 'model' ||
      bodyLocked(source, project.groups) ||
      !inAssembly(project, source.id, openedAssembly)
    )
      return;
    if (editingBodyId) {
      if (source.id !== editingBodyId || surfaceMode !== 'region') return;
    } else if (source.component || source.purpose === 'component') return;
    return { source, target };
  };
  const finishPenPath = async (final: boolean) => {
    const points = penRef.current;
    const surface = penSurface();
    if (points.length < 2 || (!final && (!surface || penMode === 'bezier'))) return;
    const request = ++penSplitRequest.current,
      revision = editor.revision();
    const current = () =>
      request === penSplitRequest.current &&
      points === penRef.current &&
      revision === editor.revision();
    let ownsCommit = false;
    try {
      const path = {
        ...(await (penMode === 'bezier'
          ? editor.cad.bezier(
              points,
              shapeName || `Bézier ${project.bodies.length + 1}`,
              false,
              bezierStyle,
            )
          : editor.cad.penPath(points, shapeName || `Kynäviiva ${project.bodies.length + 1}`))),
        groupId: openedAssembly,
      };
      if (!current()) return;
      const onSurface =
        surface &&
        points.every(
          (p) => Math.abs(dot(sub(p, surface.target.point), surface.target.normal)) <= 1e-5,
        );
      const split = onSurface
        ? await editor.cad.splitPath(surface.source, surface.target.face, path)
        : undefined;
      if (!current()) return;
      const divided = split && !split.unchanged ? split : undefined;
      // A dangling segment remains editable. It must not add an empty history
      // action or turn into a separate wire until the user finishes it.
      if (!divided && !final) return;
      committing.current = true;
      ownsCommit = true;
      const next = divided
        ? {
            ...project,
            bodies: project.bodies.map((b) => (b.id === divided.body.id ? divided.body : b)),
          }
        : {
            ...project,
            bodies: [
              ...project.bodies,
              {
                ...path,
                purpose:
                  shapePurpose === 'construction'
                    ? ('construction' as const)
                    : ('drawing' as const),
              },
            ],
          };
      if (
        await editor.transact(
          next,
          divided
            ? 'Pinta jaettu viivalla. E muokkaa kumpaakin aluetta erikseen.'
            : 'Piirrosviiva valmis. Valitse viiva ja Jaa pinta liittääksesi sen osaan.',
        )
      )
        finishOperation(divided?.body.id ?? path.id, divided?.face);
    } catch (e) {
      if (current()) editor.setError((e as Error).message);
    } finally {
      if (ownsCommit) committing.current = false;
    }
  };
  const apply = async (forceClose = false, continueMeasure = false) => {
    if (committing.current || busy) return;
    try {
      if (['extrude', 'offset'].includes(tool) && faceRef.current)
        requireMovable(
          project.bodies.filter((b) => b.id === faceRef.current!.bodyId),
          project.groups,
        );
      if (tool === 'measure' && measureMode === 'dimension') {
        if (dimensionDraft) await commitDimension(dimensionDraft);
        return;
      }
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
                !!detailSource.edgeTreatment,
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
        const rotation = {
          ...draft,
          angle: rotationAngle(fieldsRef.current.angle),
        };
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
            return {
              ...project,
              bodies: project.bodies.map((b) => (b.id === next.id ? next : b)),
            };
          }, 'Pintaa muokattu.')
        )
          finishOperation(source.id);
      } else if (tool === 'pen') {
        if (!forceClose && lockRef.current.size && hoverRef.current) {
          const point = precisePenPoint(hoverRef.current);
          if (Math.hypot(...sub(point, penRef.current.at(-1)!)) < 1e-8) {
            editor.setError('');
            editor.setMessage('Siirtymä on nolla. Jatka osoittamalla seuraavan viivan suunta.');
            clearLocks();
            document
              .querySelector<HTMLCanvasElement>('canvas[data-testid="viewport"]')
              ?.focus({ preventScroll: true });
            return;
          }
          penRef.current = [...penRef.current, point];
          setPenPoints(penRef.current);
          clearLocks();
          writeFields({ x: '0', y: '0', z: '0', length: '0' });
          // The next number starts a new length; Shift/X/Y/Z must reach the drawing tool.
          document
            .querySelector<HTMLCanvasElement>('canvas[data-testid="viewport"]')
            ?.focus({ preventScroll: true });
          editor.setError('');
          void finishPenPath(false);
          return;
        }
        if (!forceClose) {
          if (penRef.current.length < 2) {
            editor.setMessage('Valitse vähintään kaksi pistettä.');
            return;
          }
          committing.current = true;
          await finishPenPath(true);
          return;
        }
        if (penMode === 'bezier') {
          const originalPoints = penRef.current,
            revision = editor.revision();
          const first = penRef.current[0];
          const points = [...penRef.current];
          if (bezierStyle === 'bezier' && points.length % 3 === 0) points.push(first);
          let curve = await editor.cad.bezier(
            points,
            shapeName || 'Bézier-muoto',
            true,
            bezierStyle,
            constructionLine,
          );
          const thickness = parseLength(fieldsRef.current.thickness, true, true);
          if (thickness) curve = await editor.cad.pushPull(curve, 'surface:0', thickness);
          if (revision !== editor.revision() || originalPoints !== penRef.current) return;
          committing.current = true;
          await commitShape({ ...curve, purpose: shapePurpose });
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
        if (
          measureMode === 'free' &&
          measureStart &&
          !continueMeasure &&
          !lockRef.current.size &&
          !freeRotate
        ) {
          resetGesture();
          setAwaitingStart(true);
          editor.setMessage('Mittaviivaketju valmis. Napsauta uuden mittauksen alkupistettä.');
          return;
        }
        if (continueMeasure && measureMode === 'free' && Number(fieldsRef.current.length) === 0)
          return;
        const candidate = makeGuide();
        if (!candidate) {
          editor.setMessage(
            measureMode === 'guide'
              ? 'Valitse ensin kappaleen verteksi tai reuna.'
              : 'Valitse mittaviivan alkupiste.',
          );
          return;
        }
        const ends = guidePoints(project.bodies, candidate);
        if (measureMode === 'free' && ends && Math.hypot(...sub(ends[1], ends[0])) < 0.1) return;
        committing.current = true;
        const committed =
          guidePointEdit && ends
            ? moveGuideEndpoint(
                project.bodies,
                project.guides,
                guidePointEdit,
                candidate.endAnchor ?? { point: ends[1] },
              ).find((g) => g.id === candidate.id)!
            : candidate;
        const result = upsertGuide(project.bodies, project.guides, committed);
        const label = result.unchanged
          ? 'Osuus on jo mittaviivassa.'
          : result.merged
            ? 'Päällekkäiset mittaviivat yhdistetty.'
            : guidePointEdit
              ? 'Mittaviivan pää siirretty. Muut viivat pysyvät paikoillaan.'
              : measureMode === 'guide'
                ? 'Apuviiva lisätty. Piirtäminen ja siirtäminen tarttuvat siihen.'
                : 'Mittaviiva lisätty.';
        if (
          result.unchanged ||
          (await editor.transact({ ...project, guides: result.guides }, label))
        ) {
          if (result.unchanged) editor.setMessage(label);
          finishOperation();
          setSelectedGuideId(result.guide.id);
          setTab('guides');
          if (continueMeasure && !guidePointEdit && measureMode === 'free' && ends) {
            const next = {
              anchor: candidate.endAnchor ?? { point: ends[1] },
              plane: candidate.plane,
            };
            setMeasureStart(next);
            guideRef.current = { ...next, direction: guideVector(candidate) };
            setGuideDraft(guideRef.current);
            setSelectedGuideId(undefined);
            gestureActive.current = true;
            setAwaitingStart(false);
            writeFields({ length: '0', angle: '0' });
            editor.setMessage(`${label} Jatka päätepisteestä. Enter tai Esc päättää ketjun.`);
          }
        }
      } else {
        const candidate = makePreview();
        if (!candidate) return;
        committing.current = true;
        if (tool === 'circle' && shapeKind === 'sphere') {
          const center = shapeFrameRef.current?.origin ?? candidate.origin;
          const radius = parseLength(fieldsRef.current.width) / 2;
          let id: string | undefined;
          if (
            await editor.transact(async () => {
              const sphere = {
                ...(await editor.cad.sphere(
                  center,
                  radius,
                  shapeName || `Pallo ${project.bodies.length + 1}`,
                )),
                groupId: openedAssembly,
                purpose: shapePurpose,
              };
              id = sphere.id;
              return { ...project, bodies: [...project.bodies, sphere] };
            }, 'Pallo lisätty. Halkaisija määrää pallon koon.')
          )
            finishOperation(id);
          return;
        }
        if (tool === 'rectangle' || tool === 'circle') {
          await commitShape(candidate);
          return;
        }
        const source = project.bodies.find((b) => b.id === candidate.id)!;
        const offset = sub(candidate.origin, source.origin);
        const copying = copyMoveRef.current;
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
              ? `Kopioitu ${result.ids.length} kappaletta · ${sub(candidate.origin, source.origin)
                  .map((n, i) => (n ? `${'XYZ'[i]} ${n > 0 ? '+' : ''}${formatLength(n)} mm` : ''))
                  .filter(Boolean)
                  .join(' · ')}`
              : `Siirretty ${result.ids.length} kappaletta · ${sub(candidate.origin, source.origin)
                  .map((n, i) => (n ? `${'XYZ'[i]} ${n > 0 ? '+' : ''}${formatLength(n)} mm` : ''))
                  .filter(Boolean)
                  .join(' · ')}`,
          )
        ) {
          finishOperation(result.ids[0]);
          setSelectedIds(result.ids);
          setSelectedGroupId(result.groupId);
          setRepeatStep(
            Math.hypot(...offset) > 1e-8
              ? {
                  revision: editor.revision(),
                  ids: result.ids,
                  groupId: result.groupId,
                  offset,
                  copy: copying,
                }
              : undefined,
          );
          setRepeatCount('1');
        }
      }
    } catch (e) {
      editor.setError((e as Error).message);
    } finally {
      committing.current = false;
    }
  };
  const cancel = (finish = false) => {
    if (!finish && pickOthers) {
      setPickOthers(false);
      return;
    }
    activityHistory.prepare(actionContext);
    const hadGesture =
      gestureActive.current ||
      !!dimensionDraft ||
      !!guideRef.current ||
      !!measureStart ||
      !!penRef.current.length ||
      (tool === 'offset' && !!faceTarget) ||
      (tool === 'detail' && !!detailTarget?.indices.length) ||
      (tool === 'boolean' && booleanTools.length > 0) ||
      busy;
    if (!finish && hadGesture) {
      if (busy) editor.cancel();
      resetGesture();
      setAwaitingStart(true);
      writeFields({
        ...defaults,
        ...(tool === 'circle' ? { width: '100', depth: '60' } : {}),
        ...(tool === 'offset' ? { offset: '18' } : tool === 'detail' ? { offset: '2' } : {}),
      });
      setMeasureMenu(false);
      if (tool === 'boolean') {
        setBooleanTools([]);
        setBooleanTargets([]);
        setBooleanActive('targets');
      }
      editor.setError('');
      editor.setMessage(
        'Toiminto peruttu. Työkalu on valmis uuteen aloitukseen. Esc päättää työkalun.',
      );
      return;
    }
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
    if (openedAssembly && !editingBodyId && !hadGesture && tool === 'select')
      setOpenedAssembly(
        groupAncestors(project.groups, openedAssembly)
          .slice(1)
          .find((g) => g.kind === 'assembly')?.id,
      );
    if (editingBodyId) {
      if (!hadGesture && tool === 'select') {
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
    setAxis(undefined);
    constraintRef.current = undefined;
    setPenConstraint(undefined);
    lockRef.current.delete('angle');
    setLocked(new Set(lockRef.current));
    setGuideRotationStep(free ? 0 : 22.5);
    setFreeRotate(true);
    editor.setMessage(
      free
        ? 'Kierrä mittaviivaa hiirellä vapaasti. Napsautus tai Enter hyväksyy.'
        : 'Kierrä mittaviivaa hiirellä · 22,5° askel. Napsautus tai Enter hyväksyy.',
    );
  };
  const penMove = (point?: Vec3) => {
    penPointerRef.current = point;
    if (point && penRef.current.length) {
      const start = penRef.current.at(-1)!;
      if (!lockRef.current.has('length')) {
        penDirectionRef.current = penTravelDirection(
          start,
          point,
          constraintRef.current,
          penDirectionRef.current,
        );
        writeFields({
          length: inputNumber(Math.hypot(...sub(point, start))),
        });
        const delta = sub(point, start);
        if (!lockRef.current.size && Math.hypot(...delta) > 1e-8) {
          const index = delta.map(Math.abs).indexOf(Math.max(...delta.map(Math.abs)));
          setPenInputAxis((['x', 'y', 'z'] as const)[index]);
        }
        const patch: Partial<Fields> = {};
        for (const [i, key] of (['x', 'y', 'z'] as const).entries())
          if (!lockRef.current.has(key)) patch[key] = inputNumber(delta[i]);
        writeFields(patch);
      } else {
        // Keep the direction captured before typing; the adjusted preview must
        // never feed back into the sign of the next digit or pointer event.
        penLengthDirectionRef.current ??= penTravelDirection(start, point, constraintRef.current);
      }
      try {
        point = precisePenPoint(point);
        if (lockRef.current.has('length')) {
          const delta = sub(point, start);
          writeFields({
            x: inputNumber(delta[0]),
            y: inputNumber(delta[1]),
            z: inputNumber(delta[2]),
          });
        }
      } catch {}
    }
    hoverRef.current = point;
    setPenHover(point);
  };
  const gesture = (event: Gesture) => {
    gestureActive.current = true;
    const patch: Partial<Fields> = {};
    if (event.type === 'profile') {
      if (!lockRef.current.has('width')) patch.width = String(event.width);
      if (!lockRef.current.has('depth')) patch.depth = String(event.depth);
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
        writeFields({
          height: `${event.distance >= 0 ? '+' : ''}${inputNumber(event.distance)}`,
        });
      }
    } else if (event.type === 'detail') {
      if (!lockRef.current.has('offset')) writeFields({ offset: inputNumber(event.size) });
    } else if (event.type === 'offset') {
      if (!lockRef.current.has('offset')) writeFields({ offset: inputNumber(event.distance) });
    } else if (event.type === 'move') {
      setMoveInputAxis(event.axis);
      const source = project.bodies.find((b) => b.id === event.bodyId) ?? body;
      if (!source) return;
      for (const [i, key] of ['x', 'y', 'z'].entries())
        if (!lockRef.current.has(key))
          patch[key as 'x' | 'y' | 'z'] = String(
            Math.round((event.origin[i] - source.origin[i]) * 1e8) / 1e8,
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
      if (committing.current || busy) return;
      if (event.close && !lockRef.current.size) {
        void apply(true);
        return;
      }
      try {
        precisePenPoint(event.point); // Validate numeric input before committing.
        penMove(event.point);
      } catch (e) {
        editor.setError((e as Error).message);
        return;
      }
      penRef.current = [...penRef.current, hoverRef.current ?? event.point];
      setPenPoints(penRef.current);
      clearLocks();
      writeFields({ x: '0', y: '0', z: '0' });
      editor.setError('');
      void finishPenPath(false);
    }
  };
  const knifeTargets = visibleBodies.filter(
    (b) =>
      featureIsSolid(b.feature) &&
      !bodyLocked(b, project.groups) &&
      (!selectedIds.length || selectedIdSet.has(b.id)) &&
      (!editingBodyId || b.id === editingBodyId) &&
      inAssembly(project, b.id, openedAssembly),
  );
  const applyKnife = async (rays: import('./cad/modeling').KnifeRay[], curveNormal?: Vec3) => {
    if (busy || committing.current) return;
    if (!knifeTargets.length) {
      editor.setMessage('Valitse muokattava tilavuuskappale tai vapauta sen lukitus.');
      return;
    }
    committing.current = true;
    try {
      let pieces: string[] = [];
      const ok = await editor.transact(async () => {
        requireMovable(knifeTargets, project.groups);
        let result = await editor.cad.knife(knifeTargets, rays, curveNormal);
        if (!result.affected.length)
          throw new Error(
            'Viiva ei halkaissut kappaletta. Vedä reitti kappaleen reunasta reunaan tai sulje siluetti sen sisällä.',
          );
        if (!knifeUnique)
          result = await linkSplitCopies(project, result, (source, targets) =>
            editor.cad.instances(source, targets),
          );
        pieces = result.pieces;
        return applySplitResult(project, result);
      }, 'Veitsi · osat paloiteltu. Molemmat puolet säilyvät; Peru palauttaa alkuperäiset osat.');
      if (ok) {
        finishOperation(pieces[0]);
        setEditingBodyId(undefined);
        setSurfaceMode('new');
        setSelected(pieces[0]);
        setSelectedIds(pieces);
      }
    } finally {
      committing.current = false;
    }
  };
  const softenSelected = () => {
    if (!body || bodyLocked(body, project.groups)) return;
    begin('detail');
    setDetailOperation('fillet');
    const mesh = editor.meshes.find((m) => m.id === body.id);
    setDetailTarget({
      bodyId: body.id,
      indices: (mesh?.sourceDetailEdges ?? mesh?.detailEdges ?? []).map((e) => e.index),
    });
    setAwaitingStart(false);
    gestureActive.current = true;
    editor.setMessage(
      'Pehmennä reunat: säädä pyöristyksen säde ja hyväksy Enterillä. Esikatselu näyttää mittoihin tulevan muutoksen.',
    );
  };
  const mergeSelected = async () => {
    try {
      const candidate = mergeBodies(project.bodies.filter((b) => selectedIdSet.has(b.id)));
      if (
        await editor.transact(
          {
            ...project,
            bodies: [...project.bodies.filter((b) => !selectedIdSet.has(b.id)), candidate],
          },
          'Valitut osat yhdistetty yhdeksi objektiksi. Peru palauttaa erilliset osat.',
        )
      )
        select(candidate.id);
    } catch (e) {
      editor.setError((e as Error).message);
    }
  };
  const selectGuide = (id: string, additive = false) => {
    if (busy) return;
    resetGesture();
    setTool('select');
    if (!additive) {
      setSelected(undefined);
      setSelectedIds([]);
      setSelectedGroupId(undefined);
    }
    setSelectedFace(undefined);
    setSelectedGuideIds(
      additive
        ? selectedGuideSet.has(id)
          ? selectedGuideIds.filter((key) => key !== id)
          : [...selectedGuideIds, id]
        : [id],
    );
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
  const editGuidePoint = (target: GuideEndpoint) => {
    const guide = project.guides.find((g) => g.id === target.guideId && g.mode === 'free');
    if (!guide || busy) return;
    const points = guidePoints(project.bodies, guide);
    if (!points) return;
    const fixed = target.end === 0 ? 1 : 0;
    editGuide(guide);
    setGuidePointEdit(target);
    gestureActive.current = true;
    const delta = sub(points[target.end], points[fixed]);
    guideRef.current = {
      ...guideRef.current!,
      anchor: guideEndAnchor(project.bodies, guide, fixed),
      endAnchor: guideEndAnchor(project.bodies, guide, target.end),
      offset: undefined,
      direction: unit(delta),
    };
    setGuideDraft(guideRef.current);
    writeFields({
      ...defaults,
      length: String(Math.hypot(...delta)),
      angle: String(angleBetween(points[fixed], points[target.end], guide.plane, true)),
    });
    editor.setMessage(
      'Siirrä valitun mittaviivan päätä. Muut viivat jäävät paikoilleen. Klikkaus tai Enter hyväksyy, Esc peruu.',
    );
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
                  : tool === 'pen'
                    ? [
                        {
                          key: 'length',
                          label: penConstraint
                            ? 'Pituus lukitulla suunnalla'
                            : 'Pituus piirtosuuntaan',
                          value: fields.length,
                          unit: 'mm',
                          testId: 'pen-length',
                          signed: true,
                        },
                        ...(!penConstraint
                          ? [
                              penInputAxis,
                              ...(['x', 'y', 'z'] as Axis[]).filter((a) => a !== penInputAxis),
                            ].map((key) => ({
                              key,
                              label: `Siirtymä · ${key.toUpperCase()}`,
                              value: fields[key],
                              unit: 'mm',
                              testId: `move-${key}`,
                              signed: true,
                            }))
                          : []),
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
    const ids = selectedIds.length ? selectedIds : body ? [body.id] : [];
    if (busy) return;
    if (!ids.length && !selectedGuideIds.length) {
      if (selectedGroup) await removeGroup(selectedGroup.id);
      return;
    }
    try {
      const cleaned = ids.length ? removeSelection(project, ids) : project;
      if (
        await editor.transact(
          { ...cleaned, guides: cleaned.guides.filter((g) => !selectedGuideSet.has(g.id)) },
          `${[ids.length ? `${ids.length} osaa` : '', selectedGuideIds.length ? `${selectedGuideIds.length} viivaa` : ''].filter(Boolean).join(' + ')} poistettu. Peru palauttaa koko valinnan.`,
        )
      )
        select(undefined, undefined, false, true);
    } catch (e) {
      editor.setError((e as Error).message);
    }
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
        bodies: project.bodies.map((b) => {
          if (!ids.includes(b.id)) return b;
          if (patch.localMaterial === false && b.component) {
            const family = project.bodies.filter(
              (other) => other.component?.id === b.component?.id,
            );
            const shared = family.find((other) => !other.localMaterial) ?? family[0];
            return {
              ...b,
              ...patch,
              color: shared.color,
              material: shared.material,
              appearance: shared.appearance,
            };
          }
          return { ...b, ...patch };
        }),
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
          {
            ...next,
            groups: next.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          },
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
  const arrangeTree = async (move: TreeMove, parentId?: string) => {
    if (busy || editingBodyId || editing || tool === 'boolean') return;
    if (openedAssembly) {
      editor.setMessage('Sulje kokoonpano ennen hierarkian järjestämistä.');
      return;
    }
    try {
      const next = moveInTree(project, move, parentId);
      if (next === project) return;
      if (
        await editor.transact(
          next,
          parentId ? 'Valinta siirretty ryhmään.' : 'Valinta siirretty päätasolle.',
        )
      ) {
        resetGesture();
        setAwaitingStart(true);
        setSelectedGroupId(move.kind === 'group' ? move.id : undefined);
        const ids = move.kind === 'group' ? groupBodies(next, move.id).map((b) => b.id) : move.ids;
        setSelectedIds(ids);
        setSelected(ids[0]);
      }
    } catch (e) {
      editor.setError((e as Error).message);
    }
  };
  const createGroup = async (parentId?: string, assembly = false) => {
    if (busy) return;
    const group = {
      id: uid(),
      name: `${assembly ? 'Kokoonpano' : 'Ryhmä'} ${project.groups.length + 1}`,
      kind: assembly ? ('assembly' as const) : ('folder' as const),
      hidden: false,
      parentId,
    };
    const fullGroups = project.groups.filter(
      (g) =>
        !groupContains(project.groups, g.id, parentId) &&
        groupBodies(project, g.id).length &&
        groupBodies(project, g.id).every((b) => selectedIdSet.has(b.id)),
    );
    const roots = fullGroups.filter(
      (g) =>
        !fullGroups.some(
          (other) => other.id !== g.id && groupContains(project.groups, other.id, g.id),
        ),
    );
    const ok = await editor.transact(
      {
        ...project,
        groups: [
          ...project.groups.map((g) =>
            roots.some((r) => r.id === g.id) ? { ...g, parentId: group.id } : g,
          ),
          group,
        ],
        bodies: project.bodies.map((b) =>
          selectedIdSet.has(b.id) &&
          !roots.some((r) => groupContains(project.groups, r.id, b.groupId))
            ? { ...b, groupId: group.id }
            : b,
        ),
      },
      assembly
        ? 'Kokoonpano luotu. Tuplaklikkaa avataksesi sen.'
        : 'Ryhmä luotu. Voit nimetä sen listassa.',
    );
    if (ok) {
      setSelectedGroupId(group.id);
      setMultiSelect(!assembly);
    }
  };
  const removeGroup = async (id: string) => {
    if (
      await editor.transact(
        dissolveGroup(project, id),
        'Ryhmä poistettu. Osat ja alaryhmät säilyivät ylemmällä tasolla.',
      )
    )
      setSelectedGroupId(undefined);
  };
  useEffect(() => {
    if (
      openedAssembly &&
      (!project.groups.some((g) => g.id === openedAssembly) ||
        groupAncestors(project.groups, openedAssembly).some((g) => g.hidden || g.locked))
    ) {
      setOpenedAssembly(undefined);
      setEditingBodyId(undefined);
    }
  }, [project.groups, openedAssembly]);
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
      setPartsOpen(false);
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
      setPartsOpen(false);
      setRenderOpen(false);
      changeView('iso', true);
    }
  };
  const finishedExample = async (curves = false) => {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}examples/${curves ? 'muotojen-lapi' : 'viimeistelty-kaappi'}.nivo`,
      );
      if (!response.ok) throw new Error('Esimerkkiprojektia ei saatu avattua.');
      if (
        await editor.transact(
          parseProject(await response.text()),
          curves
            ? 'Käyräesimerkki avattu. Lähtömuodot löytyvät piilotettuina mallilistasta. Muodot → Muotojen läpi luo uuden pinnan.'
            : 'Viimeistelty kaappiesimerkki avattu. Tutki reunakäsittelyjä F:llä, mittoja ja renderin tekstuureja.',
        )
      ) {
        setEditingBodyId(undefined);
        setSurfaceMode('new');
        finishOperation();
        setMode('model');
        setPartsOpen(false);
        setRenderOpen(false);
        changeView('iso', true);
      }
    } catch (error) {
      editor.setError((error as Error).message);
    }
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 64 * 1024 * 1024)
        throw new Error('Projektitiedosto on liian suuri (enintään 64 MiB).');
      const loaded = parseProject(await file.text());
      if (await editor.transact(loaded, 'Projekti avattu.', 'replace')) {
        setEditingBodyId(undefined);
        setSurfaceMode('new');
        finishOperation();
        setMode('model');
        setPartsOpen(false);
        setRenderOpen(false);
        changeView('iso', true);
      }
    } catch (e) {
      editor.setError((e as Error).message);
    }
    if (fileInput.current) fileInput.current.value = '';
  };
  const openRender = () => {
    setLoftOpen(false);
    setLoftPreview(undefined);
    setPartsOpen(false);
    resetGesture();
    setEditingBodyId(undefined);
    setSurfaceMode('new');
    setTool('navigate');
    setRenderOpen(true);
  };
  const closeRender = () => {
    setPartsOpen(false);
    resetGesture();
    setRenderOpen(false);
    setMode('model');
    setTool('select');
  };
  const openDrawing = () => {
    setLoftOpen(false);
    setLoftPreview(undefined);
    setPartsOpen(false);
    setRenderOpen(false);
    resetGesture();
    setEditingBodyId(undefined);
    setSurfaceMode('new');
    setTool('select');
    setMode('drawing');
    setTab('dimensions');
  };
  const openParts = () => {
    resetGesture();
    setEditingBodyId(undefined);
    setSurfaceMode('new');
    setRenderOpen(false);
    setPartsOpen(true);
    setTool('select');
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
    }
  };

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
      if (event.defaultPrevented || cabinetOpen || actionMenu) return;
      if (loftOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          if (busy) editor.cancel();
          setLoftOpen(false);
          setLoftPreview(undefined);
        }
        return;
      }
      if (measureMenu || guidePointMenu) return;
      if (
        commandOpen ||
        pickList ||
        groupMove ||
        openingDraft ||
        openingBusy ||
        surfaceSplitDraft
      ) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setCommandOpen(false);
          setGroupMove(undefined);
          cancelOpening();
          setSurfaceSplitDraft(undefined);
          setPickList(undefined);
          setPickHovered(undefined);
        }
        return;
      }
      if (help) {
        if (event.key === 'Escape') setHelp(false);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        if (renderOpen || partsOpen || mode === 'drawing') {
          closeRender();
          return;
        }
        cancel();
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      // Enter/Space belong to the focused control, e.g. a view-cube face while
      // drawing. Do not accept geometry instead of activating that control.
      if (['Enter', ' '].includes(event.key) && target.closest('button, a, summary, [role=button]'))
        return;
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
      if (renderOpen || partsOpen || mode === 'drawing') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        tool === 'select' &&
        !event.shiftKey &&
        !event.repeat &&
        /^[1-4]$/.test(key) &&
        !dimensionDraft &&
        !guideDraft &&
        !pickOthers &&
        !workspace.sectionPick &&
        !workspace.calibration &&
        !document.querySelector('[data-testid="viewport"]')?.hasAttribute('data-pointer-active')
      ) {
        event.preventDefault();
        changeDisplay(displayModes[Number(key) - 1]);
        return;
      }
      if (
        awaitingStart &&
        numericFields.length &&
        !(tool === 'measure' && measureMode === 'dimension') &&
        /^[\d.,+\-]$/.test(event.key) &&
        ['rectangle', 'circle', 'move', 'pen'].includes(tool)
      ) {
        event.preventDefault();
        flushSync(() => {
          setAwaitingStart(false);
          const key = tool === 'move' ? (axis ?? moveInputAxis ?? 'x') : numericFields[0].key;
          field(
            key,
            tool === 'move' &&
              /^[\d.,]$/.test(event.key) &&
              Number(fieldsRef.current[key as 'x' | 'y' | 'z']) < 0
              ? `-${event.key}`
              : event.key,
          );
        });
        const input = document.querySelector<HTMLInputElement>(
          `[data-testid="${numericFields[0].testId}"]`,
        );
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
        return;
      }
      if (key === 'enter' && (editing || tool === 'boolean' || !!dimensionDraft)) {
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
        clearLocks();
        penRef.current = penRef.current.slice(0, -1);
        setPenPoints(penRef.current);
        return;
      }
      const chosen = tools.find((t) => t.shortcut.toLowerCase() === key);
      if (chosen) {
        if (chosen.id === 'pen') setPenMode('line');
        begin(chosen.id);
      }
      if (tool === 'move' && ['x', 'y', 'z'].includes(key))
        setAxis(axis === key ? undefined : (key as Axis));
      if (key === 'delete' || key === 'backspace' || (key === 'x' && tool === 'select')) {
        event.preventDefault();
        void removeBody();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => {
    if (tool === 'measure' && axis && guideRef.current && !guideRef.current.offset) {
      const draft = guideRef.current;
      const prior =
        draft.direction ?? guideDirection(draft.plane, Number(fieldsRef.current.angle) || 0);
      draft.direction = scaleVector(
        axisVector(axis),
        prior[{ x: 0, y: 1, z: 2 }[axis]] < 0 ? -1 : 1,
      );
      draft.plane = planeForDirection(draft.direction, draft.plane);
      lockRef.current.delete('angle');
      writeFields({
        angle: String(angleBetween([0, 0, 0], draft.direction, draft.plane, true)),
      });
      setGuideDraft({ ...draft });
    }
  }, [axis, tool]);

  const objectTree = (
    <ObjectTree
      bodies={project.bodies}
      groups={project.groups}
      selected={loftOpen ? loftIds : selectedIds}
      busy={busy}
      onSelect={(id, additive) => {
        if (loftOpen) {
          select(id);
          return;
        }
        // An explicit part row names the intended part. Open its assembly visibly;
        // viewport clicks still select a closed assembly as a single unit.
        if (tool === 'select' && !editingBodyId && !editing && !additive && !multiSelect) {
          const part = project.bodies.find((b) => b.id === id);
          const assembly = groupAncestors(project.groups, part?.groupId).find(
            (g) => g.kind === 'assembly',
          );
          setOpenedAssembly(
            assembly &&
              !groupAncestors(project.groups, assembly.id).some((g) => g.locked || g.hidden)
              ? assembly.id
              : undefined,
          );
          select(id, undefined, false, true);
        } else select(id, undefined, additive);
      }}
      onSelectGroup={(id) => {
        if (editingBodyId) {
          editor.setMessage('Päätä osan muokkaus ennen ryhmän valintaa.');
          return;
        }
        const ids = groupBodies(project, id).map((b) => b.id);
        if (ids.some((bodyId) => !inAssembly(project, bodyId, openedAssembly))) {
          editor.setMessage('Sulje avoin kokoonpano ennen ulkopuolisen ryhmän valintaa.');
          return;
        }
        if (tool === 'boolean') {
          ids.forEach((id) => toggleBoolean(id));
          return;
        }
        select(ids[0], undefined, false, true);
        setSelectedIds(ids);
        setSelectedGroupId(id);
        setMultiSelect(project.groups.find((g) => g.id === id)?.kind !== 'assembly');
        if (!ids.length) {
          resetGesture();
          setTool('select');
        } else if (tool === 'rotate') startRotation(ids);
      }}
      onBody={(id, patch) => void patchBodies([id], patch)}
      onGroup={(id, patch) => void patchGroup(id, patch)}
      selectedGroupId={selectedGroupId}
      onNewGroup={() => void createGroup()}
      arrangingDisabled={!!editingBodyId || editing || tool === 'boolean'}
      multiSelect={multiSelect}
      onMultiSelect={() => setMultiSelect(!multiSelect)}
      onMove={(move, parentId) => void arrangeTree(move, parentId)}
    />
  );
  const linkSelected = async () => {
    if (!body || busy) return;
    const source = { ...asComponent(body), localMaterial: false, localTexture: false };
    const targets = project.bodies
      .filter((b) => selectedIdSet.has(b.id) && b.id !== body.id)
      .map((b) => asComponent(b, source.component!.id));
    if ([source, ...targets].some((b) => bodyLocked(b, project.groups))) {
      editor.setError('Vapauta Hold ennen komponenttien linkittämistä.');
      return;
    }
    await editor.transact(
      async () => {
        const placed = await editor.cad.instances(source, targets);
        const changes = new Map(
          [
            source,
            ...placed.map((b) => ({
              ...b,
              color: source.color,
              appearance: source.appearance,
              material: source.material,
              localMaterial: false,
              localTexture: false,
            })),
          ].map((b) => [b.id, b]),
        );
        return { ...project, bodies: project.bodies.map((b) => changes.get(b.id) ?? b) };
      },
      targets.length
        ? 'Osat linkitetty lähtöosan geometriaan. Sijainnit ja kierrot säilyivät.'
        : 'Komponentti luotu. Sen kopiot ovat linkitettyjä.',
    );
  };
  const makeUnique = () => {
    void editor.transact(
      uniqueComponents(
        project,
        selectedGroup ? groupBodies(project, selectedGroup.id).map((b) => b.id) : selectedIds,
        !!selectedGroup,
      ),
      selectedGroup
        ? 'Ryhmän osat erotettu muista kopioista. Ryhmän sisäiset linkit säilyivät.'
        : 'Valinnan komponenttilinkit irrotettu.',
    );
  };
  const paintBody = (id: string) => {
    if (busy || !inAssembly(project, id, openedAssembly) || (editingBodyId && id !== editingBodyId))
      return;
    if (paintMode === 'texture') {
      if (selectedIdSet.has(id)) setSelected(id);
      else select(id);
      return;
    }
    const ids = paintAll && selectedIdSet.has(id) ? selectedIds : [id];
    void editor.transact(
      {
        ...project,
        bodies: project.bodies.map((b) =>
          ids.includes(b.id)
            ? {
                ...b,
                ...brush,
                appearance: placeMaterial(
                  b,
                  brush.appearance,
                  editor.meshes.find((m) => m.id === b.id),
                  true,
                ),
                localMaterial: !paintLinked,
              }
            : b,
        ),
      },
      `${ids.length} osan materiaali päivitetty.`,
    );
  };
  const movementBlocked = project.bodies.some(
    (b) => selectedIdSet.has(b.id) && bodyLocked(b, project.groups),
  )
    ? 'Vapauta valinnan Hold ennen muokkaamista.'
    : undefined;
  const canRepeat =
    repeatStep &&
    repeatStep.revision === editor.revision() &&
    repeatStep.ids.length === selectedIds.length &&
    repeatStep.ids.every((id) => selectedIdSet.has(id)) &&
    !gestureActive.current &&
    !movementBlocked;
  const repeatLabel =
    repeatStep?.offset
      .map((n, i) => (n ? `${'XYZ'[i]} ${n > 0 ? '+' : ''}${formatLength(n)} mm` : ''))
      .filter(Boolean)
      .join(' · ') ?? '';
  const repeatLast = async () => {
    if (!canRepeat || !repeatStep || busy || committing.current) return;
    committing.current = true;
    try {
      const result = repeatTranslation(
        project,
        repeatStep.ids,
        repeatStep.offset,
        Number(repeatCount),
        repeatStep.copy,
        repeatStep.groupId,
      );
      if (
        await editor.transact(
          result.project,
          `${repeatStep.copy ? 'Kopiointi' : 'Siirto'} toistettu ${repeatCount} kertaa · ${repeatStep.ids.length} osaa · ${repeatLabel}`,
        )
      ) {
        finishOperation(result.ids[0]);
        setSelectedIds(result.ids);
        setSelectedGroupId(result.groupId);
        setRepeatStep({
          ...repeatStep,
          revision: editor.revision(),
          ids: result.ids,
          groupId: result.groupId,
        });
      }
    } catch (error) {
      editor.setError((error as Error).message);
    } finally {
      committing.current = false;
    }
  };
  const canDivideSurface =
    !!body &&
    selectedIds.length === 1 &&
    !featureIsSolid(body.feature) &&
    !bodyLocked(body, project.groups) &&
    !editingBodyId;
  const canCutOpening =
    canDivideSurface && editor.meshes.find((m) => m.id === body?.id)?.faces.length === 1;
  const acceptSurfaceSplit = async (draft: NonNullable<typeof surfaceSplitDraft>) => {
    if (busy || !draft.included.length || draft.revision !== editor.revision()) return;
    const results = draft.results.filter((r) => draft.included.includes(r.body.id));
    const cleaned = removeSelection(project, [draft.profile.id]);
    const byId = new Map(results.map((r) => [r.body.id, r.body]));
    const candidate = {
      ...cleaned,
      bodies: cleaned.bodies.map((b) => byId.get(b.id) ?? b),
    };
    const next = draft.unique ? uniqueComponents(candidate, draft.included) : candidate;
    if (
      await editor.transact(
        next,
        `Pinta jaettu · ${results.length} osaa. E muokkaa rajattua aluetta.`,
        'commit',
        {
          context: {
            ids: [draft.profile.id, ...draft.included],
            primary: results[0].body.id,
            openedAssembly,
          },
        },
      )
    ) {
      setTool('select');
      finishOperation(results[0].body.id, results[0].face);
    }
  };
  const prepareSurfaceSplit = async () => {
    if (!body || !canDivideSurface || busy || openingBusy) return;
    const revision = editor.revision(),
      request = ++openingRequest.current;
    setOpeningBusy(true);
    editor.setError('');
    try {
      const results = await editor.cad.divideSurfaces(
        body,
        visibleBodies.filter(
          (b) => b.id !== body.id && featureIsSolid(b.feature) && !bodyLocked(b, project.groups),
        ),
      );
      if (revision !== editor.revision() || request !== openingRequest.current) return;
      if (!results.length) {
        editor.setMessage(
          'Piirros ei jaa pintaa. Viivan pitää kulkea pinnan reunasta reunaan; suljetun muodon reunan pitää osua pinnan sisälle.',
        );
        return;
      }
      const draft = { profile: body, results, included: results.map((r) => r.body.id), revision };
      if (results.length === 1 && !results[0].body.component) await acceptSurfaceSplit(draft);
      else setSurfaceSplitDraft(draft);
    } catch (e) {
      editor.setError((e as Error).message);
    } finally {
      if (request === openingRequest.current) setOpeningBusy(false);
    }
  };
  const openingOperation = (draft: NonNullable<typeof openingDraft>): OperationContext => ({
    kind: 'opening',
    profileId: draft.profile.id,
    targetIds: [...draft.included],
    keep: draft.keep,
    unique: draft.unique,
  });
  const openingContext = (draft: NonNullable<typeof openingDraft>): SelectionContext => ({
    ids: [draft.profile.id, ...draft.included],
    primary: draft.profile.id,
    openedAssembly,
  });
  const lastOpening = useRef<OperationContext | undefined>(undefined);
  const cancelOpening = () => {
    if (openingDraft) {
      lastOpening.current = openingOperation(openingDraft);
      activityHistory.record(
        {
          label: 'Aukon leikkauksen esikatselu peruttu.',
          context: openingContext(openingDraft),
          operation: lastOpening.current,
        },
        'cancel',
      );
    }
    openingRequest.current++;
    setOpeningBusy(false);
    setOpeningDraft(undefined);
  };
  const prepareOpening = async (
    profile = body,
    model = project,
    settings = lastOpening.current?.profileId === profile?.id ? lastOpening.current : undefined,
  ) => {
    if (!profile || featureIsSolid(profile.feature) || busy || openingBusy) return;
    const revision = editor.revision(),
      request = ++openingRequest.current;
    setOpeningBusy(true);
    editor.setError('');
    try {
      const targets = model.bodies.filter(
        (b) =>
          b.id !== profile.id &&
          featureIsSolid(b.feature) &&
          bodyVisible(b, model.groups) &&
          !bodyLocked(b, model.groups) &&
          (model !== project || visibleBodies.some((visible) => visible.id === b.id)),
      );
      const result = await editor.cad.cutOpening(profile, targets);
      if (revision !== editor.revision() || request !== openingRequest.current) return;
      if (!result.affected.length) {
        editor.setMessage('Muodon kohdalla ei ole leikattavia näkyviä, vapaita osia.');
        return;
      }
      setOpeningDraft({
        profile,
        ...result,
        included: settings
          ? result.affected.filter((id) => settings.targetIds.includes(id))
          : result.affected,
        revision,
        keep: settings?.keep ?? false,
        unique: settings?.unique ?? false,
      });
    } catch (e) {
      editor.setError((e as Error).message);
    } finally {
      if (request === openingRequest.current) setOpeningBusy(false);
    }
  };
  const restoreOpening = async (entry: Activity) => {
    if (!entry.operation || busy || openingBusy) return;
    resetGesture();
    const model = entry.actionId ? await editor.restoreAction(entry.actionId) : project;
    if (!model) return;
    const profile = model.bodies.find((b) => b.id === entry.operation!.profileId);
    if (!profile) return;
    setIsolated(undefined);
    setEditingBodyId(undefined);
    setSurfaceMode('new');
    setOpenedAssembly(entry.context?.openedAssembly);
    setTool('select');
    setSelected(profile.id);
    setSelectedIds([
      profile.id,
      ...entry.operation.targetIds.filter((id) => model.bodies.some((b) => b.id === id)),
    ]);
    setSelectedGroupId(undefined);
    setSelectedFace(undefined);
    setAwaitingStart(true);
    await prepareOpening(profile, model, entry.operation);
  };
  const acceptOpening = async () => {
    const draft = openingDraft;
    if (!draft || busy || !draft.included.length) return;
    if (draft.revision !== editor.revision()) {
      setOpeningDraft(undefined);
      editor.setMessage('Malli muuttui. Valitse Leikkaa aukko uudelleen.');
      return;
    }
    const results = new Map(draft.bodies.map((b) => [b.id, b]));
    const removed = draft.included.filter((id) => !results.has(id));
    if (!draft.keep) removed.push(draft.profile.id);
    const cleaned = removeSelection(project, removed);
    const candidate = {
      ...cleaned,
      bodies: cleaned.bodies.flatMap((b) => {
        if (!draft.included.includes(b.id)) return [b];
        const result = results.get(b.id);
        return result ? [result] : [];
      }),
    };
    const next = draft.unique ? uniqueComponents(candidate, draft.included) : candidate;
    if (
      await editor.transact(
        next,
        `Aukko leikattu läpi ${draft.included.length} osasta.`,
        'commit',
        {
          context: openingContext(draft),
          operation: openingOperation(draft),
        },
      )
    ) {
      lastOpening.current = openingOperation(draft);
      setOpeningDraft(undefined);
      finishOperation(draft.included.find((id) => results.has(id)));
    }
  };
  const quickActions: QuickAction[] =
    selectedGuideIds.length && (selectedGuideIds.length > 1 || selectedIds.length)
      ? [{ label: 'Poista valinta', run: () => void removeBody(), disabled: busy }]
      : selectedGuide
        ? [
            { label: 'Siirrä apuviivaa', run: () => editGuide(selectedGuide) },
            {
              label: 'Poista apuviiva',
              run: () => void removeGuide(selectedGuide.id),
              disabled: busy,
            },
          ]
        : [
            {
              label: selectedGroup?.kind === 'assembly' ? 'Muokkaa osia' : 'Muokkaa osaa',
              run: () =>
                selectedGroup?.kind === 'assembly'
                  ? openAssembly(selectedGroup.id)
                  : body && openBodyEdit(body.id),
              disabled: busy || !body,
            },
            {
              label: 'Eristä valinta',
              run: isolateSelection,
              disabled: busy || !selectedIds.length,
            },
            {
              label: 'Siirrä · M',
              run: () => begin('move'),
              reason: movementBlocked,
              disabled: busy || !body,
            },
            {
              label: 'Kopioi ja siirrä',
              run: copyBody,
              reason: movementBlocked,
              disabled: busy || !body,
            },
            {
              label: 'Kierrä · R',
              run: () => begin('rotate'),
              reason: movementBlocked,
              disabled: busy || !body,
            },
            ...(canDivideSurface
              ? [{ label: 'Jaa pinta', run: () => void prepareSurfaceSplit() }]
              : []),
            ...(canCutOpening
              ? [
                  {
                    label: 'Leikkaa aukko…',
                    run: () => void prepareOpening(),
                    disabled: busy || openingBusy,
                  },
                ]
              : []),
            {
              label: 'Pehmennä reunat…',
              run: softenSelected,
              reason: movementBlocked,
              disabled: busy || !body || selectedIds.length !== 1 || !featureIsSolid(body.feature),
            },
            {
              label: 'Veitsi · N',
              run: () => begin('knife'),
              reason: movementBlocked,
              disabled: busy || !body,
            },
            { label: 'Maalaa · P', run: () => begin('paint'), disabled: busy || !body },
            { label: 'Kiinnitä / vapauta · G', run: holdSelected, disabled: busy || !body },
            {
              label: 'Piilota valinta',
              run: () =>
                selectedGroup
                  ? void patchGroup(selectedGroup.id, { hidden: true })
                  : void patchBodies(selectedIds, { hidden: true }),
              disabled: busy || !body,
            },
            ...(selectedIds.length > 1 && !selectedGroup
              ? [
                  {
                    label: 'Luo kokoonpano',
                    run: () => void createGroup(openedAssembly, true),
                    disabled: busy,
                  },
                ]
              : []),
            {
              label: 'Siirrä ryhmään…',
              run: () => {
                setGroupDestination(selectedGroup?.parentId ?? body?.groupId ?? '');
                setGroupMove(
                  selectedGroup
                    ? { kind: 'group', id: selectedGroup.id }
                    : { kind: 'bodies', ids: [...selectedIds] },
                );
              },
              disabled:
                busy ||
                editing ||
                !!editingBodyId ||
                !!openedAssembly ||
                (!selectedGroup && !selectedIds.length),
            },
            ...(selectedGroup
              ? [
                  {
                    label: 'Poista ryhmä',
                    run: () => void removeGroup(selectedGroup.id),
                    disabled: busy,
                  },
                ]
              : []),
            ...(project.bodies.some((b) => selectedIdSet.has(b.id) && b.component)
              ? [{ label: 'Tee uniikiksi', run: makeUnique, disabled: busy }]
              : []),
            {
              label: `Poista valinta (${selectedIds.length})`,
              run: () => void removeBody(),
              reason: movementBlocked,
              disabled: busy || !selectedIds.length,
            },
          ];
  const chooseOther = () => {
    if (actionMenu?.candidates?.length) {
      setPickList({ ...actionMenu, candidates: actionMenu.candidates });
    } else {
      setPickOthers(true);
    }
    setActionMenu(undefined);
  };
  const pickPreviewIds = useMemo(
    () => (pickHovered ? selectionUnit(project, pickHovered, openedAssembly).ids : undefined),
    [pickHovered, project, openedAssembly],
  );
  const pickCandidates = (() => {
    const seen = new Set<string>();
    return (pickList?.candidates ?? []).flatMap((candidate) => {
      const part = project.bodies.find((b) => b.id === candidate.bodyId);
      if (!part) return [];
      const unit = selectionUnit(project, part.id, openedAssembly);
      const key = unit.groupId ?? part.id;
      if (seen.has(key)) return [];
      seen.add(key);
      const group = project.groups.find((g) => g.id === unit.groupId);
      return [
        {
          ...candidate,
          name: group?.name ?? part.name,
          description: [
            group
              ? `Kokoonpano · ${unit.ids.length} osaa`
              : groupPath(project.groups, part.groupId) || 'Päätaso',
            bodyLocked(part, project.groups) ? 'Hold' : '',
          ]
            .filter(Boolean)
            .join(' · '),
        },
      ];
    });
  })();
  const startCommandTool = (next: Tool) => {
    setRenderOpen(false);
    setPartsOpen(false);
    begin(next);
    setPanelOpen(true);
  };
  const commands: Command[] = [
    ...tools.map((t) => ({
      id: `tool-${t.id}`,
      label: t.label,
      group: 'Työkalut',
      shortcut: t.shortcut,
      keywords: (
        {
          extrude: 'pursota paksuus push pull',
          move: 'move siirto',
          rotate: 'rotate kierto',
          detail: 'viiste pyöristys fillet chamfer',
          paint: 'väri materiaali tekstuuri maalaa',
          boolean: 'cut join leikkaa yhdistä',
          offset: 'sisennys inset',
        } as Partial<Record<Tool, string>>
      )[t.id],
      reason: busy ? 'Odota keskeneräisen laskennan valmistumista.' : undefined,
      run: () => startCommandTool(t.id),
    })),
    ...(['ellipse', 'polygon'] as const).map((kind) => ({
      id: kind,
      label: kind === 'ellipse' ? 'Ellipsi' : 'Monikulmio',
      group: 'Muodot',
      reason: busy ? 'Odota laskennan valmistumista.' : undefined,
      run: () => {
        setShapeKind(kind);
        startCommandTool('circle');
      },
    })),
    ...(['dimension', 'guide', 'free'] as const).map((kind) => ({
      id: `measure-${kind}`,
      label:
        kind === 'dimension'
          ? 'Dimensio · kaksi pistettä'
          : kind === 'guide'
            ? 'Apuviiva'
            : 'Vapaa mittaviiva',
      group: 'Mittaaminen',
      keywords: 'mittaus mitta mitat mitoita pituus mittaviiva',
      reason: busy ? 'Odota laskennan valmistumista.' : undefined,
      run: () => {
        startCommandTool('measure');
        resetGesture();
        setMeasureMode(kind);
        setMeasureMenu(false);
        setAwaitingStart(true);
      },
    })),
    ...quickActions.map((a, i) => ({
      id: `selection-${i}`,
      label: a.label,
      group: 'Valinta',
      reason:
        a.reason ??
        (a.disabled ? (busy ? 'Odota laskennan valmistumista.' : 'Valitse ensin osa.') : undefined),
      run: () => {
        setRenderOpen(false);
        setPartsOpen(false);
        setMode('model');
        a.run();
      },
    })),
    {
      id: 'pick-other',
      label: 'Valitse toinen',
      group: 'Valinta',
      keywords: 'päällekkäiset takana peitossa',
      reason:
        mode !== 'model' || renderOpen || partsOpen
          ? 'Palaa ensin Malli-näkymään.'
          : busy
            ? 'Odota laskennan valmistumista.'
            : undefined,
      run: chooseOther,
    },
    {
      id: 'section',
      label: 'Poikkileikkaus',
      group: 'Näkymät',
      keywords: 'leikkaus leikkaustaso section',
      run: () => {
        startCommandTool('select');
        workspace.open('section');
      },
    },
    {
      id: 'reference-image',
      label: 'Pohjakuva',
      group: 'Näkymät',
      keywords: 'kuva mittakaava kalibroi',
      run: () => {
        startCommandTool('select');
        workspace.open('image');
      },
    },
    {
      id: 'drawing',
      label: 'Mittakuva',
      group: 'Työtilat',
      keywords: 'piirustus tulosta pdf',
      reason: !project.bodies.length
        ? 'Luo ensin osa.'
        : busy
          ? 'Odota laskennan valmistumista.'
          : undefined,
      run: openDrawing,
    },
    {
      id: 'render',
      label: 'Renderöi',
      group: 'Työtilat',
      keywords: 'render valokuva valo',
      reason: busy ? 'Odota laskennan valmistumista.' : undefined,
      run: openRender,
    },
    {
      id: 'model',
      label: 'Malli',
      group: 'Työtilat',
      keywords: 'mallinnus takaisin',
      run: closeRender,
    },
    {
      id: 'parts',
      label: 'Osaluettelo ja leikkauslista',
      group: 'Työtilat',
      keywords: 'osat levyt räjäytyskuva',
      reason: !project.bodies.length ? 'Luo ensin osa.' : undefined,
      run: openParts,
    },
    {
      id: 'cabinet',
      label: 'Levyrunko',
      group: 'Muodot',
      keywords: 'kaappi kaluste',
      reason: editingBodyId ? 'Lopeta ensin osan muokkaus.' : undefined,
      run: () => {
        startCommandTool('select');
        setCabinetOpen(true);
      },
    },
    {
      id: 'fit',
      label: 'Sovita malli näkymään',
      group: 'Kamera',
      keywords: 'zoom kamera',
      run: fit,
    },
    ...(
      [
        ['top', 'Ylhäältä'],
        ['front', 'Edestä'],
        ['right', 'Sivulta'],
        ['iso', '3D'],
      ] as const
    ).map(([id, label]) => ({
      id: `view-${id}`,
      label,
      group: 'Kamera',
      run: () => changeView(id),
    })),
  ];
  for (const command of commands) {
    if (!ready || busy) command.reason ??= 'Odota laskennan valmistumista.';
  }
  const activeTool = !['select', 'navigate'].includes(tool);
  const shapeTool = ['rectangle', 'circle', 'pen'].includes(tool);
  const toolTitle =
    tool === 'paint' && paintMode === 'texture'
      ? 'Tekstuurin asettelu'
      : tool === 'pen' && penMode === 'bezier'
        ? 'Bézier-käyrä'
        : tool === 'circle'
          ? { circle: 'Ympyrä', ellipse: 'Ellipsi', polygon: 'Monikulmio', sphere: 'Pallo' }[
              shapeKind
            ]
          : tool === 'measure'
            ? { dimension: 'Dimensio', guide: 'Apuviiva', free: 'Vapaa mittaviiva' }[measureMode]
            : tool === 'boolean'
              ? booleanOperation === 'cut'
                ? 'Leikkaa'
                : 'Yhdistä'
              : (tools.find((t) => t.id === tool)?.label ?? '');
  const targetName = selectedIds.length > 1 ? `${selectedIds.length} kappaletta` : body?.name;
  const shapeTarget =
    sketchTarget && project.bodies.find((b) => b.id === sketchTarget.bodyId)?.name;
  const toolContext =
    tool === 'circle' && shapeKind === 'sphere'
      ? 'Uusi pallo · keskipiste ja halkaisija'
      : shapeTool
        ? constructionLine
          ? 'Rakennusviiva · ei muuta pintaa'
          : editingBody && surfaceMode === 'region'
            ? `Muokkaa osaa · ${editingBody.name}`
            : tool === 'pen' && penSurface()
              ? `Viiva jakaa pinnan · ${shapeTarget}`
              : `Uusi osa${shapeTarget ? ` · ${shapeTarget} / pinta` : ''}`
        : editingBody
          ? `Muokkaa osaa · ${editingBody.name}`
          : targetName;
  const toolStep =
    tool === 'paint' && paintMode === 'texture'
      ? 'Valitse osa ja vedä kuviota tai kierto-/kokokahvaa. Veto tallentuu heti. Esc päättää.'
      : tool === 'move'
        ? selectedIds.length
          ? 'Tartu valinnan korostettuun pisteeseen ja vedä. Shift lisää osia valintaan.'
          : 'Osoita osaa ja tartu korostettuun pisteeseen.'
        : tool === 'extrude'
          ? faceTarget
            ? 'Vedä pintaa tai kirjoita mitta. Shift poimii tavoitteen toisesta pisteestä tai pinnasta.'
            : 'Osoita pintaa ja vedä siitä.'
          : tool === 'offset'
            ? faceTarget
              ? 'Säädä sisennystä hiirellä tai kirjoita mitta. Klikkaus tai Enter hyväksyy.'
              : 'Osoita pintaa ja napsauta tai vedä.'
            : tool === 'rectangle'
              ? awaitingStart
                ? 'Napsauta alkukulmaa näkymästä.'
                : 'Napsauta vastakulmaa tai kirjoita mitat. Enter hyväksyy.'
              : tool === 'circle'
                ? awaitingStart
                  ? 'Napsauta keskipistettä näkymästä.'
                  : 'Napsauta reunaa tai kirjoita halkaisija. Enter hyväksyy.'
                : tool === 'detail'
                  ? 'Valitse reunat tai vedä reunasta säätääksesi kokoa.'
                  : tool === 'measure'
                    ? guidePointEdit
                      ? 'Siirrä valitun viivan päätä. Muut viivat jäävät paikoilleen. Klikkaus tai Enter hyväksyy, Esc peruu.'
                      : measureMode === 'dimension'
                        ? 'Poimi kaksi pistettä. Vie mittaviiva sivulle ja napsauta.'
                        : measureMode === 'free'
                          ? 'Napsauta alkupistettä ja jatka pisteestä pisteeseen. Shift pitää suunnan lukittuna ja poimii pituuden toisesta pisteestä. X/Y/Z valitsee akselin. Enter tai Esc päättää ketjun.'
                          : instructions.measure
                    : instructions[tool];
  const linkTarget =
    tool === 'knife' || (tool === 'circle' && shapeKind === 'sphere')
      ? undefined
      : (editingBody ??
        (tool === 'detail'
          ? detailSource
          : ['extrude', 'offset'].includes(tool)
            ? project.bodies.find((b) => b.id === faceTarget?.bodyId)
            : !activeTool && selectedIds.length === 1
              ? body
              : undefined));
  const linkedCount = linkTarget?.component
    ? project.bodies.filter((b) => b.component?.id === linkTarget.component!.id).length
    : 0;
  const linkNotice = linkTarget && linkedCount > 1 && (
    <div className="component-link-notice" data-testid="component-link-notice">
      <div>
        <Link2 size={15} />
        <strong>{linkedCount} linkitettyä osaa</strong>
      </div>
      <p>Muodon muokkaus päivittyy kaikkiin. Sijainti ja kierto koskevat tätä osaa.</p>
      <button
        className="button subtle full"
        disabled={busy || bodyLocked(linkTarget, project.groups)}
        onClick={() =>
          void editor.transact(
            uniqueComponents(project, [linkTarget.id]),
            `Osasta ${linkTarget.name} tehtiin uniikki. Muut kopiot säilyivät.`,
          )
        }
      >
        Muokkaa vain tätä · tee uniikki
      </button>
    </div>
  );
  const surfaceActions = (
    <div className="shape-properties" aria-label="Piirroksen käyttö">
      <p className="muted">Erillinen piirros. Jaa alla oleva pinta tai leikkaa osien läpi.</p>
      <div className="object-quick-actions">
        <button
          className="button outlined"
          disabled={busy || openingBusy}
          onClick={() => void prepareSurfaceSplit()}
        >
          Jaa pinta
        </button>
        {canCutOpening && (
          <button
            className="button outlined"
            disabled={busy || openingBusy}
            onClick={() => void prepareOpening()}
          >
            Leikkaa aukko…
          </button>
        )}
      </div>
    </div>
  );
  const objectActions = body && !selectedGroup && mode === 'model' && (
    <ObjectActions
      key={`object:${colorContext}`}
      body={{ ...body, locked: bodyLocked(body, project.groups) }}
      groups={project.groups}
      count={selectedIds.length}
      mixedColor={project.bodies.some(
        (b) => selectedIdSet.has(b.id) && b.color.toLowerCase() !== body.color.toLowerCase(),
      )}
      busy={busy}
      onChange={(patch) => void patchBodies([body.id], patch)}
      onPreviewColor={(color) => previewColor(selectedIds.length ? selectedIds : [body.id], color)}
      onColor={(color) =>
        void patchBodies(selectedIds.length ? selectedIds : [body.id], {
          color,
        })
      }
      onGroup={(groupId) =>
        void patchBodies(selectedIds.length ? selectedIds : [body.id], {
          groupId,
        })
      }
      onOrigin={(reference) => void originSelected(reference)}
      onRotate={() => begin('rotate')}
      onHold={holdSelected}
      editing={!!editingBodyId}
      onEdit={() => openBodyEdit(body.id)}
    />
  );
  const numericInput = editing &&
    (tool !== 'move' || !!body) &&
    (tool !== 'rotate' || !!rotation) &&
    (tool !== 'measure' || !!guideDraft) &&
    (tool !== 'pen' || !!penPoints.length) &&
    !(tool === 'measure' && measureMode === 'dimension') &&
    numericFields.length > 0 && (
      <DynamicInput
        fields={numericFields}
        showActions={tool !== 'detail'}
        canAccept={
          tool !== 'detail' ||
          (!!detailTarget?.indices.length && !detailPreview.loading && !detailPreview.error)
        }
        position={popup}
        onPositionChange={setPopup}
        docked={panelOpen}
        locked={locked}
        onChange={field}
        activeKey={
          tool === 'extrude'
            ? extrusionMode
            : tool === 'move'
              ? (axis ?? moveInputAxis)
              : tool === 'pen'
                ? 'length'
                : undefined
        }
        initialValue={
          tool === 'move'
            ? (key, character) =>
                /^[\d.,]$/.test(character) && Number(fieldsRef.current[key as 'x' | 'y' | 'z']) < 0
                  ? `-${character}`
                  : character
            : undefined
        }
        onActivate={tool === 'extrude' ? activateExtrusion : undefined}
        onAccept={() => void apply()}
        onCancel={() => cancel()}
        busy={busy}
        title={
          panelOpen && !popup
            ? 'Mitat'
            : tool === 'detail'
              ? 'Viimeistele reunat'
              : tool === 'offset'
                ? 'Offset · sisennys'
                : tool === 'rotate'
                  ? 'Kierrä'
                  : tool === 'rectangle'
                    ? 'Suorakulmio'
                    : tool === 'circle'
                      ? shapeKind === 'sphere'
                        ? 'Pallo'
                        : shapeKind === 'circle'
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
          <img src={`${import.meta.env.BASE_URL}nivo.svg`} alt="" />
          <span>
            nivo<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="mode-switch" aria-label="Työtila">
          <button
            aria-pressed={!renderOpen && !partsOpen && mode === 'model'}
            onClick={closeRender}
          >
            <Box size={16} />
            Malli
          </button>
          <button
            aria-pressed={!renderOpen && !partsOpen && mode === 'drawing'}
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
          <button
            aria-pressed={partsOpen}
            disabled={!ready || busy || !project.bodies.length}
            onClick={openParts}
          >
            <Layers2 size={16} />
            Osat
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
            {editor.busy ? 'Lasketaan muutosta…' : editor.saveStatus || 'Valmistellaan…'}
          </span>
        </div>
        <button
          className="command-search-trigger icon-button"
          aria-label="Hae toiminto"
          title="Hae toiminto · Ctrl / ⌘ K"
          onClick={() => setCommandOpen(true)}
        >
          <Search size={16} />
          <span className="command-search-label">Hae</span>
        </button>
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
            {!renderOpen && !partsOpen && mode === 'model' && (
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
                          {
                            ...project,
                            settings: { ...project.settings, axisLabels },
                          },
                          'Akselitekstien näkyvyys päivitetty.',
                        )
                      }
                    />
                    Akselien nimet ja origo
                  </label>
                  <label>
                    Ruudukon askel (mm)
                    <input
                      aria-label="Ruudukon askel"
                      type="number"
                      min="0.1"
                      max="10000"
                      step="any"
                      key={project.settings.gridStep ?? 10}
                      defaultValue={project.settings.gridStep ?? 10}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={(e) => {
                        const gridStep = Number(e.target.value);
                        if (!Number.isFinite(gridStep) || gridStep < 0.1 || gridStep > 10000) {
                          e.currentTarget.value = String(project.settings.gridStep ?? 10);
                          editor.setError('Anna ruudukon askel väliltä 0,1–10 000 mm.');
                          return;
                        }
                        if (gridStep !== (project.settings.gridStep ?? 10))
                          void editor.transact(
                            {
                              ...project,
                              settings: { ...project.settings, gridStep },
                            },
                            'Ruudukon askel tallennettu.',
                          );
                      }}
                    />
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
                          {
                            ...project,
                            settings: { ...project.settings, guideXray: checked },
                          },
                          'Apuviivojen näkyvyys muutettu.',
                        )
                      }
                    />
                    Kaikki apuviivat x-ray
                  </label>
                </div>
              </details>
            )}
            {!renderOpen && !partsOpen && mode === 'model' && (
              <>
                {' '}
                <IconButton
                  label={panelOpen ? 'Piilota ominaisuudet' : 'Näytä ominaisuudet'}
                  aria-pressed={panelOpen}
                  onClick={() => setPanelOpen(!panelOpen)}
                >
                  {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
                </IconButton>
              </>
            )}
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

      <div
        className={`workspace ${panelOpen ? 'panel-open' : ''} ${mode === 'drawing' ? 'drawing-workspace' : ''}`}
        hidden={renderOpen || partsOpen}
        data-dock={mode === 'model' ? dock : undefined}
      >
        {mode === 'model' && (
          <>
            {guidePointMenu && (
              <GuidePointMenu
                {...guidePointMenu}
                choices={guidePointMenu.targets.map((target) => {
                  const index = project.guides.findIndex((g) => g.id === target.guideId);
                  return {
                    target,
                    label: `Viiva ${index + 1} · ${Number((project.guides[index]?.length ?? 0).toFixed(2)).toLocaleString('fi-FI')} mm`,
                  };
                })}
                onPreview={setSelectedGuideId}
                onClose={() => setGuidePointMenu(undefined)}
                onMove={editGuidePoint}
                onRemove={(target) => {
                  setGuidePointMenu(undefined);
                  void removeGuide(target.guideId);
                }}
              />
            )}
            <ToolRail
              dock={dock}
              onDock={(next) => {
                setDock(next);
                localStorage.setItem('nivo-tool-dock', next);
              }}
              tools={tools}
              tool={tool}
              busy={busy}
              onTool={(next) => {
                if (next === 'pen') setPenMode('line');
                begin(next);
              }}
              measureMode={measureMode}
              measureMenu={measureMenu}
              onMeasureMenu={setMeasureMenu}
              onMeasureMode={(mode) => {
                begin('measure');
                resetGesture();
                setAwaitingStart(false);
                setMeasureMode(mode);
                setMeasureMenu(false);
              }}
              onCabinet={() => {
                resetGesture();
                setTool('select');
                setCabinetOpen(true);
              }}
              onThroughShapes={() => {
                begin('select');
                resetGesture();
                setEditingBodyId(undefined);
                setSurfaceMode('new');
                setPanelOpen(true);
                setLoftIds(
                  selectedIds.filter((id) =>
                    project.bodies.some((b) => b.id === id && !featureIsSolid(b.feature)),
                  ),
                );
                setLoftOpen(true);
              }}
              onShape={(shape) => {
                if (shape === 'bezier') {
                  setPenMode('bezier');
                  begin('pen');
                  setShapeName(`Bézier ${project.bodies.length + 1}`);
                  return;
                }
                if (shape !== 'rectangle') setShapeKind(shape);
                begin(shape === 'rectangle' ? 'rectangle' : 'circle');
                if (shape === 'sphere') setShapeName(`Pallo ${project.bodies.length + 1}`);
              }}
            />
          </>
        )}

        <main className={`canvas-area ${editingBody && mode === 'model' ? 'is-editing' : ''}`}>
          {pickOthers && (
            <div className="pick-instruction" role="status">
              Napsauta kohtaa, jonka päällekkäiset osat haluat nähdä.
              <button onClick={() => setPickOthers(false)}>Peru · Esc</button>
            </div>
          )}
          <div className="canvas-topbar" hidden={mode !== 'model'}>
            <DisplayControls
              display={project.settings.modelDisplay}
              ids={selectedIds}
              bodyIds={project.bodies.map((b) => b.id)}
              disabled={busy}
              onChange={changeDisplay}
              onOverview={() => changeView('iso', true)}
            />
            <div className="view-actions">
              <IconButton
                label={
                  project.settings.measurementsHidden
                    ? 'Näytä kaikki mittaviivat'
                    : 'Piilota kaikki mittaviivat'
                }
                aria-pressed={!project.settings.measurementsHidden}
                disabled={busy}
                onClick={() => void toggleMeasurements()}
              >
                <Ruler />
              </IconButton>
              <IconButton
                label="Leikkaus"
                aria-pressed={!!workspace.section || workspace.panel === 'section'}
                onClick={() => {
                  begin('select');
                  workspace.open('section');
                }}
              >
                <ScanLine />
              </IconButton>
              <IconButton
                label="Pohjakuva"
                aria-pressed={workspace.panel === 'image'}
                onClick={() => {
                  begin('select');
                  workspace.open('image');
                }}
              >
                <ImagePlus />
              </IconButton>
              {isolated?.projectId === project.id ? (
                <IconButton
                  label="Näytä koko malli"
                  aria-pressed
                  onClick={() => setIsolated(undefined)}
                >
                  <Focus />
                </IconButton>
              ) : (
                selectedIds.length > 0 && (
                  <IconButton label="Eristä valinta" onClick={isolateSelection}>
                    <Focus />
                  </IconButton>
                )
              )}
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
          </div>

          <div className="model-stage" hidden={mode !== 'model'}>
            {workspace.ui}
            {workspace.section && workspace.panel !== 'section' && (
              <div className="section-notice" role="status">
                Leikkaus {workspace.section.name}{' '}
                <button onClick={workspace.disableSection}>Poista leikkaus käytöstä</button>
              </div>
            )}
            {isolated?.projectId === project.id && (
              <div className="isolation-notice" role="status">
                Eristetty näkymä · {visibleBodies.length} osaa{' '}
                <button onClick={() => setIsolated(undefined)}>Palauta näkymä</button>
              </div>
            )}
            <ModelBrowser>
              <div className="object-panel">
                <div className="panel-tabs">
                  <button aria-pressed={tab === 'objects'} onClick={() => setTab('objects')}>
                    Kappaleet <span>{project.bodies.length}</span>
                  </button>
                  <button aria-pressed={tab === 'dimensions'} onClick={() => setTab('dimensions')}>
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
                            !points ? 'broken' : selectedGuideSet.has(g.id) ? 'selected' : ''
                          }
                        >
                          <button onClick={(event) => selectGuide(g.id, event.shiftKey)}>
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
                      <p className="empty-list">Mittatyökalulla voit luoda mitta- ja apuviivoja.</p>
                    )}
                  </div>
                ) : (
                  <div className="dimension-list">
                    {project.dimensions.length ? (
                      project.dimensions.map((d) => {
                        const value = dimensionValue(project, d);
                        return (
                          <div key={d.id} className={value === null ? 'broken' : ''}>
                            <button onClick={() => select(dimensionBodyIds(d, project)[0])}>
                              <Ruler size={15} />
                              <span>
                                {value === null
                                  ? 'Viite puuttuu'
                                  : `${d.axis === 'distance' ? 'Pisteväli' : d.axis.toUpperCase()} · ${formatLength(value)} mm`}
                                <small>
                                  {(isPointDimension(d)
                                    ? 'Kahden pisteen dimensio · vedä mittaa mallissa'
                                    : dimensionEnvelope(project, d)?.name) ?? 'Poistettu kappale'}
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
                        <p>Lisää mitta Mittatyökalulla tai avaa Mittakuva.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ModelBrowser>
            {openedAssembly && !editingBody && (
              <div className="edit-context assembly-context" data-testid="assembly-context">
                <Box size={18} />
                <div>
                  <strong>Kokoonpano avoinna</strong>
                  <span>{groupPath(project.groups, openedAssembly).replaceAll(' / ', ' › ')}</span>
                </div>
                <button
                  onClick={() => {
                    setOpenedAssembly(
                      groupAncestors(project.groups, openedAssembly)
                        .slice(1)
                        .find((g) => g.kind === 'assembly')?.id,
                    );
                    select(undefined, undefined, false, true);
                  }}
                >
                  Sulje kokoonpano
                </button>
              </div>
            )}
            {editingBody && (
              <div className="edit-context" data-testid="edit-context" data-notice={!!editNotice}>
                <Pencil size={19} aria-hidden="true" />
                <div className="edit-context-copy" role="status">
                  <div className="edit-context-title">
                    <span>Muokkaustila</span>
                    <strong title={editingBody.name}>{editingBody.name}</strong>
                    {editingBody.groupId && (
                      <small className="edit-breadcrumb">
                        {groupPath(project.groups, editingBody.groupId).replaceAll(' / ', ' › ')}
                      </small>
                    )}
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
              onCameraView={setView}
              onCameraProjection={setProjection}
              constraintReset={constraintReset}
              modelDisplay={project.settings.modelDisplay}
              knifeMode={knifeMode}
              knifeCommand={knifeCommand}
              onKnife={(rays, normal) => void applyKnife(rays, normal)}
              onKnifeExit={() => begin('select')}
              section={workspace.section}
              sectionResult={workspace.sectionResult}
              sectionControls={workspace.sectionControls}
              sectionExtent={workspace.sectionExtent}
              sectionPick={workspace.sectionPick}
              onWorkspaceCancel={workspace.onWorkspaceCancel}
              onSectionPick={workspace.onSectionPick}
              onSectionMove={workspace.onSectionMove}
              referenceImages={workspace.referenceImages}
              calibration={workspace.calibration}
              onCalibrationPoint={workspace.onCalibrationPoint}
              detailTarget={detailTarget}
              detailPreview={tool === 'detail' ? detailPreview.result : undefined}
              surfacePreview={loftOpen ? loftPreview : undefined}
              detailSize={offsetDistance}
              detailSizeLocked={locked.has('offset')}
              detailOperation={detailOperation}
              detailPreviewSize={tool === 'detail' ? detailPreview.size : undefined}
              onDetailDragCancel={() => {
                const before = detailDragBefore.current;
                if (!before) return;
                detailDragBefore.current = undefined;
                setDetailTarget(before.target);
                setSelected(before.selected);
                setSelectedIds(before.selectedIds);
                setAwaitingStart(before.awaiting);
                writeFields({ offset: before.size });
                if (before.locked) lockRef.current.add('offset');
                else lockRef.current.delete('offset');
                setLocked(new Set(lockRef.current));
              }}
              onDetailEdge={(id, index, dragging = false) => {
                if (editingBodyId && id !== editingBodyId) {
                  explainEditContext();
                  return;
                }
                const source = project.bodies.find((b) => b.id === id);
                if (!source || bodyLocked(source, project.groups)) return;
                if (dragging) {
                  detailDragBefore.current = {
                    target: detailTarget,
                    size: fieldsRef.current.offset,
                    locked: lockRef.current.has('offset'),
                    selected,
                    selectedIds,
                    awaiting: awaitingStart,
                  };
                  lockRef.current.delete('offset');
                  setLocked(new Set(lockRef.current));
                }
                editor.setError('');
                if (detailTarget?.bodyId !== id && source.edgeTreatment) {
                  writeFields({ offset: String(source.edgeTreatment.size) });
                  setDetailOperation(source.edgeTreatment.operation);
                }
                setDetailTarget((old) => ({
                  bodyId: id,
                  indices:
                    index < 0
                      ? (source.edgeTreatment?.indices ?? [])
                      : old?.bodyId === id
                        ? old.indices.includes(index)
                          ? dragging
                            ? old.indices
                            : old.indices.filter((i) => i !== index)
                          : [...old.indices, index]
                        : [...new Set([...(source.edgeTreatment?.indices ?? []), index])],
                }));
                setSelected(id);
                setSelectedIds([id]);
                setSelectedGroupId(undefined);
                setAwaitingStart(false);
                gestureActive.current = true;
              }}
              editingBodyId={editingBodyId}
              scopeIds={scopeIds}
              onPaint={paintBody}
              editingTexture={busy ? undefined : activeTexture}
              colorPreview={colorPreview}
              onTexture={previewTexture}
              onTextureCommit={commitTexture}
              modalOpen={
                commandOpen ||
                measureMenu ||
                !!guidePointMenu ||
                !!pickList ||
                !!groupMove ||
                !!openingDraft ||
                openingBusy ||
                !!surfaceSplitDraft
              }
              pickOthers={pickOthers}
              pickHoveredIds={pickPreviewIds}
              onPickCandidates={(list) => {
                setPickOthers(false);
                setPickList(list);
              }}
              onContextMenu={({ x, y, bodyId, guideId, candidates }) => {
                if (busy) return;
                if (
                  bodyId &&
                  (!inAssembly(project, bodyId, openedAssembly) ||
                    (editingBodyId && bodyId !== editingBodyId))
                ) {
                  explainEditContext({ x, y });
                  return;
                }
                if (guideId) {
                  if (!selectedGuideSet.has(guideId)) selectGuide(guideId);
                } else {
                  setSelectedGuideId(undefined);
                  if (bodyId && !selectedIdSet.has(bodyId)) select(bodyId);
                }
                if (bodyId || guideId || selectedIds.length) {
                  setActionMenu({ x, y, candidates });
                  setPanelOpen(true);
                }
              }}
              onEditBody={openBodyEdit}
              onCloseBodyEdit={closeBodyEdit}
              onEditBlocked={explainEditContext}
              onRemoveBoundary={(target) => void eraseBoundary(target)}
              onRemoveWire={(id) => {
                if (!busy) {
                  try {
                    void editor.transact(removeSelection(project, [id]), 'Piirrosviiva poistettu.');
                  } catch (e) {
                    editor.setError((e as Error).message);
                  }
                }
              }}
              onRemoveGuide={(id) => void removeGuide(id)}
              assets={project.assets}
              bodies={visibleBodies}
              groups={project.groups}
              meshes={visibleMeshes}
              selected={selected}
              selectedIds={loftOpen ? loftIds : selectedIds}
              moveHoveredIds={openingDraft?.included ?? moveHoveredIds}
              selectionHoveredIds={selectionHoveredIds}
              onSelectionHover={setSelectionHovered}
              onMoveHover={(id) => {
                setMoveHovered(id);
                return id
                  ? selectedIds.length || selectionUnit(project, id, openedAssembly).ids.length
                  : 0;
              }}
              selectedGroupId={selectedGroupId}
              selectedFace={selectedFace}
              tool={tool}
              preview={preview}
              axis={axis}
              gridSnap={gridSnap}
              gridStep={project.settings.gridStep ?? 10}
              busy={busy}
              command={cameraCommand}
              guides={visibleGuides}
              guidePreview={tool === 'measure' ? guidePreview : undefined}
              measureMode={measureMode}
              measureStart={measureStart}
              guidePointEditing={!!guidePointEdit}
              onEditGuidePoint={editGuidePoint}
              onGuidePointMenu={(menu) => {
                if (busy) return;
                setSelectedGuideId(menu.targets[0].guideId);
                setGuidePointMenu(menu);
              }}
              penPoints={penPoints}
              penMode={penMode}
              bezierStyle={bezierStyle}
              penHover={penHover}
              reference={reference}
              pickReference={pickReference}
              epoch={epoch}
              onSelect={select}
              onSelectMany={(ids, additive, guideIds = []) => {
                if (loftOpen) {
                  setLoftIds(
                    [...new Set([...(additive ? loftIds : []), ...ids])].filter((id) =>
                      project.bodies.some((b) => b.id === id && !featureIsSolid(b.feature)),
                    ),
                  );
                  return;
                }
                if (tool === 'boolean') {
                  const solid = new Set(
                    project.bodies.filter((b) => featureIsSolid(b.feature)).map((b) => b.id),
                  );
                  const next = [
                    ...new Set([
                      ...(additive
                        ? booleanActive === 'targets'
                          ? booleanTargets
                          : booleanTools
                        : []),
                      ...ids.filter((id) => solid.has(id)),
                    ]),
                  ];
                  const set = new Set(next);
                  if (booleanActive === 'targets') {
                    setBooleanTargets(next);
                    setBooleanTools((old) => old.filter((id) => !set.has(id)));
                  } else {
                    setBooleanTools(next);
                    setBooleanTargets((old) => old.filter((id) => !set.has(id)));
                  }
                  return;
                }
                if (!additive && selectedIds.length + selectedGuideIds.length > 1)
                  activityHistory.prepare(actionContext);
                const visible = new Set(visibleBodies.map((b) => b.id));
                const allowed = ids
                  .filter(
                    (id) =>
                      visible.has(id) &&
                      (!editingBodyId || id === editingBodyId) &&
                      inAssembly(project, id, openedAssembly),
                  )
                  .flatMap((id) => selectionUnit(project, id, openedAssembly).ids);
                const next = additive
                  ? [...new Set([...selectedIds, ...allowed])]
                  : [...new Set(allowed)];
                setSelectedIds(next);
                setSelected(next[0]);
                setSelectedFace(undefined);
                setSelectedGuideId(undefined);
                setSelectedGroupId(undefined);
                setAwaitingStart(true);
                setMeasureMenu(false);
                resetGesture();
                const chosenGuides = additive
                  ? [...new Set([...selectedGuideIds, ...guideIds])]
                  : guideIds;
                setSelectedGuideIds(chosenGuides);
                if (chosenGuides.length && !next.length) setTab('guides');
                if (tool === 'rotate' && next.length) startRotation(next);
                editor.setMessage(
                  `${[next.length ? `${next.length} osaa` : '', chosenGuides.length ? `${chosenGuides.length} viivaa` : ''].filter(Boolean).join(' + ') || '0 kohdetta'} valittu.${next.length && !chosenGuides.length ? ' M siirtää valinnan.' : ''}`,
                );
              }}
              radialShape={shapeKind === 'sphere' ? 'circle' : shapeKind}
              spherePreview={tool === 'circle' && shapeKind === 'sphere'}
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
              dimensions={
                dimensionDraft
                  ? [...visibleDimensions.filter((d) => d.id !== dimensionDraft.id), dimensionDraft]
                  : visibleDimensions
              }
              onDimensionPreview={setDimensionDraft}
              onDimensionCommit={(d) => void commitDimension(d)}
              dimensionDisplay={project.settings.dimensionDisplay}
              moveMode={project.settings.moveMode ?? 'axis'}
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
              selectedGuideIds={selectedGuideIds}
              freeRotate={freeRotate}
              guideRotationStep={guideRotationStep}
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
                // Releasing Shift must not discard a typed length. An explicit
                // new axis reorients it using the unmodified pointer position.
                const start = penRef.current.at(-1);
                if (tool === 'pen' && direction && start && penPointerRef.current) {
                  penDirectionRef.current = penTravelDirection(
                    start,
                    penPointerRef.current,
                    direction,
                    penDirectionRef.current,
                  );
                  if (lockRef.current.has('length'))
                    penLengthDirectionRef.current = penDirectionRef.current;
                }
              }}
              onAccept={(continueMeasure) => void apply(false, continueMeasure)}
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
                } else
                  changeRotation({
                    pivot,
                    ...(axis ? { axis } : {}),
                    picking: undefined,
                  });
                setAwaitingStart(false);
              }}
              onRotationAngle={(angle) => {
                if (!lockRef.current.has('angle')) writeFields({ angle: inputNumber(angle) });
              }}
              onRotationAxis={(axis) => changeRotation({ axis, picking: undefined })}
              onStart={() => {
                activityHistory.prepare(actionContext);
                gestureActive.current = true;
                setAwaitingStart(false);
              }}
              onMoveTarget={(id) => {
                if (selectedIds.length && !selectedIdSet.has(id)) return undefined;
                setSelected(id);
                if (!selectedIdSet.has(id)) {
                  const unit = selectionUnit(project, id, openedAssembly);
                  setSelectedIds(unit.ids);
                  setSelectedGroupId(unit.groupId);
                  setSelectedFace(undefined);
                  return unit.ids;
                }
                setSelectedFace(undefined);
                return selectedIds;
              }}
            />
            {!panelOpen && numericInput}
            {tool === 'select' && selectedGuide && !selectedIds.length && (
              <div className="guide-actions" role="toolbar" aria-label="Viivan toiminnot">
                <span>
                  <Ruler size={16} />
                  {selectedGuide.mode === 'guide' ? 'Apuviiva' : 'Mittaviiva'}
                </span>
                <button disabled={busy} onClick={() => editGuide(selectedGuide)}>
                  <Pencil size={15} /> Muokkaa
                </button>
                <button
                  disabled={busy}
                  onClick={() => rotateGuide()}
                  title="Kierrä mittaviivaa · R"
                >
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
            {['select', 'move'].includes(tool) &&
              selectedGuideIds.length > 0 &&
              (selectedGuideIds.length > 1 || selectedIds.length > 0) && (
                <div className="guide-actions" role="toolbar" aria-label="Viivojen valinta">
                  <span>
                    <Ruler size={16} />
                    {selectedGuideIds.length} viivaa
                    {selectedIds.length ? ` + ${selectedIds.length} osaa` : ''}
                  </span>
                  <button disabled={busy} onClick={() => void removeBody()}>
                    <Trash2 size={15} />
                    Poista valinta
                  </button>
                  <button disabled={busy} onClick={() => setSelectedGuideIds([])}>
                    Vapauta viivat
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
            {(editing || ['rectangle', 'circle'].includes(tool)) &&
              !['extrude', 'offset', 'rotate', 'detail'].includes(tool) &&
              (tool !== 'move' || !!axis) &&
              !(tool === 'measure' && measureMode === 'dimension') && (
                <div className="reference-bar">
                  {tool !== 'move' && (
                    <>
                      <button
                        aria-pressed={pickReference}
                        onClick={() => setPickReference(!pickReference)}
                      >
                        <Crosshair size={15} />
                        {pickReference ? 'Napauta viitepistettä' : 'Poimi viite'}
                      </button>
                      {reference && (
                        <button
                          data-testid="reference-lock"
                          onClick={() => setReference(undefined)}
                        >
                          Viite: {reference.label} <X size={14} />
                        </button>
                      )}
                    </>
                  )}
                  {(axis || penConstraint) && (
                    <button
                      onClick={() => {
                        setAxis(undefined);
                        constraintRef.current = undefined;
                        setPenConstraint(undefined);
                        clearLocks();
                        setConstraintReset((value) => value + 1);
                      }}
                      aria-label="Vapauta suuntalukko"
                    >
                      {axis ? `${axis.toUpperCase()}-akseli` : 'Suunta lukittu'} · Vapauta{' '}
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
            {!project.bodies.length &&
              !project.referenceImages?.length &&
              tool === 'select' &&
              !editing && (
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
                  <button
                    className="button dark"
                    disabled={busy}
                    onClick={() => begin('rectangle')}
                  >
                    <Plus size={18} />
                    Piirrä suorakulmio
                  </button>
                  <button
                    className="welcome-example"
                    disabled={busy}
                    onClick={() => void example()}
                  >
                    Tai avaa esimerkkikaappi <span>↗</span>
                  </button>
                  <button
                    className="welcome-example"
                    disabled={busy}
                    onClick={() => void finishedExample()}
                  >
                    Viimeistelty kaappi · mitat ja materiaalit <span>↗</span>
                  </button>
                  <button
                    className="welcome-example"
                    disabled={busy}
                    onClick={() => void finishedExample(true)}
                  >
                    Käyräesimerkki · pullo ja kartio <span>↗</span>
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
                  setSnapLabel(
                    !gridSnap
                      ? `Ruudukko · ${project.settings.gridStep ?? 10} mm`
                      : 'Geometriatartunnat',
                  );
                }}
              >
                <Grid2X2 size={15} />
                {gridSnap ? `Ruudukko ${project.settings.gridStep ?? 10} mm` : 'Ruudukko pois'}
              </button>
            </div>
          </div>
          {mode === 'drawing' &&
            (drawingSheetOpen ? (
              <SheetWorkspace
                key={project.id}
                project={project}
                cad={editor.cad}
                busy={busy}
                selectedIds={selectedIds}
                selectedGroupId={selectedGroupId}
                onCommit={editor.transact}
                onBack={() => setDrawingSheetOpen(false)}
              />
            ) : project.sections?.some((s) => s.id === drawingSectionId) ? (
              <SectionDrawing
                onSheets={() => setDrawingSheetOpen(true)}
                project={project}
                selectedIds={selectedIds}
                section={project.sections.find((s) => s.id === drawingSectionId)!}
                cad={editor.cad}
                busy={busy}
                onCommit={editor.transact}
                onSection={setDrawingSectionId}
                onBack={() => setDrawingSectionId(undefined)}
              />
            ) : (
              <DrawingWorkspace
                onSheets={() => setDrawingSheetOpen(true)}
                onSection={setDrawingSectionId}
                project={project}
                cad={editor.cad}
                meshes={editor.meshes}
                selectedIds={selectedIds}
                selectedGroupId={selectedGroupId}
                busy={busy}
                onCommit={(next, message) => editor.transact(next, message)}
              />
            ))}

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

        {panelOpen && mode === 'model' && loftOpen && (
          <aside className="inspector" aria-label="Ominaisuudet">
            <ThroughShapesPanel
              bodies={project.bodies}
              ids={loftIds}
              onIds={setLoftIds}
              cad={editor.cad}
              busy={busy}
              onPreview={setLoftPreview}
              onClose={() => {
                if (busy) editor.cancel();
                setLoftOpen(false);
                setLoftPreview(undefined);
              }}
              onCommit={async (result, ids, hide) => {
                const next = { ...result.body, groupId: openedAssembly };
                activityHistory.prepare(actionContext);
                const ok = await editor.transact(
                  {
                    ...project,
                    bodies: [
                      ...project.bodies.map((b) =>
                        hide && ids.includes(b.id) ? { ...b, hidden: true } : b,
                      ),
                      next,
                    ],
                  },
                  `Muotojen läpi · ${ids.length} profiilia. Lähtömuodot säilyvät mallilistassa.`,
                );
                if (ok) {
                  setLoftOpen(false);
                  setLoftPreview(undefined);
                  select(next.id, undefined, false, true);
                }
              }}
            />
          </aside>
        )}
        {panelOpen && mode === 'model' && !loftOpen && (
          <aside className="inspector" aria-label="Ominaisuudet">
            <div
              ref={inspectorDetails}
              className={`inspector-details ${activeTool ? 'tool-inspector' : ''}`}
            >
              {activeTool && (
                <ToolContext
                  title={`${toolTitle}${tool === 'move' && selectedIds.length > 1 ? ` · ${selectedIds.length} kappaletta` : ''}`}
                  context={toolContext}
                  instruction={toolStep}
                  status={[
                    axis ? `${axis.toUpperCase()}-akseli` : '',
                    copyMove && tool === 'move' ? 'Kopio' : '',
                    editing ? snapLabel : 'Valmis aloitukseen',
                  ].filter(Boolean)}
                  onFinish={() => cancel(true)}
                />
              )}
              {activeTool && linkNotice}
              {tool === 'paint' && (
                <>
                  <div className="material-tool-tabs" role="group" aria-label="Maalauksen työkalut">
                    <button
                      aria-pressed={paintMode === 'paint'}
                      onClick={() => setPaintMode('paint')}
                    >
                      Maalaa
                    </button>
                    <button
                      aria-pressed={paintMode === 'texture'}
                      onClick={() => setPaintMode('texture')}
                    >
                      Tekstuurin asettelu
                    </button>
                  </div>
                  {paintMode === 'paint' ? (
                    <PaintPanel
                      {...brush}
                      count={selectedIds.length}
                      all={paintAll}
                      linked={paintLinked}
                      onChange={(appearance, color) => setBrush({ appearance, color })}
                      onAll={setPaintAll}
                      onLinked={setPaintLinked}
                    />
                  ) : (
                    <TexturePanel
                      texture={activeTexture?.texture}
                      name={textureBody?.name}
                      count={textureSelection.length}
                      disabled={busy || textureSelectionBlocked}
                      onChange={previewTexture}
                      onCommit={commitTexture}
                      onVary={varySelectedTextures}
                    />
                  )}
                </>
              )}
              {numericInput}
              {canRepeat && ['select', 'move'].includes(tool) && (
                <RepeatAction
                  copy={repeatStep.copy}
                  parts={repeatStep.ids.length}
                  offset={repeatLabel}
                  count={repeatCount}
                  busy={busy}
                  onCount={setRepeatCount}
                  onRepeat={() => void repeatLast()}
                />
              )}
              {tool === 'paint' ? null : tool === 'measure' && measureMode === 'dimension' ? (
                <section className="dimension-tool-panel" aria-label="Dimensio">
                  <h2>Kahden pisteen dimensio</h2>
                  <p>
                    Poimi ensimmäinen ja toinen piste. Vie mittaviiva sivulle ja napsauta tai
                    hyväksy Enterillä. Voit myös vetää toisesta pisteestä ja vapauttaa.
                  </p>
                  <label className="modeling-field">
                    Mittatapa
                    <select
                      aria-label="Dimension mittatapa"
                      value={axis ?? 'distance'}
                      onChange={(e) =>
                        setAxis(
                          e.target.value === 'distance' ? undefined : (e.target.value as Axis),
                        )
                      }
                    >
                      <option value="distance">Todellinen pisteväli</option>
                      <option value="x">X-akselin suunta</option>
                      <option value="y">Y-akselin suunta</option>
                      <option value="z">Z-akselin suunta</option>
                    </select>
                  </label>
                  <p className="muted">
                    X, Y ja Z vaihtavat mittatapaa. Sama näppäin uudelleen palauttaa pistevälin.
                    Valmista mittaviivaa voi siirtää vetämällä tekstiä Valitse-tilassa.
                  </p>
                  {dimensionDraft && (
                    <p>{formatLength(dimensionValue(project, dimensionDraft) ?? 0)} mm</p>
                  )}
                  <button className="button outlined full" onClick={() => setMeasureMenu(true)}>
                    Vaihda mittaustilaa
                  </button>
                </section>
              ) : tool === 'knife' ? (
                <section className="knife-panel" aria-label="Veitsen asetukset">
                  <p className="knife-targets">
                    {selectedIds.length ? 'Valitut osat' : 'Näkyvät osat'} · {knifeTargets.length}{' '}
                    muokattavaa kohdetta
                  </p>
                  <label className="modeling-field">
                    Reitti
                    <select
                      aria-label="Veitsen reitti"
                      value={knifeMode}
                      onChange={(e) => setKnifeMode(e.target.value as typeof knifeMode)}
                    >
                      <option value="line">Suora</option>
                      <option value="polyline">Taitettu / siluetti</option>
                      <option value="curve">Bézier-kaari</option>
                      <option value="free">Vapaa viilto</option>
                    </select>
                  </label>
                  <p>
                    {knifeMode === 'line'
                      ? 'Vedä viiva osien yli tai napsauta alku ja loppu.'
                      : knifeMode === 'curve'
                        ? 'Napsauta alku, kaksi ohjauspistettä ja loppu.'
                        : knifeMode === 'free'
                          ? 'Pidä painike pohjassa ja piirrä viilto. Vapautus leikkaa.'
                          : 'Napsauta reitin pisteet ja paina Enter. Alkupisteeseen palaaminen sulkee siluetin ja leikkaa.'}
                  </p>
                  <p>
                    Molemmat puolet jäävät erillisiksi osiksi. Linkitetyt kopiot saavat saman
                    leikkauksen ja vastaavat palat pysyvät linkitettyinä. Hold estää muokkaamisen.
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={knifeUnique}
                      disabled={busy}
                      onChange={(e) => setKnifeUnique(e.target.checked)}
                    />
                    Tee kohteista uniikkeja · muuta vain valittuja
                  </label>
                  <button
                    className="button dark full"
                    disabled={busy}
                    onClick={() => setKnifeCommand({ id: performance.now(), action: 'finish' })}
                  >
                    Leikkaa reitti · Enter
                  </button>
                  <button
                    className="button outlined full"
                    disabled={busy}
                    onClick={() => setKnifeCommand({ id: performance.now(), action: 'clear' })}
                  >
                    Tyhjennä reitti
                  </button>
                  <button className="button outlined full" onClick={() => begin('select')}>
                    Lopeta veitsi · Esc
                  </button>
                </section>
              ) : tool === 'detail' ? (
                <EdgeDetailPanel
                  operation={detailOperation}
                  onOperation={setDetailOperation}
                  count={detailTarget?.indices.length ?? 0}
                  bodyName={detailSource?.name}
                  retained={!!detailSource?.edgeTreatment}
                  onRemove={() => {
                    if (detailSource)
                      void editor
                        .transact(async () => {
                          requireMovable([detailSource], project.groups);
                          return {
                            ...project,
                            bodies: await Promise.all(
                              project.bodies.map((b) =>
                                b.id === detailSource.id ? editor.cad.removeDetail(b) : b,
                              ),
                            ),
                          };
                        }, 'Reunakäsittely poistettu.')
                        .then((ok) => {
                          if (ok) finishOperation(detailSource.id);
                        });
                  }}
                  onFinalize={() => {
                    if (detailSource)
                      void editor
                        .transact(async () => {
                          requireMovable([detailSource], project.groups);
                          return {
                            ...project,
                            bodies: project.bodies.map((b) =>
                              b.id === detailSource.id ? { ...b, edgeTreatment: undefined } : b,
                            ),
                          };
                        }, 'Käsittely liitetty geometriaan. Voit aloittaa uuden käsittelyn.')
                        .then((ok) => {
                          if (ok)
                            setDetailTarget({
                              bodyId: detailSource.id,
                              indices: [],
                            });
                        });
                  }}
                  busy={busy || (!!detailSource && bodyLocked(detailSource, project.groups))}
                  loading={detailPreview.loading}
                  error={detailPreview.error}
                  onAccept={() => void apply()}
                  onCancel={() => cancel()}
                  all={() => {
                    if (detailSource) {
                      setDetailTarget({
                        bodyId: detailSource.id,
                        indices: (() => {
                          const mesh = editor.meshes.find((m) => m.id === detailSource.id);
                          return (mesh?.sourceDetailEdges ?? mesh?.detailEdges ?? []).map(
                            (e) => e.index,
                          );
                        })(),
                      });
                      setAwaitingStart(false);
                      gestureActive.current = true;
                    }
                  }}
                  clear={() =>
                    setDetailTarget((old) => (old ? { ...old, indices: [] } : undefined))
                  }
                />
              ) : tool === 'rotate' ? (
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
                  onCancel={() => cancel()}
                  busy={busy}
                />
              ) : activeTool ? (
                <>
                  <div className="tool-fields">
                    {tool === 'offset' && offsetPreview.error && (
                      <p role="status" className="muted">
                        {offsetPreview.error}
                      </p>
                    )}
                    {tool === 'move' && (
                      <>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            aria-label="Siirrä kopio"
                            checked={copyMove}
                            onChange={(e) => changeCopyMove(e.target.checked)}
                          />
                          Siirrä kopio · Ctrl vaihtaa
                        </label>
                        <label className="checkbox-label">
                          <CommitCheckbox
                            label="Vapaa siirto (XYZ)"
                            checked={project.settings.moveMode === 'free'}
                            onChange={(free) =>
                              editor.transact(
                                {
                                  ...project,
                                  settings: {
                                    ...project.settings,
                                    moveMode: free ? 'free' : 'axis',
                                  },
                                },
                                'Siirtotapa vaihdettu.',
                              )
                            }
                          />
                          Vapaa siirto (XYZ)
                        </label>
                        <p className="muted">
                          Oletuksena yksi akseli vedon suunnasta. X/Y/Z vaihtaa akselin. Ctrl
                          painallus vaihtaa siirron ja kopion välillä.
                        </p>
                      </>
                    )}
                    {['rectangle', 'circle'].includes(tool) && (
                      <label className="modeling-field">
                        Piirtotaso
                        <select
                          aria-label="Piirtotaso"
                          value={axis ?? 'auto'}
                          onChange={(e) =>
                            setAxis(
                              e.target.value === 'auto' ? undefined : (e.target.value as Axis),
                            )
                          }
                        >
                          <option value="auto">Pinnan mukaan</option>
                          <option value="x">YZ-taso · X</option>
                          <option value="y">XZ-taso · Y</option>
                          <option value="z">XY-taso · Z</option>
                        </select>
                      </label>
                    )}
                    {tool === 'pen' && (
                      <div className="pen-mode" role="group" aria-label="Kynän tyyli">
                        <button
                          aria-pressed={penMode === 'line'}
                          onClick={() => {
                            resetGesture();
                            setPenMode('line');
                          }}
                        >
                          Suorat
                        </button>
                        <button
                          aria-pressed={penMode === 'bezier'}
                          onClick={() => {
                            resetGesture();
                            setPenMode('bezier');
                          }}
                        >
                          Bézier
                        </button>
                        {penMode === 'bezier' && (
                          <>
                            <label className="modeling-field">
                              Käyrän piirtotapa
                              <select
                                aria-label="Bézierin piirtotapa"
                                value={bezierStyle}
                                onChange={(e) => {
                                  resetGesture();
                                  setBezierStyle(e.target.value as typeof bezierStyle);
                                }}
                              >
                                <option value="smooth">Pisteiden kautta · helppo</option>
                                <option value="bezier">Ohjauspisteillä · tarkka</option>
                              </select>
                            </label>
                            <p>
                              {bezierStyle === 'smooth'
                                ? 'Napsauta pisteet, joiden kautta käyrä kulkee. Kaksi pistettä tekee suoran, kolmas taivuttaa käyrää.'
                                : bezierInstruction(penPoints.length)}{' '}
                              Enter viimeistelee. Shift pitää suunnan ja poimii viitemitan, X/Y/Z
                              lukitsee akselin. Backspace poistaa viimeisen pisteen.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {['rectangle', 'circle', 'pen'].includes(tool) && (
                      <ShapeProperties
                        tool={tool as 'rectangle' | 'circle' | 'pen'}
                        kind={shapeKind}
                        onKind={setShapeKind}
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
                        onAccept={() => {
                          if (!awaitingStart) void apply();
                        }}
                      />
                    )}
                    {canDivideSurface && awaitingStart && surfaceActions}
                    {tool === 'extrude' && faceTarget && (
                      <div className="shape-properties">
                        <div className="extrusion-readout" data-testid="extrusion-readout">
                          {faceSpan ? (
                            <>
                              <span>
                                Nykyinen mitta <strong>{formatLength(faceSpan.depth)} mm</strong>
                              </span>
                            </>
                          ) : (
                            <span>{spanLoading ? 'Mitataan vastapintaa…' : spanError}</span>
                          )}
                        </div>
                        <details className="tool-advanced">
                          <summary>Mitan syöttö ja läpileikkaus</summary>
                          <p className="muted">
                            Tab vaihtaa siirtymän ja toteutuvan kokonaismitan välillä ja säilyttää
                            kirjoittamasi luvun. Miinus työntää sisään, plus vetää ulos. Ilman
                            etumerkkiä luku seuraa vedon suuntaa.
                          </p>
                          <p className="muted">
                            Vihreä mittaviiva näyttää toteutuvan kokonaismitan tässä kohdassa,
                            kohtisuoraan valittua pintaa vastaan. Nolla avaa rajatun alueen läpi.
                            Voit myös vetää pinnan vastapinnan ohi tai valita Leikkaa läpi.
                          </p>
                        </details>
                        <button
                          className="button outlined full"
                          aria-pressed={pickDepth}
                          onClick={() => setPickDepth(!pickDepth)}
                        >
                          {pickDepth ? 'Osoita tavoitetta' : 'Poimi tavoitemitta'}
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
                    {tool === 'measure' && (
                      <>
                        <button
                          className="button outlined"
                          onClick={() => setMeasureMenu(!measureMenu)}
                        >
                          {measureMode === 'dimension'
                            ? 'Dimensio'
                            : measureMode === 'guide'
                              ? 'Apuviiva'
                              : 'Vapaa mittaviiva'}{' '}
                          · Vaihda tilaa
                        </button>
                        <button
                          className="button outlined"
                          onClick={() => rotateGuide()}
                          disabled={!guideDraft}
                        >
                          <RotateCw size={16} />
                          Kierrä mittaviivaa · R
                        </button>
                        <p className="muted">
                          {measureMode === 'free' &&
                            'Shift pitää suunnan lukittuna vain painamisen ajan. Poimi pituus toisesta pisteestä tai reunasta. '}
                          R käynnistää hiirellä kierron 22,5° välein. X/Y/Z lukitsee siirtosuunnan;
                          sama näppäin vapauttaa. Esc peruu vedon; seuraava Esc päättää työkalun.
                          Shift+R käynnistää vapaan kierron; osoita suunta ja hyväksy.
                        </p>
                        <button
                          className="button outlined"
                          aria-pressed={freeRotate && guideRotationStep === 0}
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
                                guideRef.current = {
                                  ...guideRef.current!,
                                  xray: e.target.checked,
                                };
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
                          {penPoints.length} pistettä.{' '}
                          {locked.size
                            ? 'Enter lisää numeroilla määritetyn pisteen.'
                            : 'Enter päättää viivan.'}{' '}
                          Palaa alkupisteeseen sulkeaksesi muodon. Reunasta reunaan piirretty viiva
                          jakaa tavallisen kappaleen tai avatun osan pinnan heti. Suljetun
                          komponentin pinnalla valitse valmis viiva ja Jaa pinta.
                        </p>
                        <button
                          className="button outlined"
                          disabled={
                            (penMode === 'bezier' && bezierStyle === 'bezier'
                              ? penPoints.length < 3 || penPoints.length % 3 !== 0
                              : penPoints.length < 3) || busy
                          }
                          onClick={() => void apply(true)}
                        >
                          Sulje muoto
                        </button>
                        <button
                          className="button outlined"
                          disabled={
                            (penMode === 'bezier' && bezierStyle === 'bezier'
                              ? penPoints.length < 4 || (penPoints.length - 1) % 3 !== 0
                              : penPoints.length < 2) || busy
                          }
                          onClick={() => {
                            clearLocks();
                            void apply();
                          }}
                        >
                          Valmis viiva
                        </button>
                        <button
                          className="button subtle"
                          disabled={!penPoints.length}
                          onClick={() => {
                            clearLocks();
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
                      <details className="tool-advanced">
                        <summary>Tartunnat ja viitepisteet</summary>
                        <p className="muted">
                          {tool === 'move'
                            ? 'Poimi korostettu kulma, reuna tai keskipiste. Siirto lukittuu oletuksena yhdelle akselille. X/Y/Z vaihtaa siirron pääakselille. Lukittuna kohdepiste antaa tämän akselin tavoitemitan.'
                            : tool === 'pen' && penPoints.length
                              ? 'Shift lukitsee piirtosuunnan pituuden poimimista varten. Erillisen viitepisteen saat Poimi viite -painikkeesta.'
                              : 'Hae kappaleen piste kohdistimella ja pidä Shift pohjassa: viitepisteen suuntalinjat ohjaavat piirtämistä. Kosketuksella käytä Poimi viite -painiketta.'}
                        </p>
                      </details>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-title">
                    <div>
                      <span className="eyebrow">
                        {body || selectedGroup ? 'VALINTA' : 'PROJEKTI'}
                      </span>
                      <h2>
                        {selectedGroup ? (
                          <InlineName
                            key={selectedGroup.id}
                            name={selectedGroup.name}
                            label="Ryhmän nimi"
                            disabled={busy}
                            onChange={(name) => void patchGroup(selectedGroup.id, { name })}
                          />
                        ) : selectedIds.length > 1 ? (
                          `${selectedIds.length} kappaletta`
                        ) : body ? (
                          <InlineName
                            key={body.id}
                            name={body.name}
                            disabled={busy}
                            onChange={(name) => void patchBodies([body.id], { name })}
                          />
                        ) : (
                          'Valitse kappale'
                        )}
                      </h2>
                    </div>
                    {body || selectedGroup ? (
                      <button
                        className="selection-menu-trigger"
                        aria-label="Valinnan toiminnot"
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setActionMenu({ x: r.left, y: r.bottom });
                        }}
                      >
                        <MoreHorizontal size={20} />
                        <span>Toiminnot</span>
                      </button>
                    ) : (
                      <Box size={21} />
                    )}
                  </div>
                  {(body || selectedGroup) && (
                    <p className="selection-group-path">
                      {groupPath(
                        project.groups,
                        selectedGroup ? selectedGroup.parentId : body?.groupId,
                      ) || 'Päätaso'}
                      {selectedGroup?.kind === 'assembly' ? ' · Kokoonpano' : ''}
                    </p>
                  )}
                  {linkNotice}
                  {movementBlocked && (
                    <p className="hold-notice" role="status">
                      <LockKeyhole size={15} /> Hold · muokkauslukittu. Vapauta osan tai ryhmän
                      lukitus ennen muokkaamista.
                    </p>
                  )}
                  {canDivideSurface && surfaceActions}
                  {body &&
                    selectedIds.length === 1 &&
                    !featureIsSolid(body.feature) &&
                    (body.curve ||
                      editor.meshes.find((m) => m.id === body.id)?.curveEdges?.length) && (
                      <CurvePointsPanel
                        key={`${body.id}:${JSON.stringify(body.curve)}:${body.origin.join(',')}`}
                        body={body}
                        disabled={busy || !!movementBlocked}
                        onSnaps={(curveSnaps) => void patchBodies([body.id], { curveSnaps })}
                        onCurve={async (points) => {
                          if (!body.curve || movementBlocked) return;
                          await editor.transact(async () => {
                            requireMovable([body], project.groups);
                            const updated = await editor.cad.bezier(
                              points,
                              body.name,
                              body.curve!.closed,
                              body.curve!.mode,
                              !editor.meshes.find((m) => m.id === body.id)?.faces.length,
                            );
                            return {
                              ...project,
                              bodies: project.bodies.map((b) =>
                                b.id === body.id
                                  ? {
                                      ...body,
                                      ...updated,
                                      id: body.id,
                                      name: body.name,
                                      color: body.color,
                                      appearance: body.appearance,
                                      purpose: body.purpose,
                                      groupId: body.groupId,
                                      component: body.component
                                        ? {
                                            ...body.component,
                                            offset: sub(
                                              add(body.origin, body.component.offset),
                                              updated.origin,
                                            ),
                                          }
                                        : undefined,
                                      textureFrame: body.textureFrame
                                        ? {
                                            ...body.textureFrame,
                                            offset: sub(
                                              add(body.origin, body.textureFrame.offset),
                                              updated.origin,
                                            ),
                                          }
                                        : undefined,
                                      curveSnaps: body.curveSnaps,
                                    }
                                  : b,
                              ),
                            };
                          }, 'Käyrän pisteet päivitetty.');
                        }}
                      />
                    )}
                  {selectedIds.length > 1 && !selectedGroup && (
                    <div className="selection-collection-actions">
                      <button
                        className="button outlined"
                        onClick={() => void createGroup(openedAssembly, true)}
                        disabled={busy}
                      >
                        Luo kokoonpano
                      </button>
                      <button
                        className="button subtle"
                        onClick={() => void createGroup(openedAssembly)}
                        disabled={busy}
                      >
                        Luo ryhmä
                      </button>
                    </div>
                  )}
                  {body && !selectedGroup ? (
                    <div className="selection-info">
                      <span className="selection-tag">
                        {selectedIds.length > 1
                          ? `Valinnan kokonaismitat · ${selectedIds.length} osaa`
                          : featureIsSolid(body.feature)
                            ? 'CAD-kappale'
                            : 'Tasoluonnos'}
                        {selectedFace ? ` · ${faceNames[selectedFace] ?? 'Valittu pinta'}` : ''}
                      </span>
                      <div className="dimensions-grid">
                        <div>
                          <span>Leveys</span>
                          <strong>
                            {formatLength(
                              selectedIds.length > 1 ? selectionSize[0] : body.feature.width,
                            )}
                            <small>mm</small>
                          </strong>
                        </div>
                        <div>
                          <span>Syvyys</span>
                          <strong>
                            {formatLength(
                              selectedIds.length > 1 ? selectionSize[1] : body.feature.depth,
                            )}
                            <small>mm</small>
                          </strong>
                        </div>
                        <div>
                          <span>Korkeus · Z</span>
                          <strong data-testid="selected-height">
                            {formatLength(
                              selectedIds.length > 1 ? selectionSize[2] : body.feature.height,
                            )}
                            <small>mm</small>
                          </strong>
                        </div>
                      </div>
                      <p className="origin-readout">
                        {selectedIds.length > 1 ? 'Valinnan alakulma · ' : ''}X{' '}
                        {formatLength(
                          selectedIds.length > 1 ? selectionBox.min[0] : body.origin[0],
                        )}{' '}
                        · Y{' '}
                        {formatLength(
                          selectedIds.length > 1 ? selectionBox.min[1] : body.origin[1],
                        )}{' '}
                        · Z{' '}
                        {formatLength(
                          selectedIds.length > 1 ? selectionBox.min[2] : body.origin[2],
                        )}
                      </p>
                      {mode === 'model' && (
                        <>
                          <div className="selection-actions object-quick-actions">
                            <button
                              aria-label="Siirrä valittua"
                              disabled={busy}
                              onClick={() => begin('move')}
                            >
                              <Move3D size={15} /> Siirrä
                            </button>
                            <button
                              aria-label="Kopioi kappale"
                              disabled={busy}
                              onClick={() => void copyBody()}
                            >
                              <Copy size={15} /> Kopioi
                            </button>
                            <button
                              aria-label="Poista kappale"
                              disabled={busy}
                              onClick={() => void removeBody()}
                            >
                              <Trash2 size={15} /> Poista
                            </button>
                          </div>
                        </>
                      )}
                      <ModelMaterials
                        key={`material:${colorContext}`}
                        onPreviewColor={(color) =>
                          previewColor(selectedIds.length ? selectedIds : [body.id], color)
                        }
                        bodies={project.bodies.filter((b) =>
                          selectedIds.length ? selectedIdSet.has(b.id) : b.id === body.id,
                        )}
                        assets={project.assets}
                        materials={project.materials}
                        busy={busy || !!movementBlocked}
                        onChange={(...args) =>
                          changeAppearance(selectedIds.length ? selectedIds : [body.id], ...args)
                        }
                      />
                      {body && !selectedGroup && (
                        <details className="component-actions">
                          <summary>Komponentti ja linkitys</summary>
                          <p>
                            {body.component
                              ? `Linkitetty komponentti · ${project.bodies.filter((b) => b.component?.id === body.component?.id).length} esiintymää`
                              : body.purpose === 'component'
                                ? 'Komponentti · ensimmäinen kopio luo linkin'
                                : 'Erillinen kappale'}
                          </p>
                          {selectedIds.length > 1 ? (
                            <>
                              <p>
                                Linkitys käyttää osan ”{body.name}” muotoa. Valittujen osien
                                sijainnit ja kierrot säilyvät.
                              </p>
                              <button
                                className="button outlined"
                                disabled={busy}
                                onClick={() => void linkSelected()}
                              >
                                Linkitä valitut tähän osaan
                              </button>
                            </>
                          ) : (
                            !body.component && (
                              <button
                                className="button outlined"
                                disabled={busy}
                                onClick={() => void linkSelected()}
                              >
                                Tee komponentti
                              </button>
                            )
                          )}
                          {project.bodies.some((b) => selectedIdSet.has(b.id) && b.component) && (
                            <button className="button subtle" disabled={busy} onClick={makeUnique}>
                              Tee uniikiksi
                            </button>
                          )}
                          {body.component && (
                            <label className="checkbox-label">
                              <CommitCheckbox
                                label="Esiintymäkohtainen materiaali"
                                checked={!!body.localMaterial}
                                disabled={busy}
                                onChange={(localMaterial) =>
                                  patchBodies(selectedIds, { localMaterial })
                                }
                              />
                              Materiaali vain tälle esiintymälle
                            </label>
                          )}
                        </details>
                      )}
                      {objectActions}
                      {!featureIsSolid(body.feature) && mode === 'model' && (
                        <button
                          className="button outlined full"
                          disabled={busy}
                          onClick={() => begin('extrude')}
                        >
                          Anna paksuus
                        </button>
                      )}
                      <details className="inspector-disclosure">
                        <summary>Mitat ja mallinnus</summary>
                        <div className="disclosure-content">
                          <button
                            className="button outlined full"
                            disabled={
                              busy ||
                              !project.bodies.some(
                                (b) =>
                                  (selectedIds.length
                                    ? selectedIdSet.has(b.id)
                                    : b.id === body.id) && b.purpose !== 'construction',
                              )
                            }
                            onClick={() => void dimensionSelection()}
                          >
                            <Ruler size={16} /> Lisää kokonaismitat
                          </button>
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
                                Muokkaa pintaa
                              </button>
                              <button
                                className="button outlined full"
                                aria-label="Yhdistä valitut"
                                disabled={
                                  busy ||
                                  selectedIds.length < 2 ||
                                  project.bodies
                                    .filter((b) => selectedIdSet.has(b.id))
                                    .some((b) => !featureIsSolid(b.feature))
                                }
                                onClick={() => void mergeSelected()}
                              >
                                <Merge size={15} />
                                Yhdistä {selectedIds.length > 1 ? `(${selectedIds.length})` : ''}
                              </button>
                            </>
                          )}
                        </div>
                      </details>
                    </div>
                  ) : (
                    !selectedGroup && (
                      <p className="panel-description">
                        {project.bodies.length
                          ? 'Valitse kappale näkymästä tai listasta. Vedä kappale ryhmään järjestääksesi mallin.'
                          : 'Jokainen hyvä suunnitelma alkaa yhdestä muodosta.'}
                      </p>
                    )
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
                      onRemove={() => void removeGroup(selectedGroup.id)}
                      onMerge={() => void mergeSelected()}
                      onEdit={() => openAssembly(selectedGroup.id)}
                      onUnique={makeUnique}
                      canUnique={groupBodies(project, selectedGroup.id).some((b) => b.component)}
                      canMerge={
                        selectedIds.length > 1 &&
                        project.bodies
                          .filter((b) => selectedIdSet.has(b.id))
                          .every((b) => featureIsSolid(b.feature))
                      }
                    />
                  )}
                  <div className="panel-footer">
                    <span className="tiny-dot" />
                    <span>
                      {project.bodies.length} kappaletta · {project.dimensions.length} mittaa
                    </span>
                    <span>v{import.meta.env.VITE_APP_VERSION}</span>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {surfaceSplitDraft && (
        <SelectionDialog
          side
          title="Jaa pinta"
          onClose={() => !busy && setSurfaceSplitDraft(undefined)}
        >
          <p>
            Piirros jakaa valittujen osien pinnat muokattaviksi alueiksi. Osia ei tarvitse avata.
            Muokkaus päivittyy myös kohteiden linkitettyihin kopioihin. Hold estää niiden
            muokkaamisen.
          </p>
          <div className="opening-targets">
            {surfaceSplitDraft.results.map(({ body }) => (
              <label key={body.id}>
                <input
                  type="checkbox"
                  checked={surfaceSplitDraft.included.includes(body.id)}
                  disabled={busy}
                  onChange={(e) =>
                    setSurfaceSplitDraft({
                      ...surfaceSplitDraft,
                      included: e.target.checked
                        ? [...surfaceSplitDraft.included, body.id]
                        : surfaceSplitDraft.included.filter((id) => id !== body.id),
                    })
                  }
                />
                {body.name}
              </label>
            ))}
          </div>
          {project.bodies.some((b) => surfaceSplitDraft.included.includes(b.id) && b.component) && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!surfaceSplitDraft.unique}
                disabled={busy}
                onChange={(e) =>
                  setSurfaceSplitDraft({ ...surfaceSplitDraft, unique: e.target.checked })
                }
              />
              Tee kohteista uniikkeja · muuta vain valittuja
            </label>
          )}
          <button
            className="button primary"
            disabled={busy || !surfaceSplitDraft.included.length}
            onClick={() => void acceptSurfaceSplit(surfaceSplitDraft)}
          >
            Jaa valitut pinnat
          </button>
        </SelectionDialog>
      )}
      {openingDraft && (
        <SelectionDialog side title="Leikkaa aukko" onClose={() => !busy && cancelOpening()}>
          <p>
            Muoto leikkaa kohtisuoraan molempiin suuntiin kaikkien valittujen osien läpi. Korostetut
            osat ja niiden linkitetyt kopiot muuttuvat. Hold estää muokkaamisen.
          </p>
          <div className="opening-targets">
            {openingDraft.affected.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={openingDraft.included.includes(id)}
                  disabled={busy}
                  onChange={(e) =>
                    setOpeningDraft({
                      ...openingDraft,
                      included: e.target.checked
                        ? [...openingDraft.included, id]
                        : openingDraft.included.filter((v) => v !== id),
                    })
                  }
                />
                {project.bodies.find((b) => b.id === id)?.name}
              </label>
            ))}
          </div>
          {project.bodies.some((b) => openingDraft.included.includes(b.id) && b.component) && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!openingDraft.unique}
                disabled={busy}
                onChange={(e) => setOpeningDraft({ ...openingDraft, unique: e.target.checked })}
              />
              Tee kohteista uniikkeja · muuta vain valittuja
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={openingDraft.keep}
              disabled={busy}
              onChange={(e) => setOpeningDraft({ ...openingDraft, keep: e.target.checked })}
            />
            Säilytä piirretty muoto
          </label>
          <div className="object-quick-actions">
            <button
              className="button primary"
              disabled={busy || !openingDraft.included.length}
              onClick={() => void acceptOpening()}
            >
              Leikkaa läpi · {openingDraft.included.length} osaa
            </button>
            <button className="button subtle" disabled={busy} onClick={cancelOpening}>
              Peruuta
            </button>
          </div>
        </SelectionDialog>
      )}
      {groupMove && (
        <SelectionDialog title="Siirrä ryhmään" onClose={() => setGroupMove(undefined)}>
          <p>
            {groupMove.kind === 'group'
              ? 'Ryhmä siirtyy sisältöineen.'
              : `${groupMove.ids.length} valittua osaa. Sijainnit säilyvät.`}
          </p>
          <label className="modeling-field">
            Kohderyhmä
            <select
              aria-label="Kohderyhmä"
              value={groupDestination}
              onChange={(e) => setGroupDestination(e.target.value)}
            >
              <option value="">Päätaso</option>
              {project.groups
                .filter(
                  (g) =>
                    groupMove.kind !== 'group' ||
                    !groupContains(project.groups, groupMove.id, g.id),
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {groupPath(project.groups, g.id)}
                  </option>
                ))}
            </select>
          </label>
          <div className="object-quick-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => {
                void arrangeTree(groupMove, groupDestination || undefined);
                setGroupMove(undefined);
              }}
            >
              Siirrä
            </button>
            <button className="button subtle" onClick={() => setGroupMove(undefined)}>
              Peruuta
            </button>
          </div>
        </SelectionDialog>
      )}
      {actionMenu && (
        <ContextActions
          {...actionMenu}
          title={
            selectedGuide
              ? 'Apuviiva'
              : (selectedGroup?.name ??
                (selectedIds.length > 1 ? `${selectedIds.length} osaa` : (body?.name ?? 'Valinta')))
          }
          actions={[...quickActions, { label: 'Valitse toinen', run: chooseOther, disabled: busy }]}
          onClose={() => setActionMenu(undefined)}
        />
      )}
      {commandOpen && <CommandSearch commands={commands} onClose={() => setCommandOpen(false)} />}
      {pickList && (
        <OverlapPicker
          {...pickList}
          candidates={pickCandidates}
          onPreview={setPickHovered}
          onClose={() => {
            setPickList(undefined);
            setPickHovered(undefined);
          }}
          onSelect={(candidate) => {
            const unit = selectionUnit(project, candidate.bodyId, openedAssembly);
            activityHistory.prepare(actionContext);
            resetGesture();
            setSelected(candidate.bodyId);
            setSelectedIds(unit.ids);
            setSelectedGroupId(unit.groupId);
            setSelectedFace(undefined);
            pickedFaceRef.current = candidate.face
              ? { bodyId: candidate.bodyId, face: candidate.face }
              : undefined;
            setMultiSelect(false);
            setAwaitingStart(true);
            setTool('select');
            setPanelOpen(true);
          }}
        />
      )}
      {cabinetOpen && (
        <CabinetBuilder
          project={project}
          source={selectedIds.length === 1 && !selectedGroupId ? body : undefined}
          busy={busy}
          onClose={() => setCabinetOpen(false)}
          onCreate={async (options, replaceId) => {
            const next = insertCabinet(project, options, replaceId);
            if (
              !(await editor.transact(
                next.project,
                `${options.name}: ${next.bodies.length} erillistä levyä luotu.`,
              ))
            )
              return false;
            setEditingBodyId(undefined);
            setSurfaceMode('new');
            finishOperation();
            setSelectedGroupId(next.group.id);
            setSelectedIds(next.bodies.map((b) => b.id));
            setSelected(next.bodies[0].id);
            setTool('select');
            setPanelOpen(true);
            setTab('objects');
            changeView('iso', true);
            return true;
          }}
        />
      )}

      {partsOpen && (
        <PartsWorkspace
          project={project}
          meshes={editor.meshes}
          selectedGroupId={selectedGroupId}
          onCutSettings={(cutting) =>
            editor.transact(
              { ...project, settings: { ...project.settings, cutting } },
              'Leikkauslista päivitetty.',
            )
          }
        />
      )}

      {renderOpen && (
        <RenderStage
          colorPreview={colorPreview}
          onPreviewColor={previewColor}
          onStartRender={renderJob.start}
          renderJobActive={renderJob.job?.state === 'working'}
          bodies={renderBodies}
          meshes={visibleMeshes}
          selectedIds={selectedIds}
          settings={project.settings.render ?? renderDefaults}
          name={project.name}
          busy={busy}
          error={editor.error}
          onClose={closeRender}
          assets={project.assets}
          materials={project.materials}
          onAppearance={changeAppearance}
          onSaveMaterial={(name, appearance, color) =>
            editor.transact(
              {
                ...project,
                materials: [...(project.materials ?? []), { id: uid(), name, appearance, color }],
              },
              'Oma materiaali tallennettu projektiin.',
            )
          }
          onMaterial={(ids, material) =>
            void editor.transact(
              {
                ...project,
                bodies: project.bodies.map((b) =>
                  ids.includes(b.id) ? { ...b, material, appearance: undefined } : b,
                ),
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
        {renderJob.job && (
          <RenderJobCard
            job={renderJob.job}
            onCancel={renderJob.cancel}
            onDismiss={renderJob.dismiss}
          />
        )}
        <div>
          <span className="status-icon">
            {busy ? <LoaderCircle className="spin" size={14} /> : <CheckCircle2 size={14} />}
          </span>
          <span role="status">
            {partsOpen
              ? 'Osat · räjäytyskuva ja leikkauslista · Esc palaa malliin'
              : renderOpen
                ? 'Renderöinti · materiaalit ja valo · Esc palaa malliin'
                : editing || tool === 'navigate' || tool === 'boolean'
                  ? instructions[tool]
                  : editor.message}
          </span>
        </div>
        <ActivityHistory
          entries={activityHistory.entries}
          current={actionContext}
          busy={busy}
          canRestoreOperation={(entry) =>
            !!entry.operation &&
            (entry.actionId
              ? editor.canRestoreAction(entry.actionId)
              : project.bodies.some((b) => b.id === entry.operation!.profileId))
          }
          onRestoreOperation={(entry) => void restoreOpening(entry)}
          onRestore={(context) => {
            const existing = new Set(
              project.bodies.filter((b) => bodyVisible(b, project.groups)).map((b) => b.id),
            );
            const ids = context.ids.filter((id) => existing.has(id));
            const guideIds = (context.guideIds ?? []).filter((id) =>
              project.guides.some((g) => g.id === id),
            );
            if (!ids.length && !guideIds.length) {
              editor.setMessage('Valinnan kohteet on poistettu tai piilotettu.');
              return;
            }
            resetGesture();
            setIsolated(undefined);
            setTool(tool === 'move' ? 'move' : 'select');
            setSelectedIds(ids);
            setSelected(
              context.primary && ids.includes(context.primary) ? context.primary : ids[0],
            );
            setSelectedGroupId(
              project.groups.some((g) => g.id === context.groupId) ? context.groupId : undefined,
            );
            const editing = project.bodies.find((b) => b.id === context.editingBodyId);
            const editId =
              editing && existing.has(editing.id) && !bodyLocked(editing, project.groups)
                ? editing.id
                : undefined;
            setEditingBodyId(editId);
            setSurfaceMode(editId ? 'region' : 'new');
            setOpenedAssembly(
              project.groups.some((g) => g.id === context.openedAssembly)
                ? context.openedAssembly
                : undefined,
            );
            setSelectedFace(undefined);
            setSelectedGuideIds(guideIds);
            if (guideIds.length && !ids.length) setTab('guides');
            setAwaitingStart(true);
            editor.setMessage(`Valinta palautettu · ${selectionDescription({ ids, guideIds })}.`);
          }}
        />
        <span className="status-right">
          {partsOpen
            ? 'Osat / leikkauslista'
            : renderOpen
              ? 'Esityskuva'
              : mode === 'model'
                ? 'Z ylöspäin'
                : 'A4 · Ortografinen'}
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
                monikulmio, pallo ja Bézier-käyrä. Myös veto tai Enter hyväksyy.
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
              <strong>Veitsi · N:</strong> vedä leikkaus nykyisestä näkymästä valittujen osien yli.
              Ilman valintaa käsitellään näkyviä vapaita osia. Suora, taitettu reitti, suljettu
              siluetti, Bézier-kaari ja vapaa viilto säilyttävät molemmat puolet. Enter viimeistelee
              taitetun reitin. Esc peruu luonnoksen; Peru palauttaa koko leikkauksen.
            </p>
            <p>
              <strong>Bézier:</strong> Napsauta pisteet, joiden kautta käyrä kulkee, ja paina Enter.
              Shift pitää suunnan ja poimii viitteen. Valitun käyrän tartuntapisteitä voi lisätä ja
              pisteiden mittoja muuttaa oikealta. Tarkassa ohjauspistetilassa kaari piirretään
              neljällä pisteellä: alku, kaksi ohjauspistettä ja loppu. Jatko tarvitsee kolme
              pistettä. Enter tallentaa viivan, alkupisteeseen palaaminen sulkee pinnan. Pallo
              sijoitetaan keskipisteestä; kirjoitettava mitta on halkaisija. Osan valikosta Pehmennä
              reunat avaa kaikkien reunojen pyöristyksen esikatselun ja säteen säädön.
            </p>
            <p>
              <strong>Muotojen läpi:</strong> Muodot-valikosta avautuva pintatyökalu yhdistää
              poikkileikkauksia tai vierekkäisiä sivukäyriä. Valitse profiilit järjestyksessä,
              tarkista esikatselu ja Luo pinta. Pullon ympyrät voivat toimia sivukäyrien
              tartunta-apuina. Sivukäyrät-tilassa valitse vain sivukäyrät kiertojärjestyksessä ja
              Sulje sivut ympäri. Poikkileikkauksen voi myös päättää kärkeen, jolloin yhdestä
              ympyrästä syntyy kartio. Lähtömuodot säilyvät, ja Peru palauttaa koko toiminnon.
            </p>
            <p>
              <strong>Viivojen valinta:</strong> valintaruutu poimii myös apu- ja mittaviivat;
              valitut viivat näkyvät oranssina. Shift lisää valintaan. Delete poistaa valinnan
              yhtenä peruttavana toimintona. Historia palauttaa myös viivavalinnat. Samalla suoralla
              päällekkäin piirretyt mittaosuudet yhdistyvät automaattisesti.
            </p>
            <p>
              <strong>Hae ja Valitse toinen:</strong> Hae-painike tai Ctrl/⌘ K löytää työkalut ja
              valinnan toiminnot. Esc sulkee haun säilyttäen keskeneräisen muodon. Valitse toinen
              listaa osoitetun kohdan päällekkäiset osat; osoitus korostaa vaihtoehdon ja napsautus
              valitsee. Kosketuksella vahvista esikorostus Valitse korostettu -painikkeella.
            </p>
            <p>
              <strong>Poikkileikkaus:</strong> avaa Leikkaus ja lisää nimetty leikkaus. Valitse
              X/Y/Z tai poimi tasopinta. Vedä nuolesta tai kirjoita sijainti; Esc peruu vedon. Avaa
              leikkaus mittakuvaan, valitse kaksi leikkauspistettä ja sijoita mittaviiva. PDF ja SVG
              säilyttävät valitun mittakaavan. Leikkaus ei muuta osien geometriaa.
            </p>
            <p>
              <strong>Pohja- ja julkisivukuva:</strong> tuo kuva Pohjakuva-painikkeesta, osoita
              tunnetun mitan kaksi päätä ja anna todellinen mitta. Kuva lukittuu mittakaavaan. Voit
              piirtää sen tasolle ja säätää läpinäkyvyyttä; rasteriviivat eivät ole
              tartuntapisteitä. Eristä valinta näyttää vain työalueen, ja Palauta näkymä palauttaa
              aiemmat piilotukset.
            </p>
            <p>
              <strong>Monivalinta:</strong> Valitse-tilassa (V) Shift + klikkaus lisää osan
              valintaan tai poistaa sen valinnasta. M siirtää kaikki valitut yhdessä ilman ryhmän
              luomista. Tavallinen klikkaus vaihtaa valinnan yhteen osaan, kun Monivalinta ei ole
              päällä. Muokkaustilassa sulje ensin osan muokkaus valitaksesi muita osia. Muissa
              työkaluissa Shift käyttää työkalun omaa viitettä tai suuntalukkoa.
            </p>
            <p>
              <strong>Uusi osa vai pinnan muokkaus:</strong> normaalisti piirto tekee uuden osan,
              myös toisen kappaleen pinnalle. Valitse-työkalulla (V) tuplaklikkaa osaa tai valitse
              Muokkaa osaa: Muokkaustila-palkki kertoo kohteen, muut osat himmenevät viitteiksi ja
              piirto jakaa vain avattua osaa. Lopeta muokkaus sulkee muokkaustilan. Myös
              Valitse-työkalun tuplaklikkaus tyhjään tilaan sulkee sen; yksittäinen napsautus tai
              kameran liikuttaminen ei poistu muokkaustilasta. Esc peruu ensin keskeneräisen
              toiminnon, seuraava Esc päättää työkalun ja vielä yksi Esc sulkee muokkaustilan. E/O
              toimii suoraan myös normaalitilassa.
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
              <strong>Tavoitemitan poiminta:</strong> E → klikkaa lähtöpintaa → pidä Shift pohjassa
              ja osoita kulmaa, keskipistettä, reunaa tai pintaa → klikkaa hyväksyäksesi. Myös vedon
              vapautus Shift pohjassa korostetun tavoitteen päällä hyväksyy. Ilman Shiftiä veto on
              vapaa. Lähtöpinta ei kelpaa tavoitteeksi. Shiftin vapautus jatkaa saavutetusta mitasta
              ilman hyppyä. Kosketuksella käytä Poimi tavoitemitta -painiketta. Piste- tai
              reunakorostus ja vihjeteksti näyttävät kohteen. Yhdensuuntaiset tasopinnat osuvat
              samalle tasolle; vinosta tasopinnasta poimitaan osoitetun pisteen taso lähdepinnan
              normaalin suunnassa. Kirjoitettu mitta ohittaa tartunnan. Esc peruu.
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
              tartuntapisteestä. Paina Ctrl (tai Alt) kerran vedon aikana ja vapauta hiiri: kopio
              asettuu uuteen paikkaan ja alkuperäinen jää paikalleen. Voit myös valita Siirrä kopio
              ja kirjoittaa siirtymän. Uusi Ctrl-painallus poistaa kopioinnin. Esc peruu
              keskeneräisen siirron.
            </p>
            <p>
              <strong>Tarkka siirto (M):</strong> odota kulman, reunan tai keskipisteen korostusta,
              tartu siitä ja vie se kohteen korostettuun pisteeseen. Geometriatartunta ohittaa
              ruudukon. Oletuksena siirto käyttää yhtä akselia. X/Y/Z vaihtaa akselin. Lukittuna
              toisesta pisteestä poimitaan vain tämän akselin mitta. Ruudukon askelta voi muuttaa
              asetuksissa. Siirtymä askeltaa lähtöpisteestä. Vapaa siirto (XYZ) sallii liikkeen
              usealla akselilla.
            </p>
            <p>
              <strong>Dimensio:</strong> paina T ja valitse aktiivisen mittatyökalun valikosta
              Dimensio. Poimi kaksi pistettä ja sijoita mittaviiva kolmannella napsautuksella tai
              vetämällä toisesta pisteestä sivulle. X/Y/Z valitsee akselin suuntaisen mitan.
              Valitse-tilassa mittatekstin vetäminen muuttaa sijoittelua. Mitta seuraa osia ja näkyy
              sopivassa mittakuvan näkymässä sekä SVG-viennissä.
            </p>
            <p>
              <strong>Viisteet ja pyöristykset (F):</strong> valitse reunat ja vedä kokoa tai
              kirjoita mitta. F avaa myöhemmin saman käsittelyn: voit lisätä kohtaavia reunoja,
              muuttaa mittaa tai poistaa käsittelyn. Pinnan muu muokkaus liittää käsittelyn
              geometriaan. Muokattava lähde säilyy uusissa käsittelyissä ja projektin
              tallennuksessa.
            </p>
            <p>
              <strong>Materiaalit ja tekstuurit:</strong> mallin osan Materiaali-valikossa on 53
              presettiä: myös maalatut seinät, betonit, laatat, kivet, melamiinit, kalustelevyt ja
              valaisevat materiaalit. Pinnan rakenne -kohdassa voit tuoda normal-, bump-, karheus-
              ja metallisuuskartat tai luoda rakenteen värikuvasta. Kohokuvion syvyys annetaan
              millimetreinä ja normal-kartan suunnaksi voi valita OpenGL/DirectX. Valaisimen
              esiasetukset, väri, voimakkuus ja spotin suunta löytyvät myös mallista.
              Renderöi-näkymässä säädät studion valoja. Lisää kuva tuo oman PNG-, JPEG- tai
              WebP-värikuvan. Valitse yksi osa ja Muokkaa tekstuuria. Vedä pintaa siirtääksesi
              kuviota; kahvat säätävät kokoa ja kiertoa. Mitat voi syöttää myös millimetreinä.
              Hiiriveto tallentuu heti ja Enter hyväksyy numeroarvot. Työkalu pysyy päällä osaa
              vaihtaessakin. Esc peruu keskeneräiset numeroarvot ja lopettaa työkalun. Valitse tai
              Maalaa vaihtaa työkalua. Oikea painike kiertää kameraa. Oman materiaalin voi tallentaa
              projektin kirjastoon.
            </p>
            <p>
              <strong>Koko näyttö:</strong> yläpalkin Siirry koko näyttöön -painike piilottaa
              selaimen palkit. Palaa samalla painikkeella tai Escillä. Kapeassa ikkunassa tiedostot,
              historia ja asetukset löytyvät Lisää toimintoja -painikkeesta.
            </p>
            <p>
              <strong>Kierrä (R):</strong> valitse kappale ja poimi kiertopiste tai reuna. Vedä
              rengasta tai kirjoita kulma. X/Y/Z vaihtaa akselin ja veto tarttuu 5° välein. Shift
              kiertää vapaasti. Suorakulmion pikanäppäin on S. G kiinnittää tai vapauttaa kappaleen.
              Sivupaneelista voit siirtää valinnan origoon, nimetä, piilottaa ja ryhmitellä osia.
            </p>
            <p>
              <strong>Apuviivat:</strong> mittatyökalun painike valitsee viimeksi käytetyn tilan,
              nuoli avaa tilavalinnan. Reunasta vedetty viiva pysyy reunan suuntaisena. R aloittaa
              hiirellä kierron 22,5° välein, Shift+R sallii vapaan kierron. X/Y/Z lukitsee akselin
              ja sama näppäin vapauttaa. Esc peruu toiminnon; seuraava Esc päättää työkalun. Voit
              myös kirjoittaa asteluvun. X-ray valitaan Viivat-listasta tai kaikille asetuksista.
            </p>
            <p>
              <strong>Vapaa mittaviiva:</strong> napsauta alkupistettä ja jatka pisteestä
              pisteeseen. Enter tai Esc päättää ketjun. Shift pitää suunnan lukittuna ja poimii
              pituuden osoitetusta pisteestä. Tuplaklikkaa valmiin viivan päätä siirtääksesi sitä;
              muut viivat jäävät paikalleen. Yhteisessä päätepisteessä valitse ensin viiva. Oikean
              napin valikossa voit siirtää päätä tai poistaa kyseisen mittaviivan.
            </p>
            <p>
              <strong>Hae viite:</strong> vie kohdistin kappaleen keskipisteen, reunan keskipisteen
              tai verteksin päälle ja pidä Shift pohjassa. Viitteestä lähtevät suuntalinjat ohjaavat
              piirtämistä. Kesken kynän viivan Shift lukitsee viivan suunnan: voit poimia pituuden
              aiemmasta pisteestä. Kosketuksella käytä Poimi viite- ja akselipainikkeita.
            </p>
            <p>
              <strong>Kynän mitat:</strong> kirjoita viivan pituus osoittamaasi suuntaan.
              Positiivinen mitta jatkaa esikatselun suuntaan myös kameran kiertämisen jälkeen;
              negatiivinen mitta kääntää etenemän. Tab vie tarvittaessa X/Y/Z-siirtymiin, joissa
              tyhjä kenttä tarkoittaa nollaa. Enter lisää pisteen ja palauttaa syötön piirtämiseen;
              seuraava Enter päättää viivan. Shift lukitsee suunnan ja poimii viitteestä pituuden.
            </p>
            <p>
              <strong>Näkymäkuutio:</strong> napsauta nimettyä tahkoa tai kierrä kuutiota vetämällä.
              Suunnan vaihto säilyttää zoomauksen. Sovita näkymään näyttää koko mallin tai valinnan.
              Näyttötilat 1–4 (Solid, Tasaväri, Ghost, Wireframe) toimivat Valitse-tilassa;
              yläreunan kuvakkeet toimivat myös muissa työkaluissa. Valinta rajaa vaikutuksen, ilman
              valintaa tila koskee koko näkymää. Ghostin läpi voi valita ja siihen voi tarttua.
            </p>
            <p>
              <strong>Mittaviivojen näkyvyys:</strong> näkymän yläreunan viivainpainike piilottaa
              kaikki tallennetut mitat, mittaviivat ja apuviivat yhdellä kertaa. Sama painike
              palauttaa ne. Piilotettuihin viivoihin ei tartuta; mittakuvan mitat säilyvät.
            </p>
            <p>
              <strong>Kopioiden linkitys:</strong> malliosan kopiot jakavat muodon ja materiaalin.
              Sijainti ja kierto koskevat kyseistä esiintymää. Tee uniikiksi irrottaa osan; Tee
              ryhmä uniikiksi säilyttää ryhmän sisäiset linkit ja irrottaa ulkopuoliset kopiot.
              Tekstuurin asettelu ja vaihtelu voivat olla osakohtaisia ilman materiaalin
              irrottamista. Ryhmä järjestää osia, kokoonpano määrittää yhteisen valinnan.
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
              <strong>Hiiri:</strong> oikea painike kiertää, keskipainike panoroi ja rulla zoomaa
              kohdistimeen. Kierto alkaa kohdistimen alla olevan pinnan ympäri; pieni rengas näyttää
              kiertopisteen. Tyhjästä tilasta aloitettu kierto käyttää muokattavan osan tai valinnan
              keskipistettä. Valinta säilyttää näkymän rajauksen; Sovita näkymään keskittää
              valinnan. Navigoi-työkalulla myös vasen painike tai yksi sormi kiertää kosketettua
              kohtaa.
            </p>
            <p>
              <strong>Säilytä työsi:</strong> automaattitallennus palauttaa työn tässä selaimessa.
              Lataa lisäksi .nivo-projektitiedosto omalle laitteellesi.
            </p>
            <p className="muted">
              Piirtäminen tukee myös vinoja tasopintoja. Suljettavan kynämuodon tulee olla
              tasomainen. Push/pull ja Offset tukevat tasopintoja. Linkitetyt komponentit tulevat
              myöhemmin.
            </p>
            <a href="https://github.com/alluharju-bot/nivo" target="_blank" rel="noreferrer">
              Avoin lähdekoodi ↗
            </a>
            <a
              className="license-link"
              href={`${import.meta.env.BASE_URL}licenses/NOTICE.txt`}
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
