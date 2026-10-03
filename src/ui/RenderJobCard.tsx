import { Download, X, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { RenderJob } from '../render/useRenderJob';
import { downloadFile, safeFilename } from '../storage/projects';

export function RenderJobCard({
  job,
  onCancel,
  onDismiss,
}: {
  job: RenderJob;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const p = job.progress,
    percent = p ? Math.min(100, Math.floor((p.samples / p.target) * 100)) : 0;
  return (
    <aside className="render-job-card" aria-label="Kuvan renderöinti" data-state={job.state}>
      <div className="render-job-heading">
        <button
          className="render-job-title"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          <strong>
            {job.state === 'working'
              ? 'Kuva valmistuu'
              : job.state === 'done'
                ? 'Kuva valmis'
                : job.state === 'cancelled'
                  ? 'Renderöinti keskeytetty'
                  : 'Renderöinti epäonnistui'}
          </strong>
          <ChevronDown size={14} />
        </button>
        {job.state !== 'working' && (
          <button className="icon-button" aria-label="Sulje kuvan tila" onClick={onDismiss}>
            <X size={15} />
          </button>
        )}
      </div>
      {!collapsed && job.state === 'working' && (
        <>
          <progress aria-label="Kuvan renderöinnin eteneminen" value={percent} max={100} />
          <p role="status">
            {p?.phase === 'rendering'
              ? `${percent} % · ${p.samples} / ${p.target} näytettä`
              : p?.phase === 'saving'
                ? 'Tallennetaan kuvaa…'
                : 'Valmistellaan mallia…'}
          </p>
          <small>Voit jatkaa mallintamista. Pidä tämä selainvälilehti auki.</small>
          <button className="button subtle" onClick={onCancel}>
            Keskeytä kuvan laskenta
          </button>
        </>
      )}
      {!collapsed && job.state === 'done' && job.blob && (
        <>
          <a
            href={job.image}
            target="_blank"
            rel="noreferrer"
            aria-label="Avaa valmis kuva täysikokoisena"
          >
            <img src={job.image} alt={`Renderöity kuva: ${job.name}`} />
          </a>
          <p>
            {p?.width} × {p?.height} px · {p?.target} näytettä
          </p>
          <button
            className="button dark full"
            onClick={() =>
              downloadFile(job.blob!, `${safeFilename(job.name)}-render.png`, 'image/png')
            }
          >
            <Download size={15} /> Lataa valmis kuva
          </button>
        </>
      )}
      {!collapsed && job.state === 'error' && <p role="alert">{job.error}</p>}
    </aside>
  );
}
