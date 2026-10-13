import { parseProject, type Project } from '../model/project';

// Content-based revisions are portable across devices and independent of clock skew.
// Ignore save timestamps; normalize parsed defaults and property order before hashing.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export async function projectRevision(project: Project): Promise<string> {
  const normalized = parseProject(JSON.stringify(project));
  const bytes = new TextEncoder().encode(
    JSON.stringify(canonical({ ...normalized, updatedAt: undefined })),
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
