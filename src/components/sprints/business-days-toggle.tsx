export type BusinessDaysToggleProps = {
  checked: boolean;
  canEdit: boolean;
  onChange: (businessDaysOnly: boolean) => void;
};

/**
 * Ajuste del proyecto «Contar sólo días hábiles (RD)» (presentación pura). Sin
 * permiso de edición se muestra deshabilitado (sólo lectura).
 */
export function BusinessDaysToggle({ checked, canEdit, onChange }: BusinessDaysToggleProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <input
        type="checkbox"
        checked={checked}
        disabled={!canEdit}
        onChange={e => onChange(e.currentTarget.checked)}
      />
      Contar sólo días hábiles (RD)
    </label>
  );
}
