import { useState } from 'react';

export function InlineName({
  name,
  onChange,
  label = 'Kappaleen nimi',
  disabled = false,
}: {
  name: string;
  onChange: (name: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) onChange(draft.trim());
  };
  return editing ? (
    <input
      className="inline-name-input"
      autoFocus
      aria-label={label}
      maxLength={120}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setEditing(false);
          setDraft(name);
        }
      }}
    />
  ) : (
    <button
      className="inline-name"
      disabled={disabled}
      aria-label={`Nimeä: ${name}`}
      title="Napsauta nimeä muuttaaksesi"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      {name}
    </button>
  );
}
