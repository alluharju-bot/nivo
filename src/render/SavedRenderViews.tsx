import { Camera, Eye, RefreshCw, Trash2 } from 'lucide-react';
import type { RenderView } from '../model/renderViews';
import { uid } from '../model/project';
import { InlineName } from '../ui/InlineName';

export function SavedRenderViews({
  views,
  busy,
  onViews,
  onCapture,
  onRestore,
}: {
  views: RenderView[];
  busy: boolean;
  onViews: (views: RenderView[]) => Promise<boolean>;
  onCapture: () => Omit<RenderView, 'id' | 'name'> | undefined;
  onRestore: (view: RenderView) => Promise<void>;
}) {
  return (
    <details className="saved-render-views">
      <summary>Kuvakulmat{views.length ? ` · ${views.length}` : ''}</summary>
      {views.map((view) => (
        <div className="saved-view-row" key={view.id}>
          <InlineName
            name={view.name}
            label="Kuvakulman nimi"
            disabled={busy}
            onChange={(name) =>
              void onViews(views.map((v) => (v.id === view.id ? { ...v, name } : v)))
            }
          />
          <button
            disabled={busy}
            title="Palauta kuvakulma ja polttoväli"
            aria-label={`Katso: ${view.name}`}
            onClick={() => void onRestore(view)}
          >
            <Eye size={16} />
          </button>
          <button
            disabled={busy}
            title="Korvaa nykyisellä kuvakulmalla"
            aria-label={`Päivitä kuvakulma: ${view.name}`}
            onClick={() => {
              const pose = onCapture();
              if (pose) void onViews(views.map((v) => (v.id === view.id ? { ...v, ...pose } : v)));
            }}
          >
            <RefreshCw size={15} />
          </button>
          <button
            disabled={busy}
            title="Poista kuvakulma"
            aria-label={`Poista kuvakulma: ${view.name}`}
            onClick={() => void onViews(views.filter((v) => v.id !== view.id))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        className="button subtle full"
        disabled={busy || views.length >= 50}
        onClick={() => {
          const pose = onCapture();
          if (!pose) return;
          let number = views.length + 1;
          while (views.some((v) => v.name === `Kuvakulma ${number}`)) number++;
          void onViews([...views, { ...pose, id: uid(), name: `Kuvakulma ${number}` }]);
        }}
      >
        <Camera size={16} />
        Tallenna kuvakulma
      </button>
      {!views.length && (
        <p className="muted">Säilytä kuvakulma ja polttoväli seuraavaa esittelyä varten.</p>
      )}
    </details>
  );
}
