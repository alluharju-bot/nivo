import { Focus, LockKeyhole } from 'lucide-react';
import { groupAncestors } from '../model/groups';
import { bodyVisible } from '../model/transforms';
import type { Body, BodyGroup } from '../model/project';

export function HoldSelection({
  parts,
  groups,
  count,
  onFocus,
}: {
  parts: Body[];
  groups: BodyGroup[];
  count: number;
  onFocus: (id: string) => void;
}) {
  if (!parts.length) return null;
  return (
    <section className="hold-selection" aria-label="Valinnan lukitut osat">
      <div className="hold-selection-heading">
        <LockKeyhole size={15} aria-hidden="true" />
        <strong>
          Lukittu {parts.length} / {count}
        </strong>
      </div>
      <ul>
        {parts.map((body) => {
          const inherited = groupAncestors(groups, body.groupId).filter((g) => g.locked);
          const visible = bodyVisible(body, groups);
          return (
            <li key={body.id} data-held-part={body.id}>
              <div>
                <strong>{body.name}</strong>
                <small>
                  {[
                    body.locked ? 'Osan Hold' : '',
                    ...inherited.map((g) => `Ryhmä: ${g.name}`),
                    !visible ? 'Piilotettu' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </div>
              <button
                type="button"
                aria-label={`Keskitä lukittuun osaan: ${body.name}`}
                title={visible ? 'Keskitä osaan · nykyinen valinta säilyy' : 'Osa on piilotettu'}
                disabled={!visible}
                onClick={() => onFocus(body.id)}
              >
                <Focus size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
