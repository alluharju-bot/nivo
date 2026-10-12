/** Count the retained immutable graph, rather than charging every snapshot for
 * the same BRep/texture again. This estimates JS data, not CAD or GPU caches. */
export class HistoryMemory {
  private objects = new Map<object, number>();
  private strings = new Map<string, number>();
  bytes = 0;

  retain(value: unknown): void {
    if (typeof value === 'string') {
      const count = this.strings.get(value) ?? 0;
      this.strings.set(value, count + 1);
      if (!count) this.bytes += 16 + value.length * 2;
    } else if (value && typeof value === 'object') {
      const count = this.objects.get(value) ?? 0;
      this.objects.set(value, count + 1);
      if (count) return;
      const entries = Object.entries(value);
      this.bytes += 32 + entries.length * 16;
      for (const [key, child] of entries) {
        if (!Array.isArray(value)) this.retain(key);
        this.retain(child);
      }
    }
  }

  release(value: unknown): void {
    if (typeof value === 'string') {
      const count = this.strings.get(value)!;
      if (count > 1) this.strings.set(value, count - 1);
      else {
        this.strings.delete(value);
        this.bytes -= 16 + value.length * 2;
      }
    } else if (value && typeof value === 'object') {
      const count = this.objects.get(value)!;
      if (count > 1) {
        this.objects.set(value, count - 1);
        return;
      }
      this.objects.delete(value);
      const entries = Object.entries(value);
      this.bytes -= 32 + entries.length * 16;
      for (const [key, child] of entries) {
        if (!Array.isArray(value)) this.release(key);
        this.release(child);
      }
    }
  }
}
