import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, Play, Square, X } from 'lucide-react';
import type { Project } from '../model/project';
import { bodyVisible } from '../model/transforms';
import type { Matrix4 } from 'three';
import { evaluateCamera } from '../model/cameraAnimation';
import { evaluateAnimation } from '../model/animation';
import { createRenderScene, renderDefaults } from '../render/scene';
import { traceStatusLabel, type TraceStatus } from '../render/progressive';
import { watchGraphicsContext, contextLostMessage } from '../viewport/graphicsContext';
import type { AnimationWorkspaceState } from './AnimationWorkspace';
import { AnimationExportPanel } from './AnimationExportPanel';
import { downloadFile, safeFilename } from '../storage/projects';
import type { RenderFramePreview } from '../render/traceJob';

export function AnimationRenderPreview({
  state: s,
  project,
}: {
  state: AnimationWorkspaceState;
  project: Project;
}) {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLElement>(null);
  const api = useRef<ReturnType<typeof createRenderScene> | undefined>(undefined);
  const latest = useRef({ s, project });
  latest.current = { s, project };
  const [trace, setTrace] = useState<TraceStatus>({ state: 'off', samples: 0 });
  const [quality, setQuality] = useState(false),
    [error, setError] = useState('');
  const [samples, setSamples] = useState(64),
    [exporting, setExporting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const renderingRef = useRef(false);
  const liveHost = useRef<HTMLDivElement>(null),
    finishedCanvas = useRef<HTMLCanvasElement>(null);
  const [renderImage, setRenderImage] = useState<RenderFramePreview & { time: number }>();
  const [finishedFrame, setFinishedFrame] = useState<number>();
  const [finishedTime, setFinishedTime] = useState(0);
  const finishedFrameRef = useRef<number | undefined>(undefined);
  const [showRender, setShowRender] = useState(false);
  const presentFrame = (
    canvas: HTMLCanvasElement,
    preview: RenderFramePreview & { time: number },
  ) => {
    if (!liveHost.current || !finishedCanvas.current) return;
    if (canvas.parentElement !== liveHost.current) liveHost.current.replaceChildren(canvas);
    canvas.dataset.renderFrame = String(preview.frame);
    canvas.dataset.renderSamples = String(preview.samples);
    canvas.setAttribute('aria-label', 'Animaation renderöintikuva');
    if (preview.complete) {
      // Keep one bounded completed image after the export context is released.
      // Only copy at frame completion, never read back pixels while sampling.
      const saved = finishedCanvas.current;
      const scale = Math.min(1, 1280 / canvas.width);
      saved.width = Math.round(canvas.width * scale);
      saved.height = Math.round(canvas.height * scale);
      saved.getContext('2d')?.drawImage(canvas, 0, 0, saved.width, saved.height);
      saved.dataset.renderFrame = String(preview.frame);
      finishedFrameRef.current = preview.frame + 1;
      setFinishedFrame(preview.frame + 1);
      setFinishedTime(preview.time);
    }
    setRenderImage(preview);
    setShowRender(true);
  };
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    const fit = () => {
      if (!stage.current || !host.current) return;
      const width = Math.max(
        1,
        Math.min(stage.current.clientWidth, stage.current.clientHeight * aspect),
      );
      host.current.style.width = `${width}px`;
      host.current.style.height = `${width / aspect}px`;
    };
    const observer = new ResizeObserver(fit);
    if (stage.current) observer.observe(stage.current);
    fit();
    return () => observer.disconnect();
  }, [aspect]);
  const slider = useRef<HTMLInputElement>(null),
    output = useRef<HTMLOutputElement>(null),
    sceneName = useRef<HTMLSpanElement>(null);
  const close = () => {
    s.pause();
    s.setRenderPreview(false);
  };
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    let unwatch: (() => void) | undefined;
    const update = (time: number, matrices: Map<string, Matrix4>) => {
      const { s } = latest.current;
      if (!renderingRef.current) setShowRender(false);
      api.current?.animationFrame(evaluateCamera(s.clip?.camera, time), matrices, s.playing);
      if (slider.current) slider.current.value = String(time);
      if (output.current)
        output.current.value = `${time.toFixed(2)} / ${s.clip?.duration.toFixed(2)} s`;
      if (sceneName.current) {
        const key = s.clip?.camera?.keys.filter((k) => k.time <= time).at(-1);
        sceneName.current.textContent = key
          ? `${key.name}${time <= key.time + key.hold ? ' · pysähdys' : ' →'}`
          : 'Kamerakierros';
      }
      if (host.current?.firstElementChild instanceof HTMLCanvasElement)
        host.current.firstElementChild.dataset.animationTime = String(time);
    };
    try {
      api.current = createRenderScene(host.current!, () => ({
        bodies: latest.current.project.bodies.filter((b) =>
          bodyVisible(b, latest.current.project.groups),
        ),
        meshes: latest.current.s.meshes,
        settings: latest.current.project.settings.render ?? renderDefaults,
        assets: latest.current.project.assets,
        onPick: () => {},
        onTexture: () => {},
        onTraceStatus: setTrace,
      }));
      api.current.sync();
      api.current.trace.configure({ maxSamples: 64 });
      s.renderFrame.current = update;
      update(s.currentTime(), evaluateAnimation(s.data!, s.clip, s.currentTime()).bodyMatrices);
      unwatch = watchGraphicsContext(
        host.current!.querySelector('canvas')!,
        () => {
          api.current?.trace.stop();
          latest.current.s.pause();
          setError(contextLostMessage);
        },
        () => setError('Grafiikkayhteys palautui. Sulje esikatselu ja avaa se uudelleen.'),
      );
    } catch (e) {
      api.current?.dispose();
      api.current = undefined;
      setError((e as Error).message);
    }
    dialog.current?.focus();
    const visibility = () => {
      if (document.hidden) latest.current.s.pause();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      if (s.renderFrame.current === update) s.renderFrame.current = undefined;
      document.removeEventListener('visibilitychange', visibility);
      unwatch?.();
      api.current?.dispose();
      api.current = undefined;
      previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    api.current?.trace.configure({ maxSamples: samples });
    if (quality) void api.current?.trace.start();
    else api.current?.trace.stop();
  }, [quality, samples]);
  const savePNG = async () => {
    if (!api.current || s.playing) return;
    setExporting(true);
    try {
      const blob = quality
        ? await api.current.trace.exportPNG()
        : await api.current.exportPNG(1920);
      downloadFile(
        blob,
        `${safeFilename(project.name)}-${s.currentTime().toFixed(2)}s.png`,
        'image/png',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return createPortal(
    <>
      <div className="camera-render-backdrop" aria-hidden="true" />
      <section
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Kamerakierroksen esikatselu"
        className="camera-render-preview"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
          if (
            !rendering &&
            e.key === ' ' &&
            !(e.target as HTMLElement).closest('input,select,button')
          ) {
            e.preventDefault();
            s.playing ? s.pause() : s.play();
          }
          if (e.key === 'Tab') {
            const focusable = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input,select',
              ),
            ];
            const first = focusable[0],
              last = focusable.at(-1);
            if (
              e.shiftKey &&
              (document.activeElement === first || document.activeElement === dialog.current)
            ) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{s.clip?.name} · kamerakierros</h2>
          <span ref={sceneName} hidden={showRender} />
          <label>
            <input
              type="checkbox"
              aria-label="Tarkenna pysähdyksissä"
              disabled={rendering}
              checked={quality}
              onChange={(e) => {
                setShowRender(false);
                setQuality(e.target.checked);
              }}
            />{' '}
            Tarkenna pysähdyksissä
          </label>
          {quality && (
            <select
              aria-label="Tarkennuksen näytteet"
              value={samples}
              disabled={exporting}
              onChange={(e) => setSamples(Number(e.target.value))}
            >
              {[64, 256, 1024].map((n) => (
                <option key={n} value={n}>
                  {n} näytettä
                </option>
              ))}
            </select>
          )}
          <button
            disabled={
              rendering || showRender || exporting || s.playing || (quality && trace.samples < 1)
            }
            onClick={() => void savePNG()}
            title="Tallentaa pysäytetyn kuvakulman nykyisellä tarkennuksella"
          >
            {exporting ? 'Tallennetaan…' : 'Tallenna PNG'}
          </button>
          <button aria-label="Sulje kamerakierroksen esikatselu" onClick={close}>
            <X size={18} />
          </button>
        </header>
        <div ref={stage} className="camera-render-stage">
          <div ref={host} className="camera-render-host" />
          <div
            ref={liveHost}
            className="animation-live-render"
            hidden={!showRender || !rendering}
          />
          <figure
            className={`animation-finished-frame${rendering ? ' is-thumbnail' : ''}`}
            hidden={!showRender || finishedFrame === undefined}
          >
            <canvas ref={finishedCanvas} aria-label="Viimeksi valmistunut animaatioruutu" />
            <figcaption>Ruutu {finishedFrame} valmis</figcaption>
          </figure>
          {showRender && (
            <div className="animation-render-image-label">
              {rendering
                ? `Renderöintikuva · ruutu ${(renderImage?.frame ?? 0) + 1} · ${renderImage?.time?.toFixed(2)} s · ${renderImage?.samples ?? 0} näytettä`
                : `Viimeksi valmistunut ruutu · ${finishedFrame} · ${finishedTime.toFixed(2)} s`}
              {!rendering && (
                <button onClick={() => setShowRender(false)}>
                  Palaa kamerareitin esikatseluun
                </button>
              )}
            </div>
          )}
        </div>
        <fieldset className="camera-render-controls" disabled={rendering}>
          <button
            disabled={!!error || exporting}
            aria-label={s.playing ? 'Tauota kierros' : 'Toista kierros'}
            onClick={() => (s.playing ? s.pause() : s.play())}
          >
            {s.playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button aria-label="Kierroksen alkuun" onClick={s.stop}>
            <Square size={16} />
          </button>
          <input
            ref={slider}
            type="range"
            aria-label="Kierroksen aika"
            min={0}
            max={s.clip?.duration}
            step={0.01}
            defaultValue={s.time}
            onChange={(e) => s.seek(Number(e.target.value))}
          />
          <output ref={output}>{s.time.toFixed(2)} s</output>
          <select
            aria-label="Siirry sceneen"
            value=""
            onChange={(e) => s.seek(Number(e.target.value))}
          >
            <option value="">Siirry sceneen…</option>
            {s.clip?.camera?.keys.map((k) => (
              <option key={k.id} value={k.time}>
                {k.name}
              </option>
            ))}
          </select>
        </fieldset>
        <AnimationExportPanel
          state={s}
          name={project.name}
          onAspect={setAspect}
          onPreview={presentFrame}
          capture={async () => {
            if (!api.current) throw new Error('Renderöintinäkymä ei ole valmis.');
            return api.current.capture();
          }}
          onBusy={(busy) => {
            renderingRef.current = busy;
            setRendering(busy);
            if (busy) {
              liveHost.current?.replaceChildren();
              finishedFrameRef.current = undefined;
              setFinishedFrame(undefined);
              setRenderImage(undefined);
              setShowRender(false);
              s.pause();
              setQuality(false);
              api.current?.trace.stop();
            } else {
              liveHost.current?.replaceChildren();
              setShowRender(finishedFrameRef.current !== undefined);
            }
          }}
        />
        <div
          className="camera-render-status"
          hidden={rendering || showRender}
          role={error ? 'alert' : 'status'}
        >
          {error ||
            (quality
              ? traceStatusLabel(trace)
              : 'Nopea materiaaliesikatselu. Kytke tarkennus, jos haluat säteenseurannan pysähdyksiin.')}
        </div>
      </section>
    </>,
    document.body,
  );
}
