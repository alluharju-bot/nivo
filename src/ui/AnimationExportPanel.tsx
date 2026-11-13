import { useEffect, useRef, useState } from 'react';
import type { AnimationWorkspaceState } from './AnimationWorkspace';
import type { RenderSnapshot } from '../render/snapshot';
import {
  animationRenderPlan,
  animationResolutions,
  poseAnimationFrame,
} from '../render/animationRender';
import {
  chooseAnimationDestination,
  createAnimationOutput,
  type AnimationOutputFormat,
} from '../render/animationOutput';
import { canvasPNG, renderFrames, type RenderJobProgress } from '../render/traceJob';
import { downloadFile, safeFilename } from '../storage/projects';

export function AnimationExportPanel({
  state: s,
  name,
  capture,
  onBusy,
  onAspect,
}: {
  state: AnimationWorkspaceState;
  name: string;
  capture: () => Promise<RenderSnapshot>;
  onBusy: (busy: boolean) => void;
  onAspect: (aspect: number) => void;
}) {
  const [resolution, setResolution] = useState(1),
    [fps, setFPS] = useState(30);
  const [samples, setSamples] = useState(1024),
    [denoise, setDenoise] = useState(true);
  const [start, setStart] = useState(0),
    [end, setEnd] = useState(s.clip?.duration ?? 1);
  const [format, setFormat] = useState<AnimationOutputFormat>('mp4');
  const [running, setRunning] = useState(false),
    [message, setMessage] = useState('');
  const [progress, setProgress] = useState<RenderJobProgress>();
  const [completed, setCompleted] = useState(0),
    [average, setAverage] = useState(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  const run = async (test: boolean) => {
    if (controller.current || !s.data || !s.clip) return;
    let snapshot: RenderSnapshot | undefined;
    let output: Awaited<ReturnType<typeof createAnimationOutput>> | undefined;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setMessage('Valmistellaan…');
    setCompleted(0);
    setAverage(0);
    setProgress(undefined);
    onBusy(true);
    s.pause();
    try {
      const settings = { ...animationResolutions[resolution], fps, start, end, samples, denoise };
      const plan = animationRenderPlan(settings, s.clip.duration);
      if (s.dirty)
        throw new Error(
          'Tallenna objektien keskeneräiset asentomuutokset avainruuduksi ennen renderöintiä.',
        );
      // A private clip/data snapshot makes every frame independent of elapsed wall time.
      const data = structuredClone(s.data),
        clip = structuredClone(s.clip);
      if (!clip.camera?.keys.length) throw new Error('Lisää kamerareitille vähintään yksi scene.');
      if (!test) {
        const destination = await chooseAnimationDestination(format, name);
        output = await createAnimationOutput(format, destination, settings, {
          data,
          clipId: clip.id,
        });
      }
      abort.signal.throwIfAborted();
      snapshot = await capture();
      snapshot.aspect = settings.width / settings.height;
      const owned = snapshot;
      const testTime = s.currentTime();
      let previous = performance.now(),
        measured = 0;
      await renderFrames(
        owned,
        settings,
        abort.signal,
        (p) => {
          if (mounted.current) {
            setProgress(p);
            setMessage('');
          }
        },
        test ? 1 : plan.frames,
        (index) => poseAnimationFrame(owned, data, clip, test ? testTime : plan.time(index)),
        async (canvas, index) => {
          abort.signal.throwIfAborted();
          if (test)
            downloadFile(
              await canvasPNG(canvas),
              `${safeFilename(name)}-${testTime.toFixed(2)}s.png`,
              'image/png',
            );
          else await output!.add(canvas, index);
          const now = performance.now();
          // Exclude the first frame's shader/BVH startup from the per-frame estimate.
          if (index > 0) measured += (now - previous) / 1000;
          previous = now;
          if (mounted.current) {
            setCompleted(index + 1);
            if (index > 0) setAverage(measured / index);
          }
        },
      );
      abort.signal.throwIfAborted();
      await output?.finish();
      output = undefined;
      if (mounted.current)
        setMessage(
          test
            ? 'Testruutu tallennettu valitulla resoluutiolla ja laadulla.'
            : 'Animaatio renderöity ja tallennettu.',
        );
    } catch (e) {
      await output?.cancel().catch(() => {});
      if (mounted.current)
        setMessage(
          abort.signal.aborted || (e as Error).name === 'AbortError'
            ? format === 'png'
              ? 'Renderöinti keskeytetty. PNG-kuvasarjan valmiit ruudut säilyvät.'
              : 'Renderöinti keskeytetty. Keskeneräinen MP4 ei ole valmis video.'
            : (e as Error).message,
        );
    } finally {
      snapshot?.dispose();
      controller.current = undefined;
      if (mounted.current) {
        setRunning(false);
        onBusy(false);
      }
    }
  };
  const total = progress?.frames ?? Math.max(0, Math.ceil((end - start) * fps));
  return (
    <details className="animation-export-panel">
      <summary>Renderöi animaatio · HD–4K</summary>
      <fieldset disabled={running} className="animation-export-settings">
        <label>
          Resoluutio
          <select
            aria-label="Animaation resoluutio"
            value={resolution}
            onChange={(e) => {
              const index = Number(e.target.value);
              setResolution(index);
              const r = animationResolutions[index];
              onAspect(r.width / r.height);
            }}
          >
            {animationResolutions.map((r, i) => (
              <option key={r.name} value={i}>
                {r.name} · {r.width} × {r.height}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kuvataajuus
          <select
            aria-label="Animaation kuvataajuus"
            value={fps}
            onChange={(e) => setFPS(Number(e.target.value))}
          >
            {[24, 25, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} fps
              </option>
            ))}
          </select>
        </label>
        <label>
          Alku · s
          <input
            aria-label="Renderöinnin alku"
            type="number"
            min={0}
            step="0.1"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
          />
        </label>
        <label>
          Loppu · s
          <input
            aria-label="Renderöinnin loppu"
            type="number"
            min={0}
            max={s.clip?.duration}
            step="0.1"
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
          />
        </label>
        <label>
          Näytteitä / ruutu
          <input
            aria-label="Animaation näytemäärä"
            type="number"
            min={1}
            max={65536}
            step={1}
            value={samples}
            onChange={(e) => setSamples(Number(e.target.value))}
          />
        </label>
        <label>
          Tiedosto
          <select
            aria-label="Animaation tiedostomuoto"
            value={format}
            onChange={(e) => setFormat(e.target.value as AnimationOutputFormat)}
          >
            <option value="mp4">MP4 · korkea laatu</option>
            <option value="png">PNG-kuvasarja · häviötön</option>
          </select>
        </label>
        <label className="camera-checkbox">
          <input type="checkbox" checked={denoise} onChange={(e) => setDenoise(e.target.checked)} />{' '}
          Kohinanpoisto
        </label>
        <div className="camera-actions">
          <button onClick={() => void run(true)}>Testrenderöi nykyinen ruutu</button>
          <button className="button dark" onClick={() => void run(false)}>
            Renderöi animaatio
          </button>
        </div>
      </fieldset>
      <p className="muted">
        Jokainen ruutu lasketaan täyteen näytemäärään alkuperäisessä resoluutiossa. Aikarajaa ei
        ole. Aloita testruudusta; myös objektien animaatiot renderöidään. Pidä välilehti näkyvissä.
      </p>
      {format === 'png' && (
        <p className="muted">
          Valitse tallennuskansio. Ilman kansiotukea kuvat ladataan ZIP-osina (enintään noin 64
          Mt/osio).
        </p>
      )}
      {running && (
        <div className="animation-export-progress" role="status">
          <progress
            max={total}
            value={
              completed + (progress?.phase === 'rendering' ? progress.samples / progress.target : 0)
            }
          />
          <span>
            {completed} / {total} ruutua ·{' '}
            {progress?.phase === 'preparing'
              ? 'Valmistellaan ruutua'
              : `${progress?.samples ?? 0} / ${samples} näytettä`}
            {average > 0 &&
              ` · noin ${Math.ceil(((total - completed) * average) / 60)} min jäljellä`}
          </span>
          <button onClick={() => controller.current?.abort()}>Keskeytä renderöinti</button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
