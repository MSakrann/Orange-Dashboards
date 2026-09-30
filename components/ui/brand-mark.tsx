export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-mark ${className}` : "brand-mark"} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- static public brand asset */}
      <img src="/orange-logo.png" alt="" width={48} height={48} />
    </span>
  );
}
