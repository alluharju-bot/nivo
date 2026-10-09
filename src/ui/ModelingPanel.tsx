import { ArrowLeftRight, Check, X } from 'lucide-react';
import { featureIsSolid, type Body } from '../model/project';
import type { BooleanOperation } from '../model/operations';
export type Operation = 'new' | BooleanOperation;
export function OperationSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: Operation;
  onChange: (op: Operation) => void;
  disabled?: boolean;
}) {
  return (
    <label className="modeling-field">
      Toiminto
      <select
        aria-label="Toiminto"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Operation)}
      >
        <option value="new">Uusi muoto</option>
        <option value="cut">Cut — Leikkaa</option>
        <option value="join">Join — Yhdistä</option>
      </select>
    </label>
  );
}
export function BooleanPanel({
  bodies,
  operation,
  onOperation,
  targets,
  tools,
  active,
  onActive,
  onToggle,
  onSwap,
  keepTools,
  onKeepTools,
  onAccept,
  onCancel,
  busy,
}: {
  bodies: Body[];
  operation: BooleanOperation;
  onOperation: (op: Operation) => void;
  targets: string[];
  tools: string[];
  active: 'targets' | 'tools';
  onActive: (group: 'targets' | 'tools') => void;
  onToggle: (id: string, group: 'targets' | 'tools') => void;
  onSwap: () => void;
  keepTools: boolean;
  onKeepTools: (value: boolean) => void;
  onAccept: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <section className="modeling-panel" aria-label="Muotoile">
      <OperationSelect value={operation} onChange={onOperation} disabled={busy} />
      {(['targets', 'tools'] as const).map((group) => {
        const ids = group === 'targets' ? targets : tools,
          title = group === 'targets' ? 'Kohteet' : 'Työstökappaleet';
        return (
          <div className={`body-set ${group} ${active === group ? 'active' : ''}`} key={group}>
            <button
              className="body-set-heading"
              aria-pressed={active === group}
              disabled={busy}
              onClick={() => onActive(group)}
            >
              <span>{title}</span>
              <strong>{ids.length}</strong>
            </button>

            <div className="body-set-list">
              {bodies
                .filter((b) => active === group || ids.includes(b.id))
                .map((b) => (
                  <label key={b.id} className={!featureIsSolid(b.feature) ? 'unavailable' : ''}>
                    <input
                      type="checkbox"
                      aria-label={`${group === 'targets' ? 'Kohde' : 'Työstökappale'}: ${b.name}`}
                      checked={ids.includes(b.id)}
                      disabled={busy || !featureIsSolid(b.feature)}
                      onChange={() => onToggle(b.id, group)}
                    />
                    <span>{b.name}</span>
                    {!featureIsSolid(b.feature) && <small>Tarvitsee paksuuden</small>}
                  </label>
                ))}
            </div>
          </div>
        );
      })}
      <button className="button outlined full" disabled={busy} onClick={onSwap}>
        <ArrowLeftRight size={16} />
        Vaihda keskenään
      </button>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={keepTools}
          disabled={busy}
          onChange={(e) => onKeepTools(e.target.checked)}
        />
        Säilytä työstökappaleet
      </label>
      <div className="modeling-actions">
        <button className="button outlined" disabled={busy} onClick={onCancel}>
          <X size={16} />
          Peruuta
        </button>
        <button
          className="button dark"
          disabled={busy || !targets.length || !tools.length}
          onClick={onAccept}
        >
          <Check size={16} />
          Hyväksy {operation === 'cut' ? 'Cut' : 'Join'}
        </button>
      </div>
    </section>
  );
}
export function ShapeProperties({
  tool,
  kind,
  onKind,
  thickness,
  onField,
  purpose,
  constructionLine,
  onPurpose,
  name,
  onName,
  surfaceMode,
  onSurfaceMode,
  editingBodyName,
  sides,
  onSides,
  frameLabel,
  onAccept,
}: {
  tool: 'rectangle' | 'circle' | 'pen';
  kind: 'circle' | 'ellipse' | 'polygon' | 'sphere';
  onKind: (kind: 'circle' | 'ellipse' | 'polygon' | 'sphere') => void;
  thickness: string;
  onField: (key: string, value: string) => void;
  purpose: Body['purpose'];
  constructionLine: boolean;
  onPurpose: (purpose: Body['purpose']) => void;
  name: string;
  onName: (name: string) => void;
  surfaceMode: 'new' | 'region';
  onSurfaceMode: (mode: 'new' | 'region') => void;
  editingBodyName?: string;
  sides: number;
  onSides: (sides: number) => void;
  frameLabel: string;
  onAccept: () => void;
}) {
  return (
    <div
      className="shape-properties"
      onKeyDown={(e) => {
        if (
          e.key === 'Enter' &&
          e.target instanceof HTMLInputElement &&
          e.target.type !== 'checkbox'
        ) {
          e.preventDefault();
          e.stopPropagation();
          onAccept();
        }
      }}
    >
      {tool === 'circle' && (
        <label className="modeling-field">
          Muoto
          <select
            aria-label="Muoto"
            value={kind}
            onChange={(e) => onKind(e.target.value as typeof kind)}
          >
            <option value="circle">Ympyrä</option>
            <option value="sphere">Pallo</option>
            <option value="ellipse">Ellipsi</option>
            <option value="polygon">Säännöllinen monikulmio</option>
          </select>
        </label>
      )}
      {tool === 'circle' && kind === 'polygon' && (
        <label className="modeling-field">
          Sivujen määrä
          <input
            aria-label="Sivujen määrä"
            type="number"
            min={3}
            max={64}
            value={sides}
            onChange={(e) => onSides(Math.max(3, Math.min(64, Number(e.target.value))))}
          />
        </label>
      )}
      {!(tool === 'circle' && kind === 'sphere') && (
        <label className="modeling-field">
          Paksuus · mm
          <input
            aria-label="Muodon paksuus"
            disabled={constructionLine}
            inputMode="decimal"
            value={thickness}
            onChange={(e) => onField('thickness', e.target.value)}
          />
        </label>
      )}

      <label className="modeling-field">
        Käyttö
        <select
          aria-label="Muodon käyttö"
          value={purpose}
          onChange={(e) => onPurpose(e.target.value as Body['purpose'])}
        >
          <option value="model">Mallinnettava kappale</option>
          <option value="construction">Rakentamisen apumuoto</option>
          <option value="drawing">Piirros</option>
          <option value="component">Nimetty osa</option>
        </select>
      </label>
      {editingBodyName && !(tool === 'circle' && kind === 'sphere') && (
        <label className="modeling-field">
          Piirtotapa
          <select
            aria-label="Piirtotapa"
            disabled={constructionLine || (tool === 'circle' && kind === 'sphere')}
            value={surfaceMode}
            onChange={(e) => onSurfaceMode(e.target.value as typeof surfaceMode)}
          >
            <option value="new">Uusi osa</option>
            <option value="region" disabled={!editingBodyName}>
              Pinnan alue
            </option>
          </select>
        </label>
      )}

      <details className="tool-advanced">
        <summary>Nimi ja käyttötapa</summary>
        <label className="modeling-field">
          Nimi
          <input
            aria-label="Muodon nimi"
            value={name}
            maxLength={120}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
        <p className="muted">{frameLabel}.</p>
        <p className="muted">
          {constructionLine
            ? 'Rakennusviiva ei jaa eikä leikkaa pintaa. Se tarjoaa tartunnat piirtämiselle.'
            : editingBodyName && surfaceMode === 'region'
              ? 'Paksuus 0 jakaa pinnan. Positiivinen lisää materiaalia, negatiivinen leikkaa.'
              : 'Uusi osa. Valmiin tasomuodon Jaa pinta tai Leikkaa aukko muokkaa alla olevaa osaa.'}
        </p>
        {purpose === 'component' && (
          <p className="muted">Kopiot ovat linkitettyjä. Tee uniikiksi irrottaa linkin.</p>
        )}
      </details>
    </div>
  );
}
