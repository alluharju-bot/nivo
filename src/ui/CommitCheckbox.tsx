import { useState } from 'react';
export function CommitCheckbox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => Promise<unknown>;
  label: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<boolean>();
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={pending ?? checked}
      disabled={disabled || pending !== undefined}
      onChange={(e) => {
        const next = e.target.checked;
        setPending(next);
        void onChange(next).finally(() => setPending(undefined));
      }}
    />
  );
}
