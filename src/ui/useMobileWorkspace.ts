import { useEffect, useState } from 'react';

// Narrow windows also benefit from drawers. A mouse retains immediate acceptance.
// Portrait tablets need an overlay inspector as well: a 290px dock consumes
// almost half of an 800px canvas. Wide tablets retain the ordinary workspace.
// Use width, not height: Android's on-screen keyboard shrinks the layout viewport.
// A height breakpoint would reparent/remount the focused numeric input, dismiss
// the keyboard and flip straight back to the wide layout. Phone landscape and
// portrait tablets are already covered by the touch-width breakpoint.
const query = '(max-width: 760px), (max-width: 1000px) and (any-pointer: coarse)';
export function useMobileWorkspace() {
  const [compact, setCompact] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const changed = () => setCompact(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!compact) return;
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty(
        '--mobile-height',
        `${viewport?.height ?? innerHeight}px`,
      );
      document.documentElement.style.setProperty('--mobile-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty('--mobile-height');
      document.documentElement.style.removeProperty('--mobile-top');
    };
  }, [compact]);
  return compact;
}
