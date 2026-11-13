import { Camera, Plus, Play, Trash2, Crosshair, Copy } from 'lucide-react';
import { bounds, uid, type Project } from '../model/project';
import {
  evaluateCamera,
  putCameraKey,
  type CameraKey,
  type CameraPose,
} from '../model/cameraAnimation';
import { CommitInput, type AnimationWorkspaceState } from './AnimationWorkspace';
import './cameraAnimation.css';

type Props = { state: AnimationWorkspaceState; busy: boolean; project: Project };
export function CameraAnimationPanel({ state: s, project, busy }: Props) {
  const clip = s.clip,
    keys = clip?.camera?.keys ?? [];
  const selected = keys.find((k) => k.id === s.cameraKeyId);
  const disabled = busy || s.playing;
  const select = (key: CameraKey) => {
    s.setCameraKeyId(key.id);
    s.setCameraEnabled(true);
    s.seek(key.time);
    s.cameraBridge.current?.show(key);
  };
  const save = async (key: CameraKey) => {
    if (!clip || disabled) return;
    try {
      const changed = putCameraKey(clip.camera, key, clip.duration);
      if (await s.saveClip({ ...clip, ...changed }, 'Kamerareitti päivitetty.')) {
        s.setCameraKeyId(key.id);
        s.seekAfterCameraEdit(key.time);
        s.setError('');
      }
    } catch (e) {
      s.setError((e as Error).message);
    }
  };
  const append = async (view?: CameraPose) => {
    const pose = view ?? s.cameraBridge.current?.capture();
    if (!pose || !clip) return;
    const last = keys.at(-1);
    const time = last ? Math.max(s.currentTime(), last.time + last.hold + 3) : s.currentTime();
    await save({
      ...pose,
      id: uid(),
      name: `Scene ${keys.length + 1}`,
      time,
      hold: 1.5,
      interpolation: 'smooth',
    });
  };
  const patch = (value: Partial<CameraKey>) => selected && void save({ ...selected, ...value });
  const targetBody = (id: string) => {
    const body = s.posed.bodies.find((b) => b.id === id);
    if (!body) return;
    const b = bounds([body]);
    return b.min.map((v, i) => (v + b.max[i]) / 2) as [number, number, number];
  };
  return (
    <div className="camera-editor" data-testid="camera-animation-panel">
      <p className="muted">
        Rajaa näkymä hiirellä ja tallenna kuvakulma. Pisteiden välissä kamera kulkee reittiä;
        pysähdyksessä se voi zoomata yksityiskohtaan.
      </p>
      {!clip ? (
        <button className="button dark" disabled={busy} onClick={() => void s.createClip()}>
          <Plus size={16} /> Luo animaatioklippi
        </button>
      ) : (
        <>
          <div className="camera-actions">
            <button className="button dark" disabled={disabled} onClick={() => void append()}>
              <Camera size={16} /> Lisää nykyinen kuvakulma
            </button>
            <button
              disabled={!keys.length || disabled}
              onClick={() => {
                s.pause();
                s.setCameraEnabled(true);
                s.setRenderPreview(true);
              }}
            >
              <Play size={16} /> Renderöity esikatselu
            </button>
          </div>
          <div className="camera-toggles">
            <label>
              <input
                type="checkbox"
                checked={s.cameraEnabled}
                onChange={(e) => s.setCameraEnabled(e.target.checked)}
              />{' '}
              Seuraa kameraa
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.showRoute}
                onChange={(e) => s.setShowRoute(e.target.checked)}
              />{' '}
              Näytä reitti
            </label>
          </div>
          {!!project.renderViews?.length && (
            <label>
              Lisää tallennettu renderöintinäkymä
              <select
                aria-label="Lisää renderöintinäkymä reitille"
                value=""
                disabled={disabled}
                onChange={(e) => {
                  const view = project.renderViews!.find((v) => v.id === e.target.value);
                  if (view) void append(view);
                }}
              >
                <option value="">Valitse kuvakulma…</option>
                {project.renderViews.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ol className="camera-stops" aria-label="Kamerareitin scenet">
            {keys.map((key, i) => (
              <li key={key.id}>
                <button
                  aria-pressed={selected?.id === key.id}
                  disabled={s.playing}
                  onClick={() => select(key)}
                >
                  <span className="camera-stop-index">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <strong>{key.name}</strong>
                    <small>
                      {key.time.toFixed(1)} s ·{' '}
                      {key.hold ? `pysähdys ${key.hold.toFixed(1)} s` : 'reittipiste'}
                      {key.zoom ? ' · zoom' : ''}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {!keys.length && (
            <p className="muted">
              Lisää ensimmäinen kuvakulma. Siirry sitten seuraavaan paikkaan ja lisää toinen.
            </p>
          )}
          {selected && (
            <fieldset key={selected.id} className="camera-key-editor" disabled={disabled}>
              <legend>Scene / reittipiste</legend>
              <label>
                Nimi
                <CommitInput
                  label="Scenen nimi"
                  value={selected.name}
                  onCommit={(name) => patch({ name })}
                />
              </label>
              <div className="camera-field-pair">
                <label>
                  Saapuminen · s
                  <CommitInput
                    label="Kamerapisteen aika"
                    type="number"
                    min={0}
                    max={3600}
                    step="0.1"
                    value={selected.time}
                    onCommit={(v) => patch({ time: Number(v) })}
                  />
                </label>
                <label>
                  Pysähdys · s
                  <CommitInput
                    label="Kameran pysähdysaika"
                    type="number"
                    min={0}
                    max={3600}
                    step="0.1"
                    value={selected.hold}
                    onCommit={(v) => patch({ hold: Number(v) })}
                  />
                </label>
              </div>
              <label>
                Objektiivi · mm
                <CommitInput
                  label="Kamerapisteen polttoväli"
                  type="number"
                  min={12}
                  max={200}
                  value={selected.focalLength}
                  onCommit={(v) => patch({ focalLength: Number(v) })}
                />
              </label>
              <label>
                Seuraava siirtymä
                <select
                  aria-label="Kameran interpolointi"
                  value={selected.interpolation}
                  onChange={(e) =>
                    patch({ interpolation: e.target.value as CameraKey['interpolation'] })
                  }
                >
                  <option value="smooth">Pehmeä kaarre ja kiihtyvyys</option>
                  <option value="linear">Suora, tasainen siirtymä</option>
                </select>
              </label>
              <button
                onClick={() => {
                  const view = s.cameraBridge.current?.capture();
                  if (view) patch(view);
                }}
              >
                <Camera size={15} /> Korvaa nykyisellä näkymällä
              </button>
              <label>
                Kohdista osaan
                <select
                  aria-label="Kameran kohde"
                  value=""
                  onChange={(e) => {
                    const target = targetBody(e.target.value);
                    if (target) patch({ target });
                  }}
                >
                  <option value="">Valitse mallin osa…</option>
                  {project.bodies
                    .filter((b) => !b.hidden)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
              </label>
              <details className="camera-coordinates">
                <summary>Kameran ja katseen koordinaatit · mm</summary>
                {(['position', 'target'] as const).map((field) => (
                  <div key={field}>
                    <small>{field === 'position' ? 'Kamera' : 'Katse'}</small>
                    <div className="camera-field-triple">
                      {['X', 'Y', 'Z'].map((axis, i) => (
                        <label key={axis}>
                          {axis}
                          <CommitInput
                            label={`Kamera ${field} ${axis}`}
                            type="number"
                            value={Number(selected[field][i].toFixed(2))}
                            onCommit={(v) => {
                              const point = [...selected[field]] as [number, number, number];
                              point[i] = Number(v);
                              patch({ [field]: point });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </details>
              <div className="camera-zoom">
                <label className="camera-checkbox">
                  <input
                    type="checkbox"
                    aria-label="Yksityiskohtazoom"
                    checked={!!selected.zoom}
                    onChange={(e) =>
                      patch({
                        hold: e.target.checked ? Math.max(1.5, selected.hold) : selected.hold,
                        zoom: e.target.checked
                          ? {
                              target: selected.target,
                              focalLength: Math.min(200, selected.focalLength * 1.7),
                            }
                          : undefined,
                      })
                    }
                  />
                  <Crosshair size={15} /> Yksityiskohtazoom
                </label>
                {selected.zoom && (
                  <>
                    <label>
                      Zoomin loppupolttoväli · mm
                      <CommitInput
                        label="Zoomin polttoväli"
                        type="number"
                        min={12}
                        max={200}
                        value={selected.zoom.focalLength}
                        onCommit={(v) =>
                          patch({ zoom: { ...selected.zoom!, focalLength: Number(v) } })
                        }
                      />
                    </label>
                    <label>
                      Yksityiskohta
                      <select
                        aria-label="Zoomin yksityiskohta"
                        value=""
                        onChange={(e) => {
                          const target = targetBody(e.target.value);
                          if (target) patch({ zoom: { ...selected.zoom!, target } });
                        }}
                      >
                        <option value="">Valitse kohde…</option>
                        {project.bodies
                          .filter((b) => !b.hidden)
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <small>
                      Zoom tapahtuu pysähdyksen aikana. Kohde tallennetaan kiinteänä pisteenä.
                    </small>
                  </>
                )}
              </div>
              <div className="camera-field-pair">
                <button onClick={() => void append(selected)}>
                  <Copy size={14} /> Kopioi loppuun
                </button>
                <button
                  onClick={() =>
                    void s.saveClip(
                      { ...clip, camera: { keys: keys.filter((k) => k.id !== selected.id) } },
                      'Kamerapiste poistettu.',
                    )
                  }
                >
                  <Trash2 size={14} /> Poista piste
                </button>
              </div>
            </fieldset>
          )}
          <p className="muted">
            Objektit-välilehdellä animoit osat samalla aikajanalla. Reitti ei väistä seiniä
            automaattisesti.
          </p>
        </>
      )}
      {s.error && <p role="alert">{s.error}</p>}
    </div>
  );
}

export function CameraTimelineTrack({
  state: s,
  busy,
}: {
  state: AnimationWorkspaceState;
  busy: boolean;
}) {
  if (!s.clip?.camera) return null;
  const duration = s.clip.duration;
  return (
    <div className="animation-track camera-track">
      <button className="animation-track-name" onClick={() => s.setTab('camera')}>
        <Camera size={14} /> Kamera & scenet
      </button>
      <div className="animation-track-lane">
        {s.clip.camera.keys.map((key) => (
          <button
            key={key.id}
            className="camera-time-stop"
            aria-label={`Scene ${key.name} · ${key.time.toFixed(2)} s`}
            title={`${key.name} · ${key.time.toFixed(2)} s · pysähdys ${key.hold} s`}
            aria-pressed={key.id === s.cameraKeyId}
            disabled={busy || s.playing}
            style={{
              left: `${(key.time / duration) * 100}%`,
              width: `max(12px, ${(key.hold / duration) * 100}%)`,
            }}
            onClick={() => {
              s.setTab('camera');
              s.setCameraKeyId(key.id);
              s.setCameraEnabled(true);
              s.seek(key.time);
              const view = evaluateCamera(s.clip?.camera, key.time);
              if (view) s.cameraBridge.current?.show(view);
            }}
          >
            <span>◆</span>
            <small>{key.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
