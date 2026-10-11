import type { PaintScope as Scope } from '../model/faceMaterials';

export function PaintScope({
  value,
  onChange,
}: {
  value: Scope;
  onChange: (scope: Scope) => void;
}) {
  return (
    <div className="material-tool-tabs" role="group" aria-label="Maalaa kohde">
      <button aria-pressed={value === 'body'} onClick={() => onChange('body')}>
        Koko osa
      </button>
      <button aria-pressed={value === 'face'} onClick={() => onChange('face')}>
        Pinta
      </button>
    </div>
  );
}
