import { useEffect, useRef, type ReactNode } from 'react';

export function SelectionDialog({
  title,
  children,
  onClose,
  side = false,
  interactive = false,
  onAccept,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  side?: boolean;
  interactive?: boolean;
  onAccept?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    host.current?.querySelector<HTMLElement>('select,button,input')?.focus();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className={`command-backdrop selection-backdrop${side ? ' side' : ''}${interactive ? ' interactive' : ''}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="selection-dialog"
        ref={host}
        role="dialog"
        aria-modal={!interactive}
        aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key === 'Enter' && onAccept && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            onAccept();
          }
          if (e.key === 'Tab') {
            const items = [
              ...host.current!.querySelectorAll<HTMLElement>(
                'select,button:not(:disabled),input:not(:disabled)',
              ),
            ];
            const at = items.indexOf(document.activeElement as HTMLElement);
            e.preventDefault();
            items[(at + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
          }
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
