import type * as THREE from 'three';

type Step = { phase: string; atMs: number };
type Compilation = { atMs: number; sourceChars: number; elapsedMs?: number; error?: string };
const rounded = (n: number) => Math.round(Math.max(0, n));

/** Local, bounded diagnostics. No geometry, project names or camera data.
 * Capture hardware details only when the user explicitly downloads the report. */
export function traceDiagnostics(now = () => performance.now()) {
  let started = now(),
    firstFrameMs: number | undefined;
  const steps: Step[] = [],
    compilations: Compilation[] = [],
    errors: string[] = [];
  const relative = () => rounded(now() - started);
  const stage = (phase: string) => {
    if (steps.at(-1)?.phase === phase) return;
    steps.push({ phase, atMs: relative() });
    if (steps.length > 32) steps.shift();
  };
  return {
    start() {
      started = now();
      firstFrameMs = undefined;
      steps.length = compilations.length = errors.length = 0;
      stage('assets');
    },
    stage,
    firstFrame() {
      firstFrameMs ??= relative();
    },
    error(message: string) {
      errors.push(message.slice(0, 2000));
      if (errors.length > 4) errors.shift();
    },
    compile(sourceChars: number) {
      const entry: Compilation = { atMs: relative(), sourceChars };
      compilations.push(entry);
      if (compilations.length > 16) compilations.shift();
      const at = now();
      return (error?: string) => {
        entry.elapsedMs = rounded(now() - at);
        if (error) entry.error = error.slice(0, 2000);
      };
    },
    timing() {
      return {
        elapsedMs: relative(),
        firstFrameMs,
        stages: steps.map((entry) => ({ ...entry })),
        compilations: compilations.map((entry) => ({
          ...entry,
          pending: entry.elapsedMs === undefined,
          elapsedMs: entry.elapsedMs ?? relative() - entry.atMs,
        })),
        errors: [...errors],
      };
    },
    report(renderer: THREE.WebGLRenderer) {
      const gl = renderer.getContext(),
        debug = gl.getExtension('WEBGL_debug_renderer_info');
      const data = renderer.domElement.dataset;
      // Explicit allowlist: the same canvas also holds private camera/selection data.
      const fields = [
        'tracePhase',
        'traceSamples',
        'traceSize',
        'traceTextureBytes',
        'traceTextureLayers',
        'traceTexturePages',
        'traceGpuMs',
        'traceResetReason',
        'traceError',
      ];
      return {
        version: import.meta.env.VITE_APP_VERSION,
        browser: navigator.userAgent,
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        parallelShaderCompile: !!gl.getExtension('KHR_parallel_shader_compile'),
        contextLost: gl.isContextLost(),
        timing: this.timing(),
        render: Object.fromEntries(fields.map((key) => [key, data[key]])),
      };
    },
  };
}
