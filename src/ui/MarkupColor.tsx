import { useEffect, useRef, useState } from 'react';

/** Native input events preview; change/blur commits once, Escape restores the saved color. */
export function MarkupColor({
  value,
  label,
  disabled,
  onPreview,
  onCommit,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onPreview: (value?: string) => void;
  onCommit: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const pending = useRef<string | undefined>(undefined);
  const frame = useRef(0);
  const latest = useRef({ value, onPreview, onCommit });
  latest.current = { value, onPreview, onCommit };
  const clear = () => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = undefined;
  };
  const commit = () => {
    const color = pending.current;
    clear();
    if (color && color !== latest.current.value) latest.current.onCommit(color);
    latest.current.onPreview();
  };
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const node = input.current!;
    const change = () => commit();
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !pending.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      clear();
      setDraft(latest.current.value);
      latest.current.onPreview();
    };
    node.addEventListener('change', change);
    window.addEventListener('keydown', escape, true);
    return () => {
      clear();
      latest.current.onPreview();
      node.removeEventListener('change', change);
      window.removeEventListener('keydown', escape, true);
    };
  }, []);
  return (
    <input
      ref={input}
      type="color"
      aria-label={label}
      value={draft}
      disabled={disabled}
      onChange={() => {}}
      onInput={(e) => {
        const color = e.currentTarget.value;
        setDraft(color);
        pending.current = color;
        if (!frame.current)
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            if (pending.current) latest.current.onPreview(pending.current);
          });
      }}
      onBlur={commit}
    />
  );
}
