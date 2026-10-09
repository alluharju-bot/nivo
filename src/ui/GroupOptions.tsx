import { groupContains, groupPath } from '../model/groups';
import type { BodyGroup } from '../model/project';

/** Every group remains discoverable, including destinations blocked by a hierarchy cycle. */
export function GroupOptions({
  groups,
  movingGroupId,
}: {
  groups: BodyGroup[];
  movingGroupId?: string;
}) {
  return groups
    .map((g) => ({ group: g, path: groupPath(groups, g.id) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'fi', { numeric: true }))
    .map(({ group, path }) => {
      const blocked = movingGroupId && groupContains(groups, movingGroupId, group.id);
      return (
        <option key={group.id} value={group.id} disabled={!!blocked}>
          {path}
          {blocked ? (group.id === movingGroupId ? ' — sama ryhmä' : ' — oma alaryhmä') : ''}
        </option>
      );
    });
}
