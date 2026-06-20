export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wmGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#020817" />
      <path
        d="M14 18 L22 46 L32 26 L42 46 L50 18"
        stroke="url(#wmGrad)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="18" r="3.4" fill="#fff" />
      <circle cx="22" cy="46" r="3.4" fill="#fff" />
      <circle cx="32" cy="26" r="3.4" fill="#fff" />
      <circle cx="42" cy="46" r="3.4" fill="#fff" />
      <circle cx="50" cy="18" r="3.4" fill="#fff" />
    </svg>
  );
}
