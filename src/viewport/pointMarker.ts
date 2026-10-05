import * as THREE from 'three';
import type { Vec3 } from '../model/project';

/** A readable ring whose diameter is in CSS pixels, independent of model scale. */
export function pointMarker(point: Vec3, color: string, size = 12) {
  const image = document.createElement('canvas');
  image.width = image.height = 32;
  const context = image.getContext('2d')!;
  for (const [radius, fill] of [
    [15, '#ffffff'],
    [10, '#354b48'],
    [7, color],
  ] as const) {
    context.beginPath();
    context.arc(16, 16, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
  }
  const map = new THREE.CanvasTexture(image);
  map.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3()]),
    new THREE.PointsMaterial({
      map,
      size,
      sizeAttenuation: false,
      transparent: true,
      alphaTest: 0.05,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  marker.position.set(...point);
  marker.renderOrder = 100;
  marker.raycast = () => {};
  return marker;
}
