import { Mail } from 'lucide-react';

export type EmailPreferenceKey = 'emailImmediate' | 'emailDigest';

type Props = {
  emailImmediate: boolean;
  emailDigest: boolean;
  disabled?: boolean;
  onChange: (key: EmailPreferenceKey, value: boolean) => void;
};

const ROWS: { key: EmailPreferenceKey; labelId: string; label: string }[] = [
  {
    key: 'emailImmediate',
    labelId: 'email-pref-immediate-label',
    label: 'Avisos inmediatos por correo (asignaciones, revisiones y bloqueos)',
  },
  {
    key: 'emailDigest',
    labelId: 'email-pref-digest-label',
    label: 'Resumen diario por correo',
  },
];

/** Sección «Correo» de Mi perfil: dos interruptores accesibles. Sin estado ni fetch; lo maneja la página. */
export function EmailPreferencesSection({ emailImmediate, emailDigest, disabled = false, onChange }: Props) {
  const values: Record<EmailPreferenceKey, boolean> = { emailImmediate, emailDigest };

  return (
    <div className="bg-[var(--bg-card)] border border-gray-200 rounded-lg p-5 mb-6">
      <h2 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
        <Mail size={16} />
        <span>Correo</span>
      </h2>
      <ul className="space-y-3">
        {ROWS.map(row => {
          const checked = values[row.key];
          return (
            <li key={row.key} className="flex items-center justify-between gap-4">
              <span id={row.labelId} className="text-sm text-gray-600">{row.label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={row.labelId}
                disabled={disabled}
                onClick={() => onChange(row.key, !checked)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-5 w-5 rounded-full bg-[var(--accent-fg)] shadow transition-transform ${
                    checked ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
