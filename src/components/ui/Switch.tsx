import * as RadixSwitch from '@radix-ui/react-switch';

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative h-7 w-12 shrink-0 cursor-pointer rounded-full border border-line bg-surface-2 transition data-[state=checked]:border-accent-strong data-[state=checked]:bg-accent-strong"
    >
      <RadixSwitch.Thumb className="block size-5 translate-x-1 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-6" />
    </RadixSwitch.Root>
  );
}
