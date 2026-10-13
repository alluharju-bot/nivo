import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type TreeColorTarget = {
  x: number;
  y: number;
  ids: string[];
  groupId?: string;
  name: string;
};
const palette = [
  ['Vihreä', '#668d70'],
  ['Sininen', '#5486b3'],
  ['Turkoosi', '#458c91'],
  ['Keltainen', '#b9943e'],
  ['Oranssi', '#bc7845'],
  ['Punainen', '#b95d65'],
  ['Violetti', '#9571af'],
  ['Harmaa', '#7c8587'],
];
export function TreeColorMenu({
  target,
  onClose,
  onChange,
}: {
  target: TreeColorTarget;
  onClose: () => void;
  onChange: (color?: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    host.current?.querySelector('button')?.focus();
    const down = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={host}
      className="tree-color-menu"
      role="dialog"
      aria-label="Listarivin väri"
      style={{
        left: Math.max(8, Math.min(target.x, window.innerWidth - 244)),
        top: Math.max(8, Math.min(target.y, window.innerHeight - 180)),
      }}
    >
      <strong>{target.name}</strong>
      <span>Riviväri · vain mallilistaan</span>
      <div>
        {palette.map(([name, color]) => (
          <button
            key={color}
            aria-label={`Riviväri: ${name}`}
            style={{ background: color }}
            onClick={() => {
              onChange(color);
              onClose();
            }}
          />
        ))}
      </div>
      <button
        onClick={() => {
          onChange();
          onClose();
        }}
      >
        Poista riviväri
      </button>
    </div>,
    document.body,
  );
}
