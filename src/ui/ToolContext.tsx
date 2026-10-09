import { X, Play } from 'lucide-react';
export function ToolContext({
  title,
  context,
  instruction,
  status,
  onFinish,
  onHelp,
}: {
  title: string;
  context?: string;
  instruction: string;
  status: string[];
  onFinish: () => void;
  onHelp: () => void;
}) {
  return (
    <section className="tool-context" aria-label="Työskentelytila" data-testid="tool-context">
      <div>
        <h2>{title}</h2>
        <button aria-label="Lopeta työkalu" title="Lopeta työkalu" onClick={onFinish}>
          <X size={18} />
        </button>
      </div>
      {context && <p className="tool-context-target">{context}</p>}
      <p className="tool-next-step">{instruction}</p>
      <button className="tool-example" onClick={onHelp} aria-label={`Näytä esimerkki: ${title}`}>
        <Play size={12} />
        Näytä esimerkki
      </button>
      {!!status.length && (
        <div className="tool-context-status">
          {status.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </div>
      )}
    </section>
  );
}
