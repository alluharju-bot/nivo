import { useEffect, useRef, useState } from 'react';

/** Native picker input previews immediately; Apply is one undoable edit, Escape cancels. */
export function useColorDraft(color: string, onPreview?: (color?: string) => void) {
  const [draft, setDraft] = useState(color);
  const committed = useRef(color);
  committed.current = color;
  const preview = useRef(onPreview);
  preview.current = onPreview;
  const active = useRef(false);
  const cancel = () => {
    setDraft(committed.current);
    if (active.current) preview.current?.();
    active.current = false;
  };
  useEffect(() => {
    setDraft(color);
    if (active.current) preview.current?.();
    active.current = false;
  }, [color]);
  useEffect(
    () => () => {
      if (active.current) preview.current?.();
    },
    [],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !active.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  return {
    draft,
    cancel,
    change(value: string) {
      setDraft(value);
      active.current = !!preview.current;
      preview.current?.(value);
    },
  };
}
