import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, X, Search } from 'lucide-react';
import { toolGuides, type Guide } from './catalog';
import { GuideScene } from './GuideScene';
import './guides.css';
const duration = 12_000;

function GuidePlayer({ guide }: { guide: Guide }) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const value = useRef(0);
  const seek = (next: number) => {
    value.current = next;
    setProgress(next);
  };
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => {
      if (document.hidden || motion.matches) setPlaying(false);
    };
    document.addEventListener('visibilitychange', stop);
    motion.addEventListener('change', stop);
    return () => {
      document.removeEventListener('visibilitychange', stop);
      motion.removeEventListener('change', stop);
    };
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = performance.now(),
      shown = last;
    const tick = (now: number) => {
      value.current = Math.min(1, value.current + Math.min(now - last, 100) / duration);
      last = now;
      if (now - shown >= 32 || value.current === 1) {
        setProgress(value.current);
        shown = now;
      }
      if (value.current === 1) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const index = Math.min(guide.steps.length - 1, Math.floor(progress * guide.steps.length));
  const step = guide.steps[index];
  return (
    <div className="guide-player" data-testid="guide-player" data-playing={playing}>
      <div className="guide-film">
        <GuideScene topic={guide.id} title={guide.title} progress={progress} />
        {step.key && <kbd className="guide-key">{step.key}</kbd>}
        <span className="guide-film-label">Havainneanimaatio · ei muuta malliasi</span>
      </div>
      <div className="guide-playback" role="group" aria-label="Animaation toisto">
        <button
          aria-label={playing ? 'Pysäytä animaatio' : 'Toista animaatio'}
          onClick={() => {
            if (progress === 1) seek(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button
          aria-label="Toista alusta"
          onClick={() => {
            seek(0);
            setPlaying(true);
          }}
        >
          <RotateCcw size={16} />
        </button>
        <input
          aria-label="Ohjeanimaation kohta"
          type="range"
          min="0"
          max="1000"
          step="1"
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value) / 1000);
          }}
        />
        <span>{Math.floor(progress * 12)} / 12 s</span>
      </div>
      <div className="guide-steps" role="group" aria-label="Ohjeen vaiheet">
        {guide.steps.map((s, i) => (
          <button
            key={s.title}
            aria-label={`Vaihe ${i + 1}: ${s.title}`}
            aria-pressed={index === i}
            onClick={() => {
              setPlaying(false);
              seek((i + 0.5) / guide.steps.length);
            }}
          >
            <span>{i + 1}</span>
            {s.title}
          </button>
        ))}
      </div>
      <p className="guide-step-copy" data-testid="guide-step-copy">
        {step.text}
      </p>
      <details className="guide-tip">
        <summary>Lisävinkki ja näppäimet</summary>
        <p>{guide.tip}</p>
      </details>
    </div>
  );
}

export default function ToolGuide({ initial, onClose }: { initial: string; onClose: () => void }) {
  const [id, setId] = useState(initial);
  const [query, setQuery] = useState('');
  const host = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const guide = toolGuides.find((g) => g.id === id) ?? toolGuides[0];
  const normalize = (s: string) =>
    s
      .toLocaleLowerCase('fi')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const found = toolGuides.filter((g) =>
    normalize(`${g.title} ${g.category} ${g.shortcut ?? ''} ${g.tip}`).includes(normalize(query)),
  );
  useEffect(() => {
    const active = host.current?.querySelector<HTMLElement>('[data-guide][aria-pressed="true"]');
    if (active?.checkVisibility()) active.scrollIntoView({ block: 'nearest' });
  }, [id]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    host.current
      ?.querySelector<HTMLButtonElement>('[aria-label="Sulje ohje"]')
      ?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      // Capture before modeling shortcuts, including XYZ and number-to-dimension input.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.current();
        return;
      }
      if (e.key === 'Tab') {
        const items = [
          ...host.current!.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,summary,a[href]',
          ),
        ].filter((el) => el.checkVisibility());
        const at = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        e.stopImmediatePropagation();
        items[(at + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="guide-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={host}
        className="tool-guide"
        role="dialog"
        aria-modal="true"
        aria-label="Työkalujen ohjeet"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="guide-header">
          <div>
            <span className="eyebrow">OPI KOKEILEMALLA</span>
            <h2>Työkalujen ohjeet</h2>
          </div>
          <button aria-label="Sulje ohje" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="guide-layout">
          <nav className="guide-library" aria-label="Ohjekirjasto">
            <label className="guide-search">
              <Search size={15} />
              <input
                aria-label="Etsi työkalun ohjetta"
                placeholder="Etsi työkalu…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="guide-topics">
              {[...new Set(found.map((g) => g.category))].map((category) => (
                <div key={category}>
                  <h3>{category}</h3>
                  {found
                    .filter((g) => g.category === category)
                    .map((g) => (
                      <button
                        key={g.id}
                        aria-pressed={g.id === guide.id}
                        data-guide={g.id}
                        onClick={() => setId(g.id)}
                      >
                        {g.title}
                        {g.shortcut && <kbd>{g.shortcut}</kbd>}
                      </button>
                    ))}
                </div>
              ))}
              {!found.length && <p>Ohjetta ei löytynyt. Kokeile työkalun nimeä.</p>}
            </div>
          </nav>
          <main className="guide-content">
            <div className="guide-title">
              <h3>{guide.title}</h3>
              {guide.shortcut && <kbd>{guide.shortcut}</kbd>}
              <span>3 vaihetta</span>
            </div>
            <label className="guide-mobile-select">
              Työkalu
              <select
                aria-label="Näytettävä ohje"
                value={guide.id}
                onChange={(e) => setId(e.target.value)}
              >
                {toolGuides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>
            <GuidePlayer key={guide.id} guide={guide} />
          </main>
        </div>
        <footer className="guide-footer">
          <span>
            Esc sulkee ohjeen. Keskeneräinen työsi säilyy.{' '}
            <a href="https://github.com/alluharju-bot/nivo" target="_blank" rel="noreferrer">
              Lähdekoodi
            </a>{' '}
            ·{' '}
            <a
              href={`${import.meta.env.BASE_URL}licenses/NOTICE.txt`}
              target="_blank"
              rel="noreferrer"
            >
              Lisenssit
            </a>
          </span>
          <button onClick={onClose}>Jatka mallintamista</button>
        </footer>
      </section>
    </div>
  );
}
