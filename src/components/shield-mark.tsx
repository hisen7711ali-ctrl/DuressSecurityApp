import { cn } from "@/lib/utils";

export function ShieldMark({ className, size = 128 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      className={cn("drop-shadow-[0_12px_24px_rgba(46,196,224,0.28)]", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shieldFill" x1="20" y1="8" x2="108" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3ec6f0" />
          <stop offset="1" stopColor="#1d4e89" />
        </linearGradient>
        <linearGradient id="lockGold" x1="48" y1="48" x2="80" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f5d76e" />
          <stop offset="1" stopColor="#c9a227" />
        </linearGradient>
      </defs>
      <path
        d="M64 10 L108 28 V62 C108 92 90 112 64 118 C38 112 20 92 20 62 V28 Z"
        fill="url(#shieldFill)"
        stroke="#9be7f7"
        strokeWidth="3"
      />
      <path
        d="M64 18 L100 32 V62 C100 86 86 102 64 108 C42 102 28 86 28 62 V32 Z"
        fill="#0b2744"
        fillOpacity="0.35"
      />
      <rect x="46" y="58" width="36" height="28" rx="6" fill="url(#lockGold)" />
      <path
        d="M52 58 V50 C52 43 57 38 64 38 C71 38 76 43 76 50 V58"
        stroke="url(#lockGold)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="64" cy="70" r="3.5" fill="#0b1a2e" />
      <rect x="62.5" y="70" width="3" height="8" rx="1.5" fill="#0b1a2e" />
    </svg>
  );
}
