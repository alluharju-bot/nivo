// Saved history v3 uses a shared JSON graph. Object/array references and long
// strings (including identical BReps on copied parts) are written only once.
type Value = null | boolean | number | string | [number];
type Node = [0, Record<string, Value>] | [1, Value[]] | [2, string];

export class HistoryGraphWriter {
  private objects = new Map<object, number>();
  private strings = new Map<string, number>();
  private keys: (object | string)[] = [];
  private nodes: string[] = [];
  private sizes: number[] = [];
  private encoder = new TextEncoder();
  bytes = 0;

  get checkpoint() {
    return this.nodes.length;
  }
  rollback(checkpoint: number) {
    while (this.nodes.length > checkpoint) {
      const key = this.keys.pop()!;
      if (typeof key === 'string') this.strings.delete(key);
      else this.objects.delete(key);
      this.nodes.pop();
      this.bytes -= this.sizes.pop()!;
    }
  }
  encode(value: unknown): Value {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string' && value.length < 256) return value;
    if (typeof value !== 'string' && (!value || typeof value !== 'object'))
      throw new Error('Invalid history value');
    const old = typeof value === 'string' ? this.strings.get(value) : this.objects.get(value);
    if (old !== undefined) return [old];
    const node: Node =
      typeof value === 'string'
        ? [2, value]
        : Array.isArray(value)
          ? [1, value.map((v) => this.encode(v ?? null))]
          : [
              0,
              Object.fromEntries(
                Object.entries(value)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => [k, this.encode(v)]),
              ),
            ];
    const id = this.nodes.length,
      data = JSON.stringify(node);
    if (typeof value === 'string') this.strings.set(value, id);
    else this.objects.set(value, id);
    this.keys.push(value);
    this.nodes.push(data);
    const size = this.encoder.encode(data).length + 1;
    this.sizes.push(size);
    this.bytes += size;
    return [id];
  }
  json() {
    return `[${this.nodes.join(',')}]`;
  }
}

/** Reject cycles, dangling references and compact graphs with pathological
 * expansion before project validation traverses their contents. */
export function readHistoryGraph(raw: unknown) {
  if (!Array.isArray(raw) || raw.length > 500_000) throw new Error('Invalid history graph');
  const nodes: unknown[] = [],
    costs: { size: number; entries: number; depth: number }[] = [];
  for (const node of raw) {
    if (!Array.isArray(node) || node.length !== 2) throw new Error('Invalid history node');
    let size = 2,
      entries = 1,
      depth = 1;
    const decode = (value: unknown): unknown => {
      if (Array.isArray(value)) {
        const id = value[0];
        if (value.length !== 1 || !Number.isInteger(id) || id < 0 || id >= nodes.length)
          throw new Error('Invalid history reference');
        size += costs[id].size;
        entries += costs[id].entries;
        depth = Math.max(depth, costs[id].depth + 1);
        return nodes[id];
      }
      if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
        size += typeof value === 'string' ? value.length + 2 : 24;
        entries++;
        return value;
      }
      throw new Error('Invalid history value');
    };
    const [kind, data] = node;
    let decoded: unknown;
    if (kind === 2 && typeof data === 'string') {
      decoded = data;
      size = data.length + 2;
    } else if (kind === 1 && Array.isArray(data)) decoded = data.map(decode);
    else if (kind === 0 && data && typeof data === 'object' && !Array.isArray(data))
      decoded = Object.fromEntries(
        Object.entries(data).map(([key, value]) => {
          size += key.length + 4;
          return [key, decode(value)];
        }),
      );
    else throw new Error('Invalid history node');
    if (size > 64_000_000 || entries > 1_000_000 || depth > 128)
      throw new Error('History expansion too large');
    nodes.push(decoded);
    costs.push({ size, entries, depth });
  }
  return (reference: unknown): unknown => {
    if (
      !Array.isArray(reference) ||
      reference.length !== 1 ||
      !Number.isInteger(reference[0]) ||
      reference[0] < 0 ||
      reference[0] >= nodes.length
    )
      throw new Error('Invalid history root');
    return nodes[reference[0]];
  };
}
