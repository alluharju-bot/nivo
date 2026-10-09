import { Component, useEffect, useRef, type ReactNode } from 'react';

function Unavailable({ onClose }: { onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    button.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="guide-loading">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-label="Ohjetta ei voitu avata"
        onKeyDown={(e) => {
          if (e.key === 'Tab') e.preventDefault();
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
      >
        <h2>Ohjetta ei voitu avata</h2>
        <p>Voit jatkaa mallintamista. Tallenna työsi ennen sivun päivittämistä.</p>
        <button ref={button} onClick={onClose}>
          Jatka mallintamista
        </button>
      </section>
    </div>
  );
}

// A stale or offline guide chunk must never unmount the user's editor.
export class GuideBoundary extends Component<
  {
    children: ReactNode;
    onClose: () => void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Unavailable onClose={this.props.onClose} /> : this.props.children;
  }
}
