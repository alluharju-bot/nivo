import { useEffect, useRef, useState } from 'react';
import type { Body, Project } from '../model/project';
import type { BodyMesh } from '../cad/protocol';
import { prepareGlbLods, packGlbLods, type PreparedLods } from '../exchange/export';
import { downloadFile, safeFilename } from '../storage/projects';
import { triangleCount } from '../model/meshStats';
import { LodPreview } from './LodPreview';

export function LodPanel({
  bodies,
  meshes,
  project,
  instances,
  includeMotions,
  onWorking,
  onDownloaded,
}: {
  bodies: Body[];
  meshes: BodyMesh[];
  project: Project;
  instances: boolean;
  includeMotions: boolean;
  onWorking: (working: boolean) => void;
  onDownloaded: () => void;
}) {
  const [ratios, setRatios] = useState<[number, number]>([50, 20]);
  const [quality, setQuality] = useState<'precise' | 'balanced' | 'light'>('balanced');
  const errors: Record<typeof quality, [number, number]> = {
    precise: [0.001, 0.005],
    balanced: [0.01, 0.03],
    light: [0.03, 0.08],
  };
  const [prepared, setPrepared] = useState<PreparedLods>();
  const [level, setLevel] = useState(0),
    [wireframe, setWireframe] = useState(false);
  const [progress, setProgress] = useState(''),
    [error, setError] = useState('');
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
    setPrepared(undefined);
    setLevel(0);
    setError('');
  }, [bodies, meshes, project.assets, project.motions, instances, includeMotions, ratios, quality]);
  const valid =
    ratios.every(Number.isFinite) && ratios[0] > ratios[1] && ratios[1] >= 1 && ratios[0] < 100;
  const run = async (download = false) => {
    if (!valid || progress) return;
    const job = new AbortController();
    controller.current = job;
    setError('');
    setProgress('Valmistellaan versioita…');
    onWorking(true);
    try {
      const result =
        prepared ??
        (await prepareGlbLods(
          bodies,
          meshes,
          project.assets,
          instances,
          (message) => {
            if (!job.signal.aborted) setProgress(message);
          },
          includeMotions ? project.motions : undefined,
          [ratios[0] / 100, ratios[1] / 100],
          job.signal,
          errors[quality],
        ));
      job.signal.throwIfAborted();
      if (!mounted.current) return;
      setPrepared(result);
      if (download) {
        setProgress('Pakataan tiedostot…');
        const zip = await packGlbLods(result);
        job.signal.throwIfAborted();
        downloadFile(zip, `${safeFilename(project.name)}-LOD.zip`, 'application/zip');
        onDownloaded();
      }
    } catch (e) {
      if (mounted.current && !job.signal.aborted) setError((e as Error).message);
    } finally {
      if (mounted.current && controller.current === job) {
        setProgress('');
        onWorking(false);
        controller.current = undefined;
      }
    }
  };
  const cancel = () => {
    controller.current?.abort();
    controller.current = undefined;
    setProgress('');
    onWorking(false);
  };
  return (
    <section className="lod-panel" aria-label="LOD-versiot">
      <div className="lod-targets">
        {ratios.map((value, i) => (
          <label key={i}>
            LOD{i + 1} · tavoite (%)
            <input
              aria-label={`LOD${i + 1} tavoiteprosentti`}
              type="number"
              min="1"
              max="99"
              step="1"
              value={Number.isNaN(value) ? '' : value}
              disabled={!!progress}
              onChange={(e) =>
                setRatios(
                  (old) =>
                    old.map((n, index) => (index === i ? e.target.valueAsNumber : n)) as [
                      number,
                      number,
                    ],
                )
              }
            />
          </label>
        ))}
      </div>
      <label className="lod-quality">
        Muodon säilytys
        <select
          aria-label="LOD-muodon säilytys"
          value={quality}
          disabled={!!progress}
          onChange={(e) => setQuality(e.target.value as typeof quality)}
        >
          <option value="precise">Tarkka · pieni muutos</option>
          <option value="balanced">Tasapainoinen</option>
          <option value="light">Kevyt · sallii suuremman muutoksen</option>
        </select>
      </label>
      <p className="muted">
        LOD0 säilyttää alkuperäisen tarkkuuden. LOD1 ja LOD2 vähentävät kolmioita sekä
        tekstuurikokoa. Muodon säilytys, aukot ja materiaalirajat rajoittavat kevennystä.
      </p>
      {!valid && <p role="alert">LOD2:n tulee olla pienempi kuin LOD1:n. Käytä arvoja 1–99 %.</p>}
      <button
        className="button outlined full"
        disabled={!!prepared || !!progress || !valid || !bodies.length}
        onClick={() => void run()}
      >
        {prepared ? 'LOD-versiot valmiit' : 'Laske ja vertaile LOD-versiot'}
      </button>
      {progress && (
        <div className="lod-progress">
          <span role="status">{progress}</span>
          <button onClick={cancel}>Peru laskenta</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {prepared && (
        <>
          <div className="lod-levels" role="group" aria-label="LOD-vertailu">
            {prepared.levels.map((row, i) => (
              <button
                key={row.file}
                aria-pressed={level === i}
                onClick={() => setLevel(i)}
                disabled={!!progress}
              >
                <strong>LOD{i}</strong>
                <span>{triangleCount(row.triangles)} kolmiota</span>
                <small>
                  {i === 0
                    ? 'Alkuperäinen'
                    : `${Math.round((100 * row.triangles) / Math.max(1, prepared.levels[0].triangles))} % alkuperäisestä`}
                </small>
              </button>
            ))}
          </div>
          <LodPreview data={prepared.files[`LOD${level}.glb`]} wireframe={wireframe} />
          <div className="lod-preview-actions">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={wireframe}
                onChange={(e) => setWireframe(e.target.checked)}
              />
              Näytä kolmioverkko
            </label>
            <button
              disabled={!!progress}
              onClick={() =>
                downloadFile(
                  prepared.files[`LOD${level}.glb`].slice(),
                  `${safeFilename(project.name)}-LOD${level}.glb`,
                  'model/gltf-binary',
                )
              }
            >
              Lataa LOD{level}
            </button>
          </div>
          <p className="muted">
            {(prepared.levels[level].bytes / 1048576).toLocaleString('fi-FI', {
              maximumFractionDigits: 2,
            })}{' '}
            Mt · {prepared.levels[level].materials} materiaalia · tekstuurit enintään{' '}
            {prepared.levels[level].maxTextureSize} px
          </p>
          {prepared.levels[level].triangles >
            prepared.levels[0].triangles * prepared.levels[level].targetTriangleRatio * 1.05 && (
            <p className="lod-notice">
              Tavoiteprosenttia ei saavutettu valitulla muodon säilytyksellä ja suojatuilla
              rajoilla. Näytetty määrä on toteutunut kolmiomäärä.
            </p>
          )}
        </>
      )}
      <p className="muted">
        Alkuperäinen Nivo-malli säilyy. ZIP sisältää kolme GLB-versiota ja raportin. Automaattinen
        etäisyysvaihto asetetaan kohdeohjelmassa.
      </p>
      <button
        className="button dark full"
        disabled={!!progress || !valid || !bodies.length}
        onClick={() => void run(true)}
      >
        Lataa tiedosto
      </button>
    </section>
  );
}
