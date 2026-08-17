interface ViaLogoProps {
  className?: string;
  /** Show “THE PATH” under the wordmark */
  withTagline?: boolean;
}

/** VIA wordmark with Signal Orange “you are here” marker on the I. */
export default function ViaLogo({ className = "", withTagline = false }: ViaLogoProps) {
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span
        className="relative inline-flex items-baseline font-sans text-lg font-bold tracking-tight text-navy"
        aria-label="VIA"
      >
        <span>V</span>
        <span className="relative mx-[0.02em]">
          <span
            className="absolute left-1/2 top-0 h-[0.28em] w-[0.28em] -translate-x-1/2 -translate-y-[0.55em] rounded-full bg-accent"
            aria-hidden="true"
          />
          I
        </span>
        <span>A</span>
      </span>
      {withTagline && (
        <span className="mt-0.5 text-[0.55rem] font-medium uppercase tracking-[0.28em] text-accent">
          The Path
        </span>
      )}
    </span>
  );
}
