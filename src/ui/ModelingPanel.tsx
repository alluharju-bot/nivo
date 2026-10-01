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
      <div className="panel-title">
        <div>
          <span className="eyebrow">MUOTOILE</span>
          <h2>{operation === 'cut' ? 'Leikkaa kappaleilla' : 'Yhdistä kappaleet'}</h2>
        </div>
      </div>
      <OperationSelect value={operation} onChange={onOperation} disabled={busy} />
      <p className="muted">
        {operation === 'cut'
          ? 'Työstökappaleiden tilavuus poistetaan jokaisesta kohteesta.'
          : 'Kohteet ja työstökappaleet yhdistetään yhdeksi osaksi.'}
      </p>
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
            <small>
              {group === 'targets' ? 'Target bodies' : 'Tool bodies'} · valitse listasta tai
              näkymästä
            </small>
            <div className="body-set-list">
              {bodies.map((b) => (
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
  width,
  depth,
  thickness,
  onField,
  purpose,
  onPurpose,
  name,
  onName,
  attach,
  onAttach,
  sides,
  onSides,
  onOperation,
  frameLabel,
  onAccept,
}: {
  tool: 'rectangle' | 'circle' | 'pen';
  kind: 'circle' | 'ellipse' | 'polygon';
  onKind: (kind: 'circle' | 'ellipse' | 'polygon') => void;
  width: string;
  depth: string;
  thickness: string;
  onField: (key: string, value: string) => void;
  purpose: Body['purpose'];
  onPurpose: (purpose: Body['purpose']) => void;
  name: string;
  onName: (name: string) => void;
  attach: boolean;
  onAttach: (attach: boolean) => void;
  sides: number;
  onSides: (sides: number) => void;
  onOperation: (op: Operation) => void;
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
      <OperationSelect value="new" onChange={onOperation} />
      <label className="modeling-field">
        Nimi
        <input
          aria-label="Muodon nimi"
          value={name}
          maxLength={120}
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      {tool === 'circle' && (
        <label className="modeling-field">
          Muoto
          <select
            aria-label="Muoto"
            value={kind}
            onChange={(e) => onKind(e.target.value as typeof kind)}
          >
            <option value="circle">Ympyrä</option>
            <option value="ellipse">Ellipsi</option>
            <option value="polygon">Säännöllinen monikulmio</option>
          </select>
        </label>
      )}
      {tool !== 'pen' && (
        <div className="modeling-dimensions">
          <label className="modeling-field">
            {tool === 'circle' ? 'Halkaisija X' : 'Leveys'}
            <input
              aria-label="Muodon leveys"
              inputMode="decimal"
              value={width}
              onChange={(e) => onField('width', e.target.value)}
            />
          </label>
          {(tool === 'rectangle' || kind === 'ellipse') && (
            <label className="modeling-field">
              {tool === 'circle' ? 'Halkaisija Y' : 'Syvyys'}
              <input
                aria-label="Muodon syvyys"
                inputMode="decimal"
                value={depth}
                onChange={(e) => onField('depth', e.target.value)}
              />
            </label>
          )}
        </div>
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
      <label className="modeling-field">
        Paksuus · mm
        <input
          aria-label="Muodon paksuus"
          inputMode="decimal"
          value={thickness}
          onChange={(e) => onField('thickness', e.target.value)}
        />
      </label>
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
      <label className="checkbox-label">
        <input type="checkbox" checked={attach} onChange={(e) => onAttach(e.target.checked)} />
        Piirrä kappaleen pinnalle
      </label>
      <p className="muted">
        {frameLabel}.{' '}
        {attach && purpose === 'model'
          ? 'Paksuus 0 rajaa pinnan alueeksi. Positiivinen paksuus lisää materiaalia ja negatiivinen leikkaa.'
          : 'Muoto syntyy omaksi objektiksi.'}
      </p>
      {purpose === 'construction' && (
        <p className="muted">Sininen apumuoto tarjoaa tartunnat ja jää pois mittakuvasta.</p>
      )}
      {purpose === 'drawing' && (
        <p className="muted">Piirros näkyy ääriviivoina ja tulee mukaan mittakuvaan.</p>
      )}
      {purpose === 'component' && (
        <p className="muted">Nimetty itsenäinen osa. Kopiot muokkautuvat erikseen.</p>
      )}
      <button className="button dark full" onClick={onAccept}>
        <Check size={16} />
        Hyväksy muoto
      </button>
    </div>
  );
}
