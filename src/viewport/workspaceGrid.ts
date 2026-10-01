import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

/** Adaptive grid with no nearby edge; screen-sized world axes and origin marker. */
export function createWorkspaceGrid(scene: THREE.Scene, container: HTMLDivElement) {
  const group = new THREE.Group();
  scene.add(group);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      spacing: { value: 100 },
      cameraXY: { value: new THREE.Vector2() },
      fadeDistance: { value: 100000 },
    },
    vertexShader: `
      varying vec2 worldXY;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldXY = world.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      varying vec2 worldXY;
      uniform float spacing;
      uniform vec2 cameraXY;
      uniform float fadeDistance;
      #include <logdepthbuf_pars_fragment>
      float gridLine(float stepSize) {
        vec2 p = worldXY / stepSize;
        vec2 footprint = fwidth(p);
        vec2 line = abs(fract(p - 0.5) - 0.5) / max(footprint, vec2(0.00001));
        vec2 ink = (1.0 - min(line, vec2(1.0))) * (1.0 - smoothstep(vec2(0.2), vec2(0.6), footprint));
        return max(ink.x, ink.y);
      }
      void main() {
        #include <logdepthbuf_fragment>
        float minor = gridLine(spacing);
        float major = gridLine(spacing * 10.0);
        float fade = 1.0 - smoothstep(fadeDistance * 0.4, fadeDistance, distance(worldXY, cameraXY));
        float alpha = max(minor * 0.16, major * 0.35) * fade;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vec3(0.26, 0.36, 0.30), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(10_000_000, 10_000_000), material);
  grid.position.z = -0.5;
  group.add(grid);
  const colors = ['#cb4141', '#248b51', '#336eda'];
  const axes = colors.map((color, i) => {
    const from = [0, 0, 0],
      to = [0, 0, 0];
    from[i] = -5_000_000;
    to[i] = 5_000_000;
    const line = new Line2(
      new LineGeometry().setPositions([...from, ...to]),
      new LineMaterial({
        color: new THREE.Color(color).getHex(),
        linewidth: 2.8,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      }),
    );
    line.renderOrder = 90;
    group.add(line);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(2.5, 8, 10),
      new THREE.MeshBasicMaterial({ color, depthTest: false, toneMapped: false }),
    );
    arrow.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3().setComponent(i, 1),
    );
    arrow.renderOrder = 91;
    group.add(arrow);
    const label = document.createElement('span');
    label.className = 'world-axis-label';
    label.textContent = `${['X', 'Y', 'Z'][i]}+`;
    label.style.color = color;
    label.dataset.testid = `world-axis-${i}`;
    container.append(label);
    return { line, arrow, label };
  });
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, toneMapped: false }),
  );
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#223d31', depthTest: false, toneMapped: false }),
  );
  origin.renderOrder = 92;
  center.renderOrder = 93;
  origin.add(center);
  group.add(origin);
  const label = document.createElement('span');
  label.className = 'world-origin-label';
  label.textContent = 'ORIGO · 0, 0, 0';
  label.dataset.testid = 'world-origin';
  container.append(label);
  const place = (element: HTMLElement, point: THREE.Vector3, camera: THREE.Camera) => {
    const p = point.clone().project(camera);
    element.hidden = Math.abs(p.z) > 1 || Math.abs(p.x) > 0.98 || Math.abs(p.y) > 0.95;
    element.style.left = `${((p.x + 1) * container.clientWidth) / 2 + 10}px`;
    element.style.top = `${((1 - p.y) * container.clientHeight) / 2 + 10}px`;
    return p;
  };
  return {
    update(
      camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
      distance: number,
      style: 'subtle' | 'strong',
      showLabels: boolean,
    ) {
      const height = Math.max(1, container.clientHeight);
      const visible =
        camera instanceof THREE.OrthographicCamera
          ? (camera.top - camera.bottom) / camera.zoom
          : 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const desired = Math.max(1, visible / 30);
      const base = Math.pow(10, Math.floor(Math.log10(desired)));
      const spacing = base * ([1, 2, 5, 10].find((n) => n * base >= desired) ?? 10);
      material.uniforms.spacing.value = spacing;
      material.uniforms.cameraXY.value.set(camera.position.x, camera.position.y);
      material.uniforms.fadeDistance.value = Math.max(100000, visible * 150);
      container.dataset.gridSpacing = String(spacing);
      const originScale =
        camera instanceof THREE.OrthographicCamera
          ? visible / height
          : (2 * camera.position.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
            height;
      const strong = style === 'strong';
      origin.scale.setScalar(originScale * (strong ? 6 : 3));
      const projectedOrigin = place(label, new THREE.Vector3(), camera);
      if (!showLabels) label.hidden = true;
      axes.forEach(({ line, arrow, label: axisLabel }, i) => {
        line.material.resolution.set(container.clientWidth, height);
        line.material.linewidth = strong ? 2.8 : 1.1;
        line.material.opacity = strong ? 0.8 : 0.4;
        arrow.scale.setScalar(originScale * (strong ? 1 : 0.55));
        arrow.position.set(0, 0, 0).setComponent(i, originScale * 85);
        const p = place(axisLabel, arrow.position, camera);
        if (
          Math.hypot(
            (p.x - projectedOrigin.x) * container.clientWidth,
            (p.y - projectedOrigin.y) * height,
          ) < 50
        )
          axisLabel.hidden = true;
        if (!showLabels) axisLabel.hidden = true;
      });
    },
    dispose() {
      label.remove();
      axes.forEach((axis) => axis.label.remove());
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
      scene.remove(group);
    },
  };
}
