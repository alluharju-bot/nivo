import { useEffect, useRef, useState } from 'react';
import type { AnimationWorkspaceState } from './AnimationWorkspace';
import type { RenderSnapshot } from '../render/snapshot';
import {
  animationRenderPlan,
  animationRenderPosition,
  animationResolutions,
  poseAnimationFrame,
} from '../render/animationRender';
import {
  chooseAnimationDestination,
  createAnimationOutput,
  type AnimationOutputFormat,
} from '../render/animationOutput';
import {
  canvasPNG,
  renderFrames,
  yieldRenderUI,
  type RenderJobProgress,
  type RenderFramePreview,
} from '../render/traceJob';
import { prepareWithin } from '../render/tracePreparation';
import { downloadFile, safeFilename } from '../storage/projects';

const qualityPresets = [
  { name: 'Nopea animaatio', samples: 64, bounces: 4 },
  { name: 'Tasapainoinen', samples: 256, bounces: 8 },
  { name: 'Tarkka', samples: 1024, bounces: 16 },
] as const;

export function AnimationExportPanel({
  state: s,
  name,
  capture,
  onBusy,
  onAspect,
  onPreview,
}: {
  state: AnimationWorkspaceState;
  name: string;
  capture: () => Promise<RenderSnapshot>;
  onBusy: (busy: boolean) => void;
  onAspect: (aspect: number) => void;
  onPreview: (canvas: HTMLCanvasElement, preview: RenderFramePreview & { time: number }) => void;
}) {
  const [resolution, setResolution] = useState(1),
    [fps, setFPS] = useState(30);
  const [samples, setSamples] = useState(64),
    [denoise, setDenoise] = useState(true);
  const [bounces, setBounces] = useState(4);
  const [start, setStart] = useState(0),
    [end, setEnd] = useState(s.clip?.duration ?? 1);
  const [format, setFormat] = useState<AnimationOutputFormat>('mp4');
  const [running, setRunning] = useState(false),
    [message, setMessage] = useState('');
  const [progress, setProgress] = useState<RenderJobProgress>();
  const [completed, setCompleted] = useState(0),
    [average, setAverage] = useState(0);
  const [total, setTotal] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [finalizing, setFinalizing] = useState(false);
  const started = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () => setElapsed((performance.now() - started.current) / 1000),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running]);
  const run = async (test: boolean) => {
    if (controller.current || !s.data || !s.clip) return;
    let snapshot: RenderSnapshot | undefined;
    let output: Awaited<ReturnType<typeof createAnimationOutput>> | undefined;
    const abort = new AbortController();
    controller.current = abort;
    started.current = performance.now();
    setRunning(true);
    setMessage('Valitaan tallennuspaikkaa');
    setCompleted(0);
    setAverage(0);
    setProgress(undefined);
    setElapsed(0);
    setFinalizing(false);
    setTotal(test ? 1 : Math.max(0, Math.ceil((end - start) * fps)));
    onBusy(true);
    s.pause();
    try {
      const settings = {
        ...animationResolutions[resolution],
        fps,
        start,
        end,
        samples,
        denoise,
        bounces,
      };
      const plan = animationRenderPlan(settings, s.clip.duration);
      setTotal(test ? 1 : plan.frames);
      if (s.dirty)
        throw new Error(
          'Tallenna objektien keskeneräiset asentomuutokset avainruuduksi ennen renderöintiä.',
        );
      // A private clip/data snapshot makes every frame independent of elapsed wall time.
      const data = structuredClone(s.data),
        clip = structuredClone(s.clip);
      if (!clip.camera?.keys.length) throw new Error('Lisää kamerareitille vähintään yksi scene.');
      if (!test) {
        // Keep the native file picker in the click's activation, before yielding.
        const destination = await chooseAnimationDestination(format, name);
        abort.signal.throwIfAborted();
        setMessage(
          format === 'mp4' ? 'Valmistellaan videotallennusta' : 'Valmistellaan kuvien tallennusta',
        );
        await yieldRenderUI(abort.signal);
        output = await createAnimationOutput(format, destination, settings, {
          data,
          clipId: clip.id,
        });
      }
      abort.signal.throwIfAborted();
      setMessage('Ladataan näkymän materiaaleja ja valaistusta');
      await yieldRenderUI(abort.signal);
      const owned = await prepareWithin<RenderSnapshot>(
        capture().then((value) => {
          // capture may finish after cancellation; its owned resources must not leak.
          if (abort.signal.aborted) {
            value.dispose();
            abort.signal.throwIfAborted();
          }
          return value;
        }),
        abort.signal,
      );
      owned.aspect = settings.width / settings.height;
      snapshot = owned;
      const testTime = s.currentTime();
      let previous = performance.now(),
        measured = 0;
      await renderFrames(
        owned,
        { ...settings, reuseStillFrames: true },
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
        (canvas, preview) =>
          onPreview(canvas, { ...preview, time: test ? testTime : plan.time(preview.frame) }),
      );
      abort.signal.throwIfAborted();
      setFinalizing(true);
      setMessage(
        format === 'mp4' && !test ? 'Viimeistellään MP4-videota' : 'Viimeistellään kuvatallennusta',
      );
      await yieldRenderUI(abort.signal);
      await output?.finish();
      output = undefined;
      abort.signal.throwIfAborted();
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
      abort.abort();
      snapshot?.dispose();
      controller.current = undefined;
      if (mounted.current) {
        setElapsed((performance.now() - started.current) / 1000);
        setRunning(false);
        onBusy(false);
      }
    }
  };
  const position = animationRenderPosition(completed, total, progress);
  const duration = (seconds: number) =>
    `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`;
  return (
    <>
      <details className="animation-export-panel">
        <summary>Renderöi animaatio · HD–4K</summary>
        <fieldset disabled={running} hidden={running} className="animation-export-settings">
          <label>
            Laatu
            <select
              aria-label="Animaation laatu"
              value={
                denoise
                  ? qualityPresets.findIndex((p) => p.samples === samples && p.bounces === bounces)
                  : -1
              }
              onChange={(e) => {
                const preset = qualityPresets[Number(e.target.value)];
                if (preset) {
                  setSamples(preset.samples);
                  setBounces(preset.bounces);
                  setDenoise(true);
                }
              }}
            >
              {qualityPresets.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name} · {p.samples} näytettä
                </option>
              ))}
              <option value={-1}>Omat asetukset</option>
            </select>
          </label>
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
          <label>
            Valon kimmokkeet
            <select
              aria-label="Animaation valon kimmokkeet"
              value={bounces}
              onChange={(e) => setBounces(Number(e.target.value))}
            >
              {[4, 8, 16].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="camera-checkbox">
            <input
              type="checkbox"
              checked={denoise}
              onChange={(e) => setDenoise(e.target.checked)}
            />{' '}
            Kohinanpoisto
          </label>
          <div className="camera-actions">
            <button onClick={() => void run(true)}>Testrenderöi nykyinen ruutu</button>
            <button className="button dark" onClick={() => void run(false)}>
              Renderöi animaatio
            </button>
          </div>
        </fieldset>
        {!running && (
          <p className="muted">
            Jokainen ruutu lasketaan täyteen näytemäärään alkuperäisessä resoluutiossa. Aikarajaa ei
            ole. Aloita testruudusta; myös objektien animaatiot renderöidään. Pidä välilehti
            näkyvissä. Nopea laatu vähentää valon kimmokkeita; tarkka laatu säilyttää paremmin
            epäsuoran valon ja lasin heijastukset.
          </p>
        )}
        {format === 'png' && !running && (
          <p className="muted">
            Valitse tallennuskansio. Ilman kansiotukea kuvat ladataan ZIP-osina (enintään noin 64
            Mt/osio).
          </p>
        )}
      </details>
      {(running || message) && (
        <section
          className="animation-export-progress"
          aria-label="Animaation renderöinnin tila"
          aria-busy={running}
        >
          <div className="animation-export-heading">
            <strong>
              {running
                ? finalizing
                  ? 'Viimeistellään tallennusta'
                  : `Renderöidään ruutua ${Math.min(total, (progress?.frame ?? 0) + 1)} / ${total}`
                : 'Renderöintityön tila'}
            </strong>
            <span>
              {completed} / {total} ruutua tallennettu · {duration(elapsed)}
            </span>
            {running && (
              <button onClick={() => controller.current?.abort()}>Keskeytä renderöinti</button>
            )}
          </div>
          <progress
            aria-label="Animaation kokonaisedistyminen"
            max={Math.max(1, total)}
            value={position}
          />
          {running && !finalizing && (
            <div className="animation-export-samples">
              <span>
                {progress?.samples ?? 0} / {progress?.target ?? samples} näytettä tässä ruudussa
              </span>
              <progress
                aria-label="Nykyisen ruudun näytteet"
                max={progress?.target ?? samples}
                value={progress?.samples ?? 0}
              />
            </div>
          )}
          <p role="status">
            {message || progress?.detail || 'Valmistellaan renderöintiä'}
            {running &&
              !finalizing &&
              ((progress?.diagnostics?.reusedFrames ?? 0) > 0
                ? ' · pysähdyksen valmis kuva käytetään uudelleen'
                : average > 0
                  ? ` · suuntaa-antava arvio jäljellä ${duration(Math.ceil(Math.max(0, total - position) * average))}`
                  : total > 1
                    ? ' · aika-arvio tarkentuu kahden valmistuneen ruudun jälkeen'
                    : ' · ensimmäinen ruutu sisältää myös alkuvalmistelun')}
          </p>
          {progress?.diagnostics && !running && (
            <button
              className="animation-render-diagnostics"
              onClick={() =>
                downloadFile(
                  JSON.stringify(progress.diagnostics, null, 2),
                  'nivo-animation-render-diagnostics.json',
                  'application/json',
                )
              }
            >
              Lataa suorituskykyraportti
            </button>
          )}
        </section>
      )}
    </>
  );
}
