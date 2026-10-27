export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="var(--blue-600)" />
      <path d="M9 7.5h11v3.2H12.4v3.3h6.1v3.2h-6.1v6.3H9V7.5Z" fill="oklch(0.99 0 0)" />
      <path d="M19.2 18.4 22 15.6v5.6a1 1 0 0 1-1 1h-5.6l2.8-2.8a1 1 0 0 1 .7-.3Z" fill="oklch(0.99 0 0)" fillOpacity=".55" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight text-[var(--text-primary)] ${className}`}>
      <LogoMark />
      <span className="text-[17px]">Forja</span>
    </span>
  );
}
