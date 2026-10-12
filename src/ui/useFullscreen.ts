import { useEffect, useRef, useState } from 'react';

type KeyboardLock = { lock: (keys: string[]) => Promise<void>; unlock: () => void };
export function useFullscreen(onError: (message: string) => void) {
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const locked = useRef(false),
    exitAt = useRef(-Infinity);
  const [escapeCaptured, setEscapeCaptured] = useState(false);
  const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  useEffect(() => {
    const changed = () => {
      const active = !!document.fullscreenElement;
      setFullscreen(active);
      if (!active) {
        exitAt.current = performance.now();
        locked.current = false;
        setEscapeCaptured(false);
        keyboard()?.unlock();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Browser-owned Escape exits fullscreen only. It must not also discard the tool/draft.
      if (
        (!locked.current && document.fullscreenElement) ||
        performance.now() - exitAt.current < 180
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('fullscreenchange', changed);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      window.removeEventListener('keydown', escape, true);
      keyboard()?.unlock();
    };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        keyboard()?.unlock();
        await document.exitFullscreen();
        return;
      }
      // Start both requests from the user's click so transient activation is available.
      const lock = keyboard()
        ?.lock(['Escape'])
        .then(() => {
          locked.current = true;
          setEscapeCaptured(true);
        })
        .catch(() => {});
      await document.documentElement.requestFullscreen();
      await lock;
      if (!document.fullscreenElement) {
        keyboard()?.unlock();
        locked.current = false;
        setEscapeCaptured(false);
      }
    } catch {
      keyboard()?.unlock();
      locked.current = false;
      setEscapeCaptured(false);
      onError('Selain ei sallinut koko näytön tilaa tässä ikkunassa.');
    }
  };
  return { fullscreen, escapeCaptured, toggleFullscreen };
}
