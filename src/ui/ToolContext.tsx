import { X } from 'lucide-react';
export function ToolContext({
  title,
  context,
  instruction,
  status,
  onFinish,
}: {
  title: string;
  context?: string;
  instruction: string;
  status: string[];
  onFinish: () => void;
}) {
  return (
    <section className="tool-context" aria-label="Työskentelytila" data-testid="tool-context">
      <div>
        <span className="eyebrow">TYÖKALU</span>
        <button aria-label="Lopeta työkalu" title="Lopeta työkalu" onClick={onFinish}>
          <X size={18} />
        </button>
      </div>
      <h2>{title}</h2>
      {context && <p className="tool-context-target">{context}</p>}
      <p className="tool-next-step">{instruction}</p>
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
