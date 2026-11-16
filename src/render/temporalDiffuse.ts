import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { DenoiseGuides } from './traceGuides';
import { screenVertex } from './traceDenoise';

/** Scene units are millimetres. Large jumps/cuts start a new lighting history. */
export function compatibleHistoryCamera(
  previousWorld: THREE.Matrix4,
  previousProjection: THREE.Matrix4,
  camera: THREE.Camera,
) {
  const a = previousWorld.elements,
    b = camera.matrixWorld.elements;
  const p = previousProjection.elements,
    q = camera.projectionMatrix.elements;
  return (
    Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]) <= 500 &&
    a[8] * b[8] + a[9] * b[9] + a[10] * b[10] > Math.cos(Math.PI / 12) &&
    p[15] === q[15] &&
    [0, 5].every((i) => Number.isFinite(q[i] / p[i]) && Math.abs(q[i] / p[i] - 1) < 0.1)
  );
}

/** Conservative camera-motion history for diffuse lighting only. Specular and
 * transmission stay current-frame. Reproject illumination, never surface grain.
 * Animated geometry invalidates the entire history until object motion vectors
 * exist; that is preferable to dragging old shadows behind moving objects. */
export function temporalDiffuse() {
  let history: THREE.WebGLRenderTarget | undefined, next: THREE.WebGLRenderTarget | undefined;
  let albedo: THREE.WebGLRenderTarget | undefined, normal: THREE.WebGLRenderTarget | undefined;
  let valid = false,
    accumulatedFrames = 0;
  const previousWorld = new THREE.Matrix4(),
    previousProjection = new THREE.Matrix4();
  const previousView = new THREE.Matrix4();
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      current: { value: null },
      albedo: { value: null },
      normal: { value: null },
      history: { value: null },
      previousAlbedo: { value: null },
      previousNormal: { value: null },
      valid: { value: false },
      projectionInverse: { value: new THREE.Matrix4() },
      previousProjectionInverse: { value: new THREE.Matrix4() },
      currentToPreviousView: { value: new THREE.Matrix4() },
      previousProjection: { value: new THREE.Matrix4() },
    },
    vertexShader: screenVertex,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D current, albedo, normal, history, previousAlbedo, previousNormal;
      uniform bool valid;
      uniform mat4 projectionInverse, previousProjectionInverse, currentToPreviousView, previousProjection;
      vec3 pointAt(vec2 uv, float depth, mat4 inverseProjection) {
        vec4 a = inverseProjection * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
        vec4 b = inverseProjection * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
        vec3 origin = a.xyz / a.w;
        vec3 direction = b.xyz / b.w - origin;
        return origin + direction * ((-depth * 1000.0 - origin.z) / direction.z);
      }
      vec3 reflectance(vec3 a) { return max(a, vec3(0.0001)); }
      void main() {
        vec4 source = textureLod(current, vUv, 0.0), a = textureLod(albedo, vUv, 0.0), n = textureLod(normal, vUv, 0.0);
        gl_FragColor = source;
        // Alpha zero in the albedo guide denotes transmission. Normals/depth
        // cannot describe its second surface or subpixel/background coverage.
        if (!valid || n.a <= 0.0 || a.a < 0.14 || source.a < 0.99) return;
        vec3 viewPoint = pointAt(vUv, n.a, projectionInverse);
        vec3 oldPoint = (currentToPreviousView * vec4(viewPoint, 1.0)).xyz;
        vec4 clip = previousProjection * vec4(oldPoint, 1.0);
        if (clip.w <= 0.0 || oldPoint.z >= 0.0) return;
        vec2 oldUv = clip.xy / clip.w * 0.5 + 0.5;
        vec2 size = vec2(textureSize(current, 0)), pixel = 1.0 / size;
        if (any(lessThan(oldUv, pixel * 0.5)) || any(greaterThan(oldUv, 1.0 - pixel * 0.5))) return;
        vec3 currentNormal = normalize(n.rgb * 2.0 - 1.0);
        vec3 oldExpectedNormal = normalize(mat3(currentToPreviousView) * currentNormal);
        vec2 p = oldUv * size - 0.5, base = floor(p), fraction = fract(p);
        vec3 oldLight = vec3(0.0); float accepted = 0.0;
        float planeTolerance = max(0.35, -oldPoint.z * 0.0002);
        for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
          vec2 uv = (base + vec2(float(x),float(y)) + 0.5) * pixel;
          vec4 an = textureLod(previousAlbedo, uv, 0.0), nn = textureLod(previousNormal, uv, 0.0);
          if (nn.a <= 0.0 || an.a < 0.14 || abs(an.a - a.a) > 0.05) continue;
          vec3 oldNormal = normalize(nn.rgb * 2.0 - 1.0);
          if (dot(oldNormal,oldExpectedNormal) < 0.95) continue;
          vec3 oldSurface = pointAt(uv,nn.a,previousProjectionInverse);
          if (abs(dot(oldSurface - oldPoint, oldExpectedNormal)) > planeTolerance) continue;
          vec3 colorDifference = (an.rgb - a.rgb) / max(an.rgb + a.rgb,vec3(0.05));
          if (dot(colorDifference,colorDifference) > 0.12) continue;
          vec2 w = mix(1.0-fraction,fraction,vec2(float(x),float(y)));
          float weight = w.x*w.y;
          oldLight += weight * textureLod(history, uv, 0.0).rgb / reflectance(an.rgb);
          accepted += weight;
        }
        if (accepted < 0.5) return;
        oldLight /= accepted;
        vec3 currentLight = source.rgb / reflectance(a.rgb);
        vec3 sum = vec3(0.0), sum2 = vec3(0.0); float count = 0.0;
        bool edge = false;
        for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
          vec2 uv = clamp(vUv+vec2(float(x),float(y))*pixel,pixel*0.5,1.0-pixel*0.5);
          vec4 an=textureLod(albedo, uv, 0.0), nn=textureLod(normal, uv, 0.0);
          vec3 surface = pointAt(uv,nn.a,projectionInverse);
          // Do not carry history through mixed-coverage silhouettes. Leave
          // the tracer's antialiased current result untouched there.
          if(nn.a<=0.0 || abs(dot(surface-viewPoint,currentNormal))>max(0.35,n.a*0.2)) { edge=true; continue; }
          vec3 c = textureLod(current, uv, 0.0).rgb / reflectance(an.rgb);
          sum += c; sum2 += c*c; count += 1.0;
        }
        if(edge || count<1.0) return;
        vec3 mean=sum/count, sigma=sqrt(max(vec3(0.0),sum2/count-mean*mean));
        // Clamp illumination history around CURRENT lighting. This limits
        // residual changes without spatially blurring the current albedo.
        vec3 extent=max(3.0*sigma,abs(currentLight)*0.08+vec3(0.002));
        oldLight=clamp(oldLight,max(vec3(0.0),mean-extent),mean+extent);
        gl_FragColor=vec4(mix(currentLight,oldLight,0.6*accepted)*reflectance(a.rgb),source.a);
      }
    `,
  });
  const copy = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: { map: { value: null } },
    vertexShader: screenVertex,
    fragmentShader:
      'varying vec2 vUv; uniform sampler2D map; void main(){gl_FragColor=textureLod(map, vUv, 0.0);}',
  });
  const quad = new FullScreenQuad(material);
  const release = () => {
    history?.dispose();
    next?.dispose();
    albedo?.dispose();
    normal?.dispose();
    history = next = albedo = normal = undefined;
    valid = false;
  };
  return {
    get bytes() {
      return history ? history.width * history.height * 40 : 0;
    },
    get accumulatedFrames() {
      return accumulatedFrames;
    },
    invalidate() {
      valid = false;
    },
    draw(
      renderer: THREE.WebGLRenderer,
      source: THREE.WebGLRenderTarget,
      guide: DenoiseGuides,
      camera: THREE.Camera,
    ) {
      const { width, height } = source;
      if (history?.width !== width || history.height !== height) release();
      const options = {
        type: THREE.HalfFloatType,
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      };
      history ??= new THREE.WebGLRenderTarget(width, height, options);
      next ??= new THREE.WebGLRenderTarget(width, height, options);
      albedo ??= new THREE.WebGLRenderTarget(width, height, options);
      normal ??= new THREE.WebGLRenderTarget(width, height, { ...options, type: THREE.FloatType });
      const continuing =
        valid && compatibleHistoryCamera(previousWorld, previousProjection, camera);
      const u = material.uniforms;
      u.current.value = source.texture;
      u.albedo.value = guide.albedo;
      u.normal.value = guide.normal;
      u.history.value = history.texture;
      u.previousAlbedo.value = albedo.texture;
      u.previousNormal.value = normal.texture;
      u.valid.value = continuing;
      u.projectionInverse.value.copy(guide.projectionInverse);
      u.previousProjectionInverse.value.copy(previousProjection).invert();
      u.previousProjection.value.copy(previousProjection);
      previousView.copy(previousWorld).invert();
      u.currentToPreviousView.value.multiplyMatrices(previousView, camera.matrixWorld);
      const target = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(next);
        quad.render(renderer);
        quad.material = copy;
        copy.uniforms.map.value = guide.albedo;
        renderer.setRenderTarget(albedo);
        quad.render(renderer);
        copy.uniforms.map.value = guide.normal;
        renderer.setRenderTarget(normal);
        quad.render(renderer);
      } finally {
        quad.material = material;
        copy.uniforms.map.value = null;
        renderer.setRenderTarget(target);
      }
      [history, next] = [next, history];
      previousWorld.copy(camera.matrixWorld);
      previousProjection.copy(camera.projectionMatrix);
      valid = true;
      if (continuing) accumulatedFrames++;
      return history.texture;
    },
    dispose() {
      release();
      quad.dispose();
      copy.dispose();
      material.dispose();
    },
  };
}
