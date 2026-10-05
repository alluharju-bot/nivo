import { useRef, useState } from 'react';
import { EmissionControls } from './EmissionControls';
import { CommitCheckbox } from './CommitCheckbox';
import {
  defaultAppearance,
  findPreset,
  surfaceDepth,
  surfaceStrength,
  materialPresets,
  type Appearance,
  type CustomMaterial,
  type TextureAsset,
} from '../model/materials';
import type { Body } from '../model/project';
import { importTexture, withColorTexture } from '../storage/textures';

type Asset = { id: string; asset: TextureAsset };
export type MaterialChange = (
  appearance: Appearance,
  color?: string,
  asset?: Asset,
) => Promise<unknown>;
const channels = [
  ['normal', 'Normal-kartta'],
  ['bump', 'Bump / korkeuskartta'],
  ['roughness', 'Karheuskartta'],
  ['metalness', 'Metallisuuskartta'],
] as const;
export function SurfaceMaps({
  appearance,
  assets,
  busy,
  onChange,
}: {
  appearance: Appearance;
  assets?: Record<string, TextureAsset>;
  busy: boolean;
  onChange: MaterialChange;
}) {
  const preset = findPreset(appearance.preset);
  const defaultStrength = surfaceStrength(appearance);
  const depth = appearance.bumpDepth ?? surfaceDepth(preset);
  const legacyBump = !!appearance.maps?.bump && appearance.bumpDepth === undefined;
  const input = useRef<HTMLInputElement>(null),
    channel = useRef<(typeof channels)[number][0]>('normal');
  const [error, setError] = useState(''),
    [uploading, setUploading] = useState(false);
  return (
    <details className="surface-maps">
      <summary>Pinnan rakenne · PBR</summary>
      <label className="checkbox-label">
        <CommitCheckbox
          label="Pinnan rakenne"
          checked={appearance.surfaceDetail !== false}
          disabled={busy}
          onChange={(surfaceDetail) => onChange({ ...appearance, surfaceDetail })}
        />
        Kohokuvio ja karheuskartta
      </label>
      {appearance.assetId && (
        <div className="surface-generate">
          <label className="checkbox-label">
            <CommitCheckbox
              label="Luo rakenne värikuvasta"
              checked={appearance.generatedSurface ?? false}
              disabled={busy}
              onChange={(generatedSurface) =>
                onChange({ ...appearance, generatedSurface, surfaceDetail: true })
              }
            />
            Luo rakenne värikuvasta
          </label>
          <p className="muted">
            Luo normal- ja karheuskartan kuvan vaaleuseroista. Arvio pintarakenteesta; omat
            PBR-kartat korvaavat sen.
          </p>
        </div>
      )}
      {legacyBump && (
        <button
          className="button outlined"
          disabled={busy}
          onClick={() => void onChange({ ...appearance, bumpDepth: depth, normalStrength: 1 })}
        >
          Aseta kohokuvion syvyys millimetreinä
        </button>
      )}
      {!legacyBump &&
        !appearance.maps?.normal &&
        (appearance.maps?.bump || appearance.generatedSurface || preset.pattern) && (
          <label>
            Kohokuvion syvyys (mm)
            <input
              aria-label="Kohokuvion syvyys"
              type="number"
              min="0"
              max="20"
              step="0.01"
              disabled={busy}
              key={depth}
              defaultValue={depth}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (e.target.value && Number.isFinite(n) && n >= 0 && n <= 20)
                  void onChange({ ...appearance, bumpDepth: n, normalStrength: 1 });
                else e.target.value = String(depth);
              }}
            />
          </label>
        )}
      {(appearance.maps?.normal ||
        legacyBump ||
        (appearance.normalStrength !== undefined && appearance.normalStrength !== 1)) && (
        <label>
          Kohokuvion voimakkuus
          <input
            type="number"
            aria-label="Kohokuvion voimakkuus"
            min="0"
            max="5"
            step="0.1"
            defaultValue={appearance.normalStrength ?? defaultStrength}
            key={appearance.normalStrength ?? 'default'}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (e.target.value && n >= 0 && n <= 5)
                void onChange({ ...appearance, normalStrength: n });
              else e.target.value = String(appearance.normalStrength ?? defaultStrength);
            }}
          />
        </label>
      )}
      <p className="muted">
        Valmiissa kuvioissa on normal- ja karheuskartat. Omat PBR-kuvat käyttävät samaa kokoa,
        kiertoa ja sijaintia kuin värikuva. Valkoinen korkeuskartta on koholla; valkoinen karheus on
        matta.
      </p>
      <input
        ref={input}
        data-testid="pbr-file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0],
            key = channel.current;
          e.target.value = '';
          if (!file) return;
          setError('');
          setUploading(true);
          try {
            const asset = await importTexture(file, true);
            await onChange(
              {
                ...appearance,
                surfaceDetail: true,
                ...(key === 'bump'
                  ? { bumpDepth: depth, normalStrength: 1 }
                  : key === 'normal'
                    ? { normalFormat: 'opengl' as const, normalStrength: 1 }
                    : {}),
                maps: {
                  ...appearance.maps,
                  [key]: asset.id,
                  ...(key === 'normal'
                    ? { bump: undefined }
                    : key === 'bump'
                      ? { normal: undefined }
                      : {}),
                },
              },
              undefined,
              asset,
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setUploading(false);
          }
        }}
      />
      {channels.map(([key, name]) => (
        <div className="surface-map-row" key={key}>
          <button
            className="button outlined"
            disabled={busy || uploading}
            onClick={() => {
              channel.current = key;
              input.current?.click();
            }}
          >
            {name}
          </button>
          {appearance.maps?.[key] && (
            <>
              {assets?.[appearance.maps[key]!] && (
                <img
                  className="surface-map-thumb"
                  src={assets[appearance.maps[key]!].dataUrl}
                  alt=""
                />
              )}
              <span title={assets?.[appearance.maps[key]!]?.name}>
                {assets?.[appearance.maps[key]!]?.name}
              </span>
              <button
                className="button subtle"
                aria-label={`Poista ${name}`}
                disabled={busy}
                onClick={() =>
                  void onChange({ ...appearance, maps: { ...appearance.maps, [key]: undefined } })
                }
              >
                ×
              </button>
            </>
          )}
        </div>
      ))}
      {appearance.maps?.normal && (
        <label>
          Normal-kartan suunta
          <select
            aria-label="Normal-kartan suunta"
            value={appearance.normalFormat ?? 'opengl'}
            disabled={busy}
            onChange={(e) =>
              void onChange({ ...appearance, normalFormat: e.target.value as 'opengl' | 'directx' })
            }
          >
            <option value="opengl">OpenGL · +Y</option>
            <option value="directx">DirectX · −Y</option>
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

export function ModelMaterials({
  bodies,
  assets,
  materials,
  busy,
  onChange,
}: {
  bodies: Body[];
  assets?: Record<string, TextureAsset>;
  materials?: CustomMaterial[];
  busy: boolean;
  onChange: MaterialChange;
}) {
  const source = bodies[0],
    appearance = source.appearance ?? defaultAppearance(source.material);
  const mixed = bodies.some(
    (b) => (b.appearance?.preset ?? b.material ?? 'matte') !== appearance.preset,
  );
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  return (
    <details className="inspector-disclosure model-materials">
      <summary>Materiaali</summary>
      <div className="disclosure-content">
        <label>
          Materiaali
          <select
            aria-label="Osan materiaali"
            value={mixed ? '' : appearance.preset}
            disabled={busy}
            onChange={(e) => {
              const saved = materials?.find((m) => `custom:${m.id}` === e.target.value),
                preset = materialPresets.find((p) => p.id === e.target.value);
              if (saved) void onChange(saved.appearance, saved.color);
              else if (preset) void onChange(defaultAppearance(preset.id), preset.color);
            }}
          >
            <option value="" disabled>
              {mixed ? 'Useita materiaaleja' : 'Valitse materiaali'}
            </option>
            {!materialPresets.some((p) => p.id === appearance.preset) && (
              <option value={appearance.preset}>Nykyinen materiaali</option>
            )}
            {[...new Set(materialPresets.map((p) => p.category))].map((category) => (
              <optgroup key={category} label={category}>
                {materialPresets
                  .filter((p) => p.category === category)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            {!!materials?.length && (
              <optgroup label="Omat materiaalit">
                {materials.map((m) => (
                  <option key={m.id} value={`custom:${m.id}`}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button
          className="button outlined full"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          Lisää materiaalin värikuva
        </button>
        <input
          ref={input}
          data-testid="model-texture-file"
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const asset = await importTexture(file);
              await onChange(withColorTexture(appearance, asset.id, asset.asset), '#ffffff', asset);
              setError('');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        />
        {appearance.assetId && <span className="muted">{assets?.[appearance.assetId]?.name}</span>}
        <EmissionControls
          appearance={appearance}
          color={source.color}
          busy={busy}
          onChange={onChange}
        />
        <SurfaceMaps appearance={appearance} assets={assets} busy={busy} onChange={onChange} />
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
