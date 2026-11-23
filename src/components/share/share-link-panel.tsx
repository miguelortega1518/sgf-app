import { formatShortDateRD, toDateRD } from '@/lib/date-utils';

export type ShareLinkPanelProps = {
  /** Escritura en el proyecto con el rol del proyecto (canManageShareLink de la página). */
  canManage: boolean;
  spaceClosed: boolean;
  active: boolean;
  /** Instante ISO de creación del enlace activo. */
  createdAt: string | null;
  /** URL completa recién creada: sólo existe en el estado local justo tras crearla. */
  createdUrl: string | null;
  busy: boolean;
  error: string | null;
  confirmingRevoke: boolean;
  /** Hoy en RD ('YYYY-MM-DD'): decide si la fecha lleva año. */
  today: string;
  onCreate: () => void;
  onRevoke: () => void;
  onCopy: () => void;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
};

const BUTTON = 'inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-50';

/**
 * Gestión del enlace público de sólo lectura (presentación pura, sin hooks ni fetch).
 * Crear sólo con el proyecto abierto; revocar siempre, también con el proyecto cerrado.
 */
export function ShareLinkPanel({
  canManage, spaceClosed, active, createdAt, createdUrl, busy, error, confirmingRevoke, today,
  onCreate, onRevoke, onCopy, onAskRevoke, onCancelRevoke,
}: ShareLinkPanelProps) {
  if (!canManage) return null;

  return (
    <section aria-labelledby="share-link-title" className="mt-8 mb-4 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h2 id="share-link-title" className="text-lg font-medium text-[var(--text-primary)]">Enlace para no técnicos</h2>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Un enlace de sólo lectura con el avance, los hitos, los riesgos y el pronóstico, sin nombres de personas
        ni comentarios. Quien lo tenga puede verlo sin iniciar sesión.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}

      {createdUrl && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">Copie el enlace ahora: no se volverá a mostrar.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="text"
              readOnly
              value={createdUrl}
              aria-label="Enlace público"
              onFocus={e => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]"
            />
            <button type="button" onClick={onCopy} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}>
              Copiar
            </button>
          </div>
        </div>
      )}

      {active ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {createdAt && (
            <span className="text-sm text-[var(--text-secondary)]">
              {`Enlace activo desde el ${formatShortDateRD(toDateRD(createdAt), today)}`}
            </span>
          )}
          {confirmingRevoke ? (
            <span
              role="group"
              aria-label="Confirmar revocación"
              className="inline-flex items-center gap-2"
              onKeyDown={e => { if (e.key === 'Escape') onCancelRevoke(); }}
            >
              <span className="text-sm text-[var(--text-primary)]">¿Revocar el enlace?</span>
              <button type="button" onClick={onRevoke} disabled={busy} className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`}>Sí</button>
              <button type="button" onClick={onCancelRevoke} disabled={busy} autoFocus className={`${BUTTON} border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]`}>No</button>
            </span>
          ) : (
            <button type="button" onClick={onAskRevoke} disabled={busy} className={`${BUTTON} border border-red-200 text-red-700 hover:bg-red-50`}>
              Revocar enlace
            </button>
          )}
        </div>
      ) : (
        !spaceClosed && (
          <div className="mt-3">
            <button type="button" onClick={onCreate} disabled={busy} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}>
              Crear enlace
            </button>
          </div>
        )
      )}
      {!active && spaceClosed && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">El proyecto está cerrado: no se pueden crear enlaces nuevos.</p>
      )}
    </section>
  );
}
