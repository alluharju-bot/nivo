import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Keep only the visible slice mounted, while preserving the full scroll range. */
export function VirtualTreeRows<T>({
  items,
  itemKey,
  render,
  activeKey,
}: {
  items: T[];
  itemKey: (item: T) => string;
  render: (item: T) => ReactNode;
  activeKey?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 400 });
  const [rowHeight, setRowHeight] = useState(() =>
    matchMedia('(pointer: coarse)').matches ? 46 : 40,
  );
  useEffect(() => {
    const media = matchMedia('(pointer: coarse)');
    const change = () => setRowHeight(media.matches ? 46 : 40);
    media.addEventListener('change', change);
    const observer = new ResizeObserver(() => {
      if (host.current)
        setViewport({ top: host.current.scrollTop, height: host.current.clientHeight });
    });
    observer.observe(host.current!);
    return () => {
      media.removeEventListener('change', change);
      observer.disconnect();
    };
  }, []);
  useLayoutEffect(() => {
    if (!activeKey || !host.current) return;
    const index = items.findIndex((item) => itemKey(item) === activeKey);
    if (index < 0) return;
    const top = index * rowHeight;
    const view = host.current;
    if (top < view.scrollTop || top + rowHeight > view.scrollTop + view.clientHeight)
      view.scrollTop = Math.max(0, top - view.clientHeight / 3);
  }, [activeKey, items, rowHeight]);
  const start = Math.max(0, Math.min(items.length, Math.floor(viewport.top / rowHeight)) - 5);
  const end = Math.min(items.length, start + Math.ceil(viewport.height / rowHeight) + 11);
  return (
    <div
      className="object-list virtual-object-list"
      ref={host}
      data-row-count={items.length}
      onScroll={(event) =>
        setViewport({
          top: event.currentTarget.scrollTop,
          height: event.currentTarget.clientHeight,
        })
      }
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((item, i) => (
          <div
            key={itemKey(item)}
            style={{
              position: 'absolute',
              top: (start + i) * rowHeight,
              height: rowHeight,
              left: 0,
              right: 0,
            }}
          >
            {render(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
