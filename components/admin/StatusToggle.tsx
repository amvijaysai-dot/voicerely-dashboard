// components/admin/StatusToggle.tsx
//
// Accessible Active/Suspended toggle switch. Visually flags a tenant's
// lifecycle status and reports changes upward via onToggle. Purely presentational
// — the parent is responsible for persisting the change to the repository layer.

interface StatusToggleProps {
  status: "active" | "suspended";
  disabled?: boolean;
  onToggle: () => void;
  label?: string;
}

export function StatusToggle({ status, disabled, onToggle, label }: StatusToggleProps) {
  const isActive = status === "active";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-label={label ?? `${isActive ? "Deactivate" : "Activate"} tenant`}
      aria-pressed={isActive}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          isActive ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
