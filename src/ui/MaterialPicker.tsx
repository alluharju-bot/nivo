import { Pipette } from 'lucide-react';

export function MaterialPicker({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      className="button outlined"
      aria-pressed={active}
      onClick={onClick}
      title="Poimi pinnan materiaali, sävy ja kiilto (I)"
    >
      <Pipette size={16} aria-hidden="true" /> {active ? 'Napsauta poimittavaa pintaa' : 'Pipetti'}
      <kbd>I</kbd>
    </button>
  );
}
