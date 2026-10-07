function copyNameParts(name: string) {
  let base = name.trim(),
    number = 0,
    copied = false;
  // Accept old suffix chains as well as the current numbered form.
  for (;;) {
    const suffix = /(?:\s+kopio|\s+\(kopio\s+#(\d+)\))$/i.exec(base);
    if (!suffix) break;
    copied = true;
    if (suffix[1]) number = Math.max(number, Number(suffix[1]));
    base = base.slice(0, suffix.index).trimEnd();
  }
  // Leave room for increasing numbers within the project's 120-character name limit.
  return { base: (base || 'Kappale').slice(0, 100), number, copied };
}

/** One allocator per copy operation reserves names for the whole batch. */
export function copyNameAllocator(names: string[]) {
  const series = new Map<string, { highest: number; count: number }>();
  for (const name of names) {
    const { base, number, copied } = copyNameParts(name);
    const entry = series.get(base) ?? { highest: 0, count: 0 };
    if (Number.isSafeInteger(number)) entry.highest = Math.max(entry.highest, number);
    if (copied) entry.count++;
    series.set(base, entry);
  }
  return (source: string) => {
    const { base } = copyNameParts(source);
    const entry = series.get(base) ?? { highest: 0, count: 0 };
    const number = Math.max(entry.highest, entry.count) + 1;
    entry.highest = number;
    entry.count++;
    series.set(base, entry);
    return `${base} (kopio #${number})`;
  };
}
