import { useEffect, useRef, useState } from 'react';
import type { DecalPath, DecalSource } from '../model/decals';
import { defaultDecal } from '../model/decals';
import type { TextureAsset } from '../model/materials';
import { drawDecal, drawDecalPaths } from '../render/decals';
import { importDecalImage } from '../storage/decalImages';

export function DecalEditor({
  value,
  assets,
  disabled = false,
  onChange,
  onAsset,
}: {
  value: DecalSource;
  assets: Record<string, TextureAsset>;
  disabled?: boolean;
  onChange: (source: DecalSource) => void;
  onAsset: (id: string, asset: TextureAsset) => void;
}) {
  const fileId = useRef(`decal-file-${crypto.randomUUID()}`);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<DecalPath['kind']>('pen');
  const [fill, setFill] = useState(false),
    [erase, setErase] = useState(false);
  const [width, setWidth] = useState(0.02),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const draft = useRef<DecalPath | undefined>(undefined);
  const refresh = useRef(() => {});
  useEffect(() => {
    let active = true;
    const draw = async () => {
      const target = document.createElement('canvas');
      target.width = 640;
      target.height = 320;
      try {
        await drawDecal(target, value, assets);
        if (active && canvas.current) {
          const ctx = canvas.current.getContext('2d')!;
          ctx.clearRect(0, 0, 640, 320);
          ctx.drawImage(target, 0, 0);
          if (draft.current) {
            drawDecalPaths(ctx, [draft.current], 640, 320);
            if (draft.current.kind === 'bezier') {
              ctx.fillStyle = '#ffb05a';
              for (const p of draft.current.points) {
                ctx.beginPath();
                ctx.arc(p[0] * 640, p[1] * 320, 5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    refresh.current = () => {
      void draw();
    };
    void draw();
    return () => {
      active = false;
    };
  }, [value, assets]);
  const append = () => {
    if (draft.current && value.type === 'drawing' && value.paths.length < 128)
      onChange({ ...value, paths: [...value.paths, draft.current] });
    draft.current = undefined;
    refresh.current();
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)),
    ];
  };
  return (
    <div className="decal-editor" aria-label="Tarran sisältö">
      <div className="material-tool-tabs">
        {(['text', 'image', 'drawing'] as const).map((type, i) => (
          <button
            key={type}
            disabled={disabled}
            aria-pressed={value.type === type}
            onClick={() => {
              draft.current = undefined;
              if (type === value.type) return;
              if (type === 'text') onChange(defaultDecal());
              else if (type === 'drawing') onChange({ type, paths: [] });
              else document.getElementById(fileId.current)?.click();
            }}
          >
            {['Teksti', 'Kuva', 'Piirrä'][i]}
          </button>
        ))}
      </div>
      {value.type === 'text' && (
        <>
          <label>
            Teksti
            <textarea
              aria-label="Tarran teksti"
              key={value.text}
              defaultValue={value.text}
              maxLength={1000}
              disabled={disabled}
              onBlur={(e) => {
                if (value.text !== e.target.value) onChange({ ...value, text: e.target.value });
              }}
            />
          </label>
          <div className="layer-two-columns">
            <label>
              Kirjasin
              <select
                aria-label="Tarran kirjasin"
                value={value.font}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, font: e.target.value as 'sans' })}
              >
                <option value="stencil">Saira Stencil</option>
                <option value="sans">Barlow</option>
                <option value="mono">IBM Plex Mono</option>
              </select>
            </label>
            <label>
              Tasaus
              <select
                aria-label="Tekstin tasaus"
                value={value.align}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, align: e.target.value as 'left' })}
              >
                <option value="left">Vasen</option>
                <option value="center">Keskellä</option>
                <option value="right">Oikea</option>
              </select>
            </label>
          </div>
          <label>
            Kirjainväli (%)
            <input
              type="number"
              aria-label="Kirjainväli (%)"
              key={value.spacing}
              defaultValue={Math.round(value.spacing * 100)}
              min={-5}
              max={50}
              disabled={disabled}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= -5 && n <= 50 && n / 100 !== value.spacing)
                  onChange({ ...value, spacing: n / 100 });
              }}
            />
          </label>
        </>
      )}
      <input
        id={fileId.current}
        className="decal-file-input"
        type="file"
        aria-label="Tarran kuvatiedosto"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
        disabled={disabled || loading}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setLoading(true);
          setError('');
          try {
            const { id, asset } = await importDecalImage(file);
            onAsset(id, asset);
            onChange({ type: 'image', assetId: id });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      />
      {value.type === 'image' && (
        <button
          className="button outlined"
          disabled={disabled || loading}
          onClick={() => document.getElementById(fileId.current)?.click()}
        >
          Vaihda kuva · PNG / SVG / JPG / WebP
        </button>
      )}
      {value.type === 'drawing' && (
        <>
          <div className="layer-two-columns">
            <label>
              Piirtotyökalu
              <select
                value={tool}
                aria-label="Kuvion piirtotyökalu"
                disabled={disabled}
                onChange={(e) => {
                  draft.current = undefined;
                  setTool(e.target.value as DecalPath['kind']);
                  refresh.current();
                }}
              >
                <option value="pen">Kynä</option>
                <option value="line">Viiva</option>
                <option value="rectangle">Suorakulmio</option>
                <option value="ellipse">Ympyrä / soikio</option>
                <option value="bezier">Bézier</option>
              </select>
            </label>
            <label>
              Viivan leveys (%)
              <input
                type="number"
                min={0.2}
                max={25}
                step={0.2}
                value={width * 100}
                disabled={disabled}
                onChange={(e) =>
                  setWidth(Math.max(0.002, Math.min(0.25, Number(e.target.value) / 100)))
                }
              />
            </label>
          </div>
          <div className="decal-options">
            <label>
              <input
                type="checkbox"
                checked={fill}
                disabled={disabled}
                onChange={(e) => setFill(e.target.checked)}
              />
              Täyttö
            </label>
            <label>
              <input
                type="checkbox"
                checked={erase}
                disabled={disabled}
                onChange={(e) => setErase(e.target.checked)}
              />
              Kumita
            </label>
          </div>
          {tool === 'bezier' && <small>Napsauta alku, kaksi ohjauspistettä ja loppu.</small>}
        </>
      )}
      <canvas
        ref={canvas}
        width={640}
        height={320}
        className={`decal-canvas ${value.type === 'drawing' ? 'drawing' : ''}`}
        aria-label="Tarran esikatselu ja piirto"
        onPointerDown={(e) => {
          if (disabled || value.type !== 'drawing' || value.paths.length >= 128 || e.button !== 0)
            return;
          e.preventDefault();
          e.stopPropagation();
          const p = point(e);
          if (tool === 'bezier') {
            if (!draft.current || draft.current.kind !== 'bezier')
              draft.current = { kind: tool, points: [], width, fill, erase };
            draft.current.points.push(p);
            if (draft.current.points.length === 4) append();
            else refresh.current();
          } else {
            e.currentTarget.setPointerCapture(e.pointerId);
            draft.current = { kind: tool, points: [p], width, fill, erase };
            refresh.current();
          }
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId) || !draft.current) return;
          const p = point(e);
          if (tool === 'pen') {
            if (draft.current.points.length < 1024) draft.current.points.push(p);
          } else draft.current.points[1] = p;
          refresh.current();
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
            append();
          }
        }}
        onPointerCancel={() => {
          draft.current = undefined;
          refresh.current();
        }}
      />
      {value.type === 'drawing' && (
        <button
          className="button subtle"
          disabled={disabled || (!value.paths.length && !draft.current)}
          onClick={() => {
            if (draft.current) {
              draft.current = undefined;
              refresh.current();
            } else onChange({ ...value, paths: value.paths.slice(0, -1) });
          }}
        >
          Peru viimeinen piirto
        </button>
      )}
      {loading && <small>Ladataan kuvaa…</small>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
  // Unique native file input for each independently editable layer.
}
