import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { BodyMesh } from '../cad/protocol';
import type { Body, Project, Vec3 } from '../model/project';
import { defaultAppearance, emissionSettings, type Emission } from '../model/materials';
import { changeEmission } from '../model/emission';
import { faceMaterialBody, type PaintScope as Scope } from '../model/faceMaterials';
import { bodyVisible } from '../model/transforms';
import { bodyLocked } from '../model/groups';
import { spotEmitterFrame } from '../render/lights';
import { textureFrameMatrix } from '../render/materials';
import { EmissionControls } from './EmissionControls';
import { PaintScope } from './PaintScope';

export type LightEditing = {
  origin: Vec3;
  direction: Vec3;
  angle: number;
  enabled: boolean;
  aiming: boolean;
  onStartAim: () => void;
  onAim: (point: Vec3, accept: boolean) => void;
};

function frameFor(body: Body, data: BodyMesh, emission: Emission, face?: number) {
  const range = face === undefined ? undefined : data.faces.find((f) => f.index === face);
  if (face !== undefined && !range) return;
  const vertices = range
    ? data.triangles
        .slice(range.start, range.start + range.count)
        .flatMap((i) => data.vertices.slice(i * 3, i * 3 + 3))
    : data.vertices;
  if (vertices.length < 9) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const result = spotEmitterFrame(body, geometry, emission);
  geometry.dispose();
  return result;
}

function aimAt(body: Body, origin: THREE.Vector3, point: Vec3): Vec3 | undefined {
  const delta = new THREE.Vector3(...point).sub(origin);
  return delta.length() < 0.01
    ? undefined
    : delta.transformDirection(textureFrameMatrix(body).invert()).toArray();
}

export function useLightWorkspace({
  project,
  meshes,
  selected,
  selectedIds,
  active,
  busy,
  scope,
  linked,
  select,
  transact,
}: {
  project: Project;
  meshes: BodyMesh[];
  selected?: string;
  selectedIds: string[];
  active: boolean;
  busy: boolean;
  scope: Scope;
  linked: boolean;
  select: (id: string) => void;
  transact: (project: Project, message: string) => Promise<unknown>;
}) {
  const [target, setTarget] = useState<{ id: string; face: number }>();
  const [aiming, setAiming] = useState(false);
  const [preview, setPreview] = useState<Partial<Emission>>();
  const body = active
    ? project.bodies.find((b) => b.id === selected && bodyVisible(b, project.groups))
    : undefined;
  const face = scope === 'face' && target?.id === selected ? target?.face : undefined;
  const source = useMemo(
    () =>
      body && (scope === 'body' || face !== undefined) ? faceMaterialBody(body, face) : undefined,
    [body, scope, face],
  );
  const appearance = source?.appearance ?? defaultAppearance(source?.material);
  const emission = emissionSettings(appearance, source?.color ?? '#ffffff');
  const ids = body ? (face === undefined ? selectedIds : [body.id]) : [];
  const locked = project.bodies.some((b) => ids.includes(b.id) && bodyLocked(b, project.groups));
  const disabled = busy || locked || !source;
  const data = meshes.find((m) => m.id === body?.id);
  const frame = useMemo(() => {
    if (!body || !data || !source) return;
    return frameFor(body, data, emission, face);
  }, [body, data, face, source, emission.direction, emission.aim]);
  useEffect(() => {
    setAiming(false);
    setPreview(undefined);
  }, [active, selected, scope, body, data, selectedIds]);
  const change = (patch: Partial<Emission>) => {
    if (disabled || !ids.length) return;
    setPreview(undefined);
    // When starting a spotlight on a face, point it out of that face by default.
    if (patch.type === 'spot' && emission.type !== 'spot' && face !== undefined && body && data) {
      const normal = data.faces.find((f) => f.index === face)?.normal;
      if (normal) {
        const direction = new THREE.Vector3(...normal).transformDirection(
          textureFrameMatrix(body).invert(),
        );
        const values = direction.toArray();
        const axis = values.map(Math.abs).indexOf(Math.max(...values.map(Math.abs)));
        patch = {
          ...patch,
          direction: `${values[axis] < 0 ? '-' : ''}${'xyz'[axis]}` as Emission['direction'],
          aim: values,
        };
      }
    }
    return transact(
      {
        ...project,
        bodies: project.bodies.map((b) =>
          ids.includes(b.id) ? { ...changeEmission(b, patch, face), localMaterial: !linked } : b,
        ),
      },
      face === undefined
        ? `${ids.length} osan valoasetukset päivitetty.`
        : 'Pinnan valoasetukset päivitetty.',
    );
  };
  const cancel = () => {
    setAiming(false);
    setPreview(undefined);
  };
  const startAim = () => {
    if (!disabled) {
      setAiming((v) => !v);
      setPreview(undefined);
    }
  };
  const shown = { ...emission, ...preview };
  const direction =
    preview?.aim && body
      ? new THREE.Vector3(...preview.aim).transformDirection(textureFrameMatrix(body))
      : frame?.direction;
  const viewport: LightEditing | undefined =
    active && frame && direction && !disabled
      ? {
          origin: frame.position.toArray(),
          direction: direction.toArray(),
          angle: shown.angle,
          enabled: shown.enabled && shown.type === 'spot',
          aiming,
          onStartAim: startAim,
          onAim(point, accept) {
            if (!body) return;
            const aim = aimAt(body, frame.position, point);
            if (!aim) return;
            if (accept) {
              setAiming(false);
              if (ids.length <= 1) void change({ aim });
              else {
                setPreview(undefined);
                const familyDirections = new Map<string, Vec3>();
                void transact(
                  {
                    ...project,
                    bodies: project.bodies.map((b) => {
                      if (!ids.includes(b.id)) return b;
                      const mesh = meshes.find((m) => m.id === b.id);
                      const settings = emissionSettings(
                        b.appearance ?? defaultAppearance(b.material),
                        b.color,
                      );
                      const origin = mesh && frameFor(b, mesh, settings)?.position;
                      const family = linked && b.component?.id;
                      const direction =
                        (family && familyDirections.get(family)) ||
                        (origin && aimAt(b, origin, point));
                      if (family && direction) familyDirections.set(family, direction);
                      return direction
                        ? { ...changeEmission(b, { aim: direction }), localMaterial: !linked }
                        : b;
                    }),
                  },
                  `${ids.length} valoa suunnattu kohteeseen.`,
                );
              }
            } else setPreview({ aim });
          },
        }
      : undefined;
  return {
    viewport,
    aiming,
    cancel,
    startAim,
    appearance,
    emission,
    disabled,
    name: source ? `${source.name}${face !== undefined ? ' · pinta' : ''}` : undefined,
    color: source?.color ?? '#ffffff',
    count: ids.length,
    change,
    previewAngle: (angle?: number) => setPreview(angle === undefined ? undefined : { angle }),
    pick(id: string, face: number) {
      select(id);
      setTarget({ id, face });
      cancel();
    },
  };
}

export function LightPanel({
  light,
  scope,
  onScope,
  linked,
  onLinked,
}: {
  light: ReturnType<typeof useLightWorkspace>;
  scope: Scope;
  onScope: (scope: Scope) => void;
  linked: boolean;
  onLinked: (linked: boolean) => void;
}) {
  return (
    <section className="light-panel" aria-label="Osan valoasetukset">
      <PaintScope value={scope} onChange={onScope} />
      <p className="muted">
        {light.name
          ? light.count > 1
            ? `${light.count} valittua osaa`
            : light.name
          : 'Napsauta osaa tai pintaa, jonka valoa haluat säätää.'}
      </p>
      {light.emission.enabled && light.emission.type === 'spot' && (
        <>
          <button
            className="button outlined full"
            aria-pressed={light.aiming}
            disabled={light.disabled}
            onClick={light.startAim}
          >
            {light.aiming ? 'Peru suuntaaminen' : 'Suuntaa kohteeseen'}
          </button>
          <p className="muted">
            {light.aiming
              ? 'Napsauta pistettä tai pintaa. Esc peruu suunnan poiminnan.'
              : 'Keila näyttää suunnan ja avautumiskulman. Valaistus näkyy renderissä.'}
          </p>
        </>
      )}
      <EmissionControls
        appearance={light.appearance}
        color={light.color}
        busy={light.disabled}
        onEmissionChange={light.change}
        onAnglePreview={light.previewAngle}
      />
      <label className="checkbox-label">
        <input type="checkbox" checked={linked} onChange={(e) => onLinked(e.target.checked)} />
        Myös linkitetyt kopiot
      </label>
      {linked && (
        <small className="muted">Linkitetyt kopiot jakavat myös valon paikallisen suunnan.</small>
      )}
    </section>
  );
}
