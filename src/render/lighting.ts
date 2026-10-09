import * as THREE from 'three';
import type { RenderSettings } from './scene';

export const sunDefaults: NonNullable<RenderSettings['sun']> = {
  enabled: false,
  azimuth: 135,
  elevation: 35,
  power: 1,
  color: '#fff1d6',
  softness: 0.53,
};

/** Z up; the compass points toward +Y at 0°, +X at 90°. */
export function sunDirection(azimuth: number, elevation: number) {
  const a = THREE.MathUtils.degToRad(azimuth),
    e = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e));
}

/** Undefined preserves the original studio rig in existing projects. Explicit
 * elevation puts both panels at the chosen angle without changing their distance. */
export function studioOffsets(rotation: number, elevation?: number) {
  return [new THREE.Vector3(-1, -0.8, 1.8), new THREE.Vector3(1, 1, 1)].map((offset) => {
    if (elevation !== undefined) {
      const distance = offset.length();
      const azimuth = Math.atan2(offset.x, offset.y) * THREE.MathUtils.RAD2DEG;
      offset.copy(sunDirection(azimuth, elevation)).multiplyScalar(distance);
    }
    return offset.applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rotation));
  });
}

/** Z-up lookAt needs a different up vector when a panel is directly overhead. */
export function aimLight(light: THREE.Object3D, center: THREE.Vector3) {
  const direction = light.position.clone().sub(center).normalize();
  light.up.set(0, Math.abs(direction.z) > 0.999 ? 1 : 0, Math.abs(direction.z) > 0.999 ? 0 : 1);
  light.lookAt(center);
}

export type TraceMaterial = THREE.MeshStandardMaterial & { castShadow?: boolean };

/** The tracer reads castShadow from materials, whereas raster uses shadow maps.
 * Keep camera/reflection visibility intact when disabling light occlusion. */
export function setTraceShadows(scene: THREE.Object3D, enabled: boolean) {
  let changed = false;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const traced = material as TraceMaterial;
      if (traced.castShadow !== enabled) {
        traced.castShadow = enabled;
        changed = true;
      }
    }
  });
  return changed;
}

export const lightingPresets = [
  {
    id: 'studio',
    name: 'Studio',
    description: 'Pehmeä tuotekuva',
    settings: {
      environment: 'studio',
      lightPower: 1,
      environmentPower: 1,
      lightRotation: 0,
      lightElevation: undefined,
      studioSoftness: 1,
      sun: { ...sunDefaults },
    },
  },
  {
    id: 'daylight',
    name: 'Päivänvalo',
    description: 'Raikas, suunnattu valo',
    settings: {
      environment: 'studio',
      lightPower: 0.35,
      environmentPower: 0.7,
      lightRotation: 0,
      lightElevation: undefined,
      studioSoftness: 1.3,
      sun: { ...sunDefaults, enabled: true, elevation: 42, power: 1.2, color: '#fff4e6' },
    },
  },
  {
    id: 'evening',
    name: 'Iltavalo',
    description: 'Lämmin valo ja pitkät varjot',
    settings: {
      environment: 'warm',
      lightPower: 0.25,
      environmentPower: 0.5,
      lightRotation: 45,
      lightElevation: undefined,
      studioSoftness: 1.5,
      sun: {
        ...sunDefaults,
        enabled: true,
        azimuth: 235,
        elevation: 18,
        power: 1,
        color: '#ffd2a0',
        softness: 1.2,
      },
    },
  },
  {
    id: 'interior',
    name: 'Omat valaisimet',
    description: 'Mallin LEDit ja valaisimet',
    settings: {
      environment: 'dark',
      lightPower: 0,
      environmentPower: 0.25,
      lightRotation: 0,
      lightElevation: undefined,
      studioSoftness: 1,
      sun: { ...sunDefaults },
    },
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  settings: Partial<RenderSettings>;
}[];

export function imageToneMapping(look: RenderSettings['look']) {
  return look === 'filmic' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
}

/** A directional preview and a distant finite emitter share the same direction and power. */
export function createSunLighting(scene: THREE.Scene) {
  const preview = new THREE.DirectionalLight();
  preview.userData.previewOnly = true;
  preview.castShadow = true;
  preview.shadow.mapSize.set(2048, 2048);
  preview.shadow.bias = -0.00015;
  const traced = new THREE.RectAreaLight();
  const traceGroup = new THREE.Group();
  traceGroup.visible = false;
  traceGroup.userData.traceOnly = true;
  traceGroup.add(traced);
  scene.add(preview, preview.target, traceGroup);
  return {
    preview,
    traced,
    update(sun: RenderSettings['sun'], center: THREE.Vector3, extent: number) {
      const settings = sun ?? sunDefaults;
      const direction = sunDirection(settings.azimuth, settings.elevation);
      const power = settings.enabled ? settings.power * 3 : 0;
      preview.visible = power > 0;
      preview.intensity = power;
      preview.color.set(settings.color);
      preview.position.copy(center).addScaledVector(direction, extent * 4);
      preview.target.position.copy(center);
      Object.assign(preview.shadow.camera, {
        left: -extent * 2,
        right: extent * 2,
        top: extent * 2,
        bottom: -extent * 2,
        near: Math.max(0.1, extent * 0.01),
        far: extent * 8,
      });
      preview.shadow.camera.updateProjectionMatrix();
      preview.shadow.normalBias = extent * 0.0005;
      preview.shadow.radius = Math.max(0.5, Math.min(5, settings.softness));
      // Solar disk's angular diameter is represented by a distant area light.
      // Renormalize radiance when its size changes so softness does not dim the model.
      const distance = extent * 50;
      traced.position.copy(center).addScaledVector(direction, distance);
      aimLight(traced, center);
      traced.width = traced.height =
        2 * distance * Math.tan(THREE.MathUtils.degToRad(settings.softness) / 2);
      traced.color.copy(preview.color);
      traced.intensity = (power * distance * distance) / (traced.width * traced.height);
    },
    dispose() {
      preview.shadow.dispose();
    },
  };
}
